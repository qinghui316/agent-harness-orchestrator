import { recordToolEventAuditEntry } from "../../agent-task/boundary-audit.js";
import { applyMaintenanceCanonicalPatchApplicationManifest, maintenanceCanonicalPatchApplicationGateArtifactRef, maintenanceCanonicalPatchApplicationResultArtifactRef, maintenanceCanonicalUpdateDecisionArtifactRef, recordDemandMemoryCloseout, recordMaintenanceLedgerEntry, recordMaintenanceCanonicalPatchApplicationGate, recordMaintenanceCanonicalUpdateDecision, runMaintenanceCandidatePipeline } from "../../agent-task/manager.js";
import { evaluateToolPolicy } from "../../agent-task/tool-policy.js";
import { abandonChangeForChange } from "../../change/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject } from "../../types/index.js";
import { recordWorkbenchDecision, runWorkbenchWorkflowAction } from "../../workbench/chat.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { workflowActionScopePayload, workflowActionTargetId } from "../../workflow-actions/registry.js";
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
import { isRecord } from "./http.js";
import type { WorkbenchActionRequest } from "./types.js";

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

export async function recordPostDecisionMaintenance(
  project: ManagedProject,
  changeId: string,
  eventType: "archive" | "apply" | "failure" | "user-feedback" | "doc-drift" | "reference-drift" | "harness-evolution",
  summary: string,
  artifactRefs: string[],
): Promise<void> {
  try {
    const memory = await resolveProjectMemory(project);
    if (eventType === "archive" || eventType === "apply") {
      await recordDemandMemoryCloseout(memory, {
        changeId,
        title: changeId,
        terminalKind: eventType === "archive" ? "archived" : "applied",
        finalResult: summary,
        userDecision: eventType,
        evidenceRefs: artifactRefs,
        reusableLessonCandidates: [{
          summary: "Terminal demand evidence is available for future maintenance review.",
          evidenceRefs: artifactRefs,
        }],
      });
    } else {
      await recordMaintenanceLedgerEntry(memory, {
        eventType,
        changeId,
        summary,
        artifactRefs,
      });
      await runMaintenanceCandidatePipeline(memory);
    }
  } catch {
    // Maintenance suggestions are advisory; action results must not depend on them.
  }
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
  await recordPostDecisionMaintenance(input.project, changeId ?? result.change.id, "user-feedback", "Demand conversation was abandoned by the user.", [result.archivePath]);
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
  if (actionType === "maintenance.canonical-update.decision.record" || actionType === "maintenance.canonical-patch.application-gate.record" || actionType === "maintenance.canonical-patch.apply") {
    return executeProjectScopedMaintenanceAction(input, body);
  }
  const result = await runWorkbenchWorkflowAction(input.project, {
    actionType,
    changeId: body.changeId,
    prompt: body.prompt,
    feedback: body.feedback,
    proposalId: body.proposalId,
    planningBundleId: body.planningBundleId,
    decompositionPlanId: body.decompositionPlanId,
    readinessManifestId: body.readinessManifestId,
    taskQueueProposalId: body.taskQueueProposalId,
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
    goalLoopDecisionId: body.goalLoopDecisionId,
    goalLoopIterationId: body.goalLoopIterationId,
    goalLoopContinuationBriefId: body.goalLoopContinuationBriefId,
    goalLoopNextStepPacketId: body.goalLoopNextStepPacketId,
    goalLoopFeedbackId: body.goalLoopFeedbackId,
    goalLoopControllerPolicyId: body.goalLoopControllerPolicyId,
    goalLoopGateReadinessPreflightId: body.goalLoopGateReadinessPreflightId,
    goalLoopCurrentGateActionType: body.goalLoopCurrentGateActionType,
    postPlanAutomationMode: body.postPlanAutomationMode,
    automationMode: body.automationMode,
    automationCurrentGateActionType: body.automationCurrentGateActionType,
    automationCurrentGateApprovalActionId: body.automationCurrentGateApprovalActionId,
    automationCurrentGateTargetId: body.automationCurrentGateTargetId,
    automationCurrentGateRunId: body.automationCurrentGateRunId,
    automationCurrentGateArtifact: body.automationCurrentGateArtifact,
    automationAuthorizationId: body.automationAuthorizationId,
    automationRunId: body.automationRunId,
    maxSteps: body.maxSteps,
    maintenanceProposalId: body.maintenanceProposalId,
    maintenancePatchProposalId: body.maintenancePatchProposalId,
    maintenanceApplicationManifestId: body.maintenanceApplicationManifestId,
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
  });
  return { result, snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId }) };
}

