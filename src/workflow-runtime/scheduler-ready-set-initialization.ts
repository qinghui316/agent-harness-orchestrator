import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import type { ReadySetWorkflowGraphPlan, ResolvedMemory, WorkflowGraphStage } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { readLatestWorkflowGraphPlan } from "../workflow-artifacts/workflow-graph-plan.js";
import { unique } from "../workflow-artifacts/utils.js";
import { reserveSchedulerRuntimeClaims } from "../scheduler-runtime/claim-reservation.js";
import { initializeSchedulerRuntime } from "../scheduler-runtime/initialize.js";
import { reconcileSchedulerRuntime } from "../scheduler-runtime/reconcile.js";
import {
  readSchedulerReconcileSnapshotProjection,
  readSchedulerRuntimeState,
  readSchedulerRuntimeStateProjection,
} from "../scheduler-runtime/repository.js";
import type { SchedulerReconcileSnapshot, SchedulerRuntimeClaimReservation, SchedulerRuntimeState } from "../scheduler-runtime/types.js";
import { compileSchedulerLaunchPreflight } from "../workflow-scheduler/launch-preflight.js";
import {
  schedulerClaimReconcilePlanArtifactRefs,
  schedulerContractArtifactRefs,
  schedulerDispatchDryRunArtifactRefs,
  schedulerWorkerSessionPlanArtifactRefs,
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerLaunchPreflight,
  readLatestSchedulerRun,
  readLatestSchedulerWorkerSessionPlan,
  writeSchedulerClaimReconcilePlan,
  writeSchedulerContract,
  writeSchedulerDispatchDryRun,
  writeSchedulerWorkerSessionPlan,
} from "../workflow-scheduler/repository.js";
import { prepareSchedulerRun } from "../workflow-scheduler/scheduler-run.js";
import type {
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerDryRunNodeVerdict,
  SchedulerRun,
  SchedulerWorkerAdapterFamily,
  SchedulerWorkerEventSourceExpectation,
  SchedulerWorkerSessionPlan,
} from "../workflow-scheduler/types.js";

const runtimeContinuityPrerequisites = [
  "WorkerSession scope for every worker run",
  "RuntimeWorkspace boundary for local-worktree or source-root execution",
  "EventSource for replayable worker event streams",
  "AgentEventEnvelope canonical scope for normalized worker events",
  "ToolPolicyGate decision before high-impact tool execution",
  "Validation, audit, integration, and human gates remain authoritative",
];

