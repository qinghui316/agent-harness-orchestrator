import { z } from "zod";
import type { WorkflowRecoveryKey, WorkflowRun } from "../types/index.js";

export const workflowRunStatusSchema = z.enum(["created", "running", "paused", "blocked", "failed", "completed"]);

export const readinessSchema = z.object({
  id: z.string(),
  changeId: z.string(),
  decompositionPlanId: z.string(),
  status: z.string(),
  nextAllowedAction: z.string(),
  artifact: z.string(),
  markdownArtifact: z.string(),
});

export const workflowRecoveryKeySchema: z.ZodType<WorkflowRecoveryKey> = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  decompositionPlanId: z.string(),
  readinessManifestId: z.string(),
  taskQueueProposalId: z.string(),
  workflowGraphPlanId: z.string().optional(),
  acceptedArtifactHashes: z.record(z.string()),
  proposalHash: z.string(),
  readinessHash: z.string(),
  workflowGraphPlanHash: z.string().optional(),
  sourceHash: z.string(),
  policyHash: z.string(),
  capabilityHash: z.string(),
  createdAt: z.string(),
});

export const workflowRunSchema: z.ZodType<WorkflowRun> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: workflowRunStatusSchema,
  source: z.literal("taskqueue-proposal"),
  taskQueueProposalId: z.string(),
  workflowGraphPlanId: z.string().optional(),
  readinessManifestId: z.string(),
  decompositionPlanId: z.string(),
  queueRunId: z.string().optional(),
  currentTaskId: z.string().optional(),
  items: z.array(z.object({
    taskId: z.string(),
    status: z.enum(["queued", "running", "blocked", "failed", "completed", "skipped"]),
    taskRunId: z.string().optional(),
    order: z.number(),
    updatedAt: z.string().optional(),
  })),
  recoveryKey: workflowRecoveryKeySchema,
  statusReason: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
