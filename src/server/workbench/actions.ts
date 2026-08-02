import { abandonChangeForChange } from "../../change/manager.js";
import type { ManagedProject } from "../../types/index.js";
import { resumeNativeGoalAfterAction, runWorkbenchWorkflowAction } from "../../workbench/workflow-conversation-bridge.js";
import { postConversationMessage } from "../../workbench/conversation-service.js";
import { runProjectScopedMainAgentTurn } from "../../workbench/main-agent-turn-coordinator.js";
import { recordWorkbenchDecision } from "../../workbench/decisions.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/projections/read-model/implementation.js";
import { assertCurrentWorkflowAction } from "./action-revalidation.js";
import {
  allowedActionIds,
  inferArtifactFromActionResult,
  inferChangeIdFromAction,
  inferRunIdFromActionResult,
  inferTargetIdFromAction,
  runAllowlistedAction,
} from "./approval-actions.js";
import { resolveFeedbackRouteFromPrimary, resolveLegacyFeedbackRoute, type FeedbackRoute, type FeedbackSnapshotPrimary } from "./feedback-routing.js";
import type { WorkbenchActionRequest } from "./types.js";

const workflowConversationPorts = {
  postConversationMessage,
  continueMainAgentTurn: runProjectScopedMainAgentTurn,
};

export async function executeWorkbenchAction(input: WorkbenchProjectInput, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  if (!input.project) throw new Error("Workbench actions require a registered project.");
  if (body.abandon) {
    return executeAbandonAction(input as WorkbenchProjectInput & { project: ManagedProject }, body);
  }
  if (body.actionType) {
    return executeWorkflowAction(input as WorkbenchProjectInput & { project: ManagedProject }, body);
  }
  return executeApprovalOrFeedbackAction(input as WorkbenchProjectInput & { project: ManagedProject }, body);
}

async function executeAbandonAction(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  if (body.confirm !== true) {
    const error = new Error("Abandoning a demand conversation requires confirm: true.");
    error.name = "Conflict";
    throw error;
  }
  const changeId = body.abandon?.changeId ?? body.feedbackContext?.changeId ?? null;
  await recordWorkbenchDecision(input.project, {
    id: `abandon:${changeId ?? "active"}:${Date.now()}`,
    changeId,
    decisionType: "workpad.abandon",
    status: "dismissed",
    label: "放弃这个需求对话",
    summary: "User abandoned this demand conversation. Source code was not changed by this action.",
    targetId: changeId,
    runId: null,
    artifact: null,
    actionId: "workpad.abandon",
    feedback: body.abandon?.reason ?? body.feedback ?? null,
    payload: body.abandon,
    completedAt: new Date().toISOString(),
  });
  if (!changeId) {
    const error = new Error("Abandoning a demand conversation requires an explicit changeId.");
    error.name = "BadRequest";
    throw error;
  }
  const result = await abandonChangeForChange(input.project, changeId, body.abandon?.reason ?? body.feedback);
  return { result, snapshot: await getWorkbenchSnapshot(input) };
}

async function executeWorkflowAction(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  const actionType = body.actionType;
  if (!actionType) {
    const error = new Error("Unknown or unsupported Workbench action.");
    error.name = "BadRequest";
    throw error;
  }
  if (actionType !== "chat.ask" && body.confirm !== true) {
    const error = new Error("Mutating Workbench workflow actions require confirm: true.");
    error.name = "Conflict";
    throw error;
  }
  await assertCurrentWorkflowAction(input, body, { getWorkbenchSnapshot });
  const result = await runWorkbenchWorkflowAction(input.project, {
    actionType,
    changeId: body.changeId,
    prompt: body.prompt,
    feedback: body.feedback,
    proposalId: body.proposalId,
    workflowGraphPlanId: body.workflowGraphPlanId,
    schedulerContractId: body.schedulerContractId,
    schedulerDispatchDryRunId: body.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: body.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: body.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: body.schedulerLaunchPreflightId,
    schedulerRunId: body.schedulerRunId,
    schedulerReconcileSnapshotId: body.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: body.schedulerClaimReservationId,
    schedulerIntegrationCandidateId: body.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: body.schedulerIntegrationCheckHandoffId,
    schedulerIntegrationOutcomeId: body.schedulerIntegrationOutcomeId,
    schedulerRunCompletionId: body.schedulerRunCompletionId,
    schedulerRunBlockedCloseoutId: body.schedulerRunBlockedCloseoutId,
    schedulerWorkerStartId: body.schedulerWorkerStartId,
    schedulerWorkerResultId: body.schedulerWorkerResultId,
    schedulerWorkerValidationId: body.schedulerWorkerValidationId,
    schedulerWorkerAuditId: body.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: body.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: body.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: body.schedulerWorkerReworkResultId,
    schedulerWorkerReworkValidationId: body.schedulerWorkerReworkValidationId,
    schedulerWorkerReworkAuditId: body.schedulerWorkerReworkAuditId,
    reservationIntentId: body.reservationIntentId,
    claimIntentId: body.claimIntentId,
    workflowRunId: body.workflowRunId,
    queueRunId: body.queueRunId,
    worktreeId: body.worktreeId,
    worktreeIds: body.worktreeIds,
    applyCheckId: body.applyCheckId,
    landingPackageId: body.landingPackageId,
    remoteLandingResultId: body.remoteLandingResultId,
    taskIds: body.taskIds,
    taskRunId: body.taskRunId,
    workerLeaseId: body.workerLeaseId,
    runId: body.runId,
    validationRunId: body.validationRunId,
    reworkValidationRunId: body.reworkValidationRunId,
    auditRunId: body.auditRunId,
  }, undefined, workflowConversationPorts);
  return { result, snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId }) };
}

