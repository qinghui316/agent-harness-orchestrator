import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/program.js";
import { getSpecTestStatus } from "../../src/spec-test/manager.js";
import { getSpecTestDriftReport } from "../../src/spec-test/drift.js";
import { createWorkbenchTopic, listTopicMessages, postTopicMessage } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, getWorkbenchStream, listWorkbenchApprovals } from "../../src/workbench/manager.js";
import type { ManagedProject } from "../../src/types/index.js";

const execFileAsync = promisify(execFile);

let tempDir: string;
let homeDir: string;
let repoDir: string;
let originalPath: string | undefined;
let originalPathKey: string;
let originalExitCode: string | number | undefined;

async function runCli(args: string[]): Promise<void> {
  const program = createProgram();
  program.exitOverride();
  await program.parseAsync(args, { from: "user" });
}

function managedProject(): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path: repoDir,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-cli-"));
  homeDir = join(tempDir, "home");
  repoDir = join(tempDir, "repo");
  originalPathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  originalPath = process.env[originalPathKey];
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  process.env.AHO_HOME = homeDir;
  await execFileAsync("git", ["init", repoDir]);
});

afterEach(async () => {
  delete process.env.AHO_HOME;
  delete process.env.AHO_FAKE_CODEX_POLLUTE_PATH;
  delete process.env.AHO_FAKE_CODEX_ARGS_PATH;
  process.env[originalPathKey] = originalPath;
  process.exitCode = originalExitCode;
  await rm(tempDir, { recursive: true, force: true });
});

