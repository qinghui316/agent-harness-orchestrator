import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeProposalTargetHashes } from "../../types/index.js";

export async function readTargetHashes(changePath: string): Promise<ChangeProposalTargetHashes> {
  return {
    spec: await hashFile(join(changePath, "spec.md")),
    plan: await hashFile(join(changePath, "plan.md")),
    tasks: await hashFile(join(changePath, "tasks.md")),
  };
}

export async function assertTargetHashesUnchanged(paths: { spec?: string; plan?: string; tasks?: string }, expected: ChangeProposalTargetHashes): Promise<void> {
  for (const [key, path] of Object.entries(paths) as Array<[keyof ChangeProposalTargetHashes, string]>) {
    const current = await hashFile(path);
    if (expected[key] !== current) {
      throw new Error(`${key}.md changed after proposal was generated; re-run proposal before accept.`);
    }
  }
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
