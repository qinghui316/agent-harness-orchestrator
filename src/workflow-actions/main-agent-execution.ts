export const MAIN_AGENT_EXECUTION_CANONICAL_ACTION_TYPES = [
  "main-agent.execution.start",
  "main-agent.execution.stop",
  "main-agent.execution.continue",
  "main-agent.execution.reconcile",
] as const;

export const MAIN_AGENT_EXECUTION_LEGACY_ACTION_TYPES = [
  "role.pipeline.start",
  "role.pipeline.stop",
  "role.pipeline.continue",
  "role.pipeline.reconcile",
] as const;

export const MAIN_AGENT_EXECUTION_ACTION_TYPES = [
  ...MAIN_AGENT_EXECUTION_CANONICAL_ACTION_TYPES,
  ...MAIN_AGENT_EXECUTION_LEGACY_ACTION_TYPES,
] as const;

export type MainAgentExecutionCanonicalActionType = typeof MAIN_AGENT_EXECUTION_CANONICAL_ACTION_TYPES[number];
export type MainAgentExecutionLegacyActionType = typeof MAIN_AGENT_EXECUTION_LEGACY_ACTION_TYPES[number];
export type MainAgentExecutionActionType = typeof MAIN_AGENT_EXECUTION_ACTION_TYPES[number];
export type MainAgentExecutionStopActionType = "main-agent.execution.stop" | "role.pipeline.stop";

const MAIN_AGENT_EXECUTION_ALIASES: Record<
  MainAgentExecutionActionType,
  {
    canonical: MainAgentExecutionCanonicalActionType;
    legacy: MainAgentExecutionLegacyActionType;
  }
> = {
  "main-agent.execution.start": {
    canonical: "main-agent.execution.start",
    legacy: "role.pipeline.start",
  },
  "main-agent.execution.stop": {
    canonical: "main-agent.execution.stop",
    legacy: "role.pipeline.stop",
  },
  "main-agent.execution.continue": {
    canonical: "main-agent.execution.continue",
    legacy: "role.pipeline.continue",
  },
  "main-agent.execution.reconcile": {
    canonical: "main-agent.execution.reconcile",
    legacy: "role.pipeline.reconcile",
  },
  "role.pipeline.start": {
    canonical: "main-agent.execution.start",
    legacy: "role.pipeline.start",
  },
  "role.pipeline.stop": {
    canonical: "main-agent.execution.stop",
    legacy: "role.pipeline.stop",
  },
  "role.pipeline.continue": {
    canonical: "main-agent.execution.continue",
    legacy: "role.pipeline.continue",
  },
  "role.pipeline.reconcile": {
    canonical: "main-agent.execution.reconcile",
    legacy: "role.pipeline.reconcile",
  },
};

function mainAgentExecutionAlias(actionType: string | null | undefined): typeof MAIN_AGENT_EXECUTION_ALIASES[MainAgentExecutionActionType] | null {
  if (!actionType) return null;
  return MAIN_AGENT_EXECUTION_ALIASES[actionType as MainAgentExecutionActionType] ?? null;
}

export function normalizeMainAgentExecutionAction(actionType: string | null | undefined): MainAgentExecutionCanonicalActionType | null {
  return mainAgentExecutionAlias(actionType)?.canonical ?? null;
}

export function toLegacyMainAgentExecutionAction(actionType: string | null | undefined): MainAgentExecutionLegacyActionType | null {
  return mainAgentExecutionAlias(actionType)?.legacy ?? null;
}

export function isMainAgentExecutionAction(actionType: string | null | undefined): actionType is MainAgentExecutionActionType {
  return normalizeMainAgentExecutionAction(actionType) !== null;
}

export function isMainAgentExecutionStopAction(actionType: string | null | undefined): actionType is MainAgentExecutionStopActionType {
  return normalizeMainAgentExecutionAction(actionType) === "main-agent.execution.stop";
}
