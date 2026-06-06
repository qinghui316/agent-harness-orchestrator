import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { getActiveChanges } from "../ecl/index.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import {
  hashArtifactRefs,
  hashFile,
  hashText,
  readWorkflowGraphPlan,
  resolveArtifactRef,
  taskQueueProposalSchema,
  workflowGraphPlanSchema,
  type DecompositionReadinessManifest,
  type TaskQueueProposal,
} from "../workflow-artifacts/manager.js";
import { listAuditResults } from "../audit/artifacts.js";
import { listValidationResults } from "../validation/artifacts.js";
import { listRuns } from "../run/manager.js";
import type {
  ManagedProject,
  ResolvedMemory,
  StageResumeVerdict,
  TaskQueueItem,
  TaskQueueRun,
  TaskRun,
  WorkflowRecoveryKey,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowRunEventType,
  WorkflowRunStatus,
  WorkflowRunSummary,
  WorkflowGraphPlan,
} from "../types/index.js";

const workflowRunStatusSchema = z.enum(["created", "running", "paused", "blocked", "failed", "completed"]);
const readinessSchema = z.object({
  id: z.string(),
  changeId: z.string(),
  decompositionPlanId: z.string(),
  status: z.string(),
  nextAllowedAction: z.string(),
  artifact: z.string(),
  markdownArtifact: z.string(),
});

const workflowRecoveryKeySchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  decompositionPlanId: z.string(),
  readinessManifestId: z.string(),
  taskQueueProposalId: z.string(),
  workflowGraphPlanId: z.string().optional(),
  acceptedArtifactHashes: z.record(z.string()),
  proposalHash: z.string(),
  readinessHash: z.string(),
  workflowGraphPlanHash: z.string().optional(),
  sourceHash: z.string(),
  policyHash: z.string(),
  capabilityHash: z.string(),
  createdAt: z.string(),
});

const workflowRunSchema: z.ZodType<WorkflowRun> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: workflowRunStatusSchema,
  source: z.literal("taskqueue-proposal"),
  taskQueueProposalId: z.string(),
  workflowGraphPlanId: z.string().optional(),
  readinessManifestId: z.string(),
  decompositionPlanId: z.string(),
  queueRunId: z.string().optional(),
  currentTaskId: z.string().optional(),
  items: z.array(z.object({
    taskId: z.string(),
    status: z.enum(["queued", "running", "blocked", "failed", "completed", "skipped"]),
    taskRunId: z.string().optional(),
    order: z.number(),
    updatedAt: z.string().optional(),
  })),
  recoveryKey: workflowRecoveryKeySchema,
  statusReason: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export interface ValidatedTaskQueueProposal {
  proposal: TaskQueueProposal;
  readiness: DecompositionReadinessManifest;
  graph: WorkflowGraphPlan;
  changePath: string;
  recoveryKey: WorkflowRecoveryKey;
}

export async function validateTaskQueueProposalStart(memory: ResolvedMemory, project: ManagedProject, changeId: string, taskQueueProposalId: string, workflowGraphPlanId: string): Promise<ValidatedTaskQueueProposal> {
  const changePath = await activeChangePath(memory, changeId);
  const latestGraph = await readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "workflow-graph-plan.json"), workflowGraphPlanSchema);
  if (latestGraph.id !== workflowGraphPlanId) throw new Error("TaskQueue start requires the latest WorkflowGraphPlan.");
  const graph = await readWorkflowGraphPlan(memory, changePath, workflowGraphPlanId);
  if (graph.id !== latestGraph.id || graph.changeId !== changeId || graph.taskQueueProposalId !== taskQueueProposalId || graph.status !== "compiled") {
    throw new Error("TaskQueue start requires a matching compiled WorkflowGraphPlan.");
  }
  const proposalRef = requiredGraphRef(graph, ".taskqueue-proposal.json");
  const readinessRef = requiredGraphRef(graph, ".decomposition-readiness.json");
  const proposal = await readRequiredJsonFile(resolveArtifactRef(memory, proposalRef), taskQueueProposalSchema);
  if (proposal.id !== taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed") {
    throw new Error("TaskQueue start requires a confirmed TaskQueueProposal snapshot.");
  }
  const readiness = await readRequiredJsonFile(resolveArtifactRef(memory, readinessRef), readinessSchema) as DecompositionReadinessManifest;
  if (readiness.id !== proposal.readinessManifestId || readiness.changeId !== changeId || readiness.status !== "ready-for-sequential-taskqueue-proposal" || readiness.nextAllowedAction !== "taskqueue.proposal") {
    throw new Error("TaskQueue start readiness target is stale or no longer queue-ready.");
  }
  const expectedSourceHashes = await hashArtifactRefs(memory, Object.keys(graph.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(expectedSourceHashes)) {
    if (graph.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`WorkflowGraphPlan source artifact hash mismatch: ${artifact}.`);
    }
  }
  return {
    proposal,
    readiness,
    graph,
    changePath,
    recoveryKey: await buildWorkflowRecoveryKey(memory, project, changePath, proposal, readiness, graph),
  };
}