describe("CLI flow", () => {
  it("project add only changes the user registry", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);

    expect(existsSync(join(homeDir, "registry.json"))).toBe(true);
    await expect(stat(join(repoDir, ".agent-harness", "project.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("harness init writes marker and Core Harness files", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);

    expect(existsSync(join(repoDir, ".agent-harness", "project.json"))).toBe(true);
    expect(await readFile(join(repoDir, ".agent-harness", ".gitignore"), "utf8")).toContain("runs/");
    expect(existsSync(join(repoDir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(repoDir, "harness", "changes", "INDEX.json"))).toBe(true);

    const marker = JSON.parse(await readFile(join(repoDir, ".agent-harness", "project.json"), "utf8"));
    expect(marker).toMatchObject({ id: "repo", managedBy: "agent-harness-orchestrator", memoryMode: "repo-local" });
    await runCli(["memory", "status", "repo", "--json"]);
  });

  it("creates, reports, and closes a structured change", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Add Sample Workflow", "--body", "Raw user request"]);

    const changeDir = join(repoDir, "harness", "changes", "active", "add-sample-workflow");
    expect(existsSync(join(changeDir, "change.json"))).toBe(true);
    expect(existsSync(join(changeDir, "ac-map.json"))).toBe(true);
    expect(existsSync(join(changeDir, "spec-tests.json"))).toBe(true);

    await runCli(["change", "status", "repo", "--json"]);
    await expect(runCli(["change", "close", "repo"])).rejects.toThrow("Review status is pending");

    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");
    await runCli(["change", "close", "repo"]);

    const index = JSON.parse(await readFile(join(repoDir, "harness", "changes", "INDEX.json"), "utf8"));
    expect(index.active).toHaveLength(0);
    expect(index.archive[0].name).toMatch(/^\d{8}-add-sample-workflow/);
  });

  it("builds workbench read models for external-local projects", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Workbench Read Model", "--body", "Raw request"]);
    await runCli(["run", "start", "repo", "--", process.execPath, "-e", "console.log('workbench stream')"]);
    await runCli(["workbench", "snapshot", "repo", "--json"]);
    await runCli(["workbench", "topics", "repo", "--json"]);
    await runCli(["workbench", "topic", "repo", "workbench-read-model", "--json"]);
    await runCli(["workbench", "roles", "repo", "--json"]);
    const snapshot = await getWorkbenchSnapshot({ project: managedProject(), path: repoDir });
    const runId = snapshot.center.agentLoop.runs[0]?.id;
    expect(runId).toBeTruthy();
    await runCli(["workbench", "stream", "repo", runId, "--json"]);
    await runCli(["workbench", "approvals", "repo", "--json"]);
    await runCli(["workbench", "approvals", "repo", "--topic", "workbench-read-model", "--json"]);

    const stream = await getWorkbenchStream({ project: managedProject(), path: repoDir }, runId);
    const approvals = await listWorkbenchApprovals({ project: managedProject(), path: repoDir });
    expect(snapshot.memory.memoryMode).toBe("external-local");
    expect(snapshot.left.topics[0]).toMatchObject({ id: "workbench-read-model", state: "active" });
    expect(stream.artifacts.find((item) => item.key === "stdout")).toMatchObject({ exists: true, kind: "log" });
    expect(stream.events.some((item) => item.type === "run.completed")).toBe(true);
    expect(approvals.every((item) => !item.action?.mutates || item.action.requiresConfirmation)).toBe(true);
    expect(snapshot.harnessGaps.map((item) => item.id)).toEqual(expect.arrayContaining(["workspaceIndex", "subagentSpec"]));
    expect(snapshot.roles.map((item) => item.id)).toEqual(expect.arrayContaining(["spec-agent", "planner", "coder"]));
  });

  it("keeps ordinary Topic chat in one thread and resumes Codex sessions when available", async () => {
    await installFakeCodex("chat-session");
    process.env.AHO_FAKE_CODEX_ARGS_PATH = join(tempDir, "codex-args.jsonl");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);

    const topic = await createWorkbenchTopic(managedProject(), { title: "Chat Topic", body: "Raw user intent" });
    await postTopicMessage(managedProject(), topic.changeId, "这个项目现在能做什么？");
    await postTopicMessage(managedProject(), topic.changeId, "继续沿用这个话题回答。");

    const messages = await listTopicMessages(managedProject(), topic.changeId);
    const argvLog = (await readFile(process.env.AHO_FAKE_CODEX_ARGS_PATH, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line) as string[]);
    const snapshot = await getWorkbenchSnapshot({ project: managedProject(), path: repoDir }, { topicId: topic.changeId });

    expect(messages.filter((item) => item.type === "user.message")).toHaveLength(3);
    expect(messages.filter((item) => item.type === "assistant.message")).toHaveLength(2);
    expect(argvLog[0]).toEqual(expect.arrayContaining(["exec", "--json", "--sandbox", "read-only"]));
    expect(argvLog[1]).toEqual(expect.arrayContaining(["exec", "resume", "sess-chat-123"]));
    expect(snapshot.center.thread.events.some((event) => event.type === "assistant.message")).toBe(true);
  });

  it("links spec-test evidence and joins direct validation results", async () => {
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"console.log('spec test evidence')\"",
      },
    }), "utf8");
    await mkdir(join(repoDir, "test"), { recursive: true });
    await writeFile(join(repoDir, "test", "pricing.test.js"), "test\n", "utf8");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Spec Evidence"]);

    await runCli(["spec-test", "link", "repo", "--ac", "AC-001", "--file", "test/pricing.test.js", "--test-name", "normal customers pay subtotal", "--command", "test", "--json"]);
    await runCli(["validate", "run", "repo", "--json"]);
    await runCli(["spec-test", "status", "repo", "--json"]);
    await runCli(["spec-test", "check", "repo", "--json"]);
    await runCli(["spec-test", "drift", "repo", "--json"]);
    await runCli(["spec-test", "check", "repo", "--strict", "--json"]);

    const specTests = JSON.parse(await readFile(join(repoDir, "harness", "changes", "active", "spec-evidence", "spec-tests.json"), "utf8"));
    expect(specTests.mappings[0]).toMatchObject({ acId: "AC-001" });
    const status = await getSpecTestStatus(managedProject());
    expect(status.acceptanceCriteria[0]).toMatchObject({
      linkedEvidence: true,
      evidenceFilesExist: true,
      confidence: "validation-passed",
    });
    expect(status.acceptanceCriteria[0]?.commandEvidence).toEqual([{ commandName: "test", validationStatus: "passed" }]);
    const drift = await getSpecTestDriftReport(managedProject());
    expect(drift.acceptanceCriteria[0]).toMatchObject({ status: "ok" });
    expect(drift.strict.passed).toBe(true);
  });

  it("reports invalid and stale drift through strict checks", async () => {
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"console.log('drift')\"",
      },
    }), "utf8");
    await mkdir(join(repoDir, "test"), { recursive: true });
    await writeFile(join(repoDir, "test", "pricing.test.js"), "test\n", "utf8");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Spec Drift"]);
    await runCli(["spec-test", "link", "repo", "--ac", "AC-001", "--file", "test/pricing.test.js", "--command", "test", "--json"]);
    await runCli(["validate", "run", "repo", "--json"]);

    await rm(join(repoDir, "test", "pricing.test.js"));
    process.exitCode = undefined;
    await runCli(["spec-test", "check", "repo", "--strict", "--json"]);
    expect(process.exitCode).toBe(1);
    let drift = await getSpecTestDriftReport(managedProject());
    expect(drift.acceptanceCriteria[0]).toMatchObject({ status: "invalid" });

    await mkdir(join(repoDir, "test"), { recursive: true });
    await writeFile(join(repoDir, "test", "pricing.test.js"), "test\n", "utf8");
    const future = new Date(Date.now() + 5000);
    const { utimes } = await import("node:fs/promises");
    await utimes(join(repoDir, "harness", "changes", "active", "spec-drift", "spec.md"), future, future);
    process.exitCode = undefined;
    await runCli(["spec-test", "drift", "repo", "--json"]);
    await runCli(["spec-test", "check", "repo", "--strict", "--json"]);
    expect(process.exitCode).toBe(1);
    drift = await getSpecTestDriftReport(managedProject());
    expect(drift.acceptanceCriteria[0]).toMatchObject({ status: "stale" });
  });

  it("supports command-only spec-test evidence in external-local memory", async () => {
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        build: "node -e \"console.log('build evidence')\"",
      },
    }), "utf8");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Command Evidence"]);

    await runCli(["spec-test", "link", "repo", "--ac", "AC-001", "--command", "build", "--json"]);
    await runCli(["validate", "run", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const specTests = JSON.parse(await readFile(join(memoryRoot, "harness", "changes", "active", "command-evidence", "spec-tests.json"), "utf8"));
    expect(specTests.mappings[0]?.refs).toEqual([{ type: "command", commandName: "build" }]);
    const status = await getSpecTestStatus(managedProject());
    expect(status.acceptanceCriteria[0]).toMatchObject({ confidence: "validation-passed" });
  });

  it("evaluates spec-test file refs against a selected worktree", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"\"",
      },
    }), "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md", "package.json"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Worktree Spec Evidence"]);
    await runCli(["worktree", "create", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const metadataIds = (await readdir(join(memoryRoot, "worktrees", "metadata"))).filter((name) => name.endsWith(".json"));
    const worktreeId = metadataIds[0].replace(/\.json$/, "");
    const metadata = JSON.parse(await readFile(join(memoryRoot, "worktrees", "metadata", metadataIds[0]), "utf8"));
    await mkdir(join(metadata.checkoutPath, "test"), { recursive: true });
    await writeFile(join(metadata.checkoutPath, "test", "worktree.test.js"), "test\n", "utf8");

    await runCli(["spec-test", "link", "repo", "--ac", "AC-001", "--file", "test/worktree.test.js", "--command", "test", "--json"]);
    await runCli(["validate", "run", "repo", "--worktree", worktreeId, "--json"]);
    await runCli(["spec-test", "status", "repo", "--worktree", worktreeId, "--json"]);
    await runCli(["spec-test", "drift", "repo", "--worktree", worktreeId, "--json"]);

    const status = await getSpecTestStatus(managedProject(), { worktreeId });
    expect(status.selectedWorktreeId).toBe(worktreeId);
    expect(status.acceptanceCriteria[0]).toMatchObject({ evidenceFilesExist: true, confidence: "validation-passed" });
    const drift = await getSpecTestDriftReport(managedProject(), { worktreeId });
    expect(drift.selectedRootType).toBe("worktree");
    expect(drift.selectedWorktreeId).toBe(worktreeId);
    expect(drift.acceptanceCriteria[0]).toMatchObject({ status: "ok" });
    await expect(runCli(["change", "close", "repo"])).rejects.toThrow("Review status is pending");
  });

  it("proposes and accepts source-root existing spec-test evidence", async () => {
    await installFakeCodex("spec-test-proposal");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"console.log('existing evidence')\"",
      },
    }), "utf8");
    await mkdir(join(repoDir, "test"), { recursive: true });
    await writeFile(join(repoDir, "test", "pricing.test.js"), "test('normal customers pay subtotal', () => {});\n", "utf8");

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Existing Evidence"]);
    await runCli(["validate", "run", "repo", "--json"]);
    await runCli(["spec-test", "propose", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const proposalRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "spec-test-proposal.json")));
    expect(proposalRunId).toBeDefined();
    const proposal = JSON.parse(await readFile(join(memoryRoot, "runs", proposalRunId!, "spec-test-proposal.json"), "utf8"));
    expect(proposal).toMatchObject({ status: "proposed", changeId: "existing-evidence" });
    expect(proposal.evidence).toHaveLength(3);

    await runCli(["spec-test", "proposal", "list", "repo", "--json"]);
    await runCli(["spec-test", "proposal", "show", "repo", proposalRunId!, "--json"]);
    await expect(runCli(["spec-test", "proposal", "accept", "repo", proposalRunId!, "--ac", "AC-001", "--ref", "ev-002", "--json"])).rejects.toThrow("Cannot accept worktree-only evidence");
    await runCli(["spec-test", "proposal", "accept", "repo", proposalRunId!, "--ac", "AC-001", "--ref", "ev-001", "--json"]);

    let status = await getSpecTestStatus(managedProject());
    expect(status.acceptanceCriteria[0]).toMatchObject({ linkedEvidence: true, evidenceFilesExist: true, confidence: "validation-passed" });
    expect(status.mappings[0]?.refs).toEqual(expect.arrayContaining([
      { type: "file", path: "test/pricing.test.js" },
      { type: "testName", path: "test/pricing.test.js", name: "normal customers pay subtotal" },
      { type: "command", commandName: "test" },
    ]));

    await runCli(["spec-test", "proposal", "accept", "repo", proposalRunId!, "--all-existing", "--json"]);
    status = await getSpecTestStatus(managedProject());
    expect(status.mappings).toHaveLength(1);
    expect(status.mappings[0]?.refs).toHaveLength(3);
  });

  it("proposes and accepts spec and plan artifacts through human gates", async () => {
    await installFakeCodex("change-spec-proposal");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Spec Planner", "--body", "Raw request for pricing behavior."]);

    await runCli(["change", "spec", "propose", "repo", "--json"]);
    const memoryRoot = join(homeDir, "projects", "repo");
    const specRunId = await findRunWithArtifact(join(memoryRoot, "runs"), "spec-proposal.json");
    const specProposal = JSON.parse(await readFile(join(memoryRoot, "runs", specRunId, "spec-proposal.json"), "utf8"));
    expect(specProposal).toMatchObject({ status: "proposed", changeId: "spec-planner" });
    expect(specProposal.specMd).toContain("AC-001");

    await runCli(["change", "spec", "proposal", "list", "repo", "--json"]);
    await runCli(["change", "spec", "proposal", "show", "repo", specRunId, "--json"]);
    await runCli(["change", "spec", "accept", "repo", specRunId, "--json"]);
    expect(await readFile(join(memoryRoot, "harness", "changes", "active", "spec-planner", "spec.md"), "utf8")).toContain("AC-002");

    await installFakeCodex("change-plan-proposal");
    await runCli(["change", "plan", "propose", "repo", "--json"]);
    const planRunId = await findRunWithArtifact(join(memoryRoot, "runs"), "plan-proposal.json");
    await runCli(["change", "plan", "proposal", "list", "repo", "--json"]);
    await runCli(["change", "plan", "proposal", "show", "repo", planRunId, "--json"]);
    await runCli(["change", "plan", "accept", "repo", planRunId, "--json"]);

    const tasks = await readFile(join(memoryRoot, "harness", "changes", "active", "spec-planner", "tasks.md"), "utf8");
    expect(tasks).toContain("T-001");
    expect(tasks).toContain("Covers: AC-001");
    await runCli(["change", "status", "repo", "--json"]);
    const acMap = JSON.parse(await readFile(join(memoryRoot, "harness", "changes", "active", "spec-planner", "ac-map.json"), "utf8"));
    expect(acMap.blockingIssues).toEqual([]);
    expect(acMap.tasks).toHaveLength(2);
  });

  it("rejects blocked and stale spec proposal acceptance", async () => {
    await installFakeCodex("change-spec-blocked");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Blocked Spec", "--body", "Need unknown security behavior."]);
    await runCli(["change", "spec", "propose", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const blockedRunId = await findRunWithArtifact(join(memoryRoot, "runs"), "spec-proposal.json");
    await expect(runCli(["change", "spec", "accept", "repo", blockedRunId, "--json"])).rejects.toThrow("Cannot accept spec proposal with status blocked");

    await installFakeCodex("change-spec-proposal");
    await runCli(["change", "spec", "propose", "repo", "--json"]);
    const proposals = (await readdir(join(memoryRoot, "runs"))).filter((id) => existsSync(join(memoryRoot, "runs", id, "spec-proposal.json"))).sort();
    let proposedRunId = "";
    for (const proposalId of proposals) {
      const proposal = JSON.parse(await readFile(join(memoryRoot, "runs", proposalId, "spec-proposal.json"), "utf8"));
      if (proposal.status === "proposed") proposedRunId = proposalId;
    }
    expect(proposedRunId).not.toBe("");
    const specPath = join(memoryRoot, "harness", "changes", "active", "blocked-spec", "spec.md");
    await writeFile(specPath, "# Manual edit\n\n## Acceptance Criteria\n\n- AC-001: Manual AC\n", "utf8");
    await expect(runCli(["change", "spec", "accept", "repo", proposedRunId, "--json"])).rejects.toThrow("spec.md changed after proposal was generated");
  });

  it("generates test-only spec-test proposals and accepts them after apply", async () => {
    await installFakeCodex("spec-test-generate");
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node --test",
      },
    }), "utf8");
    await execFileAsync("git", ["-C", repoDir, "config", "user.name", "Test"]);
    await execFileAsync("git", ["-C", repoDir, "config", "user.email", "test@example.com"]);
    await execFileAsync("git", ["-C", repoDir, "add", "README.md", "package.json"]);
    await execFileAsync("git", ["-C", repoDir, "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await execFileAsync("git", ["-C", repoDir, "add", "AGENTS.md", ".agent-harness"]);
    await execFileAsync("git", ["-C", repoDir, "commit", "-m", "init aho marker"]);
    await runCli(["change", "new", "repo", "--title", "Generated Spec Test"]);
    await runCli(["spec-test", "generate", "repo", "--missing", "--prompt", "Add the minimal Node test for the missing AC.", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const generatorRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "implementation.md")));
    expect(generatorRunId).toBeDefined();
    const generatorRunDir = join(memoryRoot, "runs", generatorRunId!);
    const generatorRun = JSON.parse(await readFile(join(generatorRunDir, "run.json"), "utf8"));

    expect(generatorRun).toMatchObject({ runtime: "spec-test-generator", executionMode: "worktree", proposalOnly: true, status: "completed" });
    expect(generatorRun.command).toContain("workspace-write");
    expect(await readFile(join(generatorRunDir, "prompt.md"), "utf8")).toContain("Spec-Test Generator Agent Profile");
    expect(await readFile(join(generatorRunDir, "prompt.md"), "utf8")).toContain("Do not modify production code");
    expect(await readFile(join(generatorRunDir, "diff.patch"), "utf8")).toContain("test/generated.test.js");
    expect(await readFile(join(generatorRun.worktree.checkoutPath, "test", "generated.test.js"), "utf8")).toContain("generated AC evidence");
    expect(existsSync(join(repoDir, "test", "generated.test.js"))).toBe(false);

    const worktreeId = generatorRun.worktree.worktreeId;
    await runCli(["validate", "run", "repo", "--worktree", worktreeId, "--json"]);
    await installFakeCodex("audit-approved");
    await runCli(["audit", "run", "repo", "--worktree", worktreeId, "--json"]);
    const auditRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "audit.json")));
    expect(auditRunId).toBeDefined();
    await runCli(["audit", "accept", "repo", auditRunId!, "--json"]);
    await runCli(["worktree", "preview", "repo", worktreeId, "--json"]);
    await runCli(["worktree", "apply", "repo", worktreeId, "--commit", "--message", "add generated spec test", "--json"]);

    expect(await readFile(join(repoDir, "test", "generated.test.js"), "utf8")).toContain("generated AC evidence");
    await installFakeCodex("spec-test-proposal-generated");
    await runCli(["spec-test", "propose", "repo", "--json"]);
    const proposalRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "spec-test-proposal.json")));
    expect(proposalRunId).toBeDefined();
    await runCli(["spec-test", "proposal", "accept", "repo", proposalRunId!, "--all-existing", "--json"]);

    const status = await getSpecTestStatus(managedProject());
    expect(status.acceptanceCriteria[0]).toMatchObject({ linkedEvidence: true, evidenceFilesExist: true });
    expect(status.mappings[0]?.refs).toEqual(expect.arrayContaining([
      { type: "file", path: "test/generated.test.js" },
      { type: "testName", path: "test/generated.test.js", name: "generated AC evidence" },
      { type: "command", commandName: "test" },
    ]));
  });

  it("fails spec-test generation when Codex edits production code", async () => {
    await installFakeCodex("spec-test-generate-production");
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Bad Generated Test"]);
    await runCli(["spec-test", "generate", "repo", "--missing", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const generatorRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "implementation.md")));
    expect(generatorRunId).toBeDefined();
    const runDir = join(memoryRoot, "runs", generatorRunId!);
    const run = JSON.parse(await readFile(join(runDir, "run.json"), "utf8"));
    expect(run).toMatchObject({ runtime: "spec-test-generator", status: "failed", exitCode: 1 });
    expect(await readFile(join(runDir, "diff.patch"), "utf8")).toContain("src/pricing.js");
    expect(await readFile(join(runDir, "implementation.md"), "utf8")).toContain("non-test changes");
    expect(process.exitCode).toBe(1);
  });

  it("does not create a Codex worktree when no AC is missing linked evidence", async () => {
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"\"",
      },
    }), "utf8");
    await mkdir(join(repoDir, "test"), { recursive: true });
    await writeFile(join(repoDir, "test", "pricing.test.js"), "test\n", "utf8");

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "No Missing Evidence"]);
    await runCli(["spec-test", "link", "repo", "--ac", "AC-001", "--file", "test/pricing.test.js", "--json"]);
    await runCli(["spec-test", "generate", "repo", "--missing", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    expect(await readdir(join(memoryRoot, "runs"))).toEqual([]);
    const metadataRoot = join(memoryRoot, "worktrees", "metadata");
    expect(existsSync(metadataRoot) ? await readdir(metadataRoot) : []).toEqual([]);
  });

  it("records local command runs and exposes them through the CLI", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Run Artifacts"]);
    await runCli(["run", "start", "repo", "--", process.execPath, "-e", "console.log('cli run')"]);

    const runsDir = join(repoDir, ".agent-harness", "runs");
    const runIds = await readdir(runsDir);
    expect(runIds).toHaveLength(1);

    await runCli(["run", "list", "repo", "--json"]);
    await runCli(["run", "show", "repo", runIds[0], "--json"]);

    const run = JSON.parse(await readFile(join(runsDir, runIds[0], "run.json"), "utf8"));
    expect(run).toMatchObject({ status: "completed", exitCode: 0, runtime: "local-command" });
    expect(await readFile(join(runsDir, runIds[0], "stdout.log"), "utf8")).toContain("cli run");
  });

  it("sets CLI exitCode when a local command run fails", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Failed Run"]);

    await runCli(["run", "start", "repo", "--", process.execPath, "-e", "process.exit(2)"]);

    expect(process.exitCode).toBe(2);
  });

  it("records codex readonly runs with root-level approval support", async () => {
    await installFakeCodex("root");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Codex Proposal"]);

    await runCli(["run", "codex", "repo", "--prompt", "Propose a plan", "--model", "fake-model", "--profile", "default"]);

    const runsDir = join(repoDir, ".agent-harness", "runs");
    const runIds = await readdir(runsDir);
    expect(runIds).toHaveLength(1);
    const runDir = join(runsDir, runIds[0]);
    const run = JSON.parse(await readFile(join(runDir, "run.json"), "utf8"));

    expect(run).toMatchObject({ runtime: "codex-readonly", executionMode: "direct", proposalOnly: true, status: "completed", exitCode: 0 });
    expect(run.command.slice(0, 4)).toEqual(["codex", "--ask-for-approval", "never", "exec"]);
    expect(run.command).not.toContain("--full-auto");
    expect(run.command).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(await readFile(join(runDir, "prompt.md"), "utf8")).toContain("Do not edit files.");
    expect(await readFile(join(runDir, "codex-events.jsonl"), "utf8")).toContain("fake codex proposal");
    expect(await readFile(join(runDir, "last-message.md"), "utf8")).toContain("fake codex proposal");

    await runCli(["run", "list", "repo", "--json"]);
    await runCli(["run", "show", "repo", runIds[0], "--json"]);
  });

  it("supports external-local memory for change and run artifacts", async () => {
    await installFakeCodex("root");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);

    const marker = JSON.parse(await readFile(join(repoDir, ".agent-harness", "project.json"), "utf8"));
    const memoryRoot = join(homeDir, "projects", "repo");
    expect(marker).toMatchObject({ id: "repo", memoryMode: "external-local" });
    expect(existsSync(join(repoDir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(repoDir, ".agent-harness", ".gitignore"))).toBe(true);
    expect(existsSync(join(repoDir, "harness"))).toBe(false);
    expect(existsSync(join(repoDir, "docs"))).toBe(false);
    expect(existsSync(join(memoryRoot, "docs", "ECL.md"))).toBe(true);
    expect(existsSync(join(memoryRoot, "harness", "changes", "INDEX.json"))).toBe(true);
    expect(existsSync(join(memoryRoot, "scripts", "harness-change.ps1"))).toBe(true);

    await runCli(["memory", "status", "repo", "--json"]);
    await runCli(["harness", "audit", "repo", "--json"]);
    await runCli(["change", "new", "repo", "--title", "External Memory Change", "--body", "Raw request"]);

    const changeDir = join(memoryRoot, "harness", "changes", "active", "external-memory-change");
    expect(existsSync(join(changeDir, "change.json"))).toBe(true);
    await runCli(["change", "status", "repo", "--json"]);

    await runCli(["run", "start", "repo", "--", process.execPath, "-e", "console.log(process.cwd())"]);
    await runCli(["run", "codex", "repo", "--prompt", "Propose a plan"]);

    const runIds = await readdir(join(memoryRoot, "runs"));
    expect(runIds).toHaveLength(2);
    const firstRun = JSON.parse(await readFile(join(memoryRoot, "runs", runIds[0], "run.json"), "utf8"));
    expect(firstRun.artifacts.base).toBe("memory-root");
    expect(firstRun.artifacts.directory).toMatch(/^runs\//);
    expect(existsSync(join(repoDir, ".agent-harness", "runs"))).toBe(false);

    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");
    await runCli(["change", "close", "repo"]);
    const index = JSON.parse(await readFile(join(memoryRoot, "harness", "changes", "INDEX.json"), "utf8"));
    expect(index.active).toHaveLength(0);
    expect(index.archive[0].name).toMatch(/^\d{8}-external-memory-change/);
  });

  it("falls back to JSONL final message when output-last-message is unsupported", async () => {
    await installFakeCodex("exec-no-output");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Codex Jsonl Fallback"]);

    await runCli(["run", "codex", "repo", "--prompt", "Propose a plan"]);

    const runIds = await readdir(join(repoDir, ".agent-harness", "runs"));
    const runDir = join(repoDir, ".agent-harness", "runs", runIds[0]);
    const run = JSON.parse(await readFile(join(runDir, "run.json"), "utf8"));

    expect(run.command.slice(0, 4)).toEqual(["codex", "exec", "--ask-for-approval", "never"]);
    expect(run.command).not.toContain("--output-last-message");
    expect(await readFile(join(runDir, "last-message.md"), "utf8")).toContain("fake codex proposal");
  });

  it("records failed codex runs when safe capabilities are unsupported", async () => {
    await installFakeCodex("unsupported");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Codex Unsupported"]);

    await runCli(["run", "codex", "repo", "--prompt", "Propose a plan"]);

    const runIds = await readdir(join(repoDir, ".agent-harness", "runs"));
    const runDir = join(repoDir, ".agent-harness", "runs", runIds[0]);
    const run = JSON.parse(await readFile(join(runDir, "run.json"), "utf8"));

    expect(run).toMatchObject({ runtime: "codex-readonly", status: "failed", exitCode: 1 });
    expect(await readFile(join(runDir, "stderr.log"), "utf8")).toContain("--sandbox");
    expect(await readFile(join(runDir, "last-message.md"), "utf8")).toContain("could not safely start Codex");
    expect(process.exitCode).toBe(1);
  });

  it("creates AHO-owned worktrees and runs local commands inside them", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Worktree Smoke", "--body", "Raw request"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    await runCli(["worktree", "create", "repo", "--json"]);

    const metadataIds = (await readdir(join(memoryRoot, "worktrees", "metadata"))).filter((name) => name.endsWith(".json"));
    expect(metadataIds).toHaveLength(1);
    const worktreeId = metadataIds[0].replace(/\.json$/, "");
    const metadata = JSON.parse(await readFile(join(memoryRoot, "worktrees", "metadata", metadataIds[0]), "utf8"));
    expect(metadata.checkoutPath).toContain(join(homeDir, "worktrees", "repo", "checkouts"));
    expect(existsSync(metadata.checkoutPath)).toBe(true);
    expect(existsSync(join(repoDir, ".agent-harness", "worktrees", "checkouts"))).toBe(false);

    await runCli(["worktree", "list", "repo", "--json"]);
    await runCli(["worktree", "show", "repo", worktreeId, "--json"]);
    await runCli(["run", "start", "repo", "--worktree", "--", process.execPath, "-e", "console.log(process.cwd())"]);

    const runIds = await readdir(join(memoryRoot, "runs"));
    expect(runIds).toHaveLength(1);
    const run = JSON.parse(await readFile(join(memoryRoot, "runs", runIds[0], "run.json"), "utf8"));
    expect(run).toMatchObject({ runtime: "local-command", executionMode: "worktree", status: "completed" });
    expect(run.worktree.checkoutPath).toContain(join(homeDir, "worktrees", "repo", "checkouts"));
    expect(await readFile(join(memoryRoot, "runs", runIds[0], "stdout.log"), "utf8")).toContain(run.worktree.checkoutPath);

    await writeFile(join(run.worktree.checkoutPath, "changed.txt"), "dirty\n", "utf8");
    await writeFile(join(memoryRoot, "harness", "changes", "active", "worktree-smoke", "reviews", "review.md"), "Status: approved\n", "utf8");
    await expect(runCli(["change", "close", "repo"])).rejects.toThrow("Dirty worktree blocks close");
    await expect(runCli(["worktree", "remove", "repo", run.worktree.worktreeId])).rejects.toThrow("dirty worktree");
    await runCli(["worktree", "remove", "repo", run.worktree.worktreeId, "--force"]);
  });

  it("records external-local worktree validation without polluting the source repo", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"\"",
        lint: "node -e \"\"",
        test: "node -e \"require('fs').writeFileSync('validation-output.txt','worktree')\"",
        build: "node -e \"\"",
      },
    }), "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md", "package.json"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Validate Worktree", "--body", "Raw request"]);
    await runCli(["validate", "run", "repo", "--worktree", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const runIds = await readdir(join(memoryRoot, "runs"));
    expect(runIds).toHaveLength(1);
    const run = JSON.parse(await readFile(join(memoryRoot, "runs", runIds[0], "run.json"), "utf8"));
    const validation = JSON.parse(await readFile(join(memoryRoot, "runs", runIds[0], "validation.json"), "utf8"));

    expect(run).toMatchObject({ runtime: "validator", executionMode: "worktree", status: "completed" });
    expect(validation).toMatchObject({ status: "passed", changeId: "validate-worktree", executionMode: "worktree" });
    expect(validation.commands.map((command: { name: string }) => command.name)).toEqual(["typecheck", "lint", "test", "build"]);
    expect(existsSync(join(run.worktree.checkoutPath, "validation-output.txt"))).toBe(true);
    expect(existsSync(join(repoDir, "validation-output.txt"))).toBe(false);

    await runCli(["validate", "status", "repo", "--json"]);
    await runCli(["validate", "list", "repo", "--json"]);
    await runCli(["validate", "show", "repo", runIds[0], "--json"]);
  });

  it("falls back to existing package scripts for generated external-local validation config", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"console.log('only test')\"",
      },
    }), "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md", "package.json"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Validate Package Fallback"]);
    await runCli(["validate", "run", "repo", "--worktree", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const runIds = await readdir(join(memoryRoot, "runs"));
    const validation = JSON.parse(await readFile(join(memoryRoot, "runs", runIds[0], "validation.json"), "utf8"));

    expect(validation).toMatchObject({ status: "passed", changeId: "validate-package-fallback" });
    expect(validation.commands.map((command: { name: string }) => command.name)).toEqual(["test"]);
  });

  it("uses validation results in the change close gate", async () => {
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"\"",
        lint: "node -e \"\"",
        test: "node -e \"process.exit(3)\"",
        build: "node -e \"\"",
      },
    }), "utf8");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Validation Gate"]);
    const changeDir = join(repoDir, "harness", "changes", "active", "validation-gate");
    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");

    await runCli(["validate", "run", "repo"]);
    expect(process.exitCode).toBe(1);
    await expect(runCli(["change", "close", "repo"])).rejects.toThrow("Latest validation failed");

    process.exitCode = undefined;
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"\"",
        lint: "node -e \"\"",
        test: "node -e \"\"",
        build: "node -e \"\"",
      },
    }), "utf8");
    await runCli(["validate", "run", "repo"]);
    await runCli(["change", "close", "repo"]);
  });

  it("records approved worktree audits and accepts them into review", async () => {
    await installFakeCodex("audit-approved");
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Audit Worktree"]);
    await runCli(["worktree", "create", "repo"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const metadataIds = (await readdir(join(memoryRoot, "worktrees", "metadata"))).filter((name) => name.endsWith(".json"));
    const worktreeId = metadataIds[0].replace(/\.json$/, "");
    const metadata = JSON.parse(await readFile(join(memoryRoot, "worktrees", "metadata", metadataIds[0]), "utf8"));
    await writeFile(join(metadata.checkoutPath, "README.md"), "hello\naudit change\n", "utf8");

    await runCli(["audit", "run", "repo", "--worktree", worktreeId, "--prompt", "Focus on AC coverage", "--json"]);
    const runIds = await readdir(join(memoryRoot, "runs"));
    expect(runIds).toHaveLength(1);
    const runDir = join(memoryRoot, "runs", runIds[0]);
    const run = JSON.parse(await readFile(join(runDir, "run.json"), "utf8"));
    const audit = JSON.parse(await readFile(join(runDir, "audit.json"), "utf8"));

    expect(run).toMatchObject({ runtime: "auditor", proposalOnly: true, status: "completed" });
    expect(run.command).toEqual(expect.arrayContaining(["--add-dir", memoryRoot]));
    expect(audit).toMatchObject({ status: "approved", changeId: "audit-worktree", worktreeId });
    expect(await readFile(join(runDir, "diff.patch"), "utf8")).toContain("audit change");
    expect(await readFile(join(runDir, "prompt.md"), "utf8")).toContain("Focus on AC coverage");
    expect(await readFile(join(runDir, "prompt.md"), "utf8")).toContain("Authoritative Audit Packet");
    expect(existsSync(join(repoDir, "runs"))).toBe(false);

    await runCli(["audit", "status", "repo", "--json"]);
    await runCli(["audit", "list", "repo", "--json"]);
    await runCli(["audit", "show", "repo", runIds[0], "--json"]);
    await runCli(["audit", "accept", "repo", runIds[0]]);

    const review = await readFile(join(memoryRoot, "harness", "changes", "active", "audit-worktree", "reviews", "review.md"), "utf8");
    expect(review).toContain("Status: approved");
    expect(review).toContain(`Audit ID: ${runIds[0]}`);
  });

  it("records Codex coder worktree runs and validates the same worktree", async () => {
    await installFakeCodex("code-write");
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"\"",
        lint: "node -e \"\"",
        test: "node -e \"\"",
        build: "node -e \"\"",
      },
    }), "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md", "package.json"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Coder Worktree"]);
    await runCli(["code", "run", "repo", "--task", "T-001", "--prompt", "Append a Usage section", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const runIds = await readdir(join(memoryRoot, "runs"));
    expect(runIds).toHaveLength(1);
    const runDir = join(memoryRoot, "runs", runIds[0]);
    const run = JSON.parse(await readFile(join(runDir, "run.json"), "utf8"));

    expect(run).toMatchObject({ runtime: "coder-codex", executionMode: "worktree", proposalOnly: true, status: "completed" });
    expect(run.command).toContain("workspace-write");
    expect(run.command).not.toContain("--full-auto");
    expect(run.command).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(await readFile(join(runDir, "prompt.md"), "utf8")).toContain("Selected Task Scope");
    expect(await readFile(join(runDir, "diff.patch"), "utf8")).toContain("Usage: generated by fake coder");
    expect(await readFile(join(runDir, "implementation.md"), "utf8")).toContain("fake codex proposal from output file");
    expect(await readFile(join(run.worktree.checkoutPath, "README.md"), "utf8")).toContain("Usage: generated by fake coder");
    expect(await readFile(join(repoDir, "README.md"), "utf8")).not.toContain("Usage: generated by fake coder");

    await runCli(["code", "status", "repo", "--json"]);
    await runCli(["code", "list", "repo", "--json"]);
    await runCli(["code", "show", "repo", runIds[0], "--json"]);

    await runCli(["validate", "run", "repo", "--worktree", run.worktree.worktreeId, "--json"]);
    const updatedRunIds = await readdir(join(memoryRoot, "runs"));
    expect(updatedRunIds).toHaveLength(2);
    const validationRunId = updatedRunIds.find((id) => id !== runIds[0]);
    expect(validationRunId).toBeDefined();
    const validation = JSON.parse(await readFile(join(memoryRoot, "runs", validationRunId!, "validation.json"), "utf8"));
    expect(validation).toMatchObject({ status: "passed", worktreeId: run.worktree.worktreeId });

    await installFakeCodex("audit-approved");
    await runCli(["audit", "run", "repo", "--worktree", run.worktree.worktreeId, "--json"]);
    await expect(runCli(["change", "close", "repo"])).rejects.toThrow("Dirty worktree blocks close");
  });

  it("applies an accepted validated coder worktree back to the source repo", async () => {
    await installFakeCodex("code-write");
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"\"",
        lint: "node -e \"\"",
        test: "node -e \"\"",
        build: "node -e \"\"",
      },
    }), "utf8");
    await execFileAsync("git", ["-C", repoDir, "config", "user.name", "Test"]);
    await execFileAsync("git", ["-C", repoDir, "config", "user.email", "test@example.com"]);
    await execFileAsync("git", ["-C", repoDir, "add", "README.md", "package.json"]);
    await execFileAsync("git", ["-C", repoDir, "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await execFileAsync("git", ["-C", repoDir, "add", "AGENTS.md", ".agent-harness"]);
    await execFileAsync("git", ["-C", repoDir, "commit", "-m", "init aho marker"]);
    await runCli(["change", "new", "repo", "--title", "Apply Worktree"]);
    await runCli(["code", "run", "repo", "--prompt", "Append a Usage section", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const coderRunId = (await readdir(join(memoryRoot, "runs")))[0];
    const coderRun = JSON.parse(await readFile(join(memoryRoot, "runs", coderRunId, "run.json"), "utf8"));
    const worktreeId = coderRun.worktree.worktreeId;

    await runCli(["validate", "run", "repo", "--worktree", worktreeId, "--json"]);
    await installFakeCodex("audit-approved");
    await runCli(["audit", "run", "repo", "--worktree", worktreeId, "--json"]);
    const auditRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "audit.json")));
    expect(auditRunId).toBeDefined();
    await runCli(["audit", "accept", "repo", auditRunId!]);
    await runCli(["worktree", "preview", "repo", worktreeId, "--json"]);
    await runCli(["worktree", "apply", "repo", worktreeId, "--commit", "--message", "apply coder proposal", "--json"]);

    expect(await readFile(join(repoDir, "README.md"), "utf8")).toContain("Usage: generated by fake coder");
    const log = await execFileAsync("git", ["-C", repoDir, "log", "-1", "--pretty=%s"]);
    expect(log.stdout.trim()).toBe("apply coder proposal");
    const metadata = JSON.parse(await readFile(join(memoryRoot, "worktrees", "metadata", `${worktreeId}.json`), "utf8"));
    expect(metadata.status).toBe("applied");
    expect(metadata.worktreeDiffHash).toBeTruthy();

    await runCli(["change", "close", "repo"]);
  });

  it("discards an unapplied worktree proposal without changing the source repo", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Discard Worktree"]);
    await runCli(["worktree", "create", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const metadataIds = (await readdir(join(memoryRoot, "worktrees", "metadata"))).filter((name) => name.endsWith(".json"));
    const worktreeId = metadataIds[0].replace(/\.json$/, "");
    const metadata = JSON.parse(await readFile(join(memoryRoot, "worktrees", "metadata", metadataIds[0]), "utf8"));
    await writeFile(join(metadata.checkoutPath, "README.md"), "discarded change\n", "utf8");

    await runCli(["worktree", "discard", "repo", worktreeId, "--json"]);

    expect(await readFile(join(repoDir, "README.md"), "utf8")).toBe("hello\n");
    expect(existsSync(metadata.checkoutPath)).toBe(false);
    expect(existsSync(join(memoryRoot, "worktrees", "metadata", `${worktreeId}.json`))).toBe(false);
    const discardRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "discard.json")));
    expect(discardRunId).toBeDefined();
  });

  it("blocks apply when the worktree diff changes after validation and audit", async () => {
    await installFakeCodex("code-write");
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"\"",
        lint: "node -e \"\"",
        test: "node -e \"\"",
        build: "node -e \"\"",
      },
    }), "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md", "package.json"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await execFileAsync("git", ["-C", repoDir, "add", "AGENTS.md", ".agent-harness"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init aho marker"]);
    await runCli(["change", "new", "repo", "--title", "Stale Apply"]);
    await runCli(["code", "run", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const coderRunId = (await readdir(join(memoryRoot, "runs")))[0];
    const coderRun = JSON.parse(await readFile(join(memoryRoot, "runs", coderRunId, "run.json"), "utf8"));
    const worktreeId = coderRun.worktree.worktreeId;
    await runCli(["validate", "run", "repo", "--worktree", worktreeId, "--json"]);
    await installFakeCodex("audit-approved");
    await runCli(["audit", "run", "repo", "--worktree", worktreeId, "--json"]);
    const auditRunId = (await readdir(join(memoryRoot, "runs"))).find((id) => existsSync(join(memoryRoot, "runs", id, "audit.json")));
    await runCli(["audit", "accept", "repo", auditRunId!]);

    await writeFile(join(coderRun.worktree.checkoutPath, "README.md"), "hello\nstale mutation\n", "utf8");
    await expect(runCli(["worktree", "apply", "repo", worktreeId])).rejects.toThrow("No passed validation found for the current worktree diff hash");
  });

  it("records coder warnings for no-diff runs", async () => {
    await installFakeCodex("code-no-diff");
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "No Diff Code"]);
    await runCli(["code", "run", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const runIds = await readdir(join(memoryRoot, "runs"));
    const implementation = await readFile(join(memoryRoot, "runs", runIds[0], "implementation.md"), "utf8");
    expect(implementation).toContain("without producing a worktree diff");
  });

  it("fails coder runs when Codex pollutes the source repo", async () => {
    await installFakeCodex("code-pollute");
    process.env.AHO_FAKE_CODEX_POLLUTE_PATH = repoDir;
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Source Pollution"]);
    await runCli(["code", "run", "repo", "--json"]);

    const memoryRoot = join(homeDir, "projects", "repo");
    const runIds = await readdir(join(memoryRoot, "runs"));
    const run = JSON.parse(await readFile(join(memoryRoot, "runs", runIds[0], "run.json"), "utf8"));
    expect(run).toMatchObject({ runtime: "coder-codex", status: "failed", exitCode: 1 });
    expect(await readFile(join(memoryRoot, "runs", runIds[0], "implementation.md"), "utf8")).toContain("Source project git status changed");
    expect(process.exitCode).toBe(1);
  });

  it("uses blocked and failed audit results in the change close gate", async () => {
    await installFakeCodex("audit-blocked");
    await writeFile(join(repoDir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"\"",
        lint: "node -e \"\"",
        test: "node -e \"\"",
        build: "node -e \"\"",
      },
    }), "utf8");
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Audit Gate"]);
    const changeDir = join(repoDir, "harness", "changes", "active", "audit-gate");
    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");
    await runCli(["validate", "run", "repo"]);

    await runCli(["audit", "run", "repo"]);
    await expect(runCli(["change", "close", "repo"])).rejects.toThrow("Latest audit blocked close");
    const blockedAuditId = await findRunWithArtifact(join(repoDir, ".agent-harness", "runs"), "audit.json");
    await expect(runCli(["audit", "accept", "repo", blockedAuditId])).rejects.toThrow("Cannot accept audit with status blocked");

    await installFakeCodex("audit-unparseable");
    await runCli(["audit", "run", "repo"]);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await runCli(["change", "close", "repo"]);
  });

  it("blocks worktree creation for repositories without commits", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "No Commit Worktree"]);

    await expect(runCli(["worktree", "create", "repo"])).rejects.toThrow("has no commits");
  });

  it("blocks default worktree creation from detached HEAD", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);
    await execFileAsync("git", ["-C", repoDir, "checkout", "--detach", "HEAD"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);
    await runCli(["change", "new", "repo", "--title", "Detached Worktree"]);

    await expect(runCli(["worktree", "create", "repo"])).rejects.toThrow("detached HEAD");
  });
});

