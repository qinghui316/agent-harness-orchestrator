import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureProjectHarnessOnboardingWorkspace,
  prepareProjectHarnessOnboarding,
  publishProjectHarnessOnboarding,
  recoverProjectHarnessOnboarding,
} from "../../src/project-harness/onboarding.js";
import { createProjectHarnessRuntime } from "../../src/project-harness/runtime.js";
import { getProjectHarnessSkillScaffoldRoot } from "../../src/template-source/paths.js";

const cleanup: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness greenfield onboarding", () => {
  it("publishes one independently reviewed revision-1 Skill with Codex and Claude SameTarget", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-success",
    });
    await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "auditor-attempt-1");

    const result = await publishProjectHarnessOnboarding({
      projectId: fixture.projectId,
      projectRoot: fixture.projectRoot,
      sidecarRoot: fixture.sidecarRoot,
      reviewerId: "auditor-attempt-1",
    });

    expect(result.record.stage).toBe("completed");
    expect(result.discovery.handle).toMatchObject({ projectId: fixture.projectId, skillRevision: 1 });
    expect(result.discovery.binding.providers).toEqual([
      expect.objectContaining({ providerId: "codex", status: "ready", sameTarget: true }),
      expect.objectContaining({ providerId: "claude", status: "ready", sameTarget: true }),
    ]);
    expect(result.doctor.healthy).toBe(true);
    expect(result.audit.healthy).toBe(true);
    const manifest = JSON.parse(await readFile(join(result.discovery.handle.skillRoot, "state", "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ project_id: fixture.projectId, skill_revision: 1, analysis_status: "complete" });
  });

  it("rejects a forged reviewer identity before publishing", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-reviewer",
    });
    await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "forged-reviewer");

    await expect(publishProjectHarnessOnboarding({
      projectId: fixture.projectId,
      projectRoot: fixture.projectRoot,
      sidecarRoot: fixture.sidecarRoot,
      reviewerId: "auditor-attempt-1",
    })).rejects.toThrow(/identities do not match/);
    await expect(readFile(join(fixture.projectRoot, ".agents", "skills", `${fixture.projectId}-harness`), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("allows only one concurrent prepare to own the shared onboarding workspace", async () => {
    const fixture = await createFixture();
    const attempts = await Promise.allSettled([
      prepareProjectHarnessOnboarding({
        ...fixture.options,
        authorId: "main-attempt-1",
        transactionId: "onboard-concurrent-1",
      }),
      prepareProjectHarnessOnboarding({
        ...fixture.options,
        authorId: "main-attempt-2",
        transactionId: "onboard-concurrent-2",
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: expect.stringMatching(/writer lock is already held/) }),
    });
  });

  it("does not replace a durable prepared transaction and only permits an exact idempotent retry", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-durable-1",
    });

    await expect(prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-2",
      transactionId: "onboard-durable-2",
    })).rejects.toThrow(/prepared project Harness onboarding transaction already owns/);
    await expect(prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-durable-1",
    })).resolves.toEqual(prepared);
    expect(JSON.parse(await readFile(fixture.workspace.recordPath, "utf8"))).toMatchObject({
      transaction_id: "onboard-durable-1",
      author_id: "main-attempt-1",
      stage: "prepared",
    });
  });

  it("derives one stable transaction from the Runtime-verified Main attempt for facade retries", async () => {
    const fixture = await createFixture();
    const commands = { async run() { return { status: "unused" }; } };
    const runtime = createProjectHarnessRuntime({
      projectId: fixture.projectId,
      projectRoot: fixture.projectRoot,
      skillRoot: join(fixture.projectRoot, ".agents", "skills", `${fixture.projectId}-harness`),
      sidecarRoot: fixture.sidecarRoot,
      change: commands,
      registry: { async preflight() { return { status: "unused" }; } },
      integration: commands,
      evolution: commands,
      onboarding: {
        scaffoldRoot: fixture.options.scaffoldRoot,
        compiledRuntimeEntry: fixture.options.compiledRuntimeEntry,
        executions: {
          async verify(input) {
            return {
              projectId: input.projectId,
              attemptId: input.attemptId,
              roleId: input.requiredRole,
              artifactPath: input.artifactPath,
            };
          },
        },
      },
    });

    const first = await runtime.project.init.prepare("main-attempt-1");
    const retried = await runtime.project.init.prepare("main-attempt-1");
    expect(retried.transaction_id).toBe(first.transaction_id);
    expect(retried.candidate_fingerprint).toBe(first.candidate_fingerprint);
  });

  it("rejects non-portable transaction ids before deriving staging paths", async () => {
    const fixture = await createFixture();
    await expect(prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "../outside",
    })).rejects.toThrow(/transaction id is not portable/);
  });

  it("rejects a Creator scaffold reached through a link or Junction ancestor", async () => {
    const fixture = await createFixture();
    const linkedScaffold = join(fixture.root, "linked-scaffold");
    await symlink(
      fixture.options.scaffoldRoot,
      linkedScaffold,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(prepareProjectHarnessOnboarding({
      ...fixture.options,
      scaffoldRoot: linkedScaffold,
      authorId: "main-attempt-1",
      transactionId: "onboard-linked-scaffold",
    })).rejects.toThrow(/scaffold traverses a link or Junction/);
  });

  it("rejects dynamic candidate state changed after independent review", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-state-drift",
    });
    await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "auditor-attempt-1");
    await writeFile(join(prepared.candidate_root, "state", "registry", "tampered.json"), "{}\n", "utf8");

    await expect(publishProjectHarnessOnboarding({
      projectId: fixture.projectId,
      projectRoot: fixture.projectRoot,
      sidecarRoot: fixture.sidecarRoot,
      reviewerId: "auditor-attempt-1",
    })).rejects.toThrow(/rolled back: Project Harness candidate no longer matches its reviewed fingerprint/);
    await expect(readFile(join(fixture.projectRoot, ".agents", "skills", `${fixture.projectId}-harness`, "SKILL.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["candidate-staged", "skill-published", "claude-linked"] as const)(
    "rolls back every transaction-created publication entity after a %s failure",
    async (stage) => {
      const fixture = await createFixture();
      const prepared = await prepareProjectHarnessOnboarding({
        ...fixture.options,
        authorId: "main-attempt-1",
        transactionId: `onboard-fail-${stage}`,
      });
      await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "auditor-attempt-1");

      await expect(publishProjectHarnessOnboarding({
        projectId: fixture.projectId,
        projectRoot: fixture.projectRoot,
        sidecarRoot: fixture.sidecarRoot,
        reviewerId: "auditor-attempt-1",
        failureInjection(current) {
          if (current === stage) throw new Error(`injected ${stage}`);
        },
      })).rejects.toThrow(/rolled back/);

      await expect(readFile(join(fixture.projectRoot, ".agents", "skills", `${fixture.projectId}-harness`, "SKILL.md"), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(join(fixture.projectRoot, ".claude", "skills", `${fixture.projectId}-harness`, "SKILL.md"), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" });
      const record = JSON.parse(await readFile(fixture.workspace.recordPath, "utf8"));
      expect(record.stage).toBe("rolled-back");
    },
  );

  it("treats a durable completed journal as an irreversible commit point", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-committed",
    });
    await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "auditor-attempt-1");

    await expect(publishProjectHarnessOnboarding({
      projectId: fixture.projectId,
      projectRoot: fixture.projectRoot,
      sidecarRoot: fixture.sidecarRoot,
      reviewerId: "auditor-attempt-1",
      failureInjection(stage) {
        if (stage === "completed") throw new Error("injected post-commit crash");
      },
    })).rejects.toThrow(/injected post-commit crash/);

    const skillRoot = join(fixture.projectRoot, ".agents", "skills", `${fixture.projectId}-harness`);
    const claudeRoot = join(fixture.projectRoot, ".claude", "skills", `${fixture.projectId}-harness`);
    await mkdir(join(skillRoot, "state", "migration"), { recursive: true });
    await writeFile(join(skillRoot, "state", "migration", "post-commit.json"), "{}\n", "utf8");
    expect(JSON.parse(await readFile(fixture.workspace.recordPath, "utf8"))).toMatchObject({ stage: "completed" });
    await expect(readFile(join(claudeRoot, "SKILL.md"), "utf8")).resolves.toContain("sample-a1-harness");

    const recovered = await recoverProjectHarnessOnboarding(
      fixture.projectId,
      fixture.projectRoot,
      fixture.sidecarRoot,
    );
    expect(recovered?.stage).toBe("completed");
    await expect(readFile(join(skillRoot, "SKILL.md"), "utf8")).resolves.toContain("sample-a1-harness");
    await expect(readFile(prepared.candidate_root, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("prevalidates every rollback target before removing either provider binding", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-rollback-preflight",
    });
    await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "auditor-attempt-1");

    await expect(publishProjectHarnessOnboarding({
      projectId: fixture.projectId,
      projectRoot: fixture.projectRoot,
      sidecarRoot: fixture.sidecarRoot,
      reviewerId: "auditor-attempt-1",
      async failureInjection(stage) {
        if (stage !== "claude-linked") return;
        await mkdir(join(prepared.skill_root, "state", "migration"), { recursive: true });
        await writeFile(join(prepared.skill_root, "state", "migration", "unexpected.json"), "{}\n", "utf8");
        throw new Error("injected ownership drift");
      },
    })).rejects.toThrow(/candidate no longer matches its reviewed fingerprint/);

    await expect(readFile(join(prepared.skill_root, "SKILL.md"), "utf8")).resolves.toContain("sample-a1-harness");
    await expect(readFile(join(prepared.claude_link, "SKILL.md"), "utf8")).resolves.toContain("sample-a1-harness");
    expect(JSON.parse(await readFile(fixture.workspace.recordPath, "utf8"))).toMatchObject({ stage: "claude-linked" });
  });

  it("executes the platform launchers from a Creator-built revision-1 candidate", async () => {
    const fixture = await createFixture();
    const runtimeOutput = join(fixture.root, "compiled-runtime");
    await execFileAsync(process.execPath, ["scripts/build-project-harness-runtime.mjs", runtimeOutput], {
      cwd: process.cwd(),
    });
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      compiledRuntimeEntry: join(runtimeOutput, "runtime.mjs"),
      authorId: "main-attempt-1",
      transactionId: "onboard-launchers",
    });
    await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "auditor-attempt-1");
    const result = await publishProjectHarnessOnboarding({
      projectId: fixture.projectId,
      projectRoot: fixture.projectRoot,
      sidecarRoot: fixture.sidecarRoot,
      reviewerId: "auditor-attempt-1",
    });
    const runtimeRoot = join(result.discovery.handle.skillRoot, "scripts", "project-harness-runtime");
    const environment = { ...process.env, AHO_NODE: process.execPath };

    if (process.platform === "win32") {
      const powerShell = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(runtimeRoot, "harness.ps1"),
        "doctor",
        "--project-root",
        fixture.projectRoot,
      ], { env: environment, windowsHide: true });
      const cmd = await execFileAsync("cmd.exe", [
        "/d",
        "/c",
        join(runtimeRoot, "harness.cmd"),
        "audit",
        "--project-root",
        fixture.projectRoot,
      ], {
        env: environment,
        windowsHide: true,
      });
      expect(JSON.parse(powerShell.stdout)).toMatchObject({ healthy: true, revision: 1 });
      expect(JSON.parse(cmd.stdout)).toMatchObject({ healthy: true, revision: 1 });
    } else {
      for (const action of ["doctor", "audit"]) {
        const launched = await execFileAsync("/bin/sh", [
          join(runtimeRoot, "harness.sh"),
          action,
          "--project-root",
          fixture.projectRoot,
        ], { env: environment });
        expect(JSON.parse(launched.stdout)).toMatchObject({ healthy: true, revision: 1 });
      }
    }
  });

  it("recovers an interrupted publication only when its exact candidate still owns the paths", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-recovery",
    });
    await writeReview(fixture.workspace.reviewPath, prepared, "main-attempt-1", "auditor-attempt-1");
    const interrupted = {
      ...prepared,
      stage: "candidate-staged",
      updated_at: new Date().toISOString(),
    };
    await mkdir(join(fixture.projectRoot, ".agents", "skills"), { recursive: true });
    await copyTree(prepared.candidate_root, prepared.staged_root);
    await writeFile(fixture.workspace.recordPath, `${JSON.stringify(interrupted, null, 2)}\n`, "utf8");

    const recovered = await recoverProjectHarnessOnboarding(
      fixture.projectId,
      fixture.projectRoot,
      fixture.sidecarRoot,
    );
    expect(recovered?.stage).toBe("rolled-back");
    await expect(readFile(prepared.staged_root, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a recovery journal whose request or derived publication paths were changed", async () => {
    const fixture = await createFixture();
    const prepared = await prepareProjectHarnessOnboarding({
      ...fixture.options,
      authorId: "main-attempt-1",
      transactionId: "onboard-journal-binding",
    });
    const otherProjectRoot = join(fixture.root, "other-project");
    await mkdir(otherProjectRoot);
    await writeJson(fixture.workspace.recordPath, {
      ...prepared,
      project_root: otherProjectRoot,
      skill_root: join(otherProjectRoot, ".agents", "skills", prepared.skill_name),
      claude_link: join(otherProjectRoot, ".claude", "skills", prepared.skill_name),
      staged_root: join(
        otherProjectRoot,
        ".agents",
        "skills",
        `.${prepared.skill_name}.${prepared.transaction_id}.candidate`,
      ),
    });

    await expect(recoverProjectHarnessOnboarding(
      fixture.projectId,
      fixture.projectRoot,
      fixture.sidecarRoot,
    )).rejects.toThrow(/request does not match the Runtime-owned transaction/);

    await writeJson(fixture.workspace.recordPath, {
      ...prepared,
      staged_root: join(fixture.projectRoot, ".agents", "skills", ".another-skill.candidate"),
    });
    await expect(recoverProjectHarnessOnboarding(
      fixture.projectId,
      fixture.projectRoot,
      fixture.sidecarRoot,
    )).rejects.toThrow(/paths do not match Runtime ownership/);
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "aho-project-harness-onboarding-"));
  cleanup.push(root);
  const projectId = "sample-a1";
  const projectRoot = join(root, "project");
  const sidecarRoot = join(root, "aho-home", "projects", projectId);
  await mkdir(projectRoot, { recursive: true });
  const workspace = await ensureProjectHarnessOnboardingWorkspace(projectId, projectRoot, sidecarRoot);
  await writeBundle(workspace.bundleRoot, projectId);
  const compiledRuntimeEntry = join(root, "runtime.mjs");
  await writeFile(compiledRuntimeEntry, "export async function runProjectHarnessDailyCommand() { return {}; }\n", "utf8");
  return {
    root,
    projectId,
    projectRoot,
    sidecarRoot,
    workspace,
    options: {
      projectId,
      projectRoot,
      sidecarRoot,
      scaffoldRoot: getProjectHarnessSkillScaffoldRoot(),
      compiledRuntimeEntry,
    },
  };
}

