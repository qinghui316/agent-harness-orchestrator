import { z } from "zod";

export const taskRunStatusSchema = z.enum(["queued", "claimed", "running", "evidence-ready", "blocked", "failed", "completed"]);
export const workerLeaseStatusSchema = z.enum(["claimed", "released", "expired", "lost"]);

export const taskRunSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  taskId: z.string(),
  roleId: z.string(),
  attempt: z.number(),
  status: taskRunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  runId: z.string().optional(),
  worktreeId: z.string().optional(),
  leaseId: z.string().optional(),
  blockedReason: z.string().optional(),
  failureReason: z.string().optional(),
});

export const workerLeaseSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  taskRunId: z.string(),
  taskId: z.string(),
  roleId: z.string(),
  workerId: z.string(),
  status: workerLeaseStatusSchema,
  claimedAt: z.string(),
  updatedAt: z.string(),
  releasedAt: z.string().nullable(),
  expiresAt: z.string(),
});
