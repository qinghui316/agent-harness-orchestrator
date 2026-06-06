import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, relative, resolve } from "node:path";
import { z } from "zod";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory, WorkflowGraphPlan, WorkflowGraphStage } from "../types/index.js";
export type { WorkflowGraphPlan, WorkflowGraphStage } from "../types/index.js";

export type DecompositionRecommendation =
  | "single-change"
  | "taskgraph-sequential"
  | "taskgraph-parallel-candidate"
  | "multi-change-candidate"
  | "needs-clarification";

export interface WorkflowRecoveryKeyInputs {
  changeId: string;
  planningBundleId?: string;
  acceptedArtifactRefs: string[];
  contextScope: "selected-demand";
  sourceRevision?: string;
  worktreeBase?: string;
  rolePolicyProfile: string;
  notes: string[];
}

export interface DecompositionUnit {
  id: string;
  title: string;
  summary: string;
  taskIds: string[];
  acIds: string[];
  scopeHints: string[];
  dependsOn: string[];
  recommendedRoleId: string;
}

export interface DecompositionPlan {
  id: string;
  changeId: string;
  status: "draft" | "confirmed" | "superseded" | "rejected";
  recommendation: DecompositionRecommendation;
  rationale: string;
  units: DecompositionUnit[];
  dependencies: Array<{ from: string; to: string; kind: "blocks" | "synthesizes" | "conflicts" }>;
  conflictScopes: string[];
  riskSummary: string;
  openQuestions: string[];
  artifactRefs: string[];
  recoveryKeyInputs: WorkflowRecoveryKeyInputs;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export type DecompositionReadinessStatus =
  | "ready-for-single-change"
  | "ready-for-sequential-taskqueue-proposal"
  | "blocked-parallel-guardrails"
  | "blocked-multi-change-boundary"
  | "blocked-needs-clarification"
  | "invalid";

export type DecompositionReadinessGuardrailStatus = "passed" | "blocked" | "failed";

export interface DecompositionReadinessGuardrail {
  id: string;
  status: DecompositionReadinessGuardrailStatus;
  summary: string;
  refs: string[];
}

export interface DecompositionReadinessUnit {
  id: string;
  title: string;
  taskIds: string[];
  acIds: string[];
  dependsOn: string[];
  guardrailStatus: DecompositionReadinessGuardrailStatus;
  sourceScopes: string[];
}

export interface DecompositionReadinessManifest {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  status: DecompositionReadinessStatus;
  recommendation: DecompositionRecommendation;
  executable: false;
  schedulerEligible: boolean;
  nextAllowedAction: "code.run" | "taskqueue.proposal" | "clarification.answer" | "none";
  units: DecompositionReadinessUnit[];
  dependencies: DecompositionPlan["dependencies"];
  conflictScopes: string[];
  guardrails: DecompositionReadinessGuardrail[];
  recoveryKeyMaterial: WorkflowRecoveryKeyInputs & {
    decompositionPlanId: string;
    taskIds: string[];
    acIds: string[];
  };
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskQueueProposalStatus = "draft" | "confirmed" | "started" | "superseded" | "rejected";

export interface TaskQueueProposalItem {
  id: string;
  taskId: string;
  unitId: string;
  title: string;
  order: number;
  dependsOn: string[];
  sourceScopes: string[];
  acIds: string[];
}

export interface TaskQueueProposal {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  readinessManifestId: string;
  status: TaskQueueProposalStatus;
  recommendation: "taskgraph-sequential";
  queueMode: "sequential";
  items: TaskQueueProposalItem[];
  dependencies: DecompositionPlan["dependencies"];
  conflictScopes: string[];
  sourceArtifactHashes: Record<string, string>;
  recoveryKeyMaterial: DecompositionReadinessManifest["recoveryKeyMaterial"];
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

const recoveryKeyInputsSchema = z.object({
  changeId: z.string(),
  planningBundleId: z.string().optional(),
  acceptedArtifactRefs: z.array(z.string()),
  contextScope: z.literal("selected-demand"),
  sourceRevision: z.string().optional(),
  worktreeBase: z.string().optional(),
  rolePolicyProfile: z.string(),
  notes: z.array(z.string()),
});

export const decompositionPlanSchema: z.ZodType<DecompositionPlan> = z.object({
  id: z.string(),
  changeId: z.string(),
  status: z.enum(["draft", "confirmed", "superseded", "rejected"]),
  recommendation: z.enum(["single-change", "taskgraph-sequential", "taskgraph-parallel-candidate", "multi-change-candidate", "needs-clarification"]),
  rationale: z.string(),
  units: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    taskIds: z.array(z.string()),
    acIds: z.array(z.string()),
    scopeHints: z.array(z.string()),
    dependsOn: z.array(z.string()),
    recommendedRoleId: z.string(),
  })),
  dependencies: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.enum(["blocks", "synthesizes", "conflicts"]),
  })),
  conflictScopes: z.array(z.string()),
  riskSummary: z.string(),
  openQuestions: z.array(z.string()),
  artifactRefs: z.array(z.string()),
  recoveryKeyInputs: recoveryKeyInputsSchema,
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const decompositionReadinessManifestSchema = z.object({
  id: z.string(),
  changeId: z.string(),
  decompositionPlanId: z.string(),
  status: z.enum(["ready-for-single-change", "ready-for-sequential-taskqueue-proposal", "blocked-parallel-guardrails", "blocked-multi-change-boundary", "blocked-needs-clarification", "invalid"]),
  recommendation: z.enum(["single-change", "taskgraph-sequential", "taskgraph-parallel-candidate", "multi-change-candidate", "needs-clarification"]),
  executable: z.literal(false),
  schedulerEligible: z.boolean(),
  nextAllowedAction: z.enum(["code.run", "taskqueue.proposal", "clarification.answer", "none"]),
  units: z.array(z.object({
    id: z.string(),
    title: z.string(),
    taskIds: z.array(z.string()),
    acIds: z.array(z.string()),
    dependsOn: z.array(z.string()),
    guardrailStatus: z.enum(["passed", "blocked", "failed"]),
    sourceScopes: z.array(z.string()),
  })),
  dependencies: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.enum(["blocks", "synthesizes", "conflicts"]),
  })),
  conflictScopes: z.array(z.string()),
  guardrails: z.array(z.object({
    id: z.string(),
    status: z.enum(["passed", "blocked", "failed"]),
    summary: z.string(),
    refs: z.array(z.string()),
  })),
  recoveryKeyMaterial: recoveryKeyInputsSchema.extend({
    decompositionPlanId: z.string(),
    taskIds: z.array(z.string()),
    acIds: z.array(z.string()),
  }),
  artifactRefs: z.array(z.string()),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as z.ZodType<DecompositionReadinessManifest>;

