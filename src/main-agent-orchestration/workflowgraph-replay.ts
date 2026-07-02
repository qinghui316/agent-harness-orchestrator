import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { z } from "zod";
import { listAgentTasks } from "../agent-task/repository.js";
import { listTaskQueues, getLatestTaskQueue } from "../task-queue/manager.js";
import { listTaskRuns } from "../task-run/manager.js";
import type { AgentTask, ManagedProject, ResolvedMemory, TaskQueueItem, TaskQueueRun, TaskRun, WorkflowRun } from "../types/index.js";
import { getLatestWorkflowRun } from "../workflow-run/manager.js";
import {
  evaluateMainAgentWorkflowGraphReplayPolicy,
  mainAgentWorkflowGraphPolicyToNextObservation,
  type MainAgentWorkflowGraphDecisionPolicyKind,
  type MainAgentStrategyDecision,
} from "./decision-policy.js";
import {
  buildControlledSchedulerStepReplaySummary,
  type ControlledSchedulerStepReplaySummary,
} from "./controlled-scheduler-step-replay.js";
import {
  buildMainAgentControlledSchedulerStateBackflow,
  type MainAgentControlledSchedulerStateBackflowSummary,
} from "./controlled-scheduler-state-backflow.js";
import { emptyMainAgentControlledSchedulerWorkerBackflow } from "./controlled-scheduler-worker-backflow.js";
import { emptyMainAgentControlledSchedulerIntegrationBackflow } from "./controlled-scheduler-integration-backflow.js";
import {
  mainAgentWorkflowGraphDecisionsPath,
  observeMainAgentWorkflowGraph,
  type MainAgentWorkflowGraphDecisionKind,
  type MainAgentWorkflowGraphObservation,
} from "./workflowgraph-observation.js";
import { mainAgentLoopEventsPath, mainAgentLoopRunPath, mainAgentLoopRunsRoot } from "./loop-evidence.js";
import { mainAgentNextStepDecisionsPath } from "./next-step-evidence.js";
import { mainAgentQueueDecisionsPath } from "./queue-step-evidence.js";

export type MainAgentReplayEvidenceHealthStatus =
  | "available"
  | "missing"
  | "malformed"
  | "old-schema"
  | "scope-mismatch"
  | "stale";

export type MainAgentWorkflowGraphReplayCurrentKind =
  | MainAgentWorkflowGraphDecisionKind
  | "unavailable";

export interface MainAgentReplayEvidenceHealth {
  source: "canonical-observation" | "workflowgraph-decisions" | "loop-runs" | "queue-decisions" | "role-loop-decisions" | "role-loop-events" | "controlled-scheduler-step" | "controlled-scheduler-state" | "controlled-scheduler-worker" | "controlled-scheduler-integration" | "replay-summary";
  status: MainAgentReplayEvidenceHealthStatus;
  count: number;
  reasons: string[];
  paths: string[];
  issues?: Array<{ status: MainAgentReplayEvidenceHealthStatus; reason: string }>;
}

export interface MainAgentWorkflowGraphReplayGap {
  source: MainAgentReplayEvidenceHealth["source"];
  status: MainAgentReplayEvidenceHealthStatus;
  reason: string;
}

export interface MainAgentWorkflowGraphReplayHistoricalEvidence {
  source: "workflowgraph-decisions" | "queue-decisions" | "role-loop-decisions" | "role-loop-events";
  id: string;
  ref: string | null;
  loopRunId: string | null;
  kind: string;
  createdAt: string;
}

export interface MainAgentWorkflowGraphReplayCurrentState {
  kind: MainAgentWorkflowGraphReplayCurrentKind;
  reason: string;
  source: "canonical-managers";
  readiness: {
    manifestId: string | null;
    status: string | null;
    nextAllowedAction: MainAgentWorkflowGraphObservation["stage"]["readinessNextAllowedAction"];
    schedulerEligible: boolean | null;
  };
  workflow: {
    id: string | null;
    status: string | null;
    queueRunId: string | null;
  };
  queue: {
    id: string | null;
    status: string | null;
    scopeStatus: MainAgentWorkflowGraphObservation["queue"]["scopeStatus"];
    totalCount: number | null;
    completedCount: number | null;
    blockedCount: number | null;
    failedCount: number | null;
  };
  taskRuns: Record<string, number>;
  agentTasks: Record<string, number>;
}

