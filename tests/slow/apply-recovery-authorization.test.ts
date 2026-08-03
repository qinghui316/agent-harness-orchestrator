import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recoverPendingApplyTransactions } from "../../src/apply/manager.js";
import type { ApplyTransaction } from "../../src/apply/types.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { buildRunId } from "../../src/run/manager.js";
import type { RunMetadata } from "../../src/types/index.js";
import {
  appendLocalExecutionAuthorizationTargets,
  claimTransitionExecution,
  markTransitionExecutionStarted,
  readTransitionExecution,
  revokeLocalExecutionAuthorization,
} from "../../src/workflow-runtime/execution-authorization.js";
import { runExecutionAuthorizationTransaction } from "../../src/workflow-runtime/execution-authorization-repository.js";
import { prepareSkillNativeApplyFixture } from "../helpers/skill-native-apply-fixture.js";
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

  it("rejects a forged recovery journal without authorization before Git writes", async () => {
    await withAhoHome(async () => {
      const fixture = await createPreparedRecoveryFixture();
      const transaction = JSON.parse(await readFile(fixture.transactionPath, "utf8")) as Record<string, unknown>;
      transaction.authorization = null;
      await writeFile(fixture.transactionPath, `${JSON.stringify(transaction, null, 2)}\n`, "utf8");
      const headBefore = await getGitCommit(getTempDir());

      await expect(recoverPendingApplyTransactions(project())).rejects.toThrow(/invalid ApplyTransaction/i);
      expect(await getGitCommit(getTempDir())).toBe(headBefore);
      expect(await getGitStatusShort(getTempDir())).toEqual([]);
      expect(existsSync(join(getTempDir(), "restart-proof.txt"))).toBe(false);
    });
  }, 120_000);
});

async function createPreparedRecoveryFixture(options: { claimExpired?: boolean } = {}) {
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  const fixture = await prepareSkillNativeApplyFixture({
    projectRoot: getTempDir(),
    ahoHome: join(getTempDir(), ".aho-home"),
    projectId: project().id,
    projectName: project().name,
    title: "Prepared Restart",
    changedPath: "restart-proof.txt",
    changedContent: "authorized restart\n",
  });
  const memory = projectExecutionRuntimePort(fixture.project, fixture.resolution);
  const authorization = await appendLocalExecutionAuthorizationTargets(
    memory,
    fixture.authorizationId,
    fixture.authorizationEpoch,
    fixture.authorizationSnapshot,
    { projectId: memory.projectId, changeId: fixture.changeId },
    [{ transition: "source.apply", targetId: fixture.worktreeId, manifestHash: fixture.actionScope.targetManifestHash }],
  );
  const snapshot = fixture.authorizationSnapshot;
  const claimNow = options.claimExpired ? new Date(Date.now() - 2_000) : new Date();
  const claim = await claimTransitionExecution(memory, {
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    transition: "source.apply",
    targetId: fixture.worktreeId,
    manifestHash: fixture.actionScope.targetManifestHash,
    snapshot,
    claimedBy: "apply-transaction",
    claimTtlMs: options.claimExpired ? 1_000 : 10 * 60_000,
    now: claimNow,
  });
  await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, claimNow);
  const runId = buildRunId(fixture.changeId, ["worktree-apply", fixture.worktreeId, fixture.diffHash, "commit"]);
  const directory = join(memory.runsRoot, runId);
  await mkdir(directory, { recursive: true });
  const relativeDir = `runs/${runId}`;
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: fixture.changeId,
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
      base: memory.runArtifactBase,
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
    changeId: fixture.changeId,
    worktreeId: fixture.worktreeId,
    worktreeIdentityHash: fixture.worktreeIdentityHash,
    runId,
    diffHash: fixture.diffHash,
    manifestHash: fixture.actionScope.targetManifestHash,
    changedPaths: fixture.changedPaths,
    expectedTree: fixture.expectedTree,
    sourceHeadBefore: fixture.sourceHead,
    stage: "prepared",
    approvalActionId: null,
    commitRequested: true,
    commitMessage: "restart apply",
    commitHash: null,
    validationId: fixture.validationId,
    auditId: fixture.auditId,
    reviewAuditId: fixture.auditId,
    authorization: {
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      snapshot,
      manifestHash: fixture.actionScope.targetManifestHash,
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
    },
    actionScope: fixture.actionScope,
    blockedReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(join(directory, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await writeFile(join(directory, "diff.patch"), fixture.diff, "utf8");
  const transactionPath = join(directory, "apply-transaction.json");
  await writeFile(transactionPath, `${JSON.stringify(transaction, null, 2)}\n`, "utf8");
  return {
    memory,
    changeId: fixture.changeId,
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    snapshot,
    operationId: claim.operationId,
    transactionPath,
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
