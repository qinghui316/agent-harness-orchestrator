import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import type { WorkbenchLiveSink } from "../workbench/types.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
  type AuditLeafRun,
  type CodeLeafRun,
  type ValidationLeafRun,
} from "./leaf-stages.js";

export interface MainAgentLeafAttemptResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  status?: "failed" | "needs-user-input";
  error?: string;
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  boundaryAudit?: unknown;
  orchestration: MainAgentOrchestrationState;
}

export type CodeValidateAuditAttemptResult = MainAgentLeafAttemptResult;

export interface MainAgentObservation {
  orchestration: MainAgentOrchestrationState;
  latestCode?: CodeLeafRun;
  latestValidation?: ValidationLeafRun;
  latestAudit?: AuditLeafRun;
  entrypoint: "top-level" | "task-run" | "source-refresh-rework" | "feedback-rework";
}

export type MainAgentStepDecision = MainAgentOrchestrationDecision;

export interface MainAgentLeafStep {
  roleId: MainAgentOrchestrationRole;
  decision: Extract<MainAgentStepDecision, { kind: "delegate-role" }>;
}

export interface MainAgentLeafStepResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  status: "completed" | "failed" | "needs-user-input";
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  error?: string;
  boundaryAudit?: unknown;
  orchestration: MainAgentOrchestrationState;
}

export interface RunMainAgentStepLoopInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  taskIds?: string[];
  taskRunId?: string;
  entrypoint: MainAgentObservation["entrypoint"];
  initialRole?: MainAgentOrchestrationRole;
  orchestrationState?: MainAgentOrchestrationState;
  initialDecision?: Extract<MainAgentStepDecision, { kind: "delegate-role" }>;
  executionGate?: CodeExecutionGateOptions;
}

export function observeOrchestrationState(input: {
  orchestration: MainAgentOrchestrationState;
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  entrypoint: MainAgentObservation["entrypoint"];
}): MainAgentObservation {
  return {
    orchestration: input.orchestration,
    latestCode: input.code,
    latestValidation: input.validation,
    latestAudit: input.audit,
    entrypoint: input.entrypoint,
  };
}

export function decideNextOrchestrationStep(
  observation: MainAgentObservation,
  initialDecision?: Extract<MainAgentStepDecision, { kind: "delegate-role" }>,
): MainAgentStepDecision {
  return initialDecision ?? decideNextMainAgentOrchestration(observation.orchestration);
}

export function recordOrchestrationStepResult(
  observation: MainAgentObservation,
  result: MainAgentLeafStepResult,
): MainAgentObservation {
  return observeOrchestrationState({
    orchestration: result.orchestration,
    code: result.code ?? observation.latestCode,
    validation: result.validation ?? observation.latestValidation,
    audit: result.audit ?? observation.latestAudit,
    entrypoint: observation.entrypoint,
  });
}

export async function runMainAgentStepLoop(input: RunMainAgentStepLoopInput): Promise<MainAgentLeafAttemptResult> {
  const memory = await resolveProjectMemory(input.project);
  const initialOrchestration = input.orchestrationState ?? createMainAgentOrchestrationState({ changeId: input.changeId });
  let observation = observeOrchestrationState({
    orchestration: initialOrchestration,
    entrypoint: input.entrypoint,
  });
  let nextInitialDecision = input.initialDecision ?? synthesizeInitialDecision(input.initialRole, observation.orchestration, input.taskRunId);

  for (let i = 0; i < 8; i += 1) {
    const decision = decideNextOrchestrationStep(observation, nextInitialDecision);
    nextInitialDecision = undefined;

    if (decision.kind === "completed") {
      return {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        stoppedAt: null,
        orchestration: observation.orchestration,
      };
    }
    if (decision.kind === "failed") {
      return {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        status: "failed",
        stoppedAt: decision.stoppedAt,
        orchestration: observation.orchestration,
      };
    }
    if (decision.kind === "needs-user-input") {
      return {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        status: "needs-user-input",
        stoppedAt: decision.stoppedAt,
        orchestration: observation.orchestration,
      };
    }

    const stepResult = await runMainAgentLeafStep({
      project: input.project,
      memory,
      changeId: input.changeId,
      prompt: input.prompt,
      live: input.live,
      taskIds: input.taskIds,
      taskRunId: input.taskRunId,
      executionGate: input.executionGate,
      observation,
      step: {
        roleId: decision.roleId,
        decision,
      },
    });

    observation = recordOrchestrationStepResult(observation, stepResult);

    if (stepResult.status === "failed" || stepResult.status === "needs-user-input") {
      return {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        status: stepResult.status === "needs-user-input" ? "needs-user-input" : stepResult.error ? "failed" : undefined,
        stoppedAt: stepResult.stoppedAt,
        error: stepResult.error,
        boundaryAudit: stepResult.boundaryAudit,
        orchestration: observation.orchestration,
      };
    }
  }

  return {
    code: observation.latestCode,
    validation: observation.latestValidation,
    audit: observation.latestAudit,
    status: "needs-user-input",
    stoppedAt: "audit",
    error: "Main-agent orchestration exceeded the V1 safety iteration limit.",
    orchestration: observation.orchestration,
  };
}

