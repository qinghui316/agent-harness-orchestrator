import type { WorkflowActionType } from "./registry.js";

export interface SchedulerCurrentTransitionReservationIntent {
  reservationIntentId: string;
  claimIntentId: string;
  status: string;
  waveIndex: number;
  sourceScopes?: string[];
}

export interface SchedulerCurrentTransitionReservation {
  reservationIntents: SchedulerCurrentTransitionReservationIntent[];
}

export interface SchedulerCurrentTransitionWorkerPath {
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

export interface SchedulerCurrentTransitionIntegrationCandidate {
  status?: string;
  readyCount?: number;
  blockedCount?: number;
}

export type SchedulerCurrentTransition =
  | {
      kind: "start-same-wave-worker" | "start-next-wave-worker";
      actionType: "planning.scheduler.worker.start-next";
      reservationIntent: SchedulerCurrentTransitionReservationIntent;
    }
  | {
      kind: "integration-candidate";
      actionType: "planning.scheduler.integration-candidate.compile";
    }
  | {
      kind: "integration-check";
      actionType: "planning.scheduler.integration-check.run";
    }
  | {
      kind: "close-blocked";
      actionType: "planning.scheduler.run.close-blocked";
    }
  | {
      kind: "run-complete";
      actionType: "planning.scheduler.run.complete";
    }
  | {
      kind: "blocked" | "none";
      actionType?: WorkflowActionType;
      reason: string;
    };

export interface SchedulerCurrentTransitionInput {
  reservation: SchedulerCurrentTransitionReservation;
  workerPaths: SchedulerCurrentTransitionWorkerPath[];
  integrationCandidate?: SchedulerCurrentTransitionIntegrationCandidate | null;
  integrationCandidateNeedsRefresh?: boolean;
  integrationCheckHandoffExists?: boolean;
  integrationOutcomeExists?: boolean;
  runCompletionExists?: boolean;
  runBlockedCloseoutExists?: boolean;
}

export function resolveSchedulerCurrentTransition(input: SchedulerCurrentTransitionInput): SchedulerCurrentTransition {
  if (input.runCompletionExists) return { kind: "none", reason: "SchedulerRun completion already exists." };
  if (input.runBlockedCloseoutExists) return { kind: "none", reason: "SchedulerRun blocked closeout already exists." };
  if (input.integrationOutcomeExists) return { kind: "run-complete", actionType: "planning.scheduler.run.complete" };
  if (input.integrationCheckHandoffExists) return { kind: "blocked", reason: "Scheduler integration check handoff already exists." };
  if (input.workerPaths.length === 0) return { kind: "none", reason: "Scheduler first worker has not started." };

  const sameWaveNext = findSameWaveNextIntent(input.reservation, input.workerPaths);
  if (sameWaveNext) {
    if (hasWaveSourceScopeConflict(input.reservation, sameWaveNext.waveIndex)) {
      return { kind: "blocked", reason: `Scheduler wave ${sameWaveNext.waveIndex} has conflicting source scopes.` };
    }
    return {
      kind: "start-same-wave-worker",
      actionType: "planning.scheduler.worker.start-next",
      reservationIntent: sameWaveNext,
    };
  }

  const currentWave = currentReservedWaveIndex(input.reservation);
  const currentWaveTerminal = currentWave === null || isWaveTerminal(input.reservation, input.workerPaths, currentWave);
  if (!currentWaveTerminal) {
    return { kind: "blocked", reason: "Current scheduler wave is not terminal." };
  }

  const nextWaveIntent = findNextWaveIntent(input.reservation, input.workerPaths);
  if (nextWaveIntent) {
    if (hasWaveSourceScopeConflict(input.reservation, nextWaveIntent.waveIndex)) {
      return { kind: "blocked", reason: `Scheduler wave ${nextWaveIntent.waveIndex} has conflicting source scopes.` };
    }
    return {
      kind: "start-next-wave-worker",
      actionType: "planning.scheduler.worker.start-next",
      reservationIntent: nextWaveIntent,
    };
  }

  const candidate = input.integrationCandidate;
  if (!candidate || input.integrationCandidateNeedsRefresh) {
    return { kind: "integration-candidate", actionType: "planning.scheduler.integration-candidate.compile" };
  }
  const readyCount = candidate.readyCount ?? 0;
  const blockedCount = candidate.blockedCount ?? 0;
  if (readyCount >= 2) return { kind: "integration-check", actionType: "planning.scheduler.integration-check.run" };
  if (readyCount < 2 && blockedCount >= 0) return { kind: "close-blocked", actionType: "planning.scheduler.run.close-blocked" };
  return { kind: "none", reason: "No Scheduler transition is currently legal." };
}

export function schedulerTransitionMatchesStartNextRequest(input: {
  transition: SchedulerCurrentTransition;
  reservationIntentId?: string;
  claimIntentId?: string;
}): boolean {
  if (input.transition.kind !== "start-same-wave-worker" && input.transition.kind !== "start-next-wave-worker") return false;
  return input.transition.reservationIntent.reservationIntentId === input.reservationIntentId
    && input.transition.reservationIntent.claimIntentId === input.claimIntentId;
}

function findSameWaveNextIntent(
  reservation: SchedulerCurrentTransitionReservation,
  workerPaths: SchedulerCurrentTransitionWorkerPath[],
): SchedulerCurrentTransitionReservationIntent | null {
  const currentWave = currentReservedWaveIndex(reservation);
  if (currentWave === null) return null;
  const started = startedIntentIds(workerPaths);
  return reservedIntents(reservation)
    .filter((intent) => intent.waveIndex === currentWave && !started.has(intent.reservationIntentId))
    .sort(byReservationOrder(reservation))[0] ?? null;
}

function findNextWaveIntent(
  reservation: SchedulerCurrentTransitionReservation,
  workerPaths: SchedulerCurrentTransitionWorkerPath[],
): SchedulerCurrentTransitionReservationIntent | null {
  const started = startedIntentIds(workerPaths);
  return reservedIntents(reservation)
    .filter((intent) => !started.has(intent.reservationIntentId))
    .sort((left, right) => left.waveIndex - right.waveIndex || byReservationOrder(reservation)(left, right))[0] ?? null;
}

function isWaveTerminal(
  reservation: SchedulerCurrentTransitionReservation,
  workerPaths: SchedulerCurrentTransitionWorkerPath[],
  waveIndex: number,
): boolean {
  const waveIntents = reservedIntents(reservation).filter((intent) => intent.waveIndex === waveIndex);
  if (waveIntents.length === 0) return false;
  const pathByIntent = new Map(workerPaths.map((path) => [path.start.reservationIntentId, path]));
  return waveIntents.every((intent) => pathByIntent.get(intent.reservationIntentId)?.terminal === true);
}

function hasWaveSourceScopeConflict(reservation: SchedulerCurrentTransitionReservation, waveIndex: number): boolean {
  const owners = new Map<string, string>();
  for (const intent of reservedIntents(reservation).filter((candidate) => candidate.waveIndex === waveIndex)) {
    for (const scope of intent.sourceScopes ?? []) {
      const owner = owners.get(scope);
      if (owner && owner !== intent.reservationIntentId) return true;
      owners.set(scope, intent.reservationIntentId);
    }
  }
  return false;
}

function currentReservedWaveIndex(reservation: SchedulerCurrentTransitionReservation): number | null {
  const first = reservedIntents(reservation).sort((left, right) => left.waveIndex - right.waveIndex || byReservationOrder(reservation)(left, right))[0];
  return first ? first.waveIndex : null;
}

function reservedIntents(reservation: SchedulerCurrentTransitionReservation): SchedulerCurrentTransitionReservationIntent[] {
  return reservation.reservationIntents.filter((intent) => intent.status === "reserved");
}

function startedIntentIds(workerPaths: SchedulerCurrentTransitionWorkerPath[]): Set<string> {
  return new Set(workerPaths.map((path) => path.start.reservationIntentId));
}

function byReservationOrder(reservation: SchedulerCurrentTransitionReservation) {
  return (left: SchedulerCurrentTransitionReservationIntent, right: SchedulerCurrentTransitionReservationIntent): number =>
    reservation.reservationIntents.indexOf(left) - reservation.reservationIntents.indexOf(right);
}
