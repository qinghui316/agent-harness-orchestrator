import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { agentTaskRoot } from "../agent-task/paths.js";
import { shortHash } from "../fs/path.js";
import type { ManagedProject, ResolvedMemory, TaskQueueRun, WorkflowRun } from "../types/index.js";
import {
  hashArtifactRefs,
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
} from "../workflow-artifacts/manager.js";
import type { DecompositionPlan, DecompositionReadinessManifest, TaskQueueProposal, WorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { getLatestWorkflowRun } from "../workflow-run/manager.js";
import { activeChangePath, recomputeWorkflowRecoveryKey, sameJson } from "../workflow-run/recovery-key.js";

export type MainAgentWorkflowGraphDecisionAuthority = "non-executing-main-agent-workflowgraph-decision-evidence";
export type MainAgentWorkflowGraphDecisionKind =
  | "needs-decomposition"
  | "needs-readiness"
  | "needs-taskqueue-proposal"
  | "needs-workflowgraph-compile"
  | "awaiting-queue-start-gate"
  | "queue-running"
  | "queue-paused"
  | "queue-blocked"
  | "queue-completed"
  | "stale"
  | "wait";

export interface MainAgentWorkflowGraphArtifactSummary {
  decompositionPlanId: string | null;
  decompositionPlanStatus: string | null;
  readinessManifestId: string | null;
  readinessStatus: string | null;
  readinessNextAllowedAction: DecompositionReadinessManifest["nextAllowedAction"] | null;
  readinessSchedulerEligible: boolean | null;
  taskQueueProposalId: string | null;
  taskQueueProposalStatus: string | null;
  workflowGraphPlanId: string | null;
  workflowGraphPlanStatus: string | null;
}

export interface MainAgentWorkflowGraphQueueSummary {
  queueRunId: string | null;
  workflowRunId: string | null;
  scopeStatus: "matched" | "unbound" | "mismatch" | "unavailable";
  queueStatus: string | null;
  workflowStatus: string | null;
  totalCount: number | null;
  completedCount: number | null;
  blockedCount: number | null;
  failedCount: number | null;
}

export interface MainAgentWorkflowGraphFreshnessSummary {
  status: "fresh" | "stale" | "unavailable";
  reasons: string[];
}

export interface MainAgentWorkflowGraphObservation {
  version: "1.0";
  changeId: string;
  projectId: string | null;
  observedAt: string;
  stage: MainAgentWorkflowGraphArtifactSummary;
  queue: MainAgentWorkflowGraphQueueSummary;
  freshness: MainAgentWorkflowGraphFreshnessSummary;
  recovery: MainAgentWorkflowGraphFreshnessSummary;
  artifactRefs: string[];
  refs: MainAgentWorkflowGraphDecisionRefs;
}

export interface MainAgentWorkflowGraphDecisionRefs {
  mainAgentLoopRunIds: string[];
  workflowRunIds: string[];
  taskQueueRunIds: string[];
}

export interface MainAgentWorkflowGraphDecisionEvidence {
  version: "1.0";
  authority: MainAgentWorkflowGraphDecisionAuthority;
  executionStarted: false;
  id: string;
  ref: string;
  changeId: string;
  projectId: string | null;
  createdAt: string;
  observation: MainAgentWorkflowGraphObservation;
  decision: {
    kind: MainAgentWorkflowGraphDecisionKind;
    reason: string;
  };
  artifactRefs: string[];
  refs: MainAgentWorkflowGraphDecisionRefs;
}

export interface RecordMainAgentWorkflowGraphObservationOptions {
  changePath?: string;
  queue?: TaskQueueRun | null;
  workflow?: WorkflowRun | null;
  loopRunId?: string;
}

interface WorkflowGraphArtifacts {
  decompositionPlan: DecompositionPlan | null;
  readiness: DecompositionReadinessManifest | null;
  proposal: TaskQueueProposal | null;
  graph: WorkflowGraphPlan | null;
}

const refsSchema = z.object({
  mainAgentLoopRunIds: z.array(z.string()),
  workflowRunIds: z.array(z.string()),
  taskQueueRunIds: z.array(z.string()),
});

const freshnessSchema = z.object({
  status: z.enum(["fresh", "stale", "unavailable"]),
  reasons: z.array(z.string()),
});

const artifactSummarySchema = z.object({
  decompositionPlanId: z.string().nullable(),
  decompositionPlanStatus: z.string().nullable(),
  readinessManifestId: z.string().nullable(),
  readinessStatus: z.string().nullable(),
  readinessNextAllowedAction: z.enum(["code.run", "taskqueue.proposal", "scheduler.contract", "clarification.answer", "none"]).nullable().optional().default(null),
  readinessSchedulerEligible: z.boolean().nullable().optional().default(null),
  taskQueueProposalId: z.string().nullable(),
  taskQueueProposalStatus: z.string().nullable(),
  workflowGraphPlanId: z.string().nullable(),
  workflowGraphPlanStatus: z.string().nullable(),
});

const queueSummarySchema = z.object({
  queueRunId: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  scopeStatus: z.enum(["matched", "unbound", "mismatch", "unavailable"]).optional().default("unavailable"),
  queueStatus: z.string().nullable(),
  workflowStatus: z.string().nullable(),
  totalCount: z.number().nullable(),
  completedCount: z.number().nullable(),
  blockedCount: z.number().nullable(),
  failedCount: z.number().nullable(),
});

const observationSchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  projectId: z.string().nullable(),
  observedAt: z.string(),
  stage: artifactSummarySchema,
  queue: queueSummarySchema,
  freshness: freshnessSchema,
  recovery: freshnessSchema,
  artifactRefs: z.array(z.string()),
  refs: refsSchema,
});

