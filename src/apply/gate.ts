import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { collectWorktreeDiff } from "../audit/diff.js";
import { listAuditResults } from "../audit/artifacts.js";
import { getGitCommit, isGitDirty } from "../project/git.js";
import { listValidationResults } from "../validation/artifacts.js";
import { getWorktreeStatus } from "../worktree/manager.js";
import type { AuditResult, ChangeStatus, ManagedProject, ValidationResult } from "../types/index.js";
import type { ProjectExecutionRuntimePort, ProjectHarnessExecutionPort } from "../project-runtime/execution-ports.js";
import type { WorktreeDiffPort } from "../audit/diff.js";
import type { ApplyReadinessClassification, WorktreeGateState } from "./types.js";

export function canAutoAcceptAuditForApply(gate: WorktreeGateState): boolean {
  if (!gate.audit || (gate.audit.status !== "approved" && gate.audit.status !== "approved-with-notes")) return false;
  if (!gate.validation || gate.validation.status !== "passed") return false;
  const autoAcceptableIssues = gate.blockingIssues.filter((issue) => {
    return issue.includes("reviews/review.md does not reference an accepted Audit ID")
      || /^reviews\/review\.md accepts audit .+ not latest matching audit .+\.$/.test(issue);
  });
  return gate.blockingIssues.length > 0 && autoAcceptableIssues.length === gate.blockingIssues.length;
}

export function canApplyResultFromGate(gate: WorktreeGateState): boolean {
  return gate.ready || canAutoAcceptAuditForApply(gate);
}

export function classifyApplyReadiness(gate: WorktreeGateState): ApplyReadinessClassification {
  if (canApplyResultFromGate(gate)) {
    return { kind: "ready", message: "可以应用到项目", primaryAction: "apply" };
  }
  if (gate.blockingIssues.some((issue) => issue.includes("Source repo has uncommitted changes"))) {
    return { kind: "dirty-source", message: "项目里有未处理的本地改动，暂时不能应用。", primaryAction: "refresh-status" };
  }
  if (gate.sourceHead !== gate.worktree.baseCommit) {
    return { kind: "source-drift", message: "项目已变化，需要重新处理这个结果。", primaryAction: "refresh-rework" };
  }
  if (!gate.validation) {
    return { kind: "stale-validation", message: "验证证据缺失或已过期，需要重新验证。", primaryAction: "revalidate" };
  }
  if (gate.validation.status !== "passed") {
    return { kind: "not-approved", message: "验证未通过，需要修改后再应用。", primaryAction: "request-changes" };
  }
  if (!gate.audit) {
    return { kind: "stale-audit", message: "审查证据缺失或已过期，需要重新审查。", primaryAction: "reaudit" };
  }
  if (gate.audit.status !== "approved" && gate.audit.status !== "approved-with-notes") {
    return { kind: "not-approved", message: "审查未通过，需要修改或补证据。", primaryAction: "request-changes" };
  }
  return { kind: "not-approved", message: "结果证据还不完整，暂时不能应用。", primaryAction: "request-changes" };
}

export async function evaluateSkillNativeApplyGate(
  project: ManagedProject,
  runtime: ProjectExecutionRuntimePort,
  harness: ProjectHarnessExecutionPort,
  worktreeId: string,
): Promise<WorktreeGateState> {
  const gate = await evaluateSkillNativeCandidateGate(project, runtime, harness, worktreeId);
  const blockingIssues = [...gate.blockingIssues];
  const reviewAuditId = await readAcceptedReviewAuditId(harness.evidenceRoot);
  if (!reviewAuditId) {
    blockingIssues.push("reviews/review.md does not reference an accepted Audit ID.");
  } else if (gate.audit && reviewAuditId !== gate.audit.id) {
    blockingIssues.push(`reviews/review.md accepts audit ${reviewAuditId}, not latest matching audit ${gate.audit.id}.`);
  }
  return {
    ...gate,
    ready: blockingIssues.length === 0,
    blockingIssues,
    reviewAuditId,
  };
}

