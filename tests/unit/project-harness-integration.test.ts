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

async function createFixture(options: { completionCommit?: boolean } = {}) {
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

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  return result.stdout.trim();
}