const decisionEvidenceSchema = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-main-agent-workflowgraph-decision-evidence"),
  executionStarted: z.literal(false),
  id: z.string(),
  ref: z.string(),
  changeId: z.string(),
  projectId: z.string().nullable(),
  createdAt: z.string(),
  observation: observationSchema,
  decision: z.object({
    kind: z.enum([
      "needs-decomposition",
      "needs-readiness",
      "needs-taskqueue-proposal",
      "needs-workflowgraph-compile",
      "awaiting-queue-start-gate",
      "queue-running",
      "queue-paused",
      "queue-blocked",
      "queue-completed",
      "stale",
      "wait",
    ]),
    reason: z.string(),
  }),
  artifactRefs: z.array(z.string()),
  refs: refsSchema,
});

export function mainAgentWorkflowGraphDecisionsRoot(memory: ResolvedMemory, changeId: string): string {
  return join(agentTaskRoot(memory), "main-agent-workflowgraph", changeId);
}

export function mainAgentWorkflowGraphDecisionsPath(memory: ResolvedMemory, changeId: string): string {
  return join(mainAgentWorkflowGraphDecisionsRoot(memory, changeId), "workflowgraph-decisions.jsonl");
}

export function mainAgentWorkflowGraphDecisionEvidenceRef(changeId: string, evidenceId: string): string {
  return `agent-tasks/main-agent-workflowgraph/${changeId}/workflowgraph-decisions.jsonl#${evidenceId}`;
}

export async function observeMainAgentWorkflowGraph(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  options: RecordMainAgentWorkflowGraphObservationOptions = {},
): Promise<MainAgentWorkflowGraphObservation> {
  const changePath = options.changePath ?? await activeChangePath(memory, changeId).catch(() => null);
  const artifacts = changePath ? await readWorkflowGraphArtifacts(memory, changePath) : emptyArtifacts();
  const workflow = options.workflow ?? await getLatestWorkflowRun(memory, changeId).catch(() => null);
  const refs = normalizeRefs({
    mainAgentLoopRunIds: options.loopRunId ? [options.loopRunId] : [],
    workflowRunIds: [workflow?.id, options.queue?.workflowRunId],
    taskQueueRunIds: [options.queue?.id, workflow?.queueRunId],
  });
  const artifactRefs = workflowGraphArtifactRefs(artifacts);
  return {
    version: "1.0",
    changeId,
    projectId: project.id,
    observedAt: new Date().toISOString(),
    stage: summarizeArtifacts(artifacts),
    queue: summarizeQueue(options.queue ?? null, workflow),
    freshness: changePath ? await evaluateArtifactFreshness(memory, artifacts, options.queue ?? null, workflow) : { status: "unavailable", reasons: ["Active Change path is unavailable."] },
    recovery: await evaluateRecoveryFreshness(memory, project, artifacts.graph, workflow),
    artifactRefs,
    refs,
  };
}

