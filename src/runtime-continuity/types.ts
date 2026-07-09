import type { WorkerPermissionProfile } from "../types/index.js";

export type RuntimeContinuityAdapter = "codex-app-server" | "codex-exec" | "validation-command" | "audit-codex-readonly";
export type WorkerSessionStatus = "initialized" | "running" | "completed" | "interrupted" | "failed";
export type RuntimeWorkspaceKind = "local-worktree" | "source-root";
export type EventSourceStatus = "initialized" | "running" | "completed" | "interrupted" | "failed";

export interface RuntimeContinuityScope {
  projectId: string;
  changeId: string;
  runId: string;
  roleId: string;
  taskRunId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  schedulerContractId?: string;
}

export interface WorkerSession extends RuntimeContinuityScope {
  version: "1.0";
  kind: "worker-session";
  id: string;
  adapter: RuntimeContinuityAdapter;
  runtimeWorkspaceId: string;
  eventSourceId: string;
  worktreeId?: string;
  permissionProfile: WorkerPermissionProfile;
  sandboxPolicy: "read-only" | "workspace-write";
  status: WorkerSessionStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface RuntimeWorkspace {
  version: "1.0";
  kind: "runtime-workspace";
  id: string;
  projectId: string;
  changeId: string;
  runId: string;
  roleId: string;
  workspaceKind: RuntimeWorkspaceKind;
  cwd: string;
  checkoutPath?: string;
  worktreeId?: string;
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
  deniedPaths: string[];
  sandboxPolicy: "read-only" | "workspace-write";
  createdAt: string;
  updatedAt: string;
}

export interface EventSource extends RuntimeContinuityScope {
  version: "1.0";
  kind: "event-source";
  id: string;
  adapter: RuntimeContinuityAdapter;
  workerSessionId: string;
  runtimeWorkspaceId: string;
  rawArtifactRefs: string[];
  status: EventSourceStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface AgentEventEnvelope extends RuntimeContinuityScope {
  version: "1.0";
  kind: "agent-event-envelope";
  id: string;
  sequence: number;
  adapter: RuntimeContinuityAdapter;
  workerSessionId: string;
  eventSourceId: string;
  eventType: string;
  timestamp: string;
  summary?: string;
  raw: Record<string, unknown>;
}

export interface RuntimeContinuityArtifacts {
  session: WorkerSession;
  workspace: RuntimeWorkspace;
  eventSource: EventSource;
}
