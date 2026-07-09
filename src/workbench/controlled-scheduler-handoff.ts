import type { ControlledSchedulerPostStepHandoff } from "../scheduler-runtime/controlled-step-handoff.js";

export {
  buildControlledSchedulerPostStepHandoff,
  type BuildControlledSchedulerPostStepHandoffInput,
  type ControlledSchedulerPostStepHandoff,
  type ControlledSchedulerPostStepHandoffStatus,
} from "../scheduler-runtime/controlled-step-handoff.js";

export function controlledSchedulerPostStepHandoffSummary(value: unknown): string | null {
  const handoff = readControlledSchedulerPostStepHandoff(value);
  if (!handoff) return null;
  if (handoff.status === "next-confirmation-candidate-ready") {
    return "已完成这一个受控步骤并主动停止。下一步判断和当前步骤检查已经刷新；如果页面仍显示同一个下一步，继续也仍需要你再次确认。";
  }
  if (handoff.status === "next-confirmation-candidate-needs-review") {
    return "已完成这一个受控步骤并主动停止。下一步判断已刷新，但当前步骤检查还需要重新评估或查看证据；不会自动继续。";
  }
  if (handoff.status === "next-step-evaluation-failed") {
    return "已完成这一个受控步骤并主动停止。下一步判断刷新未完成；请重新评估下一步或查看证据后再继续。";
  }
  return "已完成这一个受控步骤并主动停止。下一步判断已刷新；是否继续仍需要你再次确认。";
}

function readControlledSchedulerPostStepHandoff(value: unknown): ControlledSchedulerPostStepHandoff | null {
  if (!isRecord(value) || !isRecord(value.postStepHandoff)) return null;
  const handoff = value.postStepHandoff;
  const status = handoff.status;
  if (
    status !== "next-confirmation-candidate-ready"
    && status !== "next-confirmation-candidate-needs-review"
    && status !== "next-step-evaluation-refreshed"
    && status !== "next-step-evaluation-failed"
  ) {
    return null;
  }
  return handoff as unknown as ControlledSchedulerPostStepHandoff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
