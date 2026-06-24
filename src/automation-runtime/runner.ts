import type { ResolvedMemory } from "../types/index.js";
import type { WorkflowActionScopeCarrier, WorkflowActionType } from "../workflow-actions/registry.js";
import { AUTOMATION_HARD_MAX_STEPS, SCOPED_AUTOMATION_ACTION_TYPE, SCOPED_AUTOMATION_ALLOWED_ACTION_TYPES, clampAutomationMaxSteps, isScopedAutomationAllowedAction, isScopedAutomationTerminalHumanGate } from "./policy.js";
import {
  automationRuntimeArtifactRefs,
  automationStopReasonSummary,
  createAutomationRuntimeId,
  writeAutomationAuthorization,
  writeAutomationIteration,
  writeAutomationRun,
} from "./repository.js";
import type { AutomationAcceptedArtifactHashes, AutomationAuthorization, AutomationIteration, AutomationRun, AutomationSourceState, AutomationStopReason } from "./types.js";

export interface ScopedAutomationRequest extends WorkflowActionScopeCarrier {
  actionType: typeof SCOPED_AUTOMATION_ACTION_TYPE;
  changeId: string;
  automationMode: "full-access";
  automationCurrentGateActionType: WorkflowActionType;
  maxSteps?: number;
}

export interface ScopedAutomationServices {
  resolveCurrentPrimaryGate(previousResult: unknown | null): Promise<WorkflowActionScopeCarrier & { actionType: WorkflowActionType } | { stopReason: AutomationStopReason; summary: string }>;
  dispatchChildAction(request: WorkflowActionScopeCarrier & { actionType: WorkflowActionType }, auditScope: Record<string, unknown>): Promise<unknown>;
  summarizeChildResult(actionType: WorkflowActionType, result: unknown): string;
  checkSafety?(previousResult: unknown | null): Promise<{ stopReason: "source-drift" | "accepted-artifact-drift"; summary: string } | null>;
}

export interface ScopedAutomationResult {
  authorization: AutomationAuthorization;
  automationRun: AutomationRun;
  iterations: AutomationIteration[];
  childResults: unknown[];
  stopReason: AutomationStopReason;
  summary: string;
  artifactRefs: string[];
}

