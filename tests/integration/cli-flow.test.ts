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
    expect(marker).toMatchObject({ id: "repo", managedBy: "agent-harness-orchestrator" });
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