export async function evaluateSkillNativeCandidateGate(
  project: ManagedProject,
  runtime: ProjectExecutionRuntimePort,
  harness: ProjectHarnessExecutionPort,
  worktreeId: string,
): Promise<WorktreeGateState> {
  return evaluateCandidateGateForStatus(project, runtime, harness.changeStatus, worktreeId);
}

export function worktreeApplyManifestHash(gate: WorktreeGateState): string {
  return createHash("sha256").update(JSON.stringify({
    changeId: gate.changeId,
    worktreeId: gate.worktree.worktreeId,
    diffHash: gate.diffHash,
    changedPaths: gate.changedPaths,
    expectedTree: gate.expectedTree,
    sourceHead: gate.sourceHead,
    validationId: gate.validation?.id ?? null,
    auditId: gate.audit?.id ?? null,
    reviewAuditId: gate.reviewAuditId,
  })).digest("hex");
}

async function evaluateCandidateGateForStatus(
  project: ManagedProject,
  memory: WorktreeDiffPort,
  status: ChangeStatus,
  worktreeId: string,
): Promise<WorktreeGateState> {
  const worktree = await getWorktreeStatus(memory, worktreeId);
  const changeId = worktree.changeId;
  if (!status.change || status.change.id !== changeId) {
    throw new Error(`Cannot evaluate apply gate: demand conversation is not active: ${changeId}.`);
  }
  const diff = await collectWorktreeDiff(memory, worktreeId, changeId);
  const sourceHead = await getGitCommit(project.path);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  if (diff.worktree.status === "applied") blockingIssues.push(`Worktree is already applied: ${worktreeId}.`);
  if (!diff.diff.trim()) blockingIssues.push("Worktree has no diff to apply.");
  if ((await isGitDirty(project.path)) === true) blockingIssues.push("Source repo has uncommitted changes; apply requires a clean source repo.");
  if (sourceHead !== diff.worktree.baseCommit) {
    blockingIssues.push(`Source HEAD drifted from worktree base commit. Expected ${diff.worktree.baseCommit}; found ${sourceHead ?? "unknown"}.`);
  }

  const validation = await findLatestValidation(memory, changeId, worktreeId, diff.diffHash);
  if (!validation) {
    blockingIssues.push("No passed validation found for the current worktree diff hash.");
  } else if (validation.status !== "passed") {
    blockingIssues.push(`Latest matching validation failed: ${validation.id}.`);
  }

  const audit = await findLatestAudit(memory, changeId, worktreeId, diff.diffHash);
  if (!audit) {
    blockingIssues.push("No approved audit found for the current worktree diff hash.");
  } else if (audit.status !== "approved" && audit.status !== "approved-with-notes") {
    blockingIssues.push(`Latest matching audit is not approved: ${audit.id} (${audit.status}).`);
  }

  return {
    ready: blockingIssues.length === 0,
    warnings,
    blockingIssues,
    changeId,
    worktree: diff.worktree,
    diffHash: diff.diffHash,
    diffStat: diff.diffStat,
    changedPaths: diff.changedPaths,
    expectedTree: diff.expectedTree,
    validation,
    audit,
    reviewAuditId: null,
    sourceHead,
  };
}

async function findLatestValidation(memory: WorktreeDiffPort, changeId: string, worktreeId: string, diffHash: string): Promise<ValidationResult | null> {
  return (await listValidationResults(memory, changeId)).find((item) => item.worktreeId === worktreeId && item.worktreeDiffHash === diffHash) ?? null;
}

async function findLatestAudit(memory: WorktreeDiffPort, changeId: string, worktreeId: string, diffHash: string): Promise<AuditResult | null> {
  return (await listAuditResults(memory, changeId)).find((item) => item.worktreeId === worktreeId && item.worktreeDiffHash === diffHash) ?? null;
}

async function readAcceptedReviewAuditId(evidenceRoot: string | null): Promise<string | null> {
  if (!evidenceRoot) return null;
  const reviewPath = join(evidenceRoot, "reviews", "review.md");
  if (!existsSync(reviewPath)) return null;
  const content = await readFile(reviewPath, "utf8");
  const match = /^\s*-?\s*Audit ID:\s*(\S+)\s*$/im.exec(content);
  return match?.[1] ?? null;
}
