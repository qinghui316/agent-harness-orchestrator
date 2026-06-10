import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory, WorkflowGraphPlan, WorkflowGraphStage } from "../types/index.js";
import { displayArtifactPath } from "./artifact-refs.js";
import { assertWorkflowArtifactScope } from "./guards.js";
import { hashArtifactRefs } from "./hashes.js";
import { latestWorkflowGraphPlanPath, planningDir, workflowGraphPlanPath, workflowGraphsDir } from "./paths.js";
import { renderWorkflowGraphPlanMarkdown } from "./rendering.js";
import { workflowGraphPlanSchema } from "./schemas.js";
import type { DecompositionReadinessManifest, TaskQueueProposal } from "./types.js";
import { unique } from "./utils.js";

export async function compileWorkflowGraphPlan(memory: ResolvedMemory, changePath: string, proposal: TaskQueueProposal, readiness: DecompositionReadinessManifest): Promise<WorkflowGraphPlan> {
  await assertWorkflowArtifactScope(memory, changePath, proposal, "WorkflowGraphPlan proposal");
  await assertWorkflowArtifactScope(memory, changePath, readiness, "WorkflowGraphPlan readiness");
  if (proposal.changeId !== readiness.changeId || proposal.readinessManifestId !== readiness.id) {
    throw new Error("WorkflowGraphPlan compile requires matching proposal and readiness.");
  }
  if (proposal.status !== "confirmed") throw new Error("WorkflowGraphPlan compile requires a confirmed TaskQueueProposal.");
  if (readiness.status !== "ready-for-sequential-taskqueue-proposal" || readiness.nextAllowedAction !== "taskqueue.proposal") {
    throw new Error("WorkflowGraphPlan compile requires sequential taskqueue readiness.");
  }
  const now = new Date().toISOString();
  const id = `workflow-graph-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${proposal.changeId}:${proposal.id}:${readiness.id}:${now}`).slice(0, 8)}`;
  const dir = workflowGraphsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  const proposalSnapshotRef = displayArtifactPath(memory, join(dir, `${id}.taskqueue-proposal.json`));
  const readinessSnapshotRef = displayArtifactPath(memory, join(dir, `${id}.decomposition-readiness.json`));
  await writeJsonFile(join(dir, `${id}.taskqueue-proposal.json`), proposal);
  await writeJsonFile(join(dir, `${id}.decomposition-readiness.json`), readiness);
  const stageOrder: WorkflowGraphStage[] = ["coder", "validation", "audit", "bounded-rework"];
  const nodes = proposal.items.slice().sort((a, b) => a.order - b.order).map((item) => ({
    id: `${id}-node-${String(item.order).padStart(3, "0")}`,
    taskId: item.taskId,
    taskQueueProposalItemId: item.id,
    unitId: item.unitId,
    title: item.title,
    order: item.order,
    stages: stageOrder,
    acIds: item.acIds,
    sourceScopes: item.sourceScopes,
  }));
  const edges = nodes.flatMap((node, index) => {
    const stageEdges = stageOrder.slice(0, -1).map((stage, stageIndex) => ({
      from: `${node.id}:${stage}`,
      to: `${node.id}:${stageOrder[stageIndex + 1]}`,
      kind: "stage-order" as const,
    }));
    const next = nodes[index + 1];
    return next ? [...stageEdges, { from: node.id, to: next.id, kind: "task-order" as const }] : stageEdges;
  });
  const artifact = displayArtifactPath(memory, join(dir, `${id}.json`));
  const markdownArtifact = displayArtifactPath(memory, join(dir, `${id}.md`));
  const artifactRefs = unique([...proposal.artifactRefs, proposalSnapshotRef, readinessSnapshotRef, artifact, markdownArtifact]);
  const graph: WorkflowGraphPlan = {
    version: "1.0",
    id,
    changeId: proposal.changeId,
    status: "compiled",
    graphMode: "sequential-v1",
    decompositionPlanId: proposal.decompositionPlanId,
    readinessManifestId: proposal.readinessManifestId,
    taskQueueProposalId: proposal.id,
    nodes,
    edges,
    sourceArtifactHashes: await hashArtifactRefs(memory, unique([...proposal.artifactRefs, proposalSnapshotRef, readinessSnapshotRef])),
    artifactRefs,
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeWorkflowGraphPlan(memory, changePath, graph);
  return graph;
}

export async function writeWorkflowGraphPlan(memory: ResolvedMemory, changePath: string, graph: WorkflowGraphPlan): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, graph, "WorkflowGraphPlan");
  const dir = workflowGraphsDir(memory, changePath);
  const latestDir = planningDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${graph.id}.json`), graph);
  await writeFile(join(dir, `${graph.id}.md`), renderWorkflowGraphPlanMarkdown(graph), "utf8");
  await writeJsonFile(join(latestDir, "workflow-graph-plan.json"), graph);
  await writeFile(join(latestDir, "workflow-graph-plan.md"), renderWorkflowGraphPlanMarkdown(graph), "utf8");
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
