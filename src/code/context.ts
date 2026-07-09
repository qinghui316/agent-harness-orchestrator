import { buildRoleContextArtifact, buildRoleContextPacket, contextSourceRef, type RoleContextArtifact } from "../context/packets.js";
import type { ChangeStatus, RunWorktreeInfo } from "../types/index.js";

export function buildCodeRoleContextArtifact(input: {
  roleId: string;
  changeStatus: ChangeStatus;
  runId: string;
  taskIds: string[];
  worktree: RunWorktreeInfo;
  taskRunId?: string;
  extraPrompt?: string;
  contextPacketRef: string;
  createdAt: string;
}): RoleContextArtifact {
  return buildRoleContextArtifact(buildRoleContextPacket({
    roleId: input.roleId,
    changeStatus: input.changeStatus,
    goal: input.roleId === "rework-coder" ? "Repair implementation from validation or audit evidence." : "Implement the confirmed demand in an AHO-owned worktree.",
    runId: input.runId,
    taskIds: input.taskIds,
    worktree: input.worktree,
    evidenceSummary: [
      input.roleId === "rework-coder" ? "Rework run: use selected validation, audit, or human feedback evidence from the current Change." : "Coder run: implement the accepted Change in the assigned worktree.",
      input.changeStatus.latestValidation ? `Latest validation before run: ${input.changeStatus.latestValidation.status} (${input.changeStatus.latestValidation.id}).` : "No prior validation summary selected.",
      input.changeStatus.latestAudit ? `Latest audit before run: ${input.changeStatus.latestAudit.status} (${input.changeStatus.latestAudit.id}).` : "No prior audit summary selected.",
    ],
    evidenceRefs: [
      contextSourceRef("worktree-metadata", input.worktree.metadataPath, "inline", "Assigned worktree metadata and write boundary."),
      ...(input.taskRunId ? [contextSourceRef("task-run", input.taskRunId, "ref", "TaskRun that requested this role run.")] : []),
      ...(input.extraPrompt ? [contextSourceRef("human-prompt", "prompt.md", "inline", "Additional human or rework instruction included in the role prompt.")] : []),
    ],
    createdAt: input.createdAt,
  }), input.contextPacketRef);
}
