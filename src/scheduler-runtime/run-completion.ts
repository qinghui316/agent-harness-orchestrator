import { shortHash } from "../fs/path.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import type { IntegrationCheckRecord } from "../integration-check/types.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { completeSchedulerRun } from "../workflow-scheduler/scheduler-run.js";
import { readSchedulerRun } from "../workflow-scheduler/repository.js";
import { readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRunCompletionForOutcome,
  readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection,
  readLatestSchedulerIntegrationOutcomeProjection,
  readSchedulerIntegrationOutcome,
  readSchedulerRuntimeState,
  schedulerRunCompletionArtifactRefs,
  writeSchedulerRunCompletion,
} from "./repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerIntegrationOutcome,
  SchedulerRunCompletion,
  SchedulerRuntimeState,
} from "./types.js";

export interface SchedulerRunCompletionInput {
  changeId: string;
  schedulerRunId: string;
  schedulerIntegrationOutcomeId: string;
}

export interface SchedulerRunCompletionResult {
  completion: SchedulerRunCompletion;
  schedulerRunStatus: "completed";
  sourceMutated: false;
}

export async function completeSchedulerRunFromIntegrationOutcome(project: ManagedProject, input: SchedulerRunCompletionInput): Promise<SchedulerRunCompletionResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`planning.scheduler.run.complete cannot resolve active Change path for ${input.changeId}.`);

  const existingRun = await readSchedulerRun(memory, changePath, input.schedulerRunId);
  if (existingRun.changeId !== input.changeId) throw new Error("planning.scheduler.run.complete SchedulerRun change scope mismatch.");
  const latestOutcome = await readLatestSchedulerIntegrationOutcomeProjection(memory, changePath, existingRun.id);
  if (!latestOutcome || latestOutcome.id !== input.schedulerIntegrationOutcomeId) {
    throw new Error("planning.scheduler.run.complete requires the latest SchedulerIntegrationOutcome.");
  }
  const existingCompletion = await findSchedulerRunCompletionForOutcome(memory, changePath, existingRun.id, input.schedulerIntegrationOutcomeId);
  if (existingCompletion) {
    const completedRun = await completeSchedulerRun(memory, changePath, existingRun, {
      summary: `SchedulerRun already has terminal completion evidence ${existingCompletion.id}.`,
      artifactRefs: existingCompletion.artifactRefs,
      payload: completionPayload(existingCompletion),
    });
    if (completedRun.status !== "completed") throw new Error("planning.scheduler.run.complete failed to complete SchedulerRun.");
    return { completion: existingCompletion, schedulerRunStatus: "completed", sourceMutated: false };
  }

  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.run.complete SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  assertRuntimeState(runtimeState, input.changeId, run.id);

  const outcome = await readSchedulerIntegrationOutcome(memory, changePath, run.id, input.schedulerIntegrationOutcomeId);
  assertOutcomeMatchesRuntime(outcome, runtimeState);
  const latestHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, run.id);
  assertHandoffMatchesOutcome(latestHandoff, outcome, runtimeState);
  const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  assertCandidateMatchesOutcome(latestCandidate, outcome, runtimeState);
  const check = await readIntegrationCheck(memory, outcome.integrationCheckId);
  assertIntegrationCheckMatchesOutcome(check, outcome);

  const completion = buildCompletion(memory, changePath, runtimeState, outcome);
  await writeSchedulerRunCompletion(memory, changePath, completion);
  const completedRun = await completeSchedulerRun(memory, changePath, run, {
    summary: `SchedulerRun completed from scheduler integration outcome ${outcome.status}.`,
    artifactRefs: completion.artifactRefs,
    payload: completionPayload(completion),
  });
  if (completedRun.status !== "completed") throw new Error("planning.scheduler.run.complete failed to complete SchedulerRun.");
  await appendSchedulerRuntimeEvent(memory, changePath, completedRun, "scheduler-runtime.run-completed", {
    status: runtimeState.status,
    summary: `SchedulerRun completed as ${completion.status}.`,
    artifactRefs: completion.artifactRefs,
    payload: completionPayload(completion),
  });
  return { completion, schedulerRunStatus: "completed", sourceMutated: false };
}