async function executeProjectScopedMaintenanceAction(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  if (body.actionType === "maintenance.canonical-patch.apply") {
    return executeProjectScopedMaintenancePatchApplyAction(input, body);
  }
  if (body.actionType === "maintenance.canonical-patch.application-gate.record") {
    return executeProjectScopedMaintenancePatchApplicationGateAction(input, body);
  }
  return executeProjectScopedMaintenanceDecisionAction(input, body);
}

async function executeProjectScopedMaintenanceDecisionAction(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  if (!body.maintenanceProposalId) {
    const error = new Error("maintenance.canonical-update.decision.record requires maintenanceProposalId.");
    error.name = "BadRequest";
    throw error;
  }
  const request = {
    actionType: "maintenance.canonical-update.decision.record" as const,
    changeId: body.changeId,
    maintenanceProposalId: body.maintenanceProposalId,
  };
  const memory = await resolveProjectMemory(input.project);
  const targetId = workflowActionTargetId(request, "maintenance");
  const scope = workflowActionScopePayload(request, "maintenance");
  const policyDecision = evaluateToolPolicy({
    actionType: request.actionType,
    actorRoleId: "main-agent",
    targetId,
    enforcementMode: "broker-enforced",
  });
  const policyAuditRef = await recordToolEventAuditEntry(memory, {
    actorRoleId: "main-agent",
    actionType: request.actionType,
    targetId,
    scope,
    decision: policyDecision,
  });
  if (policyDecision.status === "denied" || policyDecision.status === "unavailable") {
    throw new Error(`${policyDecision.readableMessage} Evidence: ${policyAuditRef}`);
  }
  const decision = await recordMaintenanceCanonicalUpdateDecision(memory, body.maintenanceProposalId);
  const artifact = maintenanceCanonicalUpdateDecisionArtifactRef(memory, decision.id);
  await recordWorkbenchDecision(input.project, {
    id: `maintenance:${request.actionType}:${decision.id}`,
    changeId: null,
    decisionType: request.actionType,
    status: "completed",
    label: "Maintenance canonical update decision recorded",
    summary: decision.summary,
    targetId: body.maintenanceProposalId,
    runId: null,
    artifact,
    actionId: request.actionType,
    payload: { scope, policyAuditRef, decision },
    completedAt: new Date().toISOString(),
  });
  return {
    result: { actionType: request.actionType, status: "completed", decision, policyAuditRef },
    snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId }),
  };
}

async function executeProjectScopedMaintenancePatchApplicationGateAction(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  if (!body.maintenancePatchProposalId) {
    const error = new Error("maintenance.canonical-patch.application-gate.record requires maintenancePatchProposalId.");
    error.name = "BadRequest";
    throw error;
  }
  const request = {
    actionType: "maintenance.canonical-patch.application-gate.record" as const,
    changeId: body.changeId,
    maintenancePatchProposalId: body.maintenancePatchProposalId,
  };
  const memory = await resolveProjectMemory(input.project);
  const targetId = workflowActionTargetId(request, "maintenance");
  const scope = workflowActionScopePayload(request, "maintenance");
  const policyDecision = evaluateToolPolicy({
    actionType: request.actionType,
    actorRoleId: "main-agent",
    targetId,
    enforcementMode: "broker-enforced",
  });
  const policyAuditRef = await recordToolEventAuditEntry(memory, {
    actorRoleId: "main-agent",
    actionType: request.actionType,
    targetId,
    scope,
    decision: policyDecision,
  });
  if (policyDecision.status === "denied" || policyDecision.status === "unavailable") {
    throw new Error(`${policyDecision.readableMessage} Evidence: ${policyAuditRef}`);
  }
  const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, body.maintenancePatchProposalId);
  const artifact = maintenanceCanonicalPatchApplicationGateArtifactRef(memory, gateRecord.id);
  await recordWorkbenchDecision(input.project, {
    id: `maintenance:${request.actionType}:${gateRecord.id}`,
    changeId: null,
    decisionType: request.actionType,
    status: "completed",
    label: "Maintenance canonical patch application gate recorded",
    summary: gateRecord.summary,
    targetId: body.maintenancePatchProposalId,
    runId: null,
    artifact,
    actionId: request.actionType,
    payload: { scope, policyAuditRef, gateRecord },
    completedAt: new Date().toISOString(),
  });
  return {
    result: { actionType: request.actionType, status: "completed", gateRecord, policyAuditRef },
    snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId }),
  };
}

