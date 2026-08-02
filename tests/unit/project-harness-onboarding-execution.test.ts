import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderCapabilitySnapshot } from "../../src/provider-runtime/index.js";
import { ensureProjectHarnessOnboardingWorkspace } from "../../src/project-harness/onboarding.js";
import { initializeProjectRuntimeSidecar } from "../../src/project-runtime/lifecycle.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { WorkbenchProjectHarnessOnboardingExecutionStore } from "../../src/workbench/project-harness-onboarding-execution.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Workbench project Harness onboarding execution evidence", () => {
  it("binds the Main attempt to the bundle root and the independent Auditor to the review file", async () => {
    const fixture = await createFixture();
    await createAttempt(fixture, "main-1", "main-agent", "main", "running");
    await createAttempt(fixture, "audit-1", "auditor-agent", "auditor", "running");

    const main = await fixture.store.assign({ attemptId: "main-1", roleId: "main-agent" });
    const auditor = await fixture.store.assign({ attemptId: "audit-1", roleId: "auditor-agent" });
    await completeAttempt(fixture, "audit-1");

    expect(main.artifactPath).toBe(fixture.workspace.bundleRoot);
    expect(auditor.artifactPath).toBe(fixture.workspace.reviewPath);
    await expect(fixture.store.verify({
      projectId: fixture.projectId,
      attemptId: "main-1",
      requiredRole: "main-agent",
      artifactPath: fixture.workspace.bundleRoot,
    })).resolves.toEqual(main);
    await expect(fixture.store.verify({
      projectId: fixture.projectId,
      attemptId: "audit-1",
      requiredRole: "auditor-agent",
      artifactPath: fixture.workspace.reviewPath,
    })).resolves.toEqual(auditor);
  });

  it("rejects role substitution, stale attempts, and caller-selected artifact paths", async () => {
    const fixture = await createFixture();
    await createAttempt(fixture, "main-1", "main-agent", "main", "running");
    await createAttempt(fixture, "failed-audit", "auditor-agent", "auditor", "failed");
    await fixture.store.assign({ attemptId: "main-1", roleId: "main-agent" });

    await expect(fixture.store.assign({ attemptId: "main-1", roleId: "auditor-agent" }))
      .rejects.toThrow(/wrong role/);
    await expect(fixture.store.assign({ attemptId: "failed-audit", roleId: "auditor-agent" }))
      .rejects.toThrow(/wrong role/);
    await expect(fixture.store.verify({
      projectId: fixture.projectId,
      attemptId: "main-1",
      requiredRole: "main-agent",
      artifactPath: fixture.workspace.reviewPath,
    })).rejects.toThrow(/artifact assignment/);
  });

  it("rejects cross-project and forged sidecar execution evidence", async () => {
    const fixture = await createFixture();
    await createAttempt(fixture, "main-1", "main-agent", "main", "running");
    await fixture.store.assign({ attemptId: "main-1", roleId: "main-agent" });

    await expect(fixture.store.verify({
      projectId: "another-project",
      attemptId: "main-1",
      requiredRole: "main-agent",
      artifactPath: fixture.workspace.bundleRoot,
    })).rejects.toThrow(/another project/);

    const evidenceId = createHash("sha256").update("main-1").digest("hex");
    await writeFile(join(
      fixture.paths.sidecarRoot,
      "onboarding",
      "executions",
      `${evidenceId}.json`,
    ), `${JSON.stringify({
      schema_version: "1.0",
      project_id: fixture.projectId,
      attempt_id: "main-1",
      role_id: "main-agent",
      artifact: { owner: "runtime-sidecar", path: "../project-source" },
      assigned_at: "2026-08-03T00:00:00.000Z",
    })}\n`, "utf8");

    await expect(fixture.store.verify({
      projectId: fixture.projectId,
      attemptId: "main-1",
      requiredRole: "main-agent",
      artifactPath: fixture.workspace.bundleRoot,
    })).rejects.toThrow(/unsafe segment/);
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "aho-onboarding-execution-"));
  cleanup.push(root);
  const projectId = "sample-a1";
  const projectRoot = join(root, "project");
  const paths = resolveProjectRuntimePaths(projectId, join(root, "aho-home"));
  await mkdir(projectRoot);
  await initializeProjectRuntimeSidecar(paths);
  const workspace = await ensureProjectHarnessOnboardingWorkspace(projectId, projectRoot, paths.sidecarRoot);
  return {
    projectId,
    projectRoot,
    paths,
    workspace,
    store: new WorkbenchProjectHarnessOnboardingExecutionStore(projectId, projectRoot, paths),
  };
}

async function createAttempt(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  attemptId: string,
  roleId: string,
  operationProfile: string,
  status: "running" | "completed" | "failed",
): Promise<void> {
  const database = await openProjectRuntimeWorkbenchDatabase(fixture.paths);
  try {
    database.providerAttempts.createProviderAttempt({
      projectId: fixture.projectId,
      conversationId: null,
      attemptId,
      graphScopeId: null,
      changeId: null,
      agentTaskId: null,
      roleId,
      operationProfile,
      providerId: "codex",
      nativeSessionId: null,
      model: null,
      capabilitySnapshot: { providerId: "codex", effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
      handoffHash: "onboarding",
      deliveredThroughCompletedTurn: 0,
      worktreeId: null,
      status,
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
  } finally {
    database.close();
  }
}

async function completeAttempt(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  attemptId: string,
): Promise<void> {
  const database = await openProjectRuntimeWorkbenchDatabase(fixture.paths);
  try {
    database.providerAttempts.completeProviderAttempt(
      fixture.projectId,
      attemptId,
      "completed",
      null,
      "2026-08-03T00:01:00.000Z",
    );
  } finally {
    database.close();
  }
}
