import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isHighImpactApprovalScope, type HighImpactApprovalRecoveryReceipt, type HighImpactApprovalScope } from "../workflow-actions/high-impact-approval.js";
import { evaluateSkillNativeCandidateGate } from "../apply/gate.js";
import { parseNameStatusPaths } from "../audit/diff.js";
import {
  assertApplyActionScope,
  executionAuthorizationSnapshot,
  projectApplyActionScope,
  resolveProjectApplyExecutionScope,
  type ProjectApplyExecutionScope,
} from "../apply/execution-scope.js";
import { projectHarnessSharedWriterRoot, withProjectHarnessWriterLock } from "../project-harness/writer-lock.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { projectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { getGitCommit, getGitStatusShort, git, gitRawWithEnv, gitTextWithEnv, isGitDirty } from "../project/git.js";
import { withProjectWriteLeaseAtPath } from "../project/project-write-lease.js";
import { buildRunId } from "../run/manager.js";
import { getWorktreeStatus, markWorktreeApplied } from "../worktree/manager.js";
import type { ManagedProject } from "../types/index.js";
import {
  appendLocalExecutionAuthorizationTargets,
  advanceCommittedLocalExecutionAuthorizationSource,
  claimTransitionExecution,
  markTransitionExecutionStarted,
  readExecutionAuthorization,
  readTransitionExecution,
  reconcileCommittedTransitionExecution,
  recordTransitionExecutionTerminal,
  reserveTransitionExecutionCommitPoint,
} from "../workflow-runtime/execution-authorization.js";
import { contentHash, latestArtifactAbsolutePath, latestArtifactForApply } from "./artifacts.js";
import { integrationCheckRoot } from "./paths.js";
import { appendIntegrationEvent, readIntegrationCheck, writeCheckArtifacts } from "./repository.js";
import { writeJsonFile } from "../fs/json.js";
import type { IntegrationCheckApplyTransaction, IntegrationCheckDiscardTransaction, IntegrationCheckRecord, IntegrationCheckResult } from "./types.js";

const DISCARDABLE_INTEGRATION_CHECK_STATUSES = new Set<IntegrationCheckRecord["status"]>([
  "passed",
  "conflict",
  "validation-failed",
  "audit-failed",
  "stale-result",
  "failed",
]);

export function integrationCheckActionManifestHash(check: IntegrationCheckRecord): string {
  return createHash("sha256").update(JSON.stringify({
    id: check.id,
    projectId: check.projectId,
    status: check.status,
    resultTargets: check.resultTargets,
    sourceHead: check.sourceHead,
    latestArtifactHash: check.latestArtifactHash ?? null,
    latestArtifactRef: check.latestArtifactRef ?? null,
    aggregateValidation: check.aggregateValidation ?? null,
    aggregateAudit: check.aggregateAudit ?? null,
    artifacts: check.artifacts,
  })).digest("hex");
}

