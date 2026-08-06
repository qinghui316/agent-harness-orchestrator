import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectWorktreeDiff } from "../audit/diff.js";
import { getGitCommit } from "../project/git.js";
import { resolveProjectActiveExecutionScope } from "../project-runtime/active-execution-scope.js";
import type { ProjectCodeExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import type { ManagedProject } from "../types/index.js";
import { getGlobalWorktreeCheckoutRoot } from "../worktree/manager.js";
import { runSkillNativeAggregateAudit } from "./aggregate-audit.js";
import { runSkillNativeAggregateValidation } from "./aggregate-validation.js";
import {
  latestArtifactAbsolutePath,
  messageFromIssues,
  skillNativeIntegrationArtifact,
} from "./artifacts.js";
import { buildIntegrationCheckId, collectSkillNativeReadyTargets } from "./candidates.js";
import {
  runSkillNativeIntegrationFixAttempt,
  type SkillNativeIntegrationFixRepairRunner,
} from "./fix-attempts.js";
import { displaySkillNativeArtifactPath, integrationCheckRoot } from "./paths.js";
import { prepareSkillNativeIntegrationCheckout } from "./patch-workspace.js";
import { appendIntegrationEvent, writeCheckArtifacts } from "./repository.js";
import type {
  IntegrationArtifact,
  IntegrationCheckResult,
  IntegrationCheckStatus,
  IntegrationFixAttempt,
  SkillNativeIntegrationCheckTarget,
} from "./types.js";

export interface RunIntegrationCheckOptions {
  repairRunner?: SkillNativeIntegrationFixRepairRunner;
}

export type RunSkillNativeIntegrationCheckOptions = RunIntegrationCheckOptions;

export async function runIntegrationCheck(
  project: ManagedProject,
  worktreeIds?: string[],
  expectedChangeId?: string,
  options: RunIntegrationCheckOptions = {},
): Promise<IntegrationCheckResult> {
  const scope = await resolveProjectActiveExecutionScope(project, expectedChangeId);
  const changeId = scope.harness.planning.change.change_id;
  const targets = await collectSkillNativeReadyTargets(
    project,
    scope.runtime,
    scope.harness,
    worktreeIds,
    changeId,
  );
  return runSkillNativeIntegrationCheck(project, scope.runtime, targets, changeId, options);
}

export async function runSkillNativeIntegrationCheck(
  project: ManagedProject,
  runtime: ProjectCodeExecutionRuntimePort,
  targets: SkillNativeIntegrationCheckTarget[],
  expectedChangeId: string,
  options: RunSkillNativeIntegrationCheckOptions = {},
): Promise<IntegrationCheckResult> {
  if (project.id !== runtime.projectId) throw new Error("Skill-native IntegrationCheck project scope mismatch.");
  if (targets.length < 2) throw new Error("Integration check requires at least two ready results.");
  if (new Set(targets.map((target) => target.worktreeId)).size !== targets.length) {
    throw new Error("Skill-native IntegrationCheck target worktrees must be unique.");
  }
  if (targets.some((target) => target.changeId !== expectedChangeId)) {
    throw new Error("Integration check targets must belong to the requested Change.");
  }

  const sourceHead = await getGitCommit(project.path);
  const id = buildIntegrationCheckId(targets);
  const directory = join(integrationCheckRoot(runtime), id);
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(runtime.projectId), "integration", id);
  const artifactRefs = [
    "integration-check.json",
    "summary.md",
    "combined.patch",
    "aggregate-validation.json",
    "aggregate-audit.json",
  ].map((name) => displaySkillNativeArtifactPath(runtime, join(directory, name)));
  await mkdir(directory, { recursive: true });

  const targetDiffs = await Promise.all(targets.map(async (target) => {
    const diff = await collectWorktreeDiff(runtime, target.worktreeId, target.changeId);
    if (diff.diffHash !== target.diffHash
      || diff.diffStat !== target.diffStat
      || (sourceHead ?? null) !== (target.sourceHead ?? null)) {
      throw new Error(`Skill-native IntegrationCheck target evidence drifted: ${target.worktreeId}.`);
    }
    return { target, diff: diff.diff };
  }));
  const combinedPatch = targetDiffs.map((item) => item.diff).join("\n");
  const combinedPatchPath = join(directory, "combined.patch");
  await writeFile(combinedPatchPath, combinedPatch, "utf8");
  const artifacts: IntegrationArtifact[] = [
    skillNativeIntegrationArtifact(runtime, combinedPatchPath, combinedPatch, "combined", "integration-check"),
  ];
  let status: IntegrationCheckStatus = "passed";
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const fixAttempts: IntegrationFixAttempt[] = [];
  const startedAt = new Date().toISOString();
  let summary = "兼容性检查通过：这些结果可以一起应用。";
  let latestArtifact = artifacts[0]!;

  try {
    await prepareSkillNativeIntegrationCheckout(project, runtime, checkoutPath, combinedPatchPath);
    for (const item of targetDiffs) {
      await writeFile(join(directory, `${item.target.worktreeId}.patch`), item.diff, "utf8");
      await appendIntegrationEvent(directory, id, "integration-check.target-included", {
        worktreeId: item.target.worktreeId,
        changeId: item.target.changeId,
      });
    }
  } catch (cause) {
    status = "conflict";
    const message = cause instanceof Error ? cause.message : String(cause);
    blockingIssues.push(message);
    summary = "兼容性检查没有通过，需要修改其中一个结果后重试。";
    await writeFile(join(directory, "stderr.log"), `${message}\n`, "utf8");
  }

  if (status === "conflict" && options.repairRunner) {
    const fix = await runSkillNativeIntegrationFixAttempt(
      project,
      runtime,
      directory,
      id,
      combinedPatchPath,
      messageFromIssues(blockingIssues),
      { repairRunner: options.repairRunner, changeId: expectedChangeId },
    );
    fixAttempts.push(fix.attempt);
    if (fix.artifact) {
      artifacts.push(fix.artifact);
      latestArtifact = fix.artifact;
      status = "passed";
      blockingIssues.length = 0;
      summary = "兼容性检查未通过后已修复组合结果，并重新生成可验证的组合补丁。";
      await prepareSkillNativeIntegrationCheckout(
        project,
        runtime,
        checkoutPath,
        latestArtifactAbsolutePath(directory, latestArtifact),
      );
    }
  }

  let aggregateValidation = await runSkillNativeAggregateValidation(
    runtime,
    directory,
    id,
    checkoutPath,
    status === "passed",
  );
  if (status === "passed" && aggregateValidation.status !== "passed") {
    status = "validation-failed";
    blockingIssues.push(aggregateValidation.stderr || aggregateValidation.stdout || "Aggregate validation failed.");
    summary = "组合验证没有通过，需要修改结果后重试。";
    if (options.repairRunner) {
      const fix = await runSkillNativeIntegrationFixAttempt(
        project,
        runtime,
        directory,
        id,
        latestArtifactAbsolutePath(directory, latestArtifact),
        "aggregate validation failed",
        { repairRunner: options.repairRunner, changeId: expectedChangeId },
      );
      fixAttempts.push(fix.attempt);
      if (fix.artifact) {
        artifacts.push(fix.artifact);
        latestArtifact = fix.artifact;
        await prepareSkillNativeIntegrationCheckout(
          project,
          runtime,
          checkoutPath,
          latestArtifactAbsolutePath(directory, latestArtifact),
        );
        aggregateValidation = await runSkillNativeAggregateValidation(runtime, directory, id, checkoutPath, true);
        if (aggregateValidation.status === "passed") {
          status = "passed";
          blockingIssues.length = 0;
          summary = "组合验证失败后已修复，并重新通过验证和审查。";
        }
      }
    }
  }
  let aggregateAudit = await runSkillNativeAggregateAudit(
    runtime,
    directory,
    id,
    checkoutPath,
    status === "passed",
    blockingIssues,
  );
  if (status === "passed" && aggregateAudit.status !== "approved") {
    status = "audit-failed";
    blockingIssues.push(...aggregateAudit.findings);
    summary = "组合审查没有通过，需要修改结果后重试。";
    if (options.repairRunner) {
      const fix = await runSkillNativeIntegrationFixAttempt(
        project,
        runtime,
        directory,
        id,
        latestArtifactAbsolutePath(directory, latestArtifact),
        "aggregate audit failed",
        { repairRunner: options.repairRunner, changeId: expectedChangeId },
      );
      fixAttempts.push(fix.attempt);
      if (fix.artifact) {
        artifacts.push(fix.artifact);
        latestArtifact = fix.artifact;
        await prepareSkillNativeIntegrationCheckout(
          project,
          runtime,
          checkoutPath,
          latestArtifactAbsolutePath(directory, latestArtifact),
        );
        aggregateValidation = await runSkillNativeAggregateValidation(runtime, directory, id, checkoutPath, true);
        aggregateAudit = await runSkillNativeAggregateAudit(
          runtime,
          directory,
          id,
          checkoutPath,
          aggregateValidation.status === "passed",
          aggregateValidation.status === "passed"
            ? []
            : [aggregateValidation.stderr || aggregateValidation.stdout || "Aggregate validation failed."],
        );
        if (aggregateValidation.status === "passed" && aggregateAudit.status === "approved") {
          status = "passed";
          blockingIssues.length = 0;
          summary = "组合审查失败后已修复，并重新通过验证和审查。";
        }
      }
    }
  }

  const check = {
    version: "1.0" as const,
    id,
    projectId: runtime.projectId,
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
  await writeCheckArtifacts(runtime, directory, check);
  await appendIntegrationEvent(
    directory,
    id,
    status === "passed" ? "integration-check.passed" : "integration-check.failed",
    { status, blockingIssues },
  );
  return { check, artifactDirectory: directory };
}
