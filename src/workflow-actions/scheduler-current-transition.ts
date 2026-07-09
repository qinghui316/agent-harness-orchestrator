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
    id?: string;
    reservationIntentId: string;
    claimIntentId?: string;
    updatedAt?: string;
  };
  status?: string;
  terminal: boolean;
  result?: { id?: string } | null;
  validation?: { id?: string } | null;
  audit?: { id?: string; status: string; claimIntentId?: string } | null;
  reworkPlan?: { id?: string } | null;
  reworkStart?: { id?: string } | null;
  reworkResult?: { id?: string } | null;
  reworkValidation?: { id?: string } | null;
  reworkAudit?: { id?: string; status: string; claimIntentId?: string } | null;
}

export interface SchedulerCurrentTransitionIntegrationCandidate {
  id?: string;
  status?: string;
  readyCount?: number;
  blockedCount?: number;
}

export interface SchedulerCurrentTransitionIntegrationCheckHandoff {
  id?: string;
  integrationCheckStatus?: string;
  currentIntegrationCheckStatus?: string;
}

export interface SchedulerCurrentTransitionWorkerTarget {
  reservationIntentId: string;
  claimIntentId?: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerReworkStartId?: string;
  schedulerWorkerReworkResultId?: string;
  schedulerWorkerReworkValidationId?: string;
  schedulerWorkerReworkAuditId?: string;
}

export type SchedulerCurrentTransitionWorkerActionType =
  | "planning.scheduler.worker.reconcile-result"
  | "planning.scheduler.worker.validate-first"
  | "planning.scheduler.worker.audit-first"
  | "planning.scheduler.worker.rework-plan.compile"
  | "planning.scheduler.worker.rework-start-first"
  | "planning.scheduler.worker.rework-reconcile-result"
  | "planning.scheduler.worker.rework-validate-first"
  | "planning.scheduler.worker.rework-audit-first";

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
      kind: "worker-step";
      actionType: SchedulerCurrentTransitionWorkerActionType;
      worker: SchedulerCurrentTransitionWorkerTarget;
    }
  | {
      kind: "integration-candidate";
      actionType: "planning.scheduler.integration-candidate.compile";
    }
  | {
      kind: "integration-check";
      actionType: "planning.scheduler.integration-check.run";
      schedulerIntegrationCandidateId?: string;
    }
  | {
      kind: "integration-outcome";
      actionType: "planning.scheduler.integration-outcome.reconcile";
      schedulerIntegrationCheckHandoffId?: string;
    }
  | {
      kind: "close-blocked";
      actionType: "planning.scheduler.run.close-blocked";
      schedulerIntegrationCandidateId?: string;
    }
  | {
      kind: "run-complete";
      actionType: "planning.scheduler.run.complete";
      schedulerIntegrationOutcomeId?: string;
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
  integrationCheckHandoff?: SchedulerCurrentTransitionIntegrationCheckHandoff | null;
  integrationCheckHandoffExists?: boolean;
  integrationOutcomeExists?: boolean;
  integrationOutcomeId?: string;
  runCompletionExists?: boolean;
  runBlockedCloseoutExists?: boolean;
}

export function resolveSchedulerCurrentTransition(input: SchedulerCurrentTransitionInput): SchedulerCurrentTransition {
  if (input.runCompletionExists) return { kind: "none", reason: "SchedulerRun completion already exists." };
  if (input.runBlockedCloseoutExists) return { kind: "none", reason: "SchedulerRun blocked closeout already exists." };
  if (input.integrationOutcomeExists) {
    return {
      kind: "run-complete",
      actionType: "planning.scheduler.run.complete",
      schedulerIntegrationOutcomeId: input.integrationOutcomeId,
    };
  }
  const graphScope = input.graph ? validateGraphReservationScope(input.graph, input.reservation) : null;
  if (graphScope) return { kind: "blocked", reason: graphScope };
  const workerTransition = resolveCurrentWorkerTransition(input);
  if (workerTransition) return workerTransition;

  const candidate = input.integrationCandidate;
  if (!candidate || input.integrationCandidateNeedsRefresh) {
    return { kind: "integration-candidate", actionType: "planning.scheduler.integration-candidate.compile" };
  }
  const handoff = input.integrationCheckHandoff;
  if (handoff || input.integrationCheckHandoffExists) {
    if (!handoff) return { kind: "blocked", reason: "Scheduler integration check handoff already exists." };
    const currentStatus = handoff.currentIntegrationCheckStatus ?? handoff.integrationCheckStatus;
    if (currentStatus === "passed") {
      return { kind: "blocked", reason: "Scheduler IntegrationCheck is waiting for apply/discard." };
    }
    return {
      kind: "integration-outcome",
      actionType: "planning.scheduler.integration-outcome.reconcile",
      schedulerIntegrationCheckHandoffId: handoff.id,
    };
  }
  const readyCount = candidate.readyCount ?? 0;
  const blockedCount = candidate.blockedCount ?? 0;
  if (readyCount >= 2) {
    return {
      kind: "integration-check",
      actionType: "planning.scheduler.integration-check.run",
      schedulerIntegrationCandidateId: candidate.id,
    };
  }
  if (readyCount < 2 && blockedCount >= 0) {
    return {
      kind: "close-blocked",
      actionType: "planning.scheduler.run.close-blocked",
      schedulerIntegrationCandidateId: candidate.id,
    };
  }
  return { kind: "none", reason: "No Scheduler transition is currently legal." };
}

