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
  "planning.goal-loop.evaluate",
  "planning.goal-loop.feedback.evaluate",
  "planning.goal-loop.controller.refresh",
  "planning.goal-loop.gate-readiness.prepare",
  "planning.goal-loop.controlled-continue.run",
  "planning.automation.scoped-auto.run",
  "maintenance.canonical-update.decision.record",
  "maintenance.canonical-patch.application-gate.record",
  "maintenance.canonical-patch.apply",
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
  "planning.scheduler.controlled-step.run",
  "planning.scheduler.controlled-advance.run",
  "planning.scheduler.worker.start-first",
  "planning.scheduler.worker.start-next",
  "planning.scheduler.worker.reconcile-result",
  "planning.scheduler.worker.validate-first",
  "planning.scheduler.worker.audit-first",
  "planning.scheduler.worker.rework-plan.compile",
  "planning.scheduler.worker.rework-start-first",
  "planning.scheduler.worker.rework-reconcile-result",
  "planning.scheduler.worker.rework-validate-first",
  "planning.scheduler.worker.rework-audit-first",
  "planning.scheduler.integration-candidate.compile",
  "planning.scheduler.integration-check.run",
  "planning.scheduler.integration-outcome.reconcile",
  "planning.scheduler.run.complete",
  "planning.scheduler.run.close-blocked",
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
  "planning.goal-loop.evaluate",
  "planning.goal-loop.feedback.evaluate",
  "planning.goal-loop.controller.refresh",
  "planning.goal-loop.gate-readiness.prepare",
  "planning.goal-loop.controlled-continue.run",
  "planning.automation.scoped-auto.run",
  "maintenance.canonical-update.decision.record",
  "maintenance.canonical-patch.application-gate.record",
  "maintenance.canonical-patch.apply",
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
  "planning.scheduler.controlled-step.run",
  "planning.scheduler.controlled-advance.run",
  "planning.scheduler.worker.start-first",
  "planning.scheduler.worker.start-next",
  "planning.scheduler.worker.reconcile-result",
  "planning.scheduler.worker.validate-first",
  "planning.scheduler.worker.audit-first",
  "planning.scheduler.worker.rework-plan.compile",
  "planning.scheduler.worker.rework-start-first",
  "planning.scheduler.worker.rework-reconcile-result",
  "planning.scheduler.worker.rework-validate-first",
  "planning.scheduler.worker.rework-audit-first",
  "planning.scheduler.integration-candidate.compile",
  "planning.scheduler.integration-check.run",
  "planning.scheduler.integration-outcome.reconcile",
  "planning.scheduler.run.complete",
  "planning.scheduler.run.close-blocked",
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
  "planning.goal-loop.evaluate",
  "planning.goal-loop.feedback.evaluate",
  "planning.goal-loop.controller.refresh",
  "planning.goal-loop.gate-readiness.prepare",
  "planning.goal-loop.controlled-continue.run",
  "planning.automation.scoped-auto.run",
  "maintenance.canonical-update.decision.record",
  "maintenance.canonical-patch.application-gate.record",
  "maintenance.canonical-patch.apply",
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
  "planning.scheduler.controlled-step.run",
  "planning.scheduler.controlled-advance.run",
  "planning.scheduler.worker.start-first",
  "planning.scheduler.worker.start-next",
  "planning.scheduler.worker.reconcile-result",
  "planning.scheduler.worker.validate-first",
  "planning.scheduler.worker.audit-first",
  "planning.scheduler.worker.rework-plan.compile",
  "planning.scheduler.worker.rework-start-first",
  "planning.scheduler.worker.rework-reconcile-result",
  "planning.scheduler.worker.rework-validate-first",
  "planning.scheduler.worker.rework-audit-first",
  "planning.scheduler.integration-candidate.compile",
  "planning.scheduler.integration-check.run",
  "planning.scheduler.integration-outcome.reconcile",
  "planning.scheduler.run.complete",
  "planning.scheduler.run.close-blocked",
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
  "planning.decompose",
  "planning.decomposition.confirm",
  "planning.decomposition.assess-readiness",
  "planning.taskqueue.propose",
  "planning.goal-loop.evaluate",
  "planning.goal-loop.feedback.evaluate",
  "planning.goal-loop.controller.refresh",
  "planning.goal-loop.gate-readiness.prepare",
  "planning.goal-loop.controlled-continue.run",
  "planning.automation.scoped-auto.run",
  "maintenance.canonical-update.decision.record",
  "maintenance.canonical-patch.application-gate.record",
  "maintenance.canonical-patch.apply",
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
  "planning.scheduler.controlled-step.run",
  "planning.scheduler.controlled-advance.run",
  "planning.scheduler.worker.start-first",
  "planning.scheduler.worker.start-next",
  "planning.scheduler.worker.reconcile-result",
  "planning.scheduler.worker.validate-first",
  "planning.scheduler.worker.audit-first",
  "planning.scheduler.worker.rework-plan.compile",
  "planning.scheduler.worker.rework-start-first",
  "planning.scheduler.worker.rework-reconcile-result",
  "planning.scheduler.worker.rework-validate-first",
  "planning.scheduler.worker.rework-audit-first",
  "planning.scheduler.integration-candidate.compile",
  "planning.scheduler.integration-check.run",
  "planning.scheduler.integration-outcome.reconcile",
  "planning.scheduler.run.complete",
  "planning.scheduler.run.close-blocked",
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
  "schedulerWorkerStartId",
  "schedulerWorkerResultId",
  "schedulerWorkerValidationId",
  "schedulerWorkerAuditId",
  "schedulerWorkerReworkPlanId",
  "schedulerWorkerReworkStartId",
  "schedulerWorkerReworkResultId",
  "schedulerWorkerReworkValidationId",
  "schedulerWorkerReworkAuditId",
  "schedulerIntegrationCandidateId",
  "schedulerIntegrationCheckHandoffId",
  "schedulerIntegrationOutcomeId",
  "schedulerRunCompletionId",
  "schedulerRunBlockedCloseoutId",
  "goalLoopDecisionId",
  "goalLoopIterationId",
  "goalLoopContinuationBriefId",
  "goalLoopNextStepPacketId",
  "goalLoopFeedbackId",
  "goalLoopControllerPolicyId",
  "goalLoopGateReadinessPreflightId",
  "maintenanceProposalId",
  "maintenancePatchProposalId",
  "maintenanceApplicationManifestId",
  "reservationIntentId",
  "claimIntentId",
  "workflowRunId",
  "queueRunId",
  "worktreeId",
  "worktreeIds",
  "applyCheckId",
  "landingPackageId",
  "remoteLandingResultId",
  "taskRunId",
  "workerLeaseId",
  "runId",
  "validationRunId",
  "reworkValidationRunId",
  "auditRunId",
  "reworkAuditRunId",
  "taskIds",
] as const;

