import { canApplyResultFromGate,
  classifyApplyReadiness,
  previewWorktreeApply,
  type WorktreeGateState
} from "../../../apply/manager.js";
import { listAuditResults } from "../../../audit/artifacts.js";
import { isGitDirty } from "../../../project/git.js";
import { listValidationResults } from "../../../validation/artifacts.js";
import type {
  AuditSummary,
  ManagedProject,
  ResolvedMemory,
  ValidationSummary,
  WorktreeStatus,
} from "../../../types/index.js";
import type {
  WorkbenchFailureClassification,
  WorkbenchResultReview,
  WorkbenchResultReviewStatus,
  WorkbenchTaskGraph,
  WorkbenchTopicDetail,
  WorkpadEvidenceSummary,
} from "../../read-model-types.js";
import { latestByTimestamp, sortByTimestampDesc } from "./projection-summary.js";

const OFFICIAL_REWORK_BUDGET = 1;

export async function buildResultReview(project: ManagedProject | null, memory: ResolvedMemory, topic: WorkbenchTopicDetail): Promise<WorkbenchResultReview | undefined> {
  const worktrees = sortByTimestampDesc(
    (topic.worktrees as WorktreeStatus[]).filter((worktree) => worktree.changeId === topic.id),
    (worktree) => worktree.appliedAt ?? worktree.createdAt,
  );
  const worktree = worktrees.find((item) => item.status === "active") ?? worktrees[0];
  const validations = await listValidationResults(memory, topic.id).catch(() => []);
  const audits = await listAuditResults(memory, topic.id).catch(() => []);
  const validation = latestResultForWorktree(validations, worktree?.worktreeId);
  const audit = latestResultForWorktree(audits, worktree?.worktreeId);
  if (!worktree && !validation && !audit) return undefined;

  const preview = project && worktree && worktree.status !== "applied"
    ? await previewWorktreeApply(project, worktree.worktreeId).catch(() => null)
    : null;
  const sourceDirty = project && worktree?.status === "applied" ? await isGitDirty(project.path).catch(() => null) : null;
  const auditNotes = audit?.findings.filter((finding) => finding.severity === "note").map((finding) => finding.text) ?? [];
  const blockingIssues = preview?.gate.blockingIssues ?? [];
  const canApply = preview ? canApplyResultFromGate(preview.gate) : false;
  const readiness = preview?.gate ? classifyApplyReadiness(preview.gate) : undefined;
  const hasFailedEvidence = validation?.status === "failed" || audit?.status === "blocked" || audit?.status === "failed";
  const status: WorkbenchResultReviewStatus = worktree?.status === "applied"
    ? sourceDirty === true ? "applied-source-dirty" : "applied-clean"
    : hasFailedEvidence
      ? "needs-rework"
      : canApply
        ? "ready-to-apply"
        : "not-ready";
  const diffStat = preview?.gate.diffStat || audit?.artifacts.diffStat;
  const evidence: WorkpadEvidenceSummary[] = [];
  if (validation) {
    evidence.push({
      id: `result-validation:${validation.id}`,
      label: `验证 ${validation.status}`,
      source: "validation",
      status: validation.status,
      timestamp: validation.finishedAt,
    });
  }
  if (audit) {
    evidence.push({
      id: `result-audit:${audit.id}`,
      label: audit.status === "approved-with-notes" ? "审查通过，有注意事项" : `审查 ${audit.status}`,
      source: "audit",
      status: audit.status,
      artifact: audit.artifacts.audit,
      timestamp: audit.finishedAt,
    });
  }
  return {
    status,
    title: resultReviewTitle(status),
    summary: resultReviewSummary(status, validation?.status, audit?.status, auditNotes.length),
    worktreeId: worktree?.worktreeId,
    changedFiles: changedFilesFromWorktree(worktree),
    diffStat,
    validation: validation ? { id: validation.id, status: validation.status, runId: validation.runId } : undefined,
    audit: audit ? {
      id: audit.id,
      status: audit.status,
      runId: audit.runId,
      findingCount: audit.findings.length,
      notes: auditNotes,
      artifact: audit.artifacts.audit,
    } : undefined,
    applyReadiness: {
      ready: status === "ready-to-apply",
      kind: readiness?.kind ?? (status === "ready-to-apply" ? "ready" : "not-approved"),
      label: applyReadinessLabel(status, preview?.gate),
      message: readiness?.message ?? applyReadinessLabel(status, preview?.gate),
      blockingIssues: readiness && readiness.kind !== "ready" ? [readiness.message] : blockingIssues,
      warnings: preview?.gate.warnings ?? [],
    },
    evidence,
  };
}

