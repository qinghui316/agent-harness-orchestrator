import { z } from "zod";
import type { AgentEventEnvelope, EventSource, RuntimeWorkspace, WorkerSession } from "./types.js";

const permissionProfileSchema = z.object({
  version: z.literal("1.0"),
  roleId: z.string(),
  allowedReadRoots: z.array(z.string()),
  allowedWriteRoots: z.array(z.string()),
  deniedPaths: z.array(z.string()),
  allowedCommands: z.array(z.string()),
  sandboxPolicy: z.enum(["read-only", "workspace-write"]),
  mayDelegate: z.boolean(),
});

const scopedFields = {
  projectId: z.string(),
  changeId: z.string(),
  runId: z.string(),
  roleId: z.string(),
  taskRunId: z.string().optional(),
  workflowRunId: z.string().optional(),
  queueRunId: z.string().optional(),
  schedulerContractId: z.string().optional(),
};

export const workerSessionSchema: z.ZodType<WorkerSession> = z.object({
  version: z.literal("1.0"),
  kind: z.literal("worker-session"),
  id: z.string(),
  ...scopedFields,
  adapter: z.enum(["provider-turn", "provider-code", "provider-readonly", "validation-command"]),
  runtimeWorkspaceId: z.string(),
  eventSourceId: z.string(),
  worktreeId: z.string().optional(),
  permissionProfile: permissionProfileSchema,
  sandboxPolicy: z.enum(["read-only", "workspace-write"]),
  status: z.enum(["initialized", "running", "completed", "interrupted", "failed"]),
  startedAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
});

export const runtimeWorkspaceSchema: z.ZodType<RuntimeWorkspace> = z.object({
  version: z.literal("1.0"),
  kind: z.literal("runtime-workspace"),
  id: z.string(),
  projectId: z.string(),
  changeId: z.string(),
  runId: z.string(),
  roleId: z.string(),
  workspaceKind: z.enum(["local-worktree", "source-root"]),
  cwd: z.string(),
  checkoutPath: z.string().optional(),
  worktreeId: z.string().optional(),
  allowedReadRoots: z.array(z.string()),
  allowedWriteRoots: z.array(z.string()),
  deniedPaths: z.array(z.string()),
  sandboxPolicy: z.enum(["read-only", "workspace-write"]),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((workspace, ctx) => {
  if (workspace.workspaceKind === "local-worktree") {
    if (!workspace.checkoutPath) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["checkoutPath"], message: "local-worktree workspace requires checkoutPath." });
    }
    if (!workspace.worktreeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["worktreeId"], message: "local-worktree workspace requires worktreeId." });
    }
    return;
  }
  if (workspace.checkoutPath) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["checkoutPath"], message: "source-root workspace must not carry checkoutPath." });
  }
  if (workspace.worktreeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["worktreeId"], message: "source-root workspace must not carry worktreeId." });
  }
});

export const eventSourceSchema: z.ZodType<EventSource> = z.object({
  version: z.literal("1.0"),
  kind: z.literal("event-source"),
  id: z.string(),
  ...scopedFields,
  adapter: z.enum(["provider-turn", "provider-code", "provider-readonly", "validation-command"]),
  workerSessionId: z.string(),
  runtimeWorkspaceId: z.string(),
  rawArtifactRefs: z.array(z.string()),
  status: z.enum(["initialized", "running", "completed", "interrupted", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
});

export const agentEventEnvelopeSchema: z.ZodType<AgentEventEnvelope> = z.object({
  version: z.literal("1.0"),
  kind: z.literal("agent-event-envelope"),
  id: z.string(),
  sequence: z.number().int().positive(),
  ...scopedFields,
  adapter: z.enum(["provider-turn", "provider-code", "provider-readonly", "validation-command"]),
  workerSessionId: z.string(),
  eventSourceId: z.string(),
  eventType: z.string(),
  timestamp: z.string(),
  summary: z.string().optional(),
  raw: z.record(z.unknown()),
});