export function decideMainAgentWorkflowGraph(
  observation: MainAgentWorkflowGraphObservation,
): { kind: MainAgentWorkflowGraphDecisionKind; reason: string } {
  if (observation.freshness.status === "stale" || observation.recovery.status === "stale") {
    return { kind: "stale", reason: firstReason(observation.freshness, observation.recovery) ?? "WorkflowGraph inputs are stale." };
  }
  if (!observation.stage.decompositionPlanId) {
    return { kind: "needs-decomposition", reason: "No DecompositionPlan evidence exists for this Change." };
  }
  if (observation.stage.decompositionPlanStatus !== "confirmed") {
    return { kind: "wait", reason: `DecompositionPlan is ${observation.stage.decompositionPlanStatus ?? "unknown"} and is not confirmed.` };
  }
  if (!observation.stage.readinessManifestId) {
    return { kind: "needs-readiness", reason: "Confirmed DecompositionPlan has no DecompositionReadinessManifest." };
  }
  if (observation.stage.readinessStatus !== "ready-for-sequential-taskqueue-proposal") {
    return { kind: "wait", reason: `Readiness status is ${observation.stage.readinessStatus ?? "unknown"}; no sequential TaskQueue should start.` };
  }
  if (!observation.stage.taskQueueProposalId) {
    return { kind: "needs-taskqueue-proposal", reason: "Sequential readiness has no TaskQueueProposal." };
  }
  if (!["draft", "confirmed", "started"].includes(observation.stage.taskQueueProposalStatus ?? "")) {
    return { kind: "stale", reason: `TaskQueueProposal is ${observation.stage.taskQueueProposalStatus ?? "unknown"}.` };
  }
  if (!observation.stage.workflowGraphPlanId) {
    return { kind: "needs-workflowgraph-compile", reason: "TaskQueueProposal has no compiled WorkflowGraphPlan." };
  }
  if (observation.stage.workflowGraphPlanStatus !== "compiled") {
    return { kind: "stale", reason: `WorkflowGraphPlan is ${observation.stage.workflowGraphPlanStatus ?? "unknown"}.` };
  }
  if (observation.queue.scopeStatus === "mismatch") {
    return { kind: "stale", reason: "TaskQueue and WorkflowRun scope mismatch." };
  }
  if (observation.queue.scopeStatus === "matched") {
    switch (observation.queue.queueStatus) {
      case "queued":
      case "running":
        if (observation.queue.workflowStatus === "running") {
          return { kind: "queue-running", reason: "A TaskQueue is active for this WorkflowGraph." };
        }
        break;
      case "paused":
        return { kind: "queue-paused", reason: "TaskQueue execution is paused and can be resumed through existing gates." };
      case "blocked":
      case "failed":
        return { kind: "queue-blocked", reason: "TaskQueue execution is blocked or failed." };
      case "completed":
        return { kind: "queue-completed", reason: "TaskQueue execution has completed." };
    }
  }
  switch (observation.queue.workflowStatus) {
    case "created":
      return { kind: "wait", reason: "WorkflowRun is created and waiting for queue binding or recovery; it is not running and should not restart the queue gate." };
    case "queued":
    case "running":
      return { kind: "wait", reason: "WorkflowRun reports active state but has no matching TaskQueue binding." };
    case "paused":
      return { kind: "queue-paused", reason: "TaskQueue execution is paused and can be resumed through existing gates." };
    case "blocked":
    case "failed":
      return { kind: "queue-blocked", reason: "TaskQueue execution is blocked or failed." };
    case "completed":
      return { kind: "queue-completed", reason: "TaskQueue execution has completed." };
    default:
      return { kind: "awaiting-queue-start-gate", reason: "Latest WorkflowGraphPlan is fresh and waiting for the existing queue start gate." };
  }
}

