import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeChangeIndex } from "../ecl/index.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory } from "../memory/resolver.js";
import { getGitCommit } from "../project/git.js";
import { withProjectWriteLease } from "../project/project-write-lease.js";
import { assertTransitionExecutionCurrent, readExecutionAuthorization, readTransitionExecution, reconcileCommittedTransitionExecution, reserveTransitionExecutionCommitPoint } from "../workflow-runtime/execution-authorization.js";
import { getLatestAuditSummary } from "../audit/artifacts.js";
import { getLatestValidationSummary } from "../validation/artifacts.js";
import type { ChangeMetadata, ChangeStatus, ManagedProject } from "../types/index.js";
import { assertClosableChangeStatus } from "./guards.js";
import { getArchiveRelativePath } from "./paths.js";
import { getChangeStatus, getChangeStatusForChange } from "./status.js";
import { resolveChangeMemory } from "./utils.js";
import { listWorktreesForChange } from "../worktree/manager.js";
import type { ChangeAbandonResult, ChangeCloseResult } from "./types.js";
import type { ResolvedMemory } from "../types/index.js";

type ChangeCloseStage = "prepared" | "metadata-written" | "renamed" | "outbox-written" | "transition-receipt-written" | "index-rebuilt" | "completed";

interface FinalizeRequest {
  version: "1.0";
  id: string;
  changeId: string;
  conversationId: string;
  providerThreadId: string;
  turnId: string;
  authorizationId: string;
  authorizationEpoch: number;
  manifestHash: string;
  goalIdentityHash: string;
  status: "requested";
  createdAt: string;
  artifact: string;
}

interface ChangeCloseTransaction {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  activePath: string;
  archivePath: string;
  archiveRelativePath: string;
  outboxPath: string;
  receiptPath: string;
  closeTimestamp: string;
  stage: ChangeCloseStage;
  error: string | null;
  finalization: {
    requestId: string;
    authorizationId: string;
    authorizationEpoch: number;
    conversationId: string;
    providerThreadId: string;
    goalIdentityHash: string;
    manifestHash: string;
    operationId: string;
    claimToken: string;
    fencingToken: number;
  } | null;
}

export interface AuthorizedChangeFinalization {
  changeId: string;
  requestId: string;
  authorizationId: string;
  authorizationEpoch: number;
  conversationId: string;
  providerThreadId: string;
  goalIdentityHash: string;
  operationId: string;
  claimToken: string;
  fencingToken: number;
}

export async function closeChange(project: ManagedProject | string): Promise<ChangeCloseResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change close");
  return withProjectWriteLease(memory.projectRoot, {}, async () => {
    const status = await getChangeStatus(memory);
    return closeChangeFromStatus(memory, status, "legacy", null);
  });
}

export async function closeChangeForChange(project: ManagedProject | string, changeId: string): Promise<ChangeCloseResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change close");
  return withProjectWriteLease(memory.projectRoot, {}, async () => {
    const existing = await readCloseTransaction(memory, changeId);
    if (existing) return recoverCloseTransaction(memory, existing);
    const status = await getChangeStatusForChange(memory, changeId);
    return closeChangeFromStatus(memory, status, "scoped", null);
  });
}

export async function closeChangeForFinalization(project: ManagedProject | string, input: AuthorizedChangeFinalization): Promise<ChangeCloseResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Authorized Change finalization");
  return withProjectWriteLease(memory.projectRoot, {}, async () => {
    const existing = await readCloseTransaction(memory, input.changeId);
    if (existing) {
      if (existing.finalization?.requestId !== input.requestId || existing.finalization.authorizationId !== input.authorizationId) {
        throw new Error("Existing close transaction belongs to another finalization request.");
      }
      return recoverCloseTransaction(memory, existing);
    }
    const request = await assertFinalizationAuthority(memory, input);
    const status = await assertChangeFinalizationReady(memory, input.changeId);
    return closeChangeFromStatus(memory, status, "scoped", { ...input, manifestHash: request.manifestHash });
  });
}

