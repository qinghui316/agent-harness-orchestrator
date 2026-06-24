import type { WorkflowActionType } from "../workflow-actions/registry.js";

export const SCOPED_AUTOMATION_ACTION_TYPE = "planning.automation.scoped-auto.run" as const;
export const AUTOMATION_DEFAULT_MAX_STEPS = 5;
export const AUTOMATION_HARD_MAX_STEPS = 10;

export const SCOPED_AUTOMATION_ALLOWED_ACTION_TYPES = [
  "planning.confirm-execution",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "code.run",
  "validate.run",
  "audit.run",
  "result.refresh-rework",
  "result.revalidate",
  "result.reaudit",
  "planning.goal-loop.controlled-continue.run",
] as const satisfies readonly WorkflowActionType[];

const allowed = new Set<string>(SCOPED_AUTOMATION_ALLOWED_ACTION_TYPES);

const terminalHumanGates = new Set<string>([
  "result.apply",
  "worktree.apply",
  "change.close",
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

export function isScopedAutomationTerminalHumanGate(actionType: string | undefined): boolean {
  return Boolean(actionType && terminalHumanGates.has(actionType));
}

export function clampAutomationMaxSteps(value: number | undefined): number {
  if (!Number.isFinite(value ?? AUTOMATION_DEFAULT_MAX_STEPS)) return AUTOMATION_DEFAULT_MAX_STEPS;
  const numeric = Math.trunc(value ?? AUTOMATION_DEFAULT_MAX_STEPS);
  return Math.min(AUTOMATION_HARD_MAX_STEPS, Math.max(1, numeric));
}
