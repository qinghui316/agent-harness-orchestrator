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
  "planning.scheduler.plan.prepare",
  "planning.scheduler.contract.compile",
  "planning.scheduler.dispatch.dry-run",
  "planning.scheduler.worker-plan.compile",
  "planning.scheduler.claim-reconcile.compile",
  "planning.scheduler.launch-preflight.check",
  "planning.scheduler.run.prepare",
  "planning.scheduler.runtime.initialize",
  "planning.scheduler.runtime.reconcile",
  "planning.scheduler.runtime.reserve-claims",
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

export const WORKBENCH_THREAD_ACTION_TYPES = [
  ...WORKFLOW_ACTION_TYPES,
  "intake.scan",
  "intake.reanalyze",
  "clarification.answer",
  "clarification.skip",
] as const;

export type WorkbenchThreadActionType = typeof WORKBENCH_THREAD_ACTION_TYPES[number];

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
  "planning.scheduler.plan.prepare",
  "planning.scheduler.contract.compile",
  "planning.scheduler.dispatch.dry-run",
  "planning.scheduler.worker-plan.compile",
  "planning.scheduler.claim-reconcile.compile",
  "planning.scheduler.launch-preflight.check",
  "planning.scheduler.run.prepare",
  "planning.scheduler.runtime.initialize",
  "planning.scheduler.runtime.reconcile",
  "planning.scheduler.runtime.reserve-claims",
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
  "planning.scheduler.plan.prepare",
  "planning.scheduler.contract.compile",
  "planning.scheduler.dispatch.dry-run",
  "planning.scheduler.worker-plan.compile",
  "planning.scheduler.claim-reconcile.compile",
  "planning.scheduler.launch-preflight.check",
  "planning.scheduler.run.prepare",
  "planning.scheduler.runtime.initialize",
  "planning.scheduler.runtime.reconcile",
  "planning.scheduler.runtime.reserve-claims",
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
  "pr-draft.create",
  "planning.confirm-execution",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "planning.taskqueue.propose",
  "planning.scheduler.plan.prepare",
  "planning.scheduler.contract.compile",
  "planning.scheduler.dispatch.dry-run",
  "planning.scheduler.worker-plan.compile",
  "planning.scheduler.claim-reconcile.compile",
  "planning.scheduler.launch-preflight.check",
  "planning.scheduler.run.prepare",
  "planning.scheduler.runtime.initialize",
  "planning.scheduler.runtime.reconcile",
  "planning.scheduler.runtime.reserve-claims",
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
  "schedulerContractId",
  "schedulerDispatchDryRunId",
  "schedulerWorkerPlanId",
  "schedulerClaimReconcilePlanId",
  "schedulerLaunchPreflightId",
  "schedulerRunId",
  "schedulerReconcileSnapshotId",
  "schedulerClaimReservationId",
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

export interface WorkflowActionRequiredTargetIssue {
  actionType: string;
  label: string;
  message: string;
}

