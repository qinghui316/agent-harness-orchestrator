import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/program.js";

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

    await runCli(["change", "status", "repo", "--json"]);
    await expect(runCli(["change", "close", "repo"])).rejects.toThrow("Review status is pending");

    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");
    await runCli(["change", "close", "repo"]);

    const index = JSON.parse(await readFile(join(repoDir, "harness", "changes", "INDEX.json"), "utf8"));
    expect(index.active).toHaveLength(0);
    expect(index.archive[0].name).toMatch(/^\d{8}-add-sample-workflow/);
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
    expect(await readFile(join(runDir, "stderr.log"), "utf8")).toContain("--ask-for-approval");
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

type FakeCodexMode = "root" | "exec-no-output" | "unsupported";

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
  console.log(mode === "root" ? "Usage: codex [OPTIONS]\\n--ask-for-approval <APPROVAL_POLICY>" : "Usage: codex [OPTIONS]");
  process.exit(0);
}
if (args[0] === "exec" && args.includes("--help")) {
  const approval = mode === "exec-no-output" ? "\\n--ask-for-approval <APPROVAL_POLICY>" : "";
  const output = mode === "root" ? "\\n--output-last-message <FILE>" : "";
  if (mode === "unsupported") {
    console.log("Usage: codex exec [OPTIONS]\\n--json");
  } else {
    console.log("Usage: codex exec [OPTIONS]\\n--json\\n--color <COLOR>\\n--sandbox <SANDBOX_MODE>\\n--cd <DIR>" + output + approval);
  }
  process.exit(0);
}
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex >= 0) {
  fs.writeFileSync(args[outputIndex + 1], "fake codex proposal from output file", "utf8");
}
process.stdin.resume();
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "fake codex proposal from jsonl" } }));
  process.exit(0);
});
`;
}
