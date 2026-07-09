import type { WorkflowActionType } from "./registry.js";
import type { ReadySetWorkflowGraphPlan } from "../types/index.js";

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
      kind: "start-first-worker";
      actionType: "planning.scheduler.worker.start-first";
      reservationIntent: SchedulerCurrentTransitionReservationIntent;
    }
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
  graph?: ReadySetWorkflowGraphPlan | null;
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
  const graphScope = input.graph ? validateGraphReservationScope(input.graph, input.reservation) : null;
  if (graphScope) return { kind: "blocked", reason: graphScope };
  if (input.workerPaths.length === 0) {
    const first = findFirstIntent(input.reservation, input.graph);
    if (!first) return { kind: "none", reason: "Scheduler first worker has no runnable reservation intent." };
    if (hasWaveSourceScopeConflict(input.reservation, first.waveIndex, input.graph)) {
      return { kind: "blocked", reason: `Scheduler wave ${first.waveIndex} has conflicting source scopes.` };
    }
    return {
      kind: "start-first-worker",
      actionType: "planning.scheduler.worker.start-first",
      reservationIntent: first,
    };
  }

  const sameWaveNext = findSameWaveNextIntent(input.reservation, input.workerPaths, input.graph);
  if (sameWaveNext) {
    if (hasWaveSourceScopeConflict(input.reservation, sameWaveNext.waveIndex, input.graph)) {
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

  const nextWaveIntent = findNextWaveIntent(input.reservation, input.workerPaths, input.graph);
  if (nextWaveIntent) {
    if (hasWaveSourceScopeConflict(input.reservation, nextWaveIntent.waveIndex, input.graph)) {
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

export function schedulerTransitionMatchesStartRequest(input: {
  transition: SchedulerCurrentTransition;
  actionType: "planning.scheduler.worker.start-first" | "planning.scheduler.worker.start-next";
  reservationIntentId?: string;
  claimIntentId?: string;
}): boolean {
  if (input.actionType === "planning.scheduler.worker.start-first") {
    return input.transition.kind === "start-first-worker"
      && input.transition.reservationIntent.reservationIntentId === input.reservationIntentId
      && input.transition.reservationIntent.claimIntentId === input.claimIntentId;
  }
  return schedulerTransitionMatchesStartNextRequest(input);
}

function findFirstIntent(reservation: SchedulerCurrentTransitionReservation, graph?: ReadySetWorkflowGraphPlan | null): SchedulerCurrentTransitionReservationIntent | null {
  return reservedIntents(reservation)
    .sort(byGraphOrReservationOrder(reservation, graph))[0] ?? null;
}

function findSameWaveNextIntent(
  reservation: SchedulerCurrentTransitionReservation,
  workerPaths: SchedulerCurrentTransitionWorkerPath[],
  graph?: ReadySetWorkflowGraphPlan | null,
): SchedulerCurrentTransitionReservationIntent | null {
  const currentWave = currentReservedWaveIndex(reservation);
  if (currentWave === null) return null;
  const started = startedIntentIds(workerPaths);
  return reservedIntents(reservation)
    .filter((intent) => intent.waveIndex === currentWave && !started.has(intent.reservationIntentId))
    .sort(byGraphOrReservationOrder(reservation, graph))[0] ?? null;
}

function findNextWaveIntent(
  reservation: SchedulerCurrentTransitionReservation,
  workerPaths: SchedulerCurrentTransitionWorkerPath[],
  graph?: ReadySetWorkflowGraphPlan | null,
): SchedulerCurrentTransitionReservationIntent | null {
  const started = startedIntentIds(workerPaths);
  return reservedIntents(reservation)
    .filter((intent) => !started.has(intent.reservationIntentId))
    .sort((left, right) => left.waveIndex - right.waveIndex || byGraphOrReservationOrder(reservation, graph)(left, right))[0] ?? null;
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

function hasWaveSourceScopeConflict(reservation: SchedulerCurrentTransitionReservation, waveIndex: number, graph?: ReadySetWorkflowGraphPlan | null): boolean {
  const owners = new Map<string, string>();
  if (graph) {
    for (const node of graph.nodes.filter((candidate) => candidate.waveIndex === waveIndex && candidate.status === "planned")) {
      for (const scope of node.sourceLocks.length ? node.sourceLocks.map((lock) => lock.scope) : node.sourceScopes) {
        const owner = owners.get(scope);
        if (owner && owner !== node.claimIntentId) return true;
        owners.set(scope, node.claimIntentId);
      }
    }
    return false;
  }
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
  return (reservation.reservationIntents ?? []).filter((intent) => intent.status === "reserved");
}

function startedIntentIds(workerPaths: SchedulerCurrentTransitionWorkerPath[]): Set<string> {
  return new Set(workerPaths.map((path) => path.start.reservationIntentId));
}

function byReservationOrder(reservation: SchedulerCurrentTransitionReservation) {
  return (left: SchedulerCurrentTransitionReservationIntent, right: SchedulerCurrentTransitionReservationIntent): number =>
    (reservation.reservationIntents ?? []).indexOf(left) - (reservation.reservationIntents ?? []).indexOf(right);
}

function byGraphOrReservationOrder(reservation: SchedulerCurrentTransitionReservation, graph?: ReadySetWorkflowGraphPlan | null) {
  const fallback = byReservationOrder(reservation);
  if (!graph) return fallback;
  const claimOrder = new Map<string, number>();
  let order = 0;
  for (const wave of graph.waves.slice().sort((left, right) => left.index - right.index)) {
    for (const claimIntentId of wave.claimIntentIds) {
      if (!claimOrder.has(claimIntentId)) claimOrder.set(claimIntentId, order);
      order += 1;
    }
  }
  return (left: SchedulerCurrentTransitionReservationIntent, right: SchedulerCurrentTransitionReservationIntent): number => {
    const leftOrder = claimOrder.get(left.claimIntentId);
    const rightOrder = claimOrder.get(right.claimIntentId);
    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return fallback(left, right);
  };
}

function validateGraphReservationScope(graph: ReadySetWorkflowGraphPlan, reservation: SchedulerCurrentTransitionReservation): string | null {
  if (graph.status !== "compiled") return "Ready-set WorkflowGraphPlan is not compiled.";
  const graphNodesByClaim = new Map(graph.nodes.map((node) => [node.claimIntentId, node]));
  const graphWaveClaims = new Set(graph.waves.flatMap((wave) => wave.claimIntentIds));
  for (const intent of reservedIntents(reservation)) {
    const node = graphNodesByClaim.get(intent.claimIntentId);
    if (!node) return `Ready-set WorkflowGraphPlan does not cover claim intent ${intent.claimIntentId}.`;
    if (!graphWaveClaims.has(intent.claimIntentId)) return `Ready-set WorkflowGraphPlan wave list does not cover claim intent ${intent.claimIntentId}.`;
    if (node.waveIndex !== intent.waveIndex) return `Ready-set WorkflowGraphPlan wave mismatch for claim intent ${intent.claimIntentId}.`;
    if (node.status !== "planned") return `Ready-set WorkflowGraphPlan node is not runnable for claim intent ${intent.claimIntentId}.`;
  }
  return null;
}
