import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { RunWorktreeInfo, WorkerPermissionProfile } from "../types/index.js";
import { assertAgentEventEnvelopeScope, assertEventSourceScope, assertRuntimeWorkspaceScope, assertWorkerSessionScope } from "./guards.js";
import { agentEventEnvelopeSchema, eventSourceSchema, runtimeWorkspaceSchema, workerSessionSchema } from "./schemas.js";
import type {
  AgentEventEnvelope,
  EventSource,
  EventSourceStatus,
  RuntimeContinuityAdapter,
  RuntimeContinuityArtifacts,
  RuntimeContinuityScope,
  RuntimeWorkspace,
  WorkerSession,
  WorkerSessionStatus,
} from "./types.js";

export type RuntimeContinuityWorkspaceDescriptor =
  | {
    workspaceKind: "local-worktree";
    cwd: string;
    checkoutPath: string;
    worktreeId: string;
  }
  | {
    workspaceKind: "source-root";
    cwd: string;
  };

export interface CreateRuntimeContinuityInput extends RuntimeContinuityScope {
  adapter: RuntimeContinuityAdapter;
  worktree?: RunWorktreeInfo;
  workspace?: RuntimeContinuityWorkspaceDescriptor;
  permissionProfile: WorkerPermissionProfile;
  rawArtifactRefs: string[];
  sandboxPolicy: "read-only" | "workspace-write";
  createdAt?: string;
}

export interface AppendAgentEventInput {
  eventType: string;
  raw: Record<string, unknown>;
  summary?: string;
  timestamp?: string;
}

export async function createRuntimeContinuityArtifacts(paths: RuntimeContinuityFilePaths, input: CreateRuntimeContinuityInput): Promise<RuntimeContinuityArtifacts> {
  const now = input.createdAt ?? new Date().toISOString();
  const workspaceDescriptor = resolveWorkspaceDescriptor(input);
  const sessionId = stableId("worker-session", input.runId, input.roleId);
  const workspaceId = stableId("runtime-workspace", input.runId, workspaceDescriptor.workspaceKind === "local-worktree" ? workspaceDescriptor.worktreeId : "source-root");
  const eventSourceId = stableId("event-source", input.runId, input.adapter);
  const workspace: RuntimeWorkspace = {
    version: "1.0",
    kind: "runtime-workspace",
    id: workspaceId,
    projectId: input.projectId,
    changeId: input.changeId,
    runId: input.runId,
    roleId: input.roleId,
    workspaceKind: workspaceDescriptor.workspaceKind,
    cwd: workspaceDescriptor.cwd,
    ...(workspaceDescriptor.workspaceKind === "local-worktree" ? {
      checkoutPath: workspaceDescriptor.checkoutPath,
      worktreeId: workspaceDescriptor.worktreeId,
    } : {}),
    allowedReadRoots: input.permissionProfile.allowedReadRoots,
    allowedWriteRoots: input.permissionProfile.allowedWriteRoots,
    deniedPaths: input.permissionProfile.deniedPaths,
    sandboxPolicy: input.sandboxPolicy,
    createdAt: now,
    updatedAt: now,
  };
  const eventSource: EventSource = {
    version: "1.0",
    kind: "event-source",
    id: eventSourceId,
    projectId: input.projectId,
    changeId: input.changeId,
    runId: input.runId,
    roleId: input.roleId,
    ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}),
    ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
    ...(input.queueRunId ? { queueRunId: input.queueRunId } : {}),
    ...(input.schedulerContractId ? { schedulerContractId: input.schedulerContractId } : {}),
    adapter: input.adapter,
    workerSessionId: sessionId,
    runtimeWorkspaceId: workspaceId,
    rawArtifactRefs: input.rawArtifactRefs,
    status: "initialized",
    createdAt: now,
    updatedAt: now,
  };
  const session: WorkerSession = {
    version: "1.0",
    kind: "worker-session",
    id: sessionId,
    projectId: input.projectId,
    changeId: input.changeId,
    runId: input.runId,
    roleId: input.roleId,
    ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}),
    ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
    ...(input.queueRunId ? { queueRunId: input.queueRunId } : {}),
    ...(input.schedulerContractId ? { schedulerContractId: input.schedulerContractId } : {}),
    adapter: input.adapter,
    runtimeWorkspaceId: workspaceId,
    eventSourceId,
    ...(workspaceDescriptor.workspaceKind === "local-worktree" ? { worktreeId: workspaceDescriptor.worktreeId } : {}),
    permissionProfile: input.permissionProfile,
    sandboxPolicy: input.sandboxPolicy,
    status: "initialized",
    startedAt: now,
    updatedAt: now,
  };

  await Promise.all([
    writeJsonFile(paths.runtimeWorkspace, workspace),
    writeJsonFile(paths.eventSource, eventSource),
    writeJsonFile(paths.workerSession, session),
    prepareJsonl(paths.agentEvents),
  ]);
  return { session, workspace, eventSource };
}

function resolveWorkspaceDescriptor(input: CreateRuntimeContinuityInput): RuntimeContinuityWorkspaceDescriptor {
  if (input.workspace) {
    if (input.workspace.workspaceKind === "source-root" && input.worktree) {
      throw new Error("source-root runtime continuity workspace must not include worktree scope.");
    }
    if (input.workspace.workspaceKind === "local-worktree" && input.worktree && input.workspace.worktreeId !== input.worktree.worktreeId) {
      throw new Error(`Runtime continuity workspace worktree mismatch: ${input.workspace.worktreeId} does not match ${input.worktree.worktreeId}.`);
    }
    return input.workspace;
  }
  if (!input.worktree) {
    throw new Error("Runtime continuity requires an explicit workspace descriptor when no worktree is supplied.");
  }
  return {
    workspaceKind: "local-worktree",
    cwd: input.worktree.checkoutPath,
    checkoutPath: input.worktree.checkoutPath,
    worktreeId: input.worktree.worktreeId,
  };
}

