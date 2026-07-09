import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditHarness } from "../../src/harness/audit.js";
import { initHarness } from "../../src/harness/init.js";
import { writeChangeIndex } from "../../src/ecl/index.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;
let originalAhoHome: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-harness-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(tempDir, "home");
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
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
  it("keeps module handoff map coverage in ECL and the review template", async () => {
    const ecl = await readFile("docs/ECL.md", "utf8");
    const template = await readFile("harness/templates/change/reviews/review.md", "utf8");

    expect(ecl).toContain("module handoff map");
    expect(ecl).toContain("forbidden write-back locations");
    expect(template).toContain("forbidden write-back locations");
    expect(template).toContain("boundary tests or lint checks");
  });

  it("audits a missing harness", async () => {
    const audit = await auditHarness(tempDir);
    expect(audit.readiness).toBe("missing");
    expect(audit.managed).toBe(false);
  });

  it("initializes a Core Harness without an active change", async () => {
    const result = await initHarness(project(tempDir));
    const audit = await auditHarness(tempDir);
    const ignore = await readFile(join(tempDir, ".agent-harness", ".gitignore"), "utf8");

    expect(result.created).toContainEqual({ base: "project-root", path: ".agent-harness/project.json" });
    expect(ignore).toContain("runs/");
    expect(ignore).toContain("worktrees/");
    expect(ignore).toContain("workbench/");
    expect(audit.managed).toBe(true);
    expect(audit.readiness).toBe("ready");
  });

  it("backfills Workbench runtime ignore entries without rewriting marker state", async () => {
    await mkdir(join(tempDir, ".agent-harness"), { recursive: true });
    await writeFile(join(tempDir, ".agent-harness", ".gitignore"), "runs/\nworktrees/\n", "utf8");

    const result = await initHarness(project(tempDir));
    const ignore = await readFile(join(tempDir, ".agent-harness", ".gitignore"), "utf8");

    expect(result.created).toContainEqual({ base: "project-root", path: ".agent-harness/.gitignore" });
    expect(ignore).toContain("workbench/");
  });

  it("aborts init when an active change exists", async () => {
    await mkdir(join(tempDir, "harness", "changes", "active", "existing"), { recursive: true });
    await expect(initHarness(project(tempDir))).rejects.toThrow("active change");
  });

  it("initializes external-local memory without overwriting an existing AGENTS.md", async () => {
    await writeFile(join(tempDir, "AGENTS.md"), "existing guide\n", "utf8");

    const result = await initHarness(project(tempDir), { memoryMode: "external-local" });
    const backups = (await readdir(tempDir)).filter((name) => name.startsWith("AGENTS.md.bak-"));
    const memoryRoot = join(process.env.AHO_HOME ?? "", "projects", "repo");
    const audit = await auditHarness(tempDir);

    expect(backups).toHaveLength(0);
    expect(await readFile(join(tempDir, "AGENTS.md"), "utf8")).toBe("existing guide\n");
    expect(result.skipped).toContainEqual({ base: "project-root", path: "AGENTS.md" });
    expect(result.created).toEqual(expect.arrayContaining([
      { base: "memory-root", path: "docs/ECL.md" },
    ]));
    expect(existsSync(join(memoryRoot, "harness", "changes", "INDEX.json"))).toBe(true);
    expect(audit.readiness).toBe("ready");
    expect(audit.components.some((component) => component.location === "memory" && component.exists)).toBe(true);
  });

  it("does not rewrite an existing matching project marker during external-local init", async () => {
    const markerPath = join(tempDir, ".agent-harness", "project.json");
    await mkdir(join(tempDir, ".agent-harness"), { recursive: true });
    const marker = {
      version: "1.0",
      id: "repo",
      name: "Repo",
      managedBy: "agent-harness-orchestrator",
      memoryMode: "external-local",
      createdAt: "2026-06-22T00:00:00.000Z",
    };
    await writeFile(markerPath, JSON.stringify(marker, null, 2), "utf8");

    const result = await initHarness(project(tempDir), { memoryMode: "external-local" });

    expect(result.skipped).toContainEqual({ base: "project-root", path: ".agent-harness/project.json" });
    expect(JSON.parse(await readFile(markerPath, "utf8"))).toMatchObject(marker);
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