export interface MainAgentWorkflowGraphReplaySummary {
  version: "1.0";
  authority: "read-only-main-agent-workflowgraph-replay-summary";
  executionStarted: false;
  changeId: string;
  projectId: string | null;
  builtAt: string;
  currentState: MainAgentWorkflowGraphReplayCurrentState;
  latestHistoricalEvidence: {
    workflowGraphDecision: MainAgentWorkflowGraphReplayHistoricalEvidence | null;
    queueDecision: MainAgentWorkflowGraphReplayHistoricalEvidence | null;
    roleDecision: MainAgentWorkflowGraphReplayHistoricalEvidence | null;
    roleEvent: MainAgentWorkflowGraphReplayHistoricalEvidence | null;
  };
  evidenceHealth: MainAgentReplayEvidenceHealth[];
  gaps: MainAgentWorkflowGraphReplayGap[];
  artifactRefs: string[];
  refs: {
    mainAgentLoopRunIds: string[];
    workflowRunIds: string[];
    taskQueueRunIds: string[];
    schedulerRunIds: string[];
    schedulerControlledStepIds: string[];
    taskRunIds: string[];
    agentTaskIds: string[];
    runIds: string[];
    validationIds: string[];
    auditIds: string[];
  };
  controlledScheduler: {
    latestStep: ControlledSchedulerStepReplaySummary["latestStep"];
    expectedSchedulerRunId: string | null;
    healthStatus: ControlledSchedulerStepReplaySummary["health"]["status"];
    reasons: string[];
    artifactRefs: string[];
  };
  controlledSchedulerStateBackflow: MainAgentControlledSchedulerStateBackflowSummary;
  nextObservation: {
    kind: MainAgentWorkflowGraphDecisionPolicyKind;
    reason: string;
    targets: string[];
  };
  strategyDecision: MainAgentStrategyDecision;
}

export interface BuildMainAgentWorkflowGraphReplaySummaryOptions {
  changePath?: string | null;
  schedulerRunId?: string | null;
}

const refsSchema = z.object({
  mainAgentLoopRunIds: z.array(z.string()).optional().default([]),
  workflowRunIds: z.array(z.string()).optional().default([]),
  taskQueueRunIds: z.array(z.string()).optional().default([]),
  taskQueueItemIds: z.array(z.string()).optional().default([]),
  schedulerRunIds: z.array(z.string()).optional().default([]),
  schedulerControlledStepIds: z.array(z.string()).optional().default([]),
  taskRunIds: z.array(z.string()).optional().default([]),
  agentTaskIds: z.array(z.string()).optional().default([]),
  runIds: z.array(z.string()).optional().default([]),
  validationIds: z.array(z.string()).optional().default([]),
  auditIds: z.array(z.string()).optional().default([]),
});

interface ParsedHistoricalLine {
  id: string;
  ref?: string | null;
  loopRunId?: string;
  changeId: string;
  createdAt?: string;
  timestamp?: string;
  decision?: { kind: string };
  type?: string;
  decisionKind?: string;
  artifactRefs?: string[];
  refs?: Partial<MainAgentWorkflowGraphReplaySummary["refs"]>;
}

const workflowGraphHistoricalSchema: z.ZodType<ParsedHistoricalLine> = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-main-agent-workflowgraph-decision-evidence"),
  id: z.string(),
  ref: z.string().nullable().optional(),
  changeId: z.string(),
  createdAt: z.string(),
  decision: z.object({ kind: z.string() }).passthrough(),
  artifactRefs: z.array(z.string()).optional().default([]),
  refs: refsSchema.optional().default({}),
}).passthrough();

const queueHistoricalSchema: z.ZodType<ParsedHistoricalLine> = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-main-agent-queue-step-evidence"),
  id: z.string(),
  ref: z.string().nullable().optional(),
  loopRunId: z.string(),
  changeId: z.string(),
  createdAt: z.string(),
  decision: z.object({ kind: z.string() }).passthrough(),
  artifactRefs: z.array(z.string()).optional().default([]),
  refs: refsSchema.optional().default({}),
}).passthrough();