export async function readWorkerSession(paths: RuntimeContinuityFilePaths, expected: RuntimeContinuityScope): Promise<WorkerSession> {
  const session = await readRequiredJsonFile(paths.workerSession, workerSessionSchema);
  assertWorkerSessionScope(session, expected);
  return session;
}

export async function readRuntimeWorkspace(paths: RuntimeContinuityFilePaths, session: WorkerSession): Promise<RuntimeWorkspace> {
  const workspace = await readRequiredJsonFile(paths.runtimeWorkspace, runtimeWorkspaceSchema);
  assertRuntimeWorkspaceScope(workspace, session);
  return workspace;
}

export async function readEventSource(paths: RuntimeContinuityFilePaths, session: WorkerSession): Promise<EventSource> {
  const eventSource = await readRequiredJsonFile(paths.eventSource, eventSourceSchema);
  assertEventSourceScope(eventSource, session);
  return eventSource;
}

export async function markRuntimeContinuityStatus(
  paths: RuntimeContinuityFilePaths,
  artifacts: RuntimeContinuityArtifacts,
  status: WorkerSessionStatus,
  error?: string,
): Promise<RuntimeContinuityArtifacts> {
  const now = new Date().toISOString();
  const eventStatus: EventSourceStatus = status;
  const session: WorkerSession = {
    ...artifacts.session,
    status,
    updatedAt: now,
    ...(["completed", "interrupted", "failed"].includes(status) ? { finishedAt: now } : {}),
    ...(error ? { error } : {}),
  };
  const eventSource: EventSource = {
    ...artifacts.eventSource,
    status: eventStatus,
    updatedAt: now,
    ...(["completed", "interrupted", "failed"].includes(status) ? { finishedAt: now } : {}),
    ...(error ? { error } : {}),
  };
  assertRuntimeWorkspaceScope(artifacts.workspace, session);
  assertEventSourceScope(eventSource, session);
  await Promise.all([
    writeJsonFile(paths.workerSession, session),
    writeJsonFile(paths.eventSource, eventSource),
  ]);
  return { session, workspace: artifacts.workspace, eventSource };
}

export async function appendAgentEventEnvelope(
  paths: RuntimeContinuityFilePaths,
  session: WorkerSession,
  eventSource: EventSource,
  input: AppendAgentEventInput,
): Promise<AgentEventEnvelope> {
  return withAgentEventAppendLock(paths.agentEvents, async () => {
    assertEventSourceScope(eventSource, session);
    const sequence = await nextSequence(paths.agentEvents);
    const envelope: AgentEventEnvelope = {
      version: "1.0",
      kind: "agent-event-envelope",
      id: stableId("agent-event", session.runId, String(sequence)),
      sequence,
      projectId: session.projectId,
      changeId: session.changeId,
      runId: session.runId,
      roleId: session.roleId,
      ...(session.taskRunId ? { taskRunId: session.taskRunId } : {}),
      ...(session.workflowRunId ? { workflowRunId: session.workflowRunId } : {}),
      ...(session.queueRunId ? { queueRunId: session.queueRunId } : {}),
      ...(session.schedulerContractId ? { schedulerContractId: session.schedulerContractId } : {}),
      adapter: session.adapter,
      workerSessionId: session.id,
      eventSourceId: eventSource.id,
      eventType: input.eventType,
      timestamp: input.timestamp ?? new Date().toISOString(),
      ...(input.summary ? { summary: input.summary } : {}),
      raw: input.raw,
    };
    assertAgentEventEnvelopeScope(envelope, session, eventSource);
    agentEventEnvelopeSchema.parse(envelope);
    await appendFile(paths.agentEvents, `${JSON.stringify(envelope)}\n`, "utf8");
    return envelope;
  });
}

export async function readAgentEventEnvelopes(paths: RuntimeContinuityFilePaths, session: WorkerSession, eventSource: EventSource): Promise<AgentEventEnvelope[]> {
  assertEventSourceScope(eventSource, session);
  let text: string;
  try {
    text = await readFile(paths.agentEvents, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const envelopes = text.split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => agentEventEnvelopeSchema.parse(JSON.parse(line)));
  for (const envelope of envelopes) assertAgentEventEnvelopeScope(envelope, session, eventSource);
  return envelopes;
}

export interface RuntimeContinuityFilePaths {
  workerSession: string;
  runtimeWorkspace: string;
  eventSource: string;
  agentEvents: string;
}

async function prepareJsonl(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, "", "utf8");
}

async function nextSequence(path: string): Promise<number> {
  try {
    const text = await readFile(path, "utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (const line of lines) {
      agentEventEnvelopeSchema.parse(JSON.parse(line));
    }
    return lines.length + 1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 1;
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new Error(`Invalid AgentEventEnvelope journal ${path}: ${(error as Error).message}`);
    }
    throw error;
  }
}

const agentEventAppendLocks = new Map<string, Promise<void>>();

async function withAgentEventAppendLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = agentEventAppendLocks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = previous.catch(() => undefined).then(() => new Promise<void>((resolve) => {
    release = resolve;
  }));
  agentEventAppendLocks.set(path, current);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (agentEventAppendLocks.get(path) === current) {
      agentEventAppendLocks.delete(path);
    }
  }
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${parts.map((part) => part.replace(/[^A-Za-z0-9_.-]/g, "-")).join("-")}`;
}
