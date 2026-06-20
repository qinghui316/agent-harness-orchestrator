import { knownSchedulerUserFacingActionLabel, schedulerUserFacingActionCopy } from "../projections/read-model/confirmation/scheduler-user-surface.js";
import { controlledSchedulerPostStepHandoffSummary } from "../controlled-scheduler-handoff.js";
import { isControlledSchedulerConcreteAction } from "../../workflow-scheduler/controlled-step.js";

type ControlledLoopCopy = {
  label: string;
  completedSummary: string;
  runningBody: string;
  failedBody: string;
};

const GOAL_LOOP_COPY: Record<string, ControlledLoopCopy> = {
  "planning.goal-loop.evaluate": {
    label: "评估下一步",
    completedSummary: "下一步评估已完成。这里只记录建议和证据，没有执行任何步骤；继续执行仍需要你单独确认。",
    runningBody: "正在评估下一步；这里只会更新建议和证据。",
    failedBody: "下一步评估未完成；请查看错误和证据后再决定是否重试或调整。",
  },
  "planning.goal-loop.feedback.evaluate": {
    label: "根据反馈重新评估",
    completedSummary: "你的反馈已记录，并已重新评估下一步。这里只更新建议和证据，没有执行任何步骤；继续执行仍需要你单独确认。",
    runningBody: "正在根据你的反馈重新评估下一步；这里只会更新建议和证据。",
    failedBody: "反馈重新评估未完成；请查看错误和证据后再决定是否重试或调整。",
  },
  "planning.goal-loop.controller.refresh": {
    label: "刷新下一步判断",
    completedSummary: "下一步判断已刷新。这里只更新是否适合继续的证据，没有执行任何步骤；继续执行仍需要你单独确认。",
    runningBody: "正在刷新下一步判断；这里只会更新是否适合继续的证据。",
    failedBody: "下一步判断刷新未完成；请查看错误和证据后再决定是否重试或调整。",
  },
  "planning.goal-loop.gate-readiness.prepare": {
    label: "检查当前步骤",
    completedSummary: "当前步骤已重新检查。这里只确认这个步骤是否仍可执行，没有执行该步骤；继续执行仍需要你单独确认。",
    runningBody: "正在检查当前步骤是否仍可执行；不会执行该步骤。",
    failedBody: "当前步骤检查未完成；请查看错误和证据后再决定是否重试或调整。",
  },
};

const SCHEDULER_COMPLETED_SUMMARY: Record<string, string> = {
  "planning.scheduler.controlled-step.run": "已执行当前确认的一个受控步骤，并在完成后停止。后续步骤、应用、关闭、远端落地或维护演进仍需要单独确认。",
  "planning.scheduler.controlled-advance.run": "已重新读取当前状态，并只按当前建议推进了一个受控步骤；完成后已经停止。后续步骤、应用、关闭、远端落地或维护演进仍需要单独确认。",
};

const CONTROLLED_SCHEDULER_ACTIONS = new Set(Object.keys(SCHEDULER_COMPLETED_SUMMARY));

export function controlledLoopResultLabel(actionType: string | undefined): string | null {
  if (!actionType) return null;
  if (GOAL_LOOP_COPY[actionType]) return GOAL_LOOP_COPY[actionType].label;
  if (CONTROLLED_SCHEDULER_ACTIONS.has(actionType)) return schedulerUserFacingActionCopy(actionType).label;
  return null;
}

export function controlledLoopDecisionSummary(actionType: string, result: unknown): string | null {
  if (GOAL_LOOP_COPY[actionType]) return GOAL_LOOP_COPY[actionType].completedSummary;
  const schedulerSummary = SCHEDULER_COMPLETED_SUMMARY[actionType];
  if (!schedulerSummary) return null;
  if (actionType !== "planning.scheduler.controlled-advance.run") return schedulerSummary;
  const handoffSummary = controlledSchedulerPostStepResultSummary(result);
  if (handoffSummary) return `${schedulerSummary} ${handoffSummary}`;
  if (hasRecordField(result, "postStepGoalLoopReadiness")) {
    return `${schedulerSummary} 下一步证据已刷新；若当前页面仍显示匹配步骤，检查证据也已刷新。继续仍需要你单独确认。`;
  }
  if (hasRecordField(result, "postStepGoalLoopReadinessWarning")) {
    return `${schedulerSummary} 下一步证据已刷新，但当前步骤检查未完成；请查看证据后再决定是否重新评估。`;
  }
  if (hasRecordField(result, "postStepGoalLoopEvaluation")) {
    return `${schedulerSummary} 下一步证据已刷新；是否继续仍需要你单独确认。`;
  }
  if (hasRecordField(result, "postStepGoalLoopEvaluationWarning")) {
    return `${schedulerSummary} 当前步骤已完成，但下一步证据刷新未完成；请查看证据后再决定是否重新评估。`;
  }
  return schedulerSummary;
}

