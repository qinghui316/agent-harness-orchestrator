import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { collectWorktreeDiff, parseNameStatusPaths } from "../audit/diff.js";
import { writeJsonFile } from "../fs/json.js";
import { projectHarnessSharedWriterRoot, withProjectHarnessWriterLock } from "../project-harness/writer-lock.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { projectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { commitTreeAndUpdateHead, getGitCommit, getGitStatusShort, git, gitRaw, gitRawWithEnv, gitText, gitTextWithEnv } from "../project/git.js";
import { withProjectWriteLeaseAtPath } from "../project/project-write-lease.js";
import {
  appendLocalExecutionAuthorizationTargets,
  advanceCommittedLocalExecutionAuthorizationSource,
  assertTransitionExecutionCurrent,
  assertScopedAutoExecutionEnabled,
  claimTransitionExecution,
  markTransitionExecutionStarted,
  readTransitionExecution,
  reconcileCommittedTransitionExecution,
  recordTransitionExecutionTerminal,
  readExecutionAuthorization,
  reserveTransitionExecutionCommitPoint,
} from "../workflow-runtime/execution-authorization.js";
import { appendRunEvent, buildRunId } from "../run/manager.js";
import { readRun } from "../run/repository.js";
import { markWorktreeApplied, removeWorktreeUnderLease, writeWorktreeIndex } from "../worktree/manager.js";
import { getWorktreeMetadataPath } from "../worktree/paths.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import type { ManagedProject, RunMetadata, RunStatus, WorktreeMetadata } from "../types/index.js";
import { isHighImpactApprovalScope, type HighImpactApprovalRecoveryReceipt } from "../workflow-actions/high-impact-approval.js";
import {
  assertApplyActionScope,
  executionAuthorizationSnapshot,
  projectApplyActionScope,
  resolveProjectApplyExecutionScope,
  type ProjectApplyExecutionScope,
} from "./execution-scope.js";
import { evaluateSkillNativeApplyGate, worktreeApplyManifestHash } from "./gate.js";
import { buildApplyPaths, buildDiscardPaths, displayArtifactPath } from "./paths.js";
import type { ApplyTransaction, WorktreeApplyOptions, WorktreeApplyResult, WorktreeDiscardOptions, WorktreeDiscardResult, WorktreeDiscardTransaction, WorktreeResultApplyResult } from "./types.js";

export async function applyResultToProject(project: ManagedProject, worktreeId: string, options: WorktreeApplyOptions = {}): Promise<WorktreeResultApplyResult> {
  return applyWorktree(project, worktreeId, options);
}

