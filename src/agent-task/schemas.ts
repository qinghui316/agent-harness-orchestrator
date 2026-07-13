import { z } from "zod";
import type { DemandMemoryCloseout } from "../types/index.js";

export const taskStatusSchema = z.enum(["queued", "claimed", "running", "completed", "blocked", "failed", "needs-user-input", "cancelled"]);
const failureDispositionSchema = z.enum(["retryable", "terminal"]);
const leaseSchema = z.object({
  owner: z.string().min(1),
  claimToken: z.string().min(1),
  fencingToken: z.number().int().positive(),
  expiresAt: z.string(),
  heartbeatAt: z.string(),
});

export const taskSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  conversationId: z.string(),
  changeId: z.string(),
  roleId: z.string(),
  kind: z.enum(["foreground", "background"]),
  status: taskStatusSchema,
  idempotencyKey: z.string().min(1).optional(),
  attempt: z.number().int().nonnegative().optional(),
  maxAttempts: z.number().int().positive().optional(),
  lease: leaseSchema.nullable().optional(),
  checkpoint: z.object({
    sequence: z.number().int().positive(),
    summary: z.string(),
    artifactRefs: z.array(z.string()),
    createdAt: z.string(),
  }).nullable().optional(),
  failureDisposition: failureDispositionSchema.optional(),
  inputArtifacts: z.array(z.string()),
  outputArtifacts: z.array(z.string()),
  parentTaskId: z.string().optional(),
  createdBy: z.enum(["main-agent-policy", "maintenance-policy", "system"]),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const resultSchema = z.object({
  version: z.literal("1.0"),
  taskId: z.string(),
  roleId: z.string(),
  status: taskStatusSchema,
  attempt: z.number().int().nonnegative().optional(),
  claimToken: z.string().optional(),
  fencingToken: z.number().int().positive().optional(),
  failureDisposition: failureDispositionSchema.optional(),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  policyAuditRefs: z.array(z.string()).optional(),
  boundaryAuditRefs: z.array(z.string()).optional(),
  boundaryViolations: z.array(z.object({
    kind: z.enum(["source-root-modified", "denied-path", "outside-write-root", "cross-demand-artifact", "readonly-role-write", "dirty-state"]),
    path: z.string().optional(),
    reason: z.string(),
  })).optional(),
  nextRecommendation: z.string().optional(),
  failureClassification: z.string().optional(),
  requiresUserInputReason: z.string().optional(),
  createdAt: z.string(),
});

export const ledgerSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string().optional(),
  eventType: z.enum(["archive", "apply", "remote-landing", "failure", "user-feedback", "doc-drift", "reference-drift", "harness-evolution", "change-closeout"]),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const lessonCandidateSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["candidate", "superseded"]),
  supersededBy: z.string().optional(),
});

export const docsDriftCandidateSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  document: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["candidate", "superseded"]),
  supersededBy: z.string().optional(),
});

export const closeoutSchema: z.ZodType<DemandMemoryCloseout> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  title: z.string(),
  terminalKind: z.enum(["archived", "applied", "remote-handoff", "merged"]),
  goal: z.string(),
  finalResult: z.string(),
  userDecision: z.string(),
  changedFiles: z.array(z.string()),
  affectedModules: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  reusableLessonCandidates: z.array(lessonCandidateSchema),
  docsDriftCandidates: z.array(docsDriftCandidateSchema),
  memoryBoundaryNotes: z.array(z.string()),
  createdAt: z.string(),
});