function buildCompletion(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  runtimeState: SchedulerRuntimeState,
  outcome: SchedulerIntegrationOutcome,
): SchedulerRunCompletion {
  const completionId = buildSchedulerRunCompletionId(outcome.schedulerRunId, outcome.id, outcome.status);
  const refs = schedulerRunCompletionArtifactRefs(memory, changePath, outcome.schedulerRunId, completionId);
  const now = new Date().toISOString();
  return {
    version: "1.0",
    id: completionId,
    changeId: outcome.changeId,
    schedulerRunId: outcome.schedulerRunId,
    schedulerMode: outcome.schedulerMode,
    status: classifyCompletionStatus(outcome),
    schedulerRuntimeStateId: outcome.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: outcome.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: outcome.schedulerClaimReservationId,
    schedulerIntegrationCandidateId: outcome.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: outcome.schedulerIntegrationCheckHandoffId,
    schedulerIntegrationOutcomeId: outcome.id,
    schedulerContractId: outcome.schedulerContractId,
    schedulerDispatchDryRunId: outcome.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: outcome.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: outcome.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: outcome.schedulerLaunchPreflightId,
    integrationCheckId: outcome.integrationCheckId,
    integrationCheckStatus: outcome.integrationCheckStatus,
    outcomeStatus: outcome.status,
    outcomeReason: outcome.outcomeReason,
    readyWorktreeIds: [...outcome.readyWorktreeIds],
    resultTargetWorktreeIds: [...outcome.resultTargetWorktreeIds],
    sourceArtifactHashes: runtimeState.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, outcome.artifact, outcome.markdownArtifact].filter((item): item is string => Boolean(item)),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function assertRuntimeState(state: SchedulerRuntimeState, changeId: string, schedulerRunId: string): void {
  if (state.changeId !== changeId || state.schedulerRunId !== schedulerRunId) {
    throw new Error("planning.scheduler.run.complete SchedulerRuntimeState scope mismatch.");
  }
}

function assertOutcomeMatchesRuntime(outcome: SchedulerIntegrationOutcome, runtimeState: SchedulerRuntimeState): void {
  if (
    outcome.changeId !== runtimeState.changeId
    || outcome.schedulerRunId !== runtimeState.schedulerRunId
    || outcome.schedulerRuntimeStateId !== runtimeState.id
    || outcome.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId
    || outcome.schedulerReconcileSnapshotId !== runtimeState.lastReconcileSnapshotId
    || outcome.schedulerClaimReservationId !== runtimeState.lastClaimReservationId
  ) {
    throw new Error("planning.scheduler.run.complete SchedulerIntegrationOutcome target is stale.");
  }
  assertHashesMatch(outcome.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "outcome");
}

function assertHandoffMatchesOutcome(handoff: SchedulerIntegrationCheckHandoff | null, outcome: SchedulerIntegrationOutcome, runtimeState: SchedulerRuntimeState): void {
  if (!handoff) throw new Error("planning.scheduler.run.complete requires the latest SchedulerIntegrationCheckHandoff.");
  if (
    handoff.id !== outcome.schedulerIntegrationCheckHandoffId
    || handoff.changeId !== outcome.changeId
    || handoff.schedulerRunId !== outcome.schedulerRunId
    || handoff.schedulerRuntimeStateId !== runtimeState.id
    || handoff.schedulerClaimReservationId !== outcome.schedulerClaimReservationId
    || handoff.schedulerReconcileSnapshotId !== outcome.schedulerReconcileSnapshotId
    || handoff.schedulerIntegrationCandidateId !== outcome.schedulerIntegrationCandidateId
    || handoff.integrationCheckId !== outcome.integrationCheckId
  ) {
    throw new Error("planning.scheduler.run.complete SchedulerIntegrationCheckHandoff target is stale.");
  }
  assertSameWorktreeSet(handoff.readyWorktreeIds, outcome.readyWorktreeIds, "handoff ready");
  assertSameWorktreeSet(handoff.resultTargetWorktreeIds, outcome.resultTargetWorktreeIds, "handoff result target");
  assertHashesMatch(handoff.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "handoff");
}

function assertCandidateMatchesOutcome(candidate: SchedulerIntegrationCandidate | null, outcome: SchedulerIntegrationOutcome, runtimeState: SchedulerRuntimeState): void {
  if (!candidate) throw new Error("planning.scheduler.run.complete requires the latest SchedulerIntegrationCandidate.");
  if (
    candidate.id !== outcome.schedulerIntegrationCandidateId
    || candidate.changeId !== outcome.changeId
    || candidate.schedulerRunId !== outcome.schedulerRunId
    || candidate.schedulerRuntimeStateId !== runtimeState.id
    || candidate.schedulerClaimReservationId !== outcome.schedulerClaimReservationId
    || candidate.schedulerReconcileSnapshotId !== outcome.schedulerReconcileSnapshotId
  ) {
    throw new Error("planning.scheduler.run.complete SchedulerIntegrationCandidate target is stale.");
  }
  assertSameWorktreeSet(candidate.readyWorktreeIds, outcome.readyWorktreeIds, "candidate ready");
  assertHashesMatch(candidate.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "candidate");
}

function assertIntegrationCheckMatchesOutcome(check: IntegrationCheckRecord, outcome: SchedulerIntegrationOutcome): void {
  if (check.id !== outcome.integrationCheckId) throw new Error("planning.scheduler.run.complete IntegrationCheck id mismatch.");
  if (check.status !== outcome.integrationCheckStatus) throw new Error("planning.scheduler.run.complete IntegrationCheck status drifted.");
  if (check.status === "passed") throw new Error("planning.scheduler.run.complete cannot complete SchedulerRun while IntegrationCheck is waiting for apply/discard.");
  assertSameWorktreeSet(check.resultTargets.map((target) => target.worktreeId), outcome.resultTargetWorktreeIds, "IntegrationCheck result target");
  for (const target of check.resultTargets) {
    const outcomeTarget = outcome.targets.find((item) => item.worktreeId === target.worktreeId);
    if (!outcomeTarget) throw new Error(`planning.scheduler.run.complete missing outcome target: ${target.worktreeId}.`);
    if (outcomeTarget.changeId !== target.changeId) throw new Error(`planning.scheduler.run.complete target change scope mismatch: ${target.worktreeId}.`);
    if (outcomeTarget.diffHash !== target.diffHash) throw new Error(`planning.scheduler.run.complete target diff hash mismatch: ${target.worktreeId}.`);
    if ((outcomeTarget.sourceHead ?? null) !== (target.sourceHead ?? null)) throw new Error(`planning.scheduler.run.complete target source HEAD mismatch: ${target.worktreeId}.`);
  }
}

function classifyCompletionStatus(outcome: SchedulerIntegrationOutcome): SchedulerRunCompletion["status"] {
  if (outcome.status === "applied") return "completed-applied";
  if (outcome.status === "discarded") return "completed-discarded";
  return "completed-blocked";
}

function completionPayload(completion: SchedulerRunCompletion): Record<string, unknown> {
  return {
    schedulerRunCompletionId: completion.id,
    schedulerIntegrationOutcomeId: completion.schedulerIntegrationOutcomeId,
    schedulerIntegrationCheckHandoffId: completion.schedulerIntegrationCheckHandoffId,
    schedulerIntegrationCandidateId: completion.schedulerIntegrationCandidateId,
    schedulerClaimReservationId: completion.schedulerClaimReservationId,
    integrationCheckId: completion.integrationCheckId,
    integrationCheckStatus: completion.integrationCheckStatus,
    completionStatus: completion.status,
    outcomeStatus: completion.outcomeStatus,
    readyWorktreeIds: completion.readyWorktreeIds,
    resultTargetWorktreeIds: completion.resultTargetWorktreeIds,
  };
}

function assertSameWorktreeSet(left: string[], right: string[], label: string): void {
  const l = [...left].sort((a, b) => a.localeCompare(b));
  const r = [...right].sort((a, b) => a.localeCompare(b));
  if (l.length !== r.length || l.some((item, index) => item !== r[index])) {
    throw new Error(`planning.scheduler.run.complete ${label} worktree set mismatch.`);
  }
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.run.complete ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.run.complete ${label} source artifact hash mismatch.`);
  }
}

function buildSchedulerRunCompletionId(schedulerRunId: string, outcomeId: string, outcomeStatus: string): string {
  return `scheduler-run-completion-${shortHash(`${schedulerRunId}:${outcomeId}:${outcomeStatus}`).slice(0, 12)}`;
}
