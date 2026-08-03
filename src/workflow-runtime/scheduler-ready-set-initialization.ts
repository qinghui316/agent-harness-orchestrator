import type { ReadySetWorkflowGraphPlan, ResolvedMemory } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { readLatestWorkflowGraphPlan } from "../workflow-artifacts/workflow-graph-plan.js";
import { reserveSchedulerRuntimeClaims } from "../scheduler-runtime/claim-reservation.js";
import { initializeSchedulerRuntime } from "../scheduler-runtime/initialize.js";
import { reconcileSchedulerRuntime } from "../scheduler-runtime/reconcile.js";
import {
  readSchedulerReconcileSnapshotProjection,
  readSchedulerRuntimeState,
  readSchedulerRuntimeStateProjection,
} from "../scheduler-runtime/repository.js";
import type {
  SchedulerReconcileSnapshot,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeState,
} from "../scheduler-runtime/types.js";
import { compileSchedulerReadySetPlanningBundle } from "../workflow-scheduler/planning-bundle.js";
import {
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerLaunchPreflight,
  readLatestSchedulerRun,
  readLatestSchedulerWorkerSessionPlan,
  writeSchedulerClaimReconcilePlan,
  writeSchedulerContract,
  writeSchedulerDispatchDryRun,
  writeSchedulerLaunchPreflight,
  writeSchedulerWorkerSessionPlan,
} from "../workflow-scheduler/repository.js";
import { prepareSchedulerRun } from "../workflow-scheduler/scheduler-run.js";
import type {
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerLaunchPreflight,
  SchedulerRun,
  SchedulerWorkerSessionPlan,
} from "../workflow-scheduler/types.js";

export interface SchedulerReadySetInitializationResult {
  contract: SchedulerContract;
  dryRun: SchedulerDispatchDryRun;
  workerPlan: SchedulerWorkerSessionPlan;
  claimReconcilePlan: SchedulerClaimReconcilePlan;
  launchPreflight: SchedulerLaunchPreflight;
  schedulerRun: SchedulerRun;
  runtimeState: SchedulerRuntimeState;
  reconcileSnapshot: SchedulerReconcileSnapshot;
  claimReservation: SchedulerRuntimeClaimReservation;
  executionStarted: false;
}

export async function initializeSchedulerReadySetFromGraph(
  memory: ResolvedMemory,
  changePath: string,
  graph: ReadySetWorkflowGraphPlan,
): Promise<SchedulerReadySetInitializationResult> {
  await validateCurrentAuthoredGraph(memory, changePath, graph);
  const existingRun = await readLatestSchedulerRun(memory, changePath).catch(() => null);
  let contract: SchedulerContract;
  let dryRun: SchedulerDispatchDryRun;
  let workerPlan: SchedulerWorkerSessionPlan;
  let claimReconcilePlan: SchedulerClaimReconcilePlan;
  let launchPreflight: SchedulerLaunchPreflight;
  let schedulerRun: SchedulerRun;

  if (existingRun?.workflowGraphPlanId === graph.id) {
    [contract, dryRun, workerPlan, claimReconcilePlan, launchPreflight] = await Promise.all([
      readLatestSchedulerContract(memory, changePath),
      readLatestSchedulerDispatchDryRun(memory, changePath),
      readLatestSchedulerWorkerSessionPlan(memory, changePath),
      readLatestSchedulerClaimReconcilePlan(memory, changePath),
      readLatestSchedulerLaunchPreflight(memory, changePath),
    ]);
    schedulerRun = existingRun;
    assertInitializationLineage(graph, contract, dryRun, workerPlan, claimReconcilePlan, launchPreflight, schedulerRun);
  } else {
    const now = new Date().toISOString();
    const sourceArtifactHashes = await currentGraphSourceHashes(memory, graph);
    const bundle = compileSchedulerReadySetPlanningBundle(
      { ...graph, sourceArtifactHashes },
      changePath,
      now,
    );
    contract = bundle.contract;
    await writeSchedulerContract(memory, changePath, contract);
    dryRun = bundle.dryRun;
    await writeSchedulerDispatchDryRun(memory, changePath, dryRun);
    workerPlan = bundle.workerPlan;
    await writeSchedulerWorkerSessionPlan(memory, changePath, workerPlan);
    claimReconcilePlan = bundle.claimReconcilePlan;
    await writeSchedulerClaimReconcilePlan(memory, changePath, claimReconcilePlan);
    launchPreflight = bundle.launchPreflight;
    await writeSchedulerLaunchPreflight(memory, changePath, launchPreflight);
    if (launchPreflight.status !== "checked") {
      throw new Error(`Authored ready-set WorkflowGraphPlan launch preflight is blocked: ${launchPreflight.blockedReasons.join("; ")}`);
    }
    schedulerRun = await prepareSchedulerRun(memory, changePath, launchPreflight, claimReconcilePlan, workerPlan, dryRun, contract);
  }

  let runtimeState = await readSchedulerRuntimeStateProjection(memory, changePath, schedulerRun.id)
    ?? await initializeSchedulerRuntime(memory, changePath, schedulerRun.id);
  let reconcileSnapshot = runtimeState.lastReconcileSnapshotId
    ? await readSchedulerReconcileSnapshotProjection(memory, changePath, schedulerRun.id, runtimeState.lastReconcileSnapshotId)
    : null;
  if (!reconcileSnapshot) reconcileSnapshot = await reconcileSchedulerRuntime(memory, changePath, schedulerRun.id);
  const claimReservation = await reserveSchedulerRuntimeClaims(memory, changePath, schedulerRun.id, reconcileSnapshot.id);
  runtimeState = await readSchedulerRuntimeState(memory, changePath, schedulerRun.id);

  return {
    contract,
    dryRun,
    workerPlan,
    claimReconcilePlan,
    launchPreflight,
    schedulerRun,
    runtimeState,
    reconcileSnapshot,
    claimReservation,
    executionStarted: false,
  };
}

