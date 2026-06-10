import type { AgentEventEnvelope, EventSource, RuntimeContinuityScope, RuntimeWorkspace, WorkerSession } from "./types.js";

export function assertWorkerSessionScope(session: WorkerSession, expected: RuntimeContinuityScope): void {
  assertScope("WorkerSession", session, expected);
}

export function assertEventSourceScope(eventSource: EventSource, session: WorkerSession): void {
  assertScope("EventSource", eventSource, session);
  if (eventSource.workerSessionId !== session.id) {
    throw new Error(`EventSource ${eventSource.id} does not belong to WorkerSession ${session.id}.`);
  }
  if (eventSource.runtimeWorkspaceId !== session.runtimeWorkspaceId) {
    throw new Error(`EventSource ${eventSource.id} does not match WorkerSession runtime workspace.`);
  }
}

export function assertRuntimeWorkspaceScope(workspace: RuntimeWorkspace, session: WorkerSession): void {
  const expected = {
    projectId: session.projectId,
    changeId: session.changeId,
    runId: session.runId,
    roleId: session.roleId,
  };
  assertScope("RuntimeWorkspace", workspace, expected);
  if (workspace.id !== session.runtimeWorkspaceId) {
    throw new Error(`RuntimeWorkspace ${workspace.id} does not match WorkerSession ${session.id}.`);
  }
  if (workspace.workspaceKind === "local-worktree" && (!workspace.worktreeId || !workspace.checkoutPath)) {
    throw new Error(`RuntimeWorkspace ${workspace.id} is missing local worktree scope.`);
  }
  if (workspace.workspaceKind === "source-root" && (workspace.worktreeId || workspace.checkoutPath)) {
    throw new Error(`RuntimeWorkspace ${workspace.id} source-root scope must not include worktree fields.`);
  }
  if (session.worktreeId && workspace.worktreeId !== session.worktreeId) {
    throw new Error(`RuntimeWorkspace ${workspace.id} does not match WorkerSession worktree.`);
  }
  if (!session.worktreeId && workspace.worktreeId) {
    throw new Error(`RuntimeWorkspace ${workspace.id} carries a worktree scope missing from WorkerSession.`);
  }
}

export function assertAgentEventEnvelopeScope(envelope: AgentEventEnvelope, session: WorkerSession, eventSource: EventSource): void {
  assertScope("AgentEventEnvelope", envelope, session);
  if (envelope.workerSessionId !== session.id) {
    throw new Error(`AgentEventEnvelope ${envelope.id} does not belong to WorkerSession ${session.id}.`);
  }
  if (envelope.eventSourceId !== eventSource.id) {
    throw new Error(`AgentEventEnvelope ${envelope.id} does not belong to EventSource ${eventSource.id}.`);
  }
  if (envelope.adapter !== session.adapter || envelope.adapter !== eventSource.adapter) {
    throw new Error(`AgentEventEnvelope ${envelope.id} adapter does not match its session and event source.`);
  }
}

function assertScope(label: string, actual: RuntimeContinuityScope, expected: RuntimeContinuityScope): void {
  const keys: Array<keyof RuntimeContinuityScope> = [
    "projectId",
    "changeId",
    "runId",
    "roleId",
    "taskRunId",
    "workflowRunId",
    "queueRunId",
    "schedulerContractId",
  ];
  for (const key of keys) {
    if (expected[key] !== undefined && actual[key] !== expected[key]) {
      throw new Error(`${label} scope mismatch for ${key}: expected ${expected[key]}, got ${actual[key] ?? "missing"}.`);
    }
  }
}
