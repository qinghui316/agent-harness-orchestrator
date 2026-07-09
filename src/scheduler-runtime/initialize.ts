import { existsSync } from "node:fs";
import type { ResolvedMemory } from "../types/index.js";
import { schedulerRuntimeStatePath } from "./paths.js";
import { schedulerRuntimeArtifactRefs, appendSchedulerRuntimeEvent, writeSchedulerRuntimeState } from "./repository.js";
import { readSchedulerRuntimeLineage } from "./guards.js";
import type { SchedulerRuntimeState } from "./types.js";

export async function initializeSchedulerRuntime(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeState> {
  const { run, claimPlan } = await readSchedulerRuntimeLineage(memory, changePath, schedulerRunId);
  if (existsSync(schedulerRuntimeStatePath(memory, changePath, run.id))) {
    throw new Error("Scheduler runtime state already exists for this SchedulerRun.");
  }
  const now = new Date().toISOString();
  const refs = schedulerRuntimeArtifactRefs(memory, changePath, run.id);
  const claimIntents = claimPlan.claimIntents.map((claim) => ({
    claimIntentId: claim.claimIntentId,
    plannedWorkerKey: claim.plannedWorkerKey,
    nodeId: claim.nodeId,
    unitId: claim.unitId,
    waveIndex: claim.waveIndex,
    status: claim.status === "blocked" ? "blocked" as const : "pending" as const,
    plannedSlotDemand: claim.plannedSlotDemand,
    sourceScopes: claim.sourceScopes,
    blockedReasons: claim.blockedReasons,
  }));
  const waves = claimPlan.waveCheckpoints.map((wave) => ({
    waveIndex: wave.waveIndex,
    claimIntentIds: wave.claimIntentIds,
    candidateCount: wave.candidateCount,
    blockedCount: wave.blockedCount,
    plannedSlotDemand: wave.plannedSlotDemand,
    status: wave.blockedCount > 0 ? "blocked" as const : "pending" as const,
    blockedReasons: wave.blockedReasons,
  }));
  const blockedCount = claimIntents.filter((claim) => claim.status === "blocked").length;
  const state: SchedulerRuntimeState = {
    version: "1.0",
    id: `scheduler-runtime-${run.id}`,
    changeId: run.changeId,
    schedulerRunId: run.id,
    schedulerMode: run.schedulerMode,
    status: blockedCount > 0 ? "blocked" : "initialized",
    schedulerContractId: run.schedulerContractId,
    schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: run.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
    decompositionPlanId: run.decompositionPlanId,
    readinessManifestId: run.readinessManifestId,
    claimIntents,
    waves,
    plannedSlotDemand: run.plannedSlotDemand,
    maxPlannedWaveWidth: run.maxPlannedWaveWidth,
    blockedCount,
    sourceArtifactHashes: run.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.eventsArtifact],
    artifact: refs.artifact,
    eventsArtifact: refs.eventsArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeState(memory, changePath, state);
  await appendSchedulerRuntimeEvent(memory, changePath, run, state.status === "blocked" ? "scheduler-runtime.blocked" : "scheduler-runtime.initialized", {
    status: state.status,
    summary: "Scheduler runtime shell initialized. No workers, leases, TaskRuns, worktrees, runs, or scheduler loop were created.",
    artifactRefs: [state.artifact, state.eventsArtifact],
    payload: {
      schedulerRuntimeStateId: state.id,
      claimIntentCount: state.claimIntents.length,
      blockedCount: state.blockedCount,
    },
  });
  return state;
}
