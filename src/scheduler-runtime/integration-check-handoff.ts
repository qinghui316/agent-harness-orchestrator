import { canApplyResultFromGate, classifyApplyReadiness, evaluateSkillNativeApplyGate } from "../apply/gate.js";
import { shortHash } from "../fs/path.js";
import { runSkillNativeIntegrationCheck } from "../integration-check/service.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import type { IntegrationCheckRecord } from "../integration-check/types.js";
import type { ManagedProject } from "../types/index.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerIntegrationCheckHandoffForCandidate,
  readLatestSchedulerIntegrationCandidateProjection,
  readSchedulerIntegrationCandidate,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  schedulerIntegrationCheckHandoffArtifactRefs,
  writeSchedulerIntegrationCheckHandoff,
} from "./repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCandidateReadyTarget,
  SchedulerIntegrationCheckHandoff,
  SchedulerIntegrationCheckHandoffTarget,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeState,
} from "./types.js";
import {
  resolveSchedulerReadySetExecutionScope,
  type SchedulerReadySetExecutionPort,
} from "./execution-port.js";

export interface SchedulerIntegrationCheckHandoffInput {
  changeId: string;
  schedulerRunId: string;
  schedulerIntegrationCandidateId: string;
}

export interface SchedulerIntegrationCheckHandoffResult {
  handoff: SchedulerIntegrationCheckHandoff;
  integrationCheck: IntegrationCheckRecord | null;
  executionStarted: false;
}

