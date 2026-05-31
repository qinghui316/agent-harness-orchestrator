import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange, createConcurrentChange, getChangeStatus } from "../../src/change/manager.js";
import { writeJsonFile } from "../../src/fs/json.js";
import { initHarness } from "../../src/harness/init.js";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import { resolveValidationProfile } from "../../src/validation/profiles.js";
import { startValidationRun } from "../../src/validation/manager.js";
import type { ManagedProject, ValidationResult } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-validation-"));
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

describe("validation", () => {
  it("resolves validation profiles from environment config before package fallback", async () => {
    await initHarness(project(tempDir));
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node test.js" } }), "utf8");
    await writeFile(join(tempDir, "harness", "config", "environment.json"), JSON.stringify({
      validation: {
        profiles: {
          default: [
            { name: "custom", command: [process.execPath, "-e", "console.log('custom')"] },
          ],
        },
      },
    }), "utf8");

    const profile = await resolveValidationProfile(repoLocalMemory(tempDir, "repo"), "default");

    expect(profile.source).toBe("config");
    expect(profile.commands.map((command) => command.name)).toEqual(["custom"]);
  });

  it("falls back when generated environment config has no default profile", async () => {
    await initHarness(project(tempDir));
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node test.js" } }), "utf8");

    const profile = await resolveValidationProfile(repoLocalMemory(tempDir, "repo"), "default");

    expect(profile.source).toBe("package");
    expect(profile.commands).toEqual([{ name: "test", command: ["npm", "run", "test"], source: "package" }]);
  });

  it("reads validation config with a UTF-8 BOM", async () => {
    await initHarness(project(tempDir));
    await writeFile(join(tempDir, "harness", "config", "environment.json"), `\uFEFF${JSON.stringify({
      validation: {
        profiles: {
          default: [
            { name: "test", command: ["npm", "run", "test"] },
          ],
        },
      },
    })}`, "utf8");

    const profile = await resolveValidationProfile(repoLocalMemory(tempDir, "repo"), "default");

    expect(profile.source).toBe("config");
    expect(profile.commands.map((command) => command.name)).toEqual(["test"]);
  });

  it("falls back to allowlisted package scripts and skips missing scripts", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { lint: "eslint .", dev: "vite" } }), "utf8");

    const profile = await resolveValidationProfile(repoLocalMemory(tempDir, "repo"), "default");

    expect(profile.source).toBe("package");
    expect(profile.commands).toEqual([{ name: "lint", command: ["npm", "run", "lint"], source: "package" }]);
  });

  it("fails when no config profile or fallback scripts exist", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }), "utf8");

    await expect(resolveValidationProfile(repoLocalMemory(tempDir, "repo"), "default")).rejects.toThrow("none of: typecheck, lint, test, build");
  });

  it("records passed and failed validation artifacts", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Validate Me" });
    await writeFile(join(tempDir, "harness", "config", "environment.json"), JSON.stringify({
      validation: {
        profiles: {
          default: [
            { name: "pass", command: [process.execPath, "-e", "console.log('pass')"] },
            { name: "fail", command: [process.execPath, "-e", "console.error('fail'); process.exit(2)"] },
          ],
        },
      },
    }), "utf8");

    const result = await startValidationRun(project(tempDir));
    const runDir = join(tempDir, result.run.artifacts.directory);

    expect(result.validation.status).toBe("failed");
    expect(result.run.status).toBe("failed");
    expect(result.run.runtime).toBe("validator");
    expect(existsSync(join(runDir, "validation.json"))).toBe(true);
    expect(await readFile(join(runDir, "commands", "001-pass.stdout.log"), "utf8")).toContain("pass");
    expect(await readFile(join(runDir, "commands", "002-fail.stderr.log"), "utf8")).toContain("fail");
  });

  it("runs validation for an explicit Change target when multiple active demands exist", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "First Validation Target" });
    await createConcurrentChange(project(tempDir), { title: "Second Validation Target" });
    await writeFile(join(tempDir, "harness", "config", "environment.json"), JSON.stringify({
      validation: {
        profiles: {
          default: [
            { name: "pass", command: [process.execPath, "-e", "console.log('pass')"] },
          ],
        },
      },
    }), "utf8");

    const result = await startValidationRun(project(tempDir), { changeId: "second-validation-target" });

    expect(result.validation.changeId).toBe("second-validation-target");
    expect(result.run.changeId).toBe("second-validation-target");
    expect(result.validation.status).toBe("passed");
  });

  it("adds validation state to the close gate for the current change", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Gate Me" });
    const changeDir = join(tempDir, "harness", "changes", "active", "gate-me");
    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");

    const noValidation = await getChangeStatus(project(tempDir));
    expect(noValidation.closeGate.warnings).toContain("No validation run recorded for this change.");

    await mkdir(join(tempDir, ".agent-harness", "runs", "validation-old"), { recursive: true });
    await writeValidation("validation-old", "other-change", "failed");
    const ignoredOld = await getChangeStatus(project(tempDir));
    expect(ignoredOld.closeGate.blockingIssues.join("\n")).not.toContain("Latest validation failed");

    await mkdir(join(tempDir, ".agent-harness", "runs", "validation-failed"), { recursive: true });
    await writeValidation("validation-failed", "gate-me", "failed");
    const failed = await getChangeStatus(project(tempDir));
    expect(failed.closeGate.blockingIssues).toContain("Latest validation failed: validation-failed.");

    await mkdir(join(tempDir, ".agent-harness", "runs", "validation-passed"), { recursive: true });
    await writeValidation("validation-passed", "gate-me", "passed", "2099-01-01T00:00:00.000Z");
    const passed = await getChangeStatus(project(tempDir));
    expect(passed.closeGate.blockingIssues.join("\n")).not.toContain("Latest validation failed");
  });

  it("bundles agent role contracts with required sections", async () => {
    for (const name of ["validator", "auditor", "coder"]) {
      const content = await readFile(join(process.cwd(), "templates", "agent-profiles", `${name}.md`), "utf8");
      for (const section of [
        "## Role",
        "## Success Criteria",
        "## Constraints",
        "## Workflow / Protocol",
        "## Allowed Inputs",
        "## Allowed Outputs",
        "## Blocked Actions",
        "## Failure Modes",
      ]) {
        expect(content).toContain(section);
      }
    }
  });
});

async function writeValidation(id: string, changeId: string, status: "passed" | "failed", startedAt = "2026-01-01T00:00:00.000Z"): Promise<void> {
  const validation: ValidationResult = {
    version: "1.0",
    id,
    runId: id,
    changeId,
    profile: "default",
    status,
    executionMode: "direct",
    startedAt,
    finishedAt: startedAt,
    commands: [],
  };
  await writeJsonFile(join(tempDir, ".agent-harness", "runs", id, "validation.json"), validation);
}
