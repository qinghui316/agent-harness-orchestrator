import { resolveRunnableChangeTarget } from "../change/target.js";
import type {
  GoalLoopContinuationBrief,
  GoalLoopControllerPolicy,
  GoalLoopDecision,
  GoalLoopGateReadinessPreflight,
  GoalLoopIteration,
  GoalLoopNextStepPacket,
} from "../goal-loop/manager.js";
import { compileGoalLoopControllerPolicy, compileGoalLoopEvaluation, compileGoalLoopGateReadinessPreflight } from "../goal-loop/manager.js";
import { readGoalLoopGateReadinessPreflight } from "../goal-loop/repository.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import type { WorkflowActionScopeCarrier, WorkflowActionType } from "../workflow-actions/registry.js";
import {
  assertControlledSchedulerContinuationGuard,
  assertControlledSchedulerFreshGateMatchesRequest,
  buildControlledSchedulerAdvanceStepRequest,
} from "../workflow-scheduler/controlled-step.js";
import { buildControlledSchedulerPostStepHandoff } from "./controlled-step-handoff.js";
import { recordSchedulerControlledStepEvidence } from "./controlled-step-evidence.js";
import { summarizeSchedulerControlledStepResult } from "./controlled-loop-turn.js";
import { readLatestSchedulerControlledStepEvidenceProjection } from "./repository.js";
import type { SchedulerControlledStepEvidence, SchedulerControlledStepHandoffSummary } from "./types.js";

export interface ControlledSchedulerLoopStepEvaluationResult {
  goalLoopDecision: GoalLoopDecision;
  goalLoopIteration: GoalLoopIteration;
  goalLoopContinuationBrief: GoalLoopContinuationBrief;
  goalLoopNextStepPacket: GoalLoopNextStepPacket;
  executionStarted: false;
}

export interface ControlledSchedulerLoopStepControllerResult {
  goalLoopControllerPolicy: GoalLoopControllerPolicy;
  executionStarted: false;
}

export interface ControlledSchedulerLoopStepPreflightResult {
  goalLoopGateReadinessPreflight: GoalLoopGateReadinessPreflight;
  executionStarted: false;
}

export type ControlledSchedulerLoopStepVisibleGateResult =
  | {
      currentGate: {
        actionType: WorkflowActionType;
        scope: Record<string, string | string[]>;
      };
      goalLoopNextStepPacketId?: string;
    }
  | {
      warning: string;
    };

export interface ControlledSchedulerLoopStepServices {
  evaluateGoalLoopDecision(request: WorkflowActionScopeCarrier): Promise<ControlledSchedulerLoopStepEvaluationResult>;
  refreshGoalLoopControllerPolicy(request: WorkflowActionScopeCarrier): Promise<ControlledSchedulerLoopStepControllerResult>;
  prepareGoalLoopGateReadinessPreflight(request: WorkflowActionScopeCarrier): Promise<ControlledSchedulerLoopStepPreflightResult>;
  auditHighImpactAction(request: WorkflowActionScopeCarrier): Promise<void>;
  dispatchControlledStep(request: WorkflowActionScopeCarrier): Promise<unknown>;
  resolveVisibleCurrentGate(goalLoopNextStepPacketId: string): Promise<ControlledSchedulerLoopStepVisibleGateResult>;
}

export type ControlledSchedulerLoopStepRequest = WorkflowActionScopeCarrier & {
  actionType: "planning.scheduler.controlled-advance.run";
};

type ControlledAdvancePostStepEvaluation = {
  postStepGoalLoopEvaluation: {
    goalLoopDecisionId: string;
    goalLoopIterationId: string;
    goalLoopContinuationBriefId: string;
    goalLoopNextStepPacketId: string;
    recommendedActionType?: string;
    continuationState: string;
    executionStarted: false;
  };
  postStepGoalLoopReadiness?: {
    goalLoopControllerPolicyId: string;
    goalLoopGateReadinessPreflightId: string;
    currentGateActionType: string;
    executionStarted: false;
    concreteGateInvoked: false;
    toolPolicyAuthorizedConcreteGate: false;
  };
  postStepGoalLoopReadinessWarning?: string;
};

