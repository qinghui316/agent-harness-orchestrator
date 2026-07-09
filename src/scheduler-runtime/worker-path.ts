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
  sourceScopes?: string[];
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

export interface SchedulerCurrentWaveStatus {
  waveIndex: number | null;
  reservedCount: number;
  startedCount: number;
  unstartedCount: number;
  nonTerminalStartedCount: number;
  terminal: boolean;
}

export function findNextSameWaveSchedulerReservationIntentForWorkerPaths(
  reservation: SchedulerClaimReservationLike,
  workerPaths: SchedulerWorkerPathLike[],
): SchedulerReservationIntentLike | null {
  const currentWave = currentReservedWaveIndex(reservation);
  if (currentWave === null) return null;
  const started = new Set(workerPaths.map((path) => path.start.reservationIntentId));
  return reservation.reservationIntents
    .filter((intent) => intent.status === "reserved" && intent.waveIndex === currentWave && !started.has(intent.reservationIntentId))
    .sort((a, b) => reservation.reservationIntents.indexOf(a) - reservation.reservationIntents.indexOf(b))[0] ?? null;
}

export function schedulerCurrentWaveStatus(
  reservation: SchedulerClaimReservationLike,
  workerPaths: SchedulerWorkerPathLike[],
): SchedulerCurrentWaveStatus {
  const currentWave = currentReservedWaveIndex(reservation);
  if (currentWave === null) {
    return {
      waveIndex: null,
      reservedCount: 0,
      startedCount: 0,
      unstartedCount: 0,
      nonTerminalStartedCount: 0,
      terminal: false,
    };
  }
  const currentWaveIntents = reservation.reservationIntents.filter((intent) => intent.status === "reserved" && intent.waveIndex === currentWave);
  const currentWaveIntentIds = new Set(currentWaveIntents.map((intent) => intent.reservationIntentId));
  const currentWavePaths = workerPaths.filter((path) => currentWaveIntentIds.has(path.start.reservationIntentId));
  const startedIds = new Set(currentWavePaths.map((path) => path.start.reservationIntentId));
  const nonTerminalStartedCount = currentWavePaths.filter((path) => !path.terminal).length;
  const unstartedCount = currentWaveIntents.filter((intent) => !startedIds.has(intent.reservationIntentId)).length;
  return {
    waveIndex: currentWave,
    reservedCount: currentWaveIntents.length,
    startedCount: currentWavePaths.length,
    unstartedCount,
    nonTerminalStartedCount,
    terminal: currentWaveIntents.length > 0 && unstartedCount === 0 && nonTerminalStartedCount === 0,
  };
}

export function assertNoSameWaveReservationSourceScopeConflict(reservation: SchedulerClaimReservationLike, actionType: string): void {
  const currentWave = currentReservedWaveIndex(reservation);
  if (currentWave === null) return;
  const owners = new Map<string, string>();
  for (const intent of reservation.reservationIntents.filter((candidate) => candidate.status === "reserved" && candidate.waveIndex === currentWave)) {
    for (const scope of intent.sourceScopes ?? []) {
      const existing = owners.get(scope);
      if (existing && existing !== intent.reservationIntentId) {
        throw new Error(`${actionType} same-wave source scope conflict: ${scope}.`);
      }
      owners.set(scope, intent.reservationIntentId);
    }
  }
}

function currentReservedWaveIndex(reservation: SchedulerClaimReservationLike): number | null {
  if (!Array.isArray(reservation.reservationIntents)) return null;
  const wave = reservation.reservationIntents
    .filter((intent) => intent.status === "reserved")
    .sort((a, b) => a.waveIndex - b.waveIndex || reservation.reservationIntents.indexOf(a) - reservation.reservationIntents.indexOf(b))[0]?.waveIndex;
  return typeof wave === "number" ? wave : null;
}
