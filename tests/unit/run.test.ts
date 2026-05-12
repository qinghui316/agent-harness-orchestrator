import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { listRuns, readRun, startLocalCommandRun } from "../../src/run/manager.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-run-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function project(path: string): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

describe("run manager", () => {
  it("records a completed local command run", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Run Evidence" });

    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", "console.log('ok')"]);
    const runDir = join(tempDir, result.run.artifacts.directory);
    const events = (await readFile(join(runDir, "events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));

    expect(result.run.status).toBe("completed");
    expect(result.run.exitCode).toBe(0);
    expect(await readFile(join(runDir, "stdout.log"), "utf8")).toContain("ok");
    expect(await readFile(join(runDir, "context.md"), "utf8")).toContain("Run Context Projection");
    expect(events.map((event) => event.type)).toEqual([
      "run.created",
      "context.prepared",
      "process.started",
      "process.exited",
      "run.completed",
    ]);
  });

  it("records a failed local command run", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Failed Run" });

    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", "console.error('bad'); process.exit(2)"]);
    const runDir = join(tempDir, result.run.artifacts.directory);

    expect(result.run.status).toBe("failed");
    expect(result.run.exitCode).toBe(2);
    expect(await readFile(join(runDir, "stderr.log"), "utf8")).toContain("bad");
  });

  it("lists and reads recorded runs", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "List Runs" });
    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""]);

    const runs = await listRuns(tempDir);
    const read = await readRun(tempDir, result.run.id);

    expect(runs).toHaveLength(1);
    expect(read.id).toBe(result.run.id);
  });

  it("blocks run start without exactly one active change", async () => {
    await initHarness(project(tempDir));
    await expect(startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""])).rejects.toThrow("no active change");

    await mkdir(join(tempDir, "harness", "changes", "active", "one"), { recursive: true });
    await mkdir(join(tempDir, "harness", "changes", "active", "two"), { recursive: true });
    await expect(startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""])).rejects.toThrow("expected exactly one active change");
  });
});
