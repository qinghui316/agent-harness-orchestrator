import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { evaluateApplyGate } from "./gate.js";
import type { WorktreePreviewResult } from "./types.js";

export async function previewWorktreeApply(project: ManagedProject, worktreeId: string): Promise<WorktreePreviewResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree preview");
  return { gate: await evaluateApplyGate(project, memory, worktreeId) };
}