export async function createWorkflowRunForTaskQueue(memory: ResolvedMemory, project: ManagedProject, validated: ValidatedTaskQueueProposal): Promise<WorkflowRun> {
  const now = new Date().toISOString();
  const workflowRunId = `workflow-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${validated.proposal.changeId}:${validated.proposal.id}:${now}`).slice(0, 8)}`;
  const run: WorkflowRun = {
    version: "1.0",
    id: workflowRunId,
    changeId: validated.proposal.changeId,
    status: "created",
    source: "taskqueue-proposal",
    taskQueueProposalId: validated.proposal.id,
    workflowGraphPlanId: validated.graph.id,
    readinessManifestId: validated.proposal.readinessManifestId,
    decompositionPlanId: validated.proposal.decompositionPlanId,
    items: validated.proposal.items.map((item) => ({
      taskId: item.taskId,
      status: "queued",
      order: item.order,
      updatedAt: now,
    })),
    recoveryKey: validated.recoveryKey,
    artifactRefs: unique([validated.graph.artifact, validated.graph.markdownArtifact, ...validated.graph.artifactRefs]),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
  await writeWorkflowRun(memory, run);
  await appendWorkflowRunEvent(memory, run, "workflow.created", { data: { projectId: project.id, taskQueueProposalId: run.taskQueueProposalId, workflowGraphPlanId: run.workflowGraphPlanId } });
  return run;
}

export async function assertWorkflowResumeAllowed(memory: ResolvedMemory, project: ManagedProject, workflowRunId: string, queue: TaskQueueRun): Promise<WorkflowRun> {
  const run = await readWorkflowRun(memory, queue.changeId, workflowRunId);
  if (run.status !== "paused") throw new Error("TaskQueue resume requires a paused WorkflowRun.");
  if (run.queueRunId !== queue.id) throw new Error("WorkflowRun is not bound to the requested queueRunId.");
  const current = await recomputeWorkflowRecoveryKey(memory, project, run);
  if (!sameJson(run.recoveryKey, current)) {
    const blocked = await updateWorkflowRun(memory, {
      ...run,
      status: "blocked",
      statusReason: "Workflow recovery key changed; refusing to continue.",
      updatedAt: new Date().toISOString(),
      finishedAt: null,
    });
    await appendWorkflowRunEvent(memory, blocked, "workflow.blocked", { queueRunId: queue.id, reason: blocked.statusReason });
    throw new Error(blocked.statusReason);
  }
  return run;
}

export async function bindWorkflowRunToQueue(memory: ResolvedMemory, run: WorkflowRun, queue: TaskQueueRun, items: TaskQueueItem[]): Promise<WorkflowRun> {
  const now = new Date().toISOString();
  const next = await updateWorkflowRun(memory, {
    ...run,
    status: "running",
    queueRunId: queue.id,
    currentTaskId: queue.currentTaskId,
    items: workflowItemsFromQueueItems(items),
    updatedAt: now,
    startedAt: run.startedAt ?? now,
  });
  await appendWorkflowRunEvent(memory, next, "workflow.started", { queueRunId: queue.id });
  await appendWorkflowRunEvent(memory, next, "queue.created", { queueRunId: queue.id, data: { totalCount: queue.totalCount } });
  return next;
}

export async function syncWorkflowRunFromQueue(memory: ResolvedMemory, run: WorkflowRun, queue: TaskQueueRun, items: TaskQueueItem[], eventType: WorkflowRunEventType = "workflow.reconciled", reason?: string): Promise<WorkflowRun> {
  const status = workflowStatusFromQueue(queue.status);
  const now = new Date().toISOString();
  const next = await updateWorkflowRun(memory, {
    ...run,
    status,
    queueRunId: queue.id,
    currentTaskId: queue.currentTaskId,
    items: workflowItemsFromQueueItems(items),
    statusReason: reason ?? queue.blockedReason ?? queue.failureReason ?? queue.pausedReason,
    updatedAt: now,
    startedAt: run.startedAt ?? queue.startedAt ?? now,
    finishedAt: ["blocked", "failed", "completed"].includes(status) ? now : null,
  });
  await appendWorkflowRunEvent(memory, next, eventType, { queueRunId: queue.id, status: next.status, reason: next.statusReason });
  return next;
}

export async function appendWorkflowTaskEvent(memory: ResolvedMemory, workflowRunId: string | undefined, changeId: string, type: WorkflowRunEventType, input: { queueRunId?: string; taskId?: string; taskRunId?: string; status?: string; reason?: string; data?: Record<string, unknown> }): Promise<void> {
  if (!workflowRunId) return;
  const run = await readWorkflowRun(memory, changeId, workflowRunId).catch(() => null);
  if (!run) return;
  await appendWorkflowRunEvent(memory, run, type, input);
}

export async function readWorkflowRun(memory: ResolvedMemory, changeId: string, workflowRunId: string): Promise<WorkflowRun> {
  return readRequiredJsonFile(workflowRunPath(memory, changeId, workflowRunId), workflowRunSchema);
}

export async function listWorkflowRuns(memory: ResolvedMemory, changeId: string): Promise<WorkflowRun[]> {
  const dir = workflowRunDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const runs = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), workflowRunSchema)));
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLatestWorkflowRun(memory: ResolvedMemory, changeId: string): Promise<WorkflowRun | null> {
  return (await listWorkflowRuns(memory, changeId))[0] ?? null;
}

export async function readWorkflowRunEvents(memory: ResolvedMemory, changeId: string, workflowRunId: string): Promise<WorkflowRunEvent[]> {
  const path = workflowEventPath(memory, changeId, workflowRunId);
  if (!existsSync(path)) return [];
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => JSON.parse(line) as WorkflowRunEvent);
}

export function summarizeWorkflowRun(run: WorkflowRun): WorkflowRunSummary {
  return {
    id: run.id,
    status: run.status,
    currentTaskId: run.currentTaskId,
    completedCount: run.items.filter((item) => item.status === "completed" || item.status === "skipped").length,
    totalCount: run.items.filter((item) => item.status !== "skipped").length,
    queueRunId: run.queueRunId,
    workflowGraphPlanId: run.workflowGraphPlanId,
    updatedAt: run.updatedAt,
  };
}

export async function deriveStageResumeVerdict(memory: ResolvedMemory, changeId: string, taskRun: TaskRun): Promise<StageResumeVerdict> {
  const runs = await listRuns(memory);
  const coderRun = runs.find((run) => run.taskRunId === taskRun.id);
  if (!coderRun) {
    return { kind: "start-coder", taskRunId: taskRun.id, taskId: taskRun.taskId, reason: "No coder run evidence exists for this TaskRun.", evidenceRefs: [] };
  }
  if (coderRun.status !== "completed" || !coderRun.worktree?.worktreeId) {
    return { kind: "blocked", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, reason: "Coder evidence is missing, failed, or has no worktree.", evidenceRefs: [coderRun.artifacts.directory] };
  }
  const validations = await listValidationResults(memory, changeId);
  const validation = validations.find((item) => item.worktreeId === coderRun.worktree?.worktreeId);
  if (!validation) {
    return { kind: "continue-validation", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, reason: "Coder completed; validation evidence is missing.", evidenceRefs: [coderRun.artifacts.directory] };
  }
  if (validation.status !== "passed") {
    return { kind: "continue-rework", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, reason: "Validation failed; bounded rework is the next safe stage.", evidenceRefs: [coderRun.artifacts.directory, validation.id] };
  }
  const audits = await listAuditResults(memory, changeId);
  const audit = audits.find((item) => item.worktreeId === coderRun.worktree?.worktreeId);
  if (!audit) {
    return { kind: "continue-audit", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, reason: "Validation passed; audit evidence is missing.", evidenceRefs: [coderRun.artifacts.directory, validation.id] };
  }
  if (audit.status === "approved" || audit.status === "approved-with-notes") {
    return { kind: "completed", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, auditId: audit.id, reason: "Coder, validation, and audit evidence are complete.", evidenceRefs: [coderRun.artifacts.directory, validation.id, audit.id] };
  }
  return { kind: "continue-rework", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, auditId: audit.id, reason: `Audit ${audit.status}; bounded rework is the next safe stage.`, evidenceRefs: [coderRun.artifacts.directory, validation.id, audit.id] };
}

async function buildWorkflowRecoveryKey(memory: ResolvedMemory, project: ManagedProject, changePath: string, proposal: TaskQueueProposal, _readiness: DecompositionReadinessManifest, graph: WorkflowGraphPlan): Promise<WorkflowRecoveryKey> {
  const acceptedArtifactHashes: Record<string, string> = {};
  for (const name of ["spec.md", "plan.md", "tasks.md", "ac-map.json"]) {
    acceptedArtifactHashes[name] = await hashFile(join(memory.memoryRoot, changePath, name));
  }
  const proposalRef = requiredGraphRef(graph, ".taskqueue-proposal.json");
  const readinessRef = requiredGraphRef(graph, ".decomposition-readiness.json");
  return {
    version: "1.0",
    changeId: proposal.changeId,
    decompositionPlanId: proposal.decompositionPlanId,
    readinessManifestId: proposal.readinessManifestId,
    taskQueueProposalId: proposal.id,
    workflowGraphPlanId: graph.id,
    acceptedArtifactHashes,
    proposalHash: await hashFile(resolveArtifactRef(memory, proposalRef)),
    readinessHash: await hashFile(resolveArtifactRef(memory, readinessRef)),
    workflowGraphPlanHash: await hashFile(resolveArtifactRef(memory, graph.artifact)),
    sourceHash: await sourceHash(project.path),
    policyHash: hashText("tool-policy-gate@phase-7l:sequential-workflowgraph"),
    capabilityHash: hashText("local-runtime:taskqueue-sequential:codex-worktree"),
    createdAt: new Date().toISOString(),
  };
}

async function recomputeWorkflowRecoveryKey(memory: ResolvedMemory, project: ManagedProject, run: WorkflowRun): Promise<WorkflowRecoveryKey> {
  const changePath = await activeChangePath(memory, run.changeId);
  if (!run.workflowGraphPlanId) throw new Error("WorkflowRun resume requires workflowGraphPlanId.");
  const graph = await readWorkflowGraphPlan(memory, changePath, run.workflowGraphPlanId);
  const proposal = await readRequiredJsonFile(resolveArtifactRef(memory, requiredGraphRef(graph, ".taskqueue-proposal.json")), taskQueueProposalSchema);
  const readiness = await readRequiredJsonFile(resolveArtifactRef(memory, requiredGraphRef(graph, ".decomposition-readiness.json")), readinessSchema) as DecompositionReadinessManifest;
  const next = await buildWorkflowRecoveryKey(memory, project, changePath, proposal, readiness, graph);
  return { ...next, createdAt: run.recoveryKey.createdAt };
}

async function activeChangePath(memory: ResolvedMemory, changeId: string): Promise<string> {
  const active = await getActiveChanges(memory);
  const target = active.find((item) => item.name === changeId);
  if (!target) throw new Error(`Active Change not found for WorkflowRun target: ${changeId}.`);
  return target.path;
}

async function writeWorkflowRun(memory: ResolvedMemory, run: WorkflowRun): Promise<WorkflowRun> {
  await writeJsonFile(workflowRunPath(memory, run.changeId, run.id), run);
  return run;
}

async function updateWorkflowRun(memory: ResolvedMemory, run: WorkflowRun): Promise<WorkflowRun> {
  return writeWorkflowRun(memory, run);
}

async function appendWorkflowRunEvent(memory: ResolvedMemory, run: WorkflowRun, type: WorkflowRunEventType, input: { queueRunId?: string; taskId?: string; taskRunId?: string; status?: string; reason?: string; data?: Record<string, unknown> } = {}): Promise<void> {
  const now = new Date().toISOString();
  const event: WorkflowRunEvent = {
    version: "1.0",
    id: `workflow-event-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${type}:${now}:${Math.random()}`).slice(0, 8)}`,
    workflowRunId: run.id,
    changeId: run.changeId,
    type,
    timestamp: now,
    ...input,
  };
  const path = workflowEventPath(memory, run.changeId, run.id);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}

