import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/program.js";

const execFileAsync = promisify(execFile);

let tempDir: string;
let homeDir: string;
let repoDir: string;

async function runCli(args: string[]): Promise<void> {
  const program = createProgram();
  program.exitOverride();
  await program.parseAsync(args, { from: "user" });
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-cli-"));
  homeDir = join(tempDir, "home");
  repoDir = join(tempDir, "repo");
  process.env.AHO_HOME = homeDir;
  await execFileAsync("git", ["init", repoDir]);
});

afterEach(async () => {
  delete process.env.AHO_HOME;
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
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo"]);
    await runCli(["change", "new", "repo", "--title", "Failed Run"]);

    await runCli(["run", "start", "repo", "--", process.execPath, "-e", "process.exit(2)"]);

    expect(process.exitCode).toBe(2);
    process.exitCode = originalExitCode;
  });
});
