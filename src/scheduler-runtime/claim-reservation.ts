import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { readSchedulerRun } from "../workflow-scheduler/repository.js";
import { assertSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerClaimReservationForSnapshot,
  readSchedulerReconcileSnapshot,
  readSchedulerRuntimeState,
  schedulerClaimReservationArtifactRefs,
  writeSchedulerRuntimeClaimReservation,
  writeSchedulerRuntimeState,
} from "./repository.js";
import type {
  SchedulerReconcileSnapshot,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeClaimReservationIntent,
  SchedulerRuntimeSourceLockReservation,
  SchedulerRuntimeWaveReservation,
} from "./types.js";

export async function reserveSchedulerRuntimeClaims(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId: string,
  schedulerReconcileSnapshotId: string,
): Promise<SchedulerRuntimeClaimReservation> {
  const run = await readSchedulerRun(memory, changePath, schedulerRunId);
  await assertSchedulerRuntimeLineage(memory, changePath, run);
  const state = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (state.changeId !== run.changeId || state.schedulerRunId !== run.id) {
    throw new Error("SchedulerRuntimeState does not match SchedulerRun scope.");
  }
  if (state.lastReconcileSnapshotId !== schedulerReconcileSnapshotId) {
    throw new Error("Scheduler claim reservation requires the latest reconcile snapshot.");
  }
  const snapshot = await readSchedulerReconcileSnapshot(memory, changePath, run.id, schedulerReconcileSnapshotId);
  validateSnapshotScope(run.id, run.changeId, state.id, snapshot);
  await assertSourceHashes(memory, run.sourceArtifactHashes, state.sourceArtifactHashes, snapshot.sourceArtifactHashes);
  const existingForSnapshot = await findSchedulerClaimReservationForSnapshot(memory, changePath, run.id, snapshot.id);
  if (existingForSnapshot) {
    throw new Error("Scheduler claim reservation already exists for this reconcile snapshot.");
  }

  const now = new Date().toISOString();
  const id = `scheduler-claim-reservation-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${snapshot.id}:${now}`).slice(0, 8)}`;
  const currentWave = selectCurrentWave(snapshot);
  const reservationIntents = snapshot.claimIntents
    .filter((claim) => claim.waveIndex === currentWave.waveIndex)
    .map((claim): SchedulerRuntimeClaimReservationIntent => ({
      reservationIntentId: `reservation-intent-${shortHash(`${id}:${claim.claimIntentId}`).slice(0, 12)}`,
      claimIntentId: claim.claimIntentId,
      plannedWorkerKey: claim.plannedWorkerKey,
      nodeId: claim.nodeId,
      unitId: claim.unitId,
      waveIndex: claim.waveIndex,
      status: claim.status === "blocked" ? "blocked" : "reserved",
      plannedSlotDemand: claim.plannedSlotDemand,
      sourceScopes: claim.sourceScopes,
      blockedReasons: claim.blockedReasons,
    }));
  assertNoSameWaveSourceLockConflict(reservationIntents);
  const reservedCount = reservationIntents.filter((intent) => intent.status === "reserved").length;
  const blockedCount = reservationIntents.filter((intent) => intent.status === "blocked").length;
  const sourceLocks = buildSourceLocks(reservationIntents);
  const waveReservation: SchedulerRuntimeWaveReservation = {
    waveIndex: currentWave.waveIndex,
    reservationIntentIds: reservationIntents.map((intent) => intent.reservationIntentId),
    reservedCount,
    blockedCount,
    plannedSlotDemand: reservationIntents.reduce((total, intent) => total + (intent.status === "reserved" ? intent.plannedSlotDemand : 0), 0),
    status: blockedCount > 0 || reservedCount === 0 ? "blocked" : "reserved",
    blockedReasons: currentWave.blockedReasons,
  };
  const refs = schedulerClaimReservationArtifactRefs(memory, changePath, run.id, id);
  const supersedesReservationId = state.lastClaimReservationSnapshotId && state.lastClaimReservationSnapshotId !== snapshot.id
    ? state.lastClaimReservationId
    : undefined;
  const reservation: SchedulerRuntimeClaimReservation = {
    version: "1.0",
    id,
    changeId: run.changeId,
    schedulerRunId: run.id,
    schedulerMode: run.schedulerMode,
    status: waveReservation.status === "reserved" ? "reserved" : "blocked",
    schedulerRuntimeStateId: state.id,
    schedulerReconcileSnapshotId: snapshot.id,
    schedulerContractId: run.schedulerContractId,
    schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: run.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
    reservationIntents,
    waves: [waveReservation],
    sourceLocks,
    reservedCount,
    blockedCount,
    sourceLockCount: sourceLocks.length,
    supersedesReservationId,
    sourceArtifactHashes: run.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, state.artifact, snapshot.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
  };
  await writeSchedulerRuntimeClaimReservation(memory, changePath, reservation);
  await writeSchedulerRuntimeState(memory, changePath, {
    ...state,
    lastClaimReservationId: reservation.id,
    lastClaimReservationSnapshotId: snapshot.id,
    updatedAt: now,
  });
  if (supersedesReservationId) {
    await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.claim-reservation.superseded", {
      status: state.status,
      summary: "A newer reconcile snapshot created a new claim reservation. The previous reservation artifact was not modified.",
      artifactRefs: [reservation.artifact, reservation.markdownArtifact],
      payload: {
        supersededReservationId: supersedesReservationId,
        schedulerReconcileSnapshotId: snapshot.id,
        schedulerClaimReservationId: reservation.id,
      },
    });
  }
  await appendSchedulerRuntimeEvent(memory, changePath, run, reservation.status === "reserved" ? "scheduler-runtime.claim-reserved" : "scheduler-runtime.claim-blocked", {
    status: state.status,
    summary: "Scheduler runtime claim reservation recorded. No WorkerLeases, WorkerSessions, TaskRuns, slots, worktrees, runs, or workers were created.",
    artifactRefs: [reservation.artifact, reservation.markdownArtifact],
    payload: {
      schedulerRuntimeStateId: state.id,
      schedulerReconcileSnapshotId: snapshot.id,
      schedulerClaimReservationId: reservation.id,
      reservedCount: reservation.reservedCount,
      blockedCount: reservation.blockedCount,
      sourceLockCount: reservation.sourceLockCount,
    },
  });
  return reservation;
}

function validateSnapshotScope(schedulerRunId: string, changeId: string, stateId: string, snapshot: SchedulerReconcileSnapshot): void {
  if (snapshot.schedulerRunId !== schedulerRunId || snapshot.changeId !== changeId || snapshot.schedulerRuntimeStateId !== stateId) {
    throw new Error("SchedulerReconcileSnapshot does not match SchedulerRun runtime scope.");
  }
}

async function assertSourceHashes(memory: ResolvedMemory, runHashes: Record<string, string>, stateHashes: Record<string, string>, snapshotHashes: Record<string, string>): Promise<void> {
  const expectedHashes = await hashArtifactRefs(memory, Object.keys(runHashes));
  for (const [artifact, hash] of Object.entries(expectedHashes)) {
    if (runHashes[artifact] !== hash || stateHashes[artifact] !== hash || snapshotHashes[artifact] !== hash) {
      throw new Error(`Scheduler claim reservation source artifact hash mismatch: ${artifact}.`);
    }
  }
}

function selectCurrentWave(snapshot: SchedulerReconcileSnapshot) {
  const sortedWaves = [...snapshot.waves].sort((a, b) => a.waveIndex - b.waveIndex);
  const waveWithWork = sortedWaves.find((wave) => wave.candidateCount > 0 || wave.blockedCount > 0);
  if (!waveWithWork) {
    throw new Error("Scheduler claim reservation requires at least one reconcile wave.");
  }
  return waveWithWork;
}

function assertNoSameWaveSourceLockConflict(intents: SchedulerRuntimeClaimReservationIntent[]): void {
  const scopeOwners = new Map<string, string>();
  for (const intent of intents.filter((candidate) => candidate.status === "reserved")) {
    for (const scope of intent.sourceScopes) {
      const existing = scopeOwners.get(scope);
      if (existing && existing !== intent.reservationIntentId) {
        throw new Error(`Scheduler claim reservation source lock conflict in same wave: ${scope}.`);
      }
      scopeOwners.set(scope, intent.reservationIntentId);
    }
  }
}

function buildSourceLocks(intents: SchedulerRuntimeClaimReservationIntent[]): SchedulerRuntimeSourceLockReservation[] {
  const locks = new Map<string, SchedulerRuntimeSourceLockReservation>();
  for (const intent of intents) {
    for (const scope of intent.sourceScopes) {
      const existing = locks.get(scope);
      if (existing) {
        existing.reservationIntentIds.push(intent.reservationIntentId);
        if (intent.status === "blocked") {
          existing.status = "blocked";
          existing.blockedReasons.push(...intent.blockedReasons);
        }
        continue;
      }
      locks.set(scope, {
        scope,
        waveIndex: intent.waveIndex,
        reservationIntentIds: [intent.reservationIntentId],
        status: intent.status === "blocked" ? "blocked" : "reserved",
        blockedReasons: intent.status === "blocked" ? [...intent.blockedReasons] : [],
      });
    }
  }
  return [...locks.values()];
}