async function executeProjectScopedMaintenancePatchApplyAction(input: WorkbenchProjectInput & { project: ManagedProject }, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  if (!body.maintenanceApplicationManifestId) {
    const error = new Error("maintenance.canonical-patch.apply requires maintenanceApplicationManifestId.");
    error.name = "BadRequest";
    throw error;
  }
  const request = {
    actionType: "maintenance.canonical-patch.apply" as const,
    changeId: body.changeId,
    maintenanceApplicationManifestId: body.maintenanceApplicationManifestId,
  };
  const memory = await resolveProjectMemory(input.project);
  const targetId = workflowActionTargetId(request, "maintenance");
  const scope = workflowActionScopePayload(request, "maintenance");
  const policyDecision = evaluateToolPolicy({
    actionType: request.actionType,
    actorRoleId: "main-agent",
    targetId,
    enforcementMode: "broker-enforced",
  });
  const policyAuditRef = await recordToolEventAuditEntry(memory, {
    actorRoleId: "main-agent",
    actionType: request.actionType,
    targetId,
    scope,
    decision: policyDecision,
  });
  if (policyDecision.status === "denied" || policyDecision.status === "unavailable") {
    throw new Error(`${policyDecision.readableMessage} Evidence: ${policyAuditRef}`);
  }
  const applicationResult = await applyMaintenanceCanonicalPatchApplicationManifest(memory, body.maintenanceApplicationManifestId, {
    policyAuditRefs: [policyAuditRef],
    confirmedBy: "workbench-human-gate",
  });
  const artifact = maintenanceCanonicalPatchApplicationResultArtifactRef(memory, applicationResult.id);
  await recordWorkbenchDecision(input.project, {
    id: `maintenance:${request.actionType}:${applicationResult.id}`,
    changeId: null,
    decisionType: request.actionType,
    status: "completed",
    label: "Maintenance canonical patch applied",
    summary: applicationResult.summary,
    targetId: body.maintenanceApplicationManifestId,
    runId: null,
    artifact,
    actionId: request.actionType,
    payload: { scope, policyAuditRef, applicationResult },
    completedAt: new Date().toISOString(),
  });
  return {
    result: { actionType: request.actionType, status: "completed", applicationResult, policyAuditRef },
    snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId }),
  };
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
    if (feedbackChangeId) {
      await recordPostDecisionMaintenance(input.project, feedbackChangeId, "user-feedback", body.feedback.trim(), []);
    }
    if (route.workflowRequest) {
      const routed = await runWorkbenchWorkflowAction(input.project, route.workflowRequest);
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
  await recordWorkbenchDecision(input.project, {
    id: `approval:${action.actionId}:${action.args.join(":")}`,
    changeId: inferChangeIdFromAction(action, result),
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
  if (action.actionId === "change.close" && isRecord(result) && isRecord(result.change) && typeof result.change.id === "string") {
    const archiveRef = typeof result.archivePath === "string" ? result.archivePath : undefined;
    await recordPostDecisionMaintenance(
      input.project,
      result.change.id,
      "archive",
      "Demand conversation was closed and archived.",
      archiveRef ? [archiveRef] : [],
    );
  }
  return { result, snapshot: await getWorkbenchSnapshot(input) };
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
