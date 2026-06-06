export const WORKFLOW_ACTION_TYPES = [
  "chat.ask",
  "change.spec.propose",
  "change.spec.accept",
  "change.plan.propose",
  "change.plan.accept",
  "planning.generate",
  "planning.revise",
  "planning.confirm-execution",
  "planning.decompose",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "planning.taskqueue.propose",
  "planning.workflowgraph.compile",
  "planning.taskqueue.confirm-start",
  "orchestrator.evaluate",
  "demand.worker.enqueue",
  "demand.worker.claim",
  "demand.worker.start-next",
  "demand.worker.start-available",
  "demand.worker.reconcile",
  "demand.worker.release",
  "orchestrator.pump",
  "role.pipeline.start",
  "role.pipeline.stop",
  "role.pipeline.continue",
  "role.pipeline.reconcile",
  "conversation.steer",
  "conversation.interrupt",
  "conversation.continue",
  "result.refresh-rework",
  "result.revalidate",
  "result.reaudit",
  "result.refresh-status",
  "apply-check.run",
  "landing.prepare",
  "landing.review",
  "landing.refresh",
  "landing-queue.prepare",
  "landing-queue.refresh",
  "landing-queue.merge-next",
  "landing-queue.skip",
  "landing-queue.remove-stale",
  "pr-draft.prepare",
  "pr-draft.create",
  "pr-draft.refresh",
  "pr-feedback.refresh",
  "pr-feedback.evaluate",
  "pr-feedback.rework",
  "pr-feedback.update-draft",
  "pr-review.prepare",
  "pr-review.submit",
  "pr-review.refresh",
  "pr-review.feedback-refresh",
  "pr-review.feedback-evaluate",
  "pr-review.rework",
  "pr-review.reply-prepare",
  "pr-review.reply-submit",
  "pr-review.thread-resolve",
  "remote-landing.prepare",
  "remote-landing.merge",
  "remote-landing.refresh",
  "post-merge.prepare",
  "post-merge.refresh",
  "post-merge.sync-local.prepare",
  "post-merge.sync-local.run",
  "post-merge.cleanup-branch.prepare",
  "post-merge.cleanup-branch.run",
  "code.run",
  "task.run.start",
  "task.run.retry",
  "task.run.reconcile",
  "task.queue.start",
  "task.queue.reconcile",
  "validate.run",
  "audit.run",
  "spec-test.drift",
] as const;

export type WorkflowActionType = typeof WORKFLOW_ACTION_TYPES[number];

export const LIVE_WORKFLOW_ACTION_TYPES = [
  "chat.ask",
  "change.spec.propose",
  "change.plan.propose",
  "planning.generate",
  "planning.revise",
  "planning.confirm-execution",
  "planning.decompose",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "planning.taskqueue.propose",
  "planning.workflowgraph.compile",
  "planning.taskqueue.confirm-start",
  "orchestrator.evaluate",
  "orchestrator.pump",
  "demand.worker.enqueue",
  "demand.worker.claim",
  "demand.worker.start-next",
  "demand.worker.start-available",
  "demand.worker.reconcile",
  "demand.worker.release",
  "role.pipeline.start",
  "role.pipeline.stop",
  "role.pipeline.continue",
  "role.pipeline.reconcile",
  "conversation.steer",
  "conversation.interrupt",
  "conversation.continue",
  "result.refresh-rework",
  "result.revalidate",
  "result.reaudit",
  "result.refresh-status",
  "apply-check.run",
  "landing.prepare",
  "landing.review",
  "landing.refresh",
  "landing-queue.prepare",
  "landing-queue.refresh",
  "landing-queue.merge-next",
  "landing-queue.skip",
  "landing-queue.remove-stale",
  "pr-draft.prepare",
  "pr-draft.create",
  "pr-draft.refresh",
  "pr-feedback.refresh",
  "pr-feedback.evaluate",
  "pr-feedback.rework",
  "pr-feedback.update-draft",
  "pr-review.prepare",
  "pr-review.submit",
  "pr-review.refresh",
  "pr-review.feedback-refresh",
  "pr-review.feedback-evaluate",
  "pr-review.rework",
  "pr-review.reply-prepare",
  "pr-review.reply-submit",
  "pr-review.thread-resolve",
  "remote-landing.prepare",
  "remote-landing.merge",
  "remote-landing.refresh",
  "post-merge.prepare",
  "post-merge.refresh",
  "post-merge.sync-local.prepare",
  "post-merge.sync-local.run",
  "post-merge.cleanup-branch.prepare",
  "post-merge.cleanup-branch.run",
  "code.run",
  "task.run.start",
  "task.run.retry",
  "task.queue.start",
  "task.queue.reconcile",
] as const satisfies readonly WorkflowActionType[];

export const HIGH_IMPACT_WORKFLOW_ACTION_TYPES = [
  "change.spec.accept",
  "change.plan.accept",
  "planning.confirm-execution",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "planning.taskqueue.propose",
  "planning.workflowgraph.compile",
  "planning.taskqueue.confirm-start",
  "code.run",
  "task.run.start",
  "task.run.retry",
  "task.queue.start",
  "worktree.apply",
  "result.apply",
  "apply-check.apply",
  "landing-queue.merge-next",
  "pr-draft.create",
  "pr-feedback.update-draft",
  "pr-review.submit",
  "pr-review.reply-submit",
  "pr-review.thread-resolve",
  "remote-landing.merge",
  "post-merge.sync-local.run",
  "post-merge.cleanup-branch.run",
  "harness-change.close",
  "harness-evolve.apply",
  "harness-evolve.mark-complete",
] as const;

