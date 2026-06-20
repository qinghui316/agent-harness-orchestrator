import {
  evaluateGoalLoopDecision,
  prepareGoalLoopGateReadinessPreflight,
  refreshGoalLoopControllerPolicy,
} from "./goal-loop.js";
import {
  auditPlanningSchedulerFirstWorker,
  auditPlanningSchedulerFirstWorkerRework,
  checkPlanningSchedulerLaunchPreflight,
  closeBlockedPlanningSchedulerRun,
  compilePlanningSchedulerClaimReconcilePlan,
  compilePlanningSchedulerContract,
  compilePlanningSchedulerFirstWorkerReworkPlan,
  compilePlanningSchedulerIntegrationCandidate,
  compilePlanningSchedulerWorkerSessionPlan,
  completePlanningSchedulerRun,
  generateSchedulerDispatchDryRun,
  initializePlanningSchedulerRuntime,
  preparePlanningSchedulerPlan,
  preparePlanningSchedulerRun,
  reconcilePlanningSchedulerFirstWorkerResult,
  reconcilePlanningSchedulerFirstWorkerReworkResult,
  reconcilePlanningSchedulerIntegrationOutcome,
  reconcilePlanningSchedulerRuntime,
  reservePlanningSchedulerRuntimeClaims,
  runPlanningSchedulerIntegrationCheckHandoff,
  startPlanningSchedulerFirstWorker,
  startPlanningSchedulerFirstWorkerRework,
  startPlanningSchedulerNextWorker,
  validatePlanningSchedulerFirstWorker,
  validatePlanningSchedulerFirstWorkerRework,
} from "./planning.js";
import { compileGoalLoopControllerPolicy, compileGoalLoopEvaluation, compileGoalLoopGateReadinessPreflight } from "../../../goal-loop/manager.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import type { ManagedProject } from "../../../types/index.js";
import { buildControlledSchedulerPostStepHandoff } from "../../controlled-scheduler-handoff.js";
import { assertControlledSchedulerFreshGateMatchesRequest, buildControlledSchedulerAdvanceStepRequest, buildControlledSchedulerStepRequest } from "../../../workflow-scheduler/controlled-step.js";
import { recordSchedulerControlledStepEvidence } from "../../../scheduler-runtime/controlled-step-evidence.js";
import { summarizeSchedulerControlledStepResult } from "../../../scheduler-runtime/controlled-loop-turn.js";
import type { SchedulerControlledStepHandoffSummary } from "../../../scheduler-runtime/types.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction } from "../boundary.js";
import { resolveVisibleControlledSchedulerCurrentGate } from "../visible-goal-loop-current-gate.js";
import type { WorkflowActionScopeCarrier } from "../../../workflow-actions/registry.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";
import { resolveTopic } from "../../topic-resolver.js";
import type { WorkbenchWorkflowActionRequest } from "../../types.js";

type SchedulerWorkbenchActionType =
  | "planning.scheduler.plan.prepare"
  | "planning.scheduler.contract.compile"
  | "planning.scheduler.dispatch.dry-run"
  | "planning.scheduler.worker-plan.compile"
  | "planning.scheduler.claim-reconcile.compile"
  | "planning.scheduler.launch-preflight.check"
  | "planning.scheduler.run.prepare"
  | "planning.scheduler.runtime.initialize"
  | "planning.scheduler.runtime.reconcile"
  | "planning.scheduler.runtime.reserve-claims"
  | "planning.scheduler.controlled-step.run"
  | "planning.scheduler.controlled-advance.run"
  | "planning.scheduler.worker.start-first"
  | "planning.scheduler.worker.start-next"
  | "planning.scheduler.worker.reconcile-result"
  | "planning.scheduler.worker.validate-first"
  | "planning.scheduler.worker.audit-first"
  | "planning.scheduler.worker.rework-plan.compile"
  | "planning.scheduler.worker.rework-start-first"
  | "planning.scheduler.worker.rework-reconcile-result"
  | "planning.scheduler.worker.rework-validate-first"
  | "planning.scheduler.worker.rework-audit-first"
  | "planning.scheduler.integration-candidate.compile"
  | "planning.scheduler.integration-check.run"
  | "planning.scheduler.integration-outcome.reconcile"
  | "planning.scheduler.run.complete"
  | "planning.scheduler.run.close-blocked";