export interface SchedulerReadySetInitializationResult {
  contract: SchedulerContract;
  dryRun: SchedulerDispatchDryRun;
  workerPlan: SchedulerWorkerSessionPlan;
  claimReconcilePlan: SchedulerClaimReconcilePlan;
  launchPreflight: Awaited<ReturnType<typeof compileSchedulerLaunchPreflight>>;
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
  let launchPreflight: Awaited<ReturnType<typeof compileSchedulerLaunchPreflight>>;
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
    contract = buildContract(memory, changePath, graph, sourceArtifactHashes, now);
    await writeSchedulerContract(memory, changePath, contract);
    dryRun = buildDryRun(memory, changePath, graph, contract, sourceArtifactHashes, now);
    await writeSchedulerDispatchDryRun(memory, changePath, dryRun);
    workerPlan = buildWorkerPlan(memory, changePath, graph, dryRun, sourceArtifactHashes, now);
    await writeSchedulerWorkerSessionPlan(memory, changePath, workerPlan);
    claimReconcilePlan = buildClaimReconcilePlan(memory, changePath, graph, workerPlan, sourceArtifactHashes, now);
    await writeSchedulerClaimReconcilePlan(memory, changePath, claimReconcilePlan);
    launchPreflight = await compileSchedulerLaunchPreflight(memory, changePath, claimReconcilePlan, workerPlan, dryRun, contract);
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
  preflight: Awaited<ReturnType<typeof compileSchedulerLaunchPreflight>>,
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

async function validateCurrentAuthoredGraph(memory: ResolvedMemory, changePath: string, graph: ReadySetWorkflowGraphPlan): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, graph, "Scheduler ready-set initialization graph");
  if (graph.status !== "compiled" || graph.graphMode !== "ready-set-v1" || graph.authoringContractVersion !== "1.0") {
    throw new Error("Scheduler ready-set initialization requires an authored ready-set-v1 WorkflowGraphPlan.");
  }
  const latest = await readLatestWorkflowGraphPlan(memory, changePath);
  if (latest.id !== graph.id || latest.graphMode !== "ready-set-v1") {
    throw new Error("Scheduler ready-set initialization requires the latest ready-set WorkflowGraphPlan.");
  }
  if (!graph.nodes.length || !graph.waves.length) throw new Error("Scheduler ready-set initialization requires graph nodes and waves.");
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const claimIntentIds = new Set(graph.nodes.map((node) => node.claimIntentId));
  if (nodeIds.size !== graph.nodes.length || claimIntentIds.size !== graph.nodes.length) {
    throw new Error("Scheduler ready-set initialization requires unique graph node and claim intent ids.");
  }
  for (const wave of graph.waves) {
    const members = graph.nodes.filter((node) => node.waveIndex === wave.index);
    if (members.map((node) => node.id).join("\0") !== wave.nodeIds.join("\0") || members.map((node) => node.claimIntentId).join("\0") !== wave.claimIntentIds.join("\0")) {
      throw new Error(`Scheduler ready-set graph wave ${wave.index} does not match its authored nodes and claim intents.`);
    }
  }
  const currentHashes = await hashArtifactRefs(memory, Object.keys(graph.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(currentHashes)) {
    if (graph.sourceArtifactHashes[artifact] !== hash) throw new Error(`Scheduler ready-set graph source artifact hash mismatch: ${artifact}.`);
  }
}

async function currentGraphSourceHashes(memory: ResolvedMemory, graph: ReadySetWorkflowGraphPlan): Promise<Record<string, string>> {
  await hashArtifactRefs(memory, Object.keys(graph.sourceArtifactHashes));
  return { ...graph.sourceArtifactHashes };
}