type FakeCodexMode =
  | "root"
  | "exec-no-output"
  | "unsupported"
  | "audit-approved"
  | "audit-blocked"
  | "audit-unparseable"
  | "code-write"
  | "code-no-diff"
  | "code-fail"
  | "code-pollute"
  | "spec-test-proposal"
  | "spec-test-proposal-generated"
  | "spec-test-generate"
  | "spec-test-generate-production"
  | "change-spec-proposal"
  | "change-spec-blocked"
  | "change-plan-proposal"
  | "chat-session";

async function installFakeCodex(mode: FakeCodexMode): Promise<void> {
  const binDir = join(tempDir, "bin");
  await mkdir(binDir, { recursive: true });
  const scriptPath = join(binDir, "fake-codex.cjs");
  const binPath = process.platform === "win32" ? join(binDir, "codex.cmd") : join(binDir, "codex");
  await writeFile(scriptPath, buildFakeCodexScript(mode), "utf8");

  if (process.platform === "win32") {
    await writeFile(binPath, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`, "utf8");
  } else {
    await writeFile(binPath, `#!/bin/sh\n"${process.execPath}" "${scriptPath}" "$@"\n`, "utf8");
    await chmod(binPath, 0o755);
  }

  process.env[originalPathKey] = `${binDir}${delimiter}${originalPath ?? ""}`;
}

async function findRunWithArtifact(runsRoot: string, artifactName: string): Promise<string> {
  for (const id of await readdir(runsRoot)) {
    if (existsSync(join(runsRoot, id, artifactName))) return id;
  }
  throw new Error(`No run with ${artifactName}`);
}

function buildFakeCodexScript(mode: FakeCodexMode): string {
  return `
const fs = require("node:fs");
const args = process.argv.slice(2);
const mode = ${JSON.stringify(mode)};
if (args.includes("--version")) {
  console.log("codex-cli fake");
  process.exit(0);
}
if (args.length === 1 && args[0] === "--help") {
  console.log(mode === "root" || mode.startsWith("audit-") || mode.startsWith("spec-test-") || mode.startsWith("change-") || mode.startsWith("chat-") ? "Usage: codex [OPTIONS]\\n--ask-for-approval <APPROVAL_POLICY>" : "Usage: codex [OPTIONS]");
  process.exit(0);
}
if (args[0] === "exec" && args.includes("--help")) {
  const approval = mode === "exec-no-output" ? "\\n--ask-for-approval <APPROVAL_POLICY>" : "";
    const output = mode === "root" || mode.startsWith("audit-") || mode.startsWith("code-") || mode.startsWith("spec-test-") || mode.startsWith("change-") || mode.startsWith("chat-") ? "\\n--output-last-message <FILE>" : "";
    const addDir = mode.startsWith("audit-") || mode.startsWith("spec-test-") || mode.startsWith("change-") || mode.startsWith("chat-") ? "\\n--add-dir <DIR>" : "";
    if (mode === "unsupported") {
      console.log("Usage: codex exec [OPTIONS]\\n--json");
    } else {
    console.log("Usage: codex exec [OPTIONS]\\n--json\\n--color <COLOR>\\n--sandbox <SANDBOX_MODE>\\n--cd <DIR>" + addDir + output + approval);
  }
  process.exit(0);
}
function finalMessage() {
  if (mode === "audit-approved") {
    return "Status: approved\\n\\nFinding: Looks aligned\\n- Severity: note\\n- Area: implementation\\n- Evidence: diff and validation reviewed\\n- Recommendation: accept if human agrees";
  }
  if (mode === "audit-blocked") {
    return "Status: blocked\\n\\nFinding: Missing acceptance coverage\\n- Severity: blocking\\n- Area: spec\\n- Evidence: AC-001 not addressed in diff\\n- Recommendation: update implementation before close";
  }
  if (mode === "audit-unparseable") {
    return "This is not a parseable audit response";
  }
  if (mode === "spec-test-proposal") {
    return "Status: proposed\\n\\n\`\`\`json\\n" + JSON.stringify({
      status: "proposed",
      evidence: [
        {
          refId: "ev-001",
          acId: "AC-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [
            { type: "file", path: "test/pricing.test.js" },
            { type: "testName", path: "test/pricing.test.js", name: "normal customers pay subtotal" },
            { type: "command", commandName: "test" }
          ],
          rationale: "Existing source-root test exercises the baseline behavior."
        },
        {
          refId: "ev-002",
          acId: "AC-001",
          source: "worktree-only",
          kind: "existingEvidence",
          refs: [{ type: "file", path: "test/worktree-only.test.js" }],
          rationale: "This is worktree-only and cannot be accepted in Phase 4B."
        },
        {
          refId: "ev-003",
          acId: "AC-001",
          source: "suggested",
          kind: "suggestedNewTests",
          refs: [],
          rationale: "A future test could improve evidence."
        }
      ],
      warnings: []
    }, null, 2) + "\\n\`\`\`";
  }
  if (mode === "spec-test-proposal-generated") {
    return "Status: proposed\\n\\n\`\`\`json\\n" + JSON.stringify({
      status: "proposed",
      evidence: [
        {
          refId: "ev-001",
          acId: "AC-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [
            { type: "file", path: "test/generated.test.js" },
            { type: "testName", path: "test/generated.test.js", name: "generated AC evidence" },
            { type: "command", commandName: "test" }
          ],
          rationale: "Generated source-root test is now applied and can be linked as evidence."
        }
      ],
      warnings: []
    }, null, 2) + "\\n\`\`\`";
  }
  if (mode === "change-spec-proposal") {
    return "Status: proposed\\n\\n\`\`\`json\\n" + JSON.stringify({
      status: "proposed",
      specMd: "# Spec: Pricing behavior\\n\\n## Problem Statement\\n\\nThe raw request needs explicit acceptance criteria.\\n\\n## Goals\\n\\n- Preserve current pricing behavior.\\n- Add member discount behavior.\\n\\n## Non-Goals\\n\\n- No UI changes.\\n\\n## Constraints\\n\\n- Keep implementation minimal.\\n\\n## Assumptions\\n\\n- Existing pricing entrypoint remains stable.\\n\\n## Acceptance Criteria\\n\\n- AC-001: Normal customers keep current subtotal behavior.\\n- AC-002: Member customers with subtotal >= 100 receive a 10% discount.\\n",
      openQuestions: [],
      assumptions: ["Existing pricing API remains the entrypoint."],
      warnings: []
    }, null, 2) + "\\n\`\`\`";
  }
  if (mode === "change-spec-blocked") {
    return "Status: blocked\\n\\n\`\`\`json\\n" + JSON.stringify({
      status: "blocked",
      specMd: "",
      openQuestions: ["Which security boundary should this change enforce?"],
      assumptions: [],
      warnings: ["High-impact requirement is unclear."]
    }, null, 2) + "\\n\`\`\`";
  }
  if (mode === "change-plan-proposal") {
    return "Status: proposed\\n\\n\`\`\`json\\n" + JSON.stringify({
      status: "proposed",
      planMd: "# Plan\\n\\n## Approach\\n\\nUpdate the existing pricing path minimally and add focused tests.\\n\\n## Risks\\n\\n- Rounding must remain stable.\\n",
      tasksMd: "# Tasks\\n\\n- [ ] T-001: Preserve normal customer subtotal behavior\\n  - Covers: AC-001\\n- [ ] T-002: Add member discount behavior and rounding checks\\n  - Covers: AC-002\\n",
      openQuestions: [],
      assumptions: ["Tests can use the existing Node test setup."],
      warnings: []
    }, null, 2) + "\\n\`\`\`";
  }
  return "fake codex proposal from output file";
}
function cwdFromArgs() {
  const index = args.indexOf("--cd");
  return index >= 0 ? args[index + 1] : process.cwd();
}
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex >= 0) {
  fs.writeFileSync(args[outputIndex + 1], finalMessage(), "utf8");
}
if (process.env.AHO_FAKE_CODEX_ARGS_PATH && mode.startsWith("chat-")) {
  fs.appendFileSync(process.env.AHO_FAKE_CODEX_ARGS_PATH, JSON.stringify(args) + "\\n", "utf8");
}
process.stdin.resume();
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  if (mode === "code-fail") {
    console.error("fake codex coder failed");
    process.exit(7);
  }
  if (mode === "code-write" || mode === "code-pollute") {
    fs.appendFileSync(require("node:path").join(cwdFromArgs(), "README.md"), "\\nUsage: generated by fake coder\\n", "utf8");
  }
  if (mode === "code-pollute" && process.env.AHO_FAKE_CODEX_POLLUTE_PATH) {
    fs.writeFileSync(require("node:path").join(process.env.AHO_FAKE_CODEX_POLLUTE_PATH, "polluted.txt"), "source pollution", "utf8");
  }
  if (mode === "spec-test-generate") {
    const path = require("node:path");
    const testDir = path.join(cwdFromArgs(), "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "generated.test.js"), "const test = require('node:test');\\nconst assert = require('node:assert/strict');\\n\\ntest('generated AC evidence', () => {\\n  assert.equal(1, 1);\\n});\\n", "utf8");
  }
  if (mode === "spec-test-generate-production") {
    const path = require("node:path");
    const srcDir = path.join(cwdFromArgs(), "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "pricing.js"), "export const changed = true;\\n", "utf8");
  }
  if (mode === "chat-session") {
    console.log(JSON.stringify({ type: "session.started", session_id: "sess-chat-123" }));
  }
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: mode === "audit-unparseable" ? finalMessage() : "fake codex proposal from jsonl" } }));
  process.exit(0);
});
`;
}
