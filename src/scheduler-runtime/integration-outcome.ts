import { shortHash } from "../fs/path.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import type { IntegrationCheckRecord } from "../integration-check/types.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { getWorktreeStatus } from "../worktree/manager.js";
import { readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerIntegrationOutcomeForHandoff,
  readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection,
  readSchedulerIntegrationCheckHandoff,
  readSchedulerRuntimeState,
  schedulerIntegrationOutcomeArtifactRefs,
  writeSchedulerIntegrationOutcome,
} from "./repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerIntegrationOutcome,
  SchedulerIntegrationOutcomeTarget,
  SchedulerRuntimeState,
} from "./types.js";

export interface SchedulerIntegrationOutcomeInput {
  changeId: string;
  schedulerRunId: string;
  schedulerIntegrationCheckHandoffId: string;
}

export interface SchedulerIntegrationOutcomeResult {
  status: "waiting-for-apply" | "reconciled";
  outcome: SchedulerIntegrationOutcome | null;
  integrationCheck: IntegrationCheckRecord;
  summary: string;
  sourceMutated: false;
}

const BLOCKED_STATUSES = new Set<IntegrationCheckRecord["status"]>([
  "conflict",
  "validation-failed",
  "audit-failed",
  "stale-result",
  "failed",
]);

export async function reconcileSchedulerIntegrationOutcome(project: ManagedProject, input: SchedulerIntegrationOutcomeInput): Promise<SchedulerIntegrationOutcomeResult> {
  const memory = await resolveProjectMemory(project);
  const target = await readSchedulerRuntimeLineageForInput(project, input);
  const { changePath, run } = target;
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  assertRuntimeState(runtimeState, input.changeId, run.id);

  const latestHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, run.id);
  if (!latestHandoff || latestHandoff.id !== input.schedulerIntegrationCheckHandoffId) {
    throw new Error("planning.scheduler.integration-outcome.reconcile requires the latest SchedulerIntegrationCheckHandoff.");
  }
  const handoff = await readSchedulerIntegrationCheckHandoff(memory, changePath, run.id, input.schedulerIntegrationCheckHandoffId);
  assertHandoffMatchesRuntime(handoff, runtimeState);
  const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  assertCandidateMatchesHandoff(latestCandidate, handoff, runtimeState);

  const check = await readIntegrationCheck(memory, handoff.integrationCheckId);
  assertIntegrationCheckMatchesHandoff(check, handoff);
  const targets = await readOutcomeTargets(memory, handoff, check);

  const existing = await findSchedulerIntegrationOutcomeForHandoff(memory, changePath, run.id, handoff.id);
  if (existing) {
    if (existing.integrationCheckStatus !== check.status) {
      throw new Error("planning.scheduler.integration-outcome.reconcile existing outcome conflicts with current IntegrationCheck status.");
    }
    return {
      status: "reconciled",
      outcome: existing,
      integrationCheck: check,
      summary: `Scheduler integration outcome already recorded as ${existing.status}.`,
      sourceMutated: false,
    };
  }

  if (check.status === "passed") {
    return {
      status: "waiting-for-apply",
      outcome: null,
      integrationCheck: check,
      summary: `IntegrationCheck ${check.id} passed and is waiting for the existing apply/discard confirmation.`,
      sourceMutated: false,
    };
  }

  const outcome = buildOutcome(memory, changePath, runtimeState, handoff, check, targets);
  await writeSchedulerIntegrationOutcome(memory, changePath, outcome);
  await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.integration-outcome-recorded", {
    status: runtimeState.status,
    summary: `Scheduler integration outcome recorded as ${outcome.status}.`,
    artifactRefs: outcome.artifactRefs,
    payload: {
      schedulerIntegrationOutcomeId: outcome.id,
      schedulerIntegrationCheckHandoffId: outcome.schedulerIntegrationCheckHandoffId,
      schedulerIntegrationCandidateId: outcome.schedulerIntegrationCandidateId,
      schedulerClaimReservationId: outcome.schedulerClaimReservationId,
      integrationCheckId: outcome.integrationCheckId,
      integrationCheckStatus: outcome.integrationCheckStatus,
      outcomeStatus: outcome.status,
      readyWorktreeIds: outcome.readyWorktreeIds,
      resultTargetWorktreeIds: outcome.resultTargetWorktreeIds,
    },
  });
  return {
    status: "reconciled",
    outcome,
    integrationCheck: check,
    summary: `Scheduler integration outcome recorded as ${outcome.status}.`,
    sourceMutated: false,
  };
}

