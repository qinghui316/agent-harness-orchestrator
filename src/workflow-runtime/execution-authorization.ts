import { createHash, randomUUID } from "node:crypto";
import type {
  ExecutionAuthorizationSnapshot,
  ExecutionAuthorizationTarget,
  LocalExecutionAuthorization,
  ResolvedMemory,
  TransitionExecution,
  TransitionExecutionReceipt,
} from "../types/index.js";
import {
  projectExecutionAuthorizationState,
  readTransitionExecution,
  runExecutionAuthorizationTransaction,
} from "./execution-authorization-repository.js";

export * from "./execution-authorization-schema.js";
export * from "./execution-authorization-repository.js";

export const SCOPED_AUTO_EXECUTION_ENABLED = false;
export const DEFAULT_TRANSITION_CLAIM_TTL_MS = 60_000;

type IssueAuthorizationInput = Omit<LocalExecutionAuthorization, "version" | "id" | "status" | "epoch" | "revokedAt" | "revocationReason">;

export async function issueLocalExecutionAuthorization(
  memory: ResolvedMemory,
  input: IssueAuthorizationInput,
): Promise<LocalExecutionAuthorization> {
  const id = deterministicAuthorizationId(input);
  const authorization: LocalExecutionAuthorization = {
    ...input,
    version: "1.0",
    id,
    status: "active",
    epoch: 0,
    revokedAt: null,
    revocationReason: null,
  };
  const result = runExecutionAuthorizationTransaction(memory, (transaction) => {
    const existing = transaction.getAuthorization(id);
    if (existing?.status === "revoked") throw new Error(`Execution authorization was revoked and cannot be reissued: ${id}.`);
    if (existing) return existing;
    transaction.putAuthorization(authorization);
    return authorization;
  });
  await projectExecutionAuthorizationState(memory, result);
  return result;
}

export async function revokeLocalExecutionAuthorization(
  memory: ResolvedMemory,
  authorizationId: string,
  reason: string,
  now = new Date(),
): Promise<LocalExecutionAuthorization> {
  if (!reason.trim()) throw new Error("Authorization revocation reason is required.");
  const result = runExecutionAuthorizationTransaction(memory, (transaction) => {
    const current = transaction.getAuthorization(authorizationId);
    if (!current) throw new Error(`Execution authorization not found: ${authorizationId}.`);
    if (current.status === "revoked" && current.revocationReason === reason) return current;
    const revoked: LocalExecutionAuthorization = {
      ...current,
      status: "revoked",
      epoch: current.epoch + 1,
      revokedAt: now.toISOString(),
      revocationReason: reason,
    };
    transaction.putAuthorization(revoked);
    return revoked;
  });
  await projectExecutionAuthorizationState(memory, result);
  return result;
}

export async function reactivateLocalExecutionAuthorizationAfterRollback(
  memory: ResolvedMemory,
  authorizationId: string,
  expected: { epoch: number; reason: string },
): Promise<LocalExecutionAuthorization> {
  if (!expected.reason.trim()) throw new Error("Authorization reactivation reason is required.");
  const result = runExecutionAuthorizationTransaction(memory, (transaction) => {
    const current = transaction.getAuthorization(authorizationId);
    if (!current) throw new Error(`Execution authorization not found: ${authorizationId}.`);
    if (current.status === "active") return current;
    if (current.epoch !== expected.epoch || current.revocationReason !== expected.reason) {
      throw new Error(`Execution authorization was revoked by another decision and cannot be reactivated: ${authorizationId}.`);
    }
    const restored: LocalExecutionAuthorization = {
      ...current,
      status: "active",
      epoch: current.epoch + 1,
      revokedAt: null,
      revocationReason: null,
    };
    transaction.putAuthorization(restored);
    return restored;
  });
  await projectExecutionAuthorizationState(memory, result);
  return result;
}

export function deterministicTransitionOperationId(input: {
  authorizationId: string;
  authorizationEpoch: number;
  transition: string;
  targetId: string;
  manifestHash: string;
}): string {
  return `op-${sha256(stableJson({
    authorizationId: input.authorizationId,
    authorizationEpoch: input.authorizationEpoch,
    transition: input.transition,
    targetId: input.targetId,
    manifestHash: input.manifestHash,
  }))}`;
}

