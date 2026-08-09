import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  abortProjectHarnessIntegration,
  completeProjectHarnessIntegration,
  loadProjectHarnessIntegration,
  startProjectHarnessIntegration,
  type ProjectHarnessGitPort,
} from "../../src/project-harness/integration.js";
import { readProjectHarnessBaseline } from "../../src/project-harness/registry.js";
import {
  claimProjectHarnessWriterLock,
  projectHarnessSharedWriterRoot,
  readProjectHarnessWriterLock,
  releaseProjectHarnessWriterLock,
} from "../../src/project-harness/writer-lock.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness Integration", () => {
  it("builds a candidate from the exact linear base..completion range", async () => {
    const fixture = await createFixture();
    const record = await fixture.start();

    expect(record.status).toBe("ready_for_review");
    expect(record.canonical_base).toBe(fixture.baseCommit);
    expect(record.change_commit_ranges).toEqual({ "change-one": [fixture.completionCommit] });
    expect(record.applied_commits).toEqual([fixture.completionCommit]);
    expect(record.remaining_commits).toEqual([]);
    expect(record.candidate_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(await git(fixture.projectRoot, "cat-file", "-t", record.candidate_commit!)).toBe("commit");
    expect(await git(fixture.projectRoot, "rev-parse", `${record.candidate_commit}^{tree}`))
      .toBe(await git(fixture.projectRoot, "rev-parse", `${fixture.completionCommit}^{tree}`));
    expect(await git(fixture.projectRoot, "merge-base", fixture.baseCommit, record.candidate_commit!))
      .toBe(fixture.baseCommit);
    expect(await git(fixture.projectRoot, "rev-list", "--merges", `${fixture.baseCommit}..${record.candidate_commit}`))
      .toBe("");
  });

  it("requires exact commit boundaries and an approved candidate-bound review", async () => {
    const missing = await createFixture({ completionCommit: false });
    await expect(missing.start()).rejects.toThrow(/no Integration commit boundary/);

    const fixture = await createFixture();
    const record = await fixture.start();
    await expect(fixture.complete(record, { confirmI2: false })).rejects.toThrow(/explicit I2/);
    await expect(fixture.complete(record, {
      review: fixture.review(record, { candidateCommit: "f".repeat(40) }),
    })).rejects.toThrow(/does not match the current candidate/);
    await expect(fixture.complete(record, {
      review: { ...fixture.review(record), integrator_id: "another-integrator" },
    })).rejects.toThrow(/integrator identity/);
  });

  it("records completed evidence dependencies without selecting or cherry-picking them", async () => {
    const fixture = await createFixture({ evidenceDependency: {} });
    const record = await fixture.start();

    expect(record.change_ids).toEqual(["change-one"]);
    expect(record.change_commit_ranges).toEqual({ "change-one": [fixture.completionCommit] });
    expect(record.evidence_dependencies).toEqual([expect.objectContaining({
      required_by_change_id: "change-one",
      change_id: "architecture-change",
      required_status: "completed",
      validation_passed: true,
      evidence_complete: true,
      classification_contract_change_id: "dependency-correction",
      classification_contract_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      classification_evidence_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      evidence_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    })]);
  });

  it("fails closed for unsatisfied or mismatched evidence dependency classification", async () => {
    const invalid = await createFixture({ evidenceDependency: { validationPassed: false } });
    await expect(invalid.start()).rejects.toThrow(/unsatisfied evidence dependency/);
    expect(existsSync(join(invalid.skillRoot, "state", "registry", "integrations", "integration-one.json"))).toBe(false);
    expect(existsSync(join(invalid.sidecarRoot, "integrations", "integration-one", "worktree"))).toBe(false);

    const mismatched = await createFixture({ evidenceDependency: { classifiedChangeId: "different-change" } });
    await expect(mismatched.start()).rejects.toThrow(/does not exactly match/);
    expect(existsSync(join(mismatched.skillRoot, "state", "registry", "integrations", "integration-one.json"))).toBe(false);
  });

  it("keeps Git dependencies strict and revalidates evidence fingerprints before landing", async () => {
    const gitDependency = await createFixture({ integrationDependency: true });
    await expect(gitDependency.start()).rejects.toThrow(/unintegrated dependency/);

    const evidence = await createFixture({ evidenceDependency: {} });
    const record = await evidence.start();
    await writeFile(join(evidence.skillRoot, "state", "changes", "archive", "architecture-change", "summary.md"), "drifted\n", "utf8");
    await expect(evidence.complete(record)).rejects.toThrow(/evidence dependency drifted/);

    const classification = await createFixture({ evidenceDependency: {} });
    const classificationRecord = await classification.start();
    const contractPath = join(classification.skillRoot, "state", "registry", "contracts", "dependency-correction.json");
    const contractValue = JSON.parse(await readFile(contractPath, "utf8")) as Record<string, unknown>;
    contractValue.compatibility = "drifted";
    await writeFile(contractPath, `${JSON.stringify(contractValue, null, 2)}\n`, "utf8");
    await expect(classification.complete(classificationRecord)).rejects.toThrow(/classification contract drifted/);
  });

  it("recovers after canonical landing without repeating the reviewed merge", async () => {
    const fixture = await createFixture();
    const record = await fixture.start();
    await expect(fixture.complete(record, {
      failureInjection(phase) {
        if (phase === "canonical_landed") throw new Error("injected after canonical landing");
      },
    })).rejects.toThrow(/injected after canonical landing/);

    const landedHead = await git(fixture.projectRoot, "rev-parse", "HEAD");
    const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    expect(recovering).toMatchObject({
      status: "landing_recovery_required",
      landing_phase: "canonical_landed",
      landing_commit: landedHead,
    });
    expect(await readProjectHarnessWriterLock(projectHarnessSharedWriterRoot(fixture.sidecarRoot))).toMatchObject({
      ownerId: "integration-one",
      operation: "integration-finalize",
    });
    const ownerPath = join(projectHarnessSharedWriterRoot(fixture.sidecarRoot), "writer-lock", "owner.json");
    const expired = JSON.parse(await readFile(ownerPath, "utf8")) as Record<string, unknown>;
    expired.expiresAt = "2000-01-01T00:00:00.000Z";
    await writeFile(ownerPath, `${JSON.stringify(expired, null, 2)}\n`, "utf8");

    const completed = await fixture.complete(recovering!);
    expect(completed).toMatchObject({ status: "integrated", landing_phase: "cleanup_complete" });
    expect(await readProjectHarnessWriterLock(projectHarnessSharedWriterRoot(fixture.sidecarRoot))).toBeNull();
    expect(existsSync(join(fixture.sidecarRoot, "integrations", "integration-one", "worktree"))).toBe(false);
    const change = JSON.parse(await readFile(join(fixture.skillRoot, "state", "registry", "changes", "change-one.json"), "utf8")) as {
      integrated_by: string;
      integration_status: string;
    };
    expect(change).toMatchObject({ integrated_by: "integration-one", integration_status: "integrated" });
    expect(await readProjectHarnessBaseline(fixture.skillRoot)).toMatchObject({ canonical_commit: landedHead });

    const idempotent = await fixture.complete(completed);
    expect(idempotent).toEqual(completed);
  });

  it("revalidates recorded post-commit Registry state without repeating landing or Registry commit", async () => {
    const fixture = await createFixture({ evidenceDependency: {} });
    const record = await fixture.start();
    let mergeCount = 0;
    const countingGit = interceptGit(async (cwd, args, next) => {
      if (args[0] === "merge" && args[1] === "--ff-only") mergeCount += 1;
      return next(cwd, args);
    });
    await expect(fixture.complete(record, {
      git: countingGit,
      failureInjection(phase) {
        if (phase === "registry_committed") throw new Error("injected after Registry commit");
      },
    })).rejects.toThrow(/injected after Registry commit/);

    const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    expect(recovering).toMatchObject({
      status: "landing_recovery_required",
      landing_phase: "registry_committed",
      registry_result: {
        post_commit_fingerprints: {
          changes: expect.any(Object),
          contracts: expect.any(Object),
          baseline_event: expect.any(Object),
          baseline: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    });
    const changePath = join(fixture.skillRoot, "state", "registry", "changes", "change-one.json");
    const contractPath = join(fixture.skillRoot, "state", "registry", "contracts", "change-one.json");
    const committedChange = await readFile(changePath, "utf8");
    const committedContract = await readFile(contractPath, "utf8");
    await expireIntegrationWriter(fixture.sidecarRoot);

    const completed = await fixture.complete(recovering!, { git: countingGit });
    expect(completed).toMatchObject({ status: "integrated", landing_phase: "cleanup_complete" });
    expect(mergeCount).toBe(1);
    expect(await readFile(changePath, "utf8")).toBe(committedChange);
    expect(await readFile(contractPath, "utf8")).toBe(committedContract);
    expect(completed.registry_result?.cleanup_outcome).toMatchObject({
      git_remove: "removed",
      worktree_registered_after: false,
    });
  });

  it.each(["worktree_cleaned", "cleanup_complete"] as const)(
    "recovers after %s without repeating landing or Registry commit",
    async (failurePoint) => {
      const fixture = await createFixture({ evidenceDependency: {} });
      const record = await fixture.start();
      let mergeCount = 0;
      const countingGit = interceptGit(async (cwd, args, next) => {
        if (args[0] === "merge" && args[1] === "--ff-only") mergeCount += 1;
        return next(cwd, args);
      });
      await expect(fixture.complete(record, {
        git: countingGit,
        failureInjection(phase) {
          if (phase === failurePoint) throw new Error(`injected after ${failurePoint}`);
        },
      })).rejects.toThrow(`injected after ${failurePoint}`);

      const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
      expect(recovering?.landing_phase).toBe(failurePoint === "worktree_cleaned" ? "registry_committed" : "cleanup_complete");
      expect(existsSync(integrationWorktree(fixture))).toBe(false);
      const committedChange = await readFile(
        join(fixture.skillRoot, "state", "registry", "changes", "change-one.json"),
        "utf8",
      );

      const completed = await fixture.complete(recovering!, { git: countingGit });
      expect(completed).toMatchObject({ status: "integrated", landing_phase: "cleanup_complete" });
      expect(completed.registry_result?.cleanup_outcome).toMatchObject({
        git_remove: "removed",
        worktree_registered_after: false,
      });
      expect(mergeCount).toBe(1);
      expect(await readFile(
        join(fixture.skillRoot, "state", "registry", "changes", "change-one.json"),
        "utf8",
      )).toBe(committedChange);
      expect(await readProjectHarnessWriterLock(projectHarnessSharedWriterRoot(fixture.sidecarRoot))).toBeNull();
    },
  );

  it("fails closed when a post-commit legacy record lacks its fingerprint manifest", async () => {
    const fixture = await createFixture({ evidenceDependency: {} });
    const record = await fixture.start();
    await expect(fixture.complete(record, {
      failureInjection(phase) {
        if (phase === "registry_committed") throw new Error("hold after Registry commit");
      },
    })).rejects.toThrow(/hold after Registry commit/);
    const recordPath = join(fixture.skillRoot, "state", "registry", "integrations", "integration-one.json");
    const stored = JSON.parse(await readFile(recordPath, "utf8")) as {
      registry_result: { post_commit_fingerprints?: unknown };
    };
    delete stored.registry_result.post_commit_fingerprints;
    await writeFile(recordPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    const legacy = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    await expect(fixture.complete(legacy!)).rejects.toThrow(/missing post-commit Registry fingerprints/);
  });

  it.each([
    ["Change", (fixture: Awaited<ReturnType<typeof createFixture>>, _record: NonNullable<Awaited<ReturnType<typeof loadProjectHarnessIntegration>>>) =>
      join(fixture.skillRoot, "state", "registry", "changes", "change-one.json")],
    ["contract", (fixture: Awaited<ReturnType<typeof createFixture>>, _record: NonNullable<Awaited<ReturnType<typeof loadProjectHarnessIntegration>>>) =>
      join(fixture.skillRoot, "state", "registry", "contracts", "change-one.json")],
    ["baseline event", (fixture: Awaited<ReturnType<typeof createFixture>>, record: NonNullable<Awaited<ReturnType<typeof loadProjectHarnessIntegration>>>) =>
      join(fixture.skillRoot, "state", "registry", "baseline-events", `${record.registry_result!.event_id}.json`)],
    ["baseline", (fixture: Awaited<ReturnType<typeof createFixture>>, _record: NonNullable<Awaited<ReturnType<typeof loadProjectHarnessIntegration>>>) =>
      join(fixture.skillRoot, "state", "registry", "baseline.json")],
  ])("rejects post-commit %s tampering", async (_label, targetPath) => {
    const fixture = await createFixture({ evidenceDependency: {} });
    const record = await fixture.start();
    await expect(fixture.complete(record, {
      failureInjection(phase) {
        if (phase === "registry_committed") throw new Error("hold after Registry commit");
      },
    })).rejects.toThrow(/hold after Registry commit/);
    const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    await mutateJson(targetPath(fixture, recovering!), { tampered: true });
    await expect(fixture.complete(recovering!)).rejects.toThrow(/post-commit .* drifted/i);
    expect(await readProjectHarnessWriterLock(projectHarnessSharedWriterRoot(fixture.sidecarRoot))).toMatchObject({
      ownerId: "integration-one",
    });
  });

  it("removes an unregistered long-path residual after Git worktree removal partially fails", async () => {
    const fixture = await createFixture();
    const record = await fixture.start();
    await expect(fixture.complete(record, {
      failureInjection(phase) {
        if (phase === "registry_committed") throw new Error("hold before cleanup");
      },
    })).rejects.toThrow(/hold before cleanup/);
    const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    await expireIntegrationWriter(fixture.sidecarRoot);
    const partialRemoveGit = interceptGit(async (cwd, args, next) => {
      if (args[0] !== "worktree" || args[1] !== "remove") return next(cwd, args);
      const result = await next(cwd, args);
      expect(result.exitCode).toBe(0);
      const residual = args[2]!;
      const longDirectory = join(residual, ...Array.from({ length: 12 }, (_, index) => `long-segment-${index}-${"x".repeat(20)}`));
      await mkdir(longDirectory, { recursive: true });
      await writeFile(join(longDirectory, "residual.txt"), "owned residual\n", "utf8");
      return { exitCode: 1, stdout: "", stderr: "Filename too long" };
    });

    const completed = await fixture.complete(recovering!, { git: partialRemoveGit });
    expect(completed.registry_result?.cleanup_outcome).toEqual({
      detached_links: [],
      git_remove: "failed_after_unregister",
      residual_directory_removed: true,
      worktree_registered_after: false,
    });
    expect(existsSync(integrationWorktree(fixture))).toBe(false);
  });

  it("fails closed when Git still registers the worktree after removal fails", async () => {
    const fixture = await createFixture();
    const record = await fixture.start();
    await expect(fixture.complete(record, {
      failureInjection(phase) {
        if (phase === "registry_committed") throw new Error("hold before cleanup");
      },
    })).rejects.toThrow(/hold before cleanup/);
    const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    await expireIntegrationWriter(fixture.sidecarRoot);
    const registeredFailureGit = interceptGit(async (cwd, args, next) => {
      if (args[0] === "worktree" && args[1] === "remove") {
        return { exitCode: 1, stdout: "", stderr: "simulated registered failure" };
      }
      return next(cwd, args);
    });

    await expect(fixture.complete(recovering!, { git: registeredFailureGit })).rejects.toThrow(/still registers/);
    expect(existsSync(integrationWorktree(fixture))).toBe(true);
    expect(await readProjectHarnessWriterLock(projectHarnessSharedWriterRoot(fixture.sidecarRoot))).toMatchObject({
      ownerId: "integration-one",
    });
  });

  it("rejects an unregistered residual that still contains Git metadata", async () => {
    const fixture = await createFixture();
    const record = await fixture.start();
    await expect(fixture.complete(record, {
      failureInjection(phase) {
        if (phase === "registry_committed") throw new Error("hold before cleanup");
      },
    })).rejects.toThrow(/hold before cleanup/);
    const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    await expireIntegrationWriter(fixture.sidecarRoot);
    const metadataResidualGit = interceptGit(async (cwd, args, next) => {
      if (args[0] !== "worktree" || args[1] !== "remove") return next(cwd, args);
      const result = await next(cwd, args);
      expect(result.exitCode).toBe(0);
      const residual = args[2]!;
      await mkdir(residual, { recursive: true });
      await writeFile(join(residual, ".git"), "gitdir: unexpected\n", "utf8");
      return { exitCode: 1, stdout: "", stderr: "simulated residual" };
    });

    await expect(fixture.complete(recovering!, { git: metadataResidualGit })).rejects.toThrow(/still contains \.git/);
    expect(existsSync(join(integrationWorktree(fixture), ".git"))).toBe(true);
  });

  it("rejects residual Junctions and discovery links with an unknown target", async () => {
    for (const kind of ["junction", "wrong-skill"] as const) {
      const fixture = await createFixture();
      const record = await fixture.start();
      await expect(fixture.complete(record, {
        failureInjection(phase) {
          if (phase === "registry_committed") throw new Error("hold before cleanup");
        },
      })).rejects.toThrow(/hold before cleanup/);
      const recovering = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
      const foreignTarget = join(fixture.root, `foreign-${kind}`);
      await mkdir(foreignTarget, { recursive: true });
      const link = kind === "junction"
        ? join(integrationWorktree(fixture), "unknown-junction")
        : join(integrationWorktree(fixture), ".agents", "skills", "sample-a1-harness");
      await mkdir(dirname(link), { recursive: true });
      await symlink(foreignTarget, link, process.platform === "win32" ? "junction" : "dir");
      await expireIntegrationWriter(fixture.sidecarRoot);
      await expect(fixture.complete(recovering!)).rejects.toThrow(
        kind === "junction" ? /unknown link or Junction/ : /targets another Skill/,
      );
      await rm(link, { force: true });
    }
  });

  it("rejects a recovery record whose worktree path escapes its Integration root", async () => {
    const fixture = await createFixture();
    const record = await fixture.start();
    await expect(fixture.complete(record, {
      failureInjection(phase) {
        if (phase === "registry_committed") throw new Error("hold before cleanup");
      },
    })).rejects.toThrow(/hold before cleanup/);
    const recordPath = join(fixture.skillRoot, "state", "registry", "integrations", "integration-one.json");
    const stored = JSON.parse(await readFile(recordPath, "utf8")) as { worktree_ref: { path: string } };
    stored.worktree_ref.path = "integrations/integration-one/../escape";
    await writeFile(recordPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    const corrupted = await loadProjectHarnessIntegration(fixture.skillRoot, "integration-one");
    await expect(fixture.complete(corrupted!)).rejects.toThrow(/reference is invalid|escapes/);
  });

  it("honors the shared writer and aborts only an unlanded candidate", async () => {
    const fixture = await createFixture();
    const record = await fixture.start();
    const writerRoot = projectHarnessSharedWriterRoot(fixture.sidecarRoot);
    const lock = await claimProjectHarnessWriterLock(writerRoot, {
      projectId: "sample-a1",
      ownerId: "evolution-owner",
      operation: "evolution-publish",
    });
    try {
      await expect(fixture.complete(record)).rejects.toThrow(/writer lock is already held/);
    } finally {
      await releaseProjectHarnessWriterLock(writerRoot, lock.token);
    }
    await expect(abortProjectHarnessIntegration({
      integrationId: "integration-one",
      projectId: "sample-a1",
      projectRoot: fixture.projectRoot,
      skillRoot: fixture.skillRoot,
      sidecarRoot: fixture.sidecarRoot,
      integratorId: "another-integrator",
    })).rejects.toThrow(/identity does not match/);
    const aborted = await abortProjectHarnessIntegration({
      integrationId: "integration-one",
      projectId: "sample-a1",
      projectRoot: fixture.projectRoot,
      skillRoot: fixture.skillRoot,
      sidecarRoot: fixture.sidecarRoot,
      integratorId: "integrator-one",
    });
    expect(aborted.status).toBe("aborted");
    expect(await git(fixture.projectRoot, "rev-parse", "HEAD")).toBe(fixture.baseCommit);
  });
});

async function createFixture(options: {
  completionCommit?: boolean;
  integrationDependency?: boolean;
  evidenceDependency?: {
    validationPassed?: boolean;
    evidenceComplete?: boolean;
    status?: "completed" | "active";
    classifiedChangeId?: string;
  };
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "aho-integration-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const skillRoot = join(root, "skills", "sample-a1-harness");
  const sidecarRoot = join(root, "sidecar");
  await mkdir(projectRoot, { recursive: true });
  await git(projectRoot, "init", "-b", "main");
  await git(projectRoot, "config", "user.email", "tests@example.invalid");
  await git(projectRoot, "config", "user.name", "AHO Tests");
  await writeFile(join(projectRoot, "owner.txt"), "base\n", "utf8");
  await git(projectRoot, "add", "owner.txt");
  await git(projectRoot, "commit", "-m", "base");
  const baseCommit = await git(projectRoot, "rev-parse", "HEAD");
  await git(projectRoot, "checkout", "-b", "lane-change-one");
  await writeFile(join(projectRoot, "owner.txt"), "completed change\n", "utf8");
  await git(projectRoot, "add", "owner.txt");
  await git(projectRoot, "commit", "-m", "change one");
  const completionCommit = await git(projectRoot, "rev-parse", "HEAD");
  await git(projectRoot, "checkout", "main");

  await mkdir(join(skillRoot, "state", "registry", "changes"), { recursive: true });
  await mkdir(join(skillRoot, "state", "registry", "contracts"), { recursive: true });
  await mkdir(join(skillRoot, "state", "changes", "active"), { recursive: true });
  await mkdir(join(skillRoot, "state", "changes", "parking"), { recursive: true });
  await mkdir(join(skillRoot, "state", "changes", "archive"), { recursive: true });
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: sample-a1-harness\n---\n", "utf8");
  await writeFile(join(skillRoot, "state", "manifest.json"), `${JSON.stringify({
    schema_version: "2.0",
    project_id: "sample-a1",
    project_name: "sample",
    skill_name: "sample-a1-harness",
    skill_revision: 27,
    analysis_status: "complete",
  }, null, 2)}\n`, "utf8");
  await writeFile(join(skillRoot, "state", "registry", "baseline.json"), `${JSON.stringify({
    schema_version: "1.0",
    canonical_branch: "main",
    canonical_commit: baseCommit,
    updated_at: "2026-08-03T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");
  await writeFile(join(skillRoot, "state", "registry", "changes", "change-one.json"), `${JSON.stringify({
    schema_version: "1.0",
    change_id: "change-one",
    lane_id: "lane-change-one",
    status: "completed",
    claim_token: "claim-one",
    scope: "Change one.",
    paths: ["owner.txt"],
    base_commit: baseCommit,
    completion_commit: options.completionCommit === false ? null : completionCommit,
    validation: ["tests passed"],
    validation_passed: true,
    evidence_complete: true,
    contract_required: false,
    contract_path: null,
    evidence_paths: ["state/changes/archive/change-one"],
    integrated_by: null,
    integration_status: "not_integrated",
    repository_mode: "multi_lane",
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");

  if (options.integrationDependency || options.evidenceDependency) {
    const evidence = options.evidenceDependency;
    await writeChangeRecord(skillRoot, "architecture-change", {
      status: evidence?.status ?? "completed",
      validation_passed: evidence?.validationPassed ?? true,
      evidence_complete: evidence?.evidenceComplete ?? true,
    });
    await mkdir(join(skillRoot, "state", "changes", "archive", "architecture-change"), { recursive: true });
    await writeFile(join(skillRoot, "state", "changes", "archive", "architecture-change", "summary.md"), "architecture evidence\n", "utf8");
    await writeContract(skillRoot, "change-one", {
      depends_on_changes: ["architecture-change"],
    });
  }
  if (options.evidenceDependency) {
    await writeChangeRecord(skillRoot, "dependency-correction", {});
    await mkdir(join(skillRoot, "state", "changes", "archive", "dependency-correction"), { recursive: true });
    await writeFile(join(skillRoot, "state", "changes", "archive", "dependency-correction", "summary.md"), "dependency correction\n", "utf8");
    await writeContract(skillRoot, "dependency-correction", {
      depends_on_changes: ["change-one"],
      dependency_contract_for: "change-one",
      change_dependencies: [{
        change_id: options.evidenceDependency.classifiedChangeId ?? "architecture-change",
        kind: "evidence",
        required_status: "completed",
        require_validation_passed: true,
        require_evidence_complete: true,
      }],
    });
  }

  const start = () => startProjectHarnessIntegration({
    integrationId: "integration-one",
    projectId: "sample-a1",
    projectRoot,
    skillRoot,
    sidecarRoot,
    changeIds: ["change-one"],
    integratorId: "integrator-one",
  });
  const review = (
    record: Awaited<ReturnType<typeof startProjectHarnessIntegration>>,
    overrides: { candidateCommit?: string } = {},
  ) => ({
    schema_version: "1.0" as const,
    kind: "integration-candidate-review" as const,
    integration_id: record.integration_id,
    candidate_commit: overrides.candidateCommit ?? record.candidate_commit,
    integrator_id: "integrator-one",
    reviewer_id: "independent-reviewer",
    decision: "approve" as const,
    findings: [],
    reviewed_at: "2026-08-03T04:00:00.000Z",
  });
  const complete = (
    record: Awaited<ReturnType<typeof startProjectHarnessIntegration>> | NonNullable<Awaited<ReturnType<typeof loadProjectHarnessIntegration>>>,
    overrides: {
      confirmI2?: boolean;
      review?: unknown;
      failureInjection?: (phase: "not_started" | "pre_merge" | "canonical_landed" | "registry_committed" | "worktree_cleaned" | "cleanup_complete") => void;
      git?: ProjectHarnessGitPort;
    } = {},
  ) => completeProjectHarnessIntegration({
    integrationId: "integration-one",
    projectId: "sample-a1",
    projectRoot,
    skillRoot,
    sidecarRoot,
    integratorId: "integrator-one",
    confirmI2: overrides.confirmI2 ?? true,
    validation: ["aggregate tests passed"],
    validationPassed: true,
    review: overrides.review ?? review(record),
    failureInjection: overrides.failureInjection,
  }, overrides.git);
  return { root, projectRoot, skillRoot, sidecarRoot, baseCommit, completionCommit, start, review, complete };
}

async function writeChangeRecord(
  skillRoot: string,
  changeId: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  await writeFile(join(skillRoot, "state", "registry", "changes", `${changeId}.json`), `${JSON.stringify({
    schema_version: "1.0",
    change_id: changeId,
    lane_id: `lane-${changeId}`,
    status: "completed",
    claim_token: `claim-${changeId}`,
    scope: changeId,
    paths: [],
    base_commit: null,
    completion_commit: null,
    validation: ["validated"],
    validation_passed: true,
    evidence_complete: true,
    contract_required: false,
    contract_path: null,
    evidence_paths: [`state/changes/archive/${changeId}`],
    integrated_by: null,
    integration_status: "not_integrated",
    repository_mode: "multi_lane",
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:00:00.000Z",
    ...overrides,
  }, null, 2)}\n`, "utf8");
}

async function writeContract(
  skillRoot: string,
  changeId: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  await writeFile(join(skillRoot, "state", "registry", "contracts", `${changeId}.json`), `${JSON.stringify({
    schema_version: "1.0",
    change_id: changeId,
    kind: "module_boundary",
    subject: changeId,
    operation: "test",
    owner_module: "integration",
    affected_paths: [],
    consumers: [],
    depends_on: [],
    depends_on_changes: [],
    dependency_contract_for: null,
    change_dependencies: [],
    compatibility: "test",
    status: "accepted",
    updated_at: "2026-08-03T00:00:00.000Z",
    ...overrides,
  }, null, 2)}\n`, "utf8");
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  return result.stdout.trim();
}

function integrationWorktree(fixture: { sidecarRoot: string }): string {
  return join(fixture.sidecarRoot, "integrations", "integration-one", "worktree");
}

async function expireIntegrationWriter(sidecarRoot: string): Promise<void> {
  const ownerPath = join(projectHarnessSharedWriterRoot(sidecarRoot), "writer-lock", "owner.json");
  const owner = JSON.parse(await readFile(ownerPath, "utf8")) as Record<string, unknown>;
  owner.expiresAt = "2000-01-01T00:00:00.000Z";
  await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, "utf8");
}

async function mutateJson(path: string, patch: Record<string, unknown>): Promise<void> {
  const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeFile(path, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`, "utf8");
}

type GitInterceptor = (
  cwd: string,
  args: readonly string[],
  next: (cwd: string, args: readonly string[]) => Promise<Awaited<ReturnType<ProjectHarnessGitPort["run"]>>>,
) => Promise<Awaited<ReturnType<ProjectHarnessGitPort["run"]>>>;

function interceptGit(interceptor: GitInterceptor): ProjectHarnessGitPort {
  const run = async (cwd: string, args: readonly string[]) => {
    try {
      const result = await execFileAsync("git", [...args], {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      return {
        exitCode: typeof failure.code === "number" ? failure.code : 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
      };
    }
  };
  return {
    run(cwd, args) {
      return interceptor(cwd, args, run);
    },
  };
}