export async function runMainAgentLeafStep(input: {
  project: ManagedProject;
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  taskIds?: string[];
  taskRunId?: string;
  executionGate?: CodeExecutionGateOptions;
  observation: MainAgentObservation;
  step: MainAgentLeafStep;
}): Promise<MainAgentLeafStepResult> {
  if (input.step.roleId === "coder-agent" || input.step.roleId === "rework-coder") {
    const coder = input.step.roleId === "rework-coder"
      ? await runReworkCoderLeafStage({
          project: input.project,
          memory: input.memory,
          changeId: input.changeId,
          prompt: input.prompt,
          live: input.live,
          taskIds: input.taskIds,
          taskRunId: input.taskRunId,
          orchestration: input.observation.orchestration,
          decision: input.step.decision,
          executionGate: input.executionGate,
        })
      : await runCoderLeafStage({
          project: input.project,
          memory: input.memory,
          changeId: input.changeId,
          prompt: input.prompt,
          live: input.live,
          taskIds: input.taskIds,
          taskRunId: input.taskRunId,
          roleId: "coder-agent",
          orchestration: input.observation.orchestration,
          decision: input.step.decision,
          executionGate: input.executionGate,
        });

    return {
      code: coder.code,
      validation: input.observation.latestValidation,
      audit: input.observation.latestAudit,
      status: coder.status === "completed" ? "completed" : "failed",
      stoppedAt: coder.status === "completed" ? null : coder.stoppedAt ?? "code",
      error: coder.error,
      boundaryAudit: coder.boundaryAudit,
      orchestration: coder.orchestration,
    };
  }

  if (input.step.roleId === "validator") {
    if (!input.observation.latestCode?.run.worktree?.worktreeId) {
      return {
        code: input.observation.latestCode,
        validation: input.observation.latestValidation,
        audit: input.observation.latestAudit,
        status: "needs-user-input",
        stoppedAt: "code",
        error: "Validator requires a completed coder worktree.",
        orchestration: input.observation.orchestration,
      };
    }

    const validator = await runValidatorLeafStage({
      project: input.project,
      memory: input.memory,
      changeId: input.changeId,
      live: input.live,
      orchestration: input.observation.orchestration,
      decision: input.step.decision as Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "validator" },
      code: input.observation.latestCode,
    });

    return {
      code: input.observation.latestCode,
      validation: validator.validation,
      audit: input.observation.latestAudit,
      status: validator.status === "completed" ? "completed" : "failed",
      stoppedAt: validator.status === "completed" ? null : "validation",
      error: validator.error,
      orchestration: validator.orchestration,
    };
  }

  if (input.step.roleId === "auditor-agent") {
    if (!input.observation.latestCode?.run.worktree?.worktreeId || !input.observation.latestValidation) {
      return {
        code: input.observation.latestCode,
        validation: input.observation.latestValidation,
        audit: input.observation.latestAudit,
        status: "needs-user-input",
        stoppedAt: "validation",
        error: "Auditor requires completed code and validation evidence.",
        orchestration: input.observation.orchestration,
      };
    }

    const auditor = await runAuditorLeafStage({
      project: input.project,
      memory: input.memory,
      changeId: input.changeId,
      live: input.live,
      orchestration: input.observation.orchestration,
      decision: input.step.decision as Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "auditor-agent" },
      code: input.observation.latestCode,
      validation: input.observation.latestValidation,
    });

    return {
      code: input.observation.latestCode,
      validation: input.observation.latestValidation,
      audit: auditor.audit,
      status: auditor.status === "completed" ? "completed" : "failed",
      stoppedAt: auditor.status === "completed" ? null : "audit",
      orchestration: auditor.orchestration,
    };
  }

  return {
    code: input.observation.latestCode,
    validation: input.observation.latestValidation,
    audit: input.observation.latestAudit,
    status: "needs-user-input",
    stoppedAt: "code",
    error: `Unsupported main-agent leaf role: ${input.step.roleId}`,
    orchestration: input.observation.orchestration,
  };
}

function synthesizeInitialDecision(
  roleId: MainAgentOrchestrationRole | undefined,
  state: MainAgentOrchestrationState,
  taskRunId: string | undefined,
): Extract<MainAgentStepDecision, { kind: "delegate-role" }> | undefined {
  if (roleId === "rework-coder") {
    return {
      kind: "delegate-role",
      roleId: "rework-coder",
      goal: "Repair implementation from validation or audit evidence.",
      inputArtifacts: taskRunId ? [taskRunId] : [],
      reason: "Bounded rework path requested a rework coder run.",
      attemptKind: "rework",
      nextRecommendation: "Run rework-coder, then re-run independent validation and audit.",
    };
  }
  if (roleId === "coder-agent") {
    const decision = decideNextMainAgentOrchestration(state);
    assertDelegateDecision(decision, "coder-agent");
    return decision;
  }
  if (roleId === undefined) {
    return undefined;
  }
  throw new Error(`Unsupported initial main-agent role: ${roleId}`);
}

function assertDelegateDecision(decision: MainAgentStepDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentStepDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) {
    throw new Error(`Main-agent decision engine expected ${roleId}, got ${decision.kind}${decision.kind === "delegate-role" ? `:${decision.roleId}` : ""}.`);
  }
}
