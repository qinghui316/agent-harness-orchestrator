export const MAIN_AGENT_EXECUTION_ACTION_TYPES = [
  "role.pipeline.start",
  "role.pipeline.stop",
  "role.pipeline.continue",
  "role.pipeline.reconcile",
] as const;

export type MainAgentExecutionActionType = typeof MAIN_AGENT_EXECUTION_ACTION_TYPES[number];
export type MainAgentExecutionStopActionType = "role.pipeline.stop";

const MAIN_AGENT_EXECUTION_ACTION_SET = new Set<string>(MAIN_AGENT_EXECUTION_ACTION_TYPES);

export function normalizeMainAgentExecutionAction(actionType: string | null | undefined): MainAgentExecutionActionType | null {
  if (!actionType) return null;
  return MAIN_AGENT_EXECUTION_ACTION_SET.has(actionType) ? actionType as MainAgentExecutionActionType : null;
}

export function isMainAgentExecutionAction(actionType: string | null | undefined): actionType is MainAgentExecutionActionType {
  return normalizeMainAgentExecutionAction(actionType) !== null;
}

export function isMainAgentExecutionStopAction(actionType: string | null | undefined): actionType is MainAgentExecutionStopActionType {
  return normalizeMainAgentExecutionAction(actionType) === "role.pipeline.stop";
}