export const taskQueueProposalSchema = z.object({
  id: z.string(),
  changeId: z.string(),
  decompositionPlanId: z.string(),
  readinessManifestId: z.string(),
  status: z.enum(["draft", "confirmed", "started", "superseded", "rejected"]),
  recommendation: z.literal("taskgraph-sequential"),
  queueMode: z.literal("sequential"),
  items: z.array(z.object({
    id: z.string(),
    taskId: z.string(),
    unitId: z.string(),
    title: z.string(),
    order: z.number(),
    dependsOn: z.array(z.string()),
    sourceScopes: z.array(z.string()),
    acIds: z.array(z.string()),
  })),
  dependencies: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.enum(["blocks", "synthesizes", "conflicts"]),
  })),
  conflictScopes: z.array(z.string()),
  sourceArtifactHashes: z.record(z.string()),
  recoveryKeyMaterial: recoveryKeyInputsSchema.extend({
    decompositionPlanId: z.string(),
    taskIds: z.array(z.string()),
    acIds: z.array(z.string()),
  }),
  artifactRefs: z.array(z.string()),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as z.ZodType<TaskQueueProposal>;

export const workflowGraphPlanSchema: z.ZodType<WorkflowGraphPlan> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: z.enum(["compiled", "superseded", "rejected"]),
  graphMode: z.literal("sequential-v1"),
  decompositionPlanId: z.string(),
  readinessManifestId: z.string(),
  taskQueueProposalId: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    taskId: z.string(),
    taskQueueProposalItemId: z.string(),
    unitId: z.string(),
    title: z.string(),
    order: z.number(),
    stages: z.array(z.enum(["coder", "validation", "audit", "bounded-rework"])),
    acIds: z.array(z.string()),
    sourceScopes: z.array(z.string()),
  })),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.enum(["task-order", "stage-order"]),
  })),
  sourceArtifactHashes: z.record(z.string()),
  artifactRefs: z.array(z.string()),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export async function readLatestDecompositionPlan(memory: ResolvedMemory, changePath: string): Promise<DecompositionPlan> {
  return readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "decomposition-plan.json"), decompositionPlanSchema);
}