async function executeApprovalOrFeedbackAction(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  const action = body.action;
  if ((!action || !allowedActionIds.has(action.actionId)) && !(typeof body.feedback === "string" && body.feedback.trim())) {
    const error = new Error("Unknown or unsupported Workbench action.");
    error.name = "BadRequest";
    throw error;
  }
  if (typeof body.feedback === "string" && body.feedback.trim()) {
    const route = await resolveWorkbenchFeedbackRoute(input, body);
    const feedbackChangeId = route.changeId ?? (action ? inferChangeIdFromAction(action, null) : null);
    await recordWorkbenchDecision(input.project, {
      id: `feedback:${body.feedbackContext?.contextId ?? action?.actionId ?? route.actionId ?? "scoped"}:${action?.args.join(":") ?? route.targetId ?? "target"}:${Date.now()}`,
      changeId: feedbackChangeId,
      decisionType: route.decisionType,
      status: "requested-changes",
      label: `Requested changes: ${route.label}`,
      summary: route.summary,
      targetId: route.targetId ?? (action ? inferTargetIdFromAction(action, null) : null),
      runId: route.runId,
      artifact: route.artifact,
      actionId: route.actionId,
      feedback: body.feedback.trim(),
      payload: { action, feedback: body.feedback.trim(), context: body.feedbackContext ?? {}, route },
    });
    if (route.workflowRequest) {
      const routed = await runWorkbenchWorkflowAction(
        input.project,
        route.workflowRequest,
        undefined,
        workflowConversationPorts,
      );
      return {
        result: { status: "requested-changes", routedTo: route.workflowRequest.actionType, result: routed },
        snapshot: await getWorkbenchSnapshot(input, { topicId: route.workflowRequest.changeId }),
      };
    }
    return { result: { status: "requested-changes", routedTo: "record-only" }, snapshot: await getWorkbenchSnapshot(input, { topicId: feedbackChangeId ?? undefined }) };
  }
  if (!action) {
    const error = new Error("Unknown or unsupported Workbench action.");
    error.name = "BadRequest";
    throw error;
  }
  if (action.mutates && body.confirm !== true) {
    const error = new Error("Mutating Workbench actions require confirm: true.");
    error.name = "Conflict";
    throw error;
  }
  const result = await runAllowlistedAction(input.project, action, body.options);
  const decisionId = `approval:${action.actionId}:${action.args.join(":")}`;
  const changeId = inferChangeIdFromAction(action, result);
  await recordWorkbenchDecision(input.project, {
    id: decisionId,
    changeId,
    decisionType: action.actionId,
    status: "accepted",
    label: action.label,
    summary: `Accepted ${action.label}.`,
    targetId: inferTargetIdFromAction(action, result),
    runId: inferRunIdFromActionResult(result),
    artifact: inferArtifactFromActionResult(result),
    actionId: action.actionId,
    feedback: body.feedback ?? null,
    payload: result,
    completedAt: new Date().toISOString(),
  });
  if (action.actionId === "result.apply" && changeId && isCommittedApplyResult(result)) {
    await resumeNativeGoalAfterAction({
      project: input.project,
      changeId,
      actionRunId: decisionId,
      actionType: "result.apply",
      status: "completed",
      result,
    }, workflowConversationPorts);
  }
  return { result, snapshot: await getWorkbenchSnapshot(input) };
}

function isCommittedApplyResult(result: unknown): boolean {
  return Boolean(result && typeof result === "object"
    && "apply" in result
    && result.apply && typeof result.apply === "object"
    && "status" in result.apply && result.apply.status === "applied"
    && "committed" in result.apply && result.apply.committed === true);
}

type FeedbackSnapshot = {
  right?: {
    confirmationQueue?: {
      primary?: FeedbackSnapshotPrimary | null;
    };
  };
};

async function resolveWorkbenchFeedbackRoute(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<FeedbackRoute> {
  const feedback = body.feedback?.trim();
  if (!feedback) {
    const error = new Error("Feedback action requires feedback text.");
    error.name = "BadRequest";
    throw error;
  }
  const snapshot = await getWorkbenchSnapshot(input, { topicId: body.feedbackContext?.changeId }) as FeedbackSnapshot;
  const primary = snapshot.right?.confirmationQueue?.primary;
  if (!primary && body.action && allowedActionIds.has(body.action.actionId)) return resolveLegacyFeedbackRoute(body);
  if (!primary) {
    const error = new Error("Feedback target is stale or no longer available.");
    error.name = "Conflict";
    throw error;
  }
  try {
    return resolveFeedbackRouteFromPrimary(primary, body);
  } catch (error) {
    if (body.action && allowedActionIds.has(body.action.actionId)) return resolveLegacyFeedbackRoute(body);
    throw error;
  }
}
