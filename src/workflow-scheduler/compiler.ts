import { mkdir } from "node:fs/promises";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory, WorkflowGraphStage } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import type { DecompositionPlan, DecompositionReadinessManifest } from "../workflow-artifacts/types.js";
import { unique } from "../workflow-artifacts/utils.js";
import { schedulerContractsDir } from "./paths.js";
import { schedulerContractArtifactRefs, writeSchedulerContract } from "./repository.js";
import type { SchedulerContract, SchedulerContractEdge, SchedulerContractNode, SchedulerContractWave } from "./types.js";

const STAGE_ORDER: WorkflowGraphStage[] = ["coder", "validation", "audit", "bounded-rework"];

export async function compileSchedulerContract(
  memory: ResolvedMemory,
  changePath: string,
  plan: DecompositionPlan,
  readiness: DecompositionReadinessManifest,
): Promise<SchedulerContract> {
  await assertWorkflowArtifactScope(memory, changePath, plan, "SchedulerContract plan");
  await assertWorkflowArtifactScope(memory, changePath, readiness, "SchedulerContract readiness");
  validateSchedulerInputs(plan, readiness);

  const now = new Date().toISOString();
  const id = `scheduler-contract-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${plan.changeId}:${plan.id}:${readiness.id}:${now}`).slice(0, 8)}`;
  const dir = schedulerContractsDir(memory, changePath);
  await mkdir(dir, { recursive: true });

  const nodes = buildNodes(plan);
  const edges = buildEdges(plan, nodes);
  validateSourceScopes(nodes, plan.conflictScopes, edges);
  const waves = buildWaves(nodes, edges);
  const refs = schedulerContractArtifactRefs(memory, changePath, id);
  const sourceRefs = unique([
    ...plan.artifactRefs,
    plan.artifact,
    plan.markdownArtifact,
    ...readiness.artifactRefs,
    readiness.artifact,
    readiness.markdownArtifact,
  ]);
  const artifactRefs = unique([...sourceRefs, refs.artifact, refs.markdownArtifact]);
  const contract: SchedulerContract = {
    version: "1.0",
    id,
    changeId: plan.changeId,
    status: "compiled",
    schedulerMode: "parallel-readiness-v1",
    decompositionPlanId: plan.id,
    readinessManifestId: readiness.id,
    nodes,
    edges,
    waves,
    conflictScopes: plan.conflictScopes,
    sourceArtifactHashes: await hashArtifactRefs(memory, sourceRefs),
    artifactRefs,
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerContract(memory, changePath, contract);
  return contract;
}

function validateSchedulerInputs(plan: DecompositionPlan, readiness: DecompositionReadinessManifest): void {
  if (plan.changeId !== readiness.changeId || readiness.decompositionPlanId !== plan.id) {
    throw new Error("SchedulerContract compile requires matching DecompositionPlan and readiness.");
  }
  if (plan.status !== "confirmed") throw new Error("SchedulerContract compile requires a confirmed DecompositionPlan.");
  if (plan.recommendation !== "taskgraph-parallel-candidate" || readiness.recommendation !== "taskgraph-parallel-candidate") {
    throw new Error("SchedulerContract compile requires a parallel TaskGraph candidate.");
  }
  if (readiness.status !== "ready-for-scheduler-contract" || readiness.nextAllowedAction !== "scheduler.contract") {
    throw new Error("SchedulerContract compile requires scheduler-contract readiness.");
  }
}

function buildNodes(plan: DecompositionPlan): SchedulerContractNode[] {
  return plan.units.map((unit, index) => ({
    id: `scheduler-node-${String(index + 1).padStart(3, "0")}`,
    unitId: unit.id,
    taskIds: unit.taskIds,
    acIds: unit.acIds,
    title: unit.title,
    sourceScopes: unit.scopeHints,
    stages: STAGE_ORDER,
  }));
}

function buildEdges(plan: DecompositionPlan, nodes: SchedulerContractNode[]): SchedulerContractEdge[] {
  const nodeByUnit = new Map(nodes.map((node) => [node.unitId, node]));
  const edges: SchedulerContractEdge[] = [];
  for (const dep of plan.dependencies) {
    if (dep.kind === "conflicts") {
      throw new Error(`SchedulerContract compile requires explicit ordering for conflict edge ${dep.from} -> ${dep.to}.`);
    }
    const from = nodeByUnit.get(dep.from);
    const to = nodeByUnit.get(dep.to);
    if (!from || !to) throw new Error(`SchedulerContract dependency references unknown unit: ${dep.from} -> ${dep.to}.`);
    edges.push({ from: from.id, to: to.id, kind: dep.kind === "synthesizes" ? "synthesis" : "dependency" });
  }
  for (const node of nodes) {
    const unit = plan.units.find((item) => item.id === node.unitId);
    for (const depId of unit?.dependsOn ?? []) {
      const from = nodeByUnit.get(depId);
      if (!from) throw new Error(`SchedulerContract unit ${unit?.id ?? node.unitId} depends on unknown unit ${depId}.`);
      if (!edges.some((edge) => edge.from === from.id && edge.to === node.id)) {
        edges.push({ from: from.id, to: node.id, kind: "dependency" });
      }
    }
  }
  return edges;
}

function validateSourceScopes(nodes: SchedulerContractNode[], conflictScopes: string[], edges: SchedulerContractEdge[]): void {
  for (const node of nodes) {
    if (!node.sourceScopes.length || !node.sourceScopes.every(isSpecificSourceScope)) {
      throw new Error(`SchedulerContract node ${node.id} has ambiguous source scope.`);
    }
  }
  if (!conflictScopes.length || !conflictScopes.every(isSpecificSourceScope)) {
    throw new Error("SchedulerContract compile requires concrete conflict scopes.");
  }
  const seen = new Map<string, string>();
  const orderedPairs = orderedNodePairs(nodes, edges);
  for (const node of nodes) {
    for (const scope of node.sourceScopes.map(normalizeScope)) {
      const owner = seen.get(scope);
      if (owner && owner !== node.id && !isOrdered(owner, node.id, orderedPairs)) {
        throw new Error(`SchedulerContract source scope ${scope} is shared by ${owner} and ${node.id}; add an explicit dependency or split scope.`);
      }
      seen.set(scope, node.id);
    }
  }
}

function orderedNodePairs(nodes: SchedulerContractNode[], edges: SchedulerContractEdge[]): Set<string> {
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) outgoing.get(edge.from)?.push(edge.to);
  const pairs = new Set<string>();
  for (const node of nodes) {
    const stack = [...(outgoing.get(node.id) ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const target = stack.pop();
      if (!target || seen.has(target)) continue;
      seen.add(target);
      pairs.add(`${node.id}->${target}`);
      stack.push(...(outgoing.get(target) ?? []));
    }
  }
  return pairs;
}

function isOrdered(left: string, right: string, pairs: Set<string>): boolean {
  return pairs.has(`${left}->${right}`) || pairs.has(`${right}->${left}`);
}

export function buildWaves(nodes: SchedulerContractNode[], edges: SchedulerContractEdge[]): SchedulerContractWave[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`SchedulerContract edge references unknown node: ${edge.from} -> ${edge.to}.`);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const waves: SchedulerContractWave[] = [];
  let ready = nodes.map((node) => node.id).filter((id) => (inDegree.get(id) ?? 0) === 0).sort();
  const emitted = new Set<string>();
  while (ready.length) {
    const nodeIdsForWave = ready;
    waves.push({ index: waves.length, nodeIds: nodeIdsForWave });
    const next = new Set<string>();
    for (const id of nodeIdsForWave) {
      emitted.add(id);
      for (const target of outgoing.get(id) ?? []) {
        const count = (inDegree.get(target) ?? 0) - 1;
        inDegree.set(target, count);
        if (count === 0) next.add(target);
      }
    }
    ready = [...next].sort();
  }
  if (emitted.size !== nodes.length) throw new Error("SchedulerContract dependency graph contains a cycle.");
  return waves;
}

function isSpecificSourceScope(scope: string): boolean {
  const normalized = normalizeScope(scope);
  if (!normalized) return false;
  if (normalized === "selected-demand") return false;
  if (normalized === "aho-owned worktree only") return false;
  if (normalized.includes("must be checked")) return false;
  if (normalized.includes("source overlap")) return false;
  return /[/.\\]/.test(normalized) || /\bsrc\b|\btest\b|\bdocs\b|\bmodule\b|\bpackage\b/.test(normalized);
}

function normalizeScope(scope: string): string {
  return scope.trim().toLowerCase().replace(/\\/g, "/");
}
