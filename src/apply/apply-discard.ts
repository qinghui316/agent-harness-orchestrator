import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { collectWorktreeDiff, parseNameStatusPaths } from "../audit/diff.js";
import { acceptAudit } from "../audit/manager.js";
import { getChangeStatusForChange } from "../change/manager.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { commitTreeAndUpdateHead, getGitCommit, getGitStatusShort, git, gitRaw, gitRawWithEnv, gitText, gitTextWithEnv } from "../project/git.js";
import { withProjectWriteLease } from "../project/project-write-lease.js";
import {
  appendLocalExecutionAuthorizationTargets,
  advanceLocalExecutionAuthorizationSource,
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
import { getWorktreeStatus, markWorktreeApplied, removeWorktree } from "../worktree/manager.js";
import type { ManagedProject, RunMetadata, RunStatus } from "../types/index.js";
import { canAutoAcceptAuditForApply, evaluateApplyGate } from "./gate.js";
import { buildApplyPaths, buildDiscardPaths, displayArtifactPath } from "./paths.js";
import { previewWorktreeApply } from "./preview.js";
import type { ApplyTransaction, AuthorizedWorktreeApplyOptions, WorktreeApplyOptions, WorktreeApplyResult, WorktreeDiscardResult, WorktreeResultApplyResult } from "./types.js";

export async function applyResultToProject(project: ManagedProject, worktreeId: string, options: WorktreeApplyOptions = {}): Promise<WorktreeResultApplyResult> {
  const preview = await previewWorktreeApply(project, worktreeId);
  let auditAccepted: WorktreeResultApplyResult["auditAccepted"];
  if (!preview.gate.ready && canAutoAcceptAuditForApply(preview.gate) && preview.gate.audit) {
    const accepted = await acceptAudit(project, preview.gate.audit.id);
    auditAccepted = {
      auditId: accepted.audit.id,
      reviewPath: accepted.reviewPath,
    };
  }
  const applied = await applyWorktree(project, worktreeId, options);
  return auditAccepted ? { ...applied, auditAccepted } : applied;
}

export async function applyWorktree(project: ManagedProject, worktreeId: string, options: WorktreeApplyOptions = {}): Promise<WorktreeApplyResult> {
  if (options.message && !options.commit) {
    throw new Error("Cannot use --message without --commit.");
  }
  const authorized = await resolveAuthorizedApplyOptions(project, worktreeId, options);
  if (authorized) return applyAuthorizedWorktree(project, worktreeId, authorized);
  return withProjectWriteLease(project.path, {}, async (lease) =>
    (await recoverApplyTransaction(project, worktreeId, options, lease))
      ?? applyWorktreeWithLease(project, worktreeId, options, lease),
  );
}

async function resolveAuthorizedApplyOptions(
  project: ManagedProject,
  worktreeId: string,
  options: WorktreeApplyOptions,
): Promise<AuthorizedWorktreeApplyOptions | null> {
  const memory = await resolveProjectMemory(project);
  const worktree = await getWorktreeStatus(memory, worktreeId).catch(() => null);
  if (!worktree) return null;
  const intentPath = join(memory.changesRoot, "active", worktree.changeId, "planning", "execution-authorization-intent.json");
  if (!existsSync(intentPath)) return null;
  const intent = JSON.parse(await readFile(intentPath, "utf8")) as { status?: unknown; authorizationId?: unknown };
  if (intent.status !== "issued" || typeof intent.authorizationId !== "string") {
    throw new Error("Current Change execution authorization is not issued.");
  }
  const authorization = await readExecutionAuthorization(memory, intent.authorizationId);
  if (authorization.projectId !== memory.projectId || authorization.changeId !== worktree.changeId) {
    throw new Error("Current Change execution authorization does not match the apply target.");
  }
  return {
    ...options,
    commit: true,
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    authorizationSnapshot: {
      acceptedPlanHash: authorization.acceptedPlanHash,
      graphHash: authorization.graphHash,
      artifactManifestHash: authorization.artifactManifestHash,
      sourceHead: authorization.sourceHead,
      sourceStateHash: authorization.sourceStateHash,
      permissionProfileHash: authorization.permissionProfileHash,
      providerScopeHash: authorization.providerScopeHash,
      policyHash: authorization.policyHash,
    },
    userConfirmed: options.userConfirmed === true,
  };
}

export async function applyAuthorizedWorktree(
  project: ManagedProject,
  worktreeId: string,
  options: AuthorizedWorktreeApplyOptions,
): Promise<WorktreeApplyResult> {
  return withProjectWriteLease(project.path, {}, async (lease) => {
    const memory = await resolveProjectMemory(project);
    const recovered = await recoverApplyTransaction(project, worktreeId, { ...options, commit: true }, lease);
    if (recovered) return recovered;
    const gate = await evaluateApplyGate(project, memory, worktreeId);
    if (!gate.ready) throw new Error(`Cannot authorize worktree apply:\n${gate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
    const current = await readExecutionAuthorization(memory, options.authorizationId);
    const sourceStateHash = createHash("sha256").update(JSON.stringify(await getGitStatusShort(project.path))).digest("hex");
    if (gate.sourceHead !== current.sourceHead || sourceStateHash !== current.sourceStateHash) {
      throw new Error("Local execution authorization source state is stale.");
    }
    if (current.mode === "stepwise" && !options.userConfirmed) throw new Error("Stepwise source apply requires the current user confirmation.");
    if (current.mode === "scoped-auto") assertScopedAutoExecutionEnabled();
    const manifestHash = createHash("sha256").update(JSON.stringify({
      diffHash: gate.diffHash,
      changedPaths: gate.changedPaths,
      expectedTree: gate.expectedTree,
      sourceHead: gate.sourceHead,
    })).digest("hex");
    const authorization = await appendLocalExecutionAuthorizationTargets(
      memory,
      current.id,
      options.authorizationEpoch,
      options.authorizationSnapshot,
      { projectId: memory.projectId, changeId: gate.changeId },
      [{ transition: "source.apply", targetId: worktreeId, manifestHash }],
    );
    const claim = await claimTransitionExecution(memory, {
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      transition: "source.apply",
      targetId: worktreeId,
      manifestHash,
      snapshot: options.authorizationSnapshot,
      claimedBy: "apply-transaction",
      claimTtlMs: 10 * 60_000,
    });
    await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken);
    const binding: NonNullable<ApplyTransaction["authorization"]> = {
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      snapshot: options.authorizationSnapshot,
      manifestHash,
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
    };
    try {
      const result = await applyWorktreeWithLease(project, worktreeId, { ...options, commit: true }, lease, binding);
      if (result.apply.status !== "applied") throw new Error("Authorized worktree apply failed.");
      return result;
    } catch (error) {
      const transaction = await findApplyTransaction(memory.runsRoot, worktreeId);
      if (transaction && transaction.transaction.stage !== "prepared") throw error;
      await recordTransitionExecutionTerminal(memory, {
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
  const memory = await resolveProjectMemory(project);
  if (!existsSync(memory.runsRoot)) return [];
  return withProjectWriteLease(project.path, {}, async (lease) => {
    const results: WorktreeApplyResult[] = [];
    const directories = (await readdir(memory.runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    for (const directory of directories) {
      const transactionPath = join(memory.runsRoot, directory.name, "apply-transaction.json");
      if (!existsSync(transactionPath)) continue;
      const transaction = JSON.parse(await readFile(transactionPath, "utf8")) as ApplyTransaction;
      if (transaction.stage === "completed") continue;
      const options: WorktreeApplyOptions = { commit: transaction.commitRequested, message: transaction.commitMessage, userConfirmed: true };
      const recovered = await recoverApplyTransaction(project, transaction.worktreeId, options, lease);
      if (!recovered) throw new Error(`Pending ApplyTransaction disappeared during recovery: ${transaction.id}.`);
      results.push(recovered);
    }
    return results;
  });
}

async function applyWorktreeWithLease(
  project: ManagedProject,
  worktreeId: string,
  options: WorktreeApplyOptions,
  lease: Parameters<Parameters<typeof withProjectWriteLease>[2]>[0],
  authorization: ApplyTransaction["authorization"] = null,
): Promise<WorktreeApplyResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree apply");
  const gate = await evaluateApplyGate(project, memory, worktreeId);
  if (!gate.ready) {
    throw new Error(`Cannot apply worktree:\n${gate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (!gate.validation || !gate.audit || !gate.reviewAuditId) {
    throw new Error("Cannot apply worktree: missing gate evidence.");
  }

  const runId = buildRunId(gate.changeId, ["worktree-apply", worktreeId, gate.diffHash, options.commit ? "commit" : "no-commit"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = buildApplyPaths(directory);
  const artifacts = {
    base: memory.artifactBase,
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
  await writeFile(paths.diff, (await collectWorktreeDiff(memory, worktreeId, gate.changeId)).diff, "utf8");
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
    runId,
    diffHash: gate.diffHash,
    manifestHash: hashPaths(gate.changedPaths),
    changedPaths: gate.changedPaths,
    expectedTree: gate.expectedTree,
    sourceHeadBefore: gate.sourceHead ?? "",
    stage: "prepared",
    commitRequested: options.commit === true,
    commitMessage: options.message?.trim() || `Apply ${gate.changeId} from ${worktreeId}`,
    commitHash: null,
    validationId: gate.validation.id,
    auditId: gate.audit.id,
    reviewAuditId: gate.reviewAuditId,
    authorization,
    blockedReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(paths.transaction, transaction);
  try {
    run = { ...run, status: "running" };
    await writeJsonFile(paths.run, run);
    await lease.heartbeat();
    transaction = await validateApplyRecoveryAuthorization(memory, paths, transaction);
    await reserveApplyCommitPoint(memory, transaction);
    await git(project.path, ["apply", "--binary", paths.diff]);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "patch-applied");
    if (options.commit) {
      await verifyWorkingTreeMatchesTransaction(project.path, paths.transaction, transaction);
      await stageAndVerifyApplyManifest(project.path, paths.transaction, transaction);
      if ((await getGitCommit(project.path)) !== transaction.sourceHeadBefore) {
        throw new Error("Source HEAD changed before the authorized apply commit.");
      }
      transaction = await validateApplyRecoveryAuthorization(memory, paths, transaction);
      commitHash = await commitTreeAndUpdateHead(project.path, {
        tree: transaction.expectedTree,
        parent: transaction.sourceHeadBefore,
        message: transaction.commitMessage,
      });
      transaction = await advanceApplyTransaction(paths.transaction, { ...transaction, commitHash }, "commit-created");
    }
    sourceHeadAfter = await getGitCommit(project.path);
    await markWorktreeApplied(memory, worktreeId, {
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
    await reconcileApplyTransitionReceipt(memory, paths, transaction);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "completed");
    await advanceAuthorizationSourceAfterApply(project, memory, transaction);
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
  worktreeId: string,
  options: WorktreeApplyOptions,
  lease: Parameters<Parameters<typeof withProjectWriteLease>[2]>[0],
): Promise<WorktreeApplyResult | null> {
  const memory = await resolveProjectMemory(project);
  const found = await findApplyTransaction(memory.runsRoot, worktreeId);
  if (!found) return null;
  let { transaction } = found;
  if (transaction.commitRequested !== (options.commit === true)) {
    throw new Error("Existing ApplyTransaction commit mode does not match this retry.");
  }
  const paths = buildApplyPaths(dirname(found.path));
  if (transaction.stage === "completed") {
    await reconcileApplyTransitionReceipt(memory, paths, transaction);
    await advanceAuthorizationSourceAfterApply(project, memory, transaction);
    return readCompletedApplyResult(paths);
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
    transaction = await validateApplyRecoveryAuthorization(memory, paths, transaction);
    await reserveApplyCommitPoint(memory, transaction);
    const status = await getGitStatusShort(project.path);
    if (transaction.stage === "prepared" && status.length === 0) {
      await verifyStoredApplyPatch(paths.diff, transaction);
      await git(project.path, ["apply", "--binary", paths.diff]);
      transaction = await advanceApplyTransaction(paths.transaction, transaction, "patch-applied");
    }
    if (transaction.commitRequested) {
      await verifyWorkingTreeMatchesTransaction(project.path, paths.transaction, transaction);
      await stageAndVerifyApplyManifest(project.path, paths.transaction, transaction);
      transaction = await validateApplyRecoveryAuthorization(memory, paths, transaction);
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
    await markWorktreeApplied(memory, worktreeId, {
      applyRunId: transaction.runId,
      worktreeDiffHash: transaction.diffHash,
      appliedCommit: transaction.commitHash ?? undefined,
    });
    await writeJsonFile(paths.apply, apply);
    const run = await finishRun(paths.run, JSON.parse(await readFile(paths.run, "utf8")) as RunMetadata, "completed", 0);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "evidence-written");
    await reconcileApplyTransitionReceipt(memory, paths, transaction);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "completed");
    await advanceAuthorizationSourceAfterApply(project, memory, transaction);
    return { run, apply };
  }
  if (transaction.stage === "evidence-written") {
    await reconcileApplyTransitionReceipt(memory, paths, transaction);
    transaction = await advanceApplyTransaction(paths.transaction, transaction, "completed");
    await advanceAuthorizationSourceAfterApply(project, memory, transaction);
    return readCompletedApplyResult(paths);
  }
  throw new Error(`ApplyTransaction cannot recover from stage ${transaction.stage}.`);
}

async function validateApplyRecoveryAuthorization(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  paths: ReturnType<typeof buildApplyPaths>,
  transaction: ApplyTransaction,
): Promise<ApplyTransaction> {
  const binding = transaction.authorization;
  if (!binding) return transaction;
  const execution = await readTransitionExecution(memory, binding.operationId);
  const expectedManifestHash = createHash("sha256").update(JSON.stringify({
    diffHash: transaction.diffHash,
    changedPaths: transaction.changedPaths,
    expectedTree: transaction.expectedTree,
    sourceHead: transaction.sourceHeadBefore,
  })).digest("hex");
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
  const authorization = await readExecutionAuthorization(memory, binding.authorizationId);
  const snapshotMatches = Object.entries(binding.snapshot).every(([key, value]) => authorization[key as keyof typeof binding.snapshot] === value);
  const targetMatches = authorization.targets.some((target) => target.transition === "source.apply"
    && target.targetId === transaction.worktreeId && target.manifestHash === binding.manifestHash);
  if (authorization.status !== "active"
    || Date.parse(authorization.expiresAt) <= Date.now()
    || authorization.projectId !== memory.projectId
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
    recovered = await claimTransitionExecution(memory, {
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
    recovered = await markTransitionExecutionStarted(memory, recovered.operationId, recovered.claimToken, recovered.fencingToken, now);
  }
  recovered = await assertTransitionExecutionCurrent(memory, {
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
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  transaction: ApplyTransaction,
): Promise<void> {
  const binding = transaction.authorization;
  if (!binding) return;
  await reserveTransitionExecutionCommitPoint(memory, {
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
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  paths: ReturnType<typeof buildApplyPaths>,
  transaction: ApplyTransaction,
): Promise<void> {
  const authorization = transaction.authorization;
  if (!authorization) return;
  await reconcileCommittedTransitionExecution(memory, {
    operationId: authorization.operationId,
    authorizationId: authorization.authorizationId,
    authorizationEpoch: authorization.authorizationEpoch,
    transition: "source.apply",
    targetId: transaction.worktreeId,
    manifestHash: authorization.manifestHash,
    claimToken: authorization.claimToken,
    fencingToken: authorization.fencingToken,
    evidenceRefs: [displayArtifactPath(memory, paths.apply)],
  });
}

async function advanceAuthorizationSourceAfterApply(
  project: ManagedProject,
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  transaction: ApplyTransaction,
): Promise<void> {
  const binding = transaction.authorization;
  if (!binding || !transaction.commitRequested || !transaction.commitHash) return;
  const sourceHead = await getGitCommit(project.path);
  if (!sourceHead || sourceHead !== transaction.commitHash) {
    throw new Error("Authorized apply completed without the expected source HEAD.");
  }
  const sourceStateHash = createHash("sha256").update(JSON.stringify(await getGitStatusShort(project.path))).digest("hex");
  await advanceLocalExecutionAuthorizationSource(memory, {
    authorizationId: binding.authorizationId,
    expectedEpoch: binding.authorizationEpoch,
    snapshot: binding.snapshot,
    sourceHead,
    sourceStateHash,
  });
}

async function findApplyTransaction(runsRoot: string, worktreeId: string): Promise<{ path: string; transaction: ApplyTransaction } | null> {
  if (!existsSync(runsRoot)) return null;
  const directories = (await readdir(runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const directory of directories) {
    const path = join(runsRoot, directory.name, "apply-transaction.json");
    if (!existsSync(path)) continue;
    const transaction = JSON.parse(await readFile(path, "utf8")) as ApplyTransaction;
    if (transaction.worktreeId === worktreeId) return { path, transaction };
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
    run: JSON.parse(await readFile(paths.run, "utf8")) as RunMetadata,
    apply: JSON.parse(await readFile(paths.apply, "utf8")) as WorktreeApplyResult["apply"],
  };
}

function hashPaths(paths: string[]): string {
  return createHash("sha256").update(JSON.stringify(paths)).digest("hex");
}

export async function discardWorktree(project: ManagedProject, worktreeId: string): Promise<WorktreeDiscardResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree discard");
  const worktree = await getWorktreeStatus(memory, worktreeId);
  const changeId = worktree.changeId;
  const status = await getChangeStatusForChange(project, changeId);
  if (!status.change) throw new Error(`Cannot discard worktree ${worktreeId}: demand conversation is not active: ${changeId}.`);
  if (worktree.status === "applied") {
    throw new Error(`Cannot discard applied worktree ${worktreeId}. Use worktree remove for cleanup.`);
  }

  const runId = buildRunId(changeId, ["worktree-discard", worktreeId]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = buildDiscardPaths(directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    discard: `${relativeDir}/discard.json`,
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
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
  await writeFile(paths.context, "Worktree discard gate run. Discard removes an unapplied proposal checkout only.\n", "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { runtime: "worktree-discard", worktreeId } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.started", runId, data: { worktreeId } });
  let discardStatus: "discarded" | "failed" = "failed";
  try {
    await removeWorktree(memory, worktreeId, true);
    discardStatus = "discarded";
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.completed", runId, data: { worktreeId } });
  } catch (error) {
    await writeFile(paths.stderr, error instanceof Error ? `${error.message}\n` : `${String(error)}\n`, "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.failed", runId, data: { error: error instanceof Error ? error.message : String(error) } });
  }
  const discard = { version: "1.0" as const, changeId, worktreeId, status: discardStatus };
  await writeJsonFile(paths.discard, discard);
  const runStatus: RunStatus = discardStatus === "discarded" ? "completed" : "failed";
  run = await finishRun(paths.run, run, runStatus, runStatus === "completed" ? 0 : 1);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: runStatus === "completed" ? "run.completed" : "run.failed", runId });
  return { run, discard };
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