function assertInitializationLineage(
  graph: ReadySetWorkflowGraphPlan,
  contract: SchedulerContract,
  dryRun: SchedulerDispatchDryRun,
  workerPlan: SchedulerWorkerSessionPlan,
  claimPlan: SchedulerClaimReconcilePlan,
  preflight: SchedulerLaunchPreflight,
  run: SchedulerRun,
): void {
  if (
    contract.id !== graph.schedulerContractId
    || contract.workflowGraphPlanId !== graph.id
    || dryRun.id !== graph.schedulerDispatchDryRunId
    || dryRun.schedulerContractId !== contract.id
    || workerPlan.id !== graph.schedulerWorkerPlanId
    || workerPlan.schedulerDispatchDryRunId !== dryRun.id
    || claimPlan.id !== graph.schedulerClaimReconcilePlanId
    || claimPlan.schedulerWorkerPlanId !== workerPlan.id
    || preflight.workflowGraphPlanId !== graph.id
    || run.workflowGraphPlanId !== graph.id
    || run.schedulerLaunchPreflightId !== preflight.id
  ) {
    throw new Error("Existing Scheduler ready-set materialization does not match the accepted WorkflowGraphPlan lineage.");
  }
}

async function validateCurrentAuthoredGraph(
  memory: ResolvedMemory,
  changePath: string,
  graph: ReadySetWorkflowGraphPlan,
): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, graph, "Scheduler ready-set initialization graph");
  if (graph.status !== "compiled" || graph.graphMode !== "ready-set-v1" || graph.authoringContractVersion !== "1.0") {
    throw new Error("Scheduler ready-set initialization requires an authored ready-set-v1 WorkflowGraphPlan.");
  }
  const latest = await readLatestWorkflowGraphPlan(memory, changePath);
  if (latest.id !== graph.id || latest.graphMode !== "ready-set-v1") {
    throw new Error("Scheduler ready-set initialization requires the latest ready-set WorkflowGraphPlan.");
  }
  if (!graph.nodes.length || !graph.waves.length) {
    throw new Error("Scheduler ready-set initialization requires graph nodes and waves.");
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const claimIntentIds = new Set(graph.nodes.map((node) => node.claimIntentId));
  if (nodeIds.size !== graph.nodes.length || claimIntentIds.size !== graph.nodes.length) {
    throw new Error("Scheduler ready-set initialization requires unique graph node and claim intent ids.");
  }
  for (const wave of graph.waves) {
    const members = graph.nodes.filter((node) => node.waveIndex === wave.index);
    if (members.map((node) => node.id).join("\0") !== wave.nodeIds.join("\0")
      || members.map((node) => node.claimIntentId).join("\0") !== wave.claimIntentIds.join("\0")) {
      throw new Error(`Scheduler ready-set graph wave ${wave.index} does not match its authored nodes and claim intents.`);
    }
  }
  const currentHashes = await hashArtifactRefs(memory, Object.keys(graph.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(currentHashes)) {
    if (graph.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`Scheduler ready-set graph source artifact hash mismatch: ${artifact}.`);
    }
  }
}

async function currentGraphSourceHashes(
  memory: ResolvedMemory,
  graph: ReadySetWorkflowGraphPlan,
): Promise<Record<string, string>> {
  await hashArtifactRefs(memory, Object.keys(graph.sourceArtifactHashes));
  return { ...graph.sourceArtifactHashes };
}