export function classifySelectedTopicFailure(
  topic: WorkbenchTopicDetail,
  latestValidation: ValidationSummary | undefined,
  latestAudit: AuditSummary | undefined,
  taskGraph: WorkbenchTaskGraph,
): WorkbenchFailureClassification | undefined {
  if (topic.runs.some((run) => run.status === "failed")) return "environment-failure";
  if (latestValidation?.status === "failed") return "code-test-failure";
  if (latestAudit?.status === "blocked" || latestAudit?.status === "failed") return "audit-semantic-failure";
  if (taskGraph.nodes.some((node) => node.blockers.some((item) => /前置条件|需求|验收|ambiguous|requirement/i.test(item)))) return "ambiguous-requirement";
  return undefined;
}

export function requiresUserInputReason(
  topic: WorkbenchTopicDetail,
  latestValidation: ValidationSummary | undefined,
  latestAudit: AuditSummary | undefined,
  taskGraph: WorkbenchTaskGraph,
): string | undefined {
  const blockedTask = taskGraph.nodes.find((node) => node.status === "blocked");
  if (blockedTask?.taskRun && (blockedTask.taskRun.officialReworkAttempt ?? 0) >= OFFICIAL_REWORK_BUDGET) {
    return "自动修改次数已用尽，需要用户补充要求或放弃该需求。";
  }
  const classification = classifySelectedTopicFailure(topic, latestValidation, latestAudit, taskGraph);
  if (classification === "ambiguous-requirement") return "需求或验收标准存在歧义，需要用户确认。";
  if (classification === "environment-failure") return "工具、环境或权限问题阻止继续执行，需要用户处理环境或查看证据。";
  return undefined;
}

function latestResultForWorktree<T extends { worktreeId?: string; finishedAt: string }>(items: T[], worktreeId: string | undefined): T | undefined {
  const scoped = worktreeId ? items.filter((item) => item.worktreeId === worktreeId) : items;
  return latestByTimestamp(scoped, (item) => item.finishedAt);
}

function changedFilesFromWorktree(worktree: WorktreeStatus | undefined): string[] {
  if (!worktree) return [];
  return worktree.diffSummary.map((line) => line.replace(/^(\?\?|[ MADRCU]{1,2})\s+/, "").trim()).filter(Boolean).slice(0, 8);
}

function resultReviewTitle(status: WorkbenchResultReviewStatus): string {
  if (status === "ready-to-apply") return "结果可应用到项目";
  if (status === "needs-rework") return "结果需要修改";
  if (status === "applied-clean") return "结果已应用并收口";
  if (status === "applied-source-dirty") return "结果已应用，等待你处理本地改动";
  return "结果证据尚未完整";
}

function resultReviewSummary(status: WorkbenchResultReviewStatus, validationStatus: string | undefined, auditStatus: string | undefined, noteCount: number): string {
  if (status === "ready-to-apply") {
    return auditStatus === "approved-with-notes"
      ? `验证已通过，审查有 ${noteCount} 条注意事项，但可以由你决定是否应用。`
      : "验证和审查已通过，可以由你确认应用到项目。";
  }
  if (status === "needs-rework") return "验证或审查还没有通过，反馈会进入下一轮修改。";
  if (status === "applied-clean") return "源码应用完成，当前需求可以归档。";
  if (status === "applied-source-dirty") return "源码已经应用，但本地仍有未提交改动，需求不会自动归档。";
  return `当前结果还缺少可应用证据。验证：${validationStatus ?? "未完成"}，审查：${auditStatus ?? "未完成"}。`;
}

function applyReadinessLabel(status: WorkbenchResultReviewStatus, gate: WorktreeGateState | undefined): string {
  if (status === "ready-to-apply") return "可以应用到项目";
  if (status === "applied-clean") return "已应用且本地状态可收口";
  if (status === "applied-source-dirty") return "已应用，但本地改动需要你处理";
  if (gate) return classifyApplyReadiness(gate).message;
  return "等待验证、审查或结果证据";
}
