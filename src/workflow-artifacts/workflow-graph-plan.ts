import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ReadySetWorkflowGraphPlan, ResolvedMemory, SequentialWorkflowGraphPlan, WorkflowGraphPlan } from "../types/index.js";
import { assertWorkflowArtifactScope } from "./guards.js";
import { latestWorkflowGraphPlanPath, workflowGraphPlanPath } from "./paths.js";
import { renderWorkflowGraphPlanMarkdown } from "./rendering.js";
import { workflowAuthoringPlanSchema, workflowGraphPlanSchema } from "./schemas.js";
import type { AuthoredWorkflowGraphCompileOptions, WorkflowAuthoringPlan } from "./types.js";
import { validateWorkflowAuthoringPlan } from "./workflow-authoring-plan.js";

const stageOrder = ["coder", "validation", "audit", "bounded-rework"] as const;

export function compileWorkflowGraphPlan(
  plan: WorkflowAuthoringPlan,
  options: AuthoredWorkflowGraphCompileOptions,
): WorkflowGraphPlan {
  return compileAuthoredWorkflowGraphPlan(plan, options);
}

function compileAuthoredWorkflowGraphPlan(plan: WorkflowAuthoringPlan, options: AuthoredWorkflowGraphCompileOptions): WorkflowGraphPlan {
  const parsedPlan = workflowAuthoringPlanSchema.parse(plan);
  validateWorkflowAuthoringPlan(parsedPlan, options);
  const base = {
    version: "1.0" as const,
    id: options.id,
    changeId: options.changeId,
    status: "compiled" as const,
    graphMode: parsedPlan.mode,
    authoringContractVersion: "1.0" as const,
    planArtifactRef: options.planArtifactRef,
    sourceArtifactHashes: { ...options.sourceArtifactHashes },
    artifactRefs: [...options.artifactRefs],
    artifact: options.artifact,
    markdownArtifact: options.markdownArtifact,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt ?? options.createdAt,
  };
  if (parsedPlan.mode === "sequential-v1") {
    const nodes = parsedPlan.nodes.map((node, index) => ({
      id: node.id,
      taskId: node.taskIds[0] as string,
      taskIds: node.taskIds,
      unitId: node.id,
      title: node.title,
      prompt: node.prompt,
      dependsOn: node.dependsOn,
      order: index + 1,
      stages: [...stageOrder],
      acIds: node.acIds,
      sourceScopes: node.sourceScopes,
    }));
    const edges = nodes.flatMap((node) => [
      ...node.dependsOn!.map((dependency) => ({ from: dependency, to: node.id, kind: "task-order" as const })),
      ...stageOrder.slice(0, -1).map((stage, index) => ({ from: `${node.id}:${stage}`, to: `${node.id}:${stageOrder[index + 1]}`, kind: "stage-order" as const })),
    ]);
    return { ...base, graphMode: "sequential-v1", nodes, edges };
  }
  const waveByNode = compileReadySetWaveIndexes(parsedPlan);
  const nodes = parsedPlan.nodes.map((node) => {
    const waveIndex = waveByNode.get(node.id) ?? 0;
    const claimIntentId = `${options.id}:claim:${node.id}`;
    const recoveryKeyInputs = [
      { key: "workflowGraphPlanId", value: options.id },
      { key: "nodeId", value: node.id },
      { key: "taskIds", value: node.taskIds },
      { key: "sourceScopes", value: node.sourceScopes },
      { key: "nodePromptHash", value: sha256(node.prompt) },
    ];
    const stageRefs = stageOrder.map((stage) => ({
      id: `${node.id}:${stage}`,
      stage,
      roleId: stage === "coder" ? "coder-agent" : stage === "validation" ? "validator" : stage === "audit" ? "auditor-agent" : "rework-coder",
      adapterFamily: stage,
      status: "planned" as const,
      sourceScopes: node.sourceScopes,
      recoveryKeyInputs,
      blockedReasons: [],
    }));
    return {
      id: node.id,
      schedulerNodeId: node.id,
      unitId: node.id,
      taskIds: node.taskIds,
      title: node.title,
      prompt: node.prompt,
      dependsOn: node.dependsOn,
      waveIndex,
      stages: [...stageOrder],
      stageRefs,
      acIds: node.acIds,
      sourceScopes: node.sourceScopes,
      claimIntentId,
      plannedWorkerKey: `${options.id}:worker:${node.id}`,
      roleIds: ["coder-agent", "validator", "auditor-agent", "rework-coder"],
      plannedSlotDemand: 1,
      sourceLocks: node.sourceScopes.map((scope) => ({ scope, nodeId: node.id, unitId: node.id, waveIndex, claimIntentId, stageIds: stageRefs.map((stage) => stage.id) })),
      recoveryKeyInputs,
      status: "planned" as const,
      blockedReasons: [],
    };
  });
  const waves = [...new Set(nodes.map((node) => node.waveIndex))].sort((a, b) => a - b).map((index) => {
    const members = nodes.filter((node) => node.waveIndex === index);
    return { index, nodeIds: members.map((node) => node.id), claimIntentIds: members.map((node) => node.claimIntentId), candidateCount: members.length, blockedCount: 0, plannedSlotDemand: members.length, blockedReasons: [] };
  });
  return {
    ...base,
    graphMode: "ready-set-v1",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId: `${options.id}-contract`,
    schedulerDispatchDryRunId: `${options.id}-dry-run`,
    schedulerWorkerPlanId: `${options.id}-worker-plan`,
    schedulerClaimReconcilePlanId: `${options.id}-claim-plan`,
    nodes,
    edges: [
      ...parsedPlan.nodes.flatMap((node) => node.dependsOn.map((dependency) => ({ from: dependency, to: node.id, kind: "dependency" as const }))),
      ...parsedPlan.nodes.flatMap((node) => stageOrder.slice(0, -1).map((stage, index) => ({ from: `${node.id}:${stage}`, to: `${node.id}:${stageOrder[index + 1]}`, kind: "stage-order" as const }))),
    ],
    waves,
    plannedSlotDemand: nodes.length,
    maxPlannedWaveWidth: Math.max(...waves.map((wave) => wave.nodeIds.length)),
    recoveryKeyCoverage: "complete",
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compileReadySetWaveIndexes(plan: WorkflowAuthoringPlan): Map<string, number> {
  const waveByNode = new Map<string, number>();
  const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
  const waveFor = (nodeId: string): number => {
    const existing = waveByNode.get(nodeId);
    if (existing !== undefined) return existing;
    const dependencies = nodesById.get(nodeId)?.dependsOn ?? [];
    const wave = dependencies.length === 0 ? 0 : Math.max(...dependencies.map(waveFor)) + 1;
    waveByNode.set(nodeId, wave);
    return wave;
  };
  for (const node of plan.nodes) waveFor(node.id);
  return waveByNode;
}

export function isSequentialWorkflowGraphPlan(graph: WorkflowGraphPlan): graph is SequentialWorkflowGraphPlan {
  return graph.graphMode === "sequential-v1";
}

export function isReadySetWorkflowGraphPlan(graph: WorkflowGraphPlan): graph is ReadySetWorkflowGraphPlan {
  return graph.graphMode === "ready-set-v1";
}

export async function writeWorkflowGraphPlan(memory: ResolvedMemory, changePath: string, graph: WorkflowGraphPlan): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, graph, "WorkflowGraphPlan");
  await writeWorkflowGraphPlanAt(join(memory.memoryRoot, changePath), graph.changeId, graph);
}

