import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyWorktree, discardWorktree, listCompletedWorktreeDispositions } from "../../src/apply/manager.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { prepareSkillNativeApplyFixture } from "../helpers/skill-native-apply-fixture.js";
import { execFileAsync, getTempDir, git, initGitRepository, project } from "./workbench/fixtures.js";

let previousAhoHome: string | undefined;

beforeEach(() => {
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
});

afterEach(() => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
});

describe("Skill-native worktree apply/discard", () => {
  it("applies only the exact reviewed candidate", async () => {
    const fixture = await prepareFixture("Apply exact candidate");

    const result = await applyWorktree(project(), fixture.worktreeId, {
      userConfirmed: true,
      actionScope: fixture.actionScope,
    });

    expect(result.apply).toMatchObject({ status: "applied", worktreeId: fixture.worktreeId });
    expect((await readSource("candidate.txt")).trim()).toBe("skill-native candidate");
    expect(await status()).not.toBe("");
    expect(await listCompletedWorktreeDispositions(
      projectExecutionRuntimePort(fixture.project, fixture.resolution),
      fixture.changeId,
    )).toContainEqual({
      changeId: fixture.changeId,
      worktreeId: fixture.worktreeId,
      status: "applied",
    });
    await expectNoWorkbenchDecision(fixture, "result.apply");
  }, 120_000);

  it("discards only the exact worktree without mutating source", async () => {
    const fixture = await prepareFixture("Discard exact candidate");

    const result = await discardWorktree(project(), fixture.worktreeId, { actionScope: fixture.actionScope });

    expect(result.discard).toMatchObject({ status: "discarded", worktreeId: fixture.worktreeId });
    expect(existsSync(fixture.worktreePath)).toBe(false);
    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await status()).toBe("");
    expect(await listCompletedWorktreeDispositions(
      projectExecutionRuntimePort(fixture.project, fixture.resolution),
      fixture.changeId,
    )).toContainEqual({
      changeId: fixture.changeId,
      worktreeId: fixture.worktreeId,
      status: "discarded",
    });
    await expectNoWorkbenchDecision(fixture, "worktree.discard");
  }, 120_000);

  it("does not mutate source without the human confirmation", async () => {
    const fixture = await prepareFixture("Apply confirmation gate");

    await expect(applyWorktree(project(), fixture.worktreeId, {
      actionScope: fixture.actionScope,
    })).rejects.toThrow(/confirmation/i);

    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await status()).toBe("");
  }, 120_000);

  it("rejects forged approval scope before apply or discard", async () => {
    const fixture = await prepareFixture("Forged approval scope");
    const forged = { ...fixture.actionScope, changeId: "wrong-change" };

    await expect(applyWorktree(project(), fixture.worktreeId, {
      userConfirmed: true,
      actionScope: forged,
    })).rejects.toThrow(/scope is stale|scope is stale or incomplete/i);
    await expect(discardWorktree(project(), fixture.worktreeId, { actionScope: forged }))
      .rejects.toThrow(/scope is stale|scope is stale or incomplete/i);

    expect(existsSync(fixture.worktreePath)).toBe(true);
    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await status()).toBe("");
  }, 120_000);

  it("rejects worktree diff drift before source mutation", async () => {
    const fixture = await prepareFixture("Worktree diff drift");
    await writeFile(join(fixture.worktreePath, "drift.txt"), "drift\n", "utf8");

    await expect(applyWorktree(project(), fixture.worktreeId, {
      userConfirmed: true,
      actionScope: fixture.actionScope,
    })).rejects.toThrow(/scope is stale|stale|diff/i);

    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await status()).toBe("");
  }, 120_000);

  it("rejects source HEAD drift before source mutation", async () => {
    const fixture = await prepareFixture("Source HEAD drift");
    await writeFile(join(getTempDir(), "unrelated.txt"), "source drift\n", "utf8");
    await git(getTempDir(), ["add", "unrelated.txt"]);
    await git(getTempDir(), ["commit", "-m", "source drift"]);

    await expect(applyWorktree(project(), fixture.worktreeId, {
      userConfirmed: true,
      actionScope: fixture.actionScope,
    })).rejects.toThrow(/authorization lineage is stale|source HEAD|stale/i);

    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
  }, 120_000);
});

async function prepareFixture(title: string) {
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  return prepareSkillNativeApplyFixture({
    projectRoot: getTempDir(),
    ahoHome: process.env.AHO_HOME!,
    projectId: project().id,
    projectName: project().name,
    title,
  });
}

async function status(): Promise<string> {
  return (await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() })).stdout.trim();
}

async function readSource(path: string): Promise<string> {
  return readFile(join(getTempDir(), path), "utf8");
}

async function expectNoWorkbenchDecision(
  fixture: Awaited<ReturnType<typeof prepareFixture>>,
  actionId: "result.apply" | "worktree.discard",
): Promise<void> {
  const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
  try {
    expect(store.decisions.listDecisions(fixture.project.id, fixture.changeId)
      .filter((decision) => decision.actionId === actionId)).toEqual([]);
  } finally {
    store.close();
  }
}
