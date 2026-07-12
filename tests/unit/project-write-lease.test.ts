import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyWorktree } from "../../src/apply/apply-discard.js";
import {
  claimProjectDocumentLease,
  claimProjectWriteLease,
  heartbeatProjectWriteLease,
  readProjectDocumentLease,
  readProjectWriteLease,
  releaseProjectDocumentLease,
  releaseProjectWriteLease,
  withProjectDocumentLease,
  withProjectWriteLease,
} from "../../src/project/index.js";
import type { ManagedProject } from "../../src/types/index.js";

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

  it("serializes canonical document writers without consuming the source-write slot", async () => {
    const document = await claimProjectDocumentLease(projectPath, { holderId: "docs-1", ttlMs: 1_000 });
    expect(document).toMatchObject({ holderId: "docs-1", fencingToken: 1 });
    await expect(claimProjectDocumentLease(projectPath, { holderId: "docs-2", ttlMs: 1_000 })).resolves.toBeNull();
    await expect(claimProjectWriteLease(projectPath, { holderId: "source-1", ttlMs: 1_000 })).resolves.not.toBeNull();
    await releaseProjectDocumentLease(projectPath, document!);
    await expect(readProjectDocumentLease(projectPath)).resolves.toBeNull();
  });

  it("keeps the document lease scoped helper independent", async () => {
    await withProjectDocumentLease(projectPath, { holderId: "docs" }, async () => {
      await expect(readProjectDocumentLease(projectPath)).resolves.toMatchObject({ holderId: "docs" });
    });
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

  it("aborts the scoped signal as soon as lease ownership is lost", async () => {
    await expect(withProjectDocumentLease(projectPath, { holderId: "first", ttlMs: 10_000 }, async (scope) => {
      await releaseProjectDocumentLease(projectPath, scope.lease);
      expect(await claimProjectDocumentLease(projectPath, { holderId: "second", ttlMs: 10_000 })).not.toBeNull();
      await expect(scope.heartbeat()).rejects.toThrow(/not owned/);
      expect(scope.signal.aborted).toBe(true);
    })).rejects.toThrow(/not owned/);
  });

  it("guards the production worktree apply entrypoint before revalidation", async () => {
    const held = await claimProjectWriteLease(projectPath, { holderId: "other-apply", ttlMs: 10_000 });
    if (!held) throw new Error("Expected test lease claim to succeed.");
    const project: ManagedProject = {
      id: "project-1",
      name: "Project 1",
      path: projectPath,
      addedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    await expect(applyWorktree(project, "worktree-1")).rejects.toThrow(/already held/);
    await releaseProjectWriteLease(projectPath, held);
  });
});
