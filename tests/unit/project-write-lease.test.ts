import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyWorktree } from "../../src/apply/apply-discard.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import {
  claimProjectWriteLease,
  heartbeatProjectWriteLease,
  readProjectWriteLease,
  releaseProjectWriteLease,
  withProjectWriteLease,
  withProjectWriteLeaseAtPath,
} from "../../src/project/index.js";
import { prepareSkillNativeApplyFixture } from "../helpers/skill-native-apply-fixture.js";
import { git, initGitRepository } from "./workbench/fixtures.js";

describe("project write lease", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aho-project-write-lease-"));
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("claims, heartbeats, and releases a project-scoped lease", async () => {
    const start = new Date("2026-07-11T00:00:00.000Z");
    const lease = await claimProjectWriteLease(projectPath, { holderId: "run-1", ttlMs: 1_000 }, start);

    expect(lease).toMatchObject({ holderId: "run-1", fencingToken: 1 });
    const renewed = await heartbeatProjectWriteLease(
      projectPath,
      { holderId: "run-1", fencingToken: 1 },
      2_000,
      new Date(start.getTime() + 500),
    );
    expect(renewed.expiresAt).toBe("2026-07-11T00:00:02.500Z");

    await releaseProjectWriteLease(
      projectPath,
      { holderId: "run-1", fencingToken: 1 },
      new Date(start.getTime() + 600),
    );
    await expect(readProjectWriteLease(projectPath)).resolves.toBeNull();
  });

  it("uses monotonic fencing and rejects an old token after expiry", async () => {
    const start = new Date("2026-07-11T00:00:00.000Z");
    const first = await claimProjectWriteLease(projectPath, { holderId: "run-1", ttlMs: 100 }, start);
    const second = await claimProjectWriteLease(
      projectPath,
      { holderId: "run-2", ttlMs: 1_000 },
      new Date(start.getTime() + 101),
    );

    expect(first?.fencingToken).toBe(1);
    expect(second?.fencingToken).toBe(2);
    await expect(
      releaseProjectWriteLease(
        projectPath,
        { holderId: "run-1", fencingToken: 1 },
        new Date(start.getTime() + 102),
      ),
    ).rejects.toThrow(/not owned/);
    expect((await readProjectWriteLease(projectPath))?.holderId).toBe("run-2");
  });

  it("allows exactly one concurrent claim for a project", async () => {
    const now = new Date("2026-07-11T00:00:00.000Z");
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        claimProjectWriteLease(projectPath, { holderId: `run-${index}`, ttlMs: 1_000 }, now),
      ),
    );

    const winners = claims.filter((lease) => lease !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.fencingToken).toBe(1);
  });

  it("does not allow an active lease to be claimed again", async () => {
    const now = new Date("2026-07-11T00:00:00.000Z");
    await claimProjectWriteLease(projectPath, { holderId: "run-1", ttlMs: 1_000 }, now);

    await expect(
      claimProjectWriteLease(projectPath, { holderId: "run-2", ttlMs: 1_000 }, now),
    ).resolves.toBeNull();
  });

  it("fails a second scoped writer while the first writer is active", async () => {
    let enterFirst!: () => void;
    let releaseFirst!: () => void;
    const entered = new Promise<void>((resolve) => { enterFirst = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = withProjectWriteLease(projectPath, { holderId: "first" }, async () => {
      enterFirst();
      await blocked;
    });
    await entered;

    await expect(
      withProjectWriteLease(projectPath, { holderId: "second" }, async () => undefined),
    ).rejects.toThrow(/already held/);

    releaseFirst();
    await first;
  });

  it("preserves the action failure when an expired lease was taken over before cleanup", async () => {
    const actionFailure = new Error("source apply failed");
    await expect(withProjectWriteLease(
      projectPath,
      { holderId: "first", ttlMs: 1_000 },
      async (scope) => {
        await releaseProjectWriteLease(projectPath, scope.lease);
        const takeover = await claimProjectWriteLease(projectPath, { holderId: "second", ttlMs: 10_000 });
        expect(takeover?.fencingToken).toBe(2);
        throw actionFailure;
      },
    )).rejects.toBe(actionFailure);
    expect((await readProjectWriteLease(projectPath))?.holderId).toBe("second");
  });

  it("keeps a live scoped writer renewed and exposes ownership loss after a successful action", async () => {
    let competing: Awaited<ReturnType<typeof claimProjectWriteLease>> | undefined;
    await withProjectWriteLease(projectPath, { holderId: "renewed", ttlMs: 300 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
      competing = await claimProjectWriteLease(projectPath, { holderId: "competing", ttlMs: 1_000 });
    });
    expect(competing).toBeNull();

    await expect(withProjectWriteLease(projectPath, { holderId: "expires", ttlMs: 1_000 }, async (scope) => {
      await releaseProjectWriteLease(projectPath, scope.lease);
      expect(await claimProjectWriteLease(projectPath, { holderId: "takeover", ttlMs: 10_000 })).not.toBeNull();
    })).rejects.toThrow(/not owned|expired/);
  });

  it("aborts the scoped source-write signal as soon as lease ownership is lost", async () => {
    await expect(withProjectWriteLease(projectPath, { holderId: "first", ttlMs: 10_000 }, async (scope) => {
      await releaseProjectWriteLease(projectPath, scope.lease);
      expect(await claimProjectWriteLease(projectPath, { holderId: "second", ttlMs: 10_000 })).not.toBeNull();
      await expect(scope.heartbeat()).rejects.toThrow(/not owned/);
      expect(scope.signal.aborted).toBe(true);
    })).rejects.toThrow(/not owned/);
  });

  it("guards the production worktree apply entrypoint before revalidation", async () => {
    const previousAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(projectPath, ".aho-home");
    try {
      await initGitRepository(projectPath);
      await writeFile(join(projectPath, ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
      await writeFile(join(projectPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(projectPath, ["add", "."]);
      await git(projectPath, ["commit", "-m", "initial"]);
      const fixture = await prepareSkillNativeApplyFixture({
        projectRoot: projectPath,
        ahoHome: process.env.AHO_HOME,
        projectId: "project-1",
        projectName: "Project 1",
      });
      const runtime = projectExecutionRuntimePort(fixture.project, fixture.resolution);
      let entered!: () => void;
      let release!: () => void;
      const active = new Promise<void>((resolve) => { entered = resolve; });
      const blocked = new Promise<void>((resolve) => { release = resolve; });
      const held = withProjectWriteLeaseAtPath(runtime.projectWriteLeasePath, { holderId: "other-apply", ttlMs: 10_000 }, async () => {
        entered();
        await blocked;
      });
      await active;
      try {
        await expect(applyWorktree(fixture.project, fixture.worktreeId, {
          userConfirmed: true,
          actionScope: fixture.actionScope,
        })).rejects.toThrow(/already held/);
      } finally {
        release();
        await held;
      }
    } finally {
      if (previousAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = previousAhoHome;
    }
  });
});