export async function applyIntegrationCheck(
  project: ManagedProject,
  applyCheckId: string,
  expectedArtifactHash?: string,
  actionScope?: HighImpactApprovalScope,
  approvalActionId: "apply-check.apply" | null = null,
): Promise<IntegrationCheckResult> {
  const recovered = await recoverExistingIntegrationApply(project, applyCheckId, actionScope);
  if (recovered) return recovered;
  return withCurrentIntegrationCheckScope(project, applyCheckId, "integration-check-apply", async (scope, check, directory, lease) => {
    if (check.status !== "passed") {
      throw new Error(`Cannot apply integration check ${applyCheckId}: status is ${check.status}.`);
    }
    if (check.projectId !== scope.runtime.projectId) {
      throw new Error(`Cannot apply integration check ${applyCheckId}: project identity is stale.`);
    }
    if ((await isGitDirty(project.path)) === true) {
      throw new Error("Cannot apply integration check: project has uncommitted local changes.");
    }
    const currentHead = await getGitCommit(project.path);
    if (currentHead !== check.sourceHead) {
      throw new Error("Cannot apply integration check: project changed after the check. Re-run compatibility check first.");
    }
    if (!check.latestArtifactHash || !check.latestArtifactRef) {
      throw new Error(`Cannot apply integration check ${applyCheckId}: missing passed integration artifact.`);
    }
    if (expectedArtifactHash && expectedArtifactHash !== check.latestArtifactHash) {
      throw new Error(`Cannot apply integration check ${applyCheckId}: selected integration artifact is stale.`);
    }
    if (check.aggregateValidation?.status !== "passed" || check.aggregateAudit?.status !== "approved") {
      throw new Error(`Cannot apply integration check ${applyCheckId}: aggregate validation/audit evidence is not passed.`);
    }
    const latestArtifact = latestArtifactForApply(check);
    if (!latestArtifact || latestArtifact.hash !== check.latestArtifactHash) {
      throw new Error(`Cannot apply integration check ${applyCheckId}: latest artifact hash mismatch.`);
    }
    const patchPath = latestArtifactAbsolutePath(directory, latestArtifact);
    if (!existsSync(patchPath)) throw new Error(`Missing integration patch: ${patchPath}`);
    const patchText = await readFile(patchPath, "utf8");
    if (contentHash(patchText) !== latestArtifact.hash) {
      throw new Error(`Cannot apply integration check ${applyCheckId}: integration artifact changed on disk.`);
    }
    const manifestHash = integrationCheckActionManifestHash(check);
    assertApplyActionScope(projectApplyActionScope(scope, manifestHash), actionScope);
    await assertExactIntegrationTargets(project, scope, check);
    const transition = await claimIntegrationTransition(scope, "integration-check.apply", applyCheckId, manifestHash);
    const runId = buildRunId(check.resultTargets[0]?.changeId ?? "integration-check", ["integration-apply", applyCheckId, manifestHash]);
    const transactionPath = integrationApplyTransactionPath(directory);
    const expectedState = await computeIntegrationExpectedState(project.path, transactionPath, patchPath);
    const publishedCheck: IntegrationCheckRecord = {
      ...check,
      status: "applied",
      appliedAt: new Date().toISOString(),
      summary: latestArtifact.kind === "repaired"
        ? "已将自动修复并通过检查的组合结果应用到项目。"
        : "已将通过兼容性检查的结果应用到项目。",
    };
    let transaction: IntegrationCheckApplyTransaction = {
      version: "1.0",
      checkId: applyCheckId,
      changeId: scope.harness.planning.change.change_id,
      runId,
      manifestHash,
      sourceHeadBefore: currentHead ?? "",
      artifactHash: latestArtifact.hash,
      publishedCheckHash: integrationCheckActionManifestHash(publishedCheck),
      publishedCheck,
      diffHash: expectedState.diffHash,
      expectedTree: expectedState.expectedTree,
      changedPaths: expectedState.changedPaths,
      stage: "prepared",
      actionScope: actionScope!,
      approvalActionId,
      authorization: {
        authorizationId: transition.authorizationId,
        authorizationEpoch: transition.authorizationEpoch,
        snapshot: executionAuthorizationSnapshot(scope.authorization),
        operationId: transition.operationId,
        claimToken: transition.claimToken,
        fencingToken: transition.fencingToken,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blockedReason: null,
    };
    await writeJsonFile(transactionPath, transaction);
    await appendIntegrationEvent(directory, applyCheckId, "integration-check.apply.started", { runId, manifestHash });
    await lease.heartbeat();
    try {
      await reserveTransitionExecutionCommitPoint(scope.runtime, transition);
      await git(project.path, ["apply", "--binary", patchPath]);
      transaction = await advanceIntegrationApplyTransaction(transactionPath, transaction, "patch-applied");
      return await recoverIntegrationApplyAfterCommit(project, scope.runtime, check, directory, transaction, lease);
    } catch (error) {
      transaction = { ...transaction, blockedReason: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() };
      await writeJsonFile(transactionPath, transaction);
      const execution = await readTransitionExecution(scope.runtime, transition.operationId);
      if (execution.commitPointReservedAt) {
        return recoverIntegrationApplyAfterCommit(project, scope.runtime, check, directory, transaction, lease);
      }
      await rm(transactionPath, { force: true });
      await recordTransitionExecutionTerminal(scope.runtime, {
        operationId: transition.operationId,
        claimToken: transition.claimToken,
        fencingToken: transition.fencingToken,
        outcome: "retryable-failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

export async function recoverPendingIntegrationCheckApplyTransactions(project: ManagedProject): Promise<IntegrationCheckResult[]> {
  return (await recoverIntegrationCheckApprovalReceipts(project, false)).map((receipt) => receipt.result);
}

export async function recoverIntegrationCheckApprovalReceipts(
  project: ManagedProject,
  includeCompleted = true,
  onReceipt?: (receipt: HighImpactApprovalRecoveryReceipt<IntegrationCheckResult>) => Promise<void>,
): Promise<HighImpactApprovalRecoveryReceipt<IntegrationCheckResult>[]> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") return [];
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const root = integrationCheckRoot(runtime);
  if (!existsSync(root)) return [];
  const receipts: HighImpactApprovalRecoveryReceipt<IntegrationCheckResult>[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).filter((item) => item.isDirectory())) {
    const directory = join(root, entry.name);
    const applyPath = integrationApplyTransactionPath(directory);
    if (existsSync(applyPath)) {
      const transaction = await readIntegrationApplyTransaction(applyPath);
      if (transaction.actionScope.projectId !== runtime.projectId) {
        throw new Error(`IntegrationCheck apply project scope is stale: ${transaction.checkId}.`);
      }
      if (includeCompleted || transaction.stage !== "completed") {
        const recovered = transaction.stage === "completed"
          ? await readCompletedIntegrationApplyReceipt(runtime, directory, transaction)
          : await recoverExistingIntegrationApply(project, transaction.checkId, transaction.actionScope, false);
        if (recovered) {
          const receipt: HighImpactApprovalRecoveryReceipt<IntegrationCheckResult> = {
            operation: "integration-check.apply",
            approvalActionId: transaction.approvalActionId,
            targetId: transaction.checkId,
            scope: transaction.actionScope,
            result: recovered,
          };
          await onReceipt?.(receipt);
          receipts.push(receipt);
        }
      }
    }
    const discardPath = integrationDiscardTransactionPath(directory);
    if (existsSync(discardPath)) {
      const transaction = await readIntegrationDiscardTransaction(discardPath);
      if (transaction.actionScope.projectId !== runtime.projectId) {
        throw new Error(`IntegrationCheck discard project scope is stale: ${transaction.checkId}.`);
      }
      if (includeCompleted || transaction.stage !== "completed") {
        const recovered = transaction.stage === "completed"
          ? await recoverIntegrationDiscardAfterCommit(
            runtime,
            await readIntegrationCheck(runtime, transaction.checkId),
            directory,
            transaction,
          )
          : await recoverExistingIntegrationDiscard(project, transaction.checkId, transaction.actionScope, false);
        if (recovered) {
          const receipt: HighImpactApprovalRecoveryReceipt<IntegrationCheckResult> = {
            operation: "integration-check.discard",
            approvalActionId: transaction.approvalActionId,
            targetId: transaction.checkId,
            scope: transaction.actionScope,
            result: recovered,
          };
          await onReceipt?.(receipt);
          receipts.push(receipt);
        }
      }
    }
  }
  return receipts;
}

async function readCompletedIntegrationApplyReceipt(
  runtime: ProjectApplyExecutionScope["runtime"],
  directory: string,
  transaction: IntegrationCheckApplyTransaction,
): Promise<IntegrationCheckResult> {
  const check = await readIntegrationCheck(runtime, transaction.checkId);
  if (integrationCheckActionManifestHash(check) !== transaction.publishedCheckHash
    || check.status !== "applied") {
    throw new Error(`IntegrationCheck completed apply evidence changed: ${transaction.checkId}.`);
  }
  const binding = transaction.authorization;
  await reconcileCommittedTransitionExecution(runtime, {
    operationId: binding.operationId,
    authorizationId: binding.authorizationId,
    authorizationEpoch: binding.authorizationEpoch,
    transition: "integration-check.apply",
    targetId: transaction.checkId,
    manifestHash: transaction.manifestHash,
    claimToken: binding.claimToken,
    fencingToken: binding.fencingToken,
    evidenceRefs: [check.latestArtifactRef!],
  });
  return { check, artifactDirectory: directory };
}

export async function discardIntegrationCheck(
  project: ManagedProject,
  applyCheckId: string,
  actionScope?: HighImpactApprovalScope,
  approvalActionId: "apply-check.discard" | null = null,
): Promise<IntegrationCheckResult> {
  const recovered = await recoverExistingIntegrationDiscard(project, applyCheckId, actionScope);
  if (recovered) return recovered;
  return withCurrentIntegrationCheckScope(project, applyCheckId, "integration-check-discard", async (scope, check, directory) => {
    if (!DISCARDABLE_INTEGRATION_CHECK_STATUSES.has(check.status)) {
      throw new Error(`Cannot discard integration check ${applyCheckId}: status is ${check.status}.`);
    }
    if (check.projectId !== scope.runtime.projectId) {
      throw new Error(`Cannot discard integration check ${applyCheckId}: project identity is stale.`);
    }
    const manifestHash = integrationCheckActionManifestHash(check);
    assertApplyActionScope(projectApplyActionScope(scope, manifestHash), actionScope);
    const transition = await claimIntegrationTransition(scope, "integration-check.discard", applyCheckId, manifestHash);
    const publishedCheck: IntegrationCheckRecord = {
      ...check,
      status: "discarded",
      finishedAt: new Date().toISOString(),
      summary: "已放弃这次组合应用检查结果，项目源码未修改。",
    };
    let transaction: IntegrationCheckDiscardTransaction = {
      version: "1.0",
      checkId: applyCheckId,
      changeId: scope.harness.planning.change.change_id,
      manifestHash,
      publishedCheckHash: integrationCheckActionManifestHash(publishedCheck),
      publishedCheck,
      stage: "prepared",
      actionScope: actionScope!,
      approvalActionId,
      authorization: {
        authorizationId: transition.authorizationId,
        authorizationEpoch: transition.authorizationEpoch,
        operationId: transition.operationId,
        claimToken: transition.claimToken,
        fencingToken: transition.fencingToken,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blockedReason: null,
    };
    const transactionPath = integrationDiscardTransactionPath(directory);
    await writeJsonFile(transactionPath, transaction);
    try {
      await reserveTransitionExecutionCommitPoint(scope.runtime, transition);
      return recoverIntegrationDiscardAfterCommit(scope.runtime, check, directory, transaction);
    } catch (error) {
      transaction = { ...transaction, blockedReason: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() };
      await writeJsonFile(transactionPath, transaction);
      const execution = await readTransitionExecution(scope.runtime, transition.operationId);
      if (execution.commitPointReservedAt) {
        return recoverIntegrationDiscardAfterCommit(scope.runtime, check, directory, transaction);
      }
      await rm(transactionPath, { force: true });
      await recordTransitionExecutionTerminal(scope.runtime, {
        operationId: transition.operationId,
        claimToken: transition.claimToken,
        fencingToken: transition.fencingToken,
        outcome: "retryable-failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

async function withCurrentIntegrationCheckScope<T>(
  project: ManagedProject,
  applyCheckId: string,
  operation: "integration-check-apply" | "integration-check-discard",
  action: (
    scope: ProjectApplyExecutionScope,
    check: IntegrationCheckRecord,
    directory: string,
    lease: Parameters<Parameters<typeof withProjectWriteLeaseAtPath>[2]>[0],
  ) => Promise<T>,
): Promise<T> {
  const initialRuntime = await resolveIntegrationCheckRuntime(project, applyCheckId);
  return withProjectHarnessWriterLock(initialRuntime.scope.writerRoot, {
    projectId: initialRuntime.scope.runtime.projectId,
    ownerId: `${operation}-${applyCheckId}`,
    operation,
  }, async (writer) => withProjectWriteLeaseAtPath(initialRuntime.scope.runtime.projectWriteLeasePath, {}, async (lease) => {
    const current = await resolveIntegrationCheckRuntime(project, applyCheckId);
    if (current.scope.writerRoot !== initialRuntime.scope.writerRoot) throw new Error("Integration check runtime identity changed before execution.");
    await writer.assertCurrent();
    await lease.assertCurrent();
    return action(current.scope, current.check, current.directory, lease);
  }));
}

async function resolveIntegrationCheckRuntime(project: ManagedProject, applyCheckId: string) {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for IntegrationCheck apply/discard: ${state.state}.`);
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const directory = join(integrationCheckRoot(runtime), applyCheckId);
  const check = await readIntegrationCheck(runtime, applyCheckId);
  const first = check.resultTargets[0];
  if (!first || check.resultTargets.some((target) => target.changeId !== first.changeId)) {
    throw new Error(`Integration check ${applyCheckId} does not have one exact Change scope.`);
  }
  const scope = await resolveProjectApplyExecutionScope(project, first.worktreeId);
  for (const target of check.resultTargets) {
    const worktree = await getWorktreeStatus(scope.runtime, target.worktreeId);
    if (worktree.changeId !== target.changeId) throw new Error(`Integration check ${applyCheckId} worktree scope is stale.`);
  }
  return { scope, check, directory };
}

async function claimIntegrationTransition(
  scope: ProjectApplyExecutionScope,
  transition: "integration-check.apply" | "integration-check.discard",
  targetId: string,
  manifestHash: string,
) {
  const snapshot = executionAuthorizationSnapshot(scope.authorization);
  const authorization = await appendLocalExecutionAuthorizationTargets(
    scope.runtime,
    scope.authorization.id,
    scope.authorization.epoch,
    snapshot,
    { projectId: scope.runtime.projectId, changeId: scope.harness.planning.change.change_id },
    [{ transition, targetId, manifestHash }],
  );
  const claim = await claimTransitionExecution(scope.runtime, {
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    transition,
    targetId,
    manifestHash,
    snapshot,
    claimedBy: transition,
    claimTtlMs: 10 * 60_000,
  });
  return markTransitionExecutionStarted(scope.runtime, claim.operationId, claim.claimToken, claim.fencingToken);
}

async function assertExactIntegrationTargets(
  project: ManagedProject,
  scope: ProjectApplyExecutionScope,
  check: IntegrationCheckRecord,
): Promise<void> {
  for (const target of check.resultTargets) {
    if (target.changeId !== scope.harness.planning.change.change_id) {
      throw new Error(`Integration check ${check.id} crosses Change or Conversation scope.`);
    }
    const gate = await evaluateSkillNativeCandidateGate(project, scope.runtime, scope.harness, target.worktreeId);
    const mismatches = [
      ...gate.blockingIssues,
      ...(gate.changeId === target.changeId ? [] : ["Change id"]),
      ...(gate.diffHash === target.diffHash ? [] : ["diff hash"]),
      ...(gate.sourceHead === check.sourceHead ? [] : ["source HEAD"]),
      ...(gate.validation ? [] : ["Validation evidence"]),
      ...(gate.audit ? [] : ["Audit evidence"]),
      ...(gate.validation?.id === target.validationRunId ? [] : [`Validation id ${gate.validation?.id ?? "missing"} != ${target.validationRunId}`]),
      ...(gate.validation?.worktreeId === target.worktreeId ? [] : ["Validation worktree"]),
      ...(gate.validation?.worktreeDiffHash === target.diffHash ? [] : ["Validation diff hash"]),
      ...(gate.audit?.id === target.auditRunId ? [] : [`Audit id ${gate.audit?.id ?? "missing"} != ${target.auditRunId}`]),
      ...(gate.audit?.worktreeId === target.worktreeId ? [] : ["Audit worktree"]),
      ...(gate.audit?.worktreeDiffHash === target.diffHash ? [] : ["Audit diff hash"]),
    ];
    if (!gate.ready || mismatches.length > 0) {
      throw new Error(`Integration check ${check.id} target evidence is stale: ${target.worktreeId} (${mismatches.join(", ")}).`);
    }
  }
}

async function recoverExistingIntegrationApply(
  project: ManagedProject,
  applyCheckId: string,
  actionScope: HighImpactApprovalScope | undefined,
  rejectCompleted = true,
): Promise<IntegrationCheckResult | null> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") return null;
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const directory = join(integrationCheckRoot(runtime), applyCheckId);
  const path = integrationApplyTransactionPath(directory);
  if (!existsSync(path)) return null;
  const initial = await readIntegrationApplyTransaction(path);
  assertApplyActionScope(initial.actionScope, actionScope);
  if (rejectCompleted && initial.stage === "completed") throw new Error(`IntegrationCheck apply already completed: ${applyCheckId}.`);
  const writerRoot = projectHarnessSharedWriterRoot(state.resolution.paths.sidecarRoot);
  return withProjectHarnessWriterLock(writerRoot, {
    projectId: runtime.projectId,
    ownerId: `integration-check-apply-recovery-${applyCheckId}`,
    operation: "integration-check-apply",
  }, async (writer) => withProjectWriteLeaseAtPath(runtime.projectWriteLeasePath, {}, async (lease) => {
    const currentState = await resolveProjectRuntimeState(project, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (currentState.state !== "ready") {
      throw new Error(`Project Harness is not ready for IntegrationCheck recovery: ${currentState.state}.`);
    }
    const currentRuntime = projectExecutionRuntimePort(project, currentState.resolution);
    if (currentRuntime.runsRoot !== runtime.runsRoot
      || currentRuntime.workbenchRoot !== runtime.workbenchRoot
      || projectHarnessSharedWriterRoot(currentState.resolution.paths.sidecarRoot) !== writerRoot) {
      throw new Error("IntegrationCheck recovery runtime identity changed before execution.");
    }
    const transaction = await readIntegrationApplyTransaction(path);
    assertApplyActionScope(transaction.actionScope, actionScope);
    const check = await readIntegrationCheck(currentRuntime, applyCheckId);
    await writer.assertCurrent();
    await lease.assertCurrent();
    return recoverIntegrationApplyAfterCommit(project, currentRuntime, check, directory, transaction, lease);
  }));
}

async function recoverExistingIntegrationDiscard(
  project: ManagedProject,
  applyCheckId: string,
  actionScope: HighImpactApprovalScope | undefined,
  rejectCompleted = true,
): Promise<IntegrationCheckResult | null> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") return null;
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const directory = join(integrationCheckRoot(runtime), applyCheckId);
  const path = integrationDiscardTransactionPath(directory);
  if (!existsSync(path)) return null;
  const initial = await readIntegrationDiscardTransaction(path);
  assertApplyActionScope(initial.actionScope, actionScope);
  if (rejectCompleted && initial.stage === "completed") throw new Error(`IntegrationCheck discard already completed: ${applyCheckId}.`);
  const writerRoot = projectHarnessSharedWriterRoot(state.resolution.paths.sidecarRoot);
  return withProjectHarnessWriterLock(writerRoot, {
    projectId: runtime.projectId,
    ownerId: `integration-check-discard-recovery-${applyCheckId}`,
    operation: "integration-check-discard",
  }, async (writer) => withProjectWriteLeaseAtPath(runtime.projectWriteLeasePath, {}, async (lease) => {
    const currentState = await resolveProjectRuntimeState(project, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (currentState.state !== "ready") {
      throw new Error(`Project Harness is not ready for IntegrationCheck discard recovery: ${currentState.state}.`);
    }
    const currentRuntime = projectExecutionRuntimePort(project, currentState.resolution);
    if (currentRuntime.workbenchRoot !== runtime.workbenchRoot
      || projectHarnessSharedWriterRoot(currentState.resolution.paths.sidecarRoot) !== writerRoot) {
      throw new Error("IntegrationCheck discard recovery runtime identity changed before execution.");
    }
    const transaction = await readIntegrationDiscardTransaction(path);
    assertApplyActionScope(transaction.actionScope, actionScope);
    await writer.assertCurrent();
    await lease.assertCurrent();
    return recoverIntegrationDiscardAfterCommit(
      currentRuntime,
      await readIntegrationCheck(currentRuntime, applyCheckId),
      directory,
      transaction,
    );
  }));
}

async function recoverIntegrationDiscardAfterCommit(
  runtime: ProjectApplyExecutionScope["runtime"],
  check: IntegrationCheckRecord,
  directory: string,
  initial: IntegrationCheckDiscardTransaction,
): Promise<IntegrationCheckResult> {
  let transaction = initial;
  const binding = transaction.authorization;
  const execution = await readTransitionExecution(runtime, binding.operationId);
  if (!execution.commitPointReservedAt
    || execution.authorizationId !== binding.authorizationId
    || execution.authorizationEpoch !== binding.authorizationEpoch
    || execution.transition !== "integration-check.discard"
    || execution.targetId !== transaction.checkId
    || execution.manifestHash !== transaction.manifestHash
    || execution.claimToken !== binding.claimToken
    || execution.fencingToken !== binding.fencingToken) {
    throw new Error(`IntegrationCheck discard transaction lineage is stale or not committed: ${transaction.checkId}.`);
  }
  const transactionPath = integrationDiscardTransactionPath(directory);
  if (transaction.stage === "prepared") {
    const currentHash = integrationCheckActionManifestHash(check);
    if ((currentHash !== transaction.manifestHash && currentHash !== transaction.publishedCheckHash)
      || (check.status !== "discarded" && !DISCARDABLE_INTEGRATION_CHECK_STATUSES.has(check.status))) {
      throw new Error(`IntegrationCheck discard target changed during recovery: ${transaction.checkId}.`);
    }
    const discarded = transaction.publishedCheck;
    await writeCheckArtifacts(runtime, directory, discarded);
    await appendIntegrationEvent(directory, transaction.checkId, "integration-check.discarded", {});
    transaction = await advanceIntegrationDiscardTransaction(transactionPath, transaction, "evidence-written");
    check = discarded;
  }
  if (transaction.stage === "evidence-written" || transaction.stage === "completed") {
    if (!transaction.publishedCheckHash || integrationCheckActionManifestHash(check) !== transaction.publishedCheckHash) {
      throw new Error(`IntegrationCheck discard evidence changed during recovery: ${transaction.checkId}.`);
    }
    await reconcileCommittedTransitionExecution(runtime, {
      operationId: binding.operationId,
      authorizationId: binding.authorizationId,
      authorizationEpoch: binding.authorizationEpoch,
      transition: "integration-check.discard",
      targetId: transaction.checkId,
      manifestHash: transaction.manifestHash,
      claimToken: binding.claimToken,
      fencingToken: binding.fencingToken,
      evidenceRefs: check.artifactRefs,
    });
    if (transaction.stage !== "completed") {
      transaction = await advanceIntegrationDiscardTransaction(transactionPath, transaction, "completed");
    }
    return { check: await readIntegrationCheck(runtime, transaction.checkId), artifactDirectory: directory };
  }
  throw new Error(`IntegrationCheck discard transaction cannot recover from ${transaction.stage}: ${transaction.checkId}.`);
}

async function recoverIntegrationApplyAfterCommit(
  project: ManagedProject,
  runtime: ProjectApplyExecutionScope["runtime"],
  check: IntegrationCheckRecord,
  directory: string,
  initial: IntegrationCheckApplyTransaction,
  lease: Parameters<Parameters<typeof withProjectWriteLeaseAtPath>[2]>[0],
): Promise<IntegrationCheckResult> {
  let transaction = initial;
  const binding = transaction.authorization;
  const execution = await readTransitionExecution(runtime, binding.operationId);
  if (!execution.commitPointReservedAt
    || execution.authorizationId !== binding.authorizationId
    || execution.authorizationEpoch !== binding.authorizationEpoch
    || execution.transition !== "integration-check.apply"
    || execution.targetId !== transaction.checkId
    || execution.manifestHash !== transaction.manifestHash
    || execution.claimToken !== binding.claimToken
    || execution.fencingToken !== binding.fencingToken) {
    throw new Error(`IntegrationCheck transaction lineage is stale or not committed: ${transaction.checkId}.`);
  }
  const latestArtifact = latestArtifactForApply(transaction.publishedCheck);
  if ((transaction.stage === "prepared" || transaction.stage === "patch-applied" || transaction.stage === "metadata-updated")
    && ![transaction.manifestHash, transaction.publishedCheckHash].includes(integrationCheckActionManifestHash(check))) {
    throw new Error(`IntegrationCheck transaction target changed during recovery: ${transaction.checkId}.`);
  }
  if ((transaction.stage === "evidence-written" || transaction.stage === "completed")
    && (!transaction.publishedCheckHash || integrationCheckActionManifestHash(check) !== transaction.publishedCheckHash)) {
    throw new Error(`IntegrationCheck published evidence changed during recovery: ${transaction.checkId}.`);
  }
  if (!latestArtifact || latestArtifact.hash !== transaction.artifactHash || !check.latestArtifactRef) {
    throw new Error(`IntegrationCheck transaction artifact is stale: ${transaction.checkId}.`);
  }
  const patchPath = latestArtifactAbsolutePath(directory, latestArtifact);
  const patchText = await readFile(patchPath, "utf8");
  if (contentHash(patchText) !== transaction.artifactHash) {
    throw new Error(`IntegrationCheck recovery artifact changed on disk: ${transaction.checkId}.`);
  }
  const transactionPath = integrationApplyTransactionPath(directory);
  const head = await getGitCommit(project.path);
  if (head !== transaction.sourceHeadBefore) {
    throw new Error(`IntegrationCheck source HEAD changed during recovery: ${transaction.checkId}.`);
  }
  if (transaction.stage === "prepared") {
    const status = await getGitStatusShort(project.path);
    if (status.length === 0) {
      await git(project.path, ["apply", "--binary", patchPath]);
    } else {
      await git(project.path, ["apply", "--check", "--reverse", "--binary", patchPath]);
    }
    await verifyIntegrationWorkingState(project.path, transactionPath, transaction);
    transaction = await advanceIntegrationApplyTransaction(transactionPath, transaction, "patch-applied");
  }
  if (transaction.stage === "patch-applied") {
    for (const target of check.resultTargets) {
      await markWorktreeApplied(runtime, target.worktreeId, {
        applyRunId: transaction.runId,
        worktreeDiffHash: target.diffHash,
        appliedCommit: head ?? undefined,
      });
    }
    transaction = await advanceIntegrationApplyTransaction(transactionPath, transaction, "metadata-updated");
  }
  if (transaction.stage === "metadata-updated") {
    const applied = transaction.publishedCheck;
    await lease.assertCurrent();
    await writeCheckArtifacts(runtime, directory, applied);
    await appendIntegrationEvent(directory, transaction.checkId, "integration-check.apply.completed", { runId: transaction.runId });
    transaction = await advanceIntegrationApplyTransaction(transactionPath, transaction, "evidence-written");
    check = applied;
  }
  if (transaction.stage === "evidence-written" || transaction.stage === "completed") {
    await advanceIntegrationAuthorizationSource(project, runtime, transaction);
    await reconcileCommittedTransitionExecution(runtime, {
      operationId: binding.operationId,
      authorizationId: binding.authorizationId,
      authorizationEpoch: binding.authorizationEpoch,
      transition: "integration-check.apply",
      targetId: transaction.checkId,
      manifestHash: transaction.manifestHash,
      claimToken: binding.claimToken,
      fencingToken: binding.fencingToken,
      evidenceRefs: [check.latestArtifactRef!],
    });
    if (transaction.stage !== "completed") {
      transaction = await advanceIntegrationApplyTransaction(transactionPath, transaction, "completed");
    }
    return { check: await readIntegrationCheck(runtime, transaction.checkId), artifactDirectory: directory };
  }
  throw new Error(`IntegrationCheck transaction cannot recover from ${transaction.stage}: ${transaction.checkId}.`);
}

async function computeIntegrationExpectedState(
  projectPath: string,
  transactionPath: string,
  patchPath: string,
): Promise<{ diffHash: string; expectedTree: string; changedPaths: string[] }> {
  const indexPath = `${transactionPath}.prepare.index`;
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    await gitTextWithEnv(projectPath, ["read-tree", "HEAD"], env);
    await gitTextWithEnv(projectPath, ["apply", "--cached", "--binary", patchPath], env);
    const diff = await gitRawWithEnv(projectPath, ["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", "HEAD"], env);
    const changedPaths = parseNameStatusPaths(await gitTextWithEnv(projectPath, ["diff", "--cached", "--name-status", "-z", "--find-renames", "HEAD"], env));
    return {
      diffHash: createHash("sha256").update(diff).digest("hex"),
      expectedTree: (await gitTextWithEnv(projectPath, ["write-tree"], env)).trim(),
      changedPaths,
    };
  } finally {
    await rm(indexPath, { force: true }).catch(() => undefined);
  }
}

async function verifyIntegrationWorkingState(
  projectPath: string,
  transactionPath: string,
  transaction: IntegrationCheckApplyTransaction,
): Promise<void> {
  const indexPath = `${transactionPath}.verify.index`;
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    await gitTextWithEnv(projectPath, ["read-tree", "HEAD"], env);
    await gitTextWithEnv(projectPath, ["add", "--all", "--", ".", ":(exclude)node_modules", ":(exclude)node_modules/**"], env);
    const diff = await gitRawWithEnv(projectPath, ["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", "HEAD"], env);
    const changedPaths = parseNameStatusPaths(await gitTextWithEnv(projectPath, ["diff", "--cached", "--name-status", "-z", "--find-renames", "HEAD"], env));
    const tree = (await gitTextWithEnv(projectPath, ["write-tree"], env)).trim();
    if (createHash("sha256").update(diff).digest("hex") !== transaction.diffHash
      || tree !== transaction.expectedTree
      || JSON.stringify(changedPaths) !== JSON.stringify(transaction.changedPaths)) {
      throw new Error(`IntegrationCheck working state does not match the journaled candidate: ${transaction.checkId}.`);
    }
  } finally {
    await rm(indexPath, { force: true }).catch(() => undefined);
  }
}

async function advanceIntegrationAuthorizationSource(
  project: ManagedProject,
  runtime: ProjectApplyExecutionScope["runtime"],
  transaction: IntegrationCheckApplyTransaction,
): Promise<void> {
  const sourceHead = await getGitCommit(project.path);
  if (!sourceHead || sourceHead !== transaction.sourceHeadBefore) {
    throw new Error(`IntegrationCheck source HEAD is stale after apply: ${transaction.checkId}.`);
  }
  const sourceStateHash = createHash("sha256").update(JSON.stringify(await getGitStatusShort(project.path))).digest("hex");
  const current = await readExecutionAuthorization(runtime, transaction.authorization.authorizationId);
  if (current.epoch === transaction.authorization.authorizationEpoch + 1
    && current.sourceHead === sourceHead
    && current.sourceStateHash === sourceStateHash) return;
  await advanceCommittedLocalExecutionAuthorizationSource(runtime, {
    operationId: transaction.authorization.operationId,
    authorizationId: transaction.authorization.authorizationId,
    authorizationEpoch: transaction.authorization.authorizationEpoch,
    transition: "integration-check.apply",
    targetId: transaction.checkId,
    manifestHash: transaction.manifestHash,
    claimToken: transaction.authorization.claimToken,
    fencingToken: transaction.authorization.fencingToken,
    snapshot: transaction.authorization.snapshot,
    sourceHead,
    sourceStateHash,
  });
}

async function advanceIntegrationApplyTransaction(
  path: string,
  transaction: IntegrationCheckApplyTransaction,
  stage: IntegrationCheckApplyTransaction["stage"],
): Promise<IntegrationCheckApplyTransaction> {
  const next = { ...transaction, stage, blockedReason: null, updatedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

function integrationApplyTransactionPath(directory: string): string {
  return join(directory, "apply-transaction.json");
}

function integrationDiscardTransactionPath(directory: string): string {
  return join(directory, "discard-transaction.json");
}

async function advanceIntegrationDiscardTransaction(
  path: string,
  transaction: IntegrationCheckDiscardTransaction,
  stage: IntegrationCheckDiscardTransaction["stage"],
): Promise<IntegrationCheckDiscardTransaction> {
  const next = { ...transaction, stage, blockedReason: null, updatedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function readIntegrationApplyTransaction(path: string): Promise<IntegrationCheckApplyTransaction> {
  const value = JSON.parse(await readFile(path, "utf8")) as IntegrationCheckApplyTransaction;
  if (value.version !== "1.0"
    || !value.checkId
    || !value.changeId
    || !value.runId
    || !/^[a-f0-9]{64}$/.test(value.manifestHash)
    || !/^[a-f0-9]{64}$/.test(value.artifactHash)
    || !/^[a-f0-9]{64}$/.test(value.publishedCheckHash ?? "")
    || !value.publishedCheck
    || value.publishedCheck.id !== value.checkId
    || integrationCheckActionManifestHash(value.publishedCheck) !== value.publishedCheckHash
    || !/^[a-f0-9]{64}$/.test(value.diffHash)
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.expectedTree)
    || !Array.isArray(value.changedPaths)
    || value.changedPaths.some((item) => typeof item !== "string"
      || item.startsWith("/")
      || item.startsWith("\\\\")
      || item.includes("..")
      || /^[a-zA-Z]:[\\/]/.test(item))
    || !["prepared", "patch-applied", "metadata-updated", "evidence-written", "completed"].includes(value.stage)
    || !value.authorization?.operationId
    || (value.approvalActionId !== null && value.approvalActionId !== "apply-check.apply")
    || !value.authorization.claimToken
    || !isHighImpactApprovalScope(value.actionScope)
    || value.actionScope.changeId !== value.changeId
    || value.actionScope.authorizationId !== value.authorization.authorizationId
    || value.actionScope.targetManifestHash !== value.manifestHash) {
    throw new Error(`Invalid IntegrationCheck apply transaction: ${path}.`);
  }
  if (basename(dirname(path)) !== value.checkId) throw new Error(`IntegrationCheck apply transaction directory is stale: ${path}.`);
  return value;
}

async function readIntegrationDiscardTransaction(path: string): Promise<IntegrationCheckDiscardTransaction> {
  const value = JSON.parse(await readFile(path, "utf8")) as IntegrationCheckDiscardTransaction;
  if (value.version !== "1.0"
    || !value.checkId
    || !value.changeId
    || !/^[a-f0-9]{64}$/.test(value.manifestHash)
    || !/^[a-f0-9]{64}$/.test(value.publishedCheckHash ?? "")
    || !value.publishedCheck
    || value.publishedCheck.id !== value.checkId
    || integrationCheckActionManifestHash(value.publishedCheck) !== value.publishedCheckHash
    || !["prepared", "evidence-written", "completed"].includes(value.stage)
    || !value.authorization?.operationId
    || (value.approvalActionId !== null && value.approvalActionId !== "apply-check.discard")
    || !value.authorization.claimToken
    || !isHighImpactApprovalScope(value.actionScope)
    || value.actionScope.changeId !== value.changeId
    || value.actionScope.authorizationId !== value.authorization.authorizationId
    || value.actionScope.targetManifestHash !== value.manifestHash) {
    throw new Error(`Invalid IntegrationCheck discard transaction: ${path}.`);
  }
  if (basename(dirname(path)) !== value.checkId) throw new Error(`IntegrationCheck discard transaction directory is stale: ${path}.`);
  return value;
}