type ControlledAdvancePostStepWarning = {
  postStepGoalLoopEvaluationWarning: string;
};

export async function runControlledSchedulerLoopStep(
  project: ManagedProject,
  changeId: string,
  request: ControlledSchedulerLoopStepRequest,
  services: ControlledSchedulerLoopStepServices,
): Promise<Record<string, unknown>> {
  const concreteActionType = request.goalLoopCurrentGateActionType;
  if (!concreteActionType) throw new Error("planning.scheduler.controlled-advance.run requires goalLoopCurrentGateActionType.");
  const requestedConcreteGate = concreteGateFromRequest(request, concreteActionType, changeId);
  await assertControlledAdvanceContinuationGuard(project, changeId, requestedConcreteGate);

  const evaluation = await services.evaluateGoalLoopDecision({
    actionType: "planning.goal-loop.evaluate",
    changeId,
  });
  const packetAction = evaluation.goalLoopNextStepPacket.recommendedAction;
  if (!packetAction || packetAction.actionType !== concreteActionType) {
    throw new Error("planning.scheduler.controlled-advance.run fresh Goal Loop packet no longer recommends the submitted scheduler gate.");
  }
  assertControlledSchedulerFreshGateMatchesRequest(packetAction.actionType, packetAction.scope, requestedConcreteGate, "Goal Loop packet");

  const controllerRequest = {
    ...request,
    actionType: "planning.goal-loop.controller.refresh",
    changeId,
    goalLoopNextStepPacketId: evaluation.goalLoopNextStepPacket.id,
    goalLoopCurrentGateActionType: concreteActionType,
  };
  await services.auditHighImpactAction(controllerRequest);
  const controller = await services.refreshGoalLoopControllerPolicy(controllerRequest);
  if (
    controller.goalLoopControllerPolicy.verdict !== "recommend-existing-gate"
    || controller.goalLoopControllerPolicy.gateStatus !== "matches-current-gate"
    || controller.goalLoopControllerPolicy.currentGate?.actionType !== concreteActionType
  ) {
    throw new Error("planning.scheduler.controlled-advance.run fresh controller policy no longer matches the submitted scheduler gate.");
  }
  assertControlledSchedulerFreshGateMatchesRequest(controller.goalLoopControllerPolicy.currentGate.actionType, controller.goalLoopControllerPolicy.currentGate.scope, requestedConcreteGate, "Goal Loop controller policy");

  const preflightRequest = {
    ...request,
    actionType: "planning.goal-loop.gate-readiness.prepare",
    changeId,
    goalLoopNextStepPacketId: evaluation.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: controller.goalLoopControllerPolicy.id,
    goalLoopCurrentGateActionType: concreteActionType,
  };
  await services.auditHighImpactAction(preflightRequest);
  const preflight = await services.prepareGoalLoopGateReadinessPreflight(preflightRequest);
  if (
    preflight.goalLoopGateReadinessPreflight.concreteGateInvoked !== false
    || preflight.goalLoopGateReadinessPreflight.toolPolicyAuthorizedConcreteGate !== false
    || preflight.goalLoopGateReadinessPreflight.currentGate.actionType !== concreteActionType
  ) {
    throw new Error("planning.scheduler.controlled-advance.run fresh preflight is not a non-executing match for the submitted scheduler gate.");
  }
  assertControlledSchedulerFreshGateMatchesRequest(preflight.goalLoopGateReadinessPreflight.currentGate.actionType, preflight.goalLoopGateReadinessPreflight.currentGate.scope, requestedConcreteGate, "Goal Loop gate-readiness preflight");

  const { wrapper } = buildControlledSchedulerAdvanceStepRequest(request, {
    goalLoopDecisionId: evaluation.goalLoopDecision.id,
    goalLoopIterationId: evaluation.goalLoopIteration.id,
    goalLoopContinuationBriefId: evaluation.goalLoopContinuationBrief.id,
    goalLoopNextStepPacketId: evaluation.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: controller.goalLoopControllerPolicy.id,
    goalLoopGateReadinessPreflightId: preflight.goalLoopGateReadinessPreflight.id,
  });
  const controlledStepResult = await services.dispatchControlledStep(wrapper);
  const controlledStepPayload = controlledStepResult as {
    controlledStep?: unknown;
    result?: unknown;
  };
  const postStep = await recordControlledAdvancePostStepEvaluation(project, changeId, services);
  const controlledAdvance = {
    actionType: concreteActionType,
    changeId,
    schedulerRunId: request.schedulerRunId,
    goalLoopDecisionId: evaluation.goalLoopDecision.id,
    goalLoopIterationId: evaluation.goalLoopIteration.id,
    goalLoopContinuationBriefId: evaluation.goalLoopContinuationBrief.id,
    goalLoopNextStepPacketId: evaluation.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: controller.goalLoopControllerPolicy.id,
    goalLoopGateReadinessPreflightId: preflight.goalLoopGateReadinessPreflight.id,
    executionStarted: true,
    stoppedAfterOneSchedulerTransition: true,
    loopAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
  };
  const postStepHandoff = buildControlledSchedulerPostStepHandoff({
    controlledAdvance,
    ...postStep,
  });
  const controlledStepResultSummary = summarizeSchedulerControlledStepResult(controlledStepPayload.result);
  const controlledStepEvidence = await recordControlledAdvanceRuntimeStepEvidence(project, changeId, requestedConcreteGate, controlledAdvance, postStep, postStepHandoff, controlledStepResultSummary);
  return {
    controlledAdvance,
    goalLoopDecision: evaluation.goalLoopDecision,
    goalLoopIteration: evaluation.goalLoopIteration,
    goalLoopContinuationBrief: evaluation.goalLoopContinuationBrief,
    goalLoopNextStepPacket: evaluation.goalLoopNextStepPacket,
    goalLoopControllerPolicy: controller.goalLoopControllerPolicy,
    goalLoopGateReadinessPreflight: preflight.goalLoopGateReadinessPreflight,
    ...postStep,
    postStepHandoff,
    ...controlledStepEvidence,
    controlledStep: controlledStepPayload.controlledStep,
    result: controlledStepPayload.result,
  };
}

