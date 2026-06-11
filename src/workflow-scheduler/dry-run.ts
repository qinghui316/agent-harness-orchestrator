import { mkdir } from "node:fs/promises";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { unique } from "../workflow-artifacts/utils.js";
import { schedulerDispatchDryRunsDir } from "./paths.js";
import { schedulerDispatchDryRunArtifactRefs, writeSchedulerDispatchDryRun } from "./repository.js";
import type {
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerDryRunNodeVerdict,
  SchedulerDryRunWaveVerdict,
} from "./types.js";

const RUNTIME_CONTINUITY_PREREQUISITES = [
  "WorkerSession scope for every worker run",
  "RuntimeWorkspace boundary for local-worktree or source-root execution",
  "EventSource for replayable worker event streams",
  "AgentEventEnvelope canonical scope for normalized worker events",
  "ToolPolicyGate decision before high-impact tool execution",
  "Validation, audit, integration, and human gates remain authoritative",
];

export async function compileSchedulerDispatchDryRun(
  memory: ResolvedMemory,
  changePath: string,
  contract: SchedulerContract,
): Promise<SchedulerDispatchDryRun> {
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerDispatchDryRun contract");
  validateDryRunInput(contract);

  const now = new Date().toISOString();
  const id = `scheduler-dry-run-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${contract.changeId}:${contract.id}:${now}`).slice(0, 8)}`;
  await mkdir(schedulerDispatchDryRunsDir(memory, changePath), { recursive: true });

  const nodeVerdicts = buildNodeVerdicts(contract);
  const waveVerdicts = buildWaveVerdicts(contract, nodeVerdicts);
  const blockedReasons = unique([
    ...nodeVerdicts.flatMap((node) => node.blockedReasons),
    ...waveVerdicts.flatMap((wave) => wave.blockedReasons),
  ]);
  const refs = schedulerDispatchDryRunArtifactRefs(memory, changePath, id);
  const sourceRefs = unique(contract.artifactRefs);
  const dryRun: SchedulerDispatchDryRun = {
    version: "1.0",
    id,
    changeId: contract.changeId,
    status: "generated",
    schedulerMode: contract.schedulerMode,
    schedulerContractId: contract.id,
    decompositionPlanId: contract.decompositionPlanId,
    readinessManifestId: contract.readinessManifestId,
    nodeVerdicts,
    waveVerdicts,
    estimatedMaxWaveWidth: contract.waves.reduce((max, wave) => Math.max(max, wave.nodeIds.length), 0),
    dependencyCount: contract.edges.length,
    conflictCount: contract.conflictScopes.length,
    conflictScopes: contract.conflictScopes,
    runtimeContinuityPrerequisites: RUNTIME_CONTINUITY_PREREQUISITES,
    blockedReasons,
    sourceArtifactHashes: await hashArtifactRefs(memory, sourceRefs),
    artifactRefs: unique([...sourceRefs, refs.artifact, refs.markdownArtifact]),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerDispatchDryRun(memory, changePath, dryRun);
  return dryRun;
}

function validateDryRunInput(contract: SchedulerContract): void {
  if (contract.status !== "compiled") throw new Error("Scheduler dry-run requires a compiled SchedulerContract.");
  if (contract.schedulerMode !== "parallel-readiness-v1") throw new Error("Scheduler dry-run requires parallel-readiness-v1 contract mode.");
  if (!contract.nodes.length) throw new Error("Scheduler dry-run requires at least one contract node.");
  if (!contract.waves.length) throw new Error("Scheduler dry-run requires SchedulerContract waves.");
}

function buildNodeVerdicts(contract: SchedulerContract): SchedulerDryRunNodeVerdict[] {
  const waveByNode = new Map<string, number>();
  for (const wave of contract.waves) {
    for (const nodeId of wave.nodeIds) waveByNode.set(nodeId, wave.index);
  }
  const incoming = new Map(contract.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of contract.edges) incoming.get(edge.to)?.push(edge.from);

  return contract.nodes.map((node) => {
    const waveIndex = waveByNode.get(node.id);
    const dependencyNodeIds = incoming.get(node.id) ?? [];
    const blockedReasons: string[] = [];
    if (waveIndex === undefined) blockedReasons.push("Node is not assigned to a SchedulerContract wave.");
    for (const dependencyId of dependencyNodeIds) {
      const dependencyWave = waveByNode.get(dependencyId);
      if (dependencyWave === undefined) blockedReasons.push(`Dependency ${dependencyId} is not assigned to a wave.`);
      if (dependencyWave !== undefined && waveIndex !== undefined && dependencyWave >= waveIndex) {
        blockedReasons.push(`Dependency ${dependencyId} is not in an earlier wave.`);
      }
    }
    if (!node.sourceScopes.length) blockedReasons.push("Node has no concrete source scope.");
    if (!node.stages.length) blockedReasons.push("Node has no role stage pipeline.");
    return {
      nodeId: node.id,
      unitId: node.unitId,
      waveIndex: waveIndex ?? -1,
      status: blockedReasons.length ? "blocked" : "candidate",
      dependencyNodeIds,
      dependenciesSatisfied: blockedReasons.every((reason) => !reason.includes("Dependency")),
      sourceScopes: node.sourceScopes,
      stages: node.stages,
      runtimeContinuityPrerequisites: RUNTIME_CONTINUITY_PREREQUISITES,
      blockedReasons,
    };
  });
}

function buildWaveVerdicts(contract: SchedulerContract, nodeVerdicts: SchedulerDryRunNodeVerdict[]): SchedulerDryRunWaveVerdict[] {
  const verdictByNode = new Map(nodeVerdicts.map((node) => [node.nodeId, node]));
  return contract.waves.map((wave) => {
    const nodeVerdictsForWave = wave.nodeIds.map((nodeId) => verdictByNode.get(nodeId)).filter((node): node is SchedulerDryRunNodeVerdict => Boolean(node));
    const blockedReasons = unique(nodeVerdictsForWave.flatMap((node) => node.blockedReasons));
    const blockedCount = nodeVerdictsForWave.filter((node) => node.status === "blocked").length;
    return {
      index: wave.index,
      nodeIds: wave.nodeIds,
      status: blockedCount ? "blocked" : "candidate",
      candidateCount: nodeVerdictsForWave.length - blockedCount,
      blockedCount,
      blockedReasons,
    };
  });
}
