import type { WorkbenchApprovalAction, WorkbenchConfirmationQueue, WorkbenchConfirmationQueueItem } from "../../../read-model-types.js";
import type { HighImpactApprovalScope } from "../../../../workflow-actions/high-impact-approval.js";

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
    })),
  };
}

export function approvalAction(actionId: string, label: string, command: string, args: string[], mutates: boolean, scope?: HighImpactApprovalScope): WorkbenchApprovalAction {
  return {
    actionId,
    label,
    command,
    args,
    mutates,
    requiresConfirmation: mutates,
    ...(scope ? { scope } : {}),
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