async function recordControlledAdvancePostStepEvaluation(
  project: ManagedProject,
  changeId: string,
  services: ControlledSchedulerLoopStepServices,
): Promise<ControlledAdvancePostStepEvaluation | ControlledAdvancePostStepWarning> {
  try {
    const { memory, changePath } = await resolveControlledLoopChangeContext(project, changeId);
    assertWritableMemory(memory, "Controlled scheduler post-step Goal Loop evaluation");
    const { goalLoopDecision, goalLoopIteration, goalLoopContinuationBrief, goalLoopNextStepPacket } = await compileGoalLoopEvaluation(memory, changePath);
    const readiness = await recordControlledAdvancePostStepReadiness(
      memory,
      changePath,
      goalLoopNextStepPacket.id,
      services,
    );
    return {
      postStepGoalLoopEvaluation: {
        goalLoopDecisionId: goalLoopDecision.id,
        goalLoopIterationId: goalLoopIteration.id,
        goalLoopContinuationBriefId: goalLoopContinuationBrief.id,
        goalLoopNextStepPacketId: goalLoopNextStepPacket.id,
        recommendedActionType: goalLoopNextStepPacket.recommendedAction?.actionType,
        continuationState: goalLoopIteration.continuationState,
        executionStarted: false,
      },
      ...readiness,
    };
  } catch (error) {
    return {
      postStepGoalLoopEvaluationWarning: `Next-step evidence refresh failed after the scheduler transition succeeded: ${errorMessage(error)}`,
    };
  }
}