export async function applyWorktree(project: ManagedProject, worktreeId: string, options: WorktreeApplyOptions = {}): Promise<WorktreeApplyResult> {
  if (options.message && !options.commit) {
    throw new Error("Cannot use --message without --commit.");
  }
  const recovered = await recoverExistingApplyTransaction(project, worktreeId, options, options.userConfirmed === true);
  if (recovered) return recovered;
  return withCurrentApplyScope(project, worktreeId, "source-apply", async (scope, lease) => {
    const gate = await evaluateSkillNativeApplyGate(project, scope.runtime, scope.harness, worktreeId);
    if (!gate.ready) throw new Error(`Cannot authorize worktree apply:\n${gate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
    const current = await readExecutionAuthorization(scope.runtime, scope.authorization.id);
    const sourceStateHash = createHash("sha256").update(JSON.stringify(await getGitStatusShort(project.path))).digest("hex");
    if (gate.sourceHead !== current.sourceHead || sourceStateHash !== current.sourceStateHash) {
      throw new Error("Local execution authorization source state is stale.");
    }
    const manifestHash = worktreeApplyManifestHash(gate);
    if (current.mode === "stepwise") {
      if (!options.userConfirmed) throw new Error("Stepwise source apply requires the current user confirmation.");
    } else {
      assertScopedAutoExecutionEnabled();
    }
    assertApplyActionScope(projectApplyActionScope(scope, manifestHash), options.actionScope);
    const actionScope = options.actionScope;
    if (!actionScope) throw new Error("Apply requires the exact current approval scope.");
    const authorizationSnapshot = executionAuthorizationSnapshot(current);
    const authorization = await appendLocalExecutionAuthorizationTargets(
      scope.runtime,
      current.id,
      current.epoch,
      authorizationSnapshot,
      { projectId: scope.runtime.projectId, changeId: gate.changeId },
      [{ transition: "source.apply", targetId: worktreeId, manifestHash }],
    );
    const claim = await claimTransitionExecution(scope.runtime, {
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      transition: "source.apply",
      targetId: worktreeId,
      manifestHash,
      snapshot: authorizationSnapshot,
      claimedBy: "apply-transaction",
      claimTtlMs: 10 * 60_000,
    });
    await markTransitionExecutionStarted(scope.runtime, claim.operationId, claim.claimToken, claim.fencingToken);
    const binding: ApplyTransaction["authorization"] = {
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      snapshot: authorizationSnapshot,
      manifestHash,
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
    };
    try {
      const result = await applyWorktreeWithLease(project, scope, worktreeId, { ...options, actionScope }, lease, binding);
      if (result.apply.status !== "applied") throw new Error("Authorized worktree apply failed.");
      return result;
    } catch (error) {
      const identityHash = worktreeMetadataIdentityHash(await readWorktreeMetadata(scope.runtime, worktreeId));
      const transaction = await findApplyTransaction(scope.runtime.runsRoot, worktreeId, identityHash);
      if (transaction) {
        const execution = await readTransitionExecution(scope.runtime, transaction.transaction.authorization.operationId);
        if (execution.commitPointReservedAt) {
          const recoveredAfterCommit = await recoverApplyTransaction(
            project,
            scope.runtime,
            worktreeId,
            options,
            lease,
            identityHash,
          );
          if (recoveredAfterCommit) return recoveredAfterCommit;
          throw error;
        }
      }
      await recordTransitionExecutionTerminal(scope.runtime, {
        operationId: claim.operationId,
        claimToken: claim.claimToken,
        fencingToken: claim.fencingToken,
        outcome: "retryable-failed",
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
      throw error;
    }
  });
}

export async function recoverPendingApplyTransactions(project: ManagedProject): Promise<WorktreeApplyResult[]> {
  return (await recoverApplyApprovalReceipts(project, false)).map((receipt) => receipt.result);
}

export interface CompletedWorktreeDisposition {
  changeId: string;
  worktreeId: string;
  status: "applied" | "discarded";
}

export async function listCompletedWorktreeDispositions(
  runtime: Pick<ProjectApplyExecutionScope["runtime"], "runsRoot">,
  changeId: string,
): Promise<CompletedWorktreeDisposition[]> {
  if (!existsSync(runtime.runsRoot)) return [];
  const dispositions: CompletedWorktreeDisposition[] = [];
  const directories = (await readdir(runtime.runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const directory of directories) {
    const runDirectory = join(runtime.runsRoot, directory.name);
    const applyPath = join(runDirectory, "apply-transaction.json");
    if (existsSync(applyPath)) {
      const transaction = parseApplyTransaction(await readFile(applyPath, "utf8"), applyPath);
      if (transaction.stage === "completed" && transaction.changeId === changeId) {
        assertCompletedApplyResult(transaction, await readCompletedApplyResult(buildApplyPaths(runDirectory)));
        dispositions.push({ changeId, worktreeId: transaction.worktreeId, status: "applied" });
      }
    }
    const discardPath = join(runDirectory, "discard-transaction.json");
    if (existsSync(discardPath)) {
      const transaction = parseDiscardTransaction(await readFile(discardPath, "utf8"), discardPath);
      if (transaction.stage === "completed" && transaction.changeId === changeId) {
        assertCompletedDiscardResult(
          transaction,
          await readCompletedDiscardResult(buildDiscardPaths(runDirectory)),
        );
        dispositions.push({ changeId, worktreeId: transaction.worktreeId, status: "discarded" });
      }
    }
  }
  return dispositions;
}

export async function recoverApplyApprovalReceipts(
  project: ManagedProject,
  includeCompleted = true,
  onReceipt?: (receipt: HighImpactApprovalRecoveryReceipt<WorktreeApplyResult>) => Promise<void>,
): Promise<HighImpactApprovalRecoveryReceipt<WorktreeApplyResult>[]> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready" || !existsSync(state.resolution.paths.runsRoot)) return [];
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const receipts: HighImpactApprovalRecoveryReceipt<WorktreeApplyResult>[] = [];
  const directories = (await readdir(state.resolution.paths.runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const directory of directories) {
    const transactionPath = join(state.resolution.paths.runsRoot, directory.name, "apply-transaction.json");
    if (!existsSync(transactionPath)) continue;
    const transaction = parseApplyTransaction(await readFile(transactionPath, "utf8"), transactionPath);
    if (!includeCompleted && transaction.stage === "completed") continue;
    if (transaction.actionScope.projectId !== runtime.projectId) {
      throw new Error(`ApplyTransaction project scope is stale: ${transactionPath}.`);
    }
    const recovered = transaction.stage === "completed"
      ? await readCompletedApplyApprovalResult(runtime, transactionPath, transaction)
      : await recoverExistingApplyTransaction(project, transaction.worktreeId, {
        commit: transaction.commitRequested,
        message: transaction.commitMessage,
        userConfirmed: true,
      }, false);
    if (recovered) {
      const receipt: HighImpactApprovalRecoveryReceipt<WorktreeApplyResult> = {
        operation: "source.apply",
        approvalActionId: transaction.approvalActionId,
        targetId: transaction.worktreeId,
        scope: transaction.actionScope,
        result: recovered,
      };
      await onReceipt?.(receipt);
      receipts.push(receipt);
    }
  }
  return receipts;
}

export async function recoverPendingDiscardTransactions(project: ManagedProject): Promise<WorktreeDiscardResult[]> {
  return (await recoverDiscardApprovalReceipts(project, false)).map((receipt) => receipt.result);
}

export async function recoverDiscardApprovalReceipts(
  project: ManagedProject,
  includeCompleted = true,
  onReceipt?: (receipt: HighImpactApprovalRecoveryReceipt<WorktreeDiscardResult>) => Promise<void>,
): Promise<HighImpactApprovalRecoveryReceipt<WorktreeDiscardResult>[]> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready" || !existsSync(state.resolution.paths.runsRoot)) return [];
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const receipts: HighImpactApprovalRecoveryReceipt<WorktreeDiscardResult>[] = [];
  const directories = (await readdir(state.resolution.paths.runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const directory of directories) {
    const path = join(state.resolution.paths.runsRoot, directory.name, "discard-transaction.json");
    if (!existsSync(path)) continue;
    const transaction = parseDiscardTransaction(await readFile(path, "utf8"), path);
    if (!includeCompleted && transaction.stage === "completed") continue;
    if (transaction.actionScope.projectId !== runtime.projectId) {
      throw new Error(`Discard transaction project scope is stale: ${path}.`);
    }
    const recovered = transaction.stage === "completed"
      ? await recoverDiscardAfterCommit(runtime, buildDiscardPaths(dirname(path)), transaction)
      : await recoverExistingDiscardTransaction(project, transaction.worktreeId, transaction.actionScope, false);
    if (recovered) {
      const receipt: HighImpactApprovalRecoveryReceipt<WorktreeDiscardResult> = {
        operation: "worktree.discard",
        approvalActionId: transaction.approvalActionId,
        targetId: transaction.worktreeId,
        scope: transaction.actionScope,
        result: recovered,
      };
      await onReceipt?.(receipt);
      receipts.push(receipt);
    }
  }
  return receipts;
}

async function readCompletedApplyApprovalResult(
  runtime: ProjectApplyExecutionScope["runtime"],
  transactionPath: string,
  transaction: ApplyTransaction,
): Promise<WorktreeApplyResult> {
  const paths = buildApplyPaths(dirname(transactionPath));
  await reconcileApplyTransitionReceipt(runtime, paths, transaction);
  const result = await readCompletedApplyResult(paths);
  assertCompletedApplyResult(transaction, result);
  return result;
}

async function applyWorktreeWithLease(
  project: ManagedProject,
  scope: ProjectApplyExecutionScope,
  worktreeId: string,
  options: WorktreeApplyOptions,
  lease: Parameters<Parameters<typeof withProjectWriteLeaseAtPath>[2]>[0],
  authorization: ApplyTransaction["authorization"],
): Promise<WorktreeApplyResult> {
  const runtime = scope.runtime;
  const gate = await evaluateSkillNativeApplyGate(project, runtime, scope.harness, worktreeId);
  if (!gate.ready) {
    throw new Error(`Cannot apply worktree:\n${gate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (!gate.validation || !gate.audit || !gate.reviewAuditId) {
    throw new Error("Cannot apply worktree: missing gate evidence.");
  }

  const runId = buildRunId(gate.changeId, ["worktree-apply", worktreeId, gate.diffHash, options.commit ? "commit" : "no-commit"]);
  const directory = join(runtime.runsRoot, runId);
  const relativeDir = displayArtifactPath(runtime, directory);
  const paths = buildApplyPaths(directory);
  const artifacts = {
    owner: runtime.runArtifactOwner,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
    apply: `${relativeDir}/apply.json`,
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: gate.changeId,
    projectPath: project.path,
    runtime: "worktree-apply",
    executionMode: "direct",
    proposalOnly: false,
    command: ["git", "apply", "--binary", artifacts.diff],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
  };
  await writeJsonFile(paths.run, run);
  await writeFile(paths.context, "Worktree apply gate run. Source of truth is apply.json and diff.patch.\n", "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await writeFile(paths.diff, (await collectWorktreeDiff(runtime, worktreeId, gate.changeId)).diff, "utf8");
  await writeFile(paths.diffStat, gate.diffStat, "utf8");
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { runtime: "worktree-apply", worktreeId } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.started", runId, data: { worktreeId, diffHash: gate.diffHash } });

  let applyStatus: "applied" | "failed" = "failed";
  let commitHash: string | undefined;
  let sourceHeadAfter: string | null = null;
  let transaction: ApplyTransaction = {
    version: "1.0",
    id: `apply-transaction-${runId}`,
    changeId: gate.changeId,
    worktreeId,
    worktreeIdentityHash: worktreeMetadataIdentityHash(gate.worktree),
    runId,
    diffHash: gate.diffHash,
    manifestHash: authorization.manifestHash,
    changedPaths: gate.changedPaths,
    expectedTree: gate.expectedTree,
    sourceHeadBefore: gate.sourceHead ?? "",
    stage: "prepared",
    approvalActionId: options.approvalActionId ?? null,
    commitRequested: options.commit === true,
    commitMessage: options.message?.trim() || `Apply ${gate.changeId} from ${worktreeId}`,
    commitHash: null,
    validationId: gate.validation.id,
    auditId: gate.audit.id,
    reviewAuditId: gate.reviewAuditId,
    authorization,
    actionScope: options.actionScope!,
    blockedReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(paths.transaction, transaction);
  try {
    run = { ...run, status: "running" };
    await writeJsonFile(paths.run, run);
    await lease.heartbeat();
    transaction = await validateApplyRecoveryAuthorization(runtime, paths, transaction);
    await reserveApplyCommitPoint(runtime, transaction);
    await git(project.path, ["apply", "--binary", paths.diff]);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "patch-applied");
    if (options.commit) {
      await verifyWorkingTreeMatchesTransaction(project.path, paths.transaction, transaction);
      await stageAndVerifyApplyManifest(project.path, paths.transaction, transaction);
      if ((await getGitCommit(project.path)) !== transaction.sourceHeadBefore) {
        throw new Error("Source HEAD changed before the authorized apply commit.");
      }
      transaction = await validateApplyRecoveryAuthorization(runtime, paths, transaction);
      commitHash = await commitTreeAndUpdateHead(project.path, {
        tree: transaction.expectedTree,
        parent: transaction.sourceHeadBefore,
        message: transaction.commitMessage,
      });
      transaction = await advanceApplyTransaction(paths.transaction, { ...transaction, commitHash }, "commit-created");
    }
    sourceHeadAfter = await getGitCommit(project.path);
    await markWorktreeApplied(runtime, worktreeId, {
      applyRunId: runId,
      worktreeDiffHash: gate.diffHash,
      appliedCommit: commitHash,
    });
    applyStatus = "applied";
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.completed", runId, data: { committed: options.commit === true, commitHash } });
  } catch (error) {
    transaction = { ...transaction, blockedReason: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() };
    await writeJsonFile(paths.transaction, transaction);
    await writeFile(paths.stderr, error instanceof Error ? `${error.message}\n` : `${String(error)}\n`, "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.failed", runId, data: { error: error instanceof Error ? error.message : String(error) } });
  }

  const apply = {
    version: "1.0" as const,
    changeId: gate.changeId,
    worktreeId,
    worktreeDiffHash: gate.diffHash,
    validationId: gate.validation.id,
    auditId: gate.audit.id,
    reviewAuditId: gate.reviewAuditId,
    sourceHeadBefore: gate.sourceHead,
    sourceHeadAfter,
    committed: options.commit === true && applyStatus === "applied",
    ...(commitHash ? { commitHash } : {}),
    status: applyStatus,
  };
  await lease.assertCurrent();
  await writeJsonFile(paths.apply, apply);
  if (applyStatus === "applied") {
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "evidence-written");
    await reconcileApplyTransitionReceipt(runtime, paths, transaction);
    await advanceAuthorizationSourceAfterApply(project, runtime, transaction);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "completed");
  }
  const status: RunStatus = applyStatus === "applied" ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, status === "completed" ? 0 : 1);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { run, apply };
}

async function advanceApplyTransaction(path: string, transaction: ApplyTransaction, stage: ApplyTransaction["stage"]): Promise<ApplyTransaction> {
  const next = { ...transaction, stage, blockedReason: null, updatedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function recoverApplyTransaction(
  project: ManagedProject,
  runtime: ProjectApplyExecutionScope["runtime"],
  worktreeId: string,
  options: WorktreeApplyOptions,
  lease: Parameters<Parameters<typeof withProjectWriteLeaseAtPath>[2]>[0],
  worktreeIdentityHash: string,
): Promise<WorktreeApplyResult | null> {
  const found = await findApplyTransaction(runtime.runsRoot, worktreeId, worktreeIdentityHash);
  if (!found) return null;
  let { transaction } = found;
  if (transaction.commitRequested !== (options.commit === true)) {
    throw new Error("Existing ApplyTransaction commit mode does not match this retry.");
  }
  const paths = buildApplyPaths(dirname(found.path));
  await readStrictRunAtPath(paths.run);
  if (transaction.stage === "completed") {
    await reconcileApplyTransitionReceipt(runtime, paths, transaction);
    await advanceAuthorizationSourceAfterApply(project, runtime, transaction);
    const result = await readCompletedApplyResult(paths);
    assertCompletedApplyResult(transaction, result);
    return result;
  }
  await lease.assertCurrent();
  const head = await getGitCommit(project.path);
  if (head !== transaction.sourceHeadBefore) {
    if (!transaction.commitRequested) throw new Error("Source HEAD changed during an uncommitted ApplyTransaction.");
    const parent = await getGitCommit(project.path, `${head}^`);
    const tree = head ? await git(project.path, ["show", "-s", "--format=%T", head]) : null;
    if (!head || parent !== transaction.sourceHeadBefore || tree !== transaction.expectedTree) {
      throw new Error("Source HEAD does not match the recoverable authorized apply commit.");
    }
    transaction = await advanceApplyTransaction(paths.transaction, { ...transaction, commitHash: head }, "commit-created");
  } else if (transaction.stage === "prepared" || transaction.stage === "patch-applied") {
    transaction = await validateApplyRecoveryAuthorization(runtime, paths, transaction);
    await reserveApplyCommitPoint(runtime, transaction);
    const status = await getGitStatusShort(project.path);
    if (transaction.stage === "prepared" && status.length === 0) {
      await verifyStoredApplyPatch(paths.diff, transaction);
      await git(project.path, ["apply", "--binary", paths.diff]);
      transaction = await advanceApplyTransaction(paths.transaction, transaction, "patch-applied");
    }
    if (transaction.commitRequested) {
      await verifyWorkingTreeMatchesTransaction(project.path, paths.transaction, transaction);
      await stageAndVerifyApplyManifest(project.path, paths.transaction, transaction);
      transaction = await validateApplyRecoveryAuthorization(runtime, paths, transaction);
      const commitHash = await commitTreeAndUpdateHead(project.path, {
        tree: transaction.expectedTree,
        parent: transaction.sourceHeadBefore,
        message: transaction.commitMessage,
      });
      transaction = await advanceApplyTransaction(paths.transaction, { ...transaction, commitHash }, "commit-created");
    } else {
      await verifyWorkingTreeMatchesTransaction(project.path, paths.transaction, transaction);
      transaction = await advanceApplyTransaction(paths.transaction, transaction, "patch-applied");
    }
  }
  if (transaction.stage === "commit-created" || transaction.stage === "patch-applied") {
    const apply = {
      version: "1.0" as const,
      changeId: transaction.changeId,
      worktreeId: transaction.worktreeId,
      worktreeDiffHash: transaction.diffHash,
      validationId: transaction.validationId,
      auditId: transaction.auditId,
      reviewAuditId: transaction.reviewAuditId,
      sourceHeadBefore: transaction.sourceHeadBefore,
      sourceHeadAfter: await getGitCommit(project.path),
      committed: transaction.commitRequested,
      ...(transaction.commitHash ? { commitHash: transaction.commitHash } : {}),
      status: "applied" as const,
    };
    await markWorktreeApplied(runtime, worktreeId, {
      applyRunId: transaction.runId,
      worktreeDiffHash: transaction.diffHash,
      appliedCommit: transaction.commitHash ?? undefined,
    });
    await writeJsonFile(paths.apply, apply);
    const run = await finishRun(paths.run, await readStrictRunAtPath(paths.run), "completed", 0);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "evidence-written");
    await reconcileApplyTransitionReceipt(runtime, paths, transaction);
    await advanceAuthorizationSourceAfterApply(project, runtime, transaction);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "completed");
    return { run, apply };
  }
  if (transaction.stage === "evidence-written") {
    await reconcileApplyTransitionReceipt(runtime, paths, transaction);
    await advanceAuthorizationSourceAfterApply(project, runtime, transaction);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "completed");
    return readCompletedApplyResult(paths);
  }
  throw new Error(`ApplyTransaction cannot recover from stage ${transaction.stage}.`);
}

