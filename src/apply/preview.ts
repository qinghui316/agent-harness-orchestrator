import type { ManagedProject } from "../types/index.js";
import { resolveProjectApplyExecutionScope } from "./execution-scope.js";
import { evaluateSkillNativeApplyGate } from "./gate.js";
import type { WorktreePreviewResult } from "./types.js";

export async function previewWorktreeApply(project: ManagedProject, worktreeId: string): Promise<WorktreePreviewResult> {
  const scope = await resolveProjectApplyExecutionScope(project, worktreeId);
  return { gate: await evaluateSkillNativeApplyGate(project, scope.runtime, scope.harness, worktreeId) };
}
