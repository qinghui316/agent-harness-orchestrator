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
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";

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
  return {
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
  };
}