export async function claimTransitionExecution(memory: ResolvedMemory, input: {
  authorizationId: string;
  authorizationEpoch: number;
  transition: string;
  targetId: string;
  manifestHash: string;
  snapshot: ExecutionAuthorizationSnapshot;
  claimedBy: string;
  claimTtlMs?: number;
  now?: Date;
}): Promise<TransitionExecution> {
  const now = input.now ?? new Date();
  const operationId = deterministicTransitionOperationId(input);
  const claimTtlMs = input.claimTtlMs ?? DEFAULT_TRANSITION_CLAIM_TTL_MS;
  if (!Number.isSafeInteger(claimTtlMs) || claimTtlMs <= 0) throw new Error("Transition claim TTL must be a positive integer.");
  const execution = runExecutionAuthorizationTransaction(memory, (transaction) => {
    const authorization = requireAuthorizationCurrent(transaction.getAuthorization(input.authorizationId), input.authorizationId, input.authorizationEpoch, input.snapshot, now);
    assertAuthorizedTarget(authorization.targets, input);
    assertBudgetAvailable(transaction.countCompleted(authorization.id), authorization);
    const existing = transaction.getExecution(operationId);
    if (existing && !canTakeOver(existing, now)) {
      throw new Error(`Transition operation is already ${existing.status}: ${operationId}.`);
    }
    const claimed: TransitionExecution = {
      version: "1.0",
      operationId,
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      transition: input.transition,
      targetId: input.targetId,
      manifestHash: input.manifestHash,
      status: "claimed",
      claimToken: randomUUID(),
      fencingToken: (existing?.fencingToken ?? 0) + 1,
      claimedBy: input.claimedBy,
      claimedAt: now.toISOString(),
      claimExpiresAt: new Date(now.getTime() + claimTtlMs).toISOString(),
      executionStartedAt: null,
      terminalAt: null,
      receipt: null,
    };
    transaction.putExecution(claimed);
    return claimed;
  });
  await projectExecutionAuthorizationState(memory, null, execution);
  return execution;
}

export async function markTransitionExecutionStarted(
  memory: ResolvedMemory,
  operationId: string,
  claimToken: string,
  fencingToken: number,
  now = new Date(),
): Promise<TransitionExecution> {
  const result = runExecutionAuthorizationTransaction(memory, (transaction) => {
    const current = requireClaim(transaction.getExecution(operationId), operationId, claimToken, fencingToken, now);
    if (current.status === "executing") return current;
    if (current.status !== "claimed") throw new Error(`Transition operation cannot start from ${current.status}: ${operationId}.`);
    requireAuthorizationEpochActive(transaction.getAuthorization(current.authorizationId), current, now);
    const executing: TransitionExecution = { ...current, status: "executing", executionStartedAt: now.toISOString() };
    transaction.putExecution(executing);
    return executing;
  });
  await projectExecutionAuthorizationState(memory, null, result);
  return result;
}

export async function heartbeatTransitionExecution(
  memory: ResolvedMemory,
  operationId: string,
  claimToken: string,
  fencingToken: number,
  claimTtlMs = DEFAULT_TRANSITION_CLAIM_TTL_MS,
  now = new Date(),
): Promise<TransitionExecution> {
  if (!Number.isSafeInteger(claimTtlMs) || claimTtlMs <= 0) throw new Error("Transition claim TTL must be a positive integer.");
  const result = runExecutionAuthorizationTransaction(memory, (transaction) => {
    const current = requireClaim(transaction.getExecution(operationId), operationId, claimToken, fencingToken, now);
    if (current.status !== "claimed" && current.status !== "executing") {
      throw new Error(`Transition operation cannot heartbeat from ${current.status}: ${operationId}.`);
    }
    requireAuthorizationEpochActive(transaction.getAuthorization(current.authorizationId), current, now);
    const renewed: TransitionExecution = {
      ...current,
      claimExpiresAt: new Date(now.getTime() + claimTtlMs).toISOString(),
    };
    transaction.putExecution(renewed);
    return renewed;
  });
  await projectExecutionAuthorizationState(memory, null, result);
  return result;
}

export async function recordTransitionExecutionTerminal(memory: ResolvedMemory, input: {
  operationId: string;
  claimToken: string;
  fencingToken: number;
  outcome: "completed" | "retryable-failed" | "terminal-failed";
  evidenceRefs?: string[];
  error?: string;
  now?: Date;
}): Promise<TransitionExecution> {
  const now = input.now ?? new Date();
  const result = runExecutionAuthorizationTransaction(memory, (transaction) => {
    const current = requireClaim(transaction.getExecution(input.operationId), input.operationId, input.claimToken, input.fencingToken, now);
    if (current.status === "completed" || current.status === "retryable-failed" || current.status === "terminal-failed") {
      throw new Error(`Transition operation already has a terminal receipt: ${input.operationId}.`);
    }
    const authorization = requireAuthorizationEpochActive(transaction.getAuthorization(current.authorizationId), current, now);
    const outcome = input.outcome;
    if (outcome === "completed") assertBudgetAvailable(transaction.countCompleted(authorization.id), authorization);
    const receipt: TransitionExecutionReceipt = {
      version: "1.0",
      operationId: current.operationId,
      outcome,
      consumesAuthorization: outcome === "completed",
      recordedAt: now.toISOString(),
      evidenceRefs: input.evidenceRefs ?? [],
      error: outcome !== "completed" ? (input.error?.trim() || "Transition execution failed.") : null,
    };
    const terminal: TransitionExecution = { ...current, status: outcome, terminalAt: now.toISOString(), receipt };
    transaction.putExecution(terminal);
    return terminal;
  });
  await projectExecutionAuthorizationState(memory, null, result);
  return result;
}