export async function recordMainAgentWorkflowGraphObservation(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  options: RecordMainAgentWorkflowGraphObservationOptions = {},
): Promise<MainAgentWorkflowGraphDecisionEvidence> {
  const observation = await observeMainAgentWorkflowGraph(memory, project, changeId, options);
  const decision = decideMainAgentWorkflowGraph(observation);
  const now = new Date().toISOString();
  const id = `workflowgraph-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${changeId}:${decision.kind}:${now}`).slice(0, 8)}`;
  const evidence: MainAgentWorkflowGraphDecisionEvidence = {
    version: "1.0",
    authority: "non-executing-main-agent-workflowgraph-decision-evidence",
    executionStarted: false,
    id,
    ref: mainAgentWorkflowGraphDecisionEvidenceRef(changeId, id),
    changeId,
    projectId: project.id,
    createdAt: now,
    observation,
    decision: {
      kind: decision.kind,
      reason: truncate(decision.reason),
    },
    artifactRefs: observation.artifactRefs,
    refs: observation.refs,
  };
  const path = mainAgentWorkflowGraphDecisionsPath(memory, changeId);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(evidence)}\n`, "utf8");
  return evidence;
}

export async function readMainAgentWorkflowGraphDecisionEvidence(
  memory: ResolvedMemory,
  changeId: string,
): Promise<MainAgentWorkflowGraphDecisionEvidence[]> {
  const path = mainAgentWorkflowGraphDecisionsPath(memory, changeId);
  try {
    if (!existsSync(path)) return [];
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const result: MainAgentWorkflowGraphDecisionEvidence[] = [];
    for (const line of lines) {
      const parsed = decisionEvidenceSchema.safeParse(JSON.parse(line));
      if (!parsed.success) return [];
      result.push(parsed.data);
    }
    return result;
  } catch {
    return [];
  }
}

async function readWorkflowGraphArtifacts(memory: ResolvedMemory, changePath: string): Promise<WorkflowGraphArtifacts> {
  return {
    decompositionPlan: await readLatestDecompositionPlan(memory, changePath).catch(() => null),
    readiness: await readLatestDecompositionReadinessManifest(memory, changePath).catch(() => null),
    proposal: await readLatestTaskQueueProposal(memory, changePath).catch(() => null),
    graph: await readLatestWorkflowGraphPlan(memory, changePath).catch(() => null),
  };
}

function emptyArtifacts(): WorkflowGraphArtifacts {
  return { decompositionPlan: null, readiness: null, proposal: null, graph: null };
}

function summarizeArtifacts(artifacts: WorkflowGraphArtifacts): MainAgentWorkflowGraphArtifactSummary {
  return {
    decompositionPlanId: artifacts.decompositionPlan?.id ?? null,
    decompositionPlanStatus: artifacts.decompositionPlan?.status ?? null,
    readinessManifestId: artifacts.readiness?.id ?? null,
    readinessStatus: artifacts.readiness?.status ?? null,
    readinessNextAllowedAction: artifacts.readiness?.nextAllowedAction ?? null,
    readinessSchedulerEligible: artifacts.readiness?.schedulerEligible ?? null,
    taskQueueProposalId: artifacts.proposal?.id ?? null,
    taskQueueProposalStatus: artifacts.proposal?.status ?? null,
    workflowGraphPlanId: artifacts.graph?.id ?? null,
    workflowGraphPlanStatus: artifacts.graph?.status ?? null,
  };
}

