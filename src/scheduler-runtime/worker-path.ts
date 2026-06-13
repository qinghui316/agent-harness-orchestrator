export interface SchedulerWorkerPathLike {
  start: {
    reservationIntentId: string;
    updatedAt?: string;
  };
  terminal: boolean;
  audit?: {
    status: string;
    claimIntentId?: string;
  };
  reworkAudit?: {
    status: string;
    claimIntentId?: string;
  };
}

export interface SchedulerReservationIntentLike {
  reservationIntentId: string;
  claimIntentId: string;
  status: string;
  waveIndex: number;
}

export interface SchedulerClaimReservationLike {
  reservationIntents: SchedulerReservationIntentLike[];
}

export interface SchedulerIntegrationCandidateLike {
  schedulerClaimReservationId: string;
  outputClaimIntentIds?: string[];
  outputs?: Array<{
    claimIntentId?: string;
  }>;
}

const APPROVED_AUDIT_STATUSES = new Set(["approved", "approved-with-notes"]);

export function approvedSchedulerWorkerPathClaimIntentIds(workerPaths: SchedulerWorkerPathLike[]): string[] {
  const claimIntentIds = new Set<string>();
  for (const path of workerPaths) {
    if (path.audit?.claimIntentId && APPROVED_AUDIT_STATUSES.has(path.audit.status)) {
      claimIntentIds.add(path.audit.claimIntentId);
    }
    if (path.reworkAudit?.claimIntentId && APPROVED_AUDIT_STATUSES.has(path.reworkAudit.status)) {
      claimIntentIds.add(path.reworkAudit.claimIntentId);
    }
  }
  return [...claimIntentIds].sort();
}

export function schedulerIntegrationCandidateNeedsRefresh(
  candidate: SchedulerIntegrationCandidateLike | null | undefined,
  workerPaths: SchedulerWorkerPathLike[],
): boolean {
  if (!candidate) return true;
  const approvedClaimIntentIds = approvedSchedulerWorkerPathClaimIntentIds(workerPaths);
  if (approvedClaimIntentIds.length === 0) return false;
  const coveredClaimIntentIds = new Set(candidate.outputClaimIntentIds ?? candidate.outputs?.map((output) => output.claimIntentId).filter((id): id is string => Boolean(id)) ?? []);
  return approvedClaimIntentIds.some((claimIntentId) => !coveredClaimIntentIds.has(claimIntentId));
}

export function findNextSchedulerReservationIntentForWorkerPaths(
  reservation: SchedulerClaimReservationLike,
  workerPaths: SchedulerWorkerPathLike[],
): SchedulerReservationIntentLike | null {
  if (workerPaths.some((path) => !path.terminal)) return null;
  const started = new Set(workerPaths.map((path) => path.start.reservationIntentId));
  return reservation.reservationIntents
    .filter((intent) => intent.status === "reserved" && !started.has(intent.reservationIntentId))
    .sort((a, b) => a.waveIndex - b.waveIndex || reservation.reservationIntents.indexOf(a) - reservation.reservationIntents.indexOf(b))[0] ?? null;
}