export async function runSchedulerIntegrationCheckHandoff(project: ManagedProject, input: SchedulerIntegrationCheckHandoffInput, port: SchedulerReadySetExecutionPort): Promise<SchedulerIntegrationCheckHandoffResult> {
  const { artifacts, runtime, changePath } = await resolveSchedulerReadySetExecutionScope(project, input.changeId, "Scheduler IntegrationCheck handoff", port);
  const { run } = await readSchedulerRuntimeLineage(artifacts, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.integration-check.run SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(artifacts, changePath, run.id);
  assertRuntimeState(runtimeState, input.changeId, run.id);
  if (!runtimeState.lastClaimReservationId || !runtimeState.lastClaimReservationSnapshotId) {
    throw new Error("planning.scheduler.integration-check.run requires latest SchedulerRuntimeClaimReservation.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(artifacts, changePath, run.id, runtimeState.lastClaimReservationId);
  assertReservationMatchesRuntime(reservation, runtimeState);
  const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(artifacts, changePath, run.id);
  if (!latestCandidate || latestCandidate.id !== input.schedulerIntegrationCandidateId) {
    throw new Error("planning.scheduler.integration-check.run requires the latest SchedulerIntegrationCandidate.");
  }
  const candidate = await readSchedulerIntegrationCandidate(artifacts, changePath, run.id, input.schedulerIntegrationCandidateId);
  assertCandidateReady(candidate, runtimeState, reservation);
  const readyWorktreeIds = candidate.readyTargets.map((item) => item.worktreeId);
  assertUniqueWorktreeIds(readyWorktreeIds);

  const existing = await findSchedulerIntegrationCheckHandoffForCandidate(artifacts, changePath, run.id, candidate.id, readyWorktreeIds);
  if (existing) {
    const check = await readIntegrationCheck(runtime, existing.integrationCheckId).catch(() => null);
    return { handoff: existing, integrationCheck: check, executionStarted: false };
  }

  const readyTargets = await revalidateReadyTargets(project, port, candidate.readyTargets);
  const integrationResult = await runSkillNativeIntegrationCheck(
    project,
    runtime,
    readyTargets.map((target) => ({
      changeId: input.changeId,
      worktreeId: target.worktreeId,
      diffHash: target.worktreeDiffHash,
      diffStat: target.diffStat,
      sourceHead: target.sourceHead,
    })),
    input.changeId,
  );
  const resultTargetWorktreeIds = integrationResult.check.resultTargets.map((item) => item.worktreeId);
  const handoffId = buildSchedulerIntegrationCheckHandoffId(run.id, candidate.id, readyWorktreeIds);
  const refs = schedulerIntegrationCheckHandoffArtifactRefs(artifacts, changePath, run.id, handoffId);
  const now = new Date().toISOString();
  const handoff: SchedulerIntegrationCheckHandoff = {
    version: "1.0",
    id: handoffId,
    changeId: run.changeId,
    schedulerRunId: run.id,
    schedulerMode: run.schedulerMode,
    status: "completed",
    schedulerRuntimeStateId: runtimeState.id,
    schedulerReconcileSnapshotId: reservation.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: reservation.id,
    schedulerIntegrationCandidateId: candidate.id,
    schedulerContractId: run.schedulerContractId,
    schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: run.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
    readyTargets,
    readyWorktreeIds,
    integrationCheckId: integrationResult.check.id,
    integrationCheckStatus: integrationResult.check.status,
    resultTargetWorktreeIds,
    sourceArtifactHashes: runtimeState.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, candidate.artifact, integrationResult.check.artifactRefs[0]].filter((item): item is string => Boolean(item)),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerIntegrationCheckHandoff(artifacts, changePath, handoff);
  await appendSchedulerRuntimeEvent(artifacts, changePath, run, "scheduler-runtime.integration-check-handoff-completed", {
    status: runtimeState.status,
    summary: `Scheduler IntegrationCheck handoff completed for ${readyWorktreeIds.length} ready target(s).`,
    artifactRefs: handoff.artifactRefs,
    payload: {
      schedulerIntegrationCheckHandoffId: handoff.id,
      schedulerIntegrationCandidateId: handoff.schedulerIntegrationCandidateId,
      schedulerClaimReservationId: handoff.schedulerClaimReservationId,
      integrationCheckId: handoff.integrationCheckId,
      integrationCheckStatus: handoff.integrationCheckStatus,
      readyWorktreeIds: handoff.readyWorktreeIds,
      resultTargetWorktreeIds: handoff.resultTargetWorktreeIds,
    },
  });
  return { handoff, integrationCheck: integrationResult.check, executionStarted: false };
}

async function revalidateReadyTargets(project: ManagedProject, port: SchedulerReadySetExecutionPort, readyTargets: SchedulerIntegrationCandidateReadyTarget[]): Promise<SchedulerIntegrationCheckHandoffTarget[]> {
  const revalidated: SchedulerIntegrationCheckHandoffTarget[] = [];
  for (const target of readyTargets) {
    const gate = await evaluateSkillNativeApplyGate(project, port.runtime, port.harness, target.worktreeId);
    const readiness = classifyApplyReadiness(gate);
    if (!canApplyResultFromGate(gate) || readiness.kind !== "ready") {
      throw new Error(`planning.scheduler.integration-check.run ready target is no longer apply-ready: ${target.worktreeId}. ${readiness.message}`);
    }
    if (gate.diffHash !== target.worktreeDiffHash) {
      throw new Error(`planning.scheduler.integration-check.run worktree diff hash drifted: ${target.worktreeId}.`);
    }
    if ((gate.sourceHead ?? null) !== (target.sourceHead ?? null)) {
      throw new Error(`planning.scheduler.integration-check.run source HEAD drifted for worktree: ${target.worktreeId}.`);
    }
    if (gate.validation?.id !== target.validationRunId) {
      throw new Error(`planning.scheduler.integration-check.run validation evidence drifted for worktree: ${target.worktreeId}.`);
    }
    if (gate.audit?.id !== target.auditRunId) {
      throw new Error(`planning.scheduler.integration-check.run audit evidence drifted for worktree: ${target.worktreeId}.`);
    }
    revalidated.push({
      worktreeId: target.worktreeId,
      worktreeDiffHash: gate.diffHash,
      diffStat: gate.diffStat,
      sourceHead: gate.sourceHead,
      validationRunId: target.validationRunId,
      auditRunId: target.auditRunId,
    });
  }
  return revalidated;
}

function assertRuntimeState(state: SchedulerRuntimeState, changeId: string, schedulerRunId: string): void {
  if (state.changeId !== changeId || state.schedulerRunId !== schedulerRunId) {
    throw new Error("planning.scheduler.integration-check.run SchedulerRuntimeState scope mismatch.");
  }
}

function assertReservationMatchesRuntime(reservation: SchedulerRuntimeClaimReservation, runtimeState: SchedulerRuntimeState): void {
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.integration-check.run");
  if (
    reservation.changeId !== runtimeState.changeId
    || reservation.schedulerRunId !== runtimeState.schedulerRunId
    || reservation.schedulerRuntimeStateId !== runtimeState.id
  ) {
    throw new Error("planning.scheduler.integration-check.run SchedulerRuntimeClaimReservation target is stale.");
  }
  assertHashesMatch(reservation.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "claim reservation");
}

function assertCandidateReady(candidate: SchedulerIntegrationCandidate, runtimeState: SchedulerRuntimeState, reservation: SchedulerRuntimeClaimReservation): void {
  if (
    candidate.changeId !== runtimeState.changeId
    || candidate.schedulerRunId !== runtimeState.schedulerRunId
    || candidate.schedulerRuntimeStateId !== runtimeState.id
    || candidate.schedulerClaimReservationId !== reservation.id
    || candidate.schedulerReconcileSnapshotId !== reservation.schedulerReconcileSnapshotId
  ) {
    throw new Error("planning.scheduler.integration-check.run SchedulerIntegrationCandidate target is stale.");
  }
  if (candidate.status !== "ready" || candidate.readyCount < 2 || candidate.readyTargets.length < 2) {
    throw new Error("planning.scheduler.integration-check.run requires a ready SchedulerIntegrationCandidate with at least two ready targets.");
  }
  if (candidate.readyWorktreeIds.length !== candidate.readyTargets.length) {
    throw new Error("planning.scheduler.integration-check.run SchedulerIntegrationCandidate ready target shape mismatch.");
  }
  assertHashesMatch(candidate.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "integration candidate");
}

function assertUniqueWorktreeIds(worktreeIds: string[]): void {
  const seen = new Set<string>();
  for (const worktreeId of worktreeIds) {
    if (seen.has(worktreeId)) throw new Error(`planning.scheduler.integration-check.run duplicate ready worktree target: ${worktreeId}.`);
    seen.add(worktreeId);
  }
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.integration-check.run ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.integration-check.run ${label} source artifact hash mismatch.`);
  }
}

function buildSchedulerIntegrationCheckHandoffId(schedulerRunId: string, candidateId: string, worktreeIds: string[]): string {
  return `scheduler-integration-check-handoff-${shortHash(`${schedulerRunId}:${candidateId}:${[...worktreeIds].sort().join(",")}`).slice(0, 12)}`;
}