const roleDecisionHistoricalSchema: z.ZodType<ParsedHistoricalLine> = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-main-agent-next-step-evidence"),
  id: z.string(),
  ref: z.string().nullable().optional(),
  loopRunId: z.string(),
  changeId: z.string(),
  createdAt: z.string(),
  decision: z.object({ kind: z.string() }).passthrough(),
  artifactRefs: z.array(z.string()).optional().default([]),
  refs: refsSchema.optional().default({}),
}).passthrough();

const loopEventHistoricalSchema: z.ZodType<ParsedHistoricalLine> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  loopRunId: z.string(),
  changeId: z.string(),
  type: z.string(),
  timestamp: z.string(),
  decisionKind: z.string().optional(),
  artifactRefs: z.array(z.string()).optional().default([]),
  refs: refsSchema.optional().default({}),
}).passthrough();

const loopRunSummarySchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: z.string(),
  entrypoint: z.string(),
}).passthrough();

interface HistoricalReadResult {
  health: MainAgentReplayEvidenceHealth;
  items: MainAgentWorkflowGraphReplayHistoricalEvidence[];
  refs: MainAgentWorkflowGraphReplaySummary["refs"];
  artifactRefs: string[];
}

export async function buildMainAgentWorkflowGraphReplaySummary(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  options: BuildMainAgentWorkflowGraphReplaySummaryOptions = {},
): Promise<MainAgentWorkflowGraphReplaySummary> {
  const latestQueue = await getLatestTaskQueue(memory, changeId).catch(() => null);
  const latestWorkflow = await getLatestWorkflowRun(memory, changeId).catch(() => null);
  const [taskRuns, agentTasks, allQueues] = await Promise.all([
    listTaskRuns(memory, changeId).catch(() => []),
    listAgentTasks(memory, changeId).catch(() => []),
    listTaskQueues(memory, changeId).catch(() => []),
  ]);
  const observation = await observeMainAgentWorkflowGraph(memory, project, changeId, {
    queue: latestQueue?.queue ?? null,
    workflow: latestWorkflow,
  });
  const canonicalHealth = canonicalObservationHealth(observation);
  const workflowGraphHistory = await readHistoricalJsonl(
    mainAgentWorkflowGraphDecisionsPath(memory, changeId),
    "workflowgraph-decisions",
    changeId,
    workflowGraphHistoricalSchema,
    (line) => ({
      source: "workflowgraph-decisions",
      id: line.id,
      ref: line.ref ?? null,
      loopRunId: null,
      kind: line.decision?.kind ?? "unknown",
      createdAt: line.createdAt ?? "",
    }),
  );
  const loopDiscovery = await discoverLoopRuns(memory, changeId, workflowGraphHistory.items);
  const queueHistory = await readLoopScopedHistory(memory, "queue-decisions", changeId, loopDiscovery.ids, (loopRunId) => mainAgentQueueDecisionsPath(memory, loopRunId), queueHistoricalSchema, (line) => ({
    source: "queue-decisions",
    id: line.id,
    ref: line.ref ?? null,
    loopRunId: line.loopRunId ?? null,
    kind: line.decision?.kind ?? "unknown",
    createdAt: line.createdAt ?? "",
  }));
  const roleDecisions = await readLoopScopedHistory(memory, "role-loop-decisions", changeId, loopDiscovery.ids, (loopRunId) => mainAgentNextStepDecisionsPath(memory, loopRunId), roleDecisionHistoricalSchema, (line) => ({
    source: "role-loop-decisions",
    id: line.id,
    ref: line.ref ?? null,
    loopRunId: line.loopRunId ?? null,
    kind: line.decision?.kind ?? "unknown",
    createdAt: line.createdAt ?? "",
  }));
  const roleEvents = await readLoopScopedHistory(memory, "role-loop-events", changeId, loopDiscovery.ids, (loopRunId) => mainAgentLoopEventsPath(memory, loopRunId), loopEventHistoricalSchema, (line) => ({
    source: "role-loop-events",
    id: line.id,
    ref: null,
    loopRunId: line.loopRunId ?? null,
    kind: line.decisionKind ?? line.type ?? "unknown",
    createdAt: line.timestamp ?? "",
  }));
  const controlledScheduler = await buildControlledSchedulerStepReplaySummary({
    memory,
    changePath: options.changePath,
    changeId,
    expectedSchedulerRunId: options.schedulerRunId,
  });
  const controlledSchedulerStateBackflow = await buildMainAgentControlledSchedulerStateBackflow({
    memory,
    project,
    changeId,
    changePath: options.changePath,
    schedulerRunId: options.schedulerRunId,
  });
  const evidenceHealth = [
    canonicalHealth,
    workflowGraphHistory.health,
    loopDiscovery.health,
    queueHistory.health,
    roleDecisions.health,
    roleEvents.health,
    controlledScheduler.health,
    controlledSchedulerStateBackflow.health,
    controlledSchedulerStateBackflow.workerBackflow.health,
    controlledSchedulerStateBackflow.integrationCheckBackflow.health,
  ];
  const refs = mergeRefs(
    observation.refs,
    workflowGraphHistory.refs,
    queueHistory.refs,
    roleDecisions.refs,
    roleEvents.refs,
    {
      mainAgentLoopRunIds: loopDiscovery.ids,
      workflowRunIds: latestWorkflow ? [latestWorkflow.id] : [],
      taskQueueRunIds: dedupeStrings([latestQueue?.queue.id, ...allQueues.map((queue) => queue.id)]),
      schedulerRunIds: controlledSchedulerStateBackflow.schedulerRun ? [controlledSchedulerStateBackflow.schedulerRun.id] : [],
      schedulerControlledStepIds: controlledScheduler.latestStep ? [controlledScheduler.latestStep.id] : [],
      taskRunIds: taskRuns.map((run) => run.id),
      agentTaskIds: agentTasks.map((task) => task.id),
      runIds: dedupeStrings(taskRuns.map((run) => run.runId)),
      validationIds: [],
      auditIds: [],
    },
  );
  const gaps = buildGaps(evidenceHealth);
  const currentState = buildCurrentState(observation, latestWorkflow, latestQueue?.queue ?? null, latestQueue?.items ?? [], taskRuns, agentTasks);
  const artifactRefs = dedupeStrings([
    ...observation.artifactRefs,
    ...workflowGraphHistory.artifactRefs,
    ...queueHistory.artifactRefs,
    ...roleDecisions.artifactRefs,
    ...roleEvents.artifactRefs,
    ...controlledScheduler.artifactRefs,
    ...controlledSchedulerStateBackflow.artifactRefs,
  ]);
  const summaryCore: Omit<MainAgentWorkflowGraphReplaySummary, "nextObservation" | "strategyDecision"> = {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-replay-summary",
    executionStarted: false,
    changeId,
    projectId: project.id,
    builtAt: new Date().toISOString(),
    currentState,
    latestHistoricalEvidence: {
      workflowGraphDecision: latestHistorical(workflowGraphHistory.items),
      queueDecision: latestHistorical(queueHistory.items),
      roleDecision: latestHistorical(roleDecisions.items),
      roleEvent: latestHistorical(roleEvents.items),
    },
    evidenceHealth,
    gaps,
    artifactRefs,
    refs,
    controlledScheduler: {
      latestStep: controlledScheduler.latestStep,
      expectedSchedulerRunId: controlledScheduler.expectedSchedulerRunId,
      healthStatus: controlledScheduler.health.status,
      reasons: controlledScheduler.health.reasons,
      artifactRefs: controlledScheduler.artifactRefs,
    },
    controlledSchedulerStateBackflow,
  };
  const policy = evaluateMainAgentWorkflowGraphReplayPolicy(summaryCore);
  return {
    ...summaryCore,
    nextObservation: mainAgentWorkflowGraphPolicyToNextObservation(policy),
    strategyDecision: policy.strategyDecision,
  };
}