function summarizeQueue(queue: TaskQueueRun | null, workflow: WorkflowRun | null): MainAgentWorkflowGraphQueueSummary {
  return {
    queueRunId: queue?.id ?? workflow?.queueRunId ?? null,
    workflowRunId: workflow?.id ?? queue?.workflowRunId ?? null,
    scopeStatus: summarizeQueueScope(queue, workflow),
    queueStatus: queue?.status ?? null,
    workflowStatus: workflow?.status ?? null,
    totalCount: queue?.totalCount ?? workflow?.items.length ?? null,
    completedCount: queue?.completedCount ?? workflow?.items.filter((item) => item.status === "completed").length ?? null,
    blockedCount: queue ? queueStatusCount(queue, "blocked") : workflow?.items.filter((item) => item.status === "blocked").length ?? null,
    failedCount: queue ? queueStatusCount(queue, "failed") : workflow?.items.filter((item) => item.status === "failed").length ?? null,
  };
}

function summarizeQueueScope(queue: TaskQueueRun | null, workflow: WorkflowRun | null): MainAgentWorkflowGraphQueueSummary["scopeStatus"] {
  if (!queue && !workflow) return "unavailable";
  if (!queue || !workflow) return "unbound";
  const queuePointsAtWorkflow = queue.workflowRunId === workflow.id;
  const workflowPointsAtQueue = workflow.queueRunId === queue.id;
  if (queuePointsAtWorkflow && workflowPointsAtQueue) return "matched";
  if ((queue.workflowRunId && queue.workflowRunId !== workflow.id) || (workflow.queueRunId && workflow.queueRunId !== queue.id)) return "mismatch";
  return "unbound";
}

function queueStatusCount(queue: TaskQueueRun, status: "blocked" | "failed"): number {
  if (status === "blocked") return queue.status === "blocked" ? 1 : 0;
  return queue.status === "failed" ? 1 : 0;
}

async function evaluateArtifactFreshness(
  memory: ResolvedMemory,
  artifacts: WorkflowGraphArtifacts,
  queue: TaskQueueRun | null,
  workflow: WorkflowRun | null,
): Promise<MainAgentWorkflowGraphFreshnessSummary> {
  const reasons: string[] = [];
  if (artifacts.decompositionPlan && artifacts.readiness && artifacts.readiness.decompositionPlanId !== artifacts.decompositionPlan.id) {
    reasons.push("DecompositionReadinessManifest does not match latest DecompositionPlan.");
  }
  if (artifacts.readiness && artifacts.proposal) {
    if (artifacts.proposal.readinessManifestId !== artifacts.readiness.id) reasons.push("TaskQueueProposal does not match latest DecompositionReadinessManifest.");
    if (artifacts.proposal.decompositionPlanId !== artifacts.readiness.decompositionPlanId) reasons.push("TaskQueueProposal does not match readiness decomposition plan.");
  }
  if (artifacts.proposal) {
    const proposalHashes = await hashArtifactRefs(memory, artifacts.proposal.artifactRefs).catch(() => null);
    if (!proposalHashes) {
      reasons.push("TaskQueueProposal source artifact hashes could not be recomputed.");
    } else {
      for (const [ref, hash] of Object.entries(proposalHashes)) {
        if (artifacts.proposal.sourceArtifactHashes[ref] !== hash) reasons.push(`TaskQueueProposal source artifact hash drift: ${ref}.`);
      }
    }
  }
  if (artifacts.proposal && artifacts.graph) {
    if (artifacts.graph.taskQueueProposalId !== artifacts.proposal.id) reasons.push("WorkflowGraphPlan does not match latest TaskQueueProposal.");
    if (artifacts.graph.readinessManifestId !== artifacts.proposal.readinessManifestId) reasons.push("WorkflowGraphPlan does not match proposal readiness.");
    const graphSourceRefs = Object.keys(artifacts.graph.sourceArtifactHashes);
    const graphHashes = await hashArtifactRefs(memory, graphSourceRefs).catch(() => null);
    if (!graphHashes) {
      reasons.push("WorkflowGraphPlan source artifact hashes could not be recomputed.");
    } else {
      for (const [ref, hash] of Object.entries(graphHashes)) {
        if (artifacts.graph.sourceArtifactHashes[ref] !== hash) reasons.push(`WorkflowGraphPlan source artifact hash drift: ${ref}.`);
      }
    }
  }
  if (artifacts.graph && workflow?.workflowGraphPlanId && workflow.workflowGraphPlanId !== artifacts.graph.id) {
    reasons.push("Latest WorkflowRun is scoped to an older WorkflowGraphPlan.");
  }
  if (artifacts.graph && queue?.workflowGraphPlanId && queue.workflowGraphPlanId !== artifacts.graph.id) {
    reasons.push("Latest TaskQueueRun is scoped to an older WorkflowGraphPlan.");
  }
  if (artifacts.proposal && queue?.taskQueueProposalId && queue.taskQueueProposalId !== artifacts.proposal.id) {
    reasons.push("Latest TaskQueueRun is scoped to an older TaskQueueProposal.");
  }
  return reasons.length > 0 ? { status: "stale", reasons: dedupeStrings(reasons) } : { status: "fresh", reasons: [] };
}

