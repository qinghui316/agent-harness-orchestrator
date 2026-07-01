import type { Workpad, WorkpadMainAgentExecutionSummary } from "../../../types.js";

export function mainAgentExecutionForWorkpad(
  workpad: Pick<Workpad, "mainAgentExecution" | "rolePipeline">,
): WorkpadMainAgentExecutionSummary | undefined {
  return workpad.mainAgentExecution ?? workpad.rolePipeline;
}
