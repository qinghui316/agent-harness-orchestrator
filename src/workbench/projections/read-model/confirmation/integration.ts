import type { IntegrationCheckCandidate, IntegrationCheckRecord } from "../../../../integration-check/manager.js";
import type { ManagedProject } from "../../../../types/index.js";
import type { WorkbenchConfirmationQueueItem } from "../../../read-model-types.js";
import { evidenceActions } from "../evidence-actions.js";
import { approvalAction } from "./shared.js";

export function integrationCandidateQueueItem(project: ManagedProject, candidate: IntegrationCheckCandidate, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && candidate.targets.some((target) => target.changeId === selectedChangeId));
  return {
    id: `apply-check:candidate:${candidate.targets.map((target) => target.worktreeId).join("+")}`,
    kind: "integration-check",
    projectId: project.id,
    conversationId: selectedChangeId,
    changeId: selectedChangeId,
    summary: candidate.summary,
    whyNeedsConfirmation: "多个结果都已准备好应用。",
    confirmEffect: "会在临时工作区检查这些结果能否一起应用；不会修改项目源码。",
    riskSummary: candidate.riskSummary,
    evidenceRefs: [],
    actions: [{
      id: `run-apply-check:${candidate.targets.map((target) => target.worktreeId).join("+")}`,
      label: "检查兼容性",
      kind: "workflow-action",
      actionType: "apply-check.run",
      worktreeIds: candidate.targets.map((target) => target.worktreeId),
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: selected,
    status: "pending",
  };
}

export function integrationCheckNeedsUserAction(status: IntegrationCheckRecord["status"]): boolean {
  return status === "conflict" || status === "validation-failed" || status === "audit-failed" || status === "failed" || status === "stale-result";
}

export function sameIntegrationTargets(left: IntegrationCheckCandidate["targets"], right: IntegrationCheckRecord["resultTargets"]): boolean {
  const normalize = (targets: Array<{ changeId: string; worktreeId: string; diffHash: string }>): string[] => {
    return targets.map((target) => `${target.changeId}:${target.worktreeId}:${target.diffHash}`).sort();
  };
  const leftKey = normalize(left);
  const rightKey = normalize(right);
  return leftKey.length === rightKey.length && leftKey.every((item, index) => item === rightKey[index]);
}

export function integrationCheckQueueItem(project: ManagedProject, check: IntegrationCheckRecord, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && check.resultTargets.some((target) => target.changeId === selectedChangeId));
  const itemChangeId = selected ? selectedChangeId : check.resultTargets[0]?.changeId;
  return {
    id: `apply-check:${check.id}`,
    kind: "integration-apply",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    applyCheckId: check.id,
    summary: check.summary,
    whyNeedsConfirmation: "兼容性检查已通过，是否应用这些结果需要你确认。",
    confirmEffect: "确认后会把检查通过的组合结果应用到项目源码。",
    riskSummary: check.riskSummary,
    evidenceRefs: check.artifactRefs,
    actions: [
      {
        id: `apply-check-apply:${check.id}`,
        label: "确认应用到项目",
        kind: "approval",
        action: approvalAction("apply-check.apply", "确认应用到项目", "apply-check", ["apply", check.id, check.latestArtifactHash ?? ""], true),
        enabled: true,
        requiresConfirmation: true,
      },
      {
        id: `apply-check-feedback:${check.id}`,
        label: "要求修改",
        kind: "feedback",
        enabled: true,
        requiresConfirmation: false,
      },
      {
        id: `apply-check-discard:${check.id}`,
        label: "放弃",
        kind: "approval",
        action: approvalAction("apply-check.discard", "放弃组合结果", "apply-check", ["discard", check.id], true),
        enabled: true,
        requiresConfirmation: true,
      },
      ...evidenceActions(check.artifactRefs[0], { label: "查看证据" }),
    ],
    primary: selected,
    status: "passed",
  };
}

export function integrationCheckNeedsActionQueueItem(project: ManagedProject, check: IntegrationCheckRecord, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && check.resultTargets.some((target) => target.changeId === selectedChangeId));
  const itemChangeId = selected ? selectedChangeId : check.resultTargets[0]?.changeId;
  return {
    id: `apply-check-needs-action:${check.id}`,
    kind: "request-changes",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    applyCheckId: check.id,
    summary: check.summary,
    whyNeedsConfirmation: check.status === "stale-result"
      ? "结果已过期，需要回到对应需求重新处理。"
      : "兼容性检查没有通过，需要修改其中一个结果或放弃这次组合应用。",
    confirmEffect: "要求修改会把反馈绑定到这次检查和相关需求；放弃只结束这次组合应用结果，不修改项目源码。",
    riskSummary: check.riskSummary,
    evidenceRefs: check.artifactRefs,
    actions: [
      {
        id: `apply-check-feedback:${check.id}`,
        label: "要求修改",
        kind: "feedback",
        enabled: true,
        requiresConfirmation: false,
      },
      {
        id: `apply-check-discard:${check.id}`,
        label: "放弃",
        kind: "approval",
        action: approvalAction("apply-check.discard", "放弃组合结果", "apply-check", ["discard", check.id], true),
        enabled: true,
        requiresConfirmation: true,
      },
      ...evidenceActions(check.artifactRefs[0], { label: "查看证据" }),
    ],
    primary: selected,
    status: "failed",
  };
}

export function integrationCheckHistoryItem(project: ManagedProject, check: IntegrationCheckRecord): WorkbenchConfirmationQueueItem {
  return {
    id: `apply-check-history:${check.id}`,
    kind: "integration-apply",
    projectId: project.id,
    applyCheckId: check.id,
    summary: check.summary,
    whyNeedsConfirmation: "历史兼容性检查。",
    confirmEffect: "无当前动作。",
    riskSummary: check.riskSummary,
    evidenceRefs: check.artifactRefs,
    actions: evidenceActions(check.artifactRefs[0]),
    primary: false,
    status: check.status === "applied" ? "applied" : check.status === "discarded" ? "discarded" : "failed",
  };
}
