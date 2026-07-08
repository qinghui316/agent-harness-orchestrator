export type MainAgentOrchestrationRole = "coder-agent" | "validator" | "auditor-agent" | "rework-coder";

export type MainAgentOrchestrationStepStatus = "completed" | "failed";

export type MainAgentFailureClassification =
  | "boundary-violation"
  | "code-failure"
  | "validation-failure"
  | "audit-failure";

export interface MainAgentOrchestrationStep {
  roleId: MainAgentOrchestrationRole;
  status: MainAgentOrchestrationStepStatus;
  inputArtifacts: string[];
  outputArtifacts: string[];
  failureClassification?: MainAgentFailureClassification;
  stoppedAt?: "boundary" | "code" | "validation" | "audit";
  summary: string;
}

export interface MainAgentOrchestrationState {
  changeId: string;
  steps: MainAgentOrchestrationStep[];
  maxReworkAttempts: number;
}

export type MainAgentOrchestrationDecision =
  | {
      kind: "delegate-role";
      roleId: MainAgentOrchestrationRole;
      goal: string;
      inputArtifacts: string[];
      reason: string;
      attemptKind: "initial" | "rework" | "follow-up";
      nextRecommendation: string;
    }
  | {
      kind: "completed";
      reason: string;
      nextRecommendation: string;
    }
  | {
      kind: "needs-user-input";
      stoppedAt: "boundary" | "code" | "validation" | "audit";
      reason: string;
      nextRecommendation: string;
    }
  | {
      kind: "failed";
      stoppedAt: "code" | "boundary";
      reason: string;
      nextRecommendation: string;
    };

export function createMainAgentOrchestrationState(input: {
  changeId: string;
  maxReworkAttempts?: number;
  steps?: MainAgentOrchestrationStep[];
}): MainAgentOrchestrationState {
  return {
    changeId: input.changeId,
    steps: input.steps ?? [],
    maxReworkAttempts: input.maxReworkAttempts ?? 1,
  };
}

export function recordMainAgentOrchestrationStep(
  state: MainAgentOrchestrationState,
  step: MainAgentOrchestrationStep,
): MainAgentOrchestrationState {
  return {
    ...state,
    steps: [...state.steps, step],
  };
}
