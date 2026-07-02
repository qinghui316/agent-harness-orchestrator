import { userFacingText } from "../../../formatters.js";
import type { Workpad } from "../../../types.js";
import { mainAgentExecutionForWorkpad } from "./main-agent-execution.js";

export function parentAgentNarrative(workpad: Workpad): string {
  if (workpad.resultReview) return "我已经整理了本轮实现结果、验证与审查证据。你可以查看摘要后决定是否应用到项目，或继续要求修改。";
  if (workpad.goalLoop) return "我已经根据当前证据整理出一个受控继续建议。右侧确认后只推进一个步骤，后续仍会停下等待你确认。";
  if (mainAgentExecutionForWorkpad(workpad)) return "我正在把这次需求交给内部角色执行，并会把实现、验证和审查结果汇总回这个对话。";
  if (workpad.planningArtifactBundle) return workpad.planningArtifactBundle.status === "confirmed"
    ? "方案已经确认，接下来会进入实现、验证和审查。"
    : "我已让 planning-agent 准备方案。你可以在右侧 Agent 工作区继续补充要求，或确认后开始执行。";
  if (workpad.intake.currentUnderstanding) return "我会基于当前需求对话继续分析目标、约束和下一步。";
  return "描述你的需求后，我会先整理方案，再进入实现和验证。";
}

export function stripInternalPlanningText(value: string): string {
  return value
    .replace(/\bT-\d+\s*[:：]?\s*/g, "")
    .replace(/\bAC-\d+\s*[:：]?\s*/g, "")
    .replace(/\blatest-bundle\.md\b/gi, "")
    .replace(/\bplanning-agent\b/gi, "主 agent")
    .replace(/\bAgentTask\b/gi, "执行记录")
    .replace(/\bTaskRepository\b/gi, "后台任务")
    .replace(/\bTBD\b/gi, "待确认")
    .replace(/^\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parentSurfaceText(value: string): string {
  return userFacingText(stripInternalPlanningText(value));
}
