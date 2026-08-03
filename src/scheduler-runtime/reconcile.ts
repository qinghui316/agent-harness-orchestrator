import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { assertSchedulerRuntimeLineage } from "./guards.js";
import { schedulerReconcileSnapshotArtifactRefs, appendSchedulerRuntimeEvent, readSchedulerRuntimeState, writeSchedulerReconcileSnapshot, writeSchedulerRuntimeState } from "./repository.js";
import type { SchedulerReconcileSnapshot, SchedulerRuntimeState } from "./types.js";
import { readSchedulerRun } from "../workflow-scheduler/repository.js";
import type { SchedulerRun } from "../workflow-scheduler/types.js";

export interface SchedulerReconcileSnapshotRefs {
  artifact: string;
  markdownArtifact: string;
}

export async function reconcileSchedulerRuntime(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerReconcileSnapshot> {
  const run = await readSchedulerRun(memory, changePath, schedulerRunId);
  await assertSchedulerRuntimeLineage(memory, changePath, run);
  const state = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (state.changeId !== run.changeId || state.schedulerRunId !== run.id) {
    throw new Error("SchedulerRuntimeState does not match SchedulerRun scope.");
  }
  const now = new Date().toISOString();
  const id = `scheduler-reconcile-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${now}`).slice(0, 8)}`;
  const refs = schedulerReconcileSnapshotArtifactRefs(memory, changePath, run.id, id);
  const snapshot = buildSchedulerReconcileSnapshot(run, state, refs, id, now);
  await writeSchedulerReconcileSnapshot(memory, changePath, snapshot);
  await writeSchedulerRuntimeState(memory, changePath, {
    ...state,
    lastReconcileSnapshotId: snapshot.id,
    updatedAt: now,
  });
  await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.reconciled", {
    status: state.status,
    summary: "Scheduler runtime shell reconciled. No workers, leases, TaskRuns, worktrees, runs, or scheduler loop were created.",
    artifactRefs: [snapshot.artifact, snapshot.markdownArtifact, state.artifact],
    payload: {
      schedulerRuntimeStateId: state.id,
      schedulerReconcileSnapshotId: snapshot.id,
      blockedCount: snapshot.blockedCount,
      warningCount: snapshot.warningCount,
    },
  });
  return snapshot;
}

export function buildSchedulerReconcileSnapshot(
  run: SchedulerRun,
  state: SchedulerRuntimeState,
  refs: SchedulerReconcileSnapshotRefs,
  id: string,
  now: string,
): SchedulerReconcileSnapshot {
  const warnings = state.status === "blocked"
    ? ["One or more claim intents are blocked in the runtime shell."]
    : [];
  return {
    version: "1.0",
    id,
    changeId: run.changeId,
    schedulerRunId: run.id,
    schedulerMode: run.schedulerMode,
    status: state.blockedCount > 0 ? "blocked" : "generated",
    schedulerRuntimeStateId: state.id,
    schedulerContractId: state.schedulerContractId,
    schedulerDispatchDryRunId: state.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: state.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: state.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: state.schedulerLaunchPreflightId,
    claimIntents: state.claimIntents,
    waves: state.waves,
    plannedSlotDemand: state.plannedSlotDemand,
    maxPlannedWaveWidth: state.maxPlannedWaveWidth,
    blockedCount: state.blockedCount,
    warningCount: warnings.length,
    warnings,
    recoveryCheckpoint: `${run.id}:${state.id}:${id}`,
    sourceArtifactHashes: state.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, state.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
  };
}