async function validateApplyRecoveryAuthorization(
  runtime: ProjectApplyExecutionScope["runtime"],
  paths: ReturnType<typeof buildApplyPaths>,
  transaction: ApplyTransaction,
): Promise<ApplyTransaction> {
  const binding = transaction.authorization;
  const execution = await readTransitionExecution(runtime, binding.operationId);
  const expectedManifestHash = applyTransactionManifestHash(transaction);
  const executionMatches = execution.authorizationId === binding.authorizationId
    && execution.authorizationEpoch === binding.authorizationEpoch
    && execution.transition === "source.apply"
    && execution.targetId === transaction.worktreeId
    && execution.manifestHash === binding.manifestHash
    && execution.claimToken === binding.claimToken
    && execution.fencingToken === binding.fencingToken
    && execution.status !== "terminal-failed"
    && execution.status !== "completed";
  if (!executionMatches || binding.manifestHash !== expectedManifestHash) {
    throw new Error("ApplyTransaction recovery operation binding is stale, forged, or already terminal.");
  }
  if (execution.commitPointReservedAt) return transaction;
  const authorization = await readExecutionAuthorization(runtime, binding.authorizationId);
  const snapshotMatches = Object.entries(binding.snapshot).every(([key, value]) => authorization[key as keyof typeof binding.snapshot] === value);
  const targetMatches = authorization.targets.some((target) => target.transition === "source.apply"
    && target.targetId === transaction.worktreeId && target.manifestHash === binding.manifestHash);
  if (authorization.status !== "active"
    || Date.parse(authorization.expiresAt) <= Date.now()
    || authorization.projectId !== runtime.projectId
    || authorization.changeId !== transaction.changeId
    || authorization.epoch !== binding.authorizationEpoch
    || !snapshotMatches
    || binding.manifestHash !== expectedManifestHash
    || !targetMatches) {
    throw new Error("ApplyTransaction recovery authorization is stale, expired, revoked, or outside the original target scope.");
  }
  let recovered = execution;
  const now = new Date();
  if (execution.status === "retryable-failed" || Date.parse(execution.claimExpiresAt) <= now.getTime()) {
    recovered = await claimTransitionExecution(runtime, {
      authorizationId: binding.authorizationId,
      authorizationEpoch: binding.authorizationEpoch,
      transition: "source.apply",
      targetId: transaction.worktreeId,
      manifestHash: binding.manifestHash,
      snapshot: binding.snapshot,
      claimedBy: "apply-transaction-recovery",
      claimTtlMs: 10 * 60_000,
      now,
    });
  }
  if (recovered.status === "claimed") {
    recovered = await markTransitionExecutionStarted(runtime, recovered.operationId, recovered.claimToken, recovered.fencingToken, now);
  }
  recovered = await assertTransitionExecutionCurrent(runtime, {
    operationId: recovered.operationId,
    authorizationId: binding.authorizationId,
    authorizationEpoch: binding.authorizationEpoch,
    transition: "source.apply",
    targetId: transaction.worktreeId,
    manifestHash: binding.manifestHash,
    claimToken: recovered.claimToken,
    fencingToken: recovered.fencingToken,
    now,
  });
  if (recovered.claimToken === binding.claimToken && recovered.fencingToken === binding.fencingToken) return transaction;
  const next: ApplyTransaction = {
    ...transaction,
    authorization: { ...binding, claimToken: recovered.claimToken, fencingToken: recovered.fencingToken },
    updatedAt: now.toISOString(),
  };
  await writeJsonFile(paths.transaction, next);
  return next;
}

