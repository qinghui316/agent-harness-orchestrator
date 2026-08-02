import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  claimProjectHarnessWriterLock,
  readProjectHarnessWriterLock,
  releaseProjectHarnessWriterLock,
  withProjectHarnessWriterLock,
} from "../../src/project-harness/writer-lock.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness shared writer lock", () => {
  it("serializes migrate, Integration finalization, and Evolution publication owners", async () => {
    const sidecar = await createSidecar();
    const first = await claimProjectHarnessWriterLock(sidecar, {
      projectId: "project-a1",
      ownerId: "migrate-1",
      operation: "migrate",
    });
    await expect(claimProjectHarnessWriterLock(sidecar, {
      projectId: "project-a1",
      ownerId: "evolution-1",
      operation: "evolution-publish",
    })).rejects.toThrow(/already held/);
    await releaseProjectHarnessWriterLock(sidecar, first.token);
  });

  it("reclaims only an expired lock and preserves a monotonic ownership boundary", async () => {
    const sidecar = await createSidecar();
    const lockDir = join(sidecar, "writer-lock");
    await mkdir(lockDir);
    await writeFile(join(lockDir, "owner.json"), `${JSON.stringify({
      schemaVersion: "1.0",
      projectId: "project-a1",
      ownerId: "dead-owner",
      operation: "integration-finalize",
      token: "dead-token",
      pid: 1,
      acquiredAt: "2020-01-01T00:00:00.000Z",
      heartbeatAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T00:00:01.000Z",
    }, null, 2)}\n`, "utf8");

    const current = await claimProjectHarnessWriterLock(sidecar, {
      projectId: "project-a1",
      ownerId: "migrate-2",
      operation: "migrate",
    });
    expect(current.ownerId).toBe("migrate-2");
    expect(current.token).not.toBe("dead-token");
    await releaseProjectHarnessWriterLock(sidecar, current.token);
  });

  it("never releases a lock whose token changed during the action", async () => {
    const sidecar = await createSidecar();
    await expect(withProjectHarnessWriterLock(sidecar, {
      projectId: "project-a1",
      ownerId: "migrate-3",
      operation: "migrate",
      ttlMs: 10_000,
    }, async ({ lock }) => {
      const ownerPath = join(sidecar, "writer-lock", "owner.json");
      const owner = JSON.parse(await readFile(ownerPath, "utf8")) as Record<string, unknown>;
      await writeFile(ownerPath, `${JSON.stringify({ ...owner, token: "replacement-token" }, null, 2)}\n`, "utf8");
      expect(lock.token).not.toBe("replacement-token");
    })).rejects.toThrow(/not owned|another/);
    expect((await readProjectHarnessWriterLock(sidecar))?.token).toBe("replacement-token");
  });
});

async function createSidecar(): Promise<string> {
  const sidecar = await mkdtemp(join(tmpdir(), "aho-writer-lock-"));
  cleanup.push(sidecar);
  return sidecar;
}
