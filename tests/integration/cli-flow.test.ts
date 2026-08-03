import { execFile } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/program.js";
import { writeChangeIndex } from "../../src/ecl/index.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { defaultProviderRegistry } from "../../src/provider-runtime/default-registry.js";
import {
  ensureProjectHarnessOnboardingWorkspace,
  prepareProjectHarnessOnboarding,
  publishProjectHarnessOnboarding,
} from "../../src/project-harness/onboarding.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { getSpecTestStatus } from "../../src/spec-test/manager.js";
import { getSpecTestDriftReport } from "../../src/spec-test/drift.js";
import { getProjectHarnessSkillScaffoldRoot } from "../../src/template-source/paths.js";
import { getWorkbenchSnapshot, getWorkbenchStream, listWorkbenchApprovals } from "../../src/workbench/projections/read-model/implementation.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createFakeCodexRuntime } from "../helpers/fake-codex-runtime.js";

const execFileAsync = promisify(execFile);

let tempDir: string;
let homeDir: string;
let repoDir: string;
let originalPath: string | undefined;
let originalPathKey: string;
let originalExitCode: string | number | undefined;
let originalCodexHome: string | undefined;
let originalCodexBin: string | undefined;

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

async function seedExternalHarnessAfterAgentOnboarding(): Promise<void> {
  await runCli(["harness", "init", "repo", "--memory", "external-local"]);
  const templateRoot = join(process.cwd(), "templates", "core-harness");
  const memoryRoot = join(homeDir, "projects", "repo");
  await cp(join(templateRoot, "AGENTS.md"), join(repoDir, "AGENTS.md"));
  for (const name of ["docs", "harness", "scripts"]) {
    await cp(join(templateRoot, name), join(memoryRoot, name), { recursive: true });
  }
  await writeChangeIndex(await resolveProjectMemory(managedProject()));
}

async function publishTestProjectHarness(): Promise<void> {
  const projectId = "repo";
  const sidecarRoot = resolveProjectRuntimePaths(projectId, homeDir).sidecarRoot;
  const workspace = await ensureProjectHarnessOnboardingWorkspace(projectId, repoDir, sidecarRoot);
  await writeTestHarnessBundle(workspace.bundleRoot, projectId);
  const runtimeEntry = join(tempDir, "project-harness-runtime.mjs");
  await writeFile(runtimeEntry, "export async function runProjectHarnessDailyCommand() { return {}; }\n", "utf8");
  const prepared = await prepareProjectHarnessOnboarding({
    projectId,
    projectRoot: repoDir,
    sidecarRoot,
    authorId: "cli-main-attempt",
    transactionId: "cli-native-skill-onboarding",
    scaffoldRoot: getProjectHarnessSkillScaffoldRoot(),
    compiledRuntimeEntry: runtimeEntry,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  await writeTestJson(workspace.reviewPath, {
    schema_version: "1.0",
    kind: "full-bundle-review",
    candidate_fingerprint: prepared.candidate_fingerprint,
    source_snapshot_digest: prepared.source_snapshot_digest,
    author_id: "cli-main-attempt",
    reviewer_id: "cli-auditor-attempt",
    decision: "approve",
    findings: [],
    reviewed_at: new Date().toISOString(),
  });
  await publishProjectHarnessOnboarding({
    projectId,
    projectRoot: repoDir,
    sidecarRoot,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    reviewerId: "cli-auditor-attempt",
  });
}

async function writeTestHarnessBundle(bundleRoot: string, projectId: string): Promise<void> {
  const artifacts = join(bundleRoot, "artifacts");
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, "overview.md"), [
    "---",
    "ecl:",
    "  id: overview",
    "  layer: L1",
    "  kind: current",
    "  status: implemented",
    "  owner: project-profile",
    "  modules: []",
    "  evidence:",
    "    - \"user:CLI native Skill fixture\"",
    "---",
    "",
    "# CLI Native Skill Fixture",
    "",
  ].join("\n"), "utf8");
  await writeTestJson(join(bundleRoot, "project-profile.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    project_state: "empty",
    project_id: projectId,
    project_name: projectId,
    purpose: { summary: "Exercise native Skill CLI behavior.", evidence: ["user:CLI native Skill fixture"] },
    primary_flows: [],
    languages: [],
    frameworks: [],
    package_managers: [],
    source_roots: [],
    entrypoints: [],
    modules: [],
    commands: [],
    environment: { services: [], variables: [], modes: [], evidence: [] },
    ci: [],
    bridges: [],
    reference_projects: [],
    global_boundaries: [{ summary: "Native Skills are discovered without package copies.", evidence: ["user:CLI native Skill fixture"] }],
    unknowns: [],
    evidence: ["user:CLI native Skill fixture"],
  });
  await writeTestJson(join(bundleRoot, "architecture.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    layers: [{ name: "unimplemented", evidence: ["user:CLI native Skill fixture"] }],
    dependencies: [],
    components: [],
    circular_dependencies: [],
    key_interfaces: [],
    code_paths: [],
    error_patterns: {},
    evidence: ["user:CLI native Skill fixture"],
  });
  await writeTestJson(join(bundleRoot, "audit.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    dimensions: Object.fromEntries([
      ["project_knowledge", 25],
      ["mechanical_checks", 20],
      ["environment", 15],
      ["coordination", 15],
      ["ecl_changes", 15],
      ["evolution", 10],
    ].map(([name, weight]) => [name, { score: 8, weight }])),
    overall_score: 8,
    strengths: [{ summary: "Explicit native Skill fixture", evidence: ["user:CLI native Skill fixture"] }],
    gaps: [],
    knowledge_findings: [],
  });
  await writeTestJson(join(bundleRoot, "creation-delta.json"), {
    schema_version: "1.0",
    mode: "init",
    decisions: [{
      source: "user:CLI native Skill fixture",
      action: "create",
      owner: "project-profile",
      projection: "L1",
      validation: "frontmatter and knowledge check",
    }],
    artifacts: [{
      path: "references/project_wiki/overview.md",
      action: "create",
      source: "artifacts/overview.md",
      owner: "project-profile",
      validation: "knowledge-check",
      evidence: ["user:CLI native Skill fixture"],
    }],
  });
}

