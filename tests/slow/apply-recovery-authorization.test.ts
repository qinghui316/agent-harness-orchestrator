import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { recoverPendingApplyTransactions } from "../../src/apply/manager.js";
import type { ApplyTransaction } from "../../src/apply/types.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { buildRunId } from "../../src/run/manager.js";
import type { ExecutionAuthorizationSnapshot, RunMetadata } from "../../src/types/index.js";
import { createWorktree } from "../../src/worktree/manager.js";
import {
  appendLocalExecutionAuthorizationTargets,
  claimTransitionExecution,
  issueLocalExecutionAuthorization,
  markTransitionExecutionStarted,
  readTransitionExecution,
  revokeLocalExecutionAuthorization,
} from "../../src/workflow-runtime/execution-authorization.js";
import { runExecutionAuthorizationTransaction } from "../../src/workflow-runtime/execution-authorization-repository.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import { getTempDir, git, initGitRepository, project } from "../unit/workbench/fixtures.js";

describe("ApplyTransaction restart authorization", () => {
  it("reclaims an expired operation before continuing a prepared transaction", async () => {
    await withAhoHome(async () => {
      const fixture = await createPreparedRecoveryFixture({ claimExpired: true });

      const [result] = await recoverPendingApplyTransactions(project());

      expect(result.apply).toMatchObject({ status: "applied", committed: true });
      expect((await readFile(join(getTempDir(), "restart-proof.txt"), "utf8")).trim()).toBe("authorized restart");
      await expect(readTransitionExecution(fixture.memory, fixture.operationId)).resolves.toMatchObject({
        status: "completed",
        fencingToken: 2,
      });
    });
  }, 120_000);

  it.each(["revoked", "epoch-drift", "expired"] as const)(
    "fails closed before Git writes when restart authorization is %s",
    async (mode) => withAhoHome(async () => {
      const fixture = await createPreparedRecoveryFixture();
      if (mode === "revoked") {
        await revokeLocalExecutionAuthorization(fixture.memory, fixture.authorizationId, "restart test revocation");
      } else if (mode === "epoch-drift") {
        await appendLocalExecutionAuthorizationTargets(
          fixture.memory,
          fixture.authorizationId,
          fixture.authorizationEpoch,
          fixture.snapshot,
          { projectId: fixture.memory.projectId, changeId: fixture.changeId },
          [{ transition: "workflow.node.execute", targetId: "later-node", manifestHash: "f".repeat(64) }],
        );
      } else {
        runExecutionAuthorizationTransaction(fixture.memory, (transaction) => {
          const current = transaction.getAuthorization(fixture.authorizationId);
          if (!current) throw new Error("Expected restart authorization.");
          transaction.putAuthorization({ ...current, expiresAt: "2000-01-01T00:00:00.000Z" });
        });
      }
      const headBefore = await getGitCommit(getTempDir());

      await expect(recoverPendingApplyTransactions(project())).rejects.toThrow(/authorization|expired|revoked|epoch/i);
      expect(await getGitCommit(getTempDir())).toBe(headBefore);
      expect(await getGitStatusShort(getTempDir())).toEqual([]);
      expect(existsSync(join(getTempDir(), "restart-proof.txt"))).toBe(false);
    }),
    120_000,
  );
});

