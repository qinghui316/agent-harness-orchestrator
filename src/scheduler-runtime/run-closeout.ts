import { shortHash } from "../fs/path.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { completeSchedulerRun } from "../workflow-scheduler/scheduler-run.js";
import { readSchedulerRun } from "../workflow-scheduler/repository.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import { readSchedulerWorkerPathReadModels, type SchedulerWorkerPathReadModel } from "./worker-path-read-model.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRunBlockedCloseoutForCandidateStrict,
  readLatestSchedulerIntegrationCandidateStrict,
  readLatestSchedulerIntegrationCheckHandoffStrict,
  readLatestSchedulerIntegrationOutcomeStrict,
  readLatestSchedulerRunBlockedCloseoutStrict,
  readLatestSchedulerRunCompletionStrict,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  schedulerRunBlockedCloseoutArtifactRefs,
  writeSchedulerRunBlockedCloseout,
} from "./repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerRunBlockedCloseout,
  SchedulerRunBlockedCloseoutReason,
  SchedulerRunBlockedCloseoutStatus,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeState,
} from "./types.js";

export interface SchedulerRunBlockedCloseoutInput {
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerIntegrationCandidateId: string;
  reason?: Exclude<SchedulerRunBlockedCloseoutReason, "user-stopped">;
}

export interface SchedulerRunBlockedCloseoutResult {
  closeout: SchedulerRunBlockedCloseout;
  schedulerRunStatus: "completed";
  sourceMutated: false;
  executionStarted: false;
}

interface WorkerPathInspection {
  paths: SchedulerWorkerPathReadModel[];
  pendingReasons: string[];
}

export async function closeSchedulerRunBlockedOrExhausted(project: ManagedProject, input: SchedulerRunBlockedCloseoutInput): Promise<SchedulerRunBlockedCloseoutResult> {
  if ((input as { reason?: SchedulerRunBlockedCloseoutReason }).reason === "user-stopped") {
    throw new Error("planning.scheduler.run.close-blocked does not support user-stopped closeout.");
  }
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`planning.scheduler.run.close-blocked cannot resolve active Change path for ${input.changeId}.`);

  const existingRun = await readSchedulerRun(memory, changePath, input.schedulerRunId);
  if (existingRun.changeId !== input.changeId) throw new Error("planning.scheduler.run.close-blocked SchedulerRun change scope mismatch.");

  const existingCloseout = await findSchedulerRunBlockedCloseoutForCandidateStrict(memory, changePath, existingRun.id, input.schedulerIntegrationCandidateId);
  if (existingRun.status === "completed" && existingCloseout) {
    return { closeout: existingCloseout, schedulerRunStatus: "completed", sourceMutated: false, executionStarted: false };
  }

  if (existingRun.status !== "prepared") {
    throw new Error("planning.scheduler.run.close-blocked requires a prepared SchedulerRun without terminal closeout evidence.");
  }

  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.run.close-blocked SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  assertRuntimeState(runtimeState, input.changeId, run.id);
  if (!runtimeState.lastClaimReservationId || !runtimeState.lastClaimReservationSnapshotId) {
    throw new Error("planning.scheduler.run.close-blocked requires latest claim reservation evidence.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, input.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.run.close-blocked");
  if (reservation.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.run.close-blocked SchedulerRuntimeClaimReservation target is stale.");
  }
  assertHashesMatch(reservation.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "claim reservation");

  const latestCandidate = await readLatestSchedulerIntegrationCandidateStrict(memory, changePath, run.id);
  if (!latestCandidate || latestCandidate.id !== input.schedulerIntegrationCandidateId) {
    throw new Error("planning.scheduler.run.close-blocked requires the latest SchedulerIntegrationCandidate.");
  }
  assertCandidateMatchesRuntime(latestCandidate, runtimeState, reservation.id);
  assertCandidateCounts(latestCandidate);
  assertHashesMatch(latestCandidate.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "integration candidate");
  assertHashesMatch(run.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "SchedulerRun");

  if (latestCandidate.readyCount >= 2) {
    throw new Error("planning.scheduler.run.close-blocked is not allowed when SchedulerIntegrationCandidate has enough ready targets for IntegrationCheck.");
  }
  if (await readLatestSchedulerIntegrationCheckHandoffStrict(memory, changePath, run.id)) {
    throw new Error("planning.scheduler.run.close-blocked is not allowed after SchedulerIntegrationCheck handoff exists.");
  }
  if (await readLatestSchedulerIntegrationOutcomeStrict(memory, changePath, run.id)) {
    throw new Error("planning.scheduler.run.close-blocked is not allowed after SchedulerIntegrationOutcome exists.");
  }
  if (await readLatestSchedulerRunCompletionStrict(memory, changePath, run.id)) {
    throw new Error("planning.scheduler.run.close-blocked is not allowed after SchedulerRunCompletion exists.");
  }
  const latestCloseout = await readLatestSchedulerRunBlockedCloseoutStrict(memory, changePath, run.id);
  if (latestCloseout && latestCloseout.id !== existingCloseout?.id) {
    throw new Error("planning.scheduler.run.close-blocked latest SchedulerRunBlockedCloseout target is stale.");
  }

  const paths = await readSchedulerWorkerPathReadModels(memory, changePath, run.id, { schedulerClaimReservationId: reservation.id });
  const inspection: WorkerPathInspection = {
    paths,
    pendingReasons: paths.map((path) => path.pendingReason).filter((reason): reason is string => Boolean(reason)),
  };
  if (inspection.pendingReasons.length) {
    throw new Error(`planning.scheduler.run.close-blocked cannot close while scheduler worker path is pending: ${inspection.pendingReasons[0]}`);
  }
  const startedReservationIntentIds = new Set(inspection.paths.map((path) => path.start.reservationIntentId));
  const unstartedReservedIntent = reservation.reservationIntents.find((intent) =>
    intent.status === "reserved" && !startedReservationIntentIds.has(intent.reservationIntentId)
  );
  if (unstartedReservedIntent) {
    throw new Error("planning.scheduler.run.close-blocked is not allowed while a legal next scheduler worker can start.");
  }

  if (existingCloseout) {
    const completedRun = await completeSchedulerRun(memory, changePath, run, {
      summary: `SchedulerRun already has blocked/exhausted closeout evidence ${existingCloseout.id}.`,
      artifactRefs: existingCloseout.artifactRefs,
      payload: closeoutPayload(existingCloseout),
    });
    if (completedRun.status !== "completed") throw new Error("planning.scheduler.run.close-blocked failed to complete SchedulerRun.");
    return { closeout: existingCloseout, schedulerRunStatus: "completed", sourceMutated: false, executionStarted: false };
  }

  const closeout = buildCloseout(memory, changePath, runtimeState, reservation, latestCandidate, inspection, input.reason ?? classifyCloseoutReason(latestCandidate, inspection));
  await writeSchedulerRunBlockedCloseout(memory, changePath, closeout);
  const completedRun = await completeSchedulerRun(memory, changePath, run, {
    summary: `SchedulerRun closed as ${closeout.status}: ${closeout.closeoutReason}`,
    artifactRefs: closeout.artifactRefs,
    payload: closeoutPayload(closeout),
  });
  if (completedRun.status !== "completed") throw new Error("planning.scheduler.run.close-blocked failed to complete SchedulerRun.");
  await appendSchedulerRuntimeEvent(memory, changePath, completedRun, "scheduler-runtime.run-closeout-recorded", {
    status: runtimeState.status,
    summary: `SchedulerRun closeout recorded as ${closeout.status}.`,
    artifactRefs: closeout.artifactRefs,
    payload: closeoutPayload(closeout),
  });
  return { closeout, schedulerRunStatus: "completed", sourceMutated: false, executionStarted: false };
}