async function assertFinalizationAuthority(memory: ResolvedMemory, input: AuthorizedChangeFinalization): Promise<FinalizeRequest> {
  if (!/^finalize-[a-f0-9]{64}$/.test(input.requestId)) throw new Error("FinalizeRequest identity is invalid.");
  const requestPath = join(memory.changesRoot, "active", input.changeId, "finalization", "requests", `${input.requestId}.json`);
  if (!existsSync(requestPath)) throw new Error("Persisted FinalizeRequest was not found.");
  const request = JSON.parse(await readFile(requestPath, "utf8")) as FinalizeRequest;
  const authorization = await readExecutionAuthorization(memory, input.authorizationId);
  const execution = await readTransitionExecution(memory, input.operationId);
  const target = authorization.targets.find((item) => item.transition === "change.finalize" && item.targetId === input.changeId);
  if (request.version !== "1.0"
    || request.status !== "requested"
    || request.id !== input.requestId
    || request.changeId !== input.changeId
    || request.authorizationId !== input.authorizationId
    || request.authorizationEpoch !== input.authorizationEpoch
    || request.conversationId !== input.conversationId
    || request.providerThreadId !== input.providerThreadId
    || request.goalIdentityHash !== input.goalIdentityHash
    || request.artifact !== requestPath
    || !target
    || request.manifestHash !== target.manifestHash
    || authorization.status !== "active"
    || authorization.projectId !== memory.projectId
    || authorization.changeId !== input.changeId
    || authorization.conversationId !== input.conversationId
    || authorization.providerThreadId !== input.providerThreadId
    || authorization.goalIdentityHash !== input.goalIdentityHash
    || authorization.epoch !== input.authorizationEpoch
    || !authorization.targets.some((target) => target.transition === "change.finalize" && target.targetId === input.changeId)
    || execution.authorizationId !== authorization.id
    || execution.authorizationEpoch !== authorization.epoch
    || execution.transition !== "change.finalize"
    || execution.targetId !== input.changeId
    || (execution.status !== "executing" && execution.status !== "completed")
    || execution.claimToken !== input.claimToken
    || execution.fencingToken !== input.fencingToken) {
    throw new Error("Authorized Change finalization lineage is stale or forged.");
  }
  await assertTransitionExecutionCurrent(memory, {
    operationId: input.operationId,
    authorizationId: input.authorizationId,
    authorizationEpoch: input.authorizationEpoch,
    transition: "change.finalize",
    targetId: input.changeId,
    manifestHash: request.manifestHash,
    claimToken: input.claimToken,
    fencingToken: input.fencingToken,
  });
  return request;
}

export async function assertChangeFinalizationReady(project: ManagedProject | string | ResolvedMemory, changeId: string): Promise<ChangeStatus> {
  const memory = typeof project === "object" && "changesRoot" in project ? project : await resolveChangeMemory(project);
  const status = await getChangeStatusForChange(memory, changeId);
  const issues = [...status.closeGate.blockingIssues];
  if (status.latestValidation?.status !== "passed") issues.push("Automatic finalization requires a passed latest validation.");
  if (status.latestAudit?.status !== "approved" && status.latestAudit?.status !== "approved-with-notes") {
    issues.push("Automatic finalization requires an approved latest audit.");
  }
  const worktrees = await listWorktreesForChange(memory, changeId);
  const applied = worktrees.filter((worktree) => worktree.status === "applied" && worktree.appliedCommit && worktree.worktreeDiffHash);
  const validation = await getLatestValidationSummary(memory, changeId);
  const audit = await getLatestAuditSummary(memory, changeId);
  const result = applied.find((worktree) => validation?.worktreeId === worktree.worktreeId
    && validation.worktreeDiffHash === worktree.worktreeDiffHash
    && audit?.worktreeId === worktree.worktreeId
    && audit.worktreeDiffHash === worktree.worktreeDiffHash
    && audit.validationId === validation.id);
  if (!result) issues.push("Automatic finalization requires validation, audit, and applied commit evidence for the same worktree diff.");
  else if ((await getGitCommit(memory.projectRoot)) !== result.appliedCommit) {
    issues.push("Automatic finalization requires source HEAD to match the applied result commit.");
  }
  if (issues.length > 0) throw new Error(`Cannot finalize current Change:\n${[...new Set(issues)].map((issue) => `- ${issue}`).join("\n")}`);
  return status;
}

