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
import type { WorkbenchActionHandler } from "../dispatcher.js";
import { resolveProjectRuntimeState } from "../../../project-runtime/coordinator.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../../provider-runtime/project-harness-discovery.js";
import { readProjectHarnessPlanningGate } from "../../../project-harness/planning-gate-query.js";
import { resolveProjectHarnessChangeEvidenceRoot } from "../../../project-harness/change.js";
import {
  projectExecutionRuntimePort,
  projectHarnessExecutionPort,
} from "../../../project-runtime/execution-ports.js";
import {
  skillNativeSchedulerExecutionPort,
  type SchedulerReadySetExecutionPort,
} from "../../../scheduler-runtime/execution-port.js";
import type { ManagedProject } from "../../../types/index.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../types.js";

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
  const bind = (handler: (
    project: ManagedProject,
    changeId: string,
    request: WorkbenchWorkflowActionRequest,
    live: WorkbenchLiveSink | undefined,
    port: SchedulerReadySetExecutionPort,
  ) => Promise<unknown>): WorkbenchActionHandler => async (project, changeId, request, live, conversationId) =>
    withSchedulerExecutionPort(project, changeId, request, conversationId, (port) =>
      handler(project, changeId, request, live, port));
  const concreteHandlers = {
    "planning.scheduler.worker.start-first": bind(startPlanningSchedulerFirstWorker),
    "planning.scheduler.worker.start-next": bind(startPlanningSchedulerNextWorker),
    "planning.scheduler.worker.reconcile-result": bind(reconcilePlanningSchedulerFirstWorkerResult),
    "planning.scheduler.worker.validate-first": bind(validatePlanningSchedulerFirstWorker),
    "planning.scheduler.worker.audit-first": bind(auditPlanningSchedulerFirstWorker),
    "planning.scheduler.worker.rework-plan.compile": bind(compilePlanningSchedulerFirstWorkerReworkPlan),
    "planning.scheduler.worker.rework-start-first": bind(startPlanningSchedulerFirstWorkerRework),
    "planning.scheduler.worker.rework-reconcile-result": bind(reconcilePlanningSchedulerFirstWorkerReworkResult),
    "planning.scheduler.worker.rework-validate-first": bind(validatePlanningSchedulerFirstWorkerRework),
    "planning.scheduler.worker.rework-audit-first": bind(auditPlanningSchedulerFirstWorkerRework),
    "planning.scheduler.integration-candidate.compile": bind(compilePlanningSchedulerIntegrationCandidate),
    "planning.scheduler.integration-check.run": bind(runPlanningSchedulerIntegrationCheckHandoff),
    "planning.scheduler.integration-outcome.reconcile": bind(reconcilePlanningSchedulerIntegrationOutcome),
    "planning.scheduler.run.complete": bind(completePlanningSchedulerRun),
    "planning.scheduler.run.close-blocked": bind(closeBlockedPlanningSchedulerRun),
  } satisfies Pick<WorkbenchActionHandlerMap, SchedulerWorkbenchActionType>;
  return concreteHandlers;
}

async function withSchedulerExecutionPort<T>(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  conversationId: string | undefined,
  action: (port: SchedulerReadySetExecutionPort) => Promise<T>,
): Promise<T> {
  if (!conversationId) throw new Error(`${request.actionType} requires exact Conversation identity.`);
  if (!request.graphScopeId) throw new Error(`${request.actionType} requires graphScopeId.`);
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`${request.actionType} requires a ready project Harness.`);
  const resolution = state.resolution;
  const planning = await readProjectHarnessPlanningGate({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
    conversationId,
    graphScopeId: request.graphScopeId,
    changeId,
  });
  if (planning.graph.graphMode !== "ready-set-v1") {
    throw new Error(`${request.actionType} requires accepted ready-set-v1 planning evidence.`);
  }
  const evidenceRoot = await resolveProjectHarnessChangeEvidenceRoot(
    resolution.harness.skillRoot,
    "active",
    changeId,
  );
  const runtime = projectExecutionRuntimePort(project, resolution);
  const harness = await projectHarnessExecutionPort(project, evidenceRoot, planning);
  return action(skillNativeSchedulerExecutionPort({
    runtime,
    harness,
    skillRoot: resolution.harness.skillRoot,
    sidecarRoot: resolution.paths.sidecarRoot,
    schedulerRunId: request.schedulerRunId ?? "unresolved",
  }));
}