async function evaluateRecoveryFreshness(
  memory: ResolvedMemory,
  project: ManagedProject,
  graph: WorkflowGraphPlan | null,
  workflow: WorkflowRun | null,
): Promise<MainAgentWorkflowGraphFreshnessSummary> {
  if (!workflow) return { status: "unavailable", reasons: ["No WorkflowRun exists."] };
  if (graph && workflow.workflowGraphPlanId && workflow.workflowGraphPlanId !== graph.id) {
    return { status: "stale", reasons: ["WorkflowRun is scoped to an older WorkflowGraphPlan."] };
  }
  try {
    const recomputed = await recomputeWorkflowRecoveryKey(memory, project, workflow);
    return sameJson(workflow.recoveryKey, recomputed)
      ? { status: "fresh", reasons: [] }
      : { status: "stale", reasons: ["WorkflowRun recovery key no longer matches current evidence."] };
  } catch (cause) {
    return { status: "stale", reasons: [cause instanceof Error ? truncate(cause.message) : "WorkflowRun recovery key could not be recomputed."] };
  }
}

function workflowGraphArtifactRefs(artifacts: WorkflowGraphArtifacts): string[] {
  return dedupeStrings([
    ...(artifacts.decompositionPlan?.artifactRefs ?? []),
    artifacts.decompositionPlan?.artifact,
    artifacts.decompositionPlan?.markdownArtifact,
    ...(artifacts.readiness?.artifactRefs ?? []),
    artifacts.readiness?.artifact,
    artifacts.readiness?.markdownArtifact,
    ...(artifacts.proposal?.artifactRefs ?? []),
    artifacts.proposal?.artifact,
    artifacts.proposal?.markdownArtifact,
    ...(artifacts.graph?.artifactRefs ?? []),
    artifacts.graph?.artifact,
    artifacts.graph?.markdownArtifact,
  ]);
}

function normalizeRefs(input: {
  mainAgentLoopRunIds?: Array<string | null | undefined>;
  workflowRunIds?: Array<string | null | undefined>;
  taskQueueRunIds?: Array<string | null | undefined>;
}): MainAgentWorkflowGraphDecisionRefs {
  return {
    mainAgentLoopRunIds: dedupeStrings(input.mainAgentLoopRunIds ?? []),
    workflowRunIds: dedupeStrings(input.workflowRunIds ?? []),
    taskQueueRunIds: dedupeStrings(input.taskQueueRunIds ?? []),
  };
}

function firstReason(...summaries: MainAgentWorkflowGraphFreshnessSummary[]): string | null {
  for (const summary of summaries) {
    const reason = summary.reasons[0];
    if (reason) return reason;
  }
  return null;
}

function truncate(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? `${normalized.slice(0, 497)}...` : normalized;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