export type WorkflowActionScopeKey = typeof WORKFLOW_ACTION_SCOPE_KEYS[number];

export type WorkflowActionScopeCarrier = {
  actionType?: string;
  changeId?: string;
  goalLoopCurrentGateActionType?: string;
  goalLoopRuntimeAuthorizationId?: string;
  goalLoopRuntimeRunId?: string;
  automationMode?: "request-approval" | "full-access";
  postPlanAutomationMode?: "request-approval" | "full-access";
  automationCurrentGateActionType?: string;
  automationCurrentGateApprovalActionId?: string;
  automationCurrentGateTargetId?: string;
  automationCurrentGateRunId?: string;
  automationCurrentGateArtifact?: string;
  automationAuthorizationId?: string;
  automationRunId?: string;
  maxSteps?: number;
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
    case "planning.decompose":
      requireOne("changeId", [request.changeId]);
      break;
    case "planning.decomposition.confirm":
    case "planning.decomposition.assess-readiness":
      requireOne("decompositionPlanId", [request.decompositionPlanId]);
      break;
    case "planning.taskqueue.propose":
      requireOne("readinessManifestId", [request.readinessManifestId]);
      break;
    case "planning.goal-loop.evaluate":
      requireOne("changeId", [request.changeId]);
      break;
    case "planning.goal-loop.feedback.evaluate":
      requireOne("changeId", [request.changeId]);
      requireOne("goalLoopNextStepPacketId", [request.goalLoopNextStepPacketId]);
      break;
    case "planning.goal-loop.controller.refresh":
      requireOne("changeId", [request.changeId]);
      requireOne("goalLoopNextStepPacketId", [request.goalLoopNextStepPacketId]);
      requireOne("goalLoopCurrentGateActionType", [request.goalLoopCurrentGateActionType]);
      break;
    case "planning.goal-loop.gate-readiness.prepare":
      requireOne("changeId", [request.changeId]);
      requireOne("goalLoopNextStepPacketId", [request.goalLoopNextStepPacketId]);
      requireOne("goalLoopControllerPolicyId", [request.goalLoopControllerPolicyId]);
      requireOne("goalLoopCurrentGateActionType", [request.goalLoopCurrentGateActionType]);
      break;
    case "planning.goal-loop.controlled-continue.run": {
      requireOne("changeId", [request.changeId]);
      requireOne("goalLoopNextStepPacketId", [request.goalLoopNextStepPacketId]);
      requireOne("goalLoopControllerPolicyId", [request.goalLoopControllerPolicyId]);
      requireOne("goalLoopGateReadinessPreflightId", [request.goalLoopGateReadinessPreflightId]);
      requireOne("goalLoopCurrentGateActionType", [request.goalLoopCurrentGateActionType]);
      const concreteActionType = request.goalLoopCurrentGateActionType;
      if (!concreteActionType || concreteActionType === "planning.scheduler.controlled-step.run" || concreteActionType === "planning.scheduler.controlled-advance.run" || concreteActionType.startsWith("planning.goal-loop.") || !concreteActionType.startsWith("planning.scheduler.")) {
        issues.push({ actionType, label: "planning.scheduler.* concrete gate", message: "planning.goal-loop.controlled-continue.run requires a concrete planning.scheduler.* current gate." });
        break;
      }
      issues.push(...validateWorkflowActionRequiredTargets({
        ...request,
        actionType: concreteActionType,
      }).map((issue) => ({
        ...issue,
        actionType,
        message: `planning.goal-loop.controlled-continue.run concrete gate target is incomplete: ${issue.label}.`,
      })));
      break;
    }
    case "planning.automation.scoped-auto.run": {
      requireOne("changeId", [request.changeId]);
      requireOne("automationCurrentGateActionType or automationCurrentGateApprovalActionId", [request.automationCurrentGateActionType, request.automationCurrentGateApprovalActionId]);
      const concreteActionType = request.automationCurrentGateActionType;
      const concreteApprovalActionId = request.automationCurrentGateApprovalActionId;
      if (concreteActionType && concreteApprovalActionId) {
        issues.push({ actionType, label: "single current visible primary gate", message: "planning.automation.scoped-auto.run requires exactly one current workflow or approval gate." });
        break;
      }
      if (concreteApprovalActionId) {
        requireOne("automationCurrentGateTargetId", [request.automationCurrentGateTargetId]);
        break;
      }
      if (!concreteActionType || concreteActionType === "planning.automation.scoped-auto.run") {
        issues.push({ actionType, label: "current visible primary gate", message: "planning.automation.scoped-auto.run requires the current visible primary gate action type." });
        break;
      }
      issues.push(...validateWorkflowActionRequiredTargets({
        ...request,
        actionType: concreteActionType,
      }).map((issue) => ({
        ...issue,
        actionType,
        message: `planning.automation.scoped-auto.run current gate target is incomplete: ${issue.label}.`,
      })));
      break;
    }
    case "maintenance.canonical-update.decision.record":
      requireOne("maintenanceProposalId", [request.maintenanceProposalId]);
      break;
    case "maintenance.canonical-patch.application-gate.record":
      requireOne("maintenancePatchProposalId", [request.maintenancePatchProposalId]);
      break;
    case "maintenance.canonical-patch.apply":
      requireOne("maintenanceApplicationManifestId", [request.maintenanceApplicationManifestId]);
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
    case "planning.scheduler.controlled-step.run": {
      requireOne("changeId", [request.changeId]);
      requireOne("goalLoopNextStepPacketId", [request.goalLoopNextStepPacketId]);
      requireOne("goalLoopControllerPolicyId", [request.goalLoopControllerPolicyId]);
      requireOne("goalLoopGateReadinessPreflightId", [request.goalLoopGateReadinessPreflightId]);
      requireOne("goalLoopCurrentGateActionType", [request.goalLoopCurrentGateActionType]);
      const concreteActionType = request.goalLoopCurrentGateActionType;
      if (!concreteActionType || concreteActionType === "planning.scheduler.controlled-step.run" || concreteActionType === "planning.scheduler.controlled-advance.run" || concreteActionType.startsWith("planning.goal-loop.") || !concreteActionType.startsWith("planning.scheduler.")) {
        issues.push({ actionType, label: "planning.scheduler.* concrete gate", message: "planning.scheduler.controlled-step.run requires a concrete planning.scheduler.* current gate." });
        break;
      }
      issues.push(...validateWorkflowActionRequiredTargets({
        ...request,
        actionType: concreteActionType,
      }).map((issue) => ({
        ...issue,
        actionType,
        message: `planning.scheduler.controlled-step.run concrete gate target is incomplete: ${issue.label}.`,
      })));
      break;
    }
    case "planning.scheduler.controlled-advance.run": {
      requireOne("changeId", [request.changeId]);
      requireOne("goalLoopCurrentGateActionType", [request.goalLoopCurrentGateActionType]);
      const concreteActionType = request.goalLoopCurrentGateActionType;
      if (!concreteActionType || concreteActionType === "planning.scheduler.controlled-step.run" || concreteActionType === "planning.scheduler.controlled-advance.run" || concreteActionType.startsWith("planning.goal-loop.") || !concreteActionType.startsWith("planning.scheduler.")) {
        issues.push({ actionType, label: "planning.scheduler.* concrete gate", message: "planning.scheduler.controlled-advance.run requires a concrete planning.scheduler.* current gate." });
        break;
      }
      issues.push(...validateWorkflowActionRequiredTargets({
        ...request,
        actionType: concreteActionType,
      }).map((issue) => ({
        ...issue,
        actionType,
        message: `planning.scheduler.controlled-advance.run concrete gate target is incomplete: ${issue.label}.`,
      })));
      break;
    }
    case "planning.scheduler.worker.start-first":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerClaimReservationId", [request.schedulerClaimReservationId]);
      break;
    case "planning.scheduler.worker.start-next":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerClaimReservationId", [request.schedulerClaimReservationId]);
      requireOne("reservationIntentId", [request.reservationIntentId]);
      requireOne("claimIntentId", [request.claimIntentId]);
      break;
    case "planning.scheduler.worker.reconcile-result":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerStartId", [request.schedulerWorkerStartId]);
      break;
    case "planning.scheduler.worker.validate-first":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerResultId", [request.schedulerWorkerResultId]);
      break;
    case "planning.scheduler.worker.audit-first":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerValidationId", [request.schedulerWorkerValidationId]);
      break;
    case "planning.scheduler.worker.rework-plan.compile":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerValidationId", [request.schedulerWorkerValidationId]);
      break;
    case "planning.scheduler.worker.rework-start-first":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerReworkPlanId", [request.schedulerWorkerReworkPlanId]);
      break;
    case "planning.scheduler.worker.rework-reconcile-result":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerReworkStartId", [request.schedulerWorkerReworkStartId]);
      break;
    case "planning.scheduler.worker.rework-validate-first":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerReworkResultId", [request.schedulerWorkerReworkResultId]);
      break;
    case "planning.scheduler.worker.rework-audit-first":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerWorkerReworkValidationId", [request.schedulerWorkerReworkValidationId]);
      break;
    case "planning.scheduler.integration-candidate.compile":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      break;
    case "planning.scheduler.integration-check.run":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerIntegrationCandidateId", [request.schedulerIntegrationCandidateId]);
      break;
    case "planning.scheduler.integration-outcome.reconcile":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerIntegrationCheckHandoffId", [request.schedulerIntegrationCheckHandoffId]);
      break;
    case "planning.scheduler.run.complete":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerIntegrationOutcomeId", [request.schedulerIntegrationOutcomeId]);
      break;
    case "planning.scheduler.run.close-blocked":
      requireOne("schedulerRunId", [request.schedulerRunId]);
      requireOne("schedulerClaimReservationId", [request.schedulerClaimReservationId]);
      requireOne("schedulerIntegrationCandidateId", [request.schedulerIntegrationCandidateId]);
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
    case "result.refresh-rework":
    case "result.revalidate":
    case "result.reaudit":
    case "result.refresh-status":
      requireOne("worktreeId", [request.worktreeId]);
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
  const useReworkStartResult = request.actionType === "planning.scheduler.worker.rework-start-first";
  const useReworkResult = request.actionType === "planning.scheduler.worker.rework-reconcile-result";
  const useReworkValidation = request.actionType === "planning.scheduler.worker.rework-validate-first";
  const useReworkAudit = request.actionType === "planning.scheduler.worker.rework-audit-first";
  return {
    changeId,
    proposalId: request.proposalId,
    planningBundleId: request.planningBundleId,
    decompositionPlanId: request.decompositionPlanId,
    readinessManifestId: request.readinessManifestId ?? extractString(result, "manifest", "id"),
    taskQueueProposalId: request.taskQueueProposalId ?? extractString(result, "proposal", "id"),
    workflowGraphPlanId: request.workflowGraphPlanId ?? extractString(result, "graph", "id"),
    schedulerContractId: request.schedulerContractId ?? extractString(result, "contract", "id") ?? extractString(result, "dryRun", "schedulerContractId") ?? extractString(result, "workerPlan", "schedulerContractId") ?? extractString(result, "claimReconcilePlan", "schedulerContractId") ?? extractString(result, "launchPreflight", "schedulerContractId") ?? extractString(result, "schedulerRun", "schedulerContractId") ?? extractString(result, "runtimeState", "schedulerContractId") ?? extractString(result, "reconcileSnapshot", "schedulerContractId") ?? extractString(result, "claimReservation", "schedulerContractId") ?? extractString(result, "reworkPlan", "schedulerContractId") ?? extractString(result, "result", "schedulerContractId") ?? extractString(result, "schedulerReworkValidation", "schedulerContractId") ?? extractString(result, "schedulerReworkAudit", "schedulerContractId") ?? extractString(result, "candidate", "schedulerContractId") ?? extractString(result, "handoff", "schedulerContractId") ?? extractString(result, "outcome", "schedulerContractId") ?? extractString(result, "completion", "schedulerContractId") ?? extractString(result, "closeout", "schedulerContractId"),
    schedulerDispatchDryRunId: request.schedulerDispatchDryRunId ?? extractString(result, "dryRun", "id") ?? extractString(result, "workerPlan", "schedulerDispatchDryRunId") ?? extractString(result, "claimReconcilePlan", "schedulerDispatchDryRunId") ?? extractString(result, "launchPreflight", "schedulerDispatchDryRunId") ?? extractString(result, "schedulerRun", "schedulerDispatchDryRunId") ?? extractString(result, "reworkPlan", "schedulerDispatchDryRunId") ?? extractString(result, "candidate", "schedulerDispatchDryRunId") ?? extractString(result, "handoff", "schedulerDispatchDryRunId") ?? extractString(result, "outcome", "schedulerDispatchDryRunId") ?? extractString(result, "completion", "schedulerDispatchDryRunId") ?? extractString(result, "closeout", "schedulerDispatchDryRunId"),
    schedulerWorkerPlanId: request.schedulerWorkerPlanId ?? extractString(result, "workerPlan", "id") ?? extractString(result, "claimReconcilePlan", "schedulerWorkerPlanId") ?? extractString(result, "launchPreflight", "schedulerWorkerPlanId") ?? extractString(result, "schedulerRun", "schedulerWorkerPlanId") ?? extractString(result, "reworkPlan", "schedulerWorkerPlanId") ?? extractString(result, "candidate", "schedulerWorkerPlanId") ?? extractString(result, "handoff", "schedulerWorkerPlanId") ?? extractString(result, "outcome", "schedulerWorkerPlanId") ?? extractString(result, "completion", "schedulerWorkerPlanId") ?? extractString(result, "closeout", "schedulerWorkerPlanId"),
    schedulerClaimReconcilePlanId: request.schedulerClaimReconcilePlanId ?? extractString(result, "claimReconcilePlan", "id") ?? extractString(result, "launchPreflight", "schedulerClaimReconcilePlanId") ?? extractString(result, "schedulerRun", "schedulerClaimReconcilePlanId") ?? extractString(result, "reworkPlan", "schedulerClaimReconcilePlanId") ?? extractString(result, "candidate", "schedulerClaimReconcilePlanId") ?? extractString(result, "handoff", "schedulerClaimReconcilePlanId") ?? extractString(result, "outcome", "schedulerClaimReconcilePlanId") ?? extractString(result, "completion", "schedulerClaimReconcilePlanId") ?? extractString(result, "closeout", "schedulerClaimReconcilePlanId"),
    schedulerLaunchPreflightId: request.schedulerLaunchPreflightId ?? extractString(result, "launchPreflight", "id") ?? extractString(result, "schedulerRun", "schedulerLaunchPreflightId") ?? extractString(result, "reworkPlan", "schedulerLaunchPreflightId") ?? extractString(result, "candidate", "schedulerLaunchPreflightId") ?? extractString(result, "handoff", "schedulerLaunchPreflightId") ?? extractString(result, "outcome", "schedulerLaunchPreflightId") ?? extractString(result, "completion", "schedulerLaunchPreflightId") ?? extractString(result, "closeout", "schedulerLaunchPreflightId"),
    schedulerRunId: request.schedulerRunId ?? extractString(result, "schedulerRun", "id") ?? extractString(result, "runtimeState", "schedulerRunId") ?? extractString(result, "reconcileSnapshot", "schedulerRunId") ?? extractString(result, "claimReservation", "schedulerRunId") ?? extractString(result, "reworkPlan", "schedulerRunId") ?? extractString(result, "candidate", "schedulerRunId") ?? extractString(result, "handoff", "schedulerRunId") ?? extractString(result, "outcome", "schedulerRunId") ?? extractString(result, "completion", "schedulerRunId") ?? extractString(result, "closeout", "schedulerRunId"),
    schedulerReconcileSnapshotId: request.schedulerReconcileSnapshotId ?? extractString(result, "reconcileSnapshot", "id") ?? extractString(result, "claimReservation", "schedulerReconcileSnapshotId") ?? extractString(result, "reworkPlan", "schedulerReconcileSnapshotId") ?? extractString(result, "candidate", "schedulerReconcileSnapshotId") ?? extractString(result, "handoff", "schedulerReconcileSnapshotId") ?? extractString(result, "outcome", "schedulerReconcileSnapshotId") ?? extractString(result, "completion", "schedulerReconcileSnapshotId") ?? extractString(result, "closeout", "schedulerReconcileSnapshotId"),
    schedulerClaimReservationId: request.schedulerClaimReservationId ?? extractString(result, "claimReservation", "id") ?? extractString(result, "workerStart", "schedulerClaimReservationId") ?? extractString(result, "result", "schedulerClaimReservationId") ?? extractString(result, "schedulerValidation", "schedulerClaimReservationId") ?? extractString(result, "schedulerAudit", "schedulerClaimReservationId") ?? extractString(result, "reworkPlan", "schedulerClaimReservationId") ?? extractString(result, "candidate", "schedulerClaimReservationId") ?? extractString(result, "handoff", "schedulerClaimReservationId") ?? extractString(result, "outcome", "schedulerClaimReservationId") ?? extractString(result, "completion", "schedulerClaimReservationId") ?? extractString(result, "closeout", "schedulerClaimReservationId"),
    schedulerWorkerStartId: request.schedulerWorkerStartId ?? extractString(result, "workerStart", "id") ?? extractString(result, "result", "schedulerWorkerStartId") ?? extractString(result, "schedulerValidation", "schedulerWorkerStartId") ?? extractString(result, "schedulerAudit", "schedulerWorkerStartId") ?? extractString(result, "reworkPlan", "schedulerWorkerStartId"),
    schedulerWorkerResultId: request.schedulerWorkerResultId ?? extractString(result, "result", "id") ?? extractString(result, "schedulerValidation", "schedulerWorkerResultId") ?? extractString(result, "schedulerAudit", "schedulerWorkerResultId") ?? extractString(result, "reworkPlan", "schedulerWorkerResultId"),
    schedulerWorkerValidationId: request.schedulerWorkerValidationId ?? extractString(result, "schedulerValidation", "id") ?? extractString(result, "schedulerAudit", "schedulerWorkerValidationId") ?? extractString(result, "reworkPlan", "schedulerWorkerValidationId"),
    schedulerWorkerAuditId: request.schedulerWorkerAuditId ?? extractString(result, "schedulerAudit", "id") ?? extractString(result, "reworkPlan", "schedulerWorkerAuditId"),
    schedulerWorkerReworkPlanId: request.schedulerWorkerReworkPlanId ?? extractString(result, "reworkPlan", "id") ?? extractString(result, "reworkStart", "schedulerWorkerReworkPlanId") ?? extractString(result, "result", "schedulerWorkerReworkPlanId"),
    schedulerWorkerReworkStartId: request.schedulerWorkerReworkStartId ?? extractString(result, "reworkStart", "id") ?? extractString(result, "result", "schedulerWorkerReworkStartId"),
    schedulerWorkerReworkResultId: request.schedulerWorkerReworkResultId ?? extractString(result, "result", "id") ?? extractString(result, "schedulerReworkValidation", "schedulerWorkerReworkResultId"),
    schedulerWorkerReworkValidationId: request.schedulerWorkerReworkValidationId ?? extractString(result, "schedulerReworkValidation", "id") ?? extractString(result, "schedulerReworkAudit", "schedulerWorkerReworkValidationId"),
    schedulerWorkerReworkAuditId: request.schedulerWorkerReworkAuditId ?? extractString(result, "schedulerReworkAudit", "id"),
    schedulerIntegrationCandidateId: request.schedulerIntegrationCandidateId ?? extractString(result, "candidate", "id") ?? extractString(result, "handoff", "schedulerIntegrationCandidateId") ?? extractString(result, "completion", "schedulerIntegrationCandidateId") ?? extractString(result, "closeout", "schedulerIntegrationCandidateId"),
    schedulerIntegrationCheckHandoffId: request.schedulerIntegrationCheckHandoffId ?? extractString(result, "handoff", "id") ?? extractString(result, "outcome", "schedulerIntegrationCheckHandoffId") ?? extractString(result, "completion", "schedulerIntegrationCheckHandoffId"),
    schedulerIntegrationOutcomeId: request.schedulerIntegrationOutcomeId ?? extractString(result, "outcome", "id") ?? extractString(result, "completion", "schedulerIntegrationOutcomeId"),
    schedulerRunCompletionId: request.schedulerRunCompletionId ?? extractString(result, "completion", "id"),
    schedulerRunBlockedCloseoutId: request.schedulerRunBlockedCloseoutId ?? extractString(result, "closeout", "id"),
    goalLoopDecisionId: request.goalLoopDecisionId ?? extractString(result, "goalLoopDecision", "id") ?? extractString(result, "goalLoopIteration", "goalLoopDecisionId") ?? extractString(result, "goalLoopContinuationBrief", "sourceGoalLoopDecisionId") ?? extractString(result, "goalLoopNextStepPacket", "sourceGoalLoopDecisionId"),
    goalLoopIterationId: request.goalLoopIterationId ?? extractString(result, "goalLoopIteration", "id") ?? extractString(result, "goalLoopNextStepPacket", "sourceGoalLoopIterationId"),
    goalLoopContinuationBriefId: request.goalLoopContinuationBriefId ?? extractString(result, "goalLoopContinuationBrief", "id") ?? extractString(result, "goalLoopNextStepPacket", "sourceGoalLoopContinuationBriefId"),
    goalLoopNextStepPacketId: request.goalLoopNextStepPacketId ?? extractString(result, "goalLoopNextStepPacket", "id") ?? extractString(result, "goalLoopFeedback", "sourceGoalLoopNextStepPacketId") ?? extractString(result, "goalLoopControllerPolicy", "sourceGoalLoopNextStepPacketId") ?? extractString(result, "goalLoopGateReadinessPreflight", "sourceGoalLoopNextStepPacketId"),
    goalLoopFeedbackId: request.goalLoopFeedbackId ?? extractString(result, "goalLoopFeedback", "id"),
    goalLoopControllerPolicyId: request.goalLoopControllerPolicyId ?? extractString(result, "goalLoopControllerPolicy", "id") ?? extractString(result, "goalLoopGateReadinessPreflight", "sourceGoalLoopControllerPolicyId"),
    goalLoopGateReadinessPreflightId: request.goalLoopGateReadinessPreflightId ?? extractString(result, "goalLoopGateReadinessPreflight", "id"),
    goalLoopCurrentGateActionType: request.goalLoopCurrentGateActionType,
    goalLoopRuntimeAuthorizationId: request.goalLoopRuntimeAuthorizationId ?? extractString(result, "authorization", "id"),
    goalLoopRuntimeRunId: request.goalLoopRuntimeRunId ?? extractString(result, "runtimeRun", "id"),
    automationMode: request.automationMode,
    automationCurrentGateActionType: request.automationCurrentGateActionType,
    automationCurrentGateApprovalActionId: request.automationCurrentGateApprovalActionId,
    automationCurrentGateTargetId: request.automationCurrentGateTargetId,
    automationCurrentGateRunId: request.automationCurrentGateRunId,
    automationCurrentGateArtifact: request.automationCurrentGateArtifact,
    automationAuthorizationId: request.automationAuthorizationId ?? extractString(result, "authorization", "id"),
    automationRunId: request.automationRunId ?? extractString(result, "automationRun", "id"),
    maxSteps: request.maxSteps,
    maintenanceProposalId: request.maintenanceProposalId ?? extractString(result, "decision", "proposalId"),
    maintenancePatchProposalId: request.maintenancePatchProposalId ?? extractString(result, "gateRecord", "patchProposalId") ?? extractString(result, "applicationResult", "patchProposalId"),
    maintenanceApplicationManifestId: request.maintenanceApplicationManifestId ?? extractString(result, "applicationResult", "manifestId"),
    reservationIntentId: request.reservationIntentId ?? extractString(result, "workerStart", "reservationIntentId") ?? extractString(result, "result", "reservationIntentId") ?? extractString(result, "schedulerValidation", "reservationIntentId") ?? extractString(result, "schedulerAudit", "reservationIntentId") ?? extractString(result, "reworkPlan", "reservationIntentId"),
    claimIntentId: request.claimIntentId ?? extractString(result, "workerStart", "claimIntentId") ?? extractString(result, "result", "claimIntentId") ?? extractString(result, "schedulerValidation", "claimIntentId") ?? extractString(result, "schedulerAudit", "claimIntentId") ?? extractString(result, "reworkPlan", "claimIntentId"),
    workflowRunId: request.workflowRunId ?? extractString(result, "workflowRun", "id") ?? extractString(result, "workflow", "id"),
    queueRunId: request.queueRunId,
    worktreeId: useReworkStartResult || useReworkResult || useReworkValidation || useReworkAudit ? (extractString(result, "result", "worktreeId") ?? extractString(result, "schedulerReworkValidation", "worktreeId") ?? extractString(result, "schedulerReworkAudit", "worktreeId") ?? extractString(result, "reworkStart", "worktreeId") ?? request.worktreeId) : (request.worktreeId ?? extractString(result, "reworkPlan", "targetWorktreeId") ?? extractString(result, "reworkStart", "worktreeId")),
    worktreeIds: request.worktreeIds,
    applyCheckId: request.applyCheckId ?? extractString(result, "handoff", "integrationCheckId") ?? extractString(result, "outcome", "integrationCheckId") ?? extractString(result, "completion", "integrationCheckId"),
    landingPackageId: request.landingPackageId,
    remoteLandingResultId: request.remoteLandingResultId,
    taskRunId: useReworkStartResult || useReworkResult || useReworkValidation || useReworkAudit ? (extractString(result, "result", "reworkTaskRunId") ?? extractString(result, "schedulerReworkValidation", "reworkTaskRunId") ?? extractString(result, "schedulerReworkAudit", "reworkTaskRunId") ?? extractString(result, "reworkStart", "reworkTaskRunId") ?? request.taskRunId) : (request.taskRunId ?? extractString(result, "taskRun", "id") ?? extractString(result, "result", "taskRunId") ?? extractString(result, "schedulerValidation", "taskRunId") ?? extractString(result, "schedulerAudit", "taskRunId") ?? extractString(result, "reworkPlan", "taskRunId") ?? extractString(result, "reworkStart", "reworkTaskRunId")),
    workerLeaseId: useReworkStartResult || useReworkResult || useReworkValidation || useReworkAudit ? (extractString(result, "result", "reworkWorkerLeaseId") ?? extractString(result, "schedulerReworkValidation", "reworkWorkerLeaseId") ?? extractString(result, "schedulerReworkAudit", "reworkWorkerLeaseId") ?? extractString(result, "reworkStart", "reworkWorkerLeaseId") ?? request.workerLeaseId) : (request.workerLeaseId ?? extractString(result, "lease", "id") ?? extractString(result, "result", "workerLeaseId") ?? extractString(result, "schedulerValidation", "workerLeaseId") ?? extractString(result, "schedulerAudit", "workerLeaseId") ?? extractString(result, "reworkPlan", "workerLeaseId") ?? extractString(result, "reworkStart", "reworkWorkerLeaseId")),
    runId: useReworkStartResult || useReworkResult || useReworkValidation || useReworkAudit ? (extractString(result, "result", "reworkRunId") ?? extractString(result, "schedulerReworkValidation", "reworkRunId") ?? extractString(result, "schedulerReworkAudit", "reworkRunId") ?? extractString(result, "reworkStart", "reworkRunId") ?? extractString(result, "codeRun", "id") ?? request.runId) : (request.runId ?? extractString(result, "codeRun", "id") ?? extractString(result, "result", "runId") ?? extractString(result, "schedulerValidation", "codeRunId") ?? extractString(result, "schedulerAudit", "codeRunId") ?? extractString(result, "reworkPlan", "targetCodeRunId") ?? extractString(result, "reworkStart", "reworkRunId")),
    validationRunId: request.validationRunId ?? extractString(result, "validationRun", "id") ?? extractString(result, "schedulerValidation", "validationRunId") ?? extractString(result, "schedulerAudit", "validationRunId") ?? extractString(result, "reworkPlan", "validationRunId") ?? extractString(result, "schedulerReworkValidation", "validationRunId") ?? extractString(result, "schedulerReworkAudit", "validationRunId"),
    reworkValidationRunId: request.reworkValidationRunId ?? extractString(result, "validationRun", "id") ?? extractString(result, "schedulerReworkValidation", "validationRunId") ?? extractString(result, "schedulerReworkAudit", "validationRunId"),
    auditRunId: request.auditRunId ?? extractString(result, "auditRun", "id") ?? extractString(result, "schedulerAudit", "auditRunId") ?? extractString(result, "reworkPlan", "auditRunId") ?? extractString(result, "schedulerReworkAudit", "auditRunId"),
    reworkAuditRunId: request.reworkAuditRunId ?? extractString(result, "auditRun", "id") ?? extractString(result, "schedulerReworkAudit", "auditRunId"),
    taskIds: request.taskIds,
  };
}