async function createPreparedRecoveryFixture(options: { claimExpired?: boolean } = {}) {
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  await initHarness(project());
  const change = await createConversationChangeFixture(project(), { title: "Prepared Restart" });
  const memory = await resolveProjectMemory(project());
  const worktree = await createWorktree(project(), memory, change.changeId);
  await writeFile(join(worktree.metadata.checkoutPath, "restart-proof.txt"), "authorized restart\n", "utf8");
  const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, change.changeId);
  const sourceHead = await getGitCommit(getTempDir());
  if (!sourceHead) throw new Error("Expected source HEAD.");
  const sourceStateHash = createHash("sha256").update(JSON.stringify(await getGitStatusShort(getTempDir()))).digest("hex");
  const manifestHash = createHash("sha256").update(JSON.stringify({
    diffHash: diff.diffHash,
    changedPaths: diff.changedPaths,
    expectedTree: diff.expectedTree,
    sourceHead,
  })).digest("hex");
  const hash = "a".repeat(64);
  const authorization = await issueLocalExecutionAuthorization(memory, {
    projectId: memory.projectId,
    changeId: change.changeId,
    conversationId: change.conversationId,
    providerThreadId: "restart-thread",
    goalIdentityHash: hash,
    mode: "stepwise",
    acceptedPlanId: "restart-plan",
    acceptedPlanHash: hash,
    graphId: "restart-graph",
    graphHash: hash,
    artifactManifestHash: hash,
    sourceHead,
    sourceStateHash,
    permissionProfileHash: hash,
    providerScopeHash: hash,
    policyHash: hash,
    targets: [{ transition: "source.apply", targetId: worktree.metadata.worktreeId, manifestHash }],
    budget: { maxCompletedOperations: 4, maxReworks: 1, maxChangedFiles: 20, maxChangedBytes: 1_000_000 },
    userDecision: { decisionId: "restart-decision", actorId: "user", decidedAt: new Date().toISOString() },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  const snapshot: ExecutionAuthorizationSnapshot = {
    acceptedPlanHash: authorization.acceptedPlanHash,
    graphHash: authorization.graphHash,
    artifactManifestHash: authorization.artifactManifestHash,
    sourceHead: authorization.sourceHead,
    sourceStateHash: authorization.sourceStateHash,
    permissionProfileHash: authorization.permissionProfileHash,
    providerScopeHash: authorization.providerScopeHash,
    policyHash: authorization.policyHash,
  };
  const claimNow = options.claimExpired ? new Date(Date.now() - 2_000) : new Date();
  const claim = await claimTransitionExecution(memory, {
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    transition: "source.apply",
    targetId: worktree.metadata.worktreeId,
    manifestHash,
    snapshot,
    claimedBy: "apply-transaction",
    claimTtlMs: options.claimExpired ? 1_000 : 10 * 60_000,
    now: claimNow,
  });
  await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, claimNow);
  const runId = buildRunId(change.changeId, ["worktree-apply", worktree.metadata.worktreeId, diff.diffHash, "commit"]);
  const directory = join(memory.runsRoot, runId);
  await mkdir(directory, { recursive: true });
  const relativeDir = `runs/${runId}`;
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: change.changeId,
    projectPath: getTempDir(),
    runtime: "worktree-apply",
    executionMode: "direct",
    proposalOnly: false,
    command: ["git", "apply"],
    status: "running",
    exitCode: null,
    signal: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      diff: `${relativeDir}/diff.patch`,
      diffStat: `${relativeDir}/diff-stat.txt`,
      apply: `${relativeDir}/apply.json`,
    },
  };
  const now = new Date().toISOString();
  const transaction: ApplyTransaction = {
    version: "1.0",
    id: `apply-transaction-${runId}`,
    changeId: change.changeId,
    worktreeId: worktree.metadata.worktreeId,
    runId,
    diffHash: diff.diffHash,
    manifestHash: createHash("sha256").update(JSON.stringify(diff.changedPaths)).digest("hex"),
    changedPaths: diff.changedPaths,
    expectedTree: diff.expectedTree,
    sourceHeadBefore: sourceHead,
    stage: "prepared",
    commitRequested: true,
    commitMessage: "restart apply",
    commitHash: null,
    validationId: "validation-restart",
    auditId: "audit-restart",
    reviewAuditId: "audit-restart",
    authorization: {
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      snapshot,
      manifestHash,
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
    },
    blockedReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(join(directory, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await writeFile(join(directory, "diff.patch"), diff.diff, "utf8");
  await writeFile(join(directory, "apply-transaction.json"), `${JSON.stringify(transaction, null, 2)}\n`, "utf8");
  return {
    memory,
    changeId: change.changeId,
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    snapshot,
    operationId: claim.operationId,
  };
}

async function withAhoHome<T>(action: () => Promise<T>): Promise<T> {
  const previous = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.AHO_HOME;
    else process.env.AHO_HOME = previous;
  }
}
