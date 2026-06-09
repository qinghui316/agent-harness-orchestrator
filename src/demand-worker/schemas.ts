import { z } from "zod";

export const demandWorkerStatusSchema = z.enum(["queued", "claimed", "running", "result-ready", "needs-user-input", "failed", "completed", "released"]);
export const demandWorkerAttemptStatusSchema = z.enum(["claimed", "running", "completed", "needs-user-input", "failed", "cancelled"]);
export const mainOrchestratorDecisionActionSchema = z.enum(["planning", "enqueue", "coding", "validation", "audit", "bounded-rework", "result-review", "needs-user-input", "done"]);

export const demandWorkerSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  status: demandWorkerStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  activeAttemptId: z.string().optional(),
  resultSummary: z.string().optional(),
  failureReason: z.string().optional(),
  waitingReason: z.string().optional(),
});

export const demandWorkerAttemptSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  workerId: z.string(),
  attempt: z.number(),
  status: demandWorkerAttemptStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  agentTaskIds: z.array(z.string()),
  resultStatus: z.string().optional(),
  resultSummary: z.string().optional(),
  failureReason: z.string().optional(),
});

export const decisionSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  workerId: z.string().optional(),
  attemptId: z.string().optional(),
  action: mainOrchestratorDecisionActionSchema,
  summary: z.string(),
  reason: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});
