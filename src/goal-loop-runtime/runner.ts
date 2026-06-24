import type { WorkflowActionScopeCarrier } from "../workflow-actions/registry.js";
import {
  createGoalLoopRuntimeId,
  goalLoopRuntimeArtifactRefs,
  stopReasonSummary,
  writeGoalLoopRuntimeAuthorization,
  writeGoalLoopRuntimeIteration,
  writeGoalLoopRuntimeRun,
} from "./repository.js";
import type { GoalLoopRuntimeAuthorization, GoalLoopRuntimeIteration, GoalLoopRuntimeRun, GoalLoopRuntimeStopReason } from "./types.js";
import type { ResolvedMemory } from "../types/index.js";

export interface GoalLoopControlledContinuationRequest extends WorkflowActionScopeCarrier {
  actionType: "planning.goal-loop.controlled-continue.run";
  changeId: string;
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  goalLoopGateReadinessPreflightId: string;
  goalLoopCurrentGateActionType: string;
  maxSteps?: number;
}

export interface GoalLoopControlledContinuationServices {
  resolveCurrentControlledAdvanceRequest(previousResult: unknown | null): Promise<WorkflowActionScopeCarrier & { actionType: "planning.scheduler.controlled-advance.run" } | { stopReason: GoalLoopRuntimeStopReason; summary: string }>;
  dispatchControlledAdvance(request: WorkflowActionScopeCarrier & { actionType: "planning.scheduler.controlled-advance.run" }, auditScope: Record<string, unknown>): Promise<unknown>;
  summarizeChildResult(result: unknown): string;
}

export interface GoalLoopControlledContinuationResult {
  authorization: GoalLoopRuntimeAuthorization;
  runtimeRun: GoalLoopRuntimeRun;
  iterations: GoalLoopRuntimeIteration[];
  childResults: unknown[];
  stopReason: GoalLoopRuntimeStopReason;
  summary: string;
  artifactRefs: string[];
}

const DEFAULT_MAX_STEPS = 5;
const HARD_MAX_STEPS = 10;