export function buildDegradedMainAgentWorkflowGraphReplaySummary(
  project: ManagedProject,
  changeId: string,
  reason: string,
  observationEvidence?: { observation: MainAgentWorkflowGraphObservation; artifactRefs: string[]; refs: Partial<MainAgentWorkflowGraphReplaySummary["refs"]> },
): MainAgentWorkflowGraphReplaySummary {
  const observation = observationEvidence?.observation;
  const canonicalHealth: MainAgentReplayEvidenceHealth = observation
    ? canonicalObservationHealth(observation)
    : {
      source: "canonical-observation",
      status: "missing",
      count: 0,
      reasons: ["Canonical WorkflowGraph observation is unavailable for degraded replay summary."],
      paths: [],
    };
  const replayHealth: MainAgentReplayEvidenceHealth = {
    source: "replay-summary",
    status: "malformed",
    count: 0,
    reasons: [reason],
    paths: [],
  };
  const evidenceHealth = [canonicalHealth, replayHealth];
  const refs = mergeRefs(observation?.refs, observationEvidence?.refs);
  const currentState = observation
    ? buildCurrentState(observation, null, null, [], [], [])
    : unavailableCurrentState("Replay summary derivation failed before canonical state could be reconstructed.");
  const summaryCore: Omit<MainAgentWorkflowGraphReplaySummary, "nextObservation" | "strategyDecision"> = {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-replay-summary",
    executionStarted: false,
    changeId,
    projectId: project.id,
    builtAt: new Date().toISOString(),
    currentState,
    latestHistoricalEvidence: {
      workflowGraphDecision: null,
      queueDecision: null,
      roleDecision: null,
      roleEvent: null,
    },
    evidenceHealth,
    gaps: buildGaps(evidenceHealth),
    artifactRefs: dedupeStrings([...(observation?.artifactRefs ?? []), ...(observationEvidence?.artifactRefs ?? [])]),
    refs,
    controlledScheduler: {
      latestStep: null,
      expectedSchedulerRunId: null,
      healthStatus: "missing",
      reasons: ["Controlled Scheduler step replay was not attempted because replay summary derivation degraded."],
      artifactRefs: [],
    },
    controlledSchedulerStateBackflow: {
      version: "1.0",
      authority: "read-only-main-agent-controlled-scheduler-state-backflow",
      executionStarted: false,
      changeId,
      projectId: project.id,
      expectedSchedulerRunId: null,
      schedulerRun: null,
      runtimeState: null,
      latestRuntimeEvent: null,
      controlledStep: null,
      workerBackflow: emptyMainAgentControlledSchedulerWorkerBackflow(
        { project, changeId },
        null,
        {
          source: "controlled-scheduler-worker",
          status: "missing",
          count: 0,
          reasons: ["Controlled Scheduler worker backflow was not attempted because replay summary derivation degraded."],
          paths: [],
        },
      ),
      integrationCheckBackflow: emptyMainAgentControlledSchedulerIntegrationBackflow(
        { project, changeId },
        null,
        {
          source: "controlled-scheduler-integration",
          status: "missing",
          count: 0,
          reasons: ["Controlled Scheduler integration backflow was not attempted because replay summary derivation degraded."],
          paths: [],
        },
      ),
      health: {
        source: "controlled-scheduler-state",
        status: "missing",
        count: 0,
        reasons: ["Controlled Scheduler state backflow was not attempted because replay summary derivation degraded."],
        paths: [],
      },
      artifactRefs: [],
    },
  };
  return {
    ...summaryCore,
    nextObservation: {
      kind: "inspect-evidence-gap",
      reason,
      targets: ["replay-summary"],
    },
    strategyDecision: evaluateMainAgentWorkflowGraphReplayPolicy(summaryCore).strategyDecision,
  };
}