export async function recoverTransitionExecution(
  memory: ResolvedMemory,
  operationId: string,
): Promise<TransitionExecution> {
  return readTransitionExecution(memory, operationId);
}

export function assertScopedAutoExecutionEnabled(): void {
  if (!SCOPED_AUTO_EXECUTION_ENABLED) throw new Error("Scoped automatic execution is feature-disabled.");
}

function requireClaim(execution: TransitionExecution | null, operationId: string, claimToken: string, fencingToken: number, now: Date) {
  if (!execution) throw new Error(`Transition execution not found: ${operationId}.`);
  if (execution.claimToken !== claimToken) throw new Error(`Invalid transition claim token: ${operationId}.`);
  if (execution.fencingToken !== fencingToken) throw new Error(`Stale transition fencing token: ${operationId}.`);
  if (Date.parse(execution.claimExpiresAt) <= now.getTime()) throw new Error(`Transition claim is expired: ${operationId}.`);
  return execution;
}

function requireAuthorizationCurrent(
  authorization: LocalExecutionAuthorization | null,
  authorizationId: string,
  epoch: number,
  snapshot: ExecutionAuthorizationSnapshot,
  now: Date,
) {
  if (!authorization) throw new Error(`Execution authorization not found: ${authorizationId}.`);
  if (authorization.epoch !== epoch) throw new Error(`Stale authorization epoch: ${authorizationId}.`);
  assertActiveAndUnexpired(authorization, now);
  for (const key of Object.keys(snapshot) as Array<keyof ExecutionAuthorizationSnapshot>) {
    if (authorization[key] !== snapshot[key]) throw new Error(`Stale authorization ${key}: ${authorizationId}.`);
  }
  return authorization;
}

function requireAuthorizationEpochActive(authorization: LocalExecutionAuthorization | null, execution: TransitionExecution, now: Date) {
  if (!authorization) throw new Error(`Execution authorization not found: ${execution.authorizationId}.`);
  if (authorization.epoch !== execution.authorizationEpoch) throw new Error(`Stale authorization epoch: ${authorization.id}.`);
  assertActiveAndUnexpired(authorization, now);
  return authorization;
}

function assertActiveAndUnexpired(authorization: LocalExecutionAuthorization, now: Date) {
  if (authorization.status !== "active") throw new Error(`Execution authorization is revoked: ${authorization.id}.`);
  if (Date.parse(authorization.expiresAt) <= now.getTime()) throw new Error(`Execution authorization is expired: ${authorization.id}.`);
}

function assertAuthorizedTarget(targets: ExecutionAuthorizationTarget[], input: ExecutionAuthorizationTarget) {
  if (!targets.some((target) => target.transition === input.transition && target.targetId === input.targetId && target.manifestHash === input.manifestHash)) {
    throw new Error(`Transition target is not authorized: ${input.transition}:${input.targetId}.`);
  }
}

function assertBudgetAvailable(completed: number, authorization: LocalExecutionAuthorization) {
  if (completed >= authorization.budget.maxCompletedOperations) {
    throw new Error(`Execution authorization completed-operation budget is exhausted: ${authorization.id}.`);
  }
}

function canTakeOver(execution: TransitionExecution, now: Date): boolean {
  if (execution.status === "retryable-failed") return true;
  if (execution.status === "completed" || execution.status === "terminal-failed") return false;
  return Date.parse(execution.claimExpiresAt) <= now.getTime();
}

function deterministicAuthorizationId(input: IssueAuthorizationInput): string {
  return `auth-${sha256(stableJson({
    projectId: input.projectId,
    changeId: input.changeId,
    acceptedPlanId: input.acceptedPlanId,
    acceptedPlanHash: input.acceptedPlanHash,
    graphId: input.graphId,
    graphHash: input.graphHash,
    artifactManifestHash: input.artifactManifestHash,
    sourceHead: input.sourceHead,
    sourceStateHash: input.sourceStateHash,
    providerScopeHash: input.providerScopeHash,
    permissionProfileHash: input.permissionProfileHash,
    policyHash: input.policyHash,
    conversationId: input.conversationId,
    providerThreadId: input.providerThreadId,
    goalIdentityHash: input.goalIdentityHash,
    mode: input.mode,
    targets: input.targets,
    budget: input.budget,
    decisionId: input.userDecision.decisionId,
    actorId: input.userDecision.actorId,
  }))}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
