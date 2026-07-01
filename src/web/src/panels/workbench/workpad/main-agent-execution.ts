import type { Workpad, WorkpadMainAgentExecutionSummary } from "../../../types.js";

export function mainAgentExecutionForWorkpad(
  workpad: Pick<Workpad, "mainAgentExecution">,
): WorkpadMainAgentExecutionSummary | undefined {
  return workpad.mainAgentExecution;
}
