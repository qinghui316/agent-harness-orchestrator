import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectWorktreeDiff } from "../audit/diff.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitCommit } from "../project/git.js";
import { getGlobalWorktreeCheckoutRoot } from "../worktree/manager.js";
import type { ManagedProject } from "../types/index.js";
import { runAggregateAudit } from "./aggregate-audit.js";
import { runAggregateValidation } from "./aggregate-validation.js";
import { integrationArtifact, latestArtifactAbsolutePath, messageFromIssues } from "./artifacts.js";
import { buildIntegrationCheckId, collectReadyTargets } from "./candidates.js";
import { runIntegrationFixAttempt, type IntegrationFixRepairRunner } from "./fix-attempts.js";
import { integrationCheckRoot, displayArtifactPath } from "./paths.js";
import { prepareIntegrationCheckout } from "./patch-workspace.js";
import { appendIntegrationEvent, writeCheckArtifacts } from "./repository.js";
import type { IntegrationArtifact, IntegrationCheckResult, IntegrationCheckStatus, IntegrationFixAttempt } from "./types.js";

export interface RunIntegrationCheckOptions {
  repairRunner?: IntegrationFixRepairRunner;
}

export async function runIntegrationCheck(project: ManagedProject, worktreeIds?: string[], expectedChangeId?: string, options: RunIntegrationCheckOptions = {}): Promise<IntegrationCheckResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Integration check");
  const sourceHead = await getGitCommit(project.path);
  const targets = await collectReadyTargets(project, memory, worktreeIds, expectedChangeId);
  if (targets.length < 2) {
    throw new Error("Integration check requires at least two ready results.");
  }

  const id = buildIntegrationCheckId(targets);
  const root = integrationCheckRoot(memory);
  const directory = join(root, id);
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(memory.projectId ?? project.id), "integration", id);
  const artifactRefs = [
    displayArtifactPath(memory, join(directory, "integration-check.json")),
    displayArtifactPath(memory, join(directory, "summary.md")),
    displayArtifactPath(memory, join(directory, "combined.patch")),
    displayArtifactPath(memory, join(directory, "aggregate-validation.json")),
    displayArtifactPath(memory, join(directory, "aggregate-audit.json")),
  ];
  await mkdir(directory, { recursive: true });

  const targetDiffs = await Promise.all(targets.map(async (target) => {
    const diff = await collectWorktreeDiff(memory, target.worktreeId, target.changeId);
    return { target, diff: diff.diff };
  }));
  const patches = targetDiffs.map((item) => item.diff);
  const combinedPatch = patches.join("\n");
  const combinedPatchPath = join(directory, "combined.patch");
  await writeFile(combinedPatchPath, combinedPatch, "utf8");
  const artifacts: IntegrationArtifact[] = [integrationArtifact(memory, combinedPatchPath, combinedPatch, "combined", "integration-check")];
  let status: IntegrationCheckStatus = "passed";
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const fixAttempts: IntegrationFixAttempt[] = [];
  const startedAt = new Date().toISOString();
  let summary = "兼容性检查通过：这些结果可以一起应用。";

  try {
    await prepareIntegrationCheckout(project, checkoutPath, combinedPatchPath);
    for (const item of targetDiffs) {
      await writeFile(join(directory, `${item.target.worktreeId}.patch`), item.diff, "utf8");
      await appendIntegrationEvent(directory, id, "integration-check.target-included", { worktreeId: item.target.worktreeId, changeId: item.target.changeId });
    }
  } catch (cause) {
    status = "conflict";
    const message = cause instanceof Error ? cause.message : String(cause);
    blockingIssues.push(message);
    summary = "兼容性检查未通过，已尝试自动修复组合问题。";
    await writeFile(join(directory, "stderr.log"), `${message}\n`, "utf8");
  }

  let latestArtifact = artifacts[0] as IntegrationArtifact;
  if (status === "conflict") {
    const fix = await runIntegrationFixAttempt(project, directory, id, combinedPatchPath, messageFromIssues(blockingIssues), { repairRunner: options.repairRunner, changeId: targets[0]?.changeId });
    fixAttempts.push(fix.attempt);
    if (fix.artifact) {
      artifacts.push(fix.artifact);
      latestArtifact = fix.artifact;
      status = "passed";
      blockingIssues.length = 0;
      summary = "兼容性检查未通过后已自动修复组合结果，并重新生成可验证的组合补丁。";
      await prepareIntegrationCheckout(project, checkoutPath, latestArtifactAbsolutePath(directory, latestArtifact));
    }
  }

  let aggregateValidation = await runAggregateValidation(memory, directory, id, checkoutPath, status === "passed");
  if (status === "passed" && aggregateValidation.status !== "passed") {
    status = "validation-failed";
    blockingIssues.push(aggregateValidation.stderr || aggregateValidation.stdout || "Aggregate validation failed.");
    const fix = await runIntegrationFixAttempt(project, directory, id, latestArtifactAbsolutePath(directory, latestArtifact), "aggregate validation failed", { repairRunner: options.repairRunner, changeId: targets[0]?.changeId });
    fixAttempts.push(fix.attempt);
    if (fix.artifact) {
      artifacts.push(fix.artifact);
      latestArtifact = fix.artifact;
      await prepareIntegrationCheckout(project, checkoutPath, latestArtifactAbsolutePath(directory, latestArtifact));
      const fixedValidation = await runAggregateValidation(memory, directory, id, checkoutPath, true);
      aggregateValidation = fixedValidation;
      if (fixedValidation.status === "passed") {
        status = "passed";
        blockingIssues.length = 0;
        summary = "组合验证失败后已自动修复，并重新通过验证和审查。";
      }
    }
  }
  let aggregateAudit = await runAggregateAudit(memory, directory, id, checkoutPath, status === "passed", blockingIssues);
  if (status === "passed" && aggregateAudit.status !== "approved") {
    status = "audit-failed";
    blockingIssues.push(...aggregateAudit.findings);
    const fix = await runIntegrationFixAttempt(project, directory, id, latestArtifactAbsolutePath(directory, latestArtifact), "aggregate audit failed", { repairRunner: options.repairRunner, changeId: targets[0]?.changeId });
    fixAttempts.push(fix.attempt);
    if (fix.artifact) {
      artifacts.push(fix.artifact);
      latestArtifact = fix.artifact;
      await prepareIntegrationCheckout(project, checkoutPath, latestArtifactAbsolutePath(directory, latestArtifact));
      aggregateValidation = await runAggregateValidation(memory, directory, id, checkoutPath, true);
      aggregateAudit = await runAggregateAudit(memory, directory, id, checkoutPath, aggregateValidation.status === "passed", aggregateValidation.status === "passed" ? [] : [aggregateValidation.stderr || aggregateValidation.stdout || "Aggregate validation failed."]);
      if (aggregateValidation.status === "passed" && aggregateAudit.status === "approved") {
        status = "passed";
        blockingIssues.length = 0;
        summary = "组合审查失败后已自动修复，并重新通过验证和审查。";
      }
    }
  }

  if (status !== "passed" && status !== "conflict" && status !== "validation-failed" && status !== "audit-failed") {
    summary = "兼容性检查没有通过，需要处理后再应用。";
  } else if (status !== "passed") {
    summary = "兼容性检查没有通过，自动修复未能产出可应用结果。";
  }

  const check = {
    version: "1.0" as const,
    id,
    projectId: memory.projectId,
    status,
    resultTargets: targets,
    sourceHead,
    createdAt: startedAt,
    finishedAt: new Date().toISOString(),
    summary,
    riskSummary: status === "passed"
      ? "检查只验证这些结果能在当前项目状态上组合应用；最终修改源码仍需要你确认。"
      : "需要先修改其中一个结果，或放弃本次组合应用。",
    artifactRefs,
    artifacts,
    latestArtifactHash: status === "passed" ? latestArtifact.hash : undefined,
    latestArtifactRef: status === "passed" ? latestArtifact.path : undefined,
    aggregateValidation,
    aggregateAudit,
    fixAttempts,
    integrationWorktreePath: checkoutPath,
    blockingIssues,
    warnings,
  };
  await writeCheckArtifacts(memory, directory, check);
  await appendIntegrationEvent(directory, id, status === "passed" ? "integration-check.passed" : "integration-check.failed", { status, blockingIssues });
  return { check, artifactDirectory: directory };
}