function canonicalObservationHealth(observation: MainAgentWorkflowGraphObservation): MainAgentReplayEvidenceHealth {
  const reasons = [...observation.freshness.reasons, ...observation.recovery.reasons];
  if (observation.queue.scopeStatus === "mismatch") {
    reasons.push("TaskQueue and WorkflowRun scope mismatch.");
  }
  const status: MainAgentReplayEvidenceHealthStatus = observation.queue.scopeStatus === "mismatch"
    ? "scope-mismatch"
    : observation.freshness.status === "stale" || observation.recovery.status === "stale"
    ? "stale"
    : "available";
  return {
    source: "canonical-observation",
    status,
    count: 1,
    reasons,
    paths: [],
  };
}

async function readLoopScopedHistory(
  memory: ResolvedMemory,
  source: MainAgentReplayEvidenceHealth["source"],
  changeId: string,
  loopRunIds: string[],
  pathForLoop: (loopRunId: string) => string,
  schema: z.ZodType<ParsedHistoricalLine>,
  toItem: (line: ParsedHistoricalLine) => MainAgentWorkflowGraphReplayHistoricalEvidence,
): Promise<HistoricalReadResult> {
  if (loopRunIds.length === 0) {
    return emptyHistory(source, "missing", "No matching main-agent loop runs were found.");
  }
  const results = await Promise.all(loopRunIds.map((loopRunId) => readHistoricalJsonl(pathForLoop(loopRunId), source, changeId, schema, toItem)));
  return mergeHistory(source, results);
}

