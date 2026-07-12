import type { AgentTask, ManagedProject, ResolvedMemory } from "../types/index.js";
import { parseHarnessEngineeringAssignment, type HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import { EvolutionScoreBlockedError } from "./maintenance-provider-runner.js";
import {
  checkpointAgentTask,
  claimNextMaintenanceAgentTask,
  completeAgentTask,
  failAgentTask,
  heartbeatAgentTask,
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
  onLeaseInvalidated?: (task: AgentTask, error: unknown) => void | Promise<void>;
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
  let executed = 0;
  for (let index = 0; index < limit; index += 1) {
    if (signal.aborted) break;
    const claimed = await claimNextMaintenanceAgentTask(memory, {
      owner: options.owner ?? `background-worker-${process.pid}`,
      leaseDurationMs: options.leaseDurationMs,
    });
    if (!claimed) break;
    await executeTask(memory, project, claimed, options, signal);
    executed += 1;
  }
  return executed;
}

async function executeTask(
  memory: ResolvedMemory,
  project: ManagedProject,
  claimed: AgentTask,
  options: BackgroundWorkerOptions,
  signal: AbortSignal,
): Promise<void> {
  const assignmentController = new AbortController();
  const abortFromWorker = (): void => assignmentController.abort(signal.reason);
  signal.addEventListener("abort", abortFromWorker, { once: true });
  let running: AgentTask | null = null;
  let writer: AgentTaskWriterIdentity | undefined;
  let heartbeat: NodeJS.Timeout | null = null;
  try {
    writer = { claimToken: claimed.lease!.claimToken, fencingToken: claimed.lease!.fencingToken };
    running = await startAgentTask(memory, claimed, writer);
    const heartbeatEveryMs = Math.max(100, Math.floor((options.leaseDurationMs ?? 30_000) / 3));
    heartbeat = setInterval(() => {
      if (!running || !writer) return;
      void heartbeatAgentTask(memory, running, writer, options.leaseDurationMs).then((updated) => {
        running = updated;
      }).catch((error) => {
        options.onError?.(error);
        void options.onLeaseInvalidated?.(running ?? claimed, error);
        assignmentController.abort(error);
      });
    }, heartbeatEveryMs);
    const assignment = parseHarnessEngineeringAssignment(await options.assignmentFactory(running, project));
    const result = await options.runAssignment!({ project, task: running, assignment, signal: assignmentController.signal });
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
    if (hasArtifactRefs(error)) {
      running = await checkpointAgentTask(memory, running, writer, {
        summary: error instanceof Error ? error.message : String(error),
        artifactRefs: error.artifactRefs,
      });
    }
    await failAgentTask(memory, running, {
      retryable: isRetryable(error),
      summary: error instanceof Error ? error.message : String(error),
      artifactRefs: hasArtifactRefs(error) ? error.artifactRefs : undefined,
      failureClassification: isRetryable(error) ? "background-worker-retryable" : "background-worker-terminal",
      writer,
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    signal.removeEventListener("abort", abortFromWorker);
  }
}

function hasArtifactRefs(error: unknown): error is { artifactRefs: string[] } {
  return typeof error === "object" && error !== null
    && Array.isArray((error as { artifactRefs?: unknown }).artifactRefs);
}

function isRetryable(error: unknown): boolean {
  return !(error instanceof NonRetryableBackgroundWorkerError
    || error instanceof EvolutionScoreBlockedError);
}

export class NonRetryableBackgroundWorkerError extends Error {}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}
