import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const checkpoint = vi.hoisted(() => ({
  count: 0,
  hook: null as null | ((count: number) => Promise<void>),
  reservationHook: null as null | (() => Promise<void>),
}));

vi.mock("../../src/workflow-runtime/execution-authorization.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/workflow-runtime/execution-authorization.js")>();
  return {
    ...actual,
    assertTransitionExecutionCurrent: async (...args: Parameters<typeof actual.assertTransitionExecutionCurrent>) => {
      checkpoint.count += 1;
      await checkpoint.hook?.(checkpoint.count);
      return actual.assertTransitionExecutionCurrent(...args);
    },
    reserveTransitionExecutionCommitPoint: async (...args: Parameters<typeof actual.reserveTransitionExecutionCommitPoint>) => {
      const reserved = await actual.reserveTransitionExecutionCommitPoint(...args);
      await checkpoint.reservationHook?.();
      return reserved;
    },
  };
});

import { applyWorktree } from "../../src/apply/manager.js";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { acceptAudit } from "../../src/audit/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import type { ExecutionAuthorizationSnapshot } from "../../src/types/index.js";
import { createWorktree } from "../../src/worktree/manager.js";
import { issueLocalExecutionAuthorization, revokeLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import { runExecutionAuthorizationTransaction } from "../../src/workflow-runtime/execution-authorization-repository.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  getTempDir,
  git,
  initGitRepository,
  project,
  writeAcceptedSpecAndTasks,
  writeAuditResultWithHash,
  writeValidationResultWithHash,
} from "../unit/workbench/fixtures.js";

describe("first apply authorization races", () => {
  it("fails before git apply when authorization is revoked after prepared", async () => {
    await withAhoHome(async () => {
      const fixture = await createAuthorizedApplyFixture();
      checkpoint.count = 0;
      checkpoint.hook = async (count) => {
        if (count === 1) await revokeLocalExecutionAuthorization(fixture.memory, fixture.authorizationId, "revoked before patch");
      };

      await expect(applyWorktree(project(), fixture.worktreeId, { commit: true, userConfirmed: true }))
        .rejects.toThrow("Authorized worktree apply failed.");

      expect(checkpoint.count).toBe(1);
      expect(await getGitCommit(getTempDir())).toBe(fixture.sourceHead);
      expect(await getGitStatusShort(getTempDir())).toEqual([]);
      expect(existsSync(join(getTempDir(), "race-proof.txt"))).toBe(false);
    });
  }, 120_000);

  it("finishes the reserved commit when authorization expires after patch staging", async () => {
    await withAhoHome(async () => {
      const fixture = await createAuthorizedApplyFixture();
      checkpoint.count = 0;
      checkpoint.reservationHook = async () => {
        runExecutionAuthorizationTransaction(fixture.memory, (transaction) => {
          const current = transaction.getAuthorization(fixture.authorizationId);
          if (!current) throw new Error("Expected apply authorization.");
          transaction.putAuthorization({ ...current, expiresAt: "2000-01-01T00:00:00.000Z" });
        });
      };

      await expect(applyWorktree(project(), fixture.worktreeId, { commit: true, userConfirmed: true }))
        .resolves.toMatchObject({ apply: { status: "applied", committed: true } });

      expect(checkpoint.count).toBe(1);
      expect(await getGitCommit(getTempDir())).not.toBe(fixture.sourceHead);
      expect(await getGitStatusShort(getTempDir())).toEqual([]);
      expect(existsSync(join(getTempDir(), "race-proof.txt"))).toBe(true);
    });
  }, 120_000);
});

async function createAuthorizedApplyFixture() {
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  await initHarness(project());
  const change = await createConversationChangeFixture(project(), { title: "Apply Race" });
  await writeAcceptedSpecAndTasks(change.changeId);
  const memory = await resolveProjectMemory(project());
  const worktree = await createWorktree(project(), memory, change.changeId);
  await writeFile(join(worktree.metadata.checkoutPath, "race-proof.txt"), "authorized\n", "utf8");
  const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, change.changeId);
  await writeValidationResultWithHash(change.changeId, "run-validation-race", worktree.metadata.worktreeId, diff.diffHash, "passed");
  await writeAuditResultWithHash(change.changeId, "run-audit-race", worktree.metadata.worktreeId, diff.diffHash, "approved");
  await acceptAudit(project(), "run-audit-race");
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
    providerThreadId: "race-thread",
    goalIdentityHash: hash,
    mode: "stepwise",
    acceptedPlanId: "race-plan",
    acceptedPlanHash: hash,
    graphId: "race-graph",
    graphHash: hash,
    artifactManifestHash: hash,
    sourceHead,
    sourceStateHash,
    permissionProfileHash: hash,
    providerScopeHash: hash,
    policyHash: hash,
    targets: [{ transition: "source.apply", targetId: worktree.metadata.worktreeId, manifestHash }],
    budget: { maxCompletedOperations: 4, maxReworks: 1, maxChangedFiles: 20, maxChangedBytes: 1_000_000 },
    userDecision: { decisionId: "race-decision", actorId: "user", decidedAt: new Date().toISOString() },
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
  await mkdir(join(memory.changesRoot, "active", change.changeId, "planning"), { recursive: true });
  await writeFile(join(memory.changesRoot, "active", change.changeId, "planning", "execution-authorization-intent.json"), `${JSON.stringify({
    version: "1.0",
    status: "issued",
    authorizationId: authorization.id,
    snapshot,
  }, null, 2)}\n`, "utf8");
  return { memory, authorizationId: authorization.id, worktreeId: worktree.metadata.worktreeId, sourceHead };
}

async function withAhoHome<T>(action: () => Promise<T>): Promise<T> {
  const previous = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
  checkpoint.count = 0;
  checkpoint.hook = null;
  checkpoint.reservationHook = null;
  try {
    return await action();
  } finally {
    checkpoint.hook = null;
    checkpoint.reservationHook = null;
    if (previous === undefined) delete process.env.AHO_HOME;
    else process.env.AHO_HOME = previous;
  }
}