async function readHistoricalJsonl(
  path: string,
  source: MainAgentReplayEvidenceHealth["source"],
  changeId: string,
  schema: z.ZodType<ParsedHistoricalLine>,
  toItem: (line: ParsedHistoricalLine) => MainAgentWorkflowGraphReplayHistoricalEvidence,
): Promise<HistoricalReadResult> {
  if (!existsSync(path)) return emptyHistory(source, "missing", "Evidence file is missing.", [path]);
  const health: MainAgentReplayEvidenceHealth = { source, status: "available", count: 0, reasons: [], paths: [path] };
  const refs: MainAgentWorkflowGraphReplaySummary["refs"] = emptyRefs();
  const artifactRefs: string[] = [];
  const items: MainAgentWorkflowGraphReplayHistoricalEvidence[] = [];
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    return emptyHistory(source, "malformed", `Evidence file could not be read: ${errorMessage(error)}.`, [path]);
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return emptyHistory(source, "missing", "Evidence file is empty.", [path]);
  for (const line of lines) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      markHealth(health, "malformed", "Evidence line is not valid JSON.");
      continue;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      markHealth(health, "old-schema", "Evidence line does not match the current schema.");
      continue;
    }
    const scoped = parsed.data;
    if (scoped.changeId !== changeId) {
      markHealth(health, "scope-mismatch", `Evidence belongs to ${scoped.changeId ?? "unknown"} instead of ${changeId}.`);
      continue;
    }
    items.push(toItem(scoped));
    mergeRefsInto(refs, scoped.refs);
    artifactRefs.push(...(scoped.artifactRefs ?? []));
  }
  health.count = items.length;
  if (items.length === 0 && health.status === "available") markHealth(health, "missing", "No valid evidence entries were found.");
  return { health, items, refs, artifactRefs: dedupeStrings(artifactRefs) };
}

async function discoverLoopRuns(
  memory: ResolvedMemory,
  changeId: string,
  workflowGraphHistory: MainAgentWorkflowGraphReplayHistoricalEvidence[],
): Promise<{ ids: string[]; health: MainAgentReplayEvidenceHealth }> {
  const root = mainAgentLoopRunsRoot(memory);
  const ids = new Set<string>();
  for (const item of workflowGraphHistory) {
    if (item.loopRunId) ids.add(item.loopRunId);
  }
  const health: MainAgentReplayEvidenceHealth = {
    source: "loop-runs",
    status: "available",
    count: 0,
    reasons: [],
    paths: [root],
  };
  if (!existsSync(root)) {
    return { ids: [], health: { ...health, status: "missing", reasons: ["Main-agent loop run root is missing."] } };
  }
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    markHealth(health, "malformed", `Main-agent loop run root could not be read: ${errorMessage(error)}.`);
    return { ids: [...ids].sort(), health };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = mainAgentLoopRunPath(memory, entry.name);
    if (!existsSync(path)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, "utf8"));
    } catch {
      markHealth(health, "malformed", `Loop run metadata is malformed: ${entry.name}.`);
      continue;
    }
    const parsed = loopRunSummarySchema.safeParse(raw);
    if (!parsed.success) {
      markHealth(health, "old-schema", `Loop run metadata uses an old schema: ${entry.name}.`);
      continue;
    }
    if (parsed.data.changeId === changeId) ids.add(parsed.data.id);
  }
  health.count = ids.size;
  if (ids.size === 0 && health.status === "available") markHealth(health, "missing", "No matching main-agent loop runs were found.");
  return { ids: [...ids].sort(), health };
}

