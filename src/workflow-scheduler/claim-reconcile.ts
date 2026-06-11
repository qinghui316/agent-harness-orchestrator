import { mkdir } from "node:fs/promises";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { unique } from "../workflow-artifacts/utils.js";
import { schedulerClaimReconcilePlansDir } from "./paths.js";
import {
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerWorkerSessionPlan,
  schedulerClaimReconcilePlanArtifactRefs,
  writeSchedulerClaimReconcilePlan,
} from "./repository.js";
import type {
  SchedulerClaimIntent,
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerReconcileWaveCheckpoint,
  SchedulerSourceLockIntent,
  SchedulerWorkerPlanNode,
  SchedulerWorkerPlanStage,
  SchedulerWorkerRecoveryKeyInput,
  SchedulerWorkerSessionPlan,
} from "./types.js";

export async function compileSchedulerClaimReconcilePlan(
  memory: ResolvedMemory,
  changePath: string,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): Promise<SchedulerClaimReconcilePlan> {
  await assertWorkflowArtifactScope(memory, changePath, workerPlan, "SchedulerClaimReconcilePlan worker plan");
  await assertWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerClaimReconcilePlan dry-run");
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerClaimReconcilePlan contract");
  await validateClaimReconcileInput(memory, changePath, workerPlan, dryRun, contract);

  const now = new Date().toISOString();
  const id = `scheduler-claim-reconcile-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${workerPlan.changeId}:${workerPlan.id}:${now}`).slice(0, 8)}`;
  await mkdir(schedulerClaimReconcilePlansDir(memory, changePath), { recursive: true });

  const claimIntents = buildClaimIntents(workerPlan);
  assertNoSameWaveSourceLockOverlap(claimIntents);
  const waveCheckpoints = buildWaveCheckpoints(claimIntents);
  const blockedCount = claimIntents.filter((claim) => claim.status === "blocked").length;
  const refs = schedulerClaimReconcilePlanArtifactRefs(memory, changePath, id);
  const sourceRefs = unique(Object.keys(workerPlan.sourceArtifactHashes));
  const plan: SchedulerClaimReconcilePlan = {
    version: "1.0",
    id,
    changeId: workerPlan.changeId,
    status: "planned",
    schedulerMode: workerPlan.schedulerMode,
    schedulerContractId: contract.id,
    schedulerDispatchDryRunId: dryRun.id,
    schedulerWorkerPlanId: workerPlan.id,
    decompositionPlanId: workerPlan.decompositionPlanId,
    readinessManifestId: workerPlan.readinessManifestId,
    claimIntents,
    waveCheckpoints,
    plannedSlotDemand: claimIntents.reduce((sum, claim) => sum + claim.plannedSlotDemand, 0),
    maxPlannedWaveWidth: waveCheckpoints.reduce((max, wave) => Math.max(max, wave.plannedSlotDemand), 0),
    blockedCount,
    recoveryKeyCoverage: blockedCount ? "partial" : "complete",
    sourceArtifactHashes: await hashArtifactRefs(memory, sourceRefs),
    artifactRefs: unique([...sourceRefs, workerPlan.artifact, workerPlan.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerClaimReconcilePlan(memory, changePath, plan);
  return plan;
}

async function validateClaimReconcileInput(
  memory: ResolvedMemory,
  changePath: string,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): Promise<void> {
  if (workerPlan.status !== "planned") throw new Error("SchedulerClaimReconcilePlan requires a planned SchedulerWorkerSessionPlan.");
  if (dryRun.status !== "generated") throw new Error("SchedulerClaimReconcilePlan requires a generated SchedulerDispatchDryRun.");
  if (contract.status !== "compiled") throw new Error("SchedulerClaimReconcilePlan requires a compiled SchedulerContract.");
  if (workerPlan.schedulerMode !== "parallel-readiness-v1" || dryRun.schedulerMode !== "parallel-readiness-v1" || contract.schedulerMode !== "parallel-readiness-v1") {
    throw new Error("SchedulerClaimReconcilePlan requires parallel-readiness-v1 scheduler artifacts.");
  }
  if (workerPlan.changeId !== dryRun.changeId || workerPlan.changeId !== contract.changeId) {
    throw new Error("SchedulerClaimReconcilePlan changeId mismatch.");
  }
  if (workerPlan.schedulerDispatchDryRunId !== dryRun.id) {
    throw new Error("SchedulerClaimReconcilePlan worker plan does not match SchedulerDispatchDryRun.");
  }
  if (workerPlan.schedulerContractId !== contract.id || dryRun.schedulerContractId !== contract.id) {
    throw new Error("SchedulerClaimReconcilePlan scheduler contract mismatch.");
  }
  if (workerPlan.decompositionPlanId !== dryRun.decompositionPlanId || workerPlan.decompositionPlanId !== contract.decompositionPlanId) {
    throw new Error("SchedulerClaimReconcilePlan decompositionPlanId mismatch.");
  }
  if (workerPlan.readinessManifestId !== dryRun.readinessManifestId || workerPlan.readinessManifestId !== contract.readinessManifestId) {
    throw new Error("SchedulerClaimReconcilePlan readinessManifestId mismatch.");
  }
  if (!workerPlan.plannedNodes.length || !workerPlan.plannedStages.length) {
    throw new Error("SchedulerClaimReconcilePlan requires worker plan nodes and stages.");
  }

  const latestWorkerPlan = await readLatestSchedulerWorkerSessionPlan(memory, changePath);
  if (latestWorkerPlan.id !== workerPlan.id) throw new Error("SchedulerClaimReconcilePlan requires the latest SchedulerWorkerSessionPlan.");
  const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, changePath);
  if (latestDryRun.id !== dryRun.id) throw new Error("SchedulerClaimReconcilePlan requires the latest SchedulerDispatchDryRun.");
  const latestContract = await readLatestSchedulerContract(memory, changePath);
  if (latestContract.id !== contract.id) throw new Error("SchedulerClaimReconcilePlan requires the latest SchedulerContract.");

  const expectedHashes = await hashArtifactRefs(memory, Object.keys(workerPlan.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(expectedHashes)) {
    if (workerPlan.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`SchedulerClaimReconcilePlan source artifact hash mismatch: ${artifact}.`);
    }
  }
}

function buildClaimIntents(workerPlan: SchedulerWorkerSessionPlan): SchedulerClaimIntent[] {
  const stagesByNode = new Map<string, SchedulerWorkerPlanStage[]>();
  for (const stage of workerPlan.plannedStages) {
    const stages = stagesByNode.get(stage.nodeId) ?? [];
    stages.push(stage);
    stagesByNode.set(stage.nodeId, stages);
  }

  return workerPlan.plannedNodes.map((node) => buildClaimIntent(workerPlan, node, stagesByNode.get(node.nodeId) ?? []));
}

function buildClaimIntent(workerPlan: SchedulerWorkerSessionPlan, node: SchedulerWorkerPlanNode, stages: SchedulerWorkerPlanStage[]): SchedulerClaimIntent {
  const blockedReasons = unique([...node.blockedReasons, ...stages.flatMap((stage) => stage.blockedReasons)]);
  const status = node.status === "blocked" || stages.some((stage) => stage.status === "blocked") || blockedReasons.length ? "blocked" : "planned";
  const sourceScopes = unique(stages.flatMap((stage) => stage.workspaceIntent.sourceScopes));
  const stageIds = stages.map((stage) => stage.id);
  return {
    claimIntentId: `claim-intent-${node.nodeId}`,
    plannedWorkerKey: `${workerPlan.id}:${node.nodeId}`,
    nodeId: node.nodeId,
    unitId: node.unitId,
    waveIndex: node.waveIndex,
    stageIds,
    roleIds: unique(stages.map((stage) => stage.roleId)),
    sourceScopes,
    status,
    plannedSlotDemand: status === "planned" ? 1 : 0,
    sourceLockIntents: sourceScopes.map((scope) => buildSourceLockIntent(scope, node, stageIds)),
    recoveryKeyInputs: buildRecoveryKeyInputs(workerPlan, node, sourceScopes),
    blockedReasons,
  };
}

function buildSourceLockIntent(scope: string, node: SchedulerWorkerPlanNode, stageIds: string[]): SchedulerSourceLockIntent {
  return {
    scope,
    nodeId: node.nodeId,
    unitId: node.unitId,
    waveIndex: node.waveIndex,
    stageIds,
  };
}

function buildRecoveryKeyInputs(workerPlan: SchedulerWorkerSessionPlan, node: SchedulerWorkerPlanNode, sourceScopes: string[]): SchedulerWorkerRecoveryKeyInput[] {
  return [
    { key: "changeId", value: workerPlan.changeId },
    { key: "schedulerContractId", value: workerPlan.schedulerContractId },
    { key: "schedulerDispatchDryRunId", value: workerPlan.schedulerDispatchDryRunId },
    { key: "schedulerWorkerPlanId", value: workerPlan.id },
    { key: "nodeId", value: node.nodeId },
    { key: "unitId", value: node.unitId },
    { key: "waveIndex", value: String(node.waveIndex) },
    { key: "sourceScopes", value: sourceScopes },
  ];
}

function assertNoSameWaveSourceLockOverlap(claimIntents: SchedulerClaimIntent[]): void {
  const seen = new Map<string, string>();
  for (const claim of claimIntents) {
    if (claim.status !== "planned") continue;
    for (const sourceLock of claim.sourceLockIntents) {
      const key = `${sourceLock.waveIndex}:${sourceLock.scope}`;
      const existingClaimIntentId = seen.get(key);
      if (existingClaimIntentId && existingClaimIntentId !== claim.claimIntentId) {
        throw new Error(`SchedulerClaimReconcilePlan source lock conflict in wave ${sourceLock.waveIndex + 1}: ${sourceLock.scope}.`);
      }
      seen.set(key, claim.claimIntentId);
    }
  }
}

function buildWaveCheckpoints(claimIntents: SchedulerClaimIntent[]): SchedulerReconcileWaveCheckpoint[] {
  const waveIndexes = [...new Set(claimIntents.map((claim) => claim.waveIndex))].sort((left, right) => left - right);
  return waveIndexes.map((waveIndex) => {
    const claims = claimIntents.filter((claim) => claim.waveIndex === waveIndex);
    const blockedCount = claims.filter((claim) => claim.status === "blocked").length;
    return {
      waveIndex,
      claimIntentIds: claims.map((claim) => claim.claimIntentId),
      candidateCount: claims.length - blockedCount,
      blockedCount,
      plannedSlotDemand: claims.reduce((sum, claim) => sum + claim.plannedSlotDemand, 0),
      blockedReasons: unique(claims.flatMap((claim) => claim.blockedReasons)),
    };
  });
}