export function buildSchedulerActionHandlers(): Pick<WorkbenchActionHandlerMap, SchedulerWorkbenchActionType> {
  const concreteHandlers = {
    "planning.scheduler.plan.prepare": async (project, changeId, request, live) => preparePlanningSchedulerPlan(project, changeId, request, live),
    "planning.scheduler.contract.compile": async (project, changeId, request, live) => compilePlanningSchedulerContract(project, changeId, request, live),
    "planning.scheduler.dispatch.dry-run": async (project, changeId, request, live) => generateSchedulerDispatchDryRun(project, changeId, request, live),
    "planning.scheduler.worker-plan.compile": async (project, changeId, request, live) => compilePlanningSchedulerWorkerSessionPlan(project, changeId, request, live),
    "planning.scheduler.claim-reconcile.compile": async (project, changeId, request, live) => compilePlanningSchedulerClaimReconcilePlan(project, changeId, request, live),
    "planning.scheduler.launch-preflight.check": async (project, changeId, request, live) => checkPlanningSchedulerLaunchPreflight(project, changeId, request, live),
    "planning.scheduler.run.prepare": async (project, changeId, request, live) => preparePlanningSchedulerRun(project, changeId, request, live),
    "planning.scheduler.runtime.initialize": async (project, changeId, request, live) => initializePlanningSchedulerRuntime(project, changeId, request, live),
    "planning.scheduler.runtime.reconcile": async (project, changeId, request, live) => reconcilePlanningSchedulerRuntime(project, changeId, request, live),
    "planning.scheduler.runtime.reserve-claims": async (project, changeId, request, live) => reservePlanningSchedulerRuntimeClaims(project, changeId, request, live),
    "planning.scheduler.worker.start-first": async (project, changeId, request, live) => startPlanningSchedulerFirstWorker(project, changeId, request, live),
    "planning.scheduler.worker.start-next": async (project, changeId, request, live) => startPlanningSchedulerNextWorker(project, changeId, request, live),
    "planning.scheduler.worker.reconcile-result": async (project, changeId, request, live) => reconcilePlanningSchedulerFirstWorkerResult(project, changeId, request, live),
    "planning.scheduler.worker.validate-first": async (project, changeId, request, live) => validatePlanningSchedulerFirstWorker(project, changeId, request, live),
    "planning.scheduler.worker.audit-first": async (project, changeId, request, live) => auditPlanningSchedulerFirstWorker(project, changeId, request, live),
    "planning.scheduler.worker.rework-plan.compile": async (project, changeId, request, live) => compilePlanningSchedulerFirstWorkerReworkPlan(project, changeId, request, live),
    "planning.scheduler.worker.rework-start-first": async (project, changeId, request, live) => startPlanningSchedulerFirstWorkerRework(project, changeId, request, live),
    "planning.scheduler.worker.rework-reconcile-result": async (project, changeId, request, live) => reconcilePlanningSchedulerFirstWorkerReworkResult(project, changeId, request, live),
    "planning.scheduler.worker.rework-validate-first": async (project, changeId, request, live) => validatePlanningSchedulerFirstWorkerRework(project, changeId, request, live),
    "planning.scheduler.worker.rework-audit-first": async (project, changeId, request, live) => auditPlanningSchedulerFirstWorkerRework(project, changeId, request, live),
    "planning.scheduler.integration-candidate.compile": async (project, changeId, request, live) => compilePlanningSchedulerIntegrationCandidate(project, changeId, request, live),
    "planning.scheduler.integration-check.run": async (project, changeId, request, live) => runPlanningSchedulerIntegrationCheckHandoff(project, changeId, request, live),
    "planning.scheduler.integration-outcome.reconcile": async (project, changeId, request, live) => reconcilePlanningSchedulerIntegrationOutcome(project, changeId, request, live),
    "planning.scheduler.run.complete": async (project, changeId, request, live) => completePlanningSchedulerRun(project, changeId, request, live),
    "planning.scheduler.run.close-blocked": async (project, changeId, request, live) => closeBlockedPlanningSchedulerRun(project, changeId, request, live),
  } satisfies Omit<Pick<WorkbenchActionHandlerMap, SchedulerWorkbenchActionType>, "planning.scheduler.controlled-step.run" | "planning.scheduler.controlled-advance.run">;
  return {
    ...concreteHandlers,
    "planning.scheduler.controlled-step.run": async (project, changeId, request, live) => {
      const { concrete } = buildControlledSchedulerStepRequest(request);
      const concreteRequest = concrete as WorkbenchWorkflowActionRequest;
      assertWorkflowActionScope(concreteRequest);
      await auditHighImpactWorkflowAction(project, changeId, concreteRequest, live);
      const handler = concreteHandlers[concreteRequest.actionType as keyof typeof concreteHandlers];
      if (!handler) throw new Error("planning.scheduler.controlled-step.run requires a supported concrete scheduler gate.");
      const result = await handler(project, changeId, concreteRequest, live);
      return {
        controlledStep: {
          actionType: concreteRequest.actionType,
          changeId,
          schedulerRunId: concreteRequest.schedulerRunId,
          goalLoopNextStepPacketId: concreteRequest.goalLoopNextStepPacketId,
          goalLoopControllerPolicyId: concreteRequest.goalLoopControllerPolicyId,
          goalLoopGateReadinessPreflightId: concreteRequest.goalLoopGateReadinessPreflightId,
          executionStarted: true,
          stoppedAfterOneSchedulerTransition: true,
          loopAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
        },
        result,
      };
    },
    "planning.scheduler.controlled-advance.run": async (project, changeId, request, live) => {
      const concreteActionType = request.goalLoopCurrentGateActionType;
      if (!concreteActionType) throw new Error("planning.scheduler.controlled-advance.run requires goalLoopCurrentGateActionType.");
      const requestedConcreteGate = concreteGateFromRequest(request, concreteActionType, changeId);

      const evaluation = await evaluateGoalLoopDecision(project, changeId, {
        actionType: "planning.goal-loop.evaluate",
        changeId,
      } as WorkbenchWorkflowActionRequest, live);
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
      } as WorkbenchWorkflowActionRequest;
      assertWorkflowActionScope(controllerRequest);
      await auditHighImpactWorkflowAction(project, changeId, controllerRequest, live);
      const controller = await refreshGoalLoopControllerPolicy(project, changeId, controllerRequest, live);
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
      } as WorkbenchWorkflowActionRequest;
      assertWorkflowActionScope(preflightRequest);
      await auditHighImpactWorkflowAction(project, changeId, preflightRequest, live);
      const preflight = await prepareGoalLoopGateReadinessPreflight(project, changeId, preflightRequest, live);
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
      const controlledStepResult = await (buildSchedulerActionHandlers()["planning.scheduler.controlled-step.run"])(project, changeId, wrapper as WorkbenchWorkflowActionRequest, live);
      const controlledStepPayload = controlledStepResult as {
        controlledStep?: unknown;
        result?: unknown;
      };
      const postStep = await recordControlledAdvancePostStepEvaluation(project, changeId);
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
    },
  };
}

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