export async function writeDecompositionPlan(memory: ResolvedMemory, changePath: string, plan: DecompositionPlan): Promise<void> {
  const dir = join(memory.memoryRoot, changePath, "planning");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "decomposition-plan.json"), plan);
  await writeFile(join(dir, "decomposition-plan.md"), renderDecompositionPlanMarkdown(plan), "utf8");
}

export async function readLatestDecompositionReadinessManifest(memory: ResolvedMemory, changePath: string): Promise<DecompositionReadinessManifest> {
  return readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "decomposition-readiness.json"), decompositionReadinessManifestSchema);
}

export async function writeDecompositionReadinessManifest(memory: ResolvedMemory, changePath: string, manifest: DecompositionReadinessManifest): Promise<void> {
  const dir = join(memory.memoryRoot, changePath, "planning");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "decomposition-readiness.json"), manifest);
  await writeFile(join(dir, "decomposition-readiness.md"), renderDecompositionReadinessMarkdown(manifest), "utf8");
}

export async function readLatestTaskQueueProposal(memory: ResolvedMemory, changePath: string): Promise<TaskQueueProposal> {
  return readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "taskqueue-proposal.json"), taskQueueProposalSchema);
}

export async function writeTaskQueueProposal(memory: ResolvedMemory, changePath: string, proposal: TaskQueueProposal): Promise<void> {
  const dir = join(memory.memoryRoot, changePath, "planning");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "taskqueue-proposal.json"), proposal);
  await writeFile(join(dir, "taskqueue-proposal.md"), renderTaskQueueProposalMarkdown(proposal), "utf8");
}

export async function supersedeExistingTaskQueueProposal(memory: ResolvedMemory, changePath: string): Promise<void> {
  const current = await readLatestTaskQueueProposal(memory, changePath).catch(() => null);
  if (!current || !["draft", "confirmed"].includes(current.status)) return;
  await writeTaskQueueProposal(memory, changePath, { ...current, status: "superseded", updatedAt: new Date().toISOString() });
}