function buildContract(
  memory: ResolvedMemory,
  changePath: string,
  graph: ReadySetWorkflowGraphPlan,
  sourceArtifactHashes: Record<string, string>,
  now: string,
): SchedulerContract {
  const refs = schedulerContractArtifactRefs(memory, changePath, graph.schedulerContractId);
  return {
    version: "1.0",
    id: graph.schedulerContractId,
    changeId: graph.changeId,
    status: "compiled",
    schedulerMode: graph.schedulerMode,
    workflowGraphPlanId: graph.id,
    nodes: graph.nodes.map((node) => ({
      id: node.schedulerNodeId,
      unitId: node.unitId,
      taskIds: node.taskIds,
      acIds: node.acIds,
      title: node.title,
      sourceScopes: node.sourceScopes,
      stages: node.stages,
    })),
    edges: graph.edges
      .filter((edge): edge is typeof edge & { kind: "dependency" | "synthesis" } => edge.kind !== "stage-order")
      .map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
    waves: graph.waves.map((wave) => ({ index: wave.index, nodeIds: wave.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)!.schedulerNodeId) })),
    conflictScopes: repeatedSourceScopes(graph),
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, refs.artifact, refs.markdownArtifact]),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function buildDryRun(
  memory: ResolvedMemory,
  changePath: string,
  graph: ReadySetWorkflowGraphPlan,
  contract: SchedulerContract,
  sourceArtifactHashes: Record<string, string>,
  now: string,
): SchedulerDispatchDryRun {
  const refs = schedulerDispatchDryRunArtifactRefs(memory, changePath, graph.schedulerDispatchDryRunId);
  const nodeVerdicts: SchedulerDryRunNodeVerdict[] = graph.nodes.map((node) => ({
    nodeId: node.schedulerNodeId,
    unitId: node.unitId,
    waveIndex: node.waveIndex,
    status: node.status === "blocked" ? "blocked" : "candidate",
    dependencyNodeIds: graph.edges.filter((edge) => edge.kind === "dependency" && edge.to === node.id).map((edge) => graph.nodes.find((candidate) => candidate.id === edge.from)!.schedulerNodeId),
    dependenciesSatisfied: node.blockedReasons.every((reason) => !reason.toLowerCase().includes("depend")),
    sourceScopes: node.sourceScopes,
    stages: node.stages,
    runtimeContinuityPrerequisites,
    blockedReasons: node.blockedReasons,
  }));
  return {
    version: "1.0",
    id: graph.schedulerDispatchDryRunId,
    changeId: graph.changeId,
    status: "generated",
    schedulerMode: graph.schedulerMode,
    schedulerContractId: contract.id,
    workflowGraphPlanId: graph.id,
    nodeVerdicts,
    waveVerdicts: graph.waves.map((wave) => ({
      index: wave.index,
      nodeIds: wave.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)!.schedulerNodeId),
      status: wave.blockedCount > 0 ? "blocked" : "candidate",
      candidateCount: wave.candidateCount,
      blockedCount: wave.blockedCount,
      blockedReasons: wave.blockedReasons,
    })),
    estimatedMaxWaveWidth: graph.maxPlannedWaveWidth,
    dependencyCount: graph.edges.filter((edge) => edge.kind !== "stage-order").length,
    conflictCount: contract.conflictScopes.length,
    conflictScopes: contract.conflictScopes,
    runtimeContinuityPrerequisites,
    blockedReasons: unique(graph.nodes.flatMap((node) => node.blockedReasons)),
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, contract.artifact, contract.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function buildWorkerPlan(
  memory: ResolvedMemory,
  changePath: string,
  graph: ReadySetWorkflowGraphPlan,
  dryRun: SchedulerDispatchDryRun,
  sourceArtifactHashes: Record<string, string>,
  now: string,
): SchedulerWorkerSessionPlan {
  const refs = schedulerWorkerSessionPlanArtifactRefs(memory, changePath, graph.schedulerWorkerPlanId);
  const plannedStages = graph.nodes.flatMap((node) => node.stageRefs.map((stageRef) => {
    const adapterFamily = adapterForStage(stageRef.stage);
    return {
      id: stageRef.id,
      nodeId: node.schedulerNodeId,
      unitId: node.unitId,
      waveIndex: node.waveIndex,
      stage: stageRef.stage,
      roleId: stageRef.roleId,
      status: stageRef.status,
      workspaceIntent: { kind: "future-local-worktree" as const, sourceScopes: stageRef.sourceScopes, requiresFreshWorktree: true },
      adapterFamily,
      permissionProfile: workerPermissionProfileForRole(stageRef.roleId),
      eventSourceExpectation: eventSourceExpectation(adapterFamily),
      recoveryKeyInputs: stageRef.recoveryKeyInputs,
      blockedReasons: stageRef.blockedReasons,
    };
  }));
  const plannedNodes = graph.nodes.map((node) => ({
    nodeId: node.schedulerNodeId,
    unitId: node.unitId,
    waveIndex: node.waveIndex,
    status: node.status,
    stageIds: node.stageRefs.map((stage) => stage.id),
    blockedReasons: node.blockedReasons,
  }));
  return {
    version: "1.0",
    id: graph.schedulerWorkerPlanId,
    changeId: graph.changeId,
    status: "planned",
    schedulerMode: graph.schedulerMode,
    schedulerContractId: graph.schedulerContractId,
    schedulerDispatchDryRunId: graph.schedulerDispatchDryRunId,
    workflowGraphPlanId: graph.id,
    plannedNodes,
    plannedStages,
    plannedWorkerCount: plannedStages.filter((stage) => stage.status === "planned").length,
    stageCount: plannedStages.length,
    blockedCount: plannedNodes.filter((node) => node.status === "blocked").length + plannedStages.filter((stage) => stage.status === "blocked").length,
    warningCount: unique(plannedStages.flatMap((stage) => stage.blockedReasons)).length,
    recoveryKeyCoverage: graph.recoveryKeyCoverage,
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, dryRun.artifact, dryRun.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function buildClaimReconcilePlan(
  memory: ResolvedMemory,
  changePath: string,
  graph: ReadySetWorkflowGraphPlan,
  workerPlan: SchedulerWorkerSessionPlan,
  sourceArtifactHashes: Record<string, string>,
  now: string,
): SchedulerClaimReconcilePlan {
  const refs = schedulerClaimReconcilePlanArtifactRefs(memory, changePath, graph.schedulerClaimReconcilePlanId);
  return {
    version: "1.0",
    id: graph.schedulerClaimReconcilePlanId,
    changeId: graph.changeId,
    status: "planned",
    schedulerMode: graph.schedulerMode,
    schedulerContractId: graph.schedulerContractId,
    schedulerDispatchDryRunId: graph.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: graph.schedulerWorkerPlanId,
    workflowGraphPlanId: graph.id,
    claimIntents: graph.nodes.map((node) => ({
      claimIntentId: node.claimIntentId,
      plannedWorkerKey: node.plannedWorkerKey,
      nodeId: node.schedulerNodeId,
      unitId: node.unitId,
      waveIndex: node.waveIndex,
      stageIds: node.stageRefs.map((stage) => stage.id),
      roleIds: node.roleIds,
      sourceScopes: node.sourceScopes,
      status: node.status,
      plannedSlotDemand: node.plannedSlotDemand,
      sourceLockIntents: node.sourceLocks.map((lock) => ({ scope: lock.scope, nodeId: node.schedulerNodeId, unitId: lock.unitId, waveIndex: lock.waveIndex, stageIds: lock.stageIds })),
      recoveryKeyInputs: node.recoveryKeyInputs,
      blockedReasons: node.blockedReasons,
    })),
    waveCheckpoints: graph.waves.map((wave) => ({
      waveIndex: wave.index,
      claimIntentIds: wave.claimIntentIds,
      candidateCount: wave.candidateCount,
      blockedCount: wave.blockedCount,
      plannedSlotDemand: wave.plannedSlotDemand,
      blockedReasons: wave.blockedReasons,
    })),
    plannedSlotDemand: graph.plannedSlotDemand,
    maxPlannedWaveWidth: graph.maxPlannedWaveWidth,
    blockedCount: graph.nodes.filter((node) => node.status === "blocked").length,
    recoveryKeyCoverage: graph.recoveryKeyCoverage,
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, workerPlan.artifact, workerPlan.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function repeatedSourceScopes(graph: ReadySetWorkflowGraphPlan): string[] {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) for (const scope of node.sourceScopes) counts.set(scope, (counts.get(scope) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([scope]) => scope).sort();
}

function adapterForStage(stage: WorkflowGraphStage): SchedulerWorkerAdapterFamily {
  if (stage === "validation") return "validation-command";
  if (stage === "audit") return "provider-readonly";
  return "provider-code";
}

function eventSourceExpectation(adapterFamily: SchedulerWorkerAdapterFamily): SchedulerWorkerEventSourceExpectation {
  if (adapterFamily === "validation-command") return { adapterFamily, expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "validation.command.started", "validation.command.exited", "external-execution.completed"] };
  if (adapterFamily === "provider-readonly") return { adapterFamily, expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "audit.started", "provider.started", "provider.exited", "external-execution.completed"] };
  return { adapterFamily, expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "provider.started", "provider.exited", "external-execution.completed"] };
}
