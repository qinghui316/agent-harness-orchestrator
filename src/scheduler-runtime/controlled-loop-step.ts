import { resolveRunnableChangeTarget } from "../change/target.js";
import { compileGoalLoopControllerPolicy, compileGoalLoopEvaluation, compileGoalLoopGateReadinessPreflight } from "../goal-loop/manager.js";
import { readGoalLoopGateReadinessPreflight } from "../goal-loop/repository.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import type { WorkflowActionScopeCarrier, WorkflowActionType } from "../workflow-actions/registry.js";
import {
  assertControlledSchedulerContinuationGuard,
  buildControlledSchedulerAdvanceStepRequest,
  isControlledSchedulerConcreteAction,
} from "../workflow-scheduler/controlled-step.js";
import {
  chooseControlledSchedulerCurrentTransition,
  type ControlledSchedulerCurrentTransitionServices,
} from "./controlled-loop-current-transition.js";
import { assertControlledSchedulerBoundaryContinuation } from "./controlled-loop-boundary-continuation.js";
import { buildControlledSchedulerPostStepHandoff } from "./controlled-step-handoff.js";
import { recordSchedulerControlledStepEvidence } from "./controlled-step-evidence.js";
import { summarizeSchedulerControlledStepResult } from "./controlled-loop-turn.js";
import { readLatestSchedulerControlledStepEvidenceProjection } from "./repository.js";
import type { ControlledSchedulerContinuationDecision, SchedulerControlledLoopCurrentTransitionChoice, SchedulerControlledStepEvidence, SchedulerControlledStepHandoffSummary } from "./types.js";

export interface ControlledSchedulerLoopStepServices extends ControlledSchedulerCurrentTransitionServices {
  dispatchControlledStep(request: WorkflowActionScopeCarrier): Promise<unknown>;
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
  if (!isControlledSchedulerConcreteAction(concreteActionType)) {
    throw new Error("planning.scheduler.controlled-advance.run requires a concrete planning.scheduler.* current gate.");
  }
  const requestedConcreteGate = concreteGateFromRequest(request, concreteActionType, changeId);
  const controlledLoopPreDispatchDecision = await assertControlledAdvanceContinuationGuard(project, changeId, requestedConcreteGate);

  const currentTransition = await chooseControlledSchedulerCurrentTransition({
    changeId,
    request,
    requestedConcreteGate,
    services,
  });

  const { wrapper } = buildControlledSchedulerAdvanceStepRequest(request, {
    goalLoopDecisionId: currentTransition.goalLoopDecision.id,
    goalLoopIterationId: currentTransition.goalLoopIteration.id,
    goalLoopContinuationBriefId: currentTransition.goalLoopContinuationBrief.id,
    goalLoopNextStepPacketId: currentTransition.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: currentTransition.goalLoopControllerPolicy.id,
    goalLoopGateReadinessPreflightId: currentTransition.goalLoopGateReadinessPreflight.id,
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
    goalLoopDecisionId: currentTransition.goalLoopDecision.id,
    goalLoopIterationId: currentTransition.goalLoopIteration.id,
    goalLoopContinuationBriefId: currentTransition.goalLoopContinuationBrief.id,
    goalLoopNextStepPacketId: currentTransition.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: currentTransition.goalLoopControllerPolicy.id,
    goalLoopGateReadinessPreflightId: currentTransition.goalLoopGateReadinessPreflight.id,
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
  const controlledStepEvidence = await recordControlledAdvanceRuntimeStepEvidence(project, changeId, requestedConcreteGate, controlledAdvance, postStep, postStepHandoff, controlledStepResultSummary, currentTransition.controlledLoopCurrentTransitionChoice, controlledLoopPreDispatchDecision);
  return {
    controlledAdvance,
    controlledLoopPreDispatchDecision,
    controlledLoopCurrentTransitionChoice: currentTransition.controlledLoopCurrentTransitionChoice,
    goalLoopDecision: currentTransition.goalLoopDecision,
    goalLoopIteration: currentTransition.goalLoopIteration,
    goalLoopContinuationBrief: currentTransition.goalLoopContinuationBrief,
    goalLoopNextStepPacket: currentTransition.goalLoopNextStepPacket,
    goalLoopControllerPolicy: currentTransition.goalLoopControllerPolicy,
    goalLoopGateReadinessPreflight: currentTransition.goalLoopGateReadinessPreflight,
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
): Promise<ControlledSchedulerContinuationDecision> {
  const { memory, changePath } = await resolveControlledLoopChangeContext(project, changeId);
  const previousStep = await readLatestControlledStepForContinuation(memory, changePath, requestedConcreteGate.schedulerRunId);
  const previousGateReadinessPreflight = previousStep?.postStepEvidence.goalLoopGateReadinessPreflightId
    ? await readGoalLoopGateReadinessPreflight(memory, changePath, previousStep.postStepEvidence.goalLoopGateReadinessPreflightId)
    : null;
  const decision = assertControlledSchedulerBoundaryContinuation({
    changeId,
    requestedConcreteGate,
    previousStep,
    previousGateReadinessPreflight,
  });
  assertControlledSchedulerContinuationGuard({
    changeId,
    requestedConcreteGate,
    previousStep,
    previousGateReadinessPreflight,
  });
  return decision;
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
  controlledLoopCurrentTransitionChoice?: SchedulerControlledLoopCurrentTransitionChoice,
  controlledLoopPreDispatchDecision?: ControlledSchedulerContinuationDecision,
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
      controlledLoopPreDispatchDecision,
      controlledLoopCurrentTransitionChoice,
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
        controlledLoopStopSummary: recorded.schedulerControlledStepEvidence.controlledLoopStopSummary,
        controlledLoopBoundaryResult: recorded.schedulerControlledStepEvidence.controlledLoopBoundaryResult,
        controlledLoopRuntimeBoundary: recorded.schedulerControlledStepEvidence.controlledLoopRuntimeBoundary,
        controlledLoopPostStepRoutingDecision: recorded.schedulerControlledStepEvidence.controlledLoopPostStepRoutingDecision,
        controlledLoopPreDispatchDecision: recorded.schedulerControlledStepEvidence.controlledLoopPreDispatchDecision,
        controlledLoopCurrentTransitionChoice: recorded.schedulerControlledStepEvidence.controlledLoopCurrentTransitionChoice,
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

function concreteGateFromRequest(request: WorkflowActionScopeCarrier, actionType: WorkflowActionType, changeId: string): WorkflowActionScopeCarrier & { actionType: WorkflowActionType } {
  return { ...request, actionType, changeId };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