async function recordControlledAdvancePostStepReadiness(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  goalLoopNextStepPacketId: string,
  services: ControlledSchedulerLoopStepServices,
): Promise<Pick<ControlledAdvancePostStepEvaluation, "postStepGoalLoopReadiness" | "postStepGoalLoopReadinessWarning">> {
  const visibleGate = await services.resolveVisibleCurrentGate(goalLoopNextStepPacketId);
  if ("warning" in visibleGate) {
    return { postStepGoalLoopReadinessWarning: visibleGate.warning };
  }
  try {
    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate: visibleGate.currentGate,
      goalLoopNextStepPacketId,
      requireCurrentGateMatch: true,
    });
    const preflight = await compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId,
      goalLoopControllerPolicyId: policy.id,
      currentGate: visibleGate.currentGate,
    });
    return {
      postStepGoalLoopReadiness: {
        goalLoopControllerPolicyId: policy.id,
        goalLoopGateReadinessPreflightId: preflight.id,
        currentGateActionType: preflight.currentGate.actionType,
        executionStarted: false,
        concreteGateInvoked: preflight.concreteGateInvoked,
        toolPolicyAuthorizedConcreteGate: preflight.toolPolicyAuthorizedConcreteGate,
      },
    };
  } catch (error) {
    return {
      postStepGoalLoopReadinessWarning: `Post-step readiness evidence was not prepared: ${errorMessage(error)}`,
    };
  }
}

async function assertControlledAdvanceContinuationGuard(
  project: ManagedProject,
  changeId: string,
  requestedConcreteGate: WorkflowActionScopeCarrier,
): Promise<void> {
  const { memory, changePath } = await resolveControlledLoopChangeContext(project, changeId);
  const previousStep = await readLatestControlledStepForContinuation(memory, changePath, requestedConcreteGate.schedulerRunId);
  const previousGateReadinessPreflight = previousStep?.postStepEvidence.goalLoopGateReadinessPreflightId
    ? await readGoalLoopGateReadinessPreflight(memory, changePath, previousStep.postStepEvidence.goalLoopGateReadinessPreflightId)
    : null;
  assertControlledSchedulerContinuationGuard({
    changeId,
    requestedConcreteGate,
    previousStep,
    previousGateReadinessPreflight,
  });
}

async function resolveControlledLoopChangeContext(project: ManagedProject, changeId: string): Promise<{
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>;
  changePath: string;
}> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === changeId)?.path;
  if (!changePath) throw new Error(`Controlled scheduler loop step cannot resolve active Change path for ${changeId}.`);
  return { memory, changePath };
}