async function reserveApplyCommitPoint(
  runtime: ProjectApplyExecutionScope["runtime"],
  transaction: ApplyTransaction,
): Promise<void> {
  const binding = transaction.authorization;
  await reserveTransitionExecutionCommitPoint(runtime, {
    operationId: binding.operationId,
    authorizationId: binding.authorizationId,
    authorizationEpoch: binding.authorizationEpoch,
    transition: "source.apply",
    targetId: transaction.worktreeId,
    manifestHash: binding.manifestHash,
    claimToken: binding.claimToken,
    fencingToken: binding.fencingToken,
  });
}

async function verifyStoredApplyPatch(path: string, transaction: ApplyTransaction): Promise<void> {
  const bytes = await readFile(path);
  if (createHash("sha256").update(bytes).digest("hex") !== transaction.diffHash) {
    throw new Error("Stored ApplyTransaction patch does not match the authorized diff hash.");
  }
}

async function reconcileApplyTransitionReceipt(
  runtime: ProjectApplyExecutionScope["runtime"],
  paths: ReturnType<typeof buildApplyPaths>,
  transaction: ApplyTransaction,
): Promise<void> {
  const authorization = transaction.authorization;
  await reconcileCommittedTransitionExecution(runtime, {
    operationId: authorization.operationId,
    authorizationId: authorization.authorizationId,
    authorizationEpoch: authorization.authorizationEpoch,
    transition: "source.apply",
    targetId: transaction.worktreeId,
    manifestHash: authorization.manifestHash,
    claimToken: authorization.claimToken,
    fencingToken: authorization.fencingToken,
    evidenceRefs: [displayArtifactPath(runtime, paths.apply)],
  });
}

