import type { IncomingMessage, ServerResponse } from "node:http";
import { createSseResponse } from "../sse.js";
import type { ManagedProject } from "../../types/index.js";
import { runWorkbenchWorkflowAction, type WorkbenchWorkflowActionRequest } from "../../workbench/chat.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { isLiveWorkflowActionType } from "../../workflow-actions/registry.js";
import { assertCurrentWorkflowAction } from "./action-revalidation.js";
import { executeWorkbenchAction } from "./actions.js";
import { createLiveSink } from "./live.js";
import { readJsonBody } from "./http.js";
import type { WorkbenchActionRequest } from "./types.js";

export async function sendWorkbenchActionLive(input: WorkbenchProjectInput & { project: ManagedProject }, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody<WorkbenchActionRequest>(request);
  const changeId = body.changeId;
  const sse = createSseResponse(response);
  const sink = createLiveSink(sse);
  let terminalStatus: "completed" | "failed" = "completed";
  try {
    if (body.actionType) {
      if (body.actionType !== "chat.ask" && body.confirm !== true) {
        const error = new Error("Mutating Workbench workflow actions require confirm: true.");
        error.name = "Conflict";
        throw error;
      }
      if (!isLiveWorkflowAction(body.actionType)) {
        const error = new Error(`Action ${body.actionType} is not supported by the live endpoint.`);
        error.name = "BadRequest";
        throw error;
      }
      await assertCurrentWorkflowAction(input, body);
      const result = await runWorkbenchWorkflowAction(input.project, {
        actionType: body.actionType,
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
      }, sink);
      terminalStatus = result.status;
    } else {
      await executeWorkbenchAction(input, body);
    }
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: changeId }) });
    sink.emit({ event: "done", data: { status: terminalStatus } });
  } catch (cause) {
    sink.emit({ event: "error", data: { message: cause instanceof Error ? cause.message : String(cause) } });
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: changeId }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) });
    sink.emit({ event: "done", data: { status: "failed" } });
  } finally {
    sse.end();
  }
}

function isLiveWorkflowAction(actionType: string): actionType is WorkbenchWorkflowActionRequest["actionType"] {
  return isLiveWorkflowActionType(actionType);
}
