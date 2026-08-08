import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  abortProjectHarnessIntegration,
  completeProjectHarnessIntegration,
  loadProjectHarnessIntegration,
  startProjectHarnessIntegration,
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
    expect(record.candidate_commit).not.toBe(fixture.completionCommit);
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
      failureInjection?: (phase: "not_started" | "pre_merge" | "canonical_landed" | "registry_committed" | "cleanup_complete") => void;
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
  });
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