async function readSchedulerRuntimeLineageForInput(project: ManagedProject, input: SchedulerIntegrationOutcomeInput) {
  const memory = await resolveProjectMemory(project);
  const { resolveRunnableChangeTarget } = await import("../change/target.js");
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler integration outcome cannot resolve active Change path for ${input.changeId}.`);
  const lineage = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (lineage.run.changeId !== input.changeId) throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerRun change scope mismatch.");
  return { changePath, ...lineage };
}

function assertRuntimeState(state: SchedulerRuntimeState, changeId: string, schedulerRunId: string): void {
  if (state.changeId !== changeId || state.schedulerRunId !== schedulerRunId) {
    throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerRuntimeState scope mismatch.");
  }
}

function assertHandoffMatchesRuntime(handoff: SchedulerIntegrationCheckHandoff, runtimeState: SchedulerRuntimeState): void {
  if (
    handoff.changeId !== runtimeState.changeId
    || handoff.schedulerRunId !== runtimeState.schedulerRunId
    || handoff.schedulerRuntimeStateId !== runtimeState.id
    || handoff.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId
    || handoff.schedulerClaimReservationId !== runtimeState.lastClaimReservationId
  ) {
    throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerIntegrationCheckHandoff target is stale.");
  }
  assertHashesMatch(handoff.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "handoff");
}

function assertCandidateMatchesHandoff(candidate: SchedulerIntegrationCandidate | null, handoff: SchedulerIntegrationCheckHandoff, runtimeState: SchedulerRuntimeState): void {
  if (!candidate) {
    throw new Error("planning.scheduler.integration-outcome.reconcile requires the latest SchedulerIntegrationCandidate.");
  }
  if (
    candidate.id !== handoff.schedulerIntegrationCandidateId
    || candidate.changeId !== handoff.changeId
    || candidate.schedulerRunId !== handoff.schedulerRunId
    || candidate.schedulerRuntimeStateId !== runtimeState.id
    || candidate.schedulerRuntimeStateId !== handoff.schedulerRuntimeStateId
    || candidate.schedulerClaimReservationId !== handoff.schedulerClaimReservationId
    || candidate.schedulerReconcileSnapshotId !== handoff.schedulerReconcileSnapshotId
  ) {
    throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerIntegrationCandidate target is stale.");
  }
  if (candidate.status !== "ready" || candidate.readyCount < 2 || candidate.readyTargets.length < 2) {
    throw new Error("planning.scheduler.integration-outcome.reconcile requires a ready SchedulerIntegrationCandidate.");
  }
  assertHashesMatch(candidate.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "candidate");
  assertSameWorktreeSet(candidate.readyWorktreeIds, handoff.readyWorktreeIds, "candidate ready");
  assertSameWorktreeSet(candidate.readyTargets.map((target) => target.worktreeId), handoff.readyTargets.map((target) => target.worktreeId), "candidate ready target");
  for (const handoffTarget of handoff.readyTargets) {
    const candidateTarget = candidate.readyTargets.find((target) => target.worktreeId === handoffTarget.worktreeId);
    if (!candidateTarget) throw new Error(`planning.scheduler.integration-outcome.reconcile missing SchedulerIntegrationCandidate target: ${handoffTarget.worktreeId}.`);
    if (candidateTarget.worktreeDiffHash !== handoffTarget.worktreeDiffHash) throw new Error(`planning.scheduler.integration-outcome.reconcile candidate diff hash mismatch: ${handoffTarget.worktreeId}.`);
    if (candidateTarget.diffStat !== handoffTarget.diffStat) throw new Error(`planning.scheduler.integration-outcome.reconcile candidate diff stat mismatch: ${handoffTarget.worktreeId}.`);
    if ((candidateTarget.sourceHead ?? null) !== (handoffTarget.sourceHead ?? null)) throw new Error(`planning.scheduler.integration-outcome.reconcile candidate source HEAD mismatch: ${handoffTarget.worktreeId}.`);
    if (candidateTarget.validationRunId !== handoffTarget.validationRunId) throw new Error(`planning.scheduler.integration-outcome.reconcile candidate validation evidence mismatch: ${handoffTarget.worktreeId}.`);
    if (candidateTarget.auditRunId !== handoffTarget.auditRunId) throw new Error(`planning.scheduler.integration-outcome.reconcile candidate audit evidence mismatch: ${handoffTarget.worktreeId}.`);
  }
}

function assertIntegrationCheckMatchesHandoff(check: IntegrationCheckRecord, handoff: SchedulerIntegrationCheckHandoff): void {
  if (check.id !== handoff.integrationCheckId) {
    throw new Error("planning.scheduler.integration-outcome.reconcile IntegrationCheck id mismatch.");
  }
  assertSameWorktreeSet(handoff.readyWorktreeIds, handoff.resultTargetWorktreeIds, "handoff result target");
  assertSameWorktreeSet(handoff.readyWorktreeIds, check.resultTargets.map((item) => item.worktreeId), "IntegrationCheck result target");
  for (const ready of handoff.readyTargets) {
    const target = check.resultTargets.find((item) => item.worktreeId === ready.worktreeId);
    if (!target) throw new Error(`planning.scheduler.integration-outcome.reconcile missing IntegrationCheck target: ${ready.worktreeId}.`);
    if (target.changeId !== handoff.changeId) throw new Error(`planning.scheduler.integration-outcome.reconcile target change scope mismatch: ${ready.worktreeId}.`);
    if (target.diffHash !== ready.worktreeDiffHash) throw new Error(`planning.scheduler.integration-outcome.reconcile target diff hash mismatch: ${ready.worktreeId}.`);
    if (target.diffStat !== ready.diffStat) throw new Error(`planning.scheduler.integration-outcome.reconcile target diff stat mismatch: ${ready.worktreeId}.`);
    if ((target.sourceHead ?? null) !== (ready.sourceHead ?? null)) throw new Error(`planning.scheduler.integration-outcome.reconcile target source HEAD mismatch: ${ready.worktreeId}.`);
  }
  if (check.status === "applied" && !check.appliedAt) {
    throw new Error("planning.scheduler.integration-outcome.reconcile applied IntegrationCheck is missing appliedAt.");
  }
}

async function readOutcomeTargets(memory: Awaited<ReturnType<typeof resolveProjectMemory>>, handoff: SchedulerIntegrationCheckHandoff, check: IntegrationCheckRecord): Promise<SchedulerIntegrationOutcomeTarget[]> {
  const targets: SchedulerIntegrationOutcomeTarget[] = [];
  for (const target of check.resultTargets) {
    const worktree = await getWorktreeStatus(memory, target.worktreeId);
    if (worktree.changeId !== handoff.changeId) throw new Error(`planning.scheduler.integration-outcome.reconcile worktree change scope mismatch: ${target.worktreeId}.`);
    if (check.status === "applied") {
      if (worktree.status !== "applied" || !worktree.appliedAt) throw new Error(`planning.scheduler.integration-outcome.reconcile applied target is not marked applied: ${target.worktreeId}.`);
      if (worktree.worktreeDiffHash !== target.diffHash) throw new Error(`planning.scheduler.integration-outcome.reconcile applied target diff hash mismatch: ${target.worktreeId}.`);
    }
    if (check.status === "discarded") {
      if (check.appliedAt) throw new Error("planning.scheduler.integration-outcome.reconcile discarded IntegrationCheck has appliedAt.");
      if (worktree.status === "applied" || worktree.appliedAt) throw new Error(`planning.scheduler.integration-outcome.reconcile discarded target already has applied evidence: ${target.worktreeId}.`);
    }
    targets.push({
      worktreeId: target.worktreeId,
      changeId: target.changeId,
      diffHash: target.diffHash,
      sourceHead: target.sourceHead,
      applied: worktree.status === "applied",
      appliedAt: worktree.appliedAt,
      appliedCommit: worktree.appliedCommit,
    });
  }
  return targets;
}

function buildOutcome(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  runtimeState: SchedulerRuntimeState,
  handoff: SchedulerIntegrationCheckHandoff,
  check: IntegrationCheckRecord,
  targets: SchedulerIntegrationOutcomeTarget[],
): SchedulerIntegrationOutcome {
  const status = classifyOutcomeStatus(check);
  const outcomeId = buildSchedulerIntegrationOutcomeId(handoff.schedulerRunId, handoff.id, check.id, check.status);
  const refs = schedulerIntegrationOutcomeArtifactRefs(memory, changePath, handoff.schedulerRunId, outcomeId);
  const now = new Date().toISOString();
  return {
    version: "1.0",
    id: outcomeId,
    changeId: handoff.changeId,
    schedulerRunId: handoff.schedulerRunId,
    schedulerMode: handoff.schedulerMode,
    status,
    schedulerRuntimeStateId: handoff.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: handoff.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: handoff.schedulerClaimReservationId,
    schedulerIntegrationCandidateId: handoff.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: handoff.id,
    schedulerContractId: handoff.schedulerContractId,
    schedulerDispatchDryRunId: handoff.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: handoff.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: handoff.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: handoff.schedulerLaunchPreflightId,
    integrationCheckId: check.id,
    integrationCheckStatus: check.status,
    outcomeReason: outcomeReason(check),
    readyWorktreeIds: [...handoff.readyWorktreeIds],
    resultTargetWorktreeIds: check.resultTargets.map((target) => target.worktreeId),
    targets,
    appliedAt: check.appliedAt,
    sourceHead: check.sourceHead,
    latestArtifactHash: check.latestArtifactHash,
    latestArtifactRef: check.latestArtifactRef,
    sourceArtifactHashes: runtimeState.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, handoff.artifact, check.artifactRefs[0]].filter((item): item is string => Boolean(item)),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function classifyOutcomeStatus(check: IntegrationCheckRecord): SchedulerIntegrationOutcome["status"] {
  if (check.status === "applied") return "applied";
  if (check.status === "discarded") return "discarded";
  if (BLOCKED_STATUSES.has(check.status)) return "blocked";
  throw new Error(`planning.scheduler.integration-outcome.reconcile IntegrationCheck status is not terminal: ${check.status}.`);
}

function outcomeReason(check: IntegrationCheckRecord): string {
  if (check.status === "applied") return "Existing IntegrationCheck apply gate applied the combined result.";
  if (check.status === "discarded") return "Existing IntegrationCheck result was discarded without source-root mutation.";
  return `Existing IntegrationCheck ended with ${check.status}.`;
}

function assertSameWorktreeSet(left: string[], right: string[], label: string): void {
  const l = [...left].sort((a, b) => a.localeCompare(b));
  const r = [...right].sort((a, b) => a.localeCompare(b));
  if (l.length !== r.length || l.some((item, index) => item !== r[index])) {
    throw new Error(`planning.scheduler.integration-outcome.reconcile ${label} worktree set mismatch.`);
  }
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.integration-outcome.reconcile ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.integration-outcome.reconcile ${label} source artifact hash mismatch.`);
  }
}

function buildSchedulerIntegrationOutcomeId(schedulerRunId: string, handoffId: string, integrationCheckId: string, status: IntegrationCheckRecord["status"]): string {
  return `scheduler-integration-outcome-${shortHash(`${schedulerRunId}:${handoffId}:${integrationCheckId}:${status}`).slice(0, 12)}`;
}
