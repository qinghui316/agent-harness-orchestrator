import { createHash } from "node:crypto";
import type { MaintenanceDiffFile, MaintenanceDiffManifest, MaintenanceWorkspace } from "../types/index.js";
import { hashTree, readMaintenanceTree, type MarkdownTreeEntry } from "./maintenance-workspace.js";

export async function createMaintenanceDiffManifest(workspace: MaintenanceWorkspace): Promise<MaintenanceDiffManifest> {
  const [base, current] = await Promise.all([
    readMaintenanceTree(workspace, "base"),
    readMaintenanceTree(workspace, "workspace"),
  ]);
  if (hashTree(base) !== workspace.baseTreeHash) throw new Error("Maintenance workspace base changed after assignment.");
  const baseByPath = new Map(base.map((file) => [file.path, file]));
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  let deleted = base.filter((file) => !currentByPath.has(file.path));
  let added = current.filter((file) => !baseByPath.has(file.path));
  const modified = current.filter((file) => baseByPath.has(file.path) && baseByPath.get(file.path)!.hash !== file.hash);
  const renamed = [];
  for (const oldFile of deleted) {
    const candidate = added.find((file) => file.hash === oldFile.hash);
    if (candidate) renamed.push({ from: oldFile.path, to: candidate.path, hash: candidate.hash, ...(candidate.sourceKey ? { sourceKey: candidate.sourceKey } : {}) });
  }
  const renamedFrom = new Set(renamed.map((item) => item.from));
  const renamedTo = new Set(renamed.map((item) => item.to));
  deleted = deleted.filter((file) => !renamedFrom.has(file.path));
  added = added.filter((file) => !renamedTo.has(file.path));
  const changes = [
    ...renamed.map((item) => unified(baseByPath.get(item.from)!, currentByPath.get(item.to)!, item.from, item.to)),
    ...deleted.map((file) => unified(file, null, file.path, "/dev/null")),
    ...added.map((file) => unified(null, file, "/dev/null", file.path)),
    ...modified.map((file) => unified(baseByPath.get(file.path)!, file, file.path, file.path)),
  ].sort((a, b) => a.key.localeCompare(b.key, "en"));
  const treeHash = hashTree(current);
  const manifestCore = {
    version: "1.0" as const, assignmentId: workspace.assignmentId, baseHash: workspace.baseHash,
    treeHash, added: files(added), modified: files(modified), deleted: files(deleted),
    renamed: renamed.sort((a, b) => a.from.localeCompare(b.from, "en")), unifiedDiff: changes.map((item) => item.text).join(""),
  };
  return { ...manifestCore, workspaceHash: sha256(JSON.stringify(manifestCore)) };
}

export const generateMaintenanceDiffManifest = createMaintenanceDiffManifest;

function files(entries: MarkdownTreeEntry[]): MaintenanceDiffFile[] {
  return entries.map(({ path, hash, sourceKey }) => ({ path, hash, ...(sourceKey ? { sourceKey } : {}) }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

function unified(before: MarkdownTreeEntry | null, after: MarkdownTreeEntry | null, oldPath: string, newPath: string): { key: string; text: string } {
  const oldLines = lines(before?.content ?? "");
  const newLines = lines(after?.content ?? "");
  const body = diffLines(oldLines, newLines).map(({ kind, line }) => `${kind}${line}\n`).join("");
  return { key: `${oldPath}\0${newPath}`, text: `--- ${oldPath === "/dev/null" ? oldPath : `a/${oldPath}`}\n+++ ${newPath === "/dev/null" ? newPath : `b/${newPath}`}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${body}` };
}

function lines(value: string): string[] { return value === "" ? [] : value.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n"); }

function diffLines(oldLines: string[], newLines: string[]): Array<{ kind: " " | "+" | "-"; line: string }> {
  const table = Array.from({ length: oldLines.length + 1 }, () => Array<number>(newLines.length + 1).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--) {
    table[i][j] = oldLines[i] === newLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const result: Array<{ kind: " " | "+" | "-"; line: string }> = [];
  let i = 0; let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ kind: " ", line: oldLines[i++] });
      j++;
    }
    else if (j < newLines.length && (i === oldLines.length || table[i][j + 1] > table[i + 1][j])) result.push({ kind: "+", line: newLines[j++] });
    else result.push({ kind: "-", line: oldLines[i++] });
  }
  return result;
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