export async function writeWorkflowGraphPlanAt(
  changeRoot: string,
  expectedChangeId: string,
  graph: WorkflowGraphPlan,
): Promise<void> {
  assertWorkflowGraphChangeId(expectedChangeId, graph, "WorkflowGraphPlan");
  const latestDir = join(changeRoot, "planning");
  const dir = join(latestDir, "workflow-graphs");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${graph.id}.json`), graph);
  await writeFile(join(dir, `${graph.id}.md`), renderWorkflowGraphPlanMarkdown(graph), "utf8");
  await writeJsonFile(join(latestDir, "workflow-graph-plan.json"), graph);
  await writeFile(join(latestDir, "workflow-graph-plan.md"), renderWorkflowGraphPlanMarkdown(graph), "utf8");
}

export async function readLatestWorkflowGraphPlanAt(
  changeRoot: string,
  expectedChangeId: string,
): Promise<WorkflowGraphPlan> {
  const graph = await readRequiredJsonFile(join(changeRoot, "planning", "workflow-graph-plan.json"), workflowGraphPlanSchema);
  assertWorkflowGraphChangeId(expectedChangeId, graph, "WorkflowGraphPlan");
  return graph;
}

export async function readLatestWorkflowGraphPlan(memory: ResolvedMemory, changePath: string): Promise<WorkflowGraphPlan> {
  const graph = await readRequiredJsonFile(latestWorkflowGraphPlanPath(memory, changePath), workflowGraphPlanSchema);
  await assertWorkflowArtifactScope(memory, changePath, graph, "WorkflowGraphPlan");
  return graph;
}

export async function readWorkflowGraphPlan(memory: ResolvedMemory, changePath: string, workflowGraphPlanId: string): Promise<WorkflowGraphPlan> {
  const graph = await readRequiredJsonFile(workflowGraphPlanPath(memory, changePath, workflowGraphPlanId), workflowGraphPlanSchema);
  await assertWorkflowArtifactScope(memory, changePath, graph, "WorkflowGraphPlan");
  return graph;
}

function assertWorkflowGraphChangeId(
  expectedChangeId: string,
  graph: WorkflowGraphPlan,
  label: string,
): void {
  if (graph.changeId !== expectedChangeId) {
    throw new Error(`${label} is not scoped to the selected Change: expected ${expectedChangeId}, got ${graph.changeId}.`);
  }
}
