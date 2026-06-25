import type { WorkflowActionType } from "../workflow-actions/registry.js";

export const SCOPED_AUTOMATION_ACTION_TYPE = "planning.automation.scoped-auto.run" as const;
export const AUTOMATION_DEFAULT_MAX_STEPS = 10;
export const AUTOMATION_HARD_MAX_STEPS = 10;

export const SCOPED_AUTOMATION_ALLOWED_ACTION_TYPES = [
  "planning.decompose",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "planning.goal-loop.evaluate",
  "planning.goal-loop.controller.refresh",
  "planning.goal-loop.gate-readiness.prepare",
  "code.run",
  "validate.run",
  "audit.run",
  "result.refresh-rework",
  "result.refresh-status",
  "result.revalidate",
  "result.reaudit",
  "landing.prepare",
  "planning.goal-loop.controlled-continue.run",
] as const satisfies readonly WorkflowActionType[];

export const SCOPED_AUTOMATION_ALLOWED_APPROVAL_ACTION_IDS = [
  "audit.accept",
  "result.apply",
  "change.close",
] as const;

export type ScopedAutomationAllowedApprovalActionId = typeof SCOPED_AUTOMATION_ALLOWED_APPROVAL_ACTION_IDS[number];

const allowed = new Set<string>(SCOPED_AUTOMATION_ALLOWED_ACTION_TYPES);
const allowedApprovals = new Set<string>(SCOPED_AUTOMATION_ALLOWED_APPROVAL_ACTION_IDS);

const actionPriority = new Map<string, number>([
  ["planning.goal-loop.controlled-continue.run", 400],
  ["planning.goal-loop.gate-readiness.prepare", 300],
  ["planning.goal-loop.controller.refresh", 200],
  ["planning.goal-loop.evaluate", 100],
]);

const terminalHumanGates = new Set<string>([
  "worktree.apply",
  "apply-check.apply",
  "apply-check.discard",
  "harness-change.close",
  "harness-evolve.apply",
  "harness-evolve.mark-complete",
  "landing-queue.merge-next",
  "remote-landing.merge",
  "post-merge.sync-local.run",
  "post-merge.cleanup-branch.run",
  "pr-draft.create",
  "pr-feedback.update-draft",
  "pr-review.submit",
  "pr-review.reply-submit",
  "pr-review.thread-resolve",
]);

export function isScopedAutomationAllowedAction(actionType: string | undefined): actionType is typeof SCOPED_AUTOMATION_ALLOWED_ACTION_TYPES[number] {
  return Boolean(actionType && allowed.has(actionType));
}

export function scopedAutomationActionPriority(actionType: string | undefined): number {
  if (!isScopedAutomationAllowedAction(actionType)) return -1;
  return actionPriority.get(actionType) ?? 0;
}

export function isScopedAutomationAllowedApprovalAction(actionId: string | undefined): actionId is ScopedAutomationAllowedApprovalActionId {
  return Boolean(actionId && allowedApprovals.has(actionId));
}

export function isScopedAutomationTerminalHumanGate(actionType: string | undefined): boolean {
  return Boolean(actionType && terminalHumanGates.has(actionType));
}

export function clampAutomationMaxSteps(value: number | undefined): number {
  if (!Number.isFinite(value ?? AUTOMATION_DEFAULT_MAX_STEPS)) return AUTOMATION_DEFAULT_MAX_STEPS;
  const numeric = Math.trunc(value ?? AUTOMATION_DEFAULT_MAX_STEPS);
  return Math.min(AUTOMATION_HARD_MAX_STEPS, Math.max(1, numeric));
}
