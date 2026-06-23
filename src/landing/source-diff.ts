import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gitText } from "../project/git.js";
import type { LandingSourceDiff } from "./types.js";
import { diffContentHash, unique } from "./utils.js";

export async function collectSourceDiff(cwd: string): Promise<LandingSourceDiff> {
  const [trackedDiff, trackedStat, trackedNames, untrackedFiles] = await Promise.all([
    gitText(cwd, ["diff", "--no-ext-diff", "--binary", "HEAD"]),
    gitText(cwd, ["diff", "--stat", "HEAD"]),
    gitText(cwd, ["diff", "--name-only", "HEAD"]),
    listUntrackedFiles(cwd),
  ]);
  const untrackedDiff = (await Promise.all(untrackedFiles.map((file) => renderUntrackedTextPatch(cwd, file)))).join("");
  const diff = trackedDiff + untrackedDiff;
  const diffHash = diffContentHash(diff);
  const changedFiles = unique([...trackedNames.split(/\r?\n/).filter(Boolean), ...untrackedFiles.map((file) => file.replace(/\\/g, "/"))]).sort();
  const untrackedStat = untrackedFiles.map((file) => ` ${file.replace(/\\/g, "/")} | new file`).join("\n");
  return {
    diff,
    diffHash,
    diffStat: [trackedStat.trimEnd(), untrackedStat].filter(Boolean).join("\n"),
    changedFiles,
  };
}

async function listUntrackedFiles(cwd: string): Promise<string[]> {
  const output = await gitText(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
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
