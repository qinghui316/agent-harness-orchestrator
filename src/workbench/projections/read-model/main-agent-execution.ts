import type { WorkbenchMainAgentExecutionSummary, WorkbenchWorkpad } from "../../read-model-types.js";

export function mainAgentExecutionForWorkpad(
  workpad: Pick<WorkbenchWorkpad, "mainAgentExecution" | "rolePipeline">,
): WorkbenchMainAgentExecutionSummary | undefined {
  return workpad.mainAgentExecution ?? workpad.rolePipeline;
}