async function advanceAuthorizationSourceAfterApply(
  project: ManagedProject,
  runtime: ProjectApplyExecutionScope["runtime"],
  transaction: ApplyTransaction,
): Promise<void> {
  const binding = transaction.authorization;
  const sourceHead = await getGitCommit(project.path);
  if (!sourceHead || (transaction.commitRequested && sourceHead !== transaction.commitHash)) {
    throw new Error("Authorized apply completed without the expected source HEAD.");
  }
  const sourceStateHash = createHash("sha256").update(JSON.stringify(await getGitStatusShort(project.path))).digest("hex");
  const current = await readExecutionAuthorization(runtime, binding.authorizationId);
  if (current.epoch === binding.authorizationEpoch + 1
    && current.sourceHead === sourceHead
    && current.sourceStateHash === sourceStateHash) {
    return;
  }
  await advanceCommittedLocalExecutionAuthorizationSource(runtime, {
    operationId: binding.operationId,
    authorizationId: binding.authorizationId,
    authorizationEpoch: binding.authorizationEpoch,
    transition: "source.apply",
    targetId: transaction.worktreeId,
    manifestHash: binding.manifestHash,
    claimToken: binding.claimToken,
    fencingToken: binding.fencingToken,
    snapshot: binding.snapshot,
    sourceHead,
    sourceStateHash,
  });
}

async function findApplyTransaction(
  runsRoot: string,
  worktreeId: string,
  worktreeIdentityHash?: string,
): Promise<{ path: string; transaction: ApplyTransaction } | null> {
  if (!existsSync(runsRoot)) return null;
  const directories = (await readdir(runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const directory of directories) {
    const path = join(runsRoot, directory.name, "apply-transaction.json");
    if (!existsSync(path)) continue;
    const transaction = parseApplyTransaction(await readFile(path, "utf8"), path);
    if (transaction.worktreeId === worktreeId
      && (!worktreeIdentityHash || transaction.worktreeIdentityHash === worktreeIdentityHash)) return { path, transaction };
  }
  return null;
}

async function stageAndVerifyApplyManifest(projectPath: string, transactionPath: string, transaction: ApplyTransaction): Promise<void> {
  const pathspecFile = `${transactionPath}.pathspec`;
  await writeFile(pathspecFile, Buffer.from(`${transaction.changedPaths.join("\0")}\0`, "utf8"));
  try {
    await git(projectPath, ["add", "--all", `--pathspec-from-file=${pathspecFile}`, "--pathspec-file-nul"]);
  } finally {
    await rm(pathspecFile, { force: true }).catch(() => undefined);
  }
  const stagedPaths = parseNameStatusPaths(await gitText(projectPath, ["diff", "--cached", "--name-status", "-z", "--find-renames", "HEAD"]));
  if (JSON.stringify(stagedPaths) !== JSON.stringify(transaction.changedPaths)) {
    throw new Error(`Staged paths do not match the authorized apply manifest. Expected ${transaction.changedPaths.join(", ")}; found ${stagedPaths.join(", ")}.`);
  }
  const stagedDiffHash = createHash("sha256").update(await gitRaw(projectPath, ["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", "HEAD"])).digest("hex");
  if (stagedDiffHash !== transaction.diffHash) throw new Error("Staged diff does not match the authorized worktree diff.");
  const stagedTree = await git(projectPath, ["write-tree"]);
  if (stagedTree !== transaction.expectedTree) throw new Error("Staged tree does not match the authorized worktree tree.");
}

async function verifyWorkingTreeMatchesTransaction(projectPath: string, transactionPath: string, transaction: ApplyTransaction): Promise<void> {
  const indexPath = `${transactionPath}.verify.index`;
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    await gitTextWithEnv(projectPath, ["read-tree", "HEAD"], env);
    await gitTextWithEnv(projectPath, ["add", "--all", "--", ".", ":(exclude)node_modules", ":(exclude)node_modules/**"], env);
    const diffHash = createHash("sha256").update(await gitRawWithEnv(projectPath, ["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", "HEAD"], env)).digest("hex");
    const tree = (await gitTextWithEnv(projectPath, ["write-tree"], env)).trim();
    if (diffHash !== transaction.diffHash || tree !== transaction.expectedTree) {
      throw new Error("Working tree does not match the recoverable authorized apply result.");
    }
  } finally {
    await rm(indexPath, { force: true }).catch(() => undefined);
  }
}

async function readCompletedApplyResult(paths: ReturnType<typeof buildApplyPaths>): Promise<WorktreeApplyResult> {
  return {
    run: await readStrictRunAtPath(paths.run),
    apply: JSON.parse(await readFile(paths.apply, "utf8")) as WorktreeApplyResult["apply"],
  };
}

