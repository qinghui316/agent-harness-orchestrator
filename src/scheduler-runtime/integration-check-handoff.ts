import { canApplyResultFromGate, classifyApplyReadiness } from "../apply/gate.js";
import { previewWorktreeApply } from "../apply/preview.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { shortHash } from "../fs/path.js";
import { runIntegrationCheck } from "../integration-check/service.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import type { IntegrationCheckRecord } from "../integration-check/types.js";
import { resolveProjectMemory } from "../memory/resolver.js";
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

export async function runSchedulerIntegrationCheckHandoff(project: ManagedProject, input: SchedulerIntegrationCheckHandoffInput): Promise<SchedulerIntegrationCheckHandoffResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler IntegrationCheck handoff cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.integration-check.run SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  assertRuntimeState(runtimeState, input.changeId, run.id);
  if (!runtimeState.lastClaimReservationId || !runtimeState.lastClaimReservationSnapshotId) {
    throw new Error("planning.scheduler.integration-check.run requires latest SchedulerRuntimeClaimReservation.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, runtimeState.lastClaimReservationId);
  assertReservationMatchesRuntime(reservation, runtimeState);
  const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  if (!latestCandidate || latestCandidate.id !== input.schedulerIntegrationCandidateId) {
    throw new Error("planning.scheduler.integration-check.run requires the latest SchedulerIntegrationCandidate.");
  }
  const candidate = await readSchedulerIntegrationCandidate(memory, changePath, run.id, input.schedulerIntegrationCandidateId);
  assertCandidateReady(candidate, runtimeState, reservation);
  const readyWorktreeIds = candidate.readyTargets.map((item) => item.worktreeId);
  assertUniqueWorktreeIds(readyWorktreeIds);

  const existing = await findSchedulerIntegrationCheckHandoffForCandidate(memory, changePath, run.id, candidate.id, readyWorktreeIds);
  if (existing) {
    const check = await readIntegrationCheck(memory, existing.integrationCheckId).catch(() => null);
    return { handoff: existing, integrationCheck: check, executionStarted: false };
  }

  const readyTargets = await revalidateReadyTargets(project, candidate.readyTargets);
  const integrationResult = await runIntegrationCheck(project, readyWorktreeIds, input.changeId);
  const resultTargetWorktreeIds = integrationResult.check.resultTargets.map((item) => item.worktreeId);
  const handoffId = buildSchedulerIntegrationCheckHandoffId(run.id, candidate.id, readyWorktreeIds);
  const refs = schedulerIntegrationCheckHandoffArtifactRefs(memory, changePath, run.id, handoffId);
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
  await writeSchedulerIntegrationCheckHandoff(memory, changePath, handoff);
  await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.integration-check-handoff-completed", {
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

async function revalidateReadyTargets(project: ManagedProject, readyTargets: SchedulerIntegrationCandidateReadyTarget[]): Promise<SchedulerIntegrationCheckHandoffTarget[]> {
  const revalidated: SchedulerIntegrationCheckHandoffTarget[] = [];
  for (const target of readyTargets) {
    const preview = await previewWorktreeApply(project, target.worktreeId);
    const readiness = classifyApplyReadiness(preview.gate);
    if (!canApplyResultFromGate(preview.gate) || readiness.kind !== "ready") {
      throw new Error(`planning.scheduler.integration-check.run ready target is no longer apply-ready: ${target.worktreeId}. ${readiness.message}`);
    }
    if (preview.gate.diffHash !== target.worktreeDiffHash) {
      throw new Error(`planning.scheduler.integration-check.run worktree diff hash drifted: ${target.worktreeId}.`);
    }
    if ((preview.gate.sourceHead ?? null) !== (target.sourceHead ?? null)) {
      throw new Error(`planning.scheduler.integration-check.run source HEAD drifted for worktree: ${target.worktreeId}.`);
    }
    if (preview.gate.validation?.id !== target.validationRunId) {
      throw new Error(`planning.scheduler.integration-check.run validation evidence drifted for worktree: ${target.worktreeId}.`);
    }
    if (preview.gate.audit?.id !== target.auditRunId) {
      throw new Error(`planning.scheduler.integration-check.run audit evidence drifted for worktree: ${target.worktreeId}.`);
    }
    revalidated.push({
      worktreeId: target.worktreeId,
      worktreeDiffHash: preview.gate.diffHash,
      diffStat: preview.gate.diffStat,
      sourceHead: preview.gate.sourceHead,
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