export async function runScopedAutomation(input: {
  memory: ResolvedMemory;
  changePath: string;
  projectId: string;
  sourceState: AutomationSourceState;
  acceptedArtifactHashes: AutomationAcceptedArtifactHashes;
  request: ScopedAutomationRequest;
  services: ScopedAutomationServices;
}): Promise<ScopedAutomationResult> {
  const { memory, changePath, projectId, request, sourceState, acceptedArtifactHashes, services } = input;
  const maxSteps = clampAutomationMaxSteps(request.maxSteps);
  const authId = createAutomationRuntimeId("automation-authorization", `${projectId}:${request.changeId}:${request.automationCurrentGateActionType}`);
  const authRefs = automationRuntimeArtifactRefs(memory, changePath, authId);
  const authorization: AutomationAuthorization = {
    version: "1.0",
    id: authId,
    projectId,
    changeId: request.changeId,
    authority: "human-confirmed-scoped-automation-authorization",
    actionType: SCOPED_AUTOMATION_ACTION_TYPE,
    mode: "full-access",
    codexRuntimeCapability: "full-access",
    allowedActionTypes: [...SCOPED_AUTOMATION_ALLOWED_ACTION_TYPES],
    maxSteps,
    hardMaxSteps: AUTOMATION_HARD_MAX_STEPS,
    requestedGate: { ...request },
    sourceState,
    acceptedArtifactHashes,
    humanConfirmed: true,
    scopedToCurrentChangeOnly: true,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    remoteLandingAuthorized: false,
    harnessEvolutionAuthorized: false,
    parallelExecutorAuthorized: false,
    artifact: authRefs.artifact,
    markdownArtifact: authRefs.markdownArtifact,
    createdAt: new Date().toISOString(),
  };
  await writeAutomationAuthorization(memory, changePath, authorization);

  const runId = createAutomationRuntimeId("automation-run", authorization.id);
  const runRefs = automationRuntimeArtifactRefs(memory, changePath, runId);
  const automationRun: AutomationRun = {
    version: "1.0",
    id: runId,
    projectId,
    changeId: request.changeId,
    authority: "scoped-automation-runtime-run",
    automationAuthorizationId: authorization.id,
    status: "running",
    maxSteps,
    completedSteps: 0,
    iterations: [],
    artifact: runRefs.artifact,
    markdownArtifact: runRefs.markdownArtifact,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeAutomationRun(memory, changePath, automationRun);

  const iterations: AutomationIteration[] = [];
  const childResults: unknown[] = [];
  let previousResult: unknown | null = null;
  let stopReason: AutomationStopReason = "max-steps";
  let stopSummary = automationStopReasonSummary("max-steps");

  for (let index = 0; index < maxSteps; index += 1) {
    const safety = services.checkSafety ? await services.checkSafety(previousResult) : null;
    if (safety) {
      stopReason = safety.stopReason;
      stopSummary = safety.summary;
      break;
    }

    const next = await services.resolveCurrentPrimaryGate(previousResult);
    if ("stopReason" in next) {
      stopReason = next.stopReason;
      stopSummary = next.summary;
      break;
    }
    if (isScopedAutomationTerminalHumanGate(next.actionType)) {
      stopReason = "terminal-human-gate";
      stopSummary = automationStopReasonSummary("terminal-human-gate");
      break;
    }
    if (!isScopedAutomationAllowedAction(next.actionType)) {
      stopReason = "unsupported-gate";
      stopSummary = automationStopReasonSummary("unsupported-gate");
      break;
    }

    const iterationId = createAutomationRuntimeId("automation-iteration", `${automationRun.id}:${index + 1}`);
    const iterationRefs = automationRuntimeArtifactRefs(memory, changePath, iterationId);
    const auditScope = {
      coveredByAutomationAuthorizationId: authorization.id,
      automationRunId: automationRun.id,
      automationIterationOrdinal: index + 1,
    };
    try {
      const childRequest = {
        ...next,
        automationAuthorizationId: authorization.id,
        automationRunId: automationRun.id,
      };
      const result = await services.dispatchChildAction(childRequest, auditScope);
      childResults.push(result);
      previousResult = result;
      const iteration: AutomationIteration = {
        version: "1.0",
        id: iterationId,
        projectId,
        changeId: request.changeId,
        automationAuthorizationId: authorization.id,
        automationRunId: automationRun.id,
        ordinal: index + 1,
        submittedActionType: next.actionType,
        currentGateActionType: next.actionType,
        currentGateScope: { ...next },
        status: "completed",
        resultSummary: services.summarizeChildResult(next.actionType, result),
        childAuditScope: {
          coveredByAutomationAuthorizationId: authorization.id,
          automationRunId: automationRun.id,
        },
        artifact: iterationRefs.artifact,
        markdownArtifact: iterationRefs.markdownArtifact,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      iterations.push(iteration);
      automationRun.iterations.push(iteration.id);
      automationRun.completedSteps = iterations.length;
      automationRun.updatedAt = new Date().toISOString();
      await writeAutomationIteration(memory, changePath, iteration);
      await writeAutomationRun(memory, changePath, automationRun);
    } catch (error) {
      stopReason = "handler-failed";
      stopSummary = error instanceof Error ? error.message : String(error);
      const iteration: AutomationIteration = {
        version: "1.0",
        id: iterationId,
        projectId,
        changeId: request.changeId,
        automationAuthorizationId: authorization.id,
        automationRunId: automationRun.id,
        ordinal: index + 1,
        submittedActionType: next.actionType,
        currentGateActionType: next.actionType,
        currentGateScope: { ...next },
        status: "failed",
        stopReason,
        error: stopSummary,
        childAuditScope: {
          coveredByAutomationAuthorizationId: authorization.id,
          automationRunId: automationRun.id,
        },
        artifact: iterationRefs.artifact,
        markdownArtifact: iterationRefs.markdownArtifact,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      iterations.push(iteration);
      automationRun.iterations.push(iteration.id);
      automationRun.updatedAt = new Date().toISOString();
      await writeAutomationIteration(memory, changePath, iteration);
      break;
    }
  }

  automationRun.status = stopReason === "handler-failed" ? "failed" : stopReason === "max-steps" ? "completed" : "stopped";
  automationRun.completedSteps = iterations.filter((iteration) => iteration.status === "completed").length;
  automationRun.stopReason = stopReason;
  automationRun.stopSummary = stopSummary;
  automationRun.updatedAt = new Date().toISOString();
  automationRun.completedAt = new Date().toISOString();
  await writeAutomationRun(memory, changePath, automationRun);

  return {
    authorization,
    automationRun,
    iterations,
    childResults,
    stopReason,
    summary: stopSummary,
    artifactRefs: [authorization.artifact, automationRun.artifact, ...iterations.map((iteration) => iteration.artifact)],
  };
}
