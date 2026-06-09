import type { WorkbenchConfirmationQueueItem, WorkbenchConfirmationQueueItemKind, WorkbenchDecisionContext } from "../../../read-model-types.js";

export function decisionContextToConfirmationItems(context: WorkbenchDecisionContext | null, primary: boolean): WorkbenchConfirmationQueueItem[] {
  if (!context) return [];
  const confirmActions = context.actions.filter((action) => action.kind !== "none" && action.enabled);
  if (confirmActions.length === 0) return [];
  const kind: WorkbenchConfirmationQueueItemKind = context.kind === "spec-proposal" || context.kind === "plan-proposal"
    ? "planning-confirm"
    : context.kind === "apply-gate"
      ? "single-result-apply"
      : context.kind === "evolution-pending"
        ? "maintenance"
        : context.kind === "queue-blocker" || context.kind === "task-blocker" || context.kind === "validation-failed" || context.kind === "audit-blocked"
          ? "request-changes"
          : "request-changes";
  return [{
    id: `confirm:${context.id}`,
    kind,
    conversationId: context.changeId,
    changeId: context.changeId,
    resultId: context.targetId,
    runId: context.runId,
    worktreeId: context.kind === "apply-gate" ? context.targetId : undefined,
    summary: context.resultSummary ?? context.summary,
    whyNeedsConfirmation: context.title,
    confirmEffect: context.recommendation ?? "确认后会推进当前需求的下一步。",
    riskSummary: context.explanation ?? "执行前请确认摘要和证据。",
    evidenceRefs: [context.artifact].filter((item): item is string => Boolean(item)),
    actions: confirmActions,
    primary,
    status: "pending",
  }];
}