async function writeTestJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-cli-"));
  homeDir = join(tempDir, "home");
  repoDir = join(tempDir, "repo");
  originalPathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  originalPath = process.env[originalPathKey];
  originalExitCode = process.exitCode;
  originalCodexHome = process.env.CODEX_HOME;
  originalCodexBin = process.env.AHO_CODEX_BIN;
  process.exitCode = undefined;
  process.env.AHO_HOME = homeDir;
  process.env.CODEX_HOME = join(tempDir, "codex-home");
  await execFileAsync("git", ["init", repoDir]);
});

afterEach(async () => {
  await defaultProviderRegistry.shutdownAll("CLI integration fixture cleanup.");
  delete process.env.AHO_HOME;
  process.env.CODEX_HOME = originalCodexHome;
  if (originalCodexBin === undefined) delete process.env.AHO_CODEX_BIN;
  else process.env.AHO_CODEX_BIN = originalCodexBin;
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
    const agentHarnessIgnore = await readFile(join(repoDir, ".agent-harness", ".gitignore"), "utf8");
    expect(agentHarnessIgnore).toContain("runs/");
    expect(agentHarnessIgnore).toContain("worktrees/");
    expect(agentHarnessIgnore).toContain("workbench/");
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    expect(snapshot.roles.map((item) => item.id)).toEqual(expect.arrayContaining([
      "planning-agent", "coder-agent", "auditor-agent", "harness-evolution-agent",
    ]));
    expect(snapshot.roles.map((item) => item.id)).not.toContain("memory-maintenance-agent");
    expect(snapshot.roles.map((item) => item.id)).not.toContain("evolution-scorer");
    expect(snapshot.roles.map((item) => item.id)).not.toContain("validator");
  });

  it("registers native Skill roots and keeps selection state without copying packages", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await publishTestProjectHarness();
    process.env.AHO_CODEX_BIN = await createFakeCodexRuntime(tempDir);
    const skillRoot = join(tempDir, "skills");
    const skillDir = join(skillRoot, "pricing-helper");
    await mkdir(join(skillDir, "references"), { recursive: true });
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: pricing-helper\ndescription: Pricing rules.\n---\n\n# Pricing Helper\n", "utf8");
    await writeFile(join(skillDir, "references", "rules.md"), "rules\n", "utf8");
    await writeFile(join(skillDir, "scripts", "unsafe.ps1"), "Write-Host unsafe\n", "utf8");

    await runCli(["skill", "root-add", "repo", "--path", skillRoot]);
    await runCli(["skill", "enable", "repo", "pricing-helper"]);
    await runCli(["skill", "list", "repo", "--json"]);

    expect(await readFile(join(skillDir, "scripts", "unsafe.ps1"), "utf8")).toBe("Write-Host unsafe\n");
    expect(existsSync(join(homeDir, "projects", "repo", "skills"))).toBe(false);
    expect(existsSync(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed"))).toBe(false);
    const store = await openProjectRuntimeWorkbenchDatabase(resolveProjectRuntimePaths("repo", homeDir));
    expect(store.skills.listSkillRoots("repo")).toEqual([
      expect.objectContaining({ rootPath: skillRoot, sourceKind: "custom" }),
    ]);
    expect(store.skills.listSkillEnablement("repo")).toEqual([
      expect.objectContaining({ skillId: "pricing-helper", scope: "project", enabled: true }),
    ]);
    store.close();
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    expect(generatorRun.command).toEqual(["provider", "turn.start"]);
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    await seedExternalHarnessAfterAgentOnboarding();
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

  it("keeps external-local initialization runtime-only until Agent onboarding", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await runCli(["harness", "init", "repo", "--memory", "external-local"]);

    const marker = JSON.parse(await readFile(join(repoDir, ".agent-harness", "project.json"), "utf8"));
    const memoryRoot = join(homeDir, "projects", "repo");
    expect(marker).toMatchObject({ id: "repo", memoryMode: "external-local" });
    expect(existsSync(join(repoDir, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repoDir, ".agent-harness", ".gitignore"))).toBe(true);
    expect(existsSync(join(repoDir, "harness"))).toBe(false);
    expect(existsSync(join(repoDir, "docs"))).toBe(false);
    expect(existsSync(join(memoryRoot, "docs"))).toBe(false);
    expect(existsSync(join(memoryRoot, "harness"))).toBe(false);
    expect(existsSync(join(memoryRoot, "scripts"))).toBe(false);
  });

  it("creates AHO-owned worktrees and runs local commands inside them", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await seedExternalHarnessAfterAgentOnboarding();
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    expect(existsSync(join(run.worktree.checkoutPath, "validation-output.txt"))).toBe(false);
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    await seedExternalHarnessAfterAgentOnboarding();
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
    expect(run.command).toEqual(["provider", "turn.start"]);
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

  it("rejects CLI code runs without an explicit Workflow Runtime execution gate", async () => {
    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await seedExternalHarnessAfterAgentOnboarding();
    await runCli(["change", "new", "repo", "--title", "Ungated Code"]);

    await expect(runCli(["code", "run", "repo", "--json"])).rejects.toThrow("explicit Workflow Runtime execution gate");
  });

  it("discards an unapplied worktree proposal without changing the source repo", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await seedExternalHarnessAfterAgentOnboarding();
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
    await seedExternalHarnessAfterAgentOnboarding();
    await runCli(["change", "new", "repo", "--title", "No Commit Worktree"]);

    await expect(runCli(["worktree", "create", "repo"])).rejects.toThrow("has no commits");
  });

  it("blocks default worktree creation from detached HEAD", async () => {
    await writeFile(join(repoDir, "README.md"), "hello\n", "utf8");
    await execFileAsync("git", ["-C", repoDir, "add", "README.md"]);
    await execFileAsync("git", ["-C", repoDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);
    await execFileAsync("git", ["-C", repoDir, "checkout", "--detach", "HEAD"]);

    await runCli(["project", "add", repoDir, "--name", "Repo"]);
    await seedExternalHarnessAfterAgentOnboarding();
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
  await defaultProviderRegistry.shutdownAll(`Switch CLI integration fake Codex to ${mode}.`);
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
  process.env.AHO_CODEX_BIN = binPath;
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
const appServerIndex = args.indexOf("app-server");
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
if (appServerIndex >= 0 && args.includes("--help")) {
  console.log("Codex app server\\n--listen <stdio://>");
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
function applyModeEffects(cwd) {
  const path = require("node:path");
  if (mode === "spec-test-generate") {
    const testDir = path.join(cwd, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "generated.test.js"), "const test = require('node:test');\\nconst assert = require('node:assert/strict');\\n\\ntest('generated AC evidence', () => {\\n  assert.equal(1, 1);\\n});\\n", "utf8");
  }
  if (mode === "spec-test-generate-production") {
    const srcDir = path.join(cwd, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "pricing.js"), "export const changed = true;\\n", "utf8");
  }
}
if (appServerIndex >= 0) {
  const readline = require("node:readline");
  const rl = readline.createInterface({ input: process.stdin });
  let appCwd = process.cwd();
  const threadId = "thread-fake-1";
  const turnId = "turn-fake-1";
  const reply = (id, result) => console.log(JSON.stringify({ id, result }));
  rl.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      reply(message.id, {});
    } else if (message.method === "skills/extraRoots/set") {
      reply(message.id, {});
    } else if (message.method === "skills/list") {
      reply(message.id, { data: [{ skills: [
        { name: "aho-main-orchestration" },
        { name: "aho-workflow-authoring" },
        { name: "aho-harness-engineering" }
      ] }] });
    } else if (message.method === "model/list") {
      reply(message.id, { data: [{ id: "fake-model", model: "fake-model", displayName: "Fake Model" }] });
    } else if (message.method === "thread/start" || message.method === "thread/resume") {
      appCwd = message.params.cwd || appCwd;
      reply(message.id, { thread: { id: threadId } });
    } else if (message.method === "turn/start") {
      appCwd = message.params.cwd || appCwd;
      applyModeEffects(appCwd);
      reply(message.id, { turn: { id: turnId } });
      setImmediate(() => {
        console.log(JSON.stringify({ method: "turn/started", params: { threadId, turn: { id: turnId, status: "inProgress" } } }));
        console.log(JSON.stringify({ method: "item/completed", params: { threadId, turnId, item: { id: "message-fake-1", type: "agentMessage", text: finalMessage() } } }));
        console.log(JSON.stringify({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } }));
      });
    }
  });
} else {
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
}
`;
}