async function writeBundle(bundleRoot: string, projectId: string): Promise<void> {
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
    "    - \"user:empty project purpose confirmed\"",
    "---",
    "",
    "# Sample Project",
    "",
  ].join("\n"), "utf8");
  await writeJson(join(bundleRoot, "project-profile.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    project_state: "empty",
    project_id: projectId,
    project_name: "sample",
    purpose: { summary: "Prepare a verified empty project.", evidence: ["user:empty project purpose confirmed"] },
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
    global_boundaries: [{ summary: "No source work before an accepted Change.", evidence: ["user:empty project purpose confirmed"] }],
    unknowns: [],
    evidence: ["user:empty project purpose confirmed"],
  });
  await writeJson(join(bundleRoot, "architecture.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    layers: [{ name: "unimplemented", evidence: ["user:empty project purpose confirmed"] }],
    dependencies: [],
    components: [],
    circular_dependencies: [],
    key_interfaces: [],
    code_paths: [],
    error_patterns: {},
    evidence: ["user:empty project purpose confirmed"],
  });
  await writeJson(join(bundleRoot, "audit.json"), {
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
    strengths: [{ summary: "Explicit empty-project state", evidence: ["user:empty project purpose confirmed"] }],
    gaps: [],
    knowledge_findings: [],
  });
  await writeJson(join(bundleRoot, "creation-delta.json"), {
    schema_version: "1.0",
    mode: "init",
    decisions: [{
      source: "user:empty project purpose confirmed",
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
      evidence: ["user:empty project purpose confirmed"],
    }],
  });
}

async function writeReview(
  path: string,
  record: { candidate_fingerprint: string; source_snapshot_digest: string },
  authorId: string,
  reviewerId: string,
): Promise<void> {
  await writeJson(path, {
    schema_version: "1.0",
    kind: "full-bundle-review",
    candidate_fingerprint: record.candidate_fingerprint,
    source_snapshot_digest: record.source_snapshot_digest,
    author_id: authorId,
    reviewer_id: reviewerId,
    decision: "approve",
    findings: [],
    reviewed_at: new Date().toISOString(),
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyTree(source: string, target: string): Promise<void> {
  const { cp } = await import("node:fs/promises");
  await cp(source, target, { recursive: true, force: false });
}