export async function buildTaskQueueProposalFromReadiness(memory: ResolvedMemory, changePath: string, changeId: string, manifest: DecompositionReadinessManifest): Promise<TaskQueueProposal> {
  if (manifest.changeId !== changeId) throw new Error("TaskQueueProposal readiness is not scoped to the selected Change.");
  if (manifest.status !== "ready-for-sequential-taskqueue-proposal" || manifest.nextAllowedAction !== "taskqueue.proposal") {
    throw new Error(`TaskQueueProposal requires sequential taskqueue readiness; current readiness is ${manifest.status}.`);
  }
  const now = new Date().toISOString();
  const dir = join(memory.memoryRoot, changePath, "planning");
  const id = `taskqueue-proposal-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${changeId}:${manifest.id}:${now}`).slice(0, 8)}`;
  const seenTaskIds = new Set<string>();
  const items: TaskQueueProposalItem[] = [];
  for (const unit of manifest.units) {
    for (const taskId of unit.taskIds) {
      if (seenTaskIds.has(taskId)) continue;
      seenTaskIds.add(taskId);
      const order = items.length + 1;
      items.push({
        id: `${id}-item-${String(order).padStart(3, "0")}`,
        taskId,
        unitId: unit.id,
        title: unit.title,
        order,
        dependsOn: unit.dependsOn,
        sourceScopes: unit.sourceScopes,
        acIds: unit.acIds,
      });
    }
  }
  if (items.length === 0) throw new Error("TaskQueueProposal requires at least one task item.");
  return {
    id,
    changeId,
    decompositionPlanId: manifest.decompositionPlanId,
    readinessManifestId: manifest.id,
    status: "draft",
    recommendation: "taskgraph-sequential",
    queueMode: "sequential",
    items,
    dependencies: manifest.dependencies,
    conflictScopes: manifest.conflictScopes,
    sourceArtifactHashes: await hashArtifactRefs(memory, unique([...manifest.artifactRefs, manifest.artifact, manifest.markdownArtifact])),
    recoveryKeyMaterial: manifest.recoveryKeyMaterial,
    artifactRefs: unique([...manifest.artifactRefs, manifest.artifact, manifest.markdownArtifact]),
    artifact: displayArtifactPath(memory, join(dir, "taskqueue-proposal.json")),
    markdownArtifact: displayArtifactPath(memory, join(dir, "taskqueue-proposal.md")),
    createdAt: now,
    updatedAt: now,
  };
}

export async function compileWorkflowGraphPlan(memory: ResolvedMemory, changePath: string, proposal: TaskQueueProposal, readiness: DecompositionReadinessManifest): Promise<WorkflowGraphPlan> {
  if (proposal.changeId !== readiness.changeId || proposal.readinessManifestId !== readiness.id) {
    throw new Error("WorkflowGraphPlan compile requires matching proposal and readiness.");
  }
  if (proposal.status !== "confirmed") throw new Error("WorkflowGraphPlan compile requires a confirmed TaskQueueProposal.");
  if (readiness.status !== "ready-for-sequential-taskqueue-proposal" || readiness.nextAllowedAction !== "taskqueue.proposal") {
    throw new Error("WorkflowGraphPlan compile requires sequential taskqueue readiness.");
  }
  const now = new Date().toISOString();
  const id = `workflow-graph-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${proposal.changeId}:${proposal.id}:${readiness.id}:${now}`).slice(0, 8)}`;
  const dir = join(memory.memoryRoot, changePath, "planning", "workflow-graphs");
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
  const dir = join(memory.memoryRoot, changePath, "planning", "workflow-graphs");
  const latestDir = join(memory.memoryRoot, changePath, "planning");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${graph.id}.json`), graph);
  await writeFile(join(dir, `${graph.id}.md`), renderWorkflowGraphPlanMarkdown(graph), "utf8");
  await writeJsonFile(join(latestDir, "workflow-graph-plan.json"), graph);
  await writeFile(join(latestDir, "workflow-graph-plan.md"), renderWorkflowGraphPlanMarkdown(graph), "utf8");
}

export async function readLatestWorkflowGraphPlan(memory: ResolvedMemory, changePath: string): Promise<WorkflowGraphPlan> {
  return readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "workflow-graph-plan.json"), workflowGraphPlanSchema);
}

export async function readWorkflowGraphPlan(memory: ResolvedMemory, changePath: string, workflowGraphPlanId: string): Promise<WorkflowGraphPlan> {
  return readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "workflow-graphs", `${workflowGraphPlanId}.json`), workflowGraphPlanSchema);
}

export async function hashArtifactRefs(memory: ResolvedMemory, refs: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const ref of refs) {
    result[ref] = await hashFile(resolveArtifactRef(memory, ref));
  }
  return result;
}

export async function hashFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  if (basename(path) === "ac-map.json") {
    try {
      const parsed = JSON.parse(bytes.toString("utf8")) as { generatedAt?: string };
      delete parsed.generatedAt;
      return hashText(JSON.stringify(parsed));
    } catch {
      return createHash("sha256").update(bytes).digest("hex");
    }
  }
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

export function resolveArtifactRef(memory: ResolvedMemory, ref: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(ref) || ref.startsWith("/")) return ref;
  const memoryPath = join(memory.memoryRoot, ref);
  if (existsSync(memoryPath)) return memoryPath;
  const projectPath = join(memory.projectRoot, ref);
  if (existsSync(projectPath)) return projectPath;
  return resolve(memory.memoryRoot, ref);
}

function renderDecompositionPlanMarkdown(plan: DecompositionPlan): string {
  return [
    `# DecompositionPlan ${plan.id}`,
    "",
    `Status: ${plan.status}`,
    `Recommendation: ${plan.recommendation}`,
    "",
    "## Rationale",
    "",
    plan.rationale,
    "",
    "## Units",
    "",
    ...plan.units.map((unit) => `- ${unit.id}: ${unit.title} (${unit.taskIds.join(", ") || "no task ids"})`),
    "",
    "## Boundary",
    "",
    "- Proposal only; not executable workflow truth.",
    "- Confirmation does not create child Changes, TaskRuns, AgentTasks, or code runs.",
    "",
  ].join("\n");
}

