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
import { runMainAgentControlledSchedulerStep } from "../../../main-agent-orchestration/controlled-scheduler-step-bridge.js";
import { buildControlledSchedulerStepRequest } from "../../../workflow-scheduler/controlled-step.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction } from "../boundary.js";
import { resolveVisibleControlledSchedulerCurrentGate } from "../visible-goal-loop-current-gate.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";
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
      return runMainAgentControlledSchedulerStep(project, changeId, request as WorkbenchWorkflowActionRequest & { actionType: "planning.scheduler.controlled-advance.run" }, {
        evaluateGoalLoopDecision: (nextRequest) => evaluateGoalLoopDecision(project, changeId, nextRequest as WorkbenchWorkflowActionRequest, live),
        refreshGoalLoopControllerPolicy: (nextRequest) => refreshGoalLoopControllerPolicy(project, changeId, nextRequest as WorkbenchWorkflowActionRequest, live),
        prepareGoalLoopGateReadinessPreflight: (nextRequest, options) => prepareGoalLoopGateReadinessPreflight(project, changeId, nextRequest as WorkbenchWorkflowActionRequest, live, options),
        auditHighImpactAction: async (nextRequest) => {
          const workflowRequest = nextRequest as WorkbenchWorkflowActionRequest;
          assertWorkflowActionScope(workflowRequest);
          await auditHighImpactWorkflowAction(project, changeId, workflowRequest, live);
        },
        dispatchControlledStep: (stepRequest) => buildSchedulerActionHandlers()["planning.scheduler.controlled-step.run"](project, changeId, stepRequest as WorkbenchWorkflowActionRequest, live),
        resolveVisibleCurrentGate: (goalLoopNextStepPacketId) => resolveVisibleControlledSchedulerCurrentGate(project, changeId, goalLoopNextStepPacketId),
      });
    },
  };
}
