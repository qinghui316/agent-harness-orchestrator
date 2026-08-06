import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { gitTextWithEnv } from "../project/git.js";
import type { LandingSourceDiff } from "./types.js";
import { diffContentHash, unique } from "./utils.js";

export async function collectSourceDiff(cwd: string): Promise<LandingSourceDiff> {
  const indexRoot = join(cwd, ".git", "aho-indexes");
  const indexPath = join(indexRoot, `${randomUUID()}.index`);
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    await mkdir(indexRoot, { recursive: true });
    await gitTextWithEnv(cwd, ["read-tree", "HEAD"], env);
    await gitTextWithEnv(cwd, ["add", "--all", "--", "."], env);
    const namesOutput = await gitTextWithEnv(cwd, ["diff", "--cached", "--name-only", "-z", "HEAD"], env);
    const changedFiles = unique(namesOutput.split("\0")
      .map((file) => file.trim().replace(/\\/g, "/"))
      .filter(Boolean))
      .sort();
    if (changedFiles.length === 0) return { diff: "", diffHash: diffContentHash(""), diffStat: "", changedFiles: [] };
    const [diff, diffStat] = await Promise.all([
      gitTextWithEnv(cwd, ["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", "HEAD", "--", ...changedFiles], env),
      gitTextWithEnv(cwd, ["diff", "--cached", "--stat", "HEAD", "--", ...changedFiles], env),
    ]);
    return { diff, diffHash: diffContentHash(diff), diffStat, changedFiles };
  } finally {
    await rm(indexPath, { force: true }).catch(() => undefined);
  }
}
