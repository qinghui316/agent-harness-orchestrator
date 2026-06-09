import { z } from "zod";

export const taskQueueRunStatusSchema = z.enum(["queued", "running", "paused", "blocked", "failed", "completed"]);
export const taskQueueItemStatusSchema = z.enum(["queued", "running", "blocked", "failed", "completed", "skipped"]);

export const taskQueueRunSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  status: taskQueueRunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  currentTaskId: z.string().optional(),
  workflowRunId: z.string().optional(),
  taskQueueProposalId: z.string().optional(),
  workflowGraphPlanId: z.string().optional(),
  decompositionPlanId: z.string().optional(),
  readinessManifestId: z.string().optional(),
  totalCount: z.number(),
  completedCount: z.number(),
  blockedReason: z.string().optional(),
  failureReason: z.string().optional(),
  pausedReason: z.string().optional(),
});

export const taskQueueItemSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  queueRunId: z.string(),
  taskId: z.string(),
  order: z.number(),
  status: taskQueueItemStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  taskRunId: z.string().optional(),
  workflowRunId: z.string().optional(),
  taskQueueProposalId: z.string().optional(),
  workflowGraphPlanId: z.string().optional(),
  decompositionPlanId: z.string().optional(),
  readinessManifestId: z.string().optional(),
  blockedReason: z.string().optional(),
  failureReason: z.string().optional(),
});
