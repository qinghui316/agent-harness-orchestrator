import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitCommit, git, isGitDirty } from "../project/git.js";
import { withProjectWriteLease } from "../project/project-write-lease.js";
import { buildRunId } from "../run/manager.js";
import { markWorktreeApplied } from "../worktree/manager.js";
import type { ManagedProject } from "../types/index.js";
import { contentHash, latestArtifactAbsolutePath, latestArtifactForApply } from "./artifacts.js";
import { integrationCheckRoot } from "./paths.js";
import { appendIntegrationEvent, readIntegrationCheck, writeCheckArtifacts } from "./repository.js";
import type { IntegrationCheckRecord, IntegrationCheckResult } from "./types.js";

const DISCARDABLE_INTEGRATION_CHECK_STATUSES = new Set<IntegrationCheckRecord["status"]>([
  "passed",
  "conflict",
  "validation-failed",
  "audit-failed",
  "stale-result",
  "failed",
]);

export async function applyIntegrationCheck(project: ManagedProject, applyCheckId: string, expectedArtifactHash?: string): Promise<IntegrationCheckResult> {
  return withProjectWriteLease(project.path, {}, async (lease) =>
    applyIntegrationCheckWithLease(project, applyCheckId, expectedArtifactHash, lease),
  );
}

async function applyIntegrationCheckWithLease(
  project: ManagedProject,
  applyCheckId: string,
  expectedArtifactHash: string | undefined,
  lease: Parameters<Parameters<typeof withProjectWriteLease>[2]>[0],
): Promise<IntegrationCheckResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Integration check apply");
  const directory = join(integrationCheckRoot(memory), applyCheckId);
  const check = await readIntegrationCheck(memory, applyCheckId);
  if (check.status !== "passed") {
    throw new Error(`Cannot apply integration check ${applyCheckId}: status is ${check.status}.`);
  }
  if ((await isGitDirty(project.path)) === true) {
    throw new Error("Cannot apply integration check: project has uncommitted local changes.");
  }
  const currentHead = await getGitCommit(project.path);
  if (currentHead !== check.sourceHead) {
    throw new Error("Cannot apply integration check: project changed after the check. Re-run compatibility check first.");
  }
  if (!check.latestArtifactHash || !check.latestArtifactRef) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: missing passed integration artifact.`);
  }
  if (expectedArtifactHash && expectedArtifactHash !== check.latestArtifactHash) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: selected integration artifact is stale.`);
  }
  if (check.aggregateValidation?.status !== "passed" || check.aggregateAudit?.status !== "approved") {
    throw new Error(`Cannot apply integration check ${applyCheckId}: aggregate validation/audit evidence is not passed.`);
  }
  const latestArtifact = latestArtifactForApply(check);
  if (!latestArtifact || latestArtifact.hash !== check.latestArtifactHash) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: latest artifact hash mismatch.`);
  }
  const patchPath = latestArtifactAbsolutePath(directory, latestArtifact);
  if (!existsSync(patchPath)) throw new Error(`Missing integration patch: ${patchPath}`);
  const patchText = await readFile(patchPath, "utf8");
  const actualHash = contentHash(patchText);
  if (actualHash !== latestArtifact.hash) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: integration artifact changed on disk.`);
  }

  const runId = buildRunId(check.resultTargets[0]?.changeId ?? "integration-check", ["integration-apply", applyCheckId]);
  await appendIntegrationEvent(directory, applyCheckId, "integration-check.apply.started", { runId });
  await lease.heartbeat();
  await git(project.path, ["apply", "--binary", patchPath]);
  const after = await getGitCommit(project.path);
  for (const target of check.resultTargets) {
    await markWorktreeApplied(memory, target.worktreeId, {
      applyRunId: runId,
      worktreeDiffHash: target.diffHash,
      appliedCommit: after ?? undefined,
    });
  }
  const applied: IntegrationCheckRecord = {
    ...check,
    status: "applied",
    appliedAt: new Date().toISOString(),
    summary: latestArtifact.kind === "repaired"
      ? "已将自动修复并通过检查的组合结果应用到项目。"
      : "已将通过兼容性检查的结果应用到项目。",
  };
  await lease.assertCurrent();
  await writeCheckArtifacts(memory, directory, applied);
  await appendIntegrationEvent(directory, applyCheckId, "integration-check.apply.completed", { runId });
  return { check: applied, artifactDirectory: directory };
}

export async function discardIntegrationCheck(project: ManagedProject, applyCheckId: string): Promise<IntegrationCheckResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Integration check discard");
  const directory = join(integrationCheckRoot(memory), applyCheckId);
  const check = await readIntegrationCheck(memory, applyCheckId);
  if (!DISCARDABLE_INTEGRATION_CHECK_STATUSES.has(check.status)) {
    throw new Error(`Cannot discard integration check ${applyCheckId}: status is ${check.status}.`);
  }
  const discarded: IntegrationCheckRecord = {
    ...check,
    status: "discarded",
    finishedAt: new Date().toISOString(),
    summary: "已放弃这次组合应用检查结果，项目源码未修改。",
  };
  await writeCheckArtifacts(memory, directory, discarded);
  await appendIntegrationEvent(directory, applyCheckId, "integration-check.discarded", {});
  return { check: discarded, artifactDirectory: directory };
}
