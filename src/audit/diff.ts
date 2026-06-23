import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gitRaw, gitText } from "../project/git.js";
import { getWorktreeStatus } from "../worktree/status.js";
import type { ResolvedMemory, WorktreeStatus } from "../types/index.js";

export interface WorktreeDiffResult {
  worktree: WorktreeStatus;
  diff: string;
  diffHash: string;
  diffStat: string;
}

export async function collectWorktreeDiff(memory: ResolvedMemory, worktreeId: string, expectedChangeId: string): Promise<WorktreeDiffResult> {
  const worktree = await getWorktreeStatus(memory, worktreeId);
  if (worktree.changeId !== expectedChangeId) {
    throw new Error(`Worktree ${worktreeId} belongs to change ${worktree.changeId}, not ${expectedChangeId}.`);
  }
  if (!worktree.exists) {
    throw new Error(`Worktree checkout does not exist: ${worktree.checkoutPath}.`);
  }
  const [trackedDiffBytes, trackedDiffStat, untrackedFiles] = await Promise.all([
    gitRaw(worktree.checkoutPath, ["diff", "--no-ext-diff", "--binary", "HEAD"]),
    gitText(worktree.checkoutPath, ["diff", "--stat", "HEAD"]),
    listUntrackedFiles(worktree.checkoutPath),
  ]);
  const untrackedDiff = (await Promise.all(untrackedFiles.map((file) => renderUntrackedTextPatch(worktree.checkoutPath, file)))).join("");
  const diffText = trackedDiffBytes.toString("utf8") + untrackedDiff;
  const diffBytes = Buffer.from(diffText, "utf8");
  return {
    worktree,
    diff: diffText,
    diffHash: createHash("sha256").update(diffBytes).digest("hex"),
    diffStat: appendUntrackedStat(trackedDiffStat, untrackedFiles),
  };
}

async function listUntrackedFiles(cwd: string): Promise<string[]> {
  const output = await gitText(cwd, ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ":!node_modules", ":!node_modules/**"]);
  return output.split("\0").map((item) => item.trim()).filter(Boolean).sort();
}

async function renderUntrackedTextPatch(cwd: string, file: string): Promise<string> {
  const normalized = file.replace(/\\/g, "/");
  const content = await readFile(join(cwd, file), "utf8");
  const lines = content.endsWith("\n") ? content.slice(0, -1).split(/\r?\n/) : content.split(/\r?\n/);
  const lineCount = Math.max(lines.length, 1);
  return [
    `diff --git a/${normalized} b/${normalized}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${normalized}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

function appendUntrackedStat(diffStat: string, files: string[]): string {
  if (files.length === 0) return diffStat;
  const additions = files.map((file) => ` ${file.replace(/\\/g, "/")} | new file`).join("\n");
  return [diffStat.trimEnd(), additions, ""].filter(Boolean).join("\n");
}