export async function recoverChangeCloseTransactions(project: ManagedProject | string): Promise<ChangeCloseResult[]> {
  const memory = await resolveChangeMemory(project);
  const root = join(memory.changesRoot, ".close-transactions");
  if (!existsSync(root)) return [];
  return withProjectWriteLease(memory.projectRoot, {}, async () => {
    const results: ChangeCloseResult[] = [];
    for (const name of (await readdir(root)).filter((item) => item.endsWith(".json")).sort()) {
      const transaction = JSON.parse(await readFile(join(root, name), "utf8")) as ChangeCloseTransaction;
      results.push(await recoverCloseTransaction(memory, transaction));
    }
    return results;
  });
}

type PersistedChangeFinalization = AuthorizedChangeFinalization & { manifestHash: string };

async function closeChangeFromStatus(memory: ResolvedMemory, status: ChangeStatus, mode: "legacy" | "scoped", finalization: PersistedChangeFinalization | null): Promise<ChangeCloseResult> {
  const existing = await readCloseTransaction(memory, status.change?.id ?? status.activeChanges[0]?.name ?? "");
  if (existing) return recoverCloseTransaction(memory, existing);
  if (!status.closeGate.ready) {
    throw new Error(`Cannot close change:\n${status.closeGate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  assertClosableChangeStatus(status, mode, "close");
  const active = status.activeChanges[0];
  const change = status.change;
  const activePath = join(memory.memoryRoot, active.path);
  const archiveRelativePath = await getArchiveRelativePath(memory, change.id);
  const archivePath = join(memory.memoryRoot, archiveRelativePath);
  const transaction = buildCloseTransaction(memory, change.id, activePath, archivePath, archiveRelativePath, finalization);
  await mkdir(dirname(closeTransactionPath(memory, change.id)), { recursive: true });
  await writeDurableCloseIntent(closeTransactionPath(memory, change.id), transaction);
  return recoverCloseTransaction(memory, transaction);
}

async function recoverCloseTransaction(memory: ResolvedMemory, initial: ChangeCloseTransaction): Promise<ChangeCloseResult> {
  let transaction = initial;
  const markerPath = closeTransactionPath(memory, transaction.changeId);
  try {
    if (transaction.stage === "completed") {
      if (!existsSync(join(transaction.archivePath, "close-receipt.json")) || !existsSync(transaction.outboxPath)) {
        transaction = { ...transaction, stage: "renamed" };
      } else if (transaction.finalization && !await hasMatchingTransitionCompletionReceipt(memory, transaction)) {
        transaction = { ...transaction, stage: "outbox-written" };
      }
    }
    if (transaction.stage === "prepared") {
      if (transaction.finalization) await assertPersistedFinalizationCurrent(memory, transaction);
      const change = JSON.parse(await readFile(join(transaction.activePath, "change.json"), "utf8")) as ChangeMetadata;
      await writeJsonFile(join(transaction.activePath, "change.json"), archivedMetadata(change, transaction.archiveRelativePath, transaction.closeTimestamp));
      transaction = await advanceCloseTransaction(markerPath, transaction, "metadata-written");
    }
    if (transaction.stage === "metadata-written") {
      if (transaction.finalization) await assertPersistedFinalizationCurrent(memory, transaction);
      await mkdir(dirname(transaction.archivePath), { recursive: true });
      const activeExists = existsSync(transaction.activePath);
      const archiveExists = existsSync(transaction.archivePath);
      if (activeExists && archiveExists) throw new Error(`Close archive target already exists: ${transaction.archiveRelativePath}.`);
      if (!activeExists && !archiveExists) throw new Error("Close transaction lost both active and archive directories.");
      if (activeExists) await rename(transaction.activePath, transaction.archivePath);
      else if ((await readArchivedMetadata(transaction)).id !== transaction.changeId) {
        throw new Error("Existing close archive target belongs to another Change.");
      }
      transaction = await advanceCloseTransaction(markerPath, transaction, "renamed");
    }
    if (transaction.stage === "renamed") {
      const archived = await readArchivedMetadata(transaction);
      await writeJsonFile(join(transaction.archivePath, "close-receipt.json"), {
        version: "1.0", transactionId: transaction.id, changeId: transaction.changeId,
        archivePath: transaction.archiveRelativePath, closedAt: transaction.closeTimestamp,
        finalization: transaction.finalization,
      });
      await writeJsonFile(transaction.outboxPath, {
        version: "1.0", id: `change-close:${transaction.id}`, type: "change.closed",
        projectId: transaction.projectId, changeId: transaction.changeId,
        archivePath: transaction.archiveRelativePath, receiptPath: transaction.receiptPath,
        occurredAt: transaction.closeTimestamp,
      });
      if (archived.id !== transaction.changeId) throw new Error("Archived Change identity does not match close transaction.");
      transaction = await advanceCloseTransaction(markerPath, transaction, "outbox-written");
    }
    let index;
    if (transaction.stage === "outbox-written") {
      if (transaction.finalization) await ensureTransitionCompletionReceipt(memory, transaction);
      transaction = await advanceCloseTransaction(markerPath, transaction, "transition-receipt-written");
    }
    if (transaction.stage === "transition-receipt-written") {
      index = await writeChangeIndex(memory);
      transaction = await advanceCloseTransaction(markerPath, transaction, "index-rebuilt");
    }
    if (transaction.stage === "index-rebuilt") transaction = await advanceCloseTransaction(markerPath, transaction, "completed");
    if (transaction.stage !== "completed") throw new Error(`Close transaction is not recoverable from stage ${transaction.stage}.`);
    const change = await readArchivedMetadata(transaction);
    index ??= await writeChangeIndex(memory);
    return { archivePath: transaction.archiveRelativePath, change, index, transactionId: transaction.id, receiptPath: transaction.receiptPath };
  } catch (error) {
    await writeJsonFile(markerPath, { ...transaction, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function hasMatchingTransitionCompletionReceipt(memory: ResolvedMemory, transaction: ChangeCloseTransaction): Promise<boolean> {
  const operationId = transaction.finalization?.operationId;
  if (!operationId) return true;
  const execution = await readTransitionExecution(memory, operationId);
  return execution.status === "completed" && Boolean(execution.receipt?.evidenceRefs.includes(transaction.receiptPath));
}

async function ensureTransitionCompletionReceipt(memory: ResolvedMemory, transaction: ChangeCloseTransaction): Promise<void> {
  const finalization = transaction.finalization;
  if (!finalization) return;
  const execution = await readTransitionExecution(memory, finalization.operationId);
  if (execution.status === "completed") {
    if (!execution.receipt?.evidenceRefs.includes(transaction.receiptPath)) {
      throw new Error("Finalization transition receipt does not reference the Change close receipt.");
    }
    return;
  }
  await reconcileCommittedTransitionExecution(memory, {
    operationId: finalization.operationId,
    authorizationId: finalization.authorizationId,
    authorizationEpoch: finalization.authorizationEpoch,
    transition: "change.finalize",
    targetId: transaction.changeId,
    manifestHash: finalization.manifestHash,
    claimToken: finalization.claimToken,
    fencingToken: finalization.fencingToken,
    evidenceRefs: [transaction.receiptPath],
  });
}

async function assertPersistedFinalizationCurrent(memory: ResolvedMemory, transaction: ChangeCloseTransaction): Promise<void> {
  const finalization = transaction.finalization;
  if (!finalization) return;
  await reserveTransitionExecutionCommitPoint(memory, {
    operationId: finalization.operationId,
    authorizationId: finalization.authorizationId,
    authorizationEpoch: finalization.authorizationEpoch,
    transition: "change.finalize",
    targetId: transaction.changeId,
    manifestHash: finalization.manifestHash,
    claimToken: finalization.claimToken,
    fencingToken: finalization.fencingToken,
  });
}

function buildCloseTransaction(memory: ResolvedMemory, changeId: string, activePath: string, archivePath: string, archiveRelativePath: string, finalization: PersistedChangeFinalization | null): ChangeCloseTransaction {
  const id = `close-${createHash("sha256").update(`${memory.projectId ?? "local"}:${changeId}:${archiveRelativePath}`).digest("hex")}`;
  const closeTimestamp = new Date().toISOString();
  const receiptPath = `${archiveRelativePath}/close-receipt.json`;
  return {
    version: "1.0", id, projectId: memory.projectId, changeId, activePath, archivePath, archiveRelativePath,
    outboxPath: join(memory.harnessRoot, "outbox", "change-close", `${id}.json`), receiptPath,
    closeTimestamp, stage: "prepared", error: null,
    finalization: finalization ? {
      requestId: finalization.requestId,
      authorizationId: finalization.authorizationId,
      authorizationEpoch: finalization.authorizationEpoch,
      conversationId: finalization.conversationId,
      providerThreadId: finalization.providerThreadId,
      goalIdentityHash: finalization.goalIdentityHash,
      manifestHash: finalization.manifestHash,
      operationId: finalization.operationId,
      claimToken: finalization.claimToken,
      fencingToken: finalization.fencingToken,
    } : null,
  };
}

function closeTransactionPath(memory: ResolvedMemory, changeId: string): string {
  return join(memory.changesRoot, ".close-transactions", `${changeId}.json`);
}

async function readCloseTransaction(memory: ResolvedMemory, changeId: string): Promise<ChangeCloseTransaction | null> {
  if (!changeId) return null;
  const path = closeTransactionPath(memory, changeId);
  return existsSync(path) ? JSON.parse(await readFile(path, "utf8")) as ChangeCloseTransaction : null;
}

async function advanceCloseTransaction(path: string, transaction: ChangeCloseTransaction, stage: ChangeCloseStage): Promise<ChangeCloseTransaction> {
  const next = { ...transaction, stage, error: null };
  await writeJsonFile(path, next);
  return next;
}

async function readArchivedMetadata(transaction: ChangeCloseTransaction): Promise<ChangeMetadata> {
  return JSON.parse(await readFile(join(transaction.archivePath, "change.json"), "utf8")) as ChangeMetadata;
}

async function writeDurableCloseIntent(path: string, transaction: ChangeCloseTransaction): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(transaction, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function abandonChange(project: ManagedProject | string, reason?: string): Promise<ChangeAbandonResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change abandon");
  const status = await getChangeStatus(memory);
  return abandonChangeFromStatus(memory, status, reason, "legacy");
}

export async function abandonChangeForChange(project: ManagedProject | string, changeId: string, reason?: string): Promise<ChangeAbandonResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change abandon");
  const status = await getChangeStatusForChange(memory, changeId);
  return abandonChangeFromStatus(memory, status, reason, "scoped");
}

async function abandonChangeFromStatus(memory: ResolvedMemory, status: ChangeStatus, reason: string | undefined, mode: "legacy" | "scoped"): Promise<ChangeAbandonResult> {
  assertClosableChangeStatus(status, mode, "abandon");
  const active = status.activeChanges[0];
  const change = status.change;
  const activePath = join(memory.memoryRoot, active.path);
  const archiveRelativePath = await getArchiveRelativePath(memory, change.id);
  const archivePath = join(memory.memoryRoot, archiveRelativePath);
  const updated = archivedMetadata(change, archiveRelativePath);

  await writeJsonFile(join(activePath, "change.json"), updated);
  await mkdir(dirname(archivePath), { recursive: true });
  await rename(activePath, archivePath);
  const index = await writeChangeIndex(memory);
  return { archivePath: archiveRelativePath, change: updated, index, reason };
}

function archivedMetadata(change: ChangeMetadata, archivePath: string, timestamp = new Date().toISOString()): ChangeMetadata {
  return {
    ...change,
    state: "archived",
    updatedAt: timestamp,
    closedAt: timestamp,
    archivePath,
  };
}
