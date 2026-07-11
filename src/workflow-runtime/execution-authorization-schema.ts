import { z } from "zod";
import type { LocalExecutionAuthorization, TransitionExecution } from "../types/index.js";

const nonEmpty = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const harnessExecutionModeSchema = z.enum(["stepwise", "scoped-auto"]);

export const localExecutionAuthorizationSchema: z.ZodType<LocalExecutionAuthorization> = z.object({
  version: z.literal("1.0"),
  id: nonEmpty,
  projectId: nonEmpty.nullable(),
  changeId: nonEmpty,
  conversationId: nonEmpty,
  providerThreadId: nonEmpty,
  goalIdentityHash: hash,
  mode: harnessExecutionModeSchema,
  status: z.enum(["active", "revoked"]),
  epoch: z.number().int().nonnegative(),
  acceptedPlanId: nonEmpty,
  acceptedPlanHash: hash,
  graphId: nonEmpty,
  graphHash: hash,
  artifactManifestHash: hash,
  sourceHead: nonEmpty,
  sourceStateHash: hash,
  permissionProfileHash: hash,
  providerScopeHash: hash,
  policyHash: hash,
  targets: z.array(z.object({ transition: nonEmpty, targetId: nonEmpty, manifestHash: hash })).min(1),
  budget: z.object({
    maxCompletedOperations: z.number().int().positive(),
    maxReworks: z.number().int().nonnegative(),
    maxChangedFiles: z.number().int().positive(),
    maxChangedBytes: z.number().int().positive(),
  }).strict(),
  userDecision: z.object({ decisionId: nonEmpty, actorId: nonEmpty, decidedAt: z.string().datetime() }),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  revocationReason: z.string().min(1).nullable(),
}).strict();

const receiptSchema = z.object({
  version: z.literal("1.0"),
  operationId: nonEmpty,
  outcome: z.enum(["completed", "retryable-failed", "terminal-failed"]),
  consumesAuthorization: z.boolean(),
  recordedAt: z.string().datetime(),
  evidenceRefs: z.array(nonEmpty),
  error: z.string().min(1).nullable(),
}).strict();

export const transitionExecutionSchema: z.ZodType<TransitionExecution> = z.object({
  version: z.literal("1.0"),
  operationId: nonEmpty,
  authorizationId: nonEmpty,
  authorizationEpoch: z.number().int().nonnegative(),
  transition: nonEmpty,
  targetId: nonEmpty,
  manifestHash: hash,
  status: z.enum(["claimed", "executing", "completed", "retryable-failed", "terminal-failed"]),
  claimToken: nonEmpty,
  fencingToken: z.number().int().positive(),
  claimedBy: nonEmpty,
  claimedAt: z.string().datetime(),
  claimExpiresAt: z.string().datetime(),
  executionStartedAt: z.string().datetime().nullable(),
  commitPointReservedAt: z.string().datetime().nullable().optional(),
  terminalAt: z.string().datetime().nullable(),
  receipt: receiptSchema.nullable(),
}).strict().superRefine((value, context) => {
  const terminal = value.status === "completed" || value.status === "retryable-failed" || value.status === "terminal-failed";
  if (terminal !== Boolean(value.receipt) || terminal !== Boolean(value.terminalAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Terminal execution state and receipt must agree." });
  }
  if (value.receipt && value.receipt.operationId !== value.operationId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Receipt operation id does not match execution." });
  }
});