export const REVALIDATED_WORKFLOW_ACTION_TYPES = [
  "landing-queue.merge-next",
  "planning.confirm-execution",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "planning.taskqueue.propose",
  "planning.workflowgraph.compile",
  "planning.taskqueue.confirm-start",
  "code.run",
  "task.queue.start",
  "remote-landing.merge",
  "post-merge.sync-local.run",
  "post-merge.cleanup-branch.run",
] as const satisfies readonly WorkflowActionType[];

export const WORKFLOW_ACTION_SCOPE_KEYS = [
  "proposalId",
  "planningBundleId",
  "decompositionPlanId",
  "readinessManifestId",
  "taskQueueProposalId",
  "workflowGraphPlanId",
  "workflowRunId",
  "queueRunId",
  "worktreeId",
  "worktreeIds",
  "applyCheckId",
  "landingPackageId",
  "remoteLandingResultId",
  "taskRunId",
  "taskIds",
] as const;

export type WorkflowActionScopeKey = typeof WORKFLOW_ACTION_SCOPE_KEYS[number];

export type WorkflowActionScopeCarrier = {
  actionType?: string;
  changeId?: string;
} & Partial<Record<Exclude<WorkflowActionScopeKey, "worktreeIds" | "taskIds">, string>> & {
  worktreeIds?: string[];
  taskIds?: string[];
};

export function isWorkflowActionType(actionType: string): actionType is WorkflowActionType {
  return (WORKFLOW_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function isLiveWorkflowActionType(actionType: string): actionType is WorkflowActionType {
  return (LIVE_WORKFLOW_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function revalidatedWorkflowActionSet(): Set<string> {
  return new Set(REVALIDATED_WORKFLOW_ACTION_TYPES);
}

export function workflowActionScopePayload(request: WorkflowActionScopeCarrier, changeId: string, result?: unknown): Record<string, unknown> {
  return {
    changeId,
    proposalId: request.proposalId,
    planningBundleId: request.planningBundleId,
    decompositionPlanId: request.decompositionPlanId,
    readinessManifestId: request.readinessManifestId ?? extractString(result, "manifest", "id"),
    taskQueueProposalId: request.taskQueueProposalId ?? extractString(result, "proposal", "id"),
    workflowGraphPlanId: request.workflowGraphPlanId ?? extractString(result, "graph", "id"),
    workflowRunId: request.workflowRunId ?? extractString(result, "workflowRun", "id") ?? extractString(result, "workflow", "id"),
    queueRunId: request.queueRunId,
    worktreeId: request.worktreeId,
    worktreeIds: request.worktreeIds,
    applyCheckId: request.applyCheckId,
    landingPackageId: request.landingPackageId,
    remoteLandingResultId: request.remoteLandingResultId,
    taskRunId: request.taskRunId,
    taskIds: request.taskIds,
  };
}

export function workflowActionTargetId(request: WorkflowActionScopeCarrier, changeId: string, result?: unknown): string {
  return request.remoteLandingResultId
    ?? request.landingPackageId
    ?? request.applyCheckId
    ?? request.worktreeId
    ?? request.worktreeIds?.join(",")
    ?? request.workflowRunId
    ?? request.workflowGraphPlanId
    ?? extractString(result, "graph", "id")
    ?? request.taskQueueProposalId
    ?? extractString(result, "proposal", "id")
    ?? request.queueRunId
    ?? request.readinessManifestId
    ?? extractString(result, "manifest", "id")
    ?? request.decompositionPlanId
    ?? request.planningBundleId
    ?? request.proposalId
    ?? request.taskRunId
    ?? request.taskIds?.join(",")
    ?? changeId;
}

export function workflowActionScopesMatch(left: WorkflowActionScopeCarrier, right: WorkflowActionScopeCarrier): boolean {
  return sameOptional(left.planningBundleId, right.planningBundleId)
    && sameOptional(left.decompositionPlanId, right.decompositionPlanId)
    && sameOptional(left.readinessManifestId, right.readinessManifestId)
    && sameOptional(left.taskQueueProposalId, right.taskQueueProposalId)
    && sameOptional(left.workflowGraphPlanId, right.workflowGraphPlanId)
    && sameOptional(left.workflowRunId, right.workflowRunId)
    && sameOptional(left.queueRunId, right.queueRunId)
    && sameOptional(left.worktreeId, right.worktreeId)
    && sameOptionalArray(left.worktreeIds, right.worktreeIds)
    && sameOptional(left.applyCheckId, right.applyCheckId)
    && sameOptional(left.landingPackageId, right.landingPackageId)
    && sameOptional(left.remoteLandingResultId, right.remoteLandingResultId)
    && sameOptional(left.taskRunId, right.taskRunId)
    && sameOptionalArray(left.taskIds, right.taskIds);
}

function extractString(value: unknown, objectKey: string, fieldKey: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const nested = value[objectKey];
  if (!isRecord(nested)) return undefined;
  const result = nested[fieldKey];
  return typeof result === "string" ? result : undefined;
}

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return !left || !right || left === right;
}

function sameOptionalArray(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left?.length || !right?.length) return true;
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