export function workflowActionTargetId(request: WorkflowActionScopeCarrier, changeId: string, result?: unknown): string {
  if (request.actionType === "planning.scheduler.controlled-step.run") {
    return request.goalLoopGateReadinessPreflightId
      ?? extractString(result, "controlledStep", "goalLoopGateReadinessPreflightId")
      ?? request.goalLoopControllerPolicyId
      ?? extractString(result, "controlledStep", "goalLoopControllerPolicyId")
      ?? request.goalLoopNextStepPacketId
      ?? extractString(result, "controlledStep", "goalLoopNextStepPacketId")
      ?? request.schedulerClaimReservationId
      ?? request.schedulerRunId
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.controlled-advance.run") {
    return extractString(result, "goalLoopGateReadinessPreflight", "id")
      ?? extractString(result, "controlledAdvance", "goalLoopGateReadinessPreflightId")
      ?? extractString(result, "goalLoopControllerPolicy", "id")
      ?? extractString(result, "controlledAdvance", "goalLoopControllerPolicyId")
      ?? extractString(result, "goalLoopNextStepPacket", "id")
      ?? extractString(result, "controlledAdvance", "goalLoopNextStepPacketId")
      ?? request.schedulerClaimReservationId
      ?? request.schedulerRunId
      ?? changeId;
  }
  if (request.actionType === "planning.goal-loop.controlled-continue.run") {
    return extractString(result, "runtimeRun", "id")
      ?? extractString(result, "authorization", "id")
      ?? request.goalLoopGateReadinessPreflightId
      ?? request.goalLoopControllerPolicyId
      ?? request.goalLoopNextStepPacketId
      ?? changeId;
  }
  if (request.actionType === "planning.automation.scoped-auto.run") {
    return extractString(result, "automationRun", "id")
      ?? extractString(result, "authorization", "id")
      ?? request.automationCurrentGateTargetId
      ?? request.automationCurrentGateApprovalActionId
      ?? request.automationCurrentGateActionType
      ?? changeId;
  }
  if (request.actionType === "planning.goal-loop.evaluate" || request.actionType === "planning.goal-loop.feedback.evaluate" || request.actionType === "planning.goal-loop.controller.refresh" || request.actionType === "planning.goal-loop.gate-readiness.prepare") {
    if (request.actionType === "planning.goal-loop.gate-readiness.prepare") {
      return request.goalLoopGateReadinessPreflightId
        ?? extractString(result, "goalLoopGateReadinessPreflight", "id")
        ?? request.goalLoopControllerPolicyId
        ?? extractString(result, "goalLoopGateReadinessPreflight", "sourceGoalLoopControllerPolicyId")
        ?? request.goalLoopNextStepPacketId
        ?? extractString(result, "goalLoopGateReadinessPreflight", "sourceGoalLoopNextStepPacketId")
        ?? changeId;
    }
    if (request.actionType === "planning.goal-loop.controller.refresh") {
      return request.goalLoopControllerPolicyId
        ?? extractString(result, "goalLoopControllerPolicy", "id")
        ?? request.goalLoopNextStepPacketId
        ?? extractString(result, "goalLoopControllerPolicy", "sourceGoalLoopNextStepPacketId")
        ?? changeId;
    }
    if (request.actionType === "planning.goal-loop.feedback.evaluate") {
      return request.goalLoopFeedbackId
        ?? extractString(result, "goalLoopFeedback", "id")
        ?? request.goalLoopNextStepPacketId
        ?? extractString(result, "goalLoopFeedback", "sourceGoalLoopNextStepPacketId")
        ?? changeId;
    }
    return request.goalLoopNextStepPacketId
      ?? extractString(result, "goalLoopNextStepPacket", "id")
      ?? request.goalLoopContinuationBriefId
      ?? extractString(result, "goalLoopContinuationBrief", "id")
      ?? request.goalLoopIterationId
      ?? extractString(result, "goalLoopIteration", "id")
      ?? request.goalLoopDecisionId
      ?? extractString(result, "goalLoopDecision", "id")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.reconcile-result") {
    return request.schedulerWorkerResultId
      ?? extractString(result, "result", "id")
      ?? request.schedulerWorkerStartId
      ?? extractString(result, "workerStart", "id")
      ?? extractString(result, "result", "schedulerWorkerStartId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.validate-first") {
    return request.schedulerWorkerValidationId
      ?? extractString(result, "schedulerValidation", "id")
      ?? request.schedulerWorkerResultId
      ?? extractString(result, "schedulerValidation", "schedulerWorkerResultId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.audit-first") {
    return request.schedulerWorkerAuditId
      ?? extractString(result, "schedulerAudit", "id")
      ?? request.schedulerWorkerValidationId
      ?? extractString(result, "schedulerAudit", "schedulerWorkerValidationId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.rework-plan.compile") {
    return request.schedulerWorkerReworkPlanId
      ?? extractString(result, "reworkPlan", "id")
      ?? request.schedulerWorkerAuditId
      ?? extractString(result, "reworkPlan", "schedulerWorkerAuditId")
      ?? request.schedulerWorkerValidationId
      ?? extractString(result, "reworkPlan", "schedulerWorkerValidationId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.rework-start-first") {
    return request.schedulerWorkerReworkStartId
      ?? extractString(result, "reworkStart", "id")
      ?? request.schedulerWorkerReworkPlanId
      ?? extractString(result, "reworkStart", "schedulerWorkerReworkPlanId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.rework-reconcile-result") {
    return request.schedulerWorkerReworkResultId
      ?? extractString(result, "result", "id")
      ?? request.schedulerWorkerReworkStartId
      ?? extractString(result, "reworkStart", "id")
      ?? extractString(result, "result", "schedulerWorkerReworkStartId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.rework-validate-first") {
    return request.schedulerWorkerReworkValidationId
      ?? extractString(result, "schedulerReworkValidation", "id")
      ?? request.schedulerWorkerReworkResultId
      ?? extractString(result, "schedulerReworkValidation", "schedulerWorkerReworkResultId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.worker.rework-audit-first") {
    return request.schedulerWorkerReworkAuditId
      ?? extractString(result, "schedulerReworkAudit", "id")
      ?? request.schedulerWorkerReworkValidationId
      ?? extractString(result, "schedulerReworkAudit", "schedulerWorkerReworkValidationId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.integration-candidate.compile") {
    return request.schedulerIntegrationCandidateId
      ?? extractString(result, "candidate", "id")
      ?? request.schedulerRunId
      ?? extractString(result, "candidate", "schedulerRunId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.integration-check.run") {
    return request.schedulerIntegrationCheckHandoffId
      ?? extractString(result, "handoff", "id")
      ?? request.schedulerIntegrationCandidateId
      ?? extractString(result, "handoff", "schedulerIntegrationCandidateId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.integration-outcome.reconcile") {
    return request.schedulerIntegrationOutcomeId
      ?? extractString(result, "outcome", "id")
      ?? request.schedulerIntegrationCheckHandoffId
      ?? extractString(result, "outcome", "schedulerIntegrationCheckHandoffId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.run.complete") {
    return request.schedulerRunCompletionId
      ?? extractString(result, "completion", "id")
      ?? request.schedulerIntegrationOutcomeId
      ?? extractString(result, "completion", "schedulerIntegrationOutcomeId")
      ?? changeId;
  }
  if (request.actionType === "planning.scheduler.run.close-blocked") {
    return request.schedulerRunBlockedCloseoutId
      ?? extractString(result, "closeout", "id")
      ?? request.schedulerIntegrationCandidateId
      ?? extractString(result, "closeout", "schedulerIntegrationCandidateId")
      ?? changeId;
  }
  return request.remoteLandingResultId
    ?? request.maintenanceApplicationManifestId
    ?? extractString(result, "applicationResult", "manifestId")
    ?? request.maintenancePatchProposalId
    ?? extractString(result, "gateRecord", "patchProposalId")
    ?? request.maintenanceProposalId
    ?? extractString(result, "decision", "proposalId")
    ?? request.landingPackageId
    ?? request.applyCheckId
    ?? request.worktreeId
    ?? request.worktreeIds?.join(",")
    ?? request.workflowRunId
    ?? request.workflowGraphPlanId
    ?? extractString(result, "graph", "id")
    ?? request.schedulerClaimReservationId
    ?? request.reservationIntentId
    ?? extractString(result, "workerStart", "reservationIntentId")
    ?? extractString(result, "claimReservation", "id")
    ?? extractString(result, "workerStart", "schedulerClaimReservationId")
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
    && sameStrictOptional(left.schedulerWorkerStartId, right.schedulerWorkerStartId)
    && sameStrictOptional(left.schedulerWorkerResultId, right.schedulerWorkerResultId)
    && sameStrictOptional(left.schedulerWorkerValidationId, right.schedulerWorkerValidationId)
    && sameStrictOptional(left.schedulerWorkerAuditId, right.schedulerWorkerAuditId)
    && sameSchedulerWorkerReworkPlanStrict(left, right)
    && sameStrictOptional(left.schedulerWorkerReworkStartId, right.schedulerWorkerReworkStartId)
    && sameStrictOptional(left.schedulerWorkerReworkResultId, right.schedulerWorkerReworkResultId)
    && sameStrictOptional(left.schedulerWorkerReworkValidationId, right.schedulerWorkerReworkValidationId)
    && sameStrictOptional(left.schedulerWorkerReworkAuditId, right.schedulerWorkerReworkAuditId)
    && sameStrictOptional(left.schedulerIntegrationCandidateId, right.schedulerIntegrationCandidateId)
    && sameStrictOptional(left.schedulerIntegrationCheckHandoffId, right.schedulerIntegrationCheckHandoffId)
    && sameStrictOptional(left.schedulerIntegrationOutcomeId, right.schedulerIntegrationOutcomeId)
    && sameStrictOptional(left.schedulerRunCompletionId, right.schedulerRunCompletionId)
    && sameStrictOptional(left.schedulerRunBlockedCloseoutId, right.schedulerRunBlockedCloseoutId)
    && sameStrictOptional(left.goalLoopDecisionId, right.goalLoopDecisionId)
    && sameStrictOptional(left.goalLoopIterationId, right.goalLoopIterationId)
    && sameStrictOptional(left.goalLoopContinuationBriefId, right.goalLoopContinuationBriefId)
    && sameStrictOptional(left.goalLoopNextStepPacketId, right.goalLoopNextStepPacketId)
    && sameStrictOptional(left.goalLoopFeedbackId, right.goalLoopFeedbackId)
    && sameStrictOptional(left.goalLoopControllerPolicyId, right.goalLoopControllerPolicyId)
    && sameStrictOptional(left.goalLoopGateReadinessPreflightId, right.goalLoopGateReadinessPreflightId)
    && sameStrictOptional(left.goalLoopCurrentGateActionType, right.goalLoopCurrentGateActionType)
    && sameStrictOptional(left.maintenanceProposalId, right.maintenanceProposalId)
    && sameStrictOptional(left.maintenancePatchProposalId, right.maintenancePatchProposalId)
    && sameStrictOptional(left.maintenanceApplicationManifestId, right.maintenanceApplicationManifestId)
    && sameStrictOptional(left.reservationIntentId, right.reservationIntentId)
    && sameStrictOptional(left.claimIntentId, right.claimIntentId)
    && sameStrictOptional(left.workflowRunId, right.workflowRunId)
    && sameStrictOptional(left.queueRunId, right.queueRunId)
    && sameStrictOptional(left.worktreeId, right.worktreeId)
    && sameStrictOptionalArray(left.worktreeIds, right.worktreeIds)
    && sameStrictOptional(left.applyCheckId, right.applyCheckId)
    && sameStrictOptional(left.landingPackageId, right.landingPackageId)
    && sameStrictOptional(left.remoteLandingResultId, right.remoteLandingResultId)
    && sameStrictOptional(left.taskRunId, right.taskRunId)
    && sameStrictOptional(left.workerLeaseId, right.workerLeaseId)
    && sameStrictOptional(left.runId, right.runId)
    && sameStrictOptional(left.validationRunId, right.validationRunId)
    && sameStrictOptional(left.reworkValidationRunId, right.reworkValidationRunId)
    && sameStrictOptional(left.auditRunId, right.auditRunId)
    && sameStrictOptional(left.reworkAuditRunId, right.reworkAuditRunId)
    && sameStrictOptionalArray(left.taskIds, right.taskIds);
}

function sameSchedulerWorkerReworkPlanStrict(left: WorkflowActionScopeCarrier, right: WorkflowActionScopeCarrier): boolean {
  if (left.actionType === "planning.scheduler.worker.rework-plan.compile" && right.actionType === "planning.scheduler.worker.rework-plan.compile" && right.schedulerWorkerReworkPlanId === undefined) {
    return true;
  }
  return sameStrictOptional(left.schedulerWorkerReworkPlanId, right.schedulerWorkerReworkPlanId);
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
    && sameCompatibleOptional(left.schedulerWorkerStartId, right.schedulerWorkerStartId)
    && sameCompatibleOptional(left.schedulerWorkerResultId, right.schedulerWorkerResultId)
    && sameCompatibleOptional(left.schedulerWorkerValidationId, right.schedulerWorkerValidationId)
    && sameCompatibleOptional(left.schedulerWorkerAuditId, right.schedulerWorkerAuditId)
    && sameCompatibleOptional(left.schedulerWorkerReworkPlanId, right.schedulerWorkerReworkPlanId)
    && sameCompatibleOptional(left.schedulerWorkerReworkStartId, right.schedulerWorkerReworkStartId)
    && sameCompatibleOptional(left.schedulerWorkerReworkResultId, right.schedulerWorkerReworkResultId)
    && sameCompatibleOptional(left.schedulerWorkerReworkValidationId, right.schedulerWorkerReworkValidationId)
    && sameCompatibleOptional(left.schedulerWorkerReworkAuditId, right.schedulerWorkerReworkAuditId)
    && sameCompatibleOptional(left.schedulerIntegrationCandidateId, right.schedulerIntegrationCandidateId)
    && sameCompatibleOptional(left.schedulerIntegrationCheckHandoffId, right.schedulerIntegrationCheckHandoffId)
    && sameCompatibleOptional(left.schedulerIntegrationOutcomeId, right.schedulerIntegrationOutcomeId)
    && sameCompatibleOptional(left.schedulerRunCompletionId, right.schedulerRunCompletionId)
    && sameCompatibleOptional(left.schedulerRunBlockedCloseoutId, right.schedulerRunBlockedCloseoutId)
    && sameCompatibleOptional(left.goalLoopDecisionId, right.goalLoopDecisionId)
    && sameCompatibleOptional(left.goalLoopIterationId, right.goalLoopIterationId)
    && sameCompatibleOptional(left.goalLoopContinuationBriefId, right.goalLoopContinuationBriefId)
    && sameCompatibleOptional(left.goalLoopNextStepPacketId, right.goalLoopNextStepPacketId)
    && sameCompatibleOptional(left.goalLoopFeedbackId, right.goalLoopFeedbackId)
    && sameCompatibleOptional(left.goalLoopControllerPolicyId, right.goalLoopControllerPolicyId)
    && sameCompatibleOptional(left.goalLoopGateReadinessPreflightId, right.goalLoopGateReadinessPreflightId)
    && sameCompatibleOptional(left.goalLoopCurrentGateActionType, right.goalLoopCurrentGateActionType)
    && sameCompatibleOptional(left.maintenanceProposalId, right.maintenanceProposalId)
    && sameCompatibleOptional(left.maintenancePatchProposalId, right.maintenancePatchProposalId)
    && sameCompatibleOptional(left.maintenanceApplicationManifestId, right.maintenanceApplicationManifestId)
    && sameCompatibleOptional(left.reservationIntentId, right.reservationIntentId)
    && sameCompatibleOptional(left.claimIntentId, right.claimIntentId)
    && sameCompatibleOptional(left.workflowRunId, right.workflowRunId)
    && sameCompatibleOptional(left.queueRunId, right.queueRunId)
    && sameCompatibleOptional(left.worktreeId, right.worktreeId)
    && sameCompatibleOptionalArray(left.worktreeIds, right.worktreeIds)
    && sameCompatibleOptional(left.applyCheckId, right.applyCheckId)
    && sameCompatibleOptional(left.landingPackageId, right.landingPackageId)
    && sameCompatibleOptional(left.remoteLandingResultId, right.remoteLandingResultId)
    && sameCompatibleOptional(left.taskRunId, right.taskRunId)
    && sameCompatibleOptional(left.workerLeaseId, right.workerLeaseId)
    && sameCompatibleOptional(left.runId, right.runId)
    && sameCompatibleOptional(left.validationRunId, right.validationRunId)
    && sameCompatibleOptional(left.reworkValidationRunId, right.reworkValidationRunId)
    && sameCompatibleOptional(left.auditRunId, right.auditRunId)
    && sameCompatibleOptional(left.reworkAuditRunId, right.reworkAuditRunId)
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
