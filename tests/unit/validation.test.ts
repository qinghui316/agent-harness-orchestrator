import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getChangeStatus } from "../../src/change/manager.js";
import { writeJsonFile } from "../../src/fs/json.js";
import { git } from "../../src/project/git.js";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { resolveSkillNativeValidationProfile } from "../../src/validation/profiles.js";
import { startValidationRun } from "../../src/validation/manager.js";
import { listValidationResults, readValidationResult } from "../../src/validation/artifacts.js";
import { createWorktreeWithRuntimePort } from "../../src/worktree/creation.js";
import type { ManagedProject, ValidationResult } from "../../src/types/index.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  prepareSkillNativeWorkbenchFixture,
  writeSkillNativeAcceptedSpecAndTasks,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";

let tempDir: string;
let fixture: SkillNativeWorkbenchFixture;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-validation-"));
  fixture = await prepareSkillNativeWorkbenchFixture({
    project: project(tempDir),
    ahoHome: join(tempDir, ".aho-home"),
  });
});

afterEach(async () => {
  fixture.restoreEnvironment();
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
  it("does not treat retired repo-local Harness config as a validation authority", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node test.js" } }), "utf8");
    await mkdir(join(tempDir, "harness", "config"), { recursive: true });
    await writeFile(join(tempDir, "harness", "config", "environment.json"), JSON.stringify({
      validation: {
        profiles: {
          default: [
            { name: "custom", command: [process.execPath, "-e", "console.log('custom')"] },
          ],
        },
      },
    }), "utf8");

    const profile = await resolveSkillNativeValidationProfile(tempDir, "default");

    expect(profile.source).toBe("package");
    expect(profile.commands.map((command) => command.name)).toEqual(["test"]);
  });

  it("falls back when generated environment config has no default profile", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node test.js" } }), "utf8");

    const profile = await resolveSkillNativeValidationProfile(tempDir, "default");

    expect(profile.source).toBe("package");
    expect(profile.commands).toEqual([{ name: "test", command: ["npm", "run", "test"], source: "package" }]);
  });

  it("reads package validation scripts with a UTF-8 BOM", async () => {
    await writeFile(join(tempDir, "package.json"), `\uFEFF${JSON.stringify({ scripts: { test: "node test.js" } })}`, "utf8");

    const profile = await resolveSkillNativeValidationProfile(tempDir, "default");

    expect(profile.source).toBe("package");
    expect(profile.commands.map((command) => command.name)).toEqual(["test"]);
  });

  it("falls back to allowlisted package scripts and skips missing scripts", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { lint: "eslint .", dev: "vite" } }), "utf8");

    const profile = await resolveSkillNativeValidationProfile(tempDir, "default");

    expect(profile.source).toBe("package");
    expect(profile.commands).toEqual([{ name: "lint", command: ["npm", "run", "lint"], source: "package" }]);
  });

  it("fails when no config profile or fallback scripts exist", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }), "utf8");

    await expect(resolveSkillNativeValidationProfile(tempDir, "default")).rejects.toThrow("none of: typecheck, lint, test, build");
  });

  it("records passed and failed validation artifacts", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: {
      typecheck: "node -e \"console.log('pass')\"",
      test: "node -e \"console.error('fail'); process.exit(2)\"",
    } }), "utf8");
    await activateChange("Validate Me");

    const result = await startValidationRun(project(tempDir));
    const runDir = join(fixture.runtime.runArtifactRoot, result.run.artifacts.directory);

    expect(result.validation.status).toBe("failed");
    expect(result.run.status).toBe("failed");
    expect(result.run.runtime).toBe("validator");
    expect(existsSync(join(runDir, "validation.json"))).toBe(true);
    expect(existsSync(join(runDir, "context-packet.json"))).toBe(true);
    expect(result.run.artifacts.contextPacket).toBe(`${result.run.artifacts.directory}/context-packet.json`);
    expect(result.run.contextPacket?.format).toBe("role-context-packet@2.0");
    expect(await readFile(join(runDir, "context.md"), "utf8")).toContain("Role Context Packet");
    expect(await readFile(join(runDir, "context-packet.json"), "utf8")).toContain("\"roleId\": \"validator\"");
    expect(await readFile(join(runDir, "commands", "001-typecheck.stdout.log"), "utf8")).toContain("pass");
    expect(await readFile(join(runDir, "commands", "002-test.stderr.log"), "utf8")).toContain("fail");
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
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: {
      test: "node -e \"console.log('pass')\"",
    } }), "utf8");
    await git(tempDir, ["add", "package.json"]);
    await git(tempDir, ["commit", "-m", "validation command"]);
    await activateChange("Worktree Validate");

    const result = await startValidationRun(project(tempDir), { worktree: true });
    const runDir = join(fixture.runtime.runArtifactRoot, result.run.artifacts.directory);
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

  it("bridges source Node dependencies for worktree validation without entering the diff", async () => {
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\n.agents/\n.claude/\n.aho-home/\n", "utf8");
    await writeFile(join(tempDir, "package.json"), JSON.stringify({
      scripts: {
        test: "probe-bin",
      },
    }), "utf8");
    await git(tempDir, ["add", ".gitignore", "package.json"]);
    await git(tempDir, ["commit", "-m", "add package"]);
    await mkdir(join(tempDir, "node_modules", "local-probe"), { recursive: true });
    await writeFile(join(tempDir, "node_modules", "local-probe", "index.js"), "module.exports = 'probe';\n", "utf8");
    await mkdir(join(tempDir, "node_modules", ".bin"), { recursive: true });
    await writeFile(join(tempDir, "node_modules", ".bin", "probe-bin"), "#!/usr/bin/env node\nrequire('local-probe'); console.log('probe-ok');\n", "utf8");
    await chmod(join(tempDir, "node_modules", ".bin", "probe-bin"), 0o755);
    await writeFile(join(tempDir, "node_modules", ".bin", "probe-bin.cmd"), "@echo off\r\nnode -e \"require('local-probe'); console.log('probe-ok')\"\r\n", "utf8");
    const changeId = await activateChange("Worktree Dependency Bridge");

    const result = await startValidationRun(project(tempDir), { worktree: true });
    const runDir = join(fixture.runtime.runArtifactRoot, result.run.artifacts.directory);
    const worktreeId = result.run.worktree?.worktreeId;
    expect(worktreeId).toBeTruthy();
    const diff = await collectWorktreeDiff(fixture.runtime, worktreeId as string, changeId);

    expect(result.validation.status).toBe("passed");
    expect(await readFile(join(runDir, "commands", "001-test.stdout.log"), "utf8")).toContain("probe-ok");
    expect(existsSync(join(result.run.worktree?.checkoutPath ?? "", "node_modules"))).toBe(true);
    expect(diff.diff).toBe("");
    expect(diff.diffStat).not.toContain("node_modules");
    expect(result.validation.worktreeDiffHash).toBe(diff.diffHash);
  });

  it("restores the candidate worktree diff after validation command side effects", async () => {
    await git(tempDir, ["init"]);
    await git(tempDir, ["config", "user.email", "test@example.com"]);
    await git(tempDir, ["config", "user.name", "Test User"]);
    await writeFile(join(tempDir, "package.json"), JSON.stringify({
      scripts: {
        test: `${process.execPath} -e "require('fs').writeFileSync('README.md','validation side effect\\n')"`,
      },
    }), "utf8");
    await git(tempDir, ["add", "package.json"]);
    await git(tempDir, ["commit", "-m", "initial"]);
    const changeId = await activateChange("Validation Side Effects");
    const worktree = await createWorktreeWithRuntimePort(project(tempDir), fixture.runtime, changeId, { runId: "candidate-run" });
    await mkdir(join(worktree.metadata.checkoutPath, "src"), { recursive: true });
    await writeFile(join(worktree.metadata.checkoutPath, "src", "proposal.ts"), "export const proposal = true;\n", "utf8");

    const result = await startValidationRun(project(tempDir), { worktree: worktree.metadata.worktreeId });
    const diff = await collectWorktreeDiff(fixture.runtime, worktree.metadata.worktreeId, changeId);

    expect(result.validation.status).toBe("passed");
    expect(existsSync(join(worktree.metadata.checkoutPath, "README.md"))).toBe(false);
    expect(existsSync(join(worktree.metadata.checkoutPath, "src", "proposal.ts"))).toBe(true);
    expect(diff.diff).toContain("src/proposal.ts");
    expect(diff.diff).not.toContain("validation side effect");
    expect(result.validation.worktreeDiffHash).toBe(diff.diffHash);
    const runDir = join(fixture.runtime.runArtifactRoot, result.run.artifacts.directory);
    const events = await readFile(join(runDir, "agent-events.jsonl"), "utf8");
    expect(events).toContain("validation.worktree_candidate_restored");
    expect(events).toContain("README.md");
  });

  it("fails closed before worktree validation commands when source dependencies are missing", async () => {
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\n.agents/\n.claude/\n.aho-home/\n", "utf8");
    await writeFile(join(tempDir, "package.json"), JSON.stringify({
      scripts: { test: "node -e \"console.log('should-not-run')\"" },
      devDependencies: { "dependency-that-is-not-installed": "1.0.0" },
    }), "utf8");
    await git(tempDir, ["add", ".gitignore", "package.json"]);
    await git(tempDir, ["commit", "-m", "add package without dependencies"]);
    await activateChange("Missing Source Dependencies");

    const result = await startValidationRun(project(tempDir), { worktree: true });
    const runDir = join(fixture.runtime.runArtifactRoot, result.run.artifacts.directory);

    expect(result.validation.status).toBe("failed");
    expect(result.validation.commands).toEqual([]);
    expect(result.run.status).toBe("failed");
    expect(await readFile(join(runDir, "stderr.log"), "utf8")).toContain("source dependencies are missing");
    expect(existsSync(join(runDir, "commands", "001-test.stdout.log"))).toBe(false);
  });

  it("runs validation for an explicit Change target when multiple active demands exist", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: {
      test: "node -e \"console.log('pass')\"",
    } }), "utf8");
    await git(tempDir, ["add", "package.json"]);
    await git(tempDir, ["commit", "-m", "validation command"]);
    await activateChange("First Validation Target");
    await activateChange("Second Validation Target");

    const result = await startValidationRun(project(tempDir), { changeId: "second-validation-target" });

    expect(result.validation.changeId).toBe("second-validation-target");
    expect(result.run.changeId).toBe("second-validation-target");
    expect(result.validation.status).toBe("passed");
  });

  it("adds validation state to the close gate for the current change", async () => {
    await activateChange("Gate Me");
    const changeDir = join(fixture.skillRoot, "state", "changes", "active", "gate-me");
    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");

    const noValidation = await getChangeStatus(project(tempDir));
    expect(noValidation.closeGate.warnings).toContain("No validation run recorded for this change.");

    await mkdir(join(fixture.runtime.runsRoot, "validation-old"), { recursive: true });
    await writeValidation("validation-old", "other-change", "failed");
    const ignoredOld = await getChangeStatus(project(tempDir));
    expect(ignoredOld.closeGate.blockingIssues.join("\n")).not.toContain("Latest validation failed");

    await mkdir(join(fixture.runtime.runsRoot, "validation-failed"), { recursive: true });
    await writeValidation("validation-failed", "gate-me", "failed");
    const failed = await getChangeStatus(project(tempDir));
    expect(failed.closeGate.blockingIssues).toContain("Latest validation failed: validation-failed.");

    await mkdir(join(fixture.runtime.runsRoot, "validation-passed"), { recursive: true });
    await writeValidation("validation-passed", "gate-me", "passed", "2099-01-01T00:00:00.000Z");
    const passed = await getChangeStatus(project(tempDir));
    expect(passed.closeGate.blockingIssues.join("\n")).not.toContain("Latest validation failed");
  });

  it("rejects forged validation evidence on direct read and skips it in list paths", async () => {
    await activateChange("Validation Scope");
    const memory = fixture.runtime;

    await mkdir(join(memory.runsRoot, "validation-good"), { recursive: true });
    await writeValidation("validation-good", "validation-scope", "passed");
    await mkdir(join(memory.runsRoot, "validation-forged"), { recursive: true });
    await writeValidationAt("validation-forged", "validation-other-id", "validation-scope", "failed");
    await mkdir(join(memory.runsRoot, "validation-malformed"), { recursive: true });
    await writeFile(join(memory.runsRoot, "validation-malformed", "validation.json"), "{", "utf8");

    await expect(readValidationResult(memory, "validation-forged")).rejects.toThrow("does not match run directory");
    await expect(readValidationResult(memory, "validation-good", { changeId: "other-change" })).rejects.toThrow("does not match requested change");
    const listed = await listValidationResults(memory, "validation-scope");
    expect(listed.map((item) => item.id)).toEqual(["validation-good"]);

    const status = await getChangeStatus(project(tempDir));
    expect(status.latestValidation?.id).toBe("validation-good");
  });

  it("bundles agent role contracts with required sections", async () => {
    for (const name of ["auditor-agent", "coder-agent", "harness-evolution-agent"]) {
      const content = await readFile(join(process.cwd(), "templates", "agent-profiles", `${name}.md`), "utf8");
      for (const section of [
        "## Role",
        "## Success Criteria",
        "## Constraints",
        "## Inputs",
        "## Workflow",
        "## Output Contract",
        "## Escalate When",
        "## Avoid",
      ]) {
        expect(content).toContain(section);
      }
    }
    await expect(readFile(join(process.cwd(), "templates", "agent-profiles", "memory-maintenance-agent.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function activateChange(title: string): Promise<string> {
  const change = await createConversationChangeFixture(project(tempDir), { title });
  await writeSkillNativeAcceptedSpecAndTasks(fixture, change.changeId);
  return change.changeId;
}
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
  await writeJsonFile(join(fixture.runtime.runsRoot, directoryId, "validation.json"), validation);
}