async function recordControlledAdvancePostStepEvaluation(
  project: ManagedProject,
  changeId: string,
): Promise<ControlledAdvancePostStepEvaluation | ControlledAdvancePostStepWarning> {
  try {
    const { memory, changePath } = await resolveTopic(project, changeId);
    assertWritableMemory(memory, "Controlled scheduler post-step Goal Loop evaluation");
    const { goalLoopDecision, goalLoopIteration, goalLoopContinuationBrief, goalLoopNextStepPacket } = await compileGoalLoopEvaluation(memory, changePath);
    const readiness = await recordControlledAdvancePostStepReadiness(
      project,
      changeId,
      memory,
      changePath,
      goalLoopNextStepPacket.id,
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
  project: ManagedProject,
  changeId: string,
  memory: Awaited<ReturnType<typeof resolveTopic>>["memory"],
  changePath: string,
  goalLoopNextStepPacketId: string,
): Promise<Pick<ControlledAdvancePostStepEvaluation, "postStepGoalLoopReadiness" | "postStepGoalLoopReadinessWarning">> {
  const visibleGate = await resolveVisibleControlledSchedulerCurrentGate(project, changeId, goalLoopNextStepPacketId);
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function concreteGateFromRequest(request: WorkbenchWorkflowActionRequest, actionType: string, changeId: string): WorkflowActionScopeCarrier {
  return { ...request, actionType, changeId };
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
