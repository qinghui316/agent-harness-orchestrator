export type WorkflowRuntimeRole = "coder-agent" | "validator" | "auditor-agent" | "rework-coder";

export type WorkflowRuntimeStepStatus = "completed" | "failed";

export type WorkflowRuntimeFailureClassification =
  | "boundary-violation"
  | "code-failure"
  | "validation-failure"
  | "audit-failure";

export interface WorkflowRuntimeExecutionStep {
  roleId: WorkflowRuntimeRole;
  status: WorkflowRuntimeStepStatus;
  inputArtifacts: string[];
  outputArtifacts: string[];
  failureClassification?: WorkflowRuntimeFailureClassification;
  stoppedAt?: "boundary" | "code" | "validation" | "audit";
  summary: string;
}

export interface WorkflowRuntimeExecutionState {
  changeId: string;
  steps: WorkflowRuntimeExecutionStep[];
  maxReworkAttempts: number;
}

export type WorkflowRuntimeDecision =
  | {
      kind: "delegate-role";
      roleId: WorkflowRuntimeRole;
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

export function createWorkflowRuntimeExecutionState(input: {
  changeId: string;
  maxReworkAttempts?: number;
  steps?: WorkflowRuntimeExecutionStep[];
}): WorkflowRuntimeExecutionState {
  return {
    changeId: input.changeId,
    steps: input.steps ?? [],
    maxReworkAttempts: input.maxReworkAttempts ?? 1,
  };
}

export function recordWorkflowRuntimeExecutionStep(
  state: WorkflowRuntimeExecutionState,
  step: WorkflowRuntimeExecutionStep,
): WorkflowRuntimeExecutionState {
  return {
    ...state,
    steps: [...state.steps, step],
  };
}
