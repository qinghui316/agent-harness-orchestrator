import { applyResultToProject, applyWorktree, discardWorktree } from "../../apply/manager.js";
import { acceptAudit } from "../../audit/manager.js";
import { closeChangeForChange } from "../../change/manager.js";
import { acceptPlanProposal, acceptSpecProposal } from "../../change/proposals.js";
import { applyIntegrationCheck, discardIntegrationCheck } from "../../integration-check/manager.js";
import { acceptSpecTestProposal } from "../../spec-test/proposal.js";
import type { WorkbenchApprovalAction, WorkbenchProjectInput } from "../../workbench/manager.js";
import { isRecord } from "./http.js";
import type { WorkbenchActionRequest } from "./types.js";

export const allowedActionIds = new Set([
  "change.spec.accept",
  "change.plan.accept",
  "spec-test.proposal.accept-all-existing",
  "audit.accept",
  "result.apply",
  "worktree.apply",
  "worktree.discard",
  "apply-check.apply",
  "apply-check.discard",
  "change.close",
]);

export async function runAllowlistedAction(project: NonNullable<WorkbenchProjectInput["project"]>, action: WorkbenchApprovalAction, options: WorkbenchActionRequest["options"]): Promise<unknown> {
  const args = action.args;
  switch (action.actionId) {
    case "change.spec.accept":
      assertArgs(action, "change", ["spec", "accept"], 4);
      return acceptSpecProposal(project, args[3]);
    case "change.plan.accept":
      assertArgs(action, "change", ["plan", "accept"], 4);
      return acceptPlanProposal(project, args[3]);
    case "spec-test.proposal.accept-all-existing":
      assertArgs(action, "spec-test", ["proposal", "accept"], 5);
      return acceptSpecTestProposal(project, args[3], { allExisting: true });
    case "audit.accept":
      assertArgs(action, "audit", ["accept"], 3);
      return acceptAudit(project, args[2]);
    case "result.apply":
      assertArgs(action, "result", ["apply"], 3);
      return applyResultToProject(project, scopedWorktreeArgOrThrow(action), { commit: options?.commit === true, message: options?.message });
    case "worktree.apply":
      assertArgs(action, "worktree", ["apply"], 3);
      return applyWorktree(project, scopedWorktreeArgOrThrow(action), { commit: options?.commit === true, message: options?.message });
    case "worktree.discard":
      assertArgs(action, "worktree", ["discard"], 3);
      return discardWorktree(project, scopedWorktreeArgOrThrow(action));
    case "apply-check.apply":
      assertArgs(action, "apply-check", ["apply"], 2);
      return applyIntegrationCheck(project, args[1], args[2]);
    case "apply-check.discard":
      assertArgs(action, "apply-check", ["discard"], 2);
      return discardIntegrationCheck(project, args[2] ?? args[1]);
    case "change.close":
      assertArgs(action, "change", ["close"], 3);
      return closeChangeForChange(project, args[2] as string);
    default:
      throw new Error("Unsupported Workbench action.");
  }
}

export function inferTargetIdFromAction(action: WorkbenchApprovalAction, result: unknown): string | null {
  if (action.actionId === "change.close" && isRecord(result) && isRecord(result.change) && typeof result.change.id === "string") {
    return result.change.id;
  }
  if (action.actionId === "change.spec.accept" || action.actionId === "change.plan.accept") return action.args[3] ?? null;
  if (action.actionId === "spec-test.proposal.accept-all-existing") return action.args[3] ?? null;
  if (action.actionId === "audit.accept") return action.args[2] ?? null;
  if (action.actionId === "result.apply") return scopedWorktreeArg(action) ?? null;
  if (action.actionId === "worktree.apply") return scopedWorktreeArg(action) ?? null;
  if (action.actionId === "worktree.discard") return scopedWorktreeArg(action) ?? null;
  if (action.actionId === "apply-check.apply" || action.actionId === "apply-check.discard") return action.args[1] ?? null;
  if (action.actionId === "change.close") return action.args[2] ?? null;
  return null;
}

export function inferChangeIdFromAction(action: WorkbenchApprovalAction, result: unknown): string | null {
  if (isRecord(result) && isRecord(result.proposal) && typeof result.proposal.changeId === "string") return result.proposal.changeId;
  if (isRecord(result) && isRecord(result.audit) && typeof result.audit.changeId === "string") return result.audit.changeId;
  if (isRecord(result) && isRecord(result.apply) && typeof result.apply.changeId === "string") return result.apply.changeId;
  if (isRecord(result) && isRecord(result.discard) && typeof result.discard.changeId === "string") return result.discard.changeId;
  if (isRecord(result) && isRecord(result.change) && typeof result.change.id === "string") return result.change.id;
  if (isRecord(result) && typeof result.changeId === "string") return result.changeId;
  if (isRecord(result) && isRecord(result.check) && Array.isArray(result.check.resultTargets) && isRecord(result.check.resultTargets[0]) && typeof result.check.resultTargets[0].changeId === "string") return result.check.resultTargets[0].changeId;
  return null;
}

export function inferRunIdFromActionResult(result: unknown): string | null {
  if (isRecord(result) && isRecord(result.run) && typeof result.run.id === "string") return result.run.id;
  if (isRecord(result) && isRecord(result.proposal) && typeof result.proposal.runId === "string") return result.proposal.runId;
  if (isRecord(result) && isRecord(result.audit) && typeof result.audit.runId === "string") return result.audit.runId;
  if (isRecord(result) && typeof result.runId === "string") return result.runId;
  return null;
}

export function inferArtifactFromActionResult(result: unknown): string | null {
  if (isRecord(result) && typeof result.specPath === "string") return result.specPath;
  if (isRecord(result) && typeof result.planPath === "string") return result.planPath;
  if (isRecord(result) && typeof result.reviewPath === "string") return result.reviewPath;
  if (isRecord(result) && typeof result.archivePath === "string") return result.archivePath;
  if (isRecord(result) && typeof result.artifactDirectory === "string") return result.artifactDirectory;
  if (isRecord(result) && isRecord(result.run) && isRecord(result.run.artifacts)) {
    const artifacts = result.run.artifacts;
    if (typeof artifacts.apply === "string") return artifacts.apply;
    if (typeof artifacts.discard === "string") return artifacts.discard;
    if (typeof artifacts.directory === "string") return artifacts.directory;
  }
  return null;
}

function scopedWorktreeArg(action: WorkbenchApprovalAction): string | undefined {
  return action.args.length >= 4 ? action.args[3] : action.args[2];
}

function scopedWorktreeArgOrThrow(action: WorkbenchApprovalAction): string {
  const value = scopedWorktreeArg(action);
  if (!value) {
    const error = new Error(`Missing worktree id for action ${action.actionId}.`);
    error.name = "BadRequest";
    throw error;
  }
  return value;
}

function assertArgs(action: WorkbenchApprovalAction, command: string, prefix: string[], minLength: number): void {
  if (action.command !== command || action.args.length < minLength || !prefix.every((part, index) => action.args[index] === part)) {
    const error = new Error(`Invalid args for action ${action.actionId}.`);
    error.name = "BadRequest";
    throw error;
  }
}