function controlledSchedulerPostStepResultSummary(value: unknown): string | null {
  const handoff = readPostStepHandoff(value);
  if (!handoff) return controlledSchedulerPostStepHandoffSummary(value);
  const executed = userSafeSchedulerStepLabel(readString(handoff, "executedActionType"), "本次步骤");
  const candidate = isRecord(handoff.nextConfirmationCandidate) ? handoff.nextConfirmationCandidate : null;
  const next = userSafeSchedulerStepLabel(readString(candidate, "actionType"), "下一步");
  if (handoff.status === "next-confirmation-candidate-ready") {
    return `已完成这一个受控步骤并主动停止。本次执行：${executed}。下一步候选：${next}，并且当前步骤检查已经刷新；如果页面仍显示这一项，继续仍需要你再次确认。`;
  }
  if (handoff.status === "next-confirmation-candidate-needs-review") {
    return `已完成这一个受控步骤并主动停止。本次执行：${executed}。下一步候选：${next}，但当前步骤检查还需要重新评估或查看证据；不会自动继续。`;
  }
  if (handoff.status === "next-step-evaluation-failed") {
    return `已完成这一个受控步骤并主动停止。本次执行：${executed}。下一步判断刷新未完成；请重新评估下一步或查看证据后再继续。`;
  }
  return `已完成这一个受控步骤并主动停止。本次执行：${executed}。下一步判断已刷新；是否继续仍需要你再次确认。`;
}

function readPostStepHandoff(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !isRecord(value.postStepHandoff)) return null;
  const status = value.postStepHandoff.status;
  if (
    status !== "next-confirmation-candidate-ready"
    && status !== "next-confirmation-candidate-needs-review"
    && status !== "next-step-evaluation-refreshed"
    && status !== "next-step-evaluation-failed"
  ) {
    return null;
  }
  return value.postStepHandoff;
}

function userSafeSchedulerStepLabel(actionType: string | undefined, fallback: string): string {
  if (!isControlledSchedulerConcreteAction(actionType)) return fallback;
  return knownSchedulerUserFacingActionLabel(actionType) ?? fallback;
}

function readString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : undefined;
}

export function controlledLoopThreadLabel(actionType: string | undefined, status: string | undefined): string | null {
  const label = controlledLoopResultLabel(actionType);
  if (!label) return null;
  if (status === "failed") return `${label}未完成`;
  if (status === "running") return `${label}进行中`;
  return `${label}已完成`;
}

export function controlledLoopThreadBody(actionType: string | undefined, status: string | undefined): string | null {
  if (!actionType) return null;
  const goalLoopCopy = GOAL_LOOP_COPY[actionType];
  if (goalLoopCopy) {
    if (status === "failed") return goalLoopCopy.failedBody;
    if (status === "running") return goalLoopCopy.runningBody;
    return goalLoopCopy.completedSummary;
  }
  const schedulerSummary = SCHEDULER_COMPLETED_SUMMARY[actionType];
  if (!schedulerSummary) return null;
  if (status === "failed") return "这个受控步骤未完成；请查看错误和证据后再决定是否重试或调整。";
  if (status === "running") return "正在处理这个已确认的受控步骤；完成前不会自动启动其他步骤。";
  return schedulerSummary;
}

export function controlledLoopAssistantMessage(actionType: string): string | null {
  return controlledLoopDecisionSummary(actionType, null);
}

export function controlledLoopFeedbackRecordedMessage(): string {
  return "你的反馈已记录。接下来会根据这条反馈重新评估下一步；还没有执行任何步骤。";
}

function hasRecordField(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && key in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
