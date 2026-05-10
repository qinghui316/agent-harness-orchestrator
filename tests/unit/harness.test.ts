import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditHarness } from "../../src/harness/audit.js";
import { initHarness } from "../../src/harness/init.js";
import { writeChangeIndex } from "../../src/ecl/index.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-harness-"));
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

describe("harness", () => {
  it("audits a missing harness", async () => {
    const audit = await auditHarness(tempDir);
    expect(audit.readiness).toBe("missing");
    expect(audit.managed).toBe(false);
  });

  it("initializes a Core Harness without an active change", async () => {
    const result = await initHarness(project(tempDir));
    const audit = await auditHarness(tempDir);

    expect(result.created).toContain(".agent-harness/project.json");
    expect(audit.managed).toBe(true);
    expect(audit.readiness).toBe("ready");
  });

  it("aborts init when an active change exists", async () => {
    await mkdir(join(tempDir, "harness", "changes", "active", "existing"), { recursive: true });
    await expect(initHarness(project(tempDir))).rejects.toThrow("active change");
  });

  it("reindexes active, parking, and archive changes", async () => {
    await mkdir(join(tempDir, "harness", "changes", "active", "one"), { recursive: true });
    await mkdir(join(tempDir, "harness", "changes", "parking", "two"), { recursive: true });
    await mkdir(join(tempDir, "harness", "changes", "archive", "three"), { recursive: true });

    const index = await writeChangeIndex(tempDir);
    const raw = await readFile(join(tempDir, "harness", "changes", "INDEX.json"), "utf8");

    expect(index.active[0]?.name).toBe("one");
    expect(index.parking[0]?.name).toBe("two");
    expect(index.archive[0]?.name).toBe("three");
    expect(JSON.parse(raw)).toMatchObject({ active: [{ name: "one" }] });
  });
});
