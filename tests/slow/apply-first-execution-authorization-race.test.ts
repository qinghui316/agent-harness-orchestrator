import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { revokeLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import { runExecutionAuthorizationTransaction } from "../../src/workflow-runtime/execution-authorization-repository.js";
import { prepareSkillNativeApplyFixture } from "../helpers/skill-native-apply-fixture.js";
import {
  getTempDir,
  git,
  initGitRepository,
  project,
} from "../unit/workbench/fixtures.js";

describe("first apply authorization races", () => {
  it("fails before git apply when authorization is revoked after prepared", async () => {
    await withAhoHome(async () => {
      const fixture = await createAuthorizedApplyFixture();
      checkpoint.count = 0;
      checkpoint.hook = async (count) => {
        if (count === 1) await revokeLocalExecutionAuthorization(fixture.memory, fixture.authorizationId, "revoked before patch");
      };

      await expect(applyWorktree(project(), fixture.worktreeId, { commit: true, userConfirmed: true, actionScope: fixture.actionScope }))
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

      await expect(applyWorktree(project(), fixture.worktreeId, { commit: true, userConfirmed: true, actionScope: fixture.actionScope }))
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
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  const fixture = await prepareSkillNativeApplyFixture({
    projectRoot: getTempDir(),
    ahoHome: join(getTempDir(), ".aho-home"),
    projectId: project().id,
    projectName: project().name,
    title: "Apply Race",
    changedPath: "race-proof.txt",
    changedContent: "authorized\n",
  });
  return {
    ...fixture,
    memory: projectExecutionRuntimePort(fixture.project, fixture.resolution),
  };
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
