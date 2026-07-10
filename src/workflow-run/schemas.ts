import { z } from "zod";
import type { DefaultCodeChangeWorkflowRecoveryKey, WorkflowRun } from "../types/index.js";

export const workflowRunStatusSchema = z.enum(["created", "running", "paused", "blocked", "failed", "completed"]);

export const defaultCodeChangeWorkflowRecoveryKeySchema: z.ZodType<DefaultCodeChangeWorkflowRecoveryKey> = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  templateId: z.literal("default-code-change-workflow"),
  workflowGraphPlanId: z.string().optional(),
  acceptedArtifactHashes: z.record(z.string()).optional(),
  sourceHash: z.string().optional(),
  policyHash: z.string().optional(),
  capabilityHash: z.string().optional(),
  createdAt: z.string(),
});

export const workflowGraphRecoveryKeySchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  workflowGraphPlanId: z.string(),
  acceptedArtifactHashes: z.record(z.string()),
  workflowGraphPlanHash: z.string(),
  sourceHash: z.string(),
  policyHash: z.string(),
  capabilityHash: z.string(),
  createdAt: z.string(),
});

const taskQueueWorkflowRunSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: workflowRunStatusSchema,
  source: z.literal("workflow-graph"),
  workflowGraphPlanId: z.string().optional(),
  queueRunId: z.string().optional(),
  currentTaskId: z.string().optional(),
  items: z.array(z.object({
    taskId: z.string(),
    status: z.enum(["queued", "running", "blocked", "failed", "completed", "skipped"]),
    taskRunId: z.string().optional(),
    order: z.number(),
    updatedAt: z.string().optional(),
  })),
  recoveryKey: workflowGraphRecoveryKeySchema,
  statusReason: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

const defaultCodeChangeWorkflowRunSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: workflowRunStatusSchema,
  source: z.literal("default-code-change-workflow"),
  templateId: z.literal("default-code-change-workflow"),
  currentNodeId: z.enum(["coder", "validation", "audit", "rework-coder"]).optional(),
  nodes: z.array(z.object({
    nodeId: z.enum(["coder", "validation", "audit", "rework-coder"]),
    status: z.enum(["queued", "running", "blocked", "failed", "completed", "skipped"]),
    roleId: z.enum(["coder-agent", "validator", "auditor-agent", "rework-coder"]).optional(),
    attempt: z.number(),
    runId: z.string().optional(),
    worktreeId: z.string().optional(),
    validationId: z.string().optional(),
    auditId: z.string().optional(),
    agentTaskId: z.string().optional(),
    artifactRefs: z.array(z.string()),
    failureClassification: z.enum(["boundary-violation", "code-failure", "validation-failure", "audit-failure"]).optional(),
    stoppedAt: z.enum(["boundary", "code", "validation", "audit"]).optional(),
    reason: z.string().optional(),
    updatedAt: z.string(),
  })),
  maxReworkAttempts: z.number(),
  reworkAttempts: z.number(),
  recoveryKey: defaultCodeChangeWorkflowRecoveryKeySchema,
  statusReason: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const workflowRunSchema: z.ZodType<WorkflowRun> = z.union([
  taskQueueWorkflowRunSchema,
  defaultCodeChangeWorkflowRunSchema,
]);
