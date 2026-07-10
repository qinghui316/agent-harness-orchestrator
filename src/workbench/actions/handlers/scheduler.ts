import {
  auditPlanningSchedulerFirstWorker,
  auditPlanningSchedulerFirstWorkerRework,
  closeBlockedPlanningSchedulerRun,
  compilePlanningSchedulerFirstWorkerReworkPlan,
  compilePlanningSchedulerIntegrationCandidate,
  completePlanningSchedulerRun,
  reconcilePlanningSchedulerFirstWorkerResult,
  reconcilePlanningSchedulerFirstWorkerReworkResult,
  reconcilePlanningSchedulerIntegrationOutcome,
  runPlanningSchedulerIntegrationCheckHandoff,
  startPlanningSchedulerFirstWorker,
  startPlanningSchedulerFirstWorkerRework,
  startPlanningSchedulerNextWorker,
  validatePlanningSchedulerFirstWorker,
  validatePlanningSchedulerFirstWorkerRework,
} from "./planning.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";

type SchedulerWorkbenchActionType =
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
  } satisfies Pick<WorkbenchActionHandlerMap, SchedulerWorkbenchActionType>;
  return concreteHandlers;
}
