import { writeJsonFile } from "../fs/json.js";
import { listWorktreeMetadata } from "./repository.js";
import type { ResolvedMemory } from "../types/index.js";

export async function writeWorktreeIndex(memory: ResolvedMemory): Promise<void> {
  const metadata = await listWorktreeMetadata(memory);
  await writeJsonFile(memory.worktreeIndexPath, {
    generatedAt: new Date().toISOString(),
    worktrees: metadata.map((item) => ({
      worktreeId: item.worktreeId,
      changeId: item.changeId,
      runId: item.runId,
      branchName: item.branchName,
      checkoutPath: item.checkoutPath,
      createdAt: item.createdAt,
      status: item.status,
    })),
  });
}

