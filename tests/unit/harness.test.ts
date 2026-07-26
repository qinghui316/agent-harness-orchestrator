import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditHarness } from "../../src/harness/audit.js";
import { ensureProjectRuntime, initHarness } from "../../src/harness/init.js";
import { writeChangeIndex } from "../../src/ecl/index.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;
let originalAhoHome: string | undefined;
const execFileAsync = promisify(execFile);

async function runHarnessEvolve(root: string, command: "check" | "mark-complete" | "status") {
  return execFileAsync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(process.cwd(), "scripts", "harness-evolve.ps1"),
    command,
    "-HarnessRoot",
    root,
  ]);
}

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

  it("initializes external-local runtime state without creating project Harness documents", async () => {
    await writeFile(join(tempDir, "AGENTS.md"), "existing guide\n", "utf8");

    const result = await initHarness(project(tempDir), { memoryMode: "external-local" });
    const memoryRoot = join(process.env.AHO_HOME ?? "", "projects", "repo");
    const audit = await auditHarness(tempDir);

    expect(await readFile(join(tempDir, "AGENTS.md"), "utf8")).toBe("existing guide\n");
    expect(result.indexPath).toBeNull();
    expect(result.created).toEqual(expect.arrayContaining([
      { base: "memory-root", path: "." },
      { base: "memory-root", path: "runs" },
      { base: "memory-root", path: "workbench" },
      { base: "memory-root", path: "agents" },
      { base: "memory-root", path: "commands" },
      { base: "memory-root", path: "skills" },
      { base: "memory-root", path: "worktrees/metadata" },
    ]));
    expect(existsSync(join(tempDir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(tempDir, "docs"))).toBe(false);
    expect(existsSync(join(tempDir, "harness"))).toBe(false);
    expect(existsSync(join(tempDir, "scripts"))).toBe(false);
    expect(existsSync(join(memoryRoot, "docs", "ECL.md"))).toBe(false);
    expect(existsSync(join(memoryRoot, "harness", "changes", "INDEX.json"))).toBe(false);
    expect(audit.readiness).toBe("partial");
    expect(audit.components.some((component) => component.location === "memory" && component.exists)).toBe(false);
  });

  it("fails closed when an existing external memory root is missing", async () => {
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

    await expect(initHarness(project(tempDir), { memoryMode: "external-local" }))
      .rejects.toThrow("项目历史不可用：外部记忆目录已丢失");
    await expect(ensureProjectRuntime(project(tempDir)))
      .rejects.toThrow("项目历史不可用：外部记忆目录已丢失");
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

  it("counts only non-Evolution archives in each Harness evolution window", async () => {
    const archiveRoot = join(tempDir, "harness", "changes", "archive");
    const evolutionRoot = join(tempDir, "harness", "evolution");
    await mkdir(archiveRoot, { recursive: true });
    await mkdir(evolutionRoot, { recursive: true });
    await writeFile(join(evolutionRoot, "state.json"), JSON.stringify({
      version: "2.0",
      archive_threshold: 5,
      last_completed_candidate_archive_count: 0,
      last_completed_at: null,
    }), "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await mkdir(join(archiveRoot, `2026070${index}-product-${index}`));
    }

    await runHarnessEvolve(tempDir, "mark-complete");
    await mkdir(join(archiveRoot, "20260706-auto-evolve-harness-window-v1"));

    const status = await runHarnessEvolve(tempDir, "status");
    expect(status.stdout).toContain("Candidate archive changes: 5");
    expect(status.stdout).toContain("Total archive changes: 6");
    expect(status.stdout).toContain("Last completed candidate archive count: 5");

    const noPending = await runHarnessEvolve(tempDir, "check");
    expect(noPending.stdout).toContain("No pending evolution. 0 candidate archives");
    expect(existsSync(join(evolutionRoot, "pending.md"))).toBe(false);

    for (let index = 6; index <= 10; index += 1) {
      await mkdir(join(archiveRoot, `202607${index}-product-${index}`));
    }

    await runHarnessEvolve(tempDir, "check");
    const pending = await readFile(join(evolutionRoot, "pending.md"), "utf8");
    expect(pending).toContain("Generated because 5 candidate archives");
    expect(pending).toContain("2026076-product-6");
    expect(pending).toContain("20260710-product-10");
    expect(pending).not.toContain("product-5");
    expect(pending).not.toContain("auto-evolve-harness-window-v1");
  });
});