export function isWorkflowActionType(actionType: string): actionType is WorkflowActionType {
  return (WORKFLOW_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function isLiveWorkflowActionType(actionType: string): actionType is WorkflowActionType {
  return (LIVE_WORKFLOW_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function revalidatedWorkflowActionSet(): Set<string> {
  return new Set(REVALIDATED_WORKFLOW_ACTION_TYPES);
}

export function validateWorkflowActionRequiredTargets(request: WorkflowActionScopeCarrier): WorkflowActionRequiredTargetIssue[] {
  const actionType = request.actionType ?? "";
  const issues: WorkflowActionRequiredTargetIssue[] = [];
  const requireOne = (label: string, values: Array<unknown>): void => {
    if (!values.some(hasScopeValue)) issues.push({ actionType, label, message: `${actionType} requires ${label}.` });
  };
  const requireSingleTaskId = (): void => {
    if ((request.taskIds?.length ?? 0) !== 1 || !request.taskIds?.[0]) {
      issues.push({ actionType, label: "single taskIds[0]", message: `${actionType} requires a single taskIds[0].` });
    }
  };

  switch (actionType) {
    case "change.spec.accept":
    case "change.plan.accept":
      requireOne("proposalId", [request.proposalId]);
      break;
    case "planning.confirm-execution":
      requireOne("planningBundleId", [request.planningBundleId]);
      break;
    case "planning.decomposition.confirm":
    case "planning.decomposition.assess-readiness":
      requireOne("decompositionPlanId", [request.decompositionPlanId]);
      break;
    case "planning.taskqueue.propose":
      requireOne("readinessManifestId", [request.readinessManifestId]);
      break;
    case "planning.scheduler.plan.prepare":
      requireOne("changeId", [request.changeId]);
      break;
    case "planning.scheduler.contract.compile":
      requireOne("decompositionPlanId", [request.decompositionPlanId]);
      requireOne("readinessManifestId", [request.readinessManifestId]);
      break;
    case "planning.scheduler.dispatch.dry-run":
      requireOne("schedulerContractId", [request.schedulerContractId]);
      break;
    case "planning.scheduler.worker-plan.compile":
      requireOne("schedulerDispatchDryRunId", [request.schedulerDispatchDryRunId]);
      break;
    case "planning.scheduler.claim-reconcile.compile":
      requireOne("schedulerWorkerPlanId", [request.schedulerWorkerPlanId]);
      break;
    case "planning.scheduler.launch-preflight.check":
      requireOne("schedulerClaimReconcilePlanId", [request.schedulerClaimReconcilePlanId]);
      break;
    case "planning.scheduler.run.prepare":
      requireOne("schedulerLaunchPreflightId", [request.schedulerLaunchPreflightId]);
      break;
    case "planning.scheduler.runtime.initialize":
    case "planning.scheduler.runtime.reconcile":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      break;
    case "planning.scheduler.runtime.reserve-claims":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerReconcileSnapshotId", [request.schedulerReconcileSnapshotId]);
      break;
    case "planning.workflowgraph.compile":
      requireOne("taskQueueProposalId", [request.taskQueueProposalId]);
      requireOne("readinessManifestId", [request.readinessManifestId]);
      break;
    case "planning.taskqueue.confirm-start":
      requireOne("taskQueueProposalId", [request.taskQueueProposalId]);
      requireOne("workflowGraphPlanId", [request.workflowGraphPlanId]);
      requireOne("readinessManifestId", [request.readinessManifestId]);
      requireOne("decompositionPlanId", [request.decompositionPlanId]);
      break;
    case "code.run":
      requireOne("readinessManifestId", [request.readinessManifestId]);
      break;
    case "task.run.start":
      requireSingleTaskId();
      break;
    case "task.run.retry":
    case "task.run.reconcile":
      requireOne("taskRunId", [request.taskRunId]);
      break;
    case "task.queue.start":
      requireOne("workflowRunId", [request.workflowRunId]);
      requireOne("queueRunId", [request.queueRunId]);
      requireOne("taskQueueProposalId", [request.taskQueueProposalId]);
      requireOne("workflowGraphPlanId", [request.workflowGraphPlanId]);
      requireOne("readinessManifestId", [request.readinessManifestId]);
      requireOne("decompositionPlanId", [request.decompositionPlanId]);
      break;
    case "apply-check.run":
      requireOne("worktreeId or worktreeIds", [request.worktreeId, request.worktreeIds]);
      break;
    case "landing.prepare":
    case "landing.refresh":
      requireOne("applyCheckId or worktreeId", [request.applyCheckId, request.worktreeId]);
      break;
    case "landing.review":
      requireOne("landingPackageId", [request.landingPackageId]);
      break;
    case "landing-queue.merge-next":
      requireOne("landingPackageId", [request.landingPackageId]);
      break;
    case "remote-landing.merge":
      requireOne("landingPackageId", [request.landingPackageId]);
      break;
    case "post-merge.sync-local.run":
    case "post-merge.cleanup-branch.run":
      requireOne("landingPackageId", [request.landingPackageId]);
      requireOne("remoteLandingResultId", [request.remoteLandingResultId]);
      break;
    case "pr-draft.prepare":
    case "pr-draft.create":
    case "pr-draft.refresh":
    case "pr-feedback.refresh":
    case "pr-feedback.evaluate":
    case "pr-feedback.rework":
    case "pr-feedback.update-draft":
    case "pr-review.prepare":
    case "pr-review.submit":
    case "pr-review.refresh":
    case "pr-review.feedback-refresh":
    case "pr-review.feedback-evaluate":
    case "pr-review.rework":
    case "pr-review.reply-prepare":
    case "pr-review.reply-submit":
    case "pr-review.thread-resolve":
    case "remote-landing.prepare":
    case "remote-landing.refresh":
    case "post-merge.prepare":
    case "post-merge.refresh":
    case "post-merge.sync-local.prepare":
    case "post-merge.cleanup-branch.prepare":
      requireOne("landingPackageId", [request.landingPackageId]);
      break;
  }
  return issues;
}

export function assertWorkflowActionRequiredTargets(request: WorkflowActionScopeCarrier): void {
  const [issue] = validateWorkflowActionRequiredTargets(request);
  if (issue) throw new Error(issue.message);
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
    schedulerContractId: request.schedulerContractId ?? extractString(result, "contract", "id") ?? extractString(result, "dryRun", "schedulerContractId") ?? extractString(result, "workerPlan", "schedulerContractId") ?? extractString(result, "claimReconcilePlan", "schedulerContractId") ?? extractString(result, "launchPreflight", "schedulerContractId") ?? extractString(result, "schedulerRun", "schedulerContractId") ?? extractString(result, "runtimeState", "schedulerContractId") ?? extractString(result, "reconcileSnapshot", "schedulerContractId") ?? extractString(result, "claimReservation", "schedulerContractId"),
    schedulerDispatchDryRunId: request.schedulerDispatchDryRunId ?? extractString(result, "dryRun", "id") ?? extractString(result, "workerPlan", "schedulerDispatchDryRunId") ?? extractString(result, "claimReconcilePlan", "schedulerDispatchDryRunId") ?? extractString(result, "launchPreflight", "schedulerDispatchDryRunId") ?? extractString(result, "schedulerRun", "schedulerDispatchDryRunId"),
    schedulerWorkerPlanId: request.schedulerWorkerPlanId ?? extractString(result, "workerPlan", "id") ?? extractString(result, "claimReconcilePlan", "schedulerWorkerPlanId") ?? extractString(result, "launchPreflight", "schedulerWorkerPlanId") ?? extractString(result, "schedulerRun", "schedulerWorkerPlanId"),
    schedulerClaimReconcilePlanId: request.schedulerClaimReconcilePlanId ?? extractString(result, "claimReconcilePlan", "id") ?? extractString(result, "launchPreflight", "schedulerClaimReconcilePlanId") ?? extractString(result, "schedulerRun", "schedulerClaimReconcilePlanId"),
    schedulerLaunchPreflightId: request.schedulerLaunchPreflightId ?? extractString(result, "launchPreflight", "id") ?? extractString(result, "schedulerRun", "schedulerLaunchPreflightId"),
    schedulerRunId: request.schedulerRunId ?? extractString(result, "schedulerRun", "id") ?? extractString(result, "runtimeState", "schedulerRunId") ?? extractString(result, "reconcileSnapshot", "schedulerRunId") ?? extractString(result, "claimReservation", "schedulerRunId"),
    schedulerReconcileSnapshotId: request.schedulerReconcileSnapshotId ?? extractString(result, "reconcileSnapshot", "id") ?? extractString(result, "claimReservation", "schedulerReconcileSnapshotId"),
    schedulerClaimReservationId: request.schedulerClaimReservationId ?? extractString(result, "claimReservation", "id"),
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
    ?? request.schedulerClaimReservationId
    ?? extractString(result, "claimReservation", "id")
    ?? request.schedulerRunId
    ?? extractString(result, "schedulerRun", "id")
    ?? extractString(result, "runtimeState", "schedulerRunId")
    ?? extractString(result, "reconcileSnapshot", "schedulerRunId")
    ?? extractString(result, "claimReservation", "schedulerRunId")
    ?? request.schedulerReconcileSnapshotId
    ?? extractString(result, "reconcileSnapshot", "id")
    ?? request.schedulerLaunchPreflightId
    ?? extractString(result, "launchPreflight", "id")
    ?? extractString(result, "schedulerRun", "schedulerLaunchPreflightId")
    ?? request.schedulerClaimReconcilePlanId
    ?? extractString(result, "claimReconcilePlan", "id")
    ?? extractString(result, "launchPreflight", "schedulerClaimReconcilePlanId")
    ?? extractString(result, "schedulerRun", "schedulerClaimReconcilePlanId")
    ?? request.schedulerWorkerPlanId
    ?? extractString(result, "workerPlan", "id")
    ?? extractString(result, "claimReconcilePlan", "schedulerWorkerPlanId")
    ?? extractString(result, "launchPreflight", "schedulerWorkerPlanId")
    ?? extractString(result, "schedulerRun", "schedulerWorkerPlanId")
    ?? request.schedulerDispatchDryRunId
    ?? extractString(result, "workerPlan", "schedulerDispatchDryRunId")
    ?? extractString(result, "claimReconcilePlan", "schedulerDispatchDryRunId")
    ?? extractString(result, "launchPreflight", "schedulerDispatchDryRunId")
    ?? extractString(result, "schedulerRun", "schedulerDispatchDryRunId")
    ?? request.schedulerContractId
    ?? extractString(result, "contract", "id")
    ?? extractString(result, "dryRun", "schedulerContractId")
    ?? extractString(result, "workerPlan", "schedulerContractId")
    ?? extractString(result, "claimReconcilePlan", "schedulerContractId")
    ?? extractString(result, "launchPreflight", "schedulerContractId")
    ?? extractString(result, "schedulerRun", "schedulerContractId")
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
  return workflowActionScopesMatchStrict(left, right);
}

export function workflowActionScopesMatchStrict(left: WorkflowActionScopeCarrier, right: WorkflowActionScopeCarrier): boolean {
  return sameStrictOptional(left.planningBundleId, right.planningBundleId)
    && sameStrictOptional(left.decompositionPlanId, right.decompositionPlanId)
    && sameStrictOptional(left.readinessManifestId, right.readinessManifestId)
    && sameStrictOptional(left.taskQueueProposalId, right.taskQueueProposalId)
    && sameStrictOptional(left.workflowGraphPlanId, right.workflowGraphPlanId)
    && sameStrictOptional(left.schedulerContractId, right.schedulerContractId)
    && sameStrictOptional(left.schedulerDispatchDryRunId, right.schedulerDispatchDryRunId)
    && sameStrictOptional(left.schedulerWorkerPlanId, right.schedulerWorkerPlanId)
    && sameStrictOptional(left.schedulerClaimReconcilePlanId, right.schedulerClaimReconcilePlanId)
    && sameStrictOptional(left.schedulerLaunchPreflightId, right.schedulerLaunchPreflightId)
    && sameStrictOptional(left.schedulerRunId, right.schedulerRunId)
    && sameStrictOptional(left.schedulerReconcileSnapshotId, right.schedulerReconcileSnapshotId)
    && sameStrictOptional(left.schedulerClaimReservationId, right.schedulerClaimReservationId)
    && sameStrictOptional(left.workflowRunId, right.workflowRunId)
    && sameStrictOptional(left.queueRunId, right.queueRunId)
    && sameStrictOptional(left.worktreeId, right.worktreeId)
    && sameStrictOptionalArray(left.worktreeIds, right.worktreeIds)
    && sameStrictOptional(left.applyCheckId, right.applyCheckId)
    && sameStrictOptional(left.landingPackageId, right.landingPackageId)
    && sameStrictOptional(left.remoteLandingResultId, right.remoteLandingResultId)
    && sameStrictOptional(left.taskRunId, right.taskRunId)
    && sameStrictOptionalArray(left.taskIds, right.taskIds);
}

export function workflowActionScopesMatchCompatible(left: WorkflowActionScopeCarrier, right: WorkflowActionScopeCarrier): boolean {
  return sameCompatibleOptional(left.planningBundleId, right.planningBundleId)
    && sameCompatibleOptional(left.decompositionPlanId, right.decompositionPlanId)
    && sameCompatibleOptional(left.readinessManifestId, right.readinessManifestId)
    && sameCompatibleOptional(left.taskQueueProposalId, right.taskQueueProposalId)
    && sameCompatibleOptional(left.workflowGraphPlanId, right.workflowGraphPlanId)
    && sameCompatibleOptional(left.schedulerContractId, right.schedulerContractId)
    && sameCompatibleOptional(left.schedulerDispatchDryRunId, right.schedulerDispatchDryRunId)
    && sameCompatibleOptional(left.schedulerWorkerPlanId, right.schedulerWorkerPlanId)
    && sameCompatibleOptional(left.schedulerClaimReconcilePlanId, right.schedulerClaimReconcilePlanId)
    && sameCompatibleOptional(left.schedulerLaunchPreflightId, right.schedulerLaunchPreflightId)
    && sameCompatibleOptional(left.schedulerRunId, right.schedulerRunId)
    && sameCompatibleOptional(left.schedulerReconcileSnapshotId, right.schedulerReconcileSnapshotId)
    && sameCompatibleOptional(left.schedulerClaimReservationId, right.schedulerClaimReservationId)
    && sameCompatibleOptional(left.workflowRunId, right.workflowRunId)
    && sameCompatibleOptional(left.queueRunId, right.queueRunId)
    && sameCompatibleOptional(left.worktreeId, right.worktreeId)
    && sameCompatibleOptionalArray(left.worktreeIds, right.worktreeIds)
    && sameCompatibleOptional(left.applyCheckId, right.applyCheckId)
    && sameCompatibleOptional(left.landingPackageId, right.landingPackageId)
    && sameCompatibleOptional(left.remoteLandingResultId, right.remoteLandingResultId)
    && sameCompatibleOptional(left.taskRunId, right.taskRunId)
    && sameCompatibleOptionalArray(left.taskIds, right.taskIds);
}

function extractString(value: unknown, objectKey: string, fieldKey: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const nested = value[objectKey];
  if (!isRecord(nested)) return undefined;
  const result = nested[fieldKey];
  return typeof result === "string" ? result : undefined;
}

function hasScopeValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function sameCompatibleOptional(left: string | undefined, right: string | undefined): boolean {
  return !left || !right || left === right;
}

function sameCompatibleOptionalArray(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left?.length || !right?.length) return true;
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function sameStrictOptional(left: string | undefined, right: string | undefined): boolean {
  return (left ?? "") === (right ?? "");
}

function sameStrictOptionalArray(left: string[] | undefined, right: string[] | undefined): boolean {
  const l = left ?? [];
  const r = right ?? [];
  return l.length === r.length && l.every((item, index) => item === r[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