async function recoverExistingApplyTransaction(
  project: ManagedProject,
  worktreeId: string,
  options: WorktreeApplyOptions,
  requireActionScope: boolean,
): Promise<WorktreeApplyResult | null> {
  const initialState = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (initialState.state !== "ready") return null;
  if (initialState.resolution.harness.projectId !== project.id
    || initialState.resolution.projectRoot !== project.path) {
    throw new Error("Apply recovery project identity is stale.");
  }
  const initialRuntime = projectExecutionRuntimePort(project, initialState.resolution);
  const initialMetadata = await readWorktreeMetadata(initialRuntime, worktreeId);
  const worktreeIdentityHash = worktreeMetadataIdentityHash(initialMetadata);
  const initialFound = await findApplyTransaction(initialRuntime.runsRoot, worktreeId, worktreeIdentityHash);
  if (!initialFound) return null;
  if (requireActionScope && initialFound.transaction.stage === "completed") {
    throw new Error(`Apply action already completed for worktree ${worktreeId}.`);
  }
  assertRecoverableApplyInvocation(initialFound.transaction, options, requireActionScope);
  const writerRoot = projectHarnessSharedWriterRoot(initialState.resolution.paths.sidecarRoot);
  return withProjectHarnessWriterLock(writerRoot, {
    projectId: initialRuntime.projectId,
    ownerId: `source-apply-recovery-${worktreeId}`,
    operation: "source-apply",
  }, async (writer) => withProjectWriteLeaseAtPath(initialRuntime.projectWriteLeasePath, {}, async (lease) => {
    const currentState = await resolveProjectRuntimeState(project, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (currentState.state !== "ready") {
      throw new Error(`Project Harness is not ready for ApplyTransaction recovery: ${currentState.state}.`);
    }
    const runtime = projectExecutionRuntimePort(project, currentState.resolution);
    if (runtime.runsRoot !== initialRuntime.runsRoot
      || runtime.workbenchRoot !== initialRuntime.workbenchRoot
      || projectHarnessSharedWriterRoot(currentState.resolution.paths.sidecarRoot) !== writerRoot) {
      throw new Error("Apply recovery runtime identity changed before execution.");
    }
    const currentMetadata = await readWorktreeMetadata(runtime, worktreeId);
    if (worktreeMetadataIdentityHash(currentMetadata) !== worktreeIdentityHash) {
      throw new Error(`ApplyTransaction worktree identity changed before recovery: ${worktreeId}.`);
    }
    const found = await findApplyTransaction(runtime.runsRoot, worktreeId, worktreeIdentityHash);
    if (!found) throw new Error(`ApplyTransaction disappeared before recovery: ${worktreeId}.`);
    assertRecoverableApplyInvocation(found.transaction, options, requireActionScope);
    await writer.assertCurrent();
    await lease.assertCurrent();
    return recoverApplyTransaction(project, runtime, worktreeId, options, lease, worktreeIdentityHash);
  }));
}

function assertCompletedApplyResult(transaction: ApplyTransaction, result: WorktreeApplyResult): void {
  const apply = result.apply;
  if (result.run.id !== transaction.runId
    || result.run.changeId !== transaction.changeId
    || result.run.status !== "completed"
    || apply.status !== "applied"
    || apply.changeId !== transaction.changeId
    || apply.worktreeId !== transaction.worktreeId
    || apply.worktreeDiffHash !== transaction.diffHash
    || apply.validationId !== transaction.validationId
    || apply.auditId !== transaction.auditId
    || apply.reviewAuditId !== transaction.reviewAuditId
    || apply.sourceHeadBefore !== transaction.sourceHeadBefore
    || apply.committed !== transaction.commitRequested
    || (transaction.commitRequested && apply.commitHash !== transaction.commitHash)) {
    throw new Error(`Completed ApplyTransaction result is stale or forged: ${transaction.worktreeId}.`);
  }
}

async function readCompletedDiscardResult(
  paths: ReturnType<typeof buildDiscardPaths>,
): Promise<WorktreeDiscardResult> {
  return {
    run: await readStrictRunAtPath(paths.run),
    discard: JSON.parse(await readFile(paths.discard, "utf8")) as WorktreeDiscardResult["discard"],
  };
}

function assertCompletedDiscardResult(
  transaction: WorktreeDiscardTransaction,
  result: WorktreeDiscardResult,
): void {
  if (result.run.id !== transaction.runId
    || result.run.changeId !== transaction.changeId
    || result.run.status !== "completed"
    || result.discard.status !== "discarded"
    || result.discard.changeId !== transaction.changeId
    || result.discard.worktreeId !== transaction.worktreeId) {
    throw new Error(`Completed discard result is stale or forged: ${transaction.worktreeId}.`);
  }
}

function assertRecoverableApplyInvocation(
  transaction: ApplyTransaction,
  options: WorktreeApplyOptions,
  requireActionScope: boolean,
): void {
  if (transaction.commitRequested !== (options.commit === true)) {
    throw new Error("Existing ApplyTransaction commit mode does not match this retry.");
  }
  if (requireActionScope) {
    if (!transaction.actionScope) throw new Error("ApplyTransaction is missing its approval scope.");
    assertApplyActionScope(transaction.actionScope, options.actionScope);
  }
}

export async function discardWorktree(
  project: ManagedProject,
  worktreeId: string,
  options: WorktreeDiscardOptions = {},
): Promise<WorktreeDiscardResult> {
  const recovered = await recoverExistingDiscardTransaction(project, worktreeId, options.actionScope);
  if (recovered) return recovered;
  return withCurrentApplyScope(project, worktreeId, "worktree-discard", async (scope, lease) => {
    const runtime = scope.runtime;
    const gate = await evaluateSkillNativeApplyGate(project, runtime, scope.harness, worktreeId);
    if (gate.worktree.status === "applied") {
      throw new Error(`Cannot discard applied worktree ${worktreeId}. Use worktree remove for cleanup.`);
    }
    if (!gate.validation || !gate.audit || !gate.reviewAuditId) {
      throw new Error("Cannot discard worktree: current Validation, Audit, and accepted review evidence are required.");
    }
    const manifestHash = worktreeApplyManifestHash(gate);
    assertApplyActionScope(projectApplyActionScope(scope, manifestHash), options.actionScope);
    const snapshot = executionAuthorizationSnapshot(scope.authorization);
    const authorization = await appendLocalExecutionAuthorizationTargets(
      runtime,
      scope.authorization.id,
      scope.authorization.epoch,
      snapshot,
      { projectId: runtime.projectId, changeId: gate.changeId },
      [{ transition: "worktree.discard", targetId: worktreeId, manifestHash }],
    );
    const claim = await claimTransitionExecution(runtime, {
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      transition: "worktree.discard",
      targetId: worktreeId,
      manifestHash,
      snapshot,
      claimedBy: "discard-transaction",
      claimTtlMs: 10 * 60_000,
    });
    await markTransitionExecutionStarted(runtime, claim.operationId, claim.claimToken, claim.fencingToken);

    const metadata = await readWorktreeMetadata(runtime, worktreeId);
    const changeId = gate.changeId;
    const runId = buildRunId(changeId, ["worktree-discard", worktreeId, manifestHash]);
    const directory = join(runtime.runsRoot, runId);
    const relativeDir = displayArtifactPath(runtime, directory);
    const paths = buildDiscardPaths(directory);
    const artifacts = {
      owner: runtime.runArtifactOwner,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      discard: `${relativeDir}/discard.json`,
    };
    await mkdir(directory, { recursive: true });
    const now = new Date().toISOString();
    const run: RunMetadata = {
      version: "1.0",
      id: runId,
      changeId,
      projectPath: project.path,
      runtime: "worktree-discard",
      executionMode: "direct",
      proposalOnly: false,
      command: ["worktree", "discard", worktreeId],
      status: "running",
      exitCode: null,
      signal: null,
      startedAt: now,
      finishedAt: null,
      artifacts,
    };
    await writeJsonFile(paths.run, run);
    await writeFile(paths.context, "Worktree discard gate run. Discard removes the exact reviewed checkout only.\n", "utf8");
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.stderr, "", "utf8");
    await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { runtime: "worktree-discard", worktreeId } });
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.started", runId, data: { worktreeId, manifestHash } });
    let transaction: WorktreeDiscardTransaction = {
      version: "1.0",
      worktreeId,
      changeId,
      runId,
      checkoutPath: metadata.checkoutPath,
      worktreeIdentityHash: worktreeMetadataIdentityHash(metadata),
      manifestHash,
      stage: "prepared",
      actionScope: options.actionScope!,
      approvalActionId: options.approvalActionId ?? null,
      authorization: {
        authorizationId: authorization.id,
        authorizationEpoch: authorization.epoch,
        snapshot,
        operationId: claim.operationId,
        claimToken: claim.claimToken,
        fencingToken: claim.fencingToken,
      },
      createdAt: now,
      updatedAt: now,
      blockedReason: null,
    };
    await writeJsonFile(paths.transaction, transaction);
    try {
      await lease.assertCurrent();
      await reserveTransitionExecutionCommitPoint(runtime, {
        operationId: claim.operationId,
        authorizationId: authorization.id,
        authorizationEpoch: authorization.epoch,
        transition: "worktree.discard",
        targetId: worktreeId,
        manifestHash,
        claimToken: claim.claimToken,
        fencingToken: claim.fencingToken,
      });
      await removeWorktreeUnderLease(runtime, worktreeId, true);
      transaction = await advanceDiscardTransaction(paths.transaction, transaction, "checkout-removed");
      return recoverDiscardAfterCommit(runtime, paths, transaction);
    } catch (error) {
      transaction = { ...transaction, blockedReason: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() };
      await writeJsonFile(paths.transaction, transaction);
      const execution = await readTransitionExecution(runtime, claim.operationId);
      if (execution.commitPointReservedAt) return recoverDiscardAfterCommit(runtime, paths, transaction);
      await rm(paths.transaction, { force: true });
      await recordTransitionExecutionTerminal(runtime, {
        operationId: claim.operationId,
        claimToken: claim.claimToken,
        fencingToken: claim.fencingToken,
        outcome: "retryable-failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

async function recoverExistingDiscardTransaction(
  project: ManagedProject,
  worktreeId: string,
  actionScope: WorktreeDiscardOptions["actionScope"],
  rejectCompleted = true,
): Promise<WorktreeDiscardResult | null> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") return null;
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const metadataPath = getWorktreeMetadataPath(runtime, worktreeId);
  const worktreeIdentityHash = existsSync(metadataPath)
    ? worktreeMetadataIdentityHash(await readWorktreeMetadata(runtime, worktreeId))
    : undefined;
  const found = await findDiscardTransaction(runtime.runsRoot, worktreeId, actionScope, worktreeIdentityHash);
  if (!found) return null;
  if (rejectCompleted && found.transaction.stage === "completed") {
    throw new Error(`Discard action already completed for worktree ${worktreeId}.`);
  }
  assertApplyActionScope(found.transaction.actionScope, actionScope);
  const writerRoot = projectHarnessSharedWriterRoot(state.resolution.paths.sidecarRoot);
  return withProjectHarnessWriterLock(writerRoot, {
    projectId: runtime.projectId,
    ownerId: `worktree-discard-recovery-${worktreeId}`,
    operation: "worktree-discard",
  }, async (writer) => withProjectWriteLeaseAtPath(runtime.projectWriteLeasePath, {}, async (lease) => {
    const currentState = await resolveProjectRuntimeState(project, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (currentState.state !== "ready") {
      throw new Error(`Project Harness is not ready for discard recovery: ${currentState.state}.`);
    }
    const currentRuntime = projectExecutionRuntimePort(project, currentState.resolution);
    if (currentRuntime.runsRoot !== runtime.runsRoot
      || currentRuntime.workbenchRoot !== runtime.workbenchRoot
      || projectHarnessSharedWriterRoot(currentState.resolution.paths.sidecarRoot) !== writerRoot) {
      throw new Error("Discard recovery runtime identity changed before execution.");
    }
    if (worktreeIdentityHash && existsSync(getWorktreeMetadataPath(currentRuntime, worktreeId))) {
      const currentIdentityHash = worktreeMetadataIdentityHash(await readWorktreeMetadata(currentRuntime, worktreeId));
      if (currentIdentityHash !== worktreeIdentityHash) throw new Error(`Discard recovery worktree identity changed: ${worktreeId}.`);
    }
    const current = await findDiscardTransaction(currentRuntime.runsRoot, worktreeId, actionScope, worktreeIdentityHash);
    if (!current) throw new Error(`Discard transaction disappeared before recovery: ${worktreeId}.`);
    assertApplyActionScope(current.transaction.actionScope, actionScope);
    await writer.assertCurrent();
    await lease.assertCurrent();
    return recoverDiscardAfterCommit(currentRuntime, buildDiscardPaths(dirname(current.path)), current.transaction);
  }));
}

async function recoverDiscardAfterCommit(
  runtime: ProjectApplyExecutionScope["runtime"],
  paths: ReturnType<typeof buildDiscardPaths>,
  initial: WorktreeDiscardTransaction,
): Promise<WorktreeDiscardResult> {
  let transaction = initial;
  await readStrictRunAtPath(paths.run);
  const binding = transaction.authorization;
  const execution = await readTransitionExecution(runtime, binding.operationId);
  if (!execution.commitPointReservedAt
    || execution.authorizationId !== binding.authorizationId
    || execution.authorizationEpoch !== binding.authorizationEpoch
    || execution.transition !== "worktree.discard"
    || execution.targetId !== transaction.worktreeId
    || execution.manifestHash !== transaction.manifestHash
    || execution.claimToken !== binding.claimToken
    || execution.fencingToken !== binding.fencingToken) {
    throw new Error(`Discard transaction lineage is stale or not committed: ${transaction.worktreeId}.`);
  }
  if (transaction.stage === "prepared") {
    const metadataPath = getWorktreeMetadataPath(runtime, transaction.worktreeId);
    if (existsSync(metadataPath)) {
      const currentMetadata = await readWorktreeMetadata(runtime, transaction.worktreeId);
      if (worktreeMetadataIdentityHash(currentMetadata) !== transaction.worktreeIdentityHash
        || currentMetadata.checkoutPath !== transaction.checkoutPath) {
        throw new Error(`Discard recovery worktree identity changed: ${transaction.worktreeId}.`);
      }
      await removeWorktreeUnderLease(runtime, transaction.worktreeId, true);
    } else {
      if (existsSync(transaction.checkoutPath)) {
        throw new Error(`Discard recovery found checkout without owned metadata: ${transaction.worktreeId}.`);
      }
      await writeWorktreeIndex(runtime);
    }
    transaction = await advanceDiscardTransaction(paths.transaction, transaction, "checkout-removed");
  }
  if (transaction.stage === "checkout-removed") {
    const discard = { version: "1.0" as const, changeId: transaction.changeId, worktreeId: transaction.worktreeId, status: "discarded" as const };
    await writeJsonFile(paths.discard, discard);
    const run = await finishRun(
      paths.run,
      await readStrictRunAtPath(paths.run),
      "completed",
      0,
    );
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "worktree.discard.completed", runId: transaction.runId, data: { worktreeId: transaction.worktreeId } });
    transaction = await advanceDiscardTransaction(paths.transaction, transaction, "evidence-written");
  }
  if (transaction.stage === "evidence-written" || transaction.stage === "completed") {
    await reconcileCommittedTransitionExecution(runtime, {
      operationId: binding.operationId,
      authorizationId: binding.authorizationId,
      authorizationEpoch: binding.authorizationEpoch,
      transition: "worktree.discard",
      targetId: transaction.worktreeId,
      manifestHash: transaction.manifestHash,
      claimToken: binding.claimToken,
      fencingToken: binding.fencingToken,
      evidenceRefs: [displayArtifactPath(runtime, paths.discard)],
    });
    if (transaction.stage !== "completed") {
      transaction = await advanceDiscardTransaction(paths.transaction, transaction, "completed");
    }
    const result = await readCompletedDiscardResult(paths);
    assertCompletedDiscardResult(transaction, result);
    return result;
  }
  throw new Error(`Discard transaction cannot recover from ${transaction.stage}: ${transaction.worktreeId}.`);
}

async function readStrictRunAtPath(runPath: string): Promise<RunMetadata> {
  const runDirectory = dirname(runPath);
  return readRun({ runsRoot: dirname(runDirectory) }, basename(runDirectory));
}

async function advanceDiscardTransaction(
  path: string,
  transaction: WorktreeDiscardTransaction,
  stage: WorktreeDiscardTransaction["stage"],
): Promise<WorktreeDiscardTransaction> {
  const next = { ...transaction, stage, blockedReason: null, updatedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function findDiscardTransaction(
  runsRoot: string,
  worktreeId: string,
  actionScope?: WorktreeDiscardOptions["actionScope"],
  worktreeIdentityHash?: string,
): Promise<{ path: string; transaction: WorktreeDiscardTransaction } | null> {
  if (!existsSync(runsRoot)) return null;
  const directories = (await readdir(runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const directory of directories) {
    const path = join(runsRoot, directory.name, "discard-transaction.json");
    if (!existsSync(path)) continue;
    const transaction = parseDiscardTransaction(await readFile(path, "utf8"), path);
    if (transaction.version === "1.0"
      && transaction.worktreeId === worktreeId
      && (!actionScope || JSON.stringify(transaction.actionScope) === JSON.stringify(actionScope))
      && (!worktreeIdentityHash || transaction.worktreeIdentityHash === worktreeIdentityHash)) return { path, transaction };
  }
  return null;
}

function parseDiscardTransaction(text: string, path: string): WorktreeDiscardTransaction {
  const value = JSON.parse(text) as WorktreeDiscardTransaction;
  if (value.version !== "1.0"
    || !value.worktreeId
    || !value.changeId
    || !value.checkoutPath
    || !/^[a-f0-9]{64}$/.test(value.worktreeIdentityHash)
    || !/^[a-f0-9]{64}$/.test(value.manifestHash)
    || (value.approvalActionId !== null && value.approvalActionId !== "worktree.discard")
    || !["prepared", "checkout-removed", "evidence-written", "completed"].includes(value.stage)
    || !isHighImpactApprovalScope(value.actionScope)
    || value.actionScope.changeId !== value.changeId
    || value.actionScope.authorizationId !== value.authorization?.authorizationId
    || value.actionScope.targetManifestHash !== value.manifestHash
    || !value.authorization?.operationId
    || !value.authorization.claimToken) {
    throw new Error(`Invalid discard transaction: ${path}.`);
  }
  if (basename(dirname(path)) !== value.runId) throw new Error(`Discard transaction run directory is stale: ${path}.`);
  return value;
}

async function withCurrentApplyScope<T>(
  project: ManagedProject,
  worktreeId: string,
  operation: "source-apply" | "worktree-discard",
  action: (
    scope: ProjectApplyExecutionScope,
    lease: Parameters<Parameters<typeof withProjectWriteLeaseAtPath>[2]>[0],
  ) => Promise<T>,
): Promise<T> {
  const initial = await resolveProjectApplyExecutionScope(project, worktreeId);
  return withProjectHarnessWriterLock(initial.writerRoot, {
    projectId: initial.runtime.projectId,
    ownerId: `${operation}-${worktreeId}`,
    operation,
  }, async (writer) => withProjectWriteLeaseAtPath(initial.runtime.projectWriteLeasePath, {}, async (lease) => {
    const current = await resolveProjectApplyExecutionScope(project, worktreeId);
    if (current.writerRoot !== initial.writerRoot) throw new Error("Apply/discard runtime identity changed before execution.");
    await writer.assertCurrent();
    await lease.assertCurrent();
    return action(current, lease);
  }));
}

function applyTransactionManifestHash(transaction: ApplyTransaction): string {
  return createHash("sha256").update(JSON.stringify({
    changeId: transaction.changeId,
    worktreeId: transaction.worktreeId,
    diffHash: transaction.diffHash,
    changedPaths: transaction.changedPaths,
    expectedTree: transaction.expectedTree,
    sourceHead: transaction.sourceHeadBefore,
    validationId: transaction.validationId,
    auditId: transaction.auditId,
    reviewAuditId: transaction.reviewAuditId,
  })).digest("hex");
}

function worktreeMetadataIdentityHash(metadata: Pick<WorktreeMetadata,
  "projectId" | "changeId" | "worktreeId" | "checkoutPath" | "branchName" | "baseCommit" | "createdAt"
>): string {
  return createHash("sha256").update(JSON.stringify({
    projectId: metadata.projectId,
    changeId: metadata.changeId,
    worktreeId: metadata.worktreeId,
    checkoutPath: metadata.checkoutPath,
    branchName: metadata.branchName,
    baseCommit: metadata.baseCommit,
    createdAt: metadata.createdAt,
  })).digest("hex");
}

function parseApplyTransaction(text: string, path: string): ApplyTransaction {
  const value = JSON.parse(text) as ApplyTransaction;
  if (value.version !== "1.0"
    || !value.id
    || !value.changeId
    || !value.worktreeId
    || !/^[a-f0-9]{64}$/.test(value.worktreeIdentityHash)
    || (value.approvalActionId !== null && value.approvalActionId !== "result.apply")
    || !["prepared", "patch-applied", "commit-created", "evidence-written", "completed"].includes(value.stage)
    || !value.authorization
    || !value.authorization.authorizationId
    || !Number.isSafeInteger(value.authorization.authorizationEpoch)
    || value.authorization.authorizationEpoch < 0
    || !value.authorization.operationId
    || !value.authorization.claimToken
    || !Number.isSafeInteger(value.authorization.fencingToken)
    || value.authorization.fencingToken < 1
    || !/^[a-f0-9]{64}$/.test(value.authorization.manifestHash)
    || !isExecutionAuthorizationSnapshot(value.authorization.snapshot)
    || value.authorization.manifestHash !== applyTransactionManifestHash(value)
    || !isHighImpactApprovalScope(value.actionScope)
    || value.actionScope.changeId !== value.changeId
    || value.actionScope.authorizationId !== value.authorization.authorizationId
    || value.actionScope.targetManifestHash !== value.authorization.manifestHash) {
    throw new Error(`Invalid ApplyTransaction: ${path}.`);
  }
  if (basename(dirname(path)) !== value.runId) throw new Error(`ApplyTransaction run directory is stale: ${path}.`);
  return value;
}

function isExecutionAuthorizationSnapshot(value: unknown): value is ApplyTransaction["authorization"]["snapshot"] {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return [
    "acceptedPlanHash",
    "graphHash",
    "artifactManifestHash",
    "sourceHead",
    "sourceStateHash",
    "permissionProfileHash",
    "providerScopeHash",
    "policyHash",
  ].every((key) => typeof snapshot[key] === "string" && snapshot[key].length > 0);
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number): Promise<RunMetadata> {
  const finished = {
    ...run,
    status,
    exitCode,
    signal: null,
    finishedAt: new Date().toISOString(),
  };
  await writeJsonFile(path, finished);
  return finished;
}
