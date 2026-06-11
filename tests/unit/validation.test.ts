import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange, createConcurrentChange, getChangeStatus } from "../../src/change/manager.js";
import { writeJsonFile } from "../../src/fs/json.js";
import { initHarness } from "../../src/harness/init.js";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import { git } from "../../src/project/git.js";
import { resolveValidationProfile } from "../../src/validation/profiles.js";
import { startValidationRun } from "../../src/validation/manager.js";
import { listValidationResults, readValidationResult } from "../../src/validation/artifacts.js";
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
    expect(existsSync(join(runDir, "context-packet.json"))).toBe(true);
    expect(result.run.artifacts.contextPacket).toBe(`${result.run.artifacts.directory}/context-packet.json`);
    expect(result.run.contextPacket?.format).toBe("role-context-packet@1.0");
    expect(await readFile(join(runDir, "context.md"), "utf8")).toContain("Role Context Packet");
    expect(await readFile(join(runDir, "context-packet.json"), "utf8")).toContain("\"roleId\": \"validator\"");
    expect(await readFile(join(runDir, "commands", "001-pass.stdout.log"), "utf8")).toContain("pass");
    expect(await readFile(join(runDir, "commands", "002-fail.stderr.log"), "utf8")).toContain("fail");
    const workerSession = JSON.parse(await readFile(join(runDir, "worker-session.json"), "utf8"));
    const runtimeWorkspace = JSON.parse(await readFile(join(runDir, "runtime-workspace.json"), "utf8"));
    const eventSource = JSON.parse(await readFile(join(runDir, "event-source.json"), "utf8"));
    const agentEvents = (await readFile(join(runDir, "agent-events.jsonl"), "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(workerSession).toMatchObject({ adapter: "validation-command", changeId: "validate-me", runId: result.run.id, roleId: "validator", status: "failed" });
    expect(runtimeWorkspace).toMatchObject({ workspaceKind: "source-root", cwd: tempDir, roleId: "validator" });
    expect(runtimeWorkspace.worktreeId).toBeUndefined();
    expect(eventSource).toMatchObject({ adapter: "validation-command", status: "failed", workerSessionId: workerSession.id });
    expect(agentEvents.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "permission.profile.attached",
      "external-execution.requested",
      "external-execution.completed",
      "external-execution.failed",
      "validation.started",
      "validation.command.started",
      "validation.command.exited",
      "validation.failed",
    ]));
    expect(agentEvents.filter((event) => event.eventType === "external-execution.requested")).toHaveLength(2);
    expect(agentEvents.filter((event) => event.eventType === "external-execution.completed")).toHaveLength(1);
    expect(agentEvents.filter((event) => event.eventType === "external-execution.failed")).toHaveLength(1);
    expect(agentEvents[0]).toMatchObject({ changeId: "validate-me", runId: result.run.id, roleId: "validator" });
    expect(agentEvents[0].raw.changeId).toBeUndefined();
  });

  it("records runtime continuity sidecars for worktree validation", async () => {
    await initGitRepo(tempDir);
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Worktree Validate" });
    await writeFile(join(tempDir, "harness", "config", "environment.json"), JSON.stringify({
      validation: {
        profiles: {
          default: [
            { name: "pass", command: [process.execPath, "-e", "console.log('pass')"] },
          ],
        },
      },
    }), "utf8");

    const result = await startValidationRun(project(tempDir), { worktree: true });
    const runDir = join(tempDir, result.run.artifacts.directory);
    const workerSession = JSON.parse(await readFile(join(runDir, "worker-session.json"), "utf8"));
    const runtimeWorkspace = JSON.parse(await readFile(join(runDir, "runtime-workspace.json"), "utf8"));
    const agentEvents = (await readFile(join(runDir, "agent-events.jsonl"), "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));

    expect(result.validation.status).toBe("passed");
    expect(workerSession).toMatchObject({ adapter: "validation-command", roleId: "validator", status: "completed", worktreeId: result.run.worktree?.worktreeId });
    expect(runtimeWorkspace).toMatchObject({
      workspaceKind: "local-worktree",
      worktreeId: result.run.worktree?.worktreeId,
      checkoutPath: result.run.worktree?.checkoutPath,
    });
    expect(agentEvents.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "permission.profile.attached",
      "external-execution.requested",
      "external-execution.completed",
    ]));
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

  it("rejects forged validation evidence on direct read and skips it in list paths", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Validation Scope" });
    const memory = repoLocalMemory(tempDir, "repo");

    await mkdir(join(tempDir, ".agent-harness", "runs", "validation-good"), { recursive: true });
    await writeValidation("validation-good", "validation-scope", "passed");
    await mkdir(join(tempDir, ".agent-harness", "runs", "validation-forged"), { recursive: true });
    await writeValidationAt("validation-forged", "validation-other-id", "validation-scope", "failed");
    await mkdir(join(tempDir, ".agent-harness", "runs", "validation-malformed"), { recursive: true });
    await writeFile(join(tempDir, ".agent-harness", "runs", "validation-malformed", "validation.json"), "{", "utf8");

    await expect(readValidationResult(memory, "validation-forged")).rejects.toThrow("does not match run directory");
    await expect(readValidationResult(memory, "validation-good", { changeId: "other-change" })).rejects.toThrow("does not match requested change");
    const listed = await listValidationResults(memory, "validation-scope");
    expect(listed.map((item) => item.id)).toEqual(["validation-good"]);

    const status = await getChangeStatus(project(tempDir));
    expect(status.latestValidation?.id).toBe("validation-good");
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
  await writeValidationAt(id, id, changeId, status, startedAt);
}

async function writeValidationAt(directoryId: string, id: string, changeId: string, status: "passed" | "failed", startedAt = "2026-01-01T00:00:00.000Z"): Promise<void> {
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
  await writeJsonFile(join(tempDir, ".agent-harness", "runs", directoryId, "validation.json"), validation);
}

async function initGitRepo(cwd: string): Promise<void> {
  await git(cwd, ["init"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
  await writeFile(join(cwd, "README.md"), "initial\n", "utf8");
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "initial"]);
}
