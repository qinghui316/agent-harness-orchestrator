import type { WorkbenchApprovalAction, WorkbenchConfirmationQueue, WorkbenchConfirmationQueueItem, WorkbenchDecisionAction } from "../../../read-model-types.js";

export function emptyConfirmationQueue(): WorkbenchConfirmationQueue {
  return {
    primary: null,
    current: [],
    otherDemands: [],
    maintenance: [],
    history: [],
  };
}

export function scopeConfirmationQueueItemActions(item: WorkbenchConfirmationQueueItem): WorkbenchConfirmationQueueItem {
  return {
    ...item,
    actions: item.actions.map((action) => ({
      ...action,
      changeId: action.changeId ?? item.changeId,
      worktreeId: action.worktreeId ?? item.worktreeId,
      applyCheckId: action.applyCheckId ?? item.applyCheckId,
      landingPackageId: action.landingPackageId ?? item.landingPackageId,
      schedulerRunId: action.schedulerRunId ?? item.schedulerRunId,
      schedulerReconcileSnapshotId: action.schedulerReconcileSnapshotId ?? item.schedulerReconcileSnapshotId,
      schedulerClaimReservationId: action.schedulerClaimReservationId ?? item.schedulerClaimReservationId,
      reservationIntentId: action.reservationIntentId ?? item.reservationIntentId,
      claimIntentId: action.claimIntentId ?? item.claimIntentId,
      goalLoopDecisionId: action.goalLoopDecisionId ?? item.goalLoopDecisionId,
      goalLoopIterationId: action.goalLoopIterationId ?? item.goalLoopIterationId,
      goalLoopContinuationBriefId: action.goalLoopContinuationBriefId ?? item.goalLoopContinuationBriefId,
      goalLoopNextStepPacketId: action.goalLoopNextStepPacketId ?? item.goalLoopNextStepPacketId,
      goalLoopFeedbackId: action.goalLoopFeedbackId ?? item.goalLoopFeedbackId,
      goalLoopControllerPolicyId: action.goalLoopControllerPolicyId ?? item.goalLoopControllerPolicyId,
      goalLoopGateReadinessPreflightId: action.goalLoopGateReadinessPreflightId ?? item.goalLoopGateReadinessPreflightId,
      goalLoopCurrentGateActionType: action.goalLoopCurrentGateActionType ?? item.goalLoopCurrentGateActionType,
    })),
  };
}

export function evidenceActions(artifact?: string): WorkbenchDecisionAction[] {
  if (!artifact) return [];
  return [{
    id: `evidence:${artifact}`,
    label: "查看证据",
    kind: "evidence",
    enabled: true,
    requiresConfirmation: false,
    artifact,
  }];
}

export function approvalAction(actionId: string, label: string, command: string, args: string[], mutates: boolean): WorkbenchApprovalAction {
  return {
    actionId,
    label,
    command,
    args,
    mutates,
    requiresConfirmation: mutates,
  };
}

export function dedupeConfirmationItems(items: WorkbenchConfirmationQueueItem[]): WorkbenchConfirmationQueueItem[] {
  const seen = new Set<string>();
  const result: WorkbenchConfirmationQueueItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
