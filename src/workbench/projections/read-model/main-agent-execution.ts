import type { WorkbenchMainAgentExecutionSummary, WorkbenchWorkpad } from "../../read-model-types.js";

export function mainAgentExecutionForWorkpad(
  workpad: Pick<WorkbenchWorkpad, "mainAgentExecution">,
): WorkbenchMainAgentExecutionSummary | undefined {
  return workpad.mainAgentExecution;
}
