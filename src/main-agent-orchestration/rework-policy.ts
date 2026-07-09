import type { MainAgentOrchestrationDecision } from "../agent-task/orchestration-engine.js";
import type { TaskRun } from "../types/index.js";

export const MAIN_AGENT_TASKRUN_REWORK_BUDGET = 1;

export function shouldRunTaskRunRework(input: {
  taskRun: TaskRun;
  decision: MainAgentOrchestrationDecision;
}): input is { taskRun: TaskRun; decision: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "rework-coder" } } {
  if (input.decision.kind !== "delegate-role" || input.decision.roleId !== "rework-coder") return false;
  if (input.taskRun.status !== "blocked" && input.taskRun.status !== "failed") return false;
  const officialReworkAttempt = Math.max(0, input.taskRun.attempt - 1);
  return officialReworkAttempt < MAIN_AGENT_TASKRUN_REWORK_BUDGET;
}

export function buildMainAgentTaskRunReworkPrompt(prompt: string | undefined): string {
  return [
    prompt,
    "",
    "AHO official validation/audit did not accept the previous attempt.",
    "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
    "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}
