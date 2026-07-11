import type { AgentTask, ManagedProject, ResolvedMemory } from "../types/index.js";
import { parseHarnessEngineeringAssignment, type HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import { MaintenanceReviewBlockedError } from "./maintenance-provider-runner.js";
import {
  checkpointAgentTask,
  claimAgentTask,
  completeAgentTask,
  failAgentTask,
  heartbeatAgentTask,
  listAgentTasks,
  startAgentTask,
  type AgentTaskWriterIdentity,
} from "./repository.js";

export interface BackgroundAssignmentRunResult {
  summary: string;
  artifactRefs?: string[];
  policyAuditRefs?: string[];
  boundaryAuditRefs?: string[];
}

export interface BackgroundWorkerOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
  maxTasksPerPoll?: number;
  leaseDurationMs?: number;
  owner?: string;
  onError?: (error: unknown) => void;
  assignmentFactory: (task: AgentTask, project: ManagedProject) => HarnessEngineeringAssignment | Promise<HarnessEngineeringAssignment>;
  runAssignment?: (input: {
    project: ManagedProject;
    task: AgentTask;
    assignment: HarnessEngineeringAssignment;
    signal: AbortSignal;
  }) => Promise<BackgroundAssignmentRunResult>;
}

export interface BackgroundWorkerHandle {
  poll(): Promise<number>;
  drain(): Promise<void>;
}

export function startBackgroundWorker(
  memory: ResolvedMemory,
  project: ManagedProject,
  options: BackgroundWorkerOptions,
): BackgroundWorkerHandle {
  const enabled = options.enabled ?? false;
  if (enabled && !options.runAssignment) {
    throw new Error("Background AgentTask execution is enabled but runAssignment is not configured.");
  }
  const maxTasksPerPoll = positiveInteger(options.maxTasksPerPoll, 1);
  const pollIntervalMs = positiveInteger(options.pollIntervalMs, 1_000);
  let stopped = false;
  let activePoll: Promise<number> | null = null;
  let activeController: AbortController | null = null;
  let timer: NodeJS.Timeout | null = null;

  const poll = (): Promise<number> => {
    if (!enabled || stopped) return Promise.resolve(0);
    if (activePoll) return activePoll;
    activeController = new AbortController();
    activePoll = runPoll(memory, project, options, maxTasksPerPoll, activeController.signal).finally(() => {
      activePoll = null;
      activeController = null;
      if (!stopped) timer = setTimeout(() => { void poll().catch((error) => options.onError?.(error)); }, pollIntervalMs);
    });
    return activePoll;
  };

  if (enabled) timer = setTimeout(() => { void poll().catch((error) => options.onError?.(error)); }, pollIntervalMs);
  return {
    poll,
    async drain() {
      stopped = true;
      if (timer) clearTimeout(timer);
      activeController?.abort(new Error("Background worker is draining."));
      await activePoll;
    },
  };
}

async function runPoll(
  memory: ResolvedMemory,
  project: ManagedProject,
  options: BackgroundWorkerOptions,
  limit: number,
  signal: AbortSignal,
): Promise<number> {
  const queued = (await listAgentTasks(memory))
    .filter((task) => task.status === "queued" && task.kind === "background" && task.createdBy === "maintenance-policy")
    .slice(0, limit);
  for (const task of queued) {
    if (signal.aborted) break;
    await executeTask(memory, project, task, options, signal);
  }
  return queued.length;
}

async function executeTask(
  memory: ResolvedMemory,
  project: ManagedProject,
  task: AgentTask,
  options: BackgroundWorkerOptions,
  signal: AbortSignal,
): Promise<void> {
  let running: AgentTask | null = null;
  let writer: AgentTaskWriterIdentity | undefined;
  let heartbeat: NodeJS.Timeout | null = null;
  try {
    const claimed = await claimAgentTask(memory, task, {
      owner: options.owner ?? `background-worker-${process.pid}`,
      leaseDurationMs: options.leaseDurationMs,
    });
    writer = { claimToken: claimed.lease!.claimToken, fencingToken: claimed.lease!.fencingToken };
    running = await startAgentTask(memory, claimed, writer);
    const heartbeatEveryMs = Math.max(100, Math.floor((options.leaseDurationMs ?? 30_000) / 3));
    heartbeat = setInterval(() => {
      if (!running || !writer) return;
      void heartbeatAgentTask(memory, running, writer, options.leaseDurationMs).then((updated) => {
        running = updated;
      }).catch((error) => options.onError?.(error));
    }, heartbeatEveryMs);
    const assignment = parseHarnessEngineeringAssignment(await options.assignmentFactory(running, project));
    const result = await options.runAssignment!({ project, task: running, assignment, signal });
    running = await checkpointAgentTask(memory, running, writer, {
      summary: result.summary,
      artifactRefs: result.artifactRefs ?? [],
    });
    await completeAgentTask(memory, running, {
      status: "completed",
      summary: result.summary,
      artifactRefs: result.artifactRefs,
      policyAuditRefs: result.policyAuditRefs,
      boundaryAuditRefs: result.boundaryAuditRefs,
      writer,
    });
  } catch (error) {
    if (!running || !writer) throw error;
    await failAgentTask(memory, running, {
      retryable: isRetryable(error),
      summary: error instanceof Error ? error.message : String(error),
      failureClassification: isRetryable(error) ? "background-worker-retryable" : "background-worker-terminal",
      writer,
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

function isRetryable(error: unknown): boolean {
  return !(error instanceof NonRetryableBackgroundWorkerError || error instanceof MaintenanceReviewBlockedError);
}

export class NonRetryableBackgroundWorkerError extends Error {}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}
