import { shortHash } from "../fs/path.js";
import { join } from "node:path";
import type {
  ReadySetWorkflowGraphEdge,
  ReadySetWorkflowGraphNode,
  ReadySetWorkflowGraphStageRef,
  ReadySetWorkflowGraphWave,
  ResolvedMemory,
  WorkflowGraphPlan,
} from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { workflowGraphsDir } from "../workflow-artifacts/paths.js";
import { unique } from "../workflow-artifacts/utils.js";
import { writeWorkflowGraphPlan } from "../workflow-artifacts/workflow-graph-plan.js";
import { assertLatestSchedulerArtifact } from "./guards.js";
import {
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerWorkerSessionPlan,
} from "./repository.js";
import type {
  SchedulerClaimIntent,
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerContractNode,
  SchedulerWorkerPlanNode,
  SchedulerWorkerPlanStage,
  SchedulerWorkerSessionPlan,
} from "./types.js";

export async function compileSchedulerReadySetWorkflowGraphPlan(
  memory: ResolvedMemory,
  changePath: string,
  contract: SchedulerContract,
  workerPlan: SchedulerWorkerSessionPlan,
  claimPlan: SchedulerClaimReconcilePlan,
): Promise<WorkflowGraphPlan> {
  await assertWorkflowArtifactScope(memory, changePath, contract, "WorkflowGraphPlan SchedulerContract");
  await assertWorkflowArtifactScope(memory, changePath, workerPlan, "WorkflowGraphPlan SchedulerWorkerSessionPlan");
  await assertWorkflowArtifactScope(memory, changePath, claimPlan, "WorkflowGraphPlan SchedulerClaimReconcilePlan");
  await validateSchedulerReadySetGraphInput(memory, changePath, contract, workerPlan, claimPlan);

  const now = new Date().toISOString();
  const id = `workflow-graph-readyset-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${claimPlan.changeId}:${contract.id}:${workerPlan.id}:${claimPlan.id}:${now}`).slice(0, 8)}`;
  const dir = workflowGraphsDir(memory, changePath);
  const artifact = displayArtifactPath(memory, join(dir, `${id}.json`));
  const markdownArtifact = displayArtifactPath(memory, join(dir, `${id}.md`));
  const sourceRefs = unique([
    ...Object.keys(contract.sourceArtifactHashes),
    ...Object.keys(workerPlan.sourceArtifactHashes),
    ...Object.keys(claimPlan.sourceArtifactHashes),
  ]);
  const graph: WorkflowGraphPlan = {
    version: "1.0",
    id,
    changeId: claimPlan.changeId,
    status: "compiled",
    graphMode: "ready-set-v1",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId: contract.id,
    schedulerDispatchDryRunId: claimPlan.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: workerPlan.id,
    schedulerClaimReconcilePlanId: claimPlan.id,
    decompositionPlanId: claimPlan.decompositionPlanId,
    readinessManifestId: claimPlan.readinessManifestId,
    nodes: buildReadySetGraphNodes(contract, workerPlan, claimPlan),
    edges: buildReadySetGraphEdges(contract, workerPlan),
    waves: buildReadySetGraphWaves(contract, claimPlan),
    plannedSlotDemand: claimPlan.plannedSlotDemand,
    maxPlannedWaveWidth: claimPlan.maxPlannedWaveWidth,
    recoveryKeyCoverage: claimPlan.recoveryKeyCoverage,
    sourceArtifactHashes: await hashArtifactRefs(memory, sourceRefs),
    artifactRefs: unique([
      ...sourceRefs,
      contract.artifact,
      contract.markdownArtifact,
      workerPlan.artifact,
      workerPlan.markdownArtifact,
      claimPlan.artifact,
      claimPlan.markdownArtifact,
      artifact,
      markdownArtifact,
    ]),
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeWorkflowGraphPlan(memory, changePath, graph);
  return graph;
}

async function validateSchedulerReadySetGraphInput(
  memory: ResolvedMemory,
  changePath: string,
  contract: SchedulerContract,
  workerPlan: SchedulerWorkerSessionPlan,
  claimPlan: SchedulerClaimReconcilePlan,
): Promise<void> {
  if (contract.status !== "compiled") throw new Error("Ready-set WorkflowGraphPlan requires a compiled SchedulerContract.");
  if (workerPlan.status !== "planned") throw new Error("Ready-set WorkflowGraphPlan requires a planned SchedulerWorkerSessionPlan.");
  if (claimPlan.status !== "planned") throw new Error("Ready-set WorkflowGraphPlan requires a planned SchedulerClaimReconcilePlan.");
  if (contract.schedulerMode !== "parallel-readiness-v1" || workerPlan.schedulerMode !== "parallel-readiness-v1" || claimPlan.schedulerMode !== "parallel-readiness-v1") {
    throw new Error("Ready-set WorkflowGraphPlan requires parallel-readiness-v1 Scheduler artifacts.");
  }
  if (contract.changeId !== workerPlan.changeId || contract.changeId !== claimPlan.changeId) {
    throw new Error("Ready-set WorkflowGraphPlan changeId mismatch.");
  }
  if (workerPlan.schedulerContractId !== contract.id || claimPlan.schedulerContractId !== contract.id) {
    throw new Error("Ready-set WorkflowGraphPlan SchedulerContract lineage mismatch.");
  }
  if (claimPlan.schedulerWorkerPlanId !== workerPlan.id) {
    throw new Error("Ready-set WorkflowGraphPlan SchedulerWorkerSessionPlan lineage mismatch.");
  }
  if (workerPlan.schedulerDispatchDryRunId !== claimPlan.schedulerDispatchDryRunId) {
    throw new Error("Ready-set WorkflowGraphPlan SchedulerDispatchDryRun lineage mismatch.");
  }
  if (contract.decompositionPlanId !== workerPlan.decompositionPlanId || contract.decompositionPlanId !== claimPlan.decompositionPlanId) {
    throw new Error("Ready-set WorkflowGraphPlan decompositionPlanId mismatch.");
  }
  if (contract.readinessManifestId !== workerPlan.readinessManifestId || contract.readinessManifestId !== claimPlan.readinessManifestId) {
    throw new Error("Ready-set WorkflowGraphPlan readinessManifestId mismatch.");
  }

  assertLatestSchedulerArtifact(await readLatestSchedulerContract(memory, changePath), contract, "Ready-set WorkflowGraphPlan", "SchedulerContract");
  assertLatestSchedulerArtifact(await readLatestSchedulerWorkerSessionPlan(memory, changePath), workerPlan, "Ready-set WorkflowGraphPlan", "SchedulerWorkerSessionPlan");
  assertLatestSchedulerArtifact(await readLatestSchedulerClaimReconcilePlan(memory, changePath), claimPlan, "Ready-set WorkflowGraphPlan", "SchedulerClaimReconcilePlan");
  const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, changePath);
  if (latestDryRun.id !== claimPlan.schedulerDispatchDryRunId) {
    throw new Error("Ready-set WorkflowGraphPlan SchedulerDispatchDryRun target is stale.");
  }

  await assertSourceHashesFresh(memory, contract.sourceArtifactHashes, "SchedulerContract");
  await assertSourceHashesFresh(memory, workerPlan.sourceArtifactHashes, "SchedulerWorkerSessionPlan");
  await assertSourceHashesFresh(memory, claimPlan.sourceArtifactHashes, "SchedulerClaimReconcilePlan");
  assertReadySetGraphConsistency(contract, workerPlan, claimPlan);
}

async function assertSourceHashesFresh(memory: ResolvedMemory, hashes: Record<string, string>, label: string): Promise<void> {
  const expected = await hashArtifactRefs(memory, Object.keys(hashes));
  for (const [artifact, hash] of Object.entries(expected)) {
    if (hashes[artifact] !== hash) throw new Error(`Ready-set WorkflowGraphPlan ${label} source artifact hash mismatch: ${artifact}.`);
  }
}

function assertReadySetGraphConsistency(contract: SchedulerContract, workerPlan: SchedulerWorkerSessionPlan, claimPlan: SchedulerClaimReconcilePlan): void {
  const contractNodes = new Map(contract.nodes.map((node) => [node.id, node]));
  const workerNodes = new Map(workerPlan.plannedNodes.map((node) => [node.nodeId, node]));
  const claims = new Map(claimPlan.claimIntents.map((claim) => [claim.nodeId, claim]));
  if (contractNodes.size !== contract.nodes.length) throw new Error("Ready-set WorkflowGraphPlan SchedulerContract has duplicate nodes.");
  if (workerNodes.size !== workerPlan.plannedNodes.length) throw new Error("Ready-set WorkflowGraphPlan SchedulerWorkerSessionPlan has duplicate nodes.");
  if (claims.size !== claimPlan.claimIntents.length) throw new Error("Ready-set WorkflowGraphPlan SchedulerClaimReconcilePlan has duplicate node claims.");
  for (const contractNode of contract.nodes) {
    const workerNode = workerNodes.get(contractNode.id);
    const claim = claims.get(contractNode.id);
    if (!workerNode) throw new Error(`Ready-set WorkflowGraphPlan missing worker node for ${contractNode.id}.`);
    if (!claim) throw new Error(`Ready-set WorkflowGraphPlan missing claim intent for ${contractNode.id}.`);
    if (workerNode.unitId !== contractNode.unitId || claim.unitId !== contractNode.unitId) {
      throw new Error(`Ready-set WorkflowGraphPlan unit mismatch for ${contractNode.id}.`);
    }
    if (workerNode.waveIndex !== claim.waveIndex) {
      throw new Error(`Ready-set WorkflowGraphPlan wave mismatch for ${contractNode.id}.`);
    }
    if (claim.stageIds.some((stageId) => !workerNode.stageIds.includes(stageId))) {
      throw new Error(`Ready-set WorkflowGraphPlan claim stage mismatch for ${contractNode.id}.`);
    }
  }
  for (const checkpoint of claimPlan.waveCheckpoints) {
    for (const claimIntentId of checkpoint.claimIntentIds) {
      const claim = claimPlan.claimIntents.find((item) => item.claimIntentId === claimIntentId);
      if (!claim || claim.waveIndex !== checkpoint.waveIndex) {
        throw new Error(`Ready-set WorkflowGraphPlan wave checkpoint has mismatched claim intent ${claimIntentId}.`);
      }
    }
  }
}

function buildReadySetGraphNodes(contract: SchedulerContract, workerPlan: SchedulerWorkerSessionPlan, claimPlan: SchedulerClaimReconcilePlan): ReadySetWorkflowGraphNode[] {
  const stagesByNode = new Map<string, SchedulerWorkerPlanStage[]>();
  for (const stage of workerPlan.plannedStages) {
    const stages = stagesByNode.get(stage.nodeId) ?? [];
    stages.push(stage);
    stagesByNode.set(stage.nodeId, stages);
  }
  const workerNodes = new Map(workerPlan.plannedNodes.map((node) => [node.nodeId, node]));
  const claims = new Map(claimPlan.claimIntents.map((claim) => [claim.nodeId, claim]));
  return contract.nodes.map((node) => buildReadySetGraphNode(node, workerNodes.get(node.id), claims.get(node.id), stagesByNode.get(node.id) ?? []));
}

function buildReadySetGraphNode(
  contractNode: SchedulerContractNode,
  workerNode: SchedulerWorkerPlanNode | undefined,
  claim: SchedulerClaimIntent | undefined,
  stages: SchedulerWorkerPlanStage[],
): ReadySetWorkflowGraphNode {
  if (!workerNode) throw new Error(`Ready-set WorkflowGraphPlan missing worker node for ${contractNode.id}.`);
  if (!claim) throw new Error(`Ready-set WorkflowGraphPlan missing claim intent for ${contractNode.id}.`);
  return {
    id: `ready-set-node-${contractNode.id}`,
    schedulerNodeId: contractNode.id,
    unitId: contractNode.unitId,
    taskIds: contractNode.taskIds,
    title: contractNode.title,
    waveIndex: workerNode.waveIndex,
    stages: contractNode.stages,
    stageRefs: stages.map(toStageRef),
    acIds: contractNode.acIds,
    sourceScopes: unique([...contractNode.sourceScopes, ...claim.sourceScopes]),
    claimIntentId: claim.claimIntentId,
    plannedWorkerKey: claim.plannedWorkerKey,
    roleIds: claim.roleIds,
    plannedSlotDemand: claim.plannedSlotDemand,
    sourceLocks: claim.sourceLockIntents.map((lock) => ({
      scope: lock.scope,
      nodeId: lock.nodeId,
      unitId: lock.unitId,
      waveIndex: lock.waveIndex,
      claimIntentId: claim.claimIntentId,
      stageIds: lock.stageIds,
    })),
    recoveryKeyInputs: claim.recoveryKeyInputs,
    status: claim.status,
    blockedReasons: unique([...workerNode.blockedReasons, ...claim.blockedReasons, ...stages.flatMap((stage) => stage.blockedReasons)]),
  };
}

function toStageRef(stage: SchedulerWorkerPlanStage): ReadySetWorkflowGraphStageRef {
  return {
    id: stage.id,
    stage: stage.stage,
    roleId: stage.roleId,
    adapterFamily: stage.adapterFamily,
    status: stage.status,
    sourceScopes: stage.workspaceIntent.sourceScopes,
    recoveryKeyInputs: stage.recoveryKeyInputs,
    blockedReasons: stage.blockedReasons,
  };
}

function buildReadySetGraphEdges(contract: SchedulerContract, workerPlan: SchedulerWorkerSessionPlan): ReadySetWorkflowGraphEdge[] {
  const dependencyEdges: ReadySetWorkflowGraphEdge[] = contract.edges.map((edge) => ({
    from: `ready-set-node-${edge.from}`,
    to: `ready-set-node-${edge.to}`,
    kind: edge.kind,
  }));
  const stageEdges = workerPlan.plannedNodes.flatMap((node) => {
    const stageIds = node.stageIds;
    return stageIds.slice(0, -1).map((stageId, index) => ({
      from: stageId,
      to: stageIds[index + 1],
      kind: "stage-order" as const,
    }));
  });
  return [...dependencyEdges, ...stageEdges];
}

function buildReadySetGraphWaves(contract: SchedulerContract, claimPlan: SchedulerClaimReconcilePlan): ReadySetWorkflowGraphWave[] {
  return contract.waves.map((wave) => {
    const checkpoint = claimPlan.waveCheckpoints.find((item) => item.waveIndex === wave.index);
    const waveClaims = claimPlan.claimIntents.filter((claim) => claim.waveIndex === wave.index);
    return {
      index: wave.index,
      nodeIds: wave.nodeIds.map((nodeId) => `ready-set-node-${nodeId}`),
      claimIntentIds: checkpoint?.claimIntentIds ?? waveClaims.map((claim) => claim.claimIntentId),
      candidateCount: checkpoint?.candidateCount ?? waveClaims.filter((claim) => claim.status === "planned").length,
      blockedCount: checkpoint?.blockedCount ?? waveClaims.filter((claim) => claim.status === "blocked").length,
      plannedSlotDemand: checkpoint?.plannedSlotDemand ?? waveClaims.reduce((sum, claim) => sum + claim.plannedSlotDemand, 0),
      blockedReasons: checkpoint?.blockedReasons ?? unique(waveClaims.flatMap((claim) => claim.blockedReasons)),
    };
  });
}