async function readLatestControlledStepForContinuation(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  schedulerRunId?: string,
): Promise<SchedulerControlledStepEvidence | null> {
  const candidates = [
    schedulerRunId ? await readLatestSchedulerControlledStepEvidenceProjection(memory, changePath, schedulerRunId) : null,
    await readLatestSchedulerControlledStepEvidenceProjection(memory, changePath),
  ].filter((item): item is SchedulerControlledStepEvidence => Boolean(item));
  return candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

async function recordControlledAdvanceRuntimeStepEvidence(
  project: ManagedProject,
  changeId: string,
  requestedConcreteGate: WorkflowActionScopeCarrier,
  controlledAdvance: {
    actionType: string;
    changeId: string;
    schedulerRunId?: string;
    goalLoopDecisionId: string;
    goalLoopIterationId: string;
    goalLoopContinuationBriefId: string;
    goalLoopNextStepPacketId: string;
    goalLoopControllerPolicyId: string;
    goalLoopGateReadinessPreflightId: string;
  },
  postStep: ControlledAdvancePostStepEvaluation | ControlledAdvancePostStepWarning,
  postStepHandoff: ReturnType<typeof buildControlledSchedulerPostStepHandoff>,
  controlledStepResultSummary?: ReturnType<typeof summarizeSchedulerControlledStepResult>,
): Promise<Record<string, unknown>> {
  try {
    const recorded = await recordSchedulerControlledStepEvidence(project, {
      changeId,
      schedulerRunId: controlledAdvance.schedulerRunId,
      executedActionType: controlledAdvance.actionType,
      targetScope: requestedConcreteGate,
      preStepEvidence: {
        goalLoopDecisionId: controlledAdvance.goalLoopDecisionId,
        goalLoopIterationId: controlledAdvance.goalLoopIterationId,
        goalLoopContinuationBriefId: controlledAdvance.goalLoopContinuationBriefId,
        goalLoopNextStepPacketId: controlledAdvance.goalLoopNextStepPacketId,
        goalLoopControllerPolicyId: controlledAdvance.goalLoopControllerPolicyId,
        goalLoopGateReadinessPreflightId: controlledAdvance.goalLoopGateReadinessPreflightId,
      },
      postStepGoalLoopEvaluation: "postStepGoalLoopEvaluation" in postStep ? postStep.postStepGoalLoopEvaluation : undefined,
      postStepGoalLoopReadiness: "postStepGoalLoopReadiness" in postStep ? postStep.postStepGoalLoopReadiness : undefined,
      postStepGoalLoopEvaluationWarning: "postStepGoalLoopEvaluationWarning" in postStep ? postStep.postStepGoalLoopEvaluationWarning : undefined,
      postStepGoalLoopReadinessWarning: "postStepGoalLoopReadinessWarning" in postStep ? postStep.postStepGoalLoopReadinessWarning : undefined,
      postStepHandoff: toSchedulerControlledStepHandoffSummary(postStepHandoff, controlledAdvance.actionType),
      controlledStepResultSummary,
    });
    return {
      schedulerControlledStepEvidence: {
        id: recorded.schedulerControlledStepEvidence.id,
        artifact: recorded.schedulerControlledStepEvidence.artifact,
        markdownArtifact: recorded.schedulerControlledStepEvidence.markdownArtifact,
        status: recorded.schedulerControlledStepEvidence.status,
        executedActionType: recorded.schedulerControlledStepEvidence.executedActionType,
        humanConfirmationStillRequired: recorded.schedulerControlledStepEvidence.humanConfirmationStillRequired,
        controlledLoopTick: recorded.schedulerControlledStepEvidence.controlledLoopTick,
        controlledLoopIteration: recorded.schedulerControlledStepEvidence.controlledLoopIteration,
      },
    };
  } catch (error) {
    return {
      schedulerControlledStepEvidenceWarning: `Controlled scheduler runtime step evidence was not recorded after the scheduler transition succeeded: ${errorMessage(error)}`,
    };
  }
}

function toSchedulerControlledStepHandoffSummary(
  handoff: ReturnType<typeof buildControlledSchedulerPostStepHandoff>,
  executedActionType: string,
): SchedulerControlledStepHandoffSummary {
  return {
    status: handoff.status,
    stopReason: handoff.stopReason,
    executedActionType: handoff.executedActionType ?? executedActionType,
    needsReevaluation: handoff.needsReevaluation,
    warning: handoff.warning,
    nextConfirmationCandidate: handoff.nextConfirmationCandidate?.actionType ? {
      actionType: handoff.nextConfirmationCandidate.actionType,
      goalLoopNextStepPacketId: handoff.nextConfirmationCandidate.goalLoopNextStepPacketId,
      goalLoopControllerPolicyId: handoff.nextConfirmationCandidate.goalLoopControllerPolicyId,
      goalLoopGateReadinessPreflightId: handoff.nextConfirmationCandidate.goalLoopGateReadinessPreflightId,
      readinessEvidencePrepared: handoff.nextConfirmationCandidate.readinessEvidencePrepared,
      executionStarted: false,
      authorizationGranted: false,
      humanConfirmationStillRequired: true,
    } : undefined,
    executionStarted: false,
    loopAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
  };
}

function concreteGateFromRequest(request: WorkflowActionScopeCarrier, actionType: string, changeId: string): WorkflowActionScopeCarrier {
  return { ...request, actionType, changeId };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
