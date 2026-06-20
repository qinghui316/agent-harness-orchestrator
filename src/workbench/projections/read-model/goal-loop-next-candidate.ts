import { knownSchedulerUserFacingActionLabel } from "./confirmation/scheduler-user-surface.js";
import type { WorkbenchControlledSchedulerNextCandidate, WorkbenchGoalLoopSummary } from "../../read-model-types.js";

export function buildControlledSchedulerNextCandidate(
  summary: Omit<WorkbenchGoalLoopSummary, "controlledSchedulerNextCandidate">,
): WorkbenchControlledSchedulerNextCandidate | undefined {
  if (!summary.recommendedActionType) return undefined;
  if (!summary.recommendedActionType.startsWith("planning.scheduler.")) return undefined;
  const actionLabel = knownSchedulerUserFacingActionLabel(summary.recommendedActionType) ?? "当前受控步骤";
  const readinessEvidencePrepared = Boolean(
    summary.controllerPolicyId
      && summary.controllerVerdict === "recommend-existing-gate"
      && summary.controllerGateStatus === "matches-current-gate"
      && summary.gateReadinessPreflightId,
  );
  const evidenceRefs = [
    summary.nextStepPacketMarkdownArtifact ?? summary.nextStepPacketArtifact,
    summary.controllerMarkdownArtifact ?? summary.controllerArtifact,
    summary.gateReadinessPreflightMarkdownArtifact ?? summary.gateReadinessPreflightArtifact,
  ].filter((value): value is string => Boolean(value));
  if (readinessEvidencePrepared) {
    return {
      status: "ready-for-confirmation",
      label: "下一步候选已刷新",
      body: `下一步候选：${actionLabel}。当前步骤检查已刷新；继续仍需要你再次确认。`,
      actionLabel,
      readinessEvidencePrepared: true,
      humanConfirmationStillRequired: true,
      evidenceRefs,
    };
  }
  return {
    status: "needs-review",
    label: "下一步候选需要复核",
    body: `下一步候选：${actionLabel}。下一步判断已刷新，但当前步骤检查还需要重新评估或查看证据；不会自动继续。`,
    actionLabel,
    readinessEvidencePrepared: false,
    humanConfirmationStillRequired: true,
    evidenceRefs,
  };
}