function workflowItemsFromQueueItems(items: TaskQueueItem[]): WorkflowRun["items"] {
  return items.map((item) => ({
    taskId: item.taskId,
    status: item.status,
    taskRunId: item.taskRunId,
    order: item.order,
    updatedAt: item.updatedAt,
  }));
}

function workflowStatusFromQueue(status: TaskQueueRun["status"]): WorkflowRunStatus {
  if (status === "queued" || status === "running") return "running";
  return status;
}

function workflowRunDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "workflows", changeId);
}

function workflowRunPath(memory: ResolvedMemory, changeId: string, workflowRunId: string): string {
  return join(workflowRunDir(memory, changeId), `${workflowRunId}.json`);
}

function workflowEventPath(memory: ResolvedMemory, changeId: string, workflowRunId: string): string {
  return join(memory.runsRoot, "workflow-events", changeId, `${workflowRunId}.jsonl`);
}

async function sourceHash(projectPath: string): Promise<string> {
  const [head, status] = await Promise.all([
    getGitCommit(projectPath).catch(() => null),
    getGitStatusShort(projectPath).catch(() => null),
  ]);
  if (!head && !status) return `nogit:${hashText(projectPath)}`;
  return hashText(JSON.stringify({ head, status: status?.slice().sort() ?? [] }));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requiredGraphRef(graph: WorkflowGraphPlan, suffix: string): string {
  const ref = graph.artifactRefs.find((item) => item.endsWith(suffix));
  if (!ref) throw new Error(`WorkflowGraphPlan ${graph.id} is missing ${suffix} source ref.`);
  return ref;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