function renderDecompositionReadinessMarkdown(manifest: DecompositionReadinessManifest): string {
  return [
    `# DecompositionReadinessManifest ${manifest.id}`,
    "",
    `Status: ${manifest.status}`,
    `Recommendation: ${manifest.recommendation}`,
    `Next allowed action: ${manifest.nextAllowedAction}`,
    "",
    "## Boundary",
    "",
    "- Readiness only; not executable workflow truth.",
    "- This artifact does not create child Changes, TaskQueues, TaskRuns, AgentTasks, worktrees, or runs.",
    "",
  ].join("\n");
}

export function renderTaskQueueProposalMarkdown(proposal: TaskQueueProposal): string {
  return [
    `# TaskQueueProposal ${proposal.id}`,
    "",
    `- Change: ${proposal.changeId}`,
    `- Status: ${proposal.status}`,
    `- DecompositionPlan: ${proposal.decompositionPlanId}`,
    `- ReadinessManifest: ${proposal.readinessManifestId}`,
    `- Queue mode: ${proposal.queueMode}`,
    "",
    "## Items",
    ...proposal.items.map((item) => `- ${item.order}. ${item.taskId} (${item.unitId}) - ${item.title}`),
    "",
    "## Boundaries",
    "- This proposal does not create TaskQueue, TaskRun, AgentTask, worktree, child Change, or run records.",
    "- Queue execution requires a separate user-confirmed planning.workflowgraph.compile and planning.taskqueue.confirm-start action.",
    "- The proposal is not workflow truth; Harness artifacts, run evidence, validation, audit, and human gates remain authoritative.",
    "",
  ].join("\n");
}

export function renderWorkflowGraphPlanMarkdown(graph: WorkflowGraphPlan): string {
  return [
    `# WorkflowGraphPlan ${graph.id}`,
    "",
    `- Change: ${graph.changeId}`,
    `- Status: ${graph.status}`,
    `- Mode: ${graph.graphMode}`,
    `- TaskQueueProposal: ${graph.taskQueueProposalId}`,
    `- ReadinessManifest: ${graph.readinessManifestId}`,
    "",
    "## Nodes",
    ...graph.nodes.map((node) => `- ${node.order}. ${node.taskId}: ${node.stages.join(" -> ")}`),
    "",
    "## Edges",
    ...(graph.edges.length ? graph.edges.map((edge) => `- ${edge.from} -> ${edge.to} (${edge.kind})`) : ["- None."]),
    "",
    "## Boundary",
    "",
    "- This is a typed execution input, not workflow truth.",
    "- Compiling this graph does not create a WorkflowRun, TaskQueueRun, TaskRun, AgentTask, worktree, or child Change.",
    "- Start/resume must bind to this versioned graph and its source artifact hashes.",
    "",
  ].join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
