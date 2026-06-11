import type { ToolPolicyDecision } from "../types/index.js";
import { appendAgentEventEnvelope, type RuntimeContinuityFilePaths } from "./repository.js";
import type { AgentEventEnvelope, RuntimeContinuityArtifacts } from "./types.js";

export type RuntimePermissionEvidenceEventType =
  | "permission.profile.attached"
  | "permission.decision.recorded"
  | "external-execution.requested"
  | "external-execution.completed"
  | "external-execution.failed";

export interface ExternalExecutionRequestedInput {
  requestId?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  adapter?: string;
  summary?: string;
  raw?: Record<string, unknown>;
}

export interface ExternalExecutionFinishedInput {
  requestId?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | string | null;
  status?: string;
  error?: string;
  summary?: string;
  raw?: Record<string, unknown>;
}

const CANONICAL_SCOPE_FIELDS = new Set([
  "projectId",
  "changeId",
  "runId",
  "roleId",
  "worktreeId",
  "taskRunId",
  "workflowRunId",
  "queueRunId",
  "schedulerContractId",
  "workerSessionId",
  "eventSourceId",
]);

export async function appendPermissionProfileAttached(
  paths: RuntimeContinuityFilePaths,
  continuity: RuntimeContinuityArtifacts,
  raw: Record<string, unknown> = {},
): Promise<AgentEventEnvelope> {
  return appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType: "permission.profile.attached",
    summary: `Permission profile attached for ${continuity.session.roleId}.`,
    raw: {
      ...stripCanonicalScope(raw),
      permissionProfile: continuity.session.permissionProfile,
      sandboxPolicy: continuity.session.sandboxPolicy,
    },
  });
}

export async function appendPermissionDecisionRecorded(
  paths: RuntimeContinuityFilePaths,
  continuity: RuntimeContinuityArtifacts,
  decision: ToolPolicyDecision,
  raw: Record<string, unknown> = {},
): Promise<AgentEventEnvelope> {
  return appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType: "permission.decision.recorded",
    summary: `${decision.actionType}: ${decision.status}`,
    raw: {
      ...stripCanonicalScope(raw),
      decision,
    },
  });
}

export async function appendExternalExecutionRequested(
  paths: RuntimeContinuityFilePaths,
  continuity: RuntimeContinuityArtifacts,
  input: ExternalExecutionRequestedInput,
): Promise<AgentEventEnvelope> {
  return appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType: "external-execution.requested",
    summary: input.summary ?? summarizeCommand("External execution requested", input.command, input.args),
    raw: {
      ...stripCanonicalScope(input.raw),
      requestId: input.requestId,
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      adapter: input.adapter ?? continuity.eventSource.adapter,
    },
  });
}

export async function appendExternalExecutionCompleted(
  paths: RuntimeContinuityFilePaths,
  continuity: RuntimeContinuityArtifacts,
  input: ExternalExecutionFinishedInput = {},
): Promise<AgentEventEnvelope> {
  return appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType: "external-execution.completed",
    summary: input.summary ?? "External execution completed.",
    raw: {
      ...stripCanonicalScope(input.raw),
      requestId: input.requestId,
      exitCode: input.exitCode,
      signal: input.signal,
      status: input.status ?? "completed",
    },
  });
}

export async function appendExternalExecutionFailed(
  paths: RuntimeContinuityFilePaths,
  continuity: RuntimeContinuityArtifacts,
  input: ExternalExecutionFinishedInput = {},
): Promise<AgentEventEnvelope> {
  return appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType: "external-execution.failed",
    summary: input.summary ?? input.error ?? "External execution failed.",
    raw: {
      ...stripCanonicalScope(input.raw),
      requestId: input.requestId,
      exitCode: input.exitCode,
      signal: input.signal,
      status: input.status ?? "failed",
      error: input.error,
    },
  });
}

function stripCanonicalScope(raw: Record<string, unknown> = {}): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!CANONICAL_SCOPE_FIELDS.has(key)) stripped[key] = value;
  }
  return stripped;
}

function summarizeCommand(prefix: string, command: string | undefined, args: string[] | undefined): string {
  if (!command) return `${prefix}.`;
  const suffix = args?.length ? ` ${args.join(" ")}` : "";
  return `${prefix}: ${command}${suffix}`;
}