function emptyHistory(source: MainAgentReplayEvidenceHealth["source"], status: MainAgentReplayEvidenceHealthStatus, reason: string, paths: string[] = []): HistoricalReadResult {
  return {
    health: { source, status, count: 0, reasons: [reason], paths },
    items: [],
    refs: emptyRefs(),
    artifactRefs: [],
  };
}

function mergeHistory(source: MainAgentReplayEvidenceHealth["source"], results: HistoricalReadResult[]): HistoricalReadResult {
  const health: MainAgentReplayEvidenceHealth = {
    source,
    status: "available",
    count: 0,
    reasons: [],
    paths: [],
  };
  const refs = emptyRefs();
  const items: MainAgentWorkflowGraphReplayHistoricalEvidence[] = [];
  const artifactRefs: string[] = [];
  for (const result of results) {
    markHealth(health, result.health.status, ...result.health.reasons);
    health.paths.push(...result.health.paths);
    health.count += result.health.count;
    items.push(...result.items);
    artifactRefs.push(...result.artifactRefs);
    mergeRefsInto(refs, result.refs);
  }
  health.paths = dedupeStrings(health.paths);
  health.reasons = dedupeStrings(health.reasons);
  if (items.length === 0 && health.status === "available") markHealth(health, "missing", "No valid evidence entries were found.");
  return { health, items, refs, artifactRefs: dedupeStrings(artifactRefs) };
}

function markHealth(health: MainAgentReplayEvidenceHealth, status: MainAgentReplayEvidenceHealthStatus, ...reasons: string[]): void {
  if (healthPriority(status) > healthPriority(health.status)) health.status = status;
  health.reasons = dedupeStrings([...health.reasons, ...reasons]);
}

function healthPriority(status: MainAgentReplayEvidenceHealthStatus): number {
  switch (status) {
    case "malformed": return 6;
    case "scope-mismatch": return 5;
    case "old-schema": return 4;
    case "stale": return 3;
    case "missing": return 2;
    case "available": return 1;
  }
}

function buildCurrentState(
  observation: MainAgentWorkflowGraphObservation,
  workflow: WorkflowRun | null,
  queue: TaskQueueRun | null,
  queueItems: TaskQueueItem[],
  taskRuns: TaskRun[],
  agentTasks: AgentTask[],
): MainAgentWorkflowGraphReplayCurrentState {
  const current = deriveReplayCurrentKind(observation);
  return {
    kind: current.kind,
    reason: current.reason,
    source: "canonical-managers",
    readiness: {
      manifestId: observation.stage.readinessManifestId,
      status: observation.stage.readinessStatus,
      nextAllowedAction: observation.stage.readinessNextAllowedAction,
      schedulerEligible: observation.stage.readinessSchedulerEligible,
    },
    workflow: {
      id: workflow?.id ?? null,
      status: workflow?.status ?? observation.queue.workflowStatus,
      queueRunId: workflow?.queueRunId ?? null,
    },
    queue: {
      id: queue?.id ?? observation.queue.queueRunId,
      status: queue?.status ?? observation.queue.queueStatus,
      scopeStatus: observation.queue.scopeStatus,
      totalCount: queue?.totalCount ?? observation.queue.totalCount ?? queueItems.length,
      completedCount: queue?.completedCount ?? observation.queue.completedCount ?? countStatus(queueItems, "completed"),
      blockedCount: observation.queue.blockedCount ?? countStatus(queueItems, "blocked"),
      failedCount: observation.queue.failedCount ?? countStatus(queueItems, "failed"),
    },
    taskRuns: countBy(taskRuns.map((run) => run.status)),
    agentTasks: countBy(agentTasks.map((task) => task.status)),
  };
}

