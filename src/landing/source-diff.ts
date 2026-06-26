import { gitText } from "../project/git.js";
import { renderUntrackedTextPatch } from "../project/untracked-patch.js";
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
