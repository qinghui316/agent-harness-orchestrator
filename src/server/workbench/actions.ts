import { recordDemandMemoryCloseout, recordMaintenanceLedgerEntry, runMaintenanceCandidatePipeline } from "../../agent-task/manager.js";
import { abandonChangeForChange, closeChangeForChange } from "../../change/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject } from "../../types/index.js";
import { recordWorkbenchDecision, runWorkbenchWorkflowAction } from "../../workbench/chat.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { assertCurrentWorkflowAction } from "./action-revalidation.js";
import {
  allowedActionIds,
  inferArtifactFromActionResult,
  inferChangeIdFromAction,
  inferRunIdFromActionResult,
  inferTargetIdFromAction,
  runAllowlistedAction,
} from "./approval-actions.js";
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
  await assertCurrentWorkflowAction(input, body);
  const result = await runWorkbenchWorkflowAction(input.project, {
    actionType,
    changeId: body.changeId,
    prompt: body.prompt,
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
    schedulerWorkerStartId: body.schedulerWorkerStartId,
    schedulerWorkerResultId: body.schedulerWorkerResultId,
    schedulerWorkerValidationId: body.schedulerWorkerValidationId,
    schedulerWorkerAuditId: body.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: body.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: body.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: body.schedulerWorkerReworkResultId,
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
    auditRunId: body.auditRunId,
  });
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
    const context = body.feedbackContext ?? {};
    const feedbackChangeId = context.changeId ?? (action ? inferChangeIdFromAction(action, null) : null);
    await recordWorkbenchDecision(input.project, {
      id: `feedback:${context.contextId ?? action?.actionId ?? "scoped"}:${action?.args.join(":") ?? context.targetId ?? "target"}:${Date.now()}`,
      changeId: feedbackChangeId,
      decisionType: action?.actionId ?? "scoped.feedback",
      status: "requested-changes",
      label: `Requested changes: ${action?.label ?? "scoped feedback"}`,
      summary: "User requested changes instead of accepting this decision.",
      targetId: context.targetId ?? (action ? inferTargetIdFromAction(action, null) : null),
      runId: context.runId ?? null,
      artifact: null,
      actionId: action?.actionId ?? "scoped.feedback",
      feedback: body.feedback.trim(),
      payload: { action, feedback: body.feedback.trim(), context },
    });
    if (feedbackChangeId) {
      await recordPostDecisionMaintenance(input.project, feedbackChangeId, "user-feedback", body.feedback.trim(), []);
    }
    return { result: { status: "requested-changes" }, snapshot: await getWorkbenchSnapshot(input) };
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
  let result = await runAllowlistedAction(input.project, action, body.options);
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
  if (action.actionId === "worktree.apply" || action.actionId === "result.apply") {
    try {
      const changeId = inferChangeIdFromAction(action, result);
      if (!changeId) throw new Error("Cannot auto-finalize applied result without a scoped changeId.");
      const finalized = await closeChangeForChange(input.project, changeId);
      result = { result, finalization: { status: "archived", archivePath: finalized.archivePath, changeId: finalized.change.id } };
      await recordWorkbenchDecision(input.project, {
        id: `auto-close:${finalized.change.id}:${Date.now()}`,
        changeId: finalized.change.id,
        decisionType: "workpad.auto-finalize",
        status: "completed",
        label: "Demand conversation auto finalized",
        summary: "Applied source change was accepted, so the demand conversation was automatically closed and archived.",
        targetId: finalized.change.id,
        runId: null,
        artifact: finalized.archivePath,
        actionId: "workpad.auto-finalize",
        payload: result,
        completedAt: new Date().toISOString(),
      });
      await recordPostDecisionMaintenance(input.project, finalized.change.id, "apply", "Applied source change was accepted and the demand conversation was archived.", [finalized.archivePath]);
    } catch (cause) {
      result = { result, finalization: { status: "not-archived", error: cause instanceof Error ? cause.message : String(cause) } };
    }
  }
  return { result, snapshot: await getWorkbenchSnapshot(input) };
}