function resolveCurrentWorkerTransition(input: SchedulerCurrentTransitionInput): SchedulerCurrentTransition | null {
  const intents = reservedIntents(input.reservation).sort(byGraphOrReservationOrder(input.reservation, input.graph));
  if (intents.length === 0) {
    return input.workerPaths.length === 0
      ? { kind: "none", reason: "Scheduler first worker has no runnable reservation intent." }
      : { kind: "blocked", reason: "Scheduler worker paths exist without runnable reservation intents." };
  }
  const pathByIntent = new Map(input.workerPaths.map((path) => [path.start.reservationIntentId, path]));
  const waveIndexes = [...new Set(intents.map((intent) => intent.waveIndex))].sort((left, right) => left - right);
  for (const waveIndex of waveIndexes) {
    const waveIntents = intents.filter((intent) => intent.waveIndex === waveIndex);
    const wavePaths = waveIntents.map((intent) => pathByIntent.get(intent.reservationIntentId)).filter((path): path is SchedulerCurrentTransitionWorkerPath => Boolean(path));
    if (waveIntents.every((intent) => pathByIntent.get(intent.reservationIntentId)?.terminal === true)) continue;

    const nextIntent = waveIntents.find((intent) => !pathByIntent.has(intent.reservationIntentId));
    if (nextIntent) {
      if (hasWaveSourceScopeConflict(input.reservation, waveIndex, input.graph)) {
        return { kind: "blocked", reason: `Scheduler wave ${waveIndex} has conflicting source scopes.` };
      }
      if (input.workerPaths.length === 0) {
        return { kind: "start-first-worker", actionType: "planning.scheduler.worker.start-first", reservationIntent: nextIntent };
      }
      return {
        kind: wavePaths.length > 0 ? "start-same-wave-worker" : "start-next-wave-worker",
        actionType: "planning.scheduler.worker.start-next",
        reservationIntent: nextIntent,
      };
    }

    const currentPath = waveIntents
      .map((intent) => pathByIntent.get(intent.reservationIntentId))
      .find((path): path is SchedulerCurrentTransitionWorkerPath => Boolean(path && !path.terminal));
    if (!currentPath) return { kind: "blocked", reason: `Scheduler wave ${waveIndex} is not terminal but has no current worker path.` };
    return resolveWorkerPathTransition(currentPath);
  }
  return null;
}

function resolveWorkerPathTransition(path: SchedulerCurrentTransitionWorkerPath): SchedulerCurrentTransition {
  if (!path.start.id) return { kind: "blocked", reason: "Canonical Scheduler worker path is missing worker start id." };
  const worker: SchedulerCurrentTransitionWorkerTarget = {
    reservationIntentId: path.start.reservationIntentId,
    claimIntentId: path.start.claimIntentId,
    schedulerWorkerStartId: path.start.id,
    schedulerWorkerResultId: path.result?.id,
    schedulerWorkerValidationId: path.validation?.id,
    schedulerWorkerAuditId: path.audit?.id,
    schedulerWorkerReworkPlanId: path.reworkPlan?.id,
    schedulerWorkerReworkStartId: path.reworkStart?.id,
    schedulerWorkerReworkResultId: path.reworkResult?.id,
    schedulerWorkerReworkValidationId: path.reworkValidation?.id,
    schedulerWorkerReworkAuditId: path.reworkAudit?.id,
  };
  const actionType = workerActionTypeForStatus(path.status);
  const targetKey = actionType ? schedulerCurrentTransitionWorkerTargetKey(actionType) : null;
  if (targetKey && !worker[targetKey]) {
    return { kind: "blocked", reason: `Canonical Scheduler worker path is missing ${targetKey}.` };
  }
  return actionType
    ? { kind: "worker-step", actionType, worker }
    : { kind: "blocked", reason: `Canonical Scheduler worker path status is not executable: ${path.status ?? "unknown"}.` };
}

export function schedulerCurrentTransitionWorkerTargetKey(
  actionType: SchedulerCurrentTransitionWorkerActionType,
): keyof SchedulerCurrentTransitionWorkerTarget {
  switch (actionType) {
    case "planning.scheduler.worker.reconcile-result": return "schedulerWorkerStartId";
    case "planning.scheduler.worker.validate-first": return "schedulerWorkerResultId";
    case "planning.scheduler.worker.audit-first": return "schedulerWorkerValidationId";
    case "planning.scheduler.worker.rework-plan.compile": return "schedulerWorkerValidationId";
    case "planning.scheduler.worker.rework-start-first": return "schedulerWorkerReworkPlanId";
    case "planning.scheduler.worker.rework-reconcile-result": return "schedulerWorkerReworkStartId";
    case "planning.scheduler.worker.rework-validate-first": return "schedulerWorkerReworkResultId";
    case "planning.scheduler.worker.rework-audit-first": return "schedulerWorkerReworkValidationId";
  }
}

function workerActionTypeForStatus(status?: string): SchedulerCurrentTransitionWorkerActionType | null {
  switch (status) {
    case "result-pending": return "planning.scheduler.worker.reconcile-result";
    case "validation-pending": return "planning.scheduler.worker.validate-first";
    case "audit-pending": return "planning.scheduler.worker.audit-first";
    case "rework-plan-pending":
    case "audit-blocked":
    case "audit-failed":
      return "planning.scheduler.worker.rework-plan.compile";
    case "rework-start-pending": return "planning.scheduler.worker.rework-start-first";
    case "rework-result-pending": return "planning.scheduler.worker.rework-reconcile-result";
    case "rework-validation-pending": return "planning.scheduler.worker.rework-validate-first";
    case "rework-audit-pending": return "planning.scheduler.worker.rework-audit-first";
    default: return null;
  }
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

function reservedIntents(reservation: SchedulerCurrentTransitionReservation): SchedulerCurrentTransitionReservationIntent[] {
  return (reservation.reservationIntents ?? []).filter((intent) => intent.status === "reserved");
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