export async function runGoalLoopControlledContinuation(input: {
  memory: ResolvedMemory;
  changePath: string;
  request: GoalLoopControlledContinuationRequest;
  services: GoalLoopControlledContinuationServices;
}): Promise<GoalLoopControlledContinuationResult> {
  const { memory, changePath, request, services } = input;
  const maxSteps = clampMaxSteps(request.maxSteps);
  const authId = createGoalLoopRuntimeId("goal-loop-runtime-authorization", `${request.changeId}:${request.goalLoopNextStepPacketId}`);
  const authRefs = goalLoopRuntimeArtifactRefs(memory, changePath, authId);
  const authorization: GoalLoopRuntimeAuthorization = {
    version: "1.0",
    id: authId,
    changeId: request.changeId,
    authority: "human-confirmed-bounded-continuation-authorization",
    actionType: "planning.goal-loop.controlled-continue.run",
    maxSteps,
    hardMaxSteps: HARD_MAX_STEPS,
    requestedGate: { ...request },
    sourceGoalLoopNextStepPacketId: request.goalLoopNextStepPacketId,
    sourceGoalLoopControllerPolicyId: request.goalLoopControllerPolicyId,
    sourceGoalLoopGateReadinessPreflightId: request.goalLoopGateReadinessPreflightId,
    humanConfirmed: true,
    allowedChildActionType: "planning.scheduler.controlled-advance.run",
    fullAutoAuthorized: false,
    parallelExecutorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    remoteLandingAuthorized: false,
    harnessEvolutionAuthorized: false,
    artifact: authRefs.artifact,
    markdownArtifact: authRefs.markdownArtifact,
    createdAt: new Date().toISOString(),
  };
  await writeGoalLoopRuntimeAuthorization(memory, changePath, authorization);

  const runId = createGoalLoopRuntimeId("goal-loop-runtime-run", authorization.id);
  const runRefs = goalLoopRuntimeArtifactRefs(memory, changePath, runId);
  const runtimeRun: GoalLoopRuntimeRun = {
    version: "1.0",
    id: runId,
    changeId: request.changeId,
    authority: "goal-loop-runtime-bounded-continuation-run",
    goalLoopRuntimeAuthorizationId: authorization.id,
    status: "running",
    maxSteps,
    completedSteps: 0,
    iterations: [],
    artifact: runRefs.artifact,
    markdownArtifact: runRefs.markdownArtifact,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeGoalLoopRuntimeRun(memory, changePath, runtimeRun);

  const iterations: GoalLoopRuntimeIteration[] = [];
  const childResults: unknown[] = [];
  let previousResult: unknown | null = null;
  let stopReason: GoalLoopRuntimeStopReason = "max-steps";
  let stopSummary = stopReasonSummary("max-steps");

  for (let index = 0; index < maxSteps; index += 1) {
    const next = await services.resolveCurrentControlledAdvanceRequest(previousResult);
    if ("stopReason" in next) {
      stopReason = next.stopReason;
      stopSummary = next.summary;
      break;
    }

    const auditScope = {
      coveredByGoalLoopRuntimeAuthorizationId: authorization.id,
      goalLoopRuntimeRunId: runtimeRun.id,
      goalLoopRuntimeIterationOrdinal: index + 1,
    };
    const iterationId = createGoalLoopRuntimeId("goal-loop-runtime-iteration", `${runtimeRun.id}:${index + 1}`);
    const iterationRefs = goalLoopRuntimeArtifactRefs(memory, changePath, iterationId);
    try {
      const result = await services.dispatchControlledAdvance(next, auditScope);
      childResults.push(result);
      previousResult = result;
      const iteration: GoalLoopRuntimeIteration = {
        version: "1.0",
        id: iterationId,
        changeId: request.changeId,
        authority: "goal-loop-runtime-controlled-scheduler-iteration",
        goalLoopRuntimeAuthorizationId: authorization.id,
        goalLoopRuntimeRunId: runtimeRun.id,
        ordinal: index + 1,
        submittedActionType: "planning.scheduler.controlled-advance.run",
        currentGateActionType: next.goalLoopCurrentGateActionType,
        currentGateScope: { ...next },
        status: "completed",
        resultSummary: services.summarizeChildResult(result),
        childAuditScope: {
          coveredByGoalLoopRuntimeAuthorizationId: authorization.id,
          goalLoopRuntimeRunId: runtimeRun.id,
        },
        artifact: iterationRefs.artifact,
        markdownArtifact: iterationRefs.markdownArtifact,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      iterations.push(iteration);
      runtimeRun.iterations.push(iteration.id);
      runtimeRun.completedSteps = iterations.length;
      runtimeRun.updatedAt = new Date().toISOString();
      await writeGoalLoopRuntimeIteration(memory, changePath, iteration);
      await writeGoalLoopRuntimeRun(memory, changePath, runtimeRun);
    } catch (error) {
      stopReason = "handler-failed";
      stopSummary = error instanceof Error ? error.message : String(error);
      const iteration: GoalLoopRuntimeIteration = {
        version: "1.0",
        id: iterationId,
        changeId: request.changeId,
        authority: "goal-loop-runtime-controlled-scheduler-iteration",
        goalLoopRuntimeAuthorizationId: authorization.id,
        goalLoopRuntimeRunId: runtimeRun.id,
        ordinal: index + 1,
        submittedActionType: "planning.scheduler.controlled-advance.run",
        currentGateActionType: next.goalLoopCurrentGateActionType,
        currentGateScope: { ...next },
        status: "failed",
        stopReason,
        error: stopSummary,
        childAuditScope: {
          coveredByGoalLoopRuntimeAuthorizationId: authorization.id,
          goalLoopRuntimeRunId: runtimeRun.id,
        },
        artifact: iterationRefs.artifact,
        markdownArtifact: iterationRefs.markdownArtifact,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      iterations.push(iteration);
      runtimeRun.iterations.push(iteration.id);
      runtimeRun.updatedAt = new Date().toISOString();
      await writeGoalLoopRuntimeIteration(memory, changePath, iteration);
      break;
    }
  }

  runtimeRun.status = stopReason === "handler-failed" ? "failed" : stopReason === "max-steps" ? "completed" : "stopped";
  runtimeRun.completedSteps = iterations.filter((iteration) => iteration.status === "completed").length;
  runtimeRun.stopReason = stopReason;
  runtimeRun.stopSummary = stopSummary;
  runtimeRun.updatedAt = new Date().toISOString();
  runtimeRun.completedAt = new Date().toISOString();
  await writeGoalLoopRuntimeRun(memory, changePath, runtimeRun);

  return {
    authorization,
    runtimeRun,
    iterations,
    childResults,
    stopReason,
    summary: stopSummary,
    artifactRefs: [authorization.artifact, runtimeRun.artifact, ...iterations.map((iteration) => iteration.artifact)],
  };
}

function clampMaxSteps(value: number | undefined): number {
  if (!Number.isFinite(value ?? DEFAULT_MAX_STEPS)) return DEFAULT_MAX_STEPS;
  const numeric = Math.trunc(value ?? DEFAULT_MAX_STEPS);
  return Math.min(HARD_MAX_STEPS, Math.max(1, numeric));
}
