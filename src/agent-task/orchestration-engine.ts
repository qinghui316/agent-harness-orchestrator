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

export function decideNextMainAgentOrchestration(state: MainAgentOrchestrationState): MainAgentOrchestrationDecision {
  const latest = state.steps.at(-1);
  if (!latest) {
    return delegateCoder([], "No role evidence exists yet; start with the default implementation role.");
  }

  if (latest.status === "failed") {
    if (latest.failureClassification === "validation-failure" || latest.failureClassification === "audit-failure") {
      if (countReworkAttempts(state) < state.maxReworkAttempts) {
        return {
          kind: "delegate-role",
          roleId: "rework-coder",
          goal: "Repair implementation from validation or audit evidence.",
          inputArtifacts: latest.outputArtifacts,
          reason: `${latest.roleId} failed with ${latest.failureClassification}; bounded rework budget is available.`,
          attemptKind: "rework",
          nextRecommendation: "Run rework-coder, then re-run independent validation and audit.",
        };
      }
      return {
        kind: "needs-user-input",
        stoppedAt: latest.stoppedAt ?? (latest.failureClassification === "validation-failure" ? "validation" : "audit"),
        reason: `${latest.roleId} failed and rework budget is exhausted.`,
        nextRecommendation: "Ask the user for clarification, acceptance changes, or explicit next action.",
      };
    }

    return {
      kind: "failed",
      stoppedAt: latest.stoppedAt === "boundary" ? "boundary" : "code",
      reason: latest.failureClassification === "boundary-violation"
        ? "Coder boundary audit failed; do not continue with validation."
        : "Coder did not produce a completed worktree proposal.",
      nextRecommendation: "Stop role orchestration and surface the failure evidence to the user.",
    };
  }

  if (latest.roleId === "coder-agent" || latest.roleId === "rework-coder") {
    return {
      kind: "delegate-role",
      roleId: "validator",
      goal: "Run independent mechanical validation for the coder worktree.",
      inputArtifacts: latest.outputArtifacts,
      reason: `${latest.roleId} produced a completed worktree proposal.`,
      attemptKind: "follow-up",
      nextRecommendation: "Run validator before semantic audit or apply handoff.",
    };
  }

  if (latest.roleId === "validator") {
    return {
      kind: "delegate-role",
      roleId: "auditor-agent",
      goal: "Run independent semantic audit for the validated worktree.",
      inputArtifacts: latest.outputArtifacts,
      reason: "Independent validation passed.",
      attemptKind: "follow-up",
      nextRecommendation: "Run auditor-agent before result review and apply handoff.",
    };
  }

  return {
    kind: "completed",
    reason: "Independent audit accepted the validated worktree evidence.",
    nextRecommendation: "Show result review and apply handoff.",
  };
}

function delegateCoder(inputArtifacts: string[], reason: string): MainAgentOrchestrationDecision {
  return {
    kind: "delegate-role",
    roleId: "coder-agent",
    goal: "Implement the confirmed demand in an AHO-owned worktree.",
    inputArtifacts,
    reason,
    attemptKind: "initial",
    nextRecommendation: "Run coder-agent, then validate the produced worktree.",
  };
}

function countReworkAttempts(state: MainAgentOrchestrationState): number {
  return state.steps.filter((step) => step.roleId === "rework-coder").length;
}