function unavailableCurrentState(reason: string): MainAgentWorkflowGraphReplayCurrentState {
  return {
    kind: "unavailable",
    reason,
    source: "canonical-managers",
    readiness: {
      manifestId: null,
      status: null,
      nextAllowedAction: null,
      schedulerEligible: null,
    },
    workflow: {
      id: null,
      status: null,
      queueRunId: null,
    },
    queue: {
      id: null,
      status: null,
      scopeStatus: "unavailable",
      totalCount: null,
      completedCount: null,
      blockedCount: null,
      failedCount: null,
    },
    taskRuns: {},
    agentTasks: {},
  };
}

function deriveReplayCurrentKind(
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

function buildGaps(health: MainAgentReplayEvidenceHealth[]): MainAgentWorkflowGraphReplayGap[] {
  const gaps: MainAgentWorkflowGraphReplayGap[] = [];
  for (const item of health) {
    if (item.status === "available") continue;
    if (item.issues?.length) {
      for (const issue of item.issues) {
        gaps.push({ source: item.source, status: issue.status, reason: issue.reason });
      }
      continue;
    }
    for (const reason of item.reasons.length ? item.reasons : [`${item.source} is ${item.status}.`]) {
      gaps.push({ source: item.source, status: item.status, reason });
    }
  }
  return gaps;
}

function latestHistorical(items: MainAgentWorkflowGraphReplayHistoricalEvidence[]): MainAgentWorkflowGraphReplayHistoricalEvidence | null {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function firstReason(
  ...summaries: Array<{ reasons: string[] }>
): string | null {
  for (const summary of summaries) {
    const reason = summary.reasons.find((item) => item.trim().length > 0);
    if (reason) return reason;
  }
  return null;
}

function mergeRefs(...refsList: Array<Partial<MainAgentWorkflowGraphReplaySummary["refs"]> | undefined>): MainAgentWorkflowGraphReplaySummary["refs"] {
  const refs = emptyRefs();
  for (const refsInput of refsList) mergeRefsInto(refs, refsInput);
  return refs;
}

function mergeRefsInto(target: MainAgentWorkflowGraphReplaySummary["refs"], refs: Partial<MainAgentWorkflowGraphReplaySummary["refs"]> | undefined): void {
  if (!refs) return;
  target.mainAgentLoopRunIds = dedupeStrings([...target.mainAgentLoopRunIds, ...(refs.mainAgentLoopRunIds ?? [])]);
  target.workflowRunIds = dedupeStrings([...target.workflowRunIds, ...(refs.workflowRunIds ?? [])]);
  target.taskQueueRunIds = dedupeStrings([...target.taskQueueRunIds, ...(refs.taskQueueRunIds ?? [])]);
  target.schedulerRunIds = dedupeStrings([...target.schedulerRunIds, ...(refs.schedulerRunIds ?? [])]);
  target.schedulerControlledStepIds = dedupeStrings([...target.schedulerControlledStepIds, ...(refs.schedulerControlledStepIds ?? [])]);
  target.taskRunIds = dedupeStrings([...target.taskRunIds, ...(refs.taskRunIds ?? [])]);
  target.agentTaskIds = dedupeStrings([...target.agentTaskIds, ...(refs.agentTaskIds ?? [])]);
  target.runIds = dedupeStrings([...target.runIds, ...(refs.runIds ?? [])]);
  target.validationIds = dedupeStrings([...target.validationIds, ...(refs.validationIds ?? [])]);
  target.auditIds = dedupeStrings([...target.auditIds, ...(refs.auditIds ?? [])]);
}

function emptyRefs(): MainAgentWorkflowGraphReplaySummary["refs"] {
  return {
    mainAgentLoopRunIds: [],
    workflowRunIds: [],
    taskQueueRunIds: [],
    schedulerRunIds: [],
    schedulerControlledStepIds: [],
    taskRunIds: [],
    agentTaskIds: [],
    runIds: [],
    validationIds: [],
    auditIds: [],
  };
}

function countStatus(items: TaskQueueItem[], status: TaskQueueItem["status"]): number {
  return items.filter((item) => item.status === status).length;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown error";
}