function buildCloseout(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  runtimeState: SchedulerRuntimeState,
  reservation: SchedulerRuntimeClaimReservation,
  candidate: SchedulerIntegrationCandidate,
  inspection: WorkerPathInspection,
  reason: SchedulerRunBlockedCloseoutReason,
): SchedulerRunBlockedCloseout {
  const status = classifyCloseoutStatus(reason, candidate);
  const closeoutId = buildCloseoutId(candidate.schedulerRunId, candidate.id, reason, status);
  const refs = schedulerRunBlockedCloseoutArtifactRefs(memory, changePath, candidate.schedulerRunId, closeoutId);
  const now = new Date().toISOString();
  const started = new Set(inspection.paths.map((path) => path.start.reservationIntentId));
  const reservationIntents = reservation.reservationIntents
    .filter((intent) => intent.status === "reserved")
    .map((intent) => intent.reservationIntentId);
  const blockedReasons = [
    ...candidate.outputs.flatMap((output) => output.blockingReasons),
    ...inspection.pendingReasons,
    ...(candidate.waitingReason ? [candidate.waitingReason] : []),
  ];
  return {
    version: "1.0",
    id: closeoutId,
    changeId: candidate.changeId,
    schedulerRunId: candidate.schedulerRunId,
    schedulerMode: candidate.schedulerMode,
    status,
    reason,
    closeoutReason: closeoutReasonText(reason, candidate),
    schedulerRuntimeStateId: candidate.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: candidate.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: candidate.schedulerClaimReservationId,
    schedulerIntegrationCandidateId: candidate.id,
    schedulerContractId: candidate.schedulerContractId,
    schedulerDispatchDryRunId: candidate.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: candidate.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: candidate.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: candidate.schedulerLaunchPreflightId,
    readyWorktreeIds: [...candidate.readyWorktreeIds],
    readyCount: candidate.readyCount,
    blockedCount: candidate.blockedCount,
    blockedReasons: [...new Set(blockedReasons)].filter(Boolean),
    unstartedReservedIntentIds: reservationIntents.filter((id) => !started.has(id)).sort(),
    sourceArtifactHashes: runtimeState.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, candidate.artifact, candidate.markdownArtifact, runtimeState.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function assertRuntimeState(state: SchedulerRuntimeState, changeId: string, schedulerRunId: string): void {
  if (state.changeId !== changeId || state.schedulerRunId !== schedulerRunId) {
    throw new Error("planning.scheduler.run.close-blocked SchedulerRuntimeState scope mismatch.");
  }
}

function assertCandidateMatchesRuntime(candidate: SchedulerIntegrationCandidate, runtimeState: SchedulerRuntimeState, reservationId: string): void {
  if (
    candidate.changeId !== runtimeState.changeId
    || candidate.schedulerRunId !== runtimeState.schedulerRunId
    || candidate.schedulerRuntimeStateId !== runtimeState.id
    || candidate.schedulerClaimReservationId !== reservationId
    || candidate.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId
  ) {
    throw new Error("planning.scheduler.run.close-blocked SchedulerIntegrationCandidate target is stale.");
  }
}

function assertCandidateCounts(candidate: SchedulerIntegrationCandidate): void {
  const readyWorktreeIds = new Set(candidate.readyWorktreeIds);
  if (candidate.readyCount !== candidate.readyTargets.length || candidate.readyCount !== readyWorktreeIds.size) {
    throw new Error("planning.scheduler.run.close-blocked SchedulerIntegrationCandidate ready target count mismatch.");
  }
  if (!candidate.readyTargets.every((target) => readyWorktreeIds.has(target.worktreeId))) {
    throw new Error("planning.scheduler.run.close-blocked SchedulerIntegrationCandidate ready target scope mismatch.");
  }
  const blockedOutputs = candidate.outputs.filter((output) => output.status === "blocked" || output.blockingReasons.length > 0).length;
  if (candidate.blockedCount !== blockedOutputs) {
    throw new Error("planning.scheduler.run.close-blocked SchedulerIntegrationCandidate blocked output count mismatch.");
  }
}

function classifyCloseoutReason(candidate: SchedulerIntegrationCandidate, inspection: WorkerPathInspection): SchedulerRunBlockedCloseoutReason {
  if (candidate.outputs.some((output) => output.kind === "inconsistency")) return "candidate-inconsistent";
  if (candidate.status === "blocked" || candidate.blockedCount > 0) return "candidate-blocked";
  if (inspection.paths.length > 0) return "candidate-waiting-exhausted";
  return "candidate-blocked";
}

function classifyCloseoutStatus(reason: SchedulerRunBlockedCloseoutReason, candidate: SchedulerIntegrationCandidate): SchedulerRunBlockedCloseoutStatus {
  if (reason === "user-stopped") return "stopped";
  if (reason === "candidate-waiting-exhausted" && candidate.blockedCount === 0) return "exhausted";
  return "blocked";
}

function closeoutReasonText(reason: SchedulerRunBlockedCloseoutReason, candidate: SchedulerIntegrationCandidate): string {
  if (reason === "user-stopped") return "User stopped the scheduler run before IntegrationCheck handoff.";
  if (reason === "candidate-inconsistent") return "Scheduler integration candidate contains inconsistent approved outputs for the same claim.";
  if (reason === "candidate-blocked") return "Scheduler integration candidate is blocked before reaching two ready targets.";
  return `Scheduler integration candidate has ${candidate.readyCount} ready target(s), fewer than the two required for IntegrationCheck, and no legal next worker remains.`;
}

function closeoutPayload(closeout: SchedulerRunBlockedCloseout): Record<string, unknown> {
  return {
    schedulerRunBlockedCloseoutId: closeout.id,
    schedulerIntegrationCandidateId: closeout.schedulerIntegrationCandidateId,
    schedulerClaimReservationId: closeout.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: closeout.schedulerReconcileSnapshotId,
    closeoutStatus: closeout.status,
    closeoutReason: closeout.reason,
    readyCount: closeout.readyCount,
    blockedCount: closeout.blockedCount,
    readyWorktreeIds: closeout.readyWorktreeIds,
    sourceMutated: false,
    executionStarted: false,
  };
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.run.close-blocked ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.run.close-blocked ${label} source artifact hash mismatch.`);
  }
}

function buildCloseoutId(schedulerRunId: string, candidateId: string, reason: string, status: string): string {
  return `scheduler-run-closeout-${shortHash(`${schedulerRunId}:${candidateId}:${reason}:${status}`).slice(0, 12)}`;
}
