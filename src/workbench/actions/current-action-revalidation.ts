import { getActiveChanges } from "../../ecl/index.js";
import { listAuditResults } from "../../audit/artifacts.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject } from "../../types/index.js";
import type { WorkbenchApprovalAction } from "../read-model-types.js";
import { isScopedAutomationAllowedAction, isScopedAutomationAllowedApprovalAction } from "../../automation-runtime/policy.js";
import { revalidatedWorkflowActionSet, workflowActionScopesMatchStrict } from "../../workflow-actions/registry.js";
import { currentGateScopeMatches, readCurrentGateRequestScope } from "../../workflow-actions/current-gate.js";
import { CONTROLLED_SCHEDULER_STEP_ACTION_TYPE, buildControlledSchedulerStepRequest } from "../../workflow-scheduler/controlled-step.js";
import { assertGoalLoopAssistedConcreteGateConfirmation } from "./goal-loop-gate-confirmation.js";
import type { WorkbenchWorkflowActionRequest } from "../types.js";
import { assessMainAgentActionBridge, type MainAgentActionBridgeGate } from "../../main-agent-orchestration/index.js";

const REVALIDATED_WORKFLOW_ACTION_IDS = revalidatedWorkflowActionSet();

export type CurrentWorkflowActionRequest = Partial<WorkbenchWorkflowActionRequest> & {
  actionType?: WorkbenchWorkflowActionRequest["actionType"];
};

export interface CurrentWorkflowActionInput {
  project: ManagedProject | null;
  path: string;
}

type SnapshotAction = Record<string, unknown> & {
  kind?: string;
  actionType?: string;
  changeId?: string;
  enabled?: boolean;
  approvalId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  action?: Partial<WorkbenchApprovalAction>;
  actions?: SnapshotAction[];
};

type SnapshotGoalLoop = Record<string, unknown> & {
  goalLoopNextStepPacketId?: string;
  controllerPolicyId?: string;
  gateReadinessPreflightId?: string;
  controllerVerdict?: string;
  controllerGateStatus?: string;
  recommendedActionType?: string;
  recommendedActionScope?: Record<string, unknown>;
};

interface CurrentWorkflowActionSnapshot {
  center: {
    workpad: {
      goalLoop?: SnapshotGoalLoop;
      nextAction: SnapshotAction;
      taskQueue?: { nextAction?: SnapshotAction };
    };
  };
  right: {
    confirmationQueue: {
      primary: { changeId?: string; runId?: string; resultId?: string; evidenceRefs?: string[]; actions: SnapshotAction[] } | null;
      current: Array<{ actions: SnapshotAction[] }>;
      otherDemands: Array<{ actions: SnapshotAction[] }>;
      maintenance?: Array<{ actions: SnapshotAction[] }>;
    };
    agentWorkspace?: {
      agents?: Array<{ actions?: SnapshotAction[] }>;
    };
  };
}

export interface CurrentWorkflowActionDeps {
  getWorkbenchSnapshot(input: CurrentWorkflowActionInput, options?: { topicId?: string }): Promise<unknown>;
}

export async function assertCurrentWorkflowAction(input: CurrentWorkflowActionInput, body: CurrentWorkflowActionRequest, deps: CurrentWorkflowActionDeps): Promise<void> {
  let preloadedSnapshot: CurrentWorkflowActionSnapshot | undefined;
  if (body.mainAgentLoopRunId || body.mainAgentNextStepEvidenceId) {
    if (!input.project || !body.changeId || !body.actionType || !body.mainAgentLoopRunId || !body.mainAgentNextStepEvidenceId) throwStaleWorkflowTarget();
    preloadedSnapshot = await deps.getWorkbenchSnapshot(input, { topicId: body.changeId }) as CurrentWorkflowActionSnapshot;
    const gate = findVisibleWorkflowActionBridgeGate(preloadedSnapshot, body);
    const memory = await resolveProjectMemory(input.project);
    const assessment = await assessMainAgentActionBridge({
      memory,
      projectId: input.project.id,
      changeId: body.changeId,
      loopRunId: body.mainAgentLoopRunId,
      evidenceId: body.mainAgentNextStepEvidenceId,
      gate,
    });
    if (assessment.status !== "ready") throwStaleWorkflowTarget();
  }
  if (!body.actionType || !REVALIDATED_WORKFLOW_ACTION_IDS.has(body.actionType)) return;
  const snapshot = preloadedSnapshot ?? await deps.getWorkbenchSnapshot(input, { topicId: body.changeId }) as CurrentWorkflowActionSnapshot;
  if (body.actionType === "planning.goal-loop.feedback.evaluate") {
    const goalLoop = snapshot.center.workpad.goalLoop;
    const nextAction = snapshot.center.workpad.nextAction;
    if (!body.goalLoopNextStepPacketId || !goalLoop || goalLoop.goalLoopNextStepPacketId !== body.goalLoopNextStepPacketId) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (!goalLoop.recommendedActionType || !goalLoop.recommendedActionScope || nextAction.kind !== "workflow-action" || nextAction.actionType !== goalLoop.recommendedActionType) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (!currentGateScopeMatches({ actionType: goalLoop.recommendedActionType, changeId: body.changeId, expectedScope: goalLoop.recommendedActionScope, actual: nextAction })) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    return;
  }
  if (body.actionType === "planning.goal-loop.controller.refresh") {
    const goalLoop = snapshot.center.workpad.goalLoop;
    const nextAction = snapshot.center.workpad.nextAction;
    if (!body.goalLoopNextStepPacketId || !body.goalLoopCurrentGateActionType || !goalLoop || goalLoop.goalLoopNextStepPacketId !== body.goalLoopNextStepPacketId) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (!goalLoop.recommendedActionType || !goalLoop.recommendedActionScope || nextAction.kind !== "workflow-action" || nextAction.actionType !== goalLoop.recommendedActionType) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (body.goalLoopCurrentGateActionType !== goalLoop.recommendedActionType || body.goalLoopCurrentGateActionType !== nextAction.actionType) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    const expectedGate = { actionType: goalLoop.recommendedActionType, changeId: body.changeId, ...goalLoop.recommendedActionScope };
    const requestedGate = {
      actionType: body.goalLoopCurrentGateActionType,
      changeId: body.changeId,
      ...readCurrentGateRequestScope(body, goalLoop.recommendedActionScope),
    };
    if (!currentGateScopeMatches({ actionType: goalLoop.recommendedActionType, changeId: body.changeId, expectedScope: goalLoop.recommendedActionScope, actual: nextAction }) || !workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    return;
  }
  if (body.actionType === "planning.goal-loop.gate-readiness.prepare") {
    const goalLoop = snapshot.center.workpad.goalLoop;
    const nextAction = snapshot.center.workpad.nextAction;
    if (
      !body.goalLoopNextStepPacketId
      || !body.goalLoopControllerPolicyId
      || !body.goalLoopCurrentGateActionType
      || !goalLoop
      || goalLoop.goalLoopNextStepPacketId !== body.goalLoopNextStepPacketId
      || goalLoop.controllerPolicyId !== body.goalLoopControllerPolicyId
    ) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (
      goalLoop.controllerVerdict !== "recommend-existing-gate"
      || goalLoop.controllerGateStatus !== "matches-current-gate"
      || !goalLoop.recommendedActionType
      || !goalLoop.recommendedActionScope
      || nextAction.kind !== "workflow-action"
      || nextAction.actionType !== goalLoop.recommendedActionType
    ) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (body.goalLoopCurrentGateActionType !== goalLoop.recommendedActionType || body.goalLoopCurrentGateActionType !== nextAction.actionType || body.goalLoopCurrentGateActionType.startsWith("planning.goal-loop.")) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    const expectedGate = { actionType: goalLoop.recommendedActionType, changeId: body.changeId, ...goalLoop.recommendedActionScope };
    const requestedGate = {
      actionType: body.goalLoopCurrentGateActionType,
      changeId: body.changeId,
      ...readCurrentGateRequestScope(body, goalLoop.recommendedActionScope),
    };
    if (!currentGateScopeMatches({ actionType: goalLoop.recommendedActionType, changeId: body.changeId, expectedScope: goalLoop.recommendedActionScope, actual: nextAction }) || !workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    return;
  }
  if (body.actionType === "planning.goal-loop.controlled-continue.run") {
    const goalLoop = snapshot.center.workpad.goalLoop;
    const nextAction = snapshot.center.workpad.nextAction;
    if (
      !body.goalLoopNextStepPacketId
      || !body.goalLoopControllerPolicyId
      || !body.goalLoopGateReadinessPreflightId
      || !body.goalLoopCurrentGateActionType
      || !goalLoop
      || goalLoop.goalLoopNextStepPacketId !== body.goalLoopNextStepPacketId
      || goalLoop.controllerPolicyId !== body.goalLoopControllerPolicyId
      || goalLoop.gateReadinessPreflightId !== body.goalLoopGateReadinessPreflightId
    ) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (
      goalLoop.controllerVerdict !== "recommend-existing-gate"
      || goalLoop.controllerGateStatus !== "matches-current-gate"
      || !goalLoop.recommendedActionType
      || !goalLoop.recommendedActionScope
      || nextAction.kind !== "workflow-action"
      || nextAction.actionType !== goalLoop.recommendedActionType
    ) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (
      body.goalLoopCurrentGateActionType !== goalLoop.recommendedActionType
      || body.goalLoopCurrentGateActionType !== nextAction.actionType
      || body.goalLoopCurrentGateActionType.startsWith("planning.goal-loop.")
      || !body.goalLoopCurrentGateActionType.startsWith("planning.scheduler.")
    ) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    const expectedGate = { actionType: goalLoop.recommendedActionType, changeId: body.changeId, ...goalLoop.recommendedActionScope };
    const requestedGate = {
      actionType: body.goalLoopCurrentGateActionType,
      changeId: body.changeId,
      ...readCurrentGateRequestScope(body, goalLoop.recommendedActionScope),
    };
    if (!currentGateScopeMatches({ actionType: goalLoop.recommendedActionType, changeId: body.changeId, expectedScope: goalLoop.recommendedActionScope, actual: nextAction }) || !workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    return;
  }
  if (body.actionType === "planning.automation.scoped-auto.run") {
    const primary = snapshot.right.confirmationQueue.primary;
    if (body.automationCurrentGateApprovalActionId) {
      await assertCurrentAutomationApprovalAction(input, body, deps, snapshot);
      return;
    }
    if (!isScopedAutomationAllowedAction(body.automationCurrentGateActionType)) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    const primaryWorkflowAction = primary?.actions.find((action: Record<string, unknown>) => action.kind === "workflow-action" && action.actionType === body.automationCurrentGateActionType);
    if (
      !primaryWorkflowAction
      || !body.automationCurrentGateActionType
      || !body.changeId
      || primaryWorkflowAction.enabled !== true
      || (primaryWorkflowAction.changeId && primaryWorkflowAction.changeId !== body.changeId)
    ) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    const expectedGate = { ...primaryWorkflowAction, actionType: body.automationCurrentGateActionType, changeId: body.changeId };
    const requestedGate = {
      ...body,
      actionType: body.automationCurrentGateActionType,
      changeId: body.changeId,
    };
    if (!workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    return;
  }
  const queue = snapshot.right.confirmationQueue;
  const queueActions = [queue.primary, ...queue.current, ...queue.otherDemands, ...(queue.maintenance ?? [])]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .flatMap((item) => item.actions);
  const agentWorkspaceActions = snapshot.right.agentWorkspace?.agents?.flatMap((agent) => agent.actions ?? []) ?? [];
  const nextAction = snapshot.center.workpad.nextAction;
  const taskQueueNextAction = snapshot.center.workpad.taskQueue?.nextAction;
  const actions = [
    ...queueActions,
    ...agentWorkspaceActions,
    ...(nextAction.kind === "workflow-action" && nextAction.actionType ? [nextAction] : []),
    ...(taskQueueNextAction?.actionType ? [{ ...taskQueueNextAction, kind: "workflow-action" as const, changeId: body.changeId }] : []),
  ];
  const match = actions.find((action) => action.kind === "workflow-action"
    && action.actionType === body.actionType
    && (!action.changeId || action.changeId === body.changeId)
    && workflowActionScopesMatchStrict(action, body));
  if (!match) {
    const error = new Error("Workflow action target is stale or no longer available.");
    error.name = "Conflict";
    throw error;
  }
  if (match.enabled === false) {
    const error = new Error("Workflow action target is stale or no longer available.");
    error.name = "Conflict";
    throw error;
  }
  if (body.goalLoopGateReadinessPreflightId) {
    if (match.enabled !== true) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    if (!body.changeId || !input.project) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    const memory = await resolveProjectMemory(input.project);
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === body.changeId);
    if (!target) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    try {
      const concreteRequest = body.actionType === CONTROLLED_SCHEDULER_STEP_ACTION_TYPE
        ? buildControlledSchedulerStepRequest(body).concrete
        : body;
      await assertGoalLoopAssistedConcreteGateConfirmation(memory, target.path, body.changeId, concreteRequest, body.actionType === CONTROLLED_SCHEDULER_STEP_ACTION_TYPE ? {} : { visibleGate: match });
    } catch (cause) {
      const error = new Error(cause instanceof Error ? cause.message : "Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
  }
}

function findVisibleWorkflowActionBridgeGate(snapshot: CurrentWorkflowActionSnapshot, body: CurrentWorkflowActionRequest): MainAgentActionBridgeGate | null {
  if (!body.actionType) return null;
  const queue = snapshot.right.confirmationQueue;
  const queueActions = [queue.primary, ...queue.current, ...queue.otherDemands, ...(queue.maintenance ?? [])]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .flatMap((item) => item.actions);
  const nextAction = snapshot.center.workpad.nextAction;
  const taskQueueNextAction = snapshot.center.workpad.taskQueue?.nextAction;
  const actions = [
    ...queueActions,
    ...(nextAction.kind === "workflow-action" && nextAction.actionType ? [nextAction] : []),
    ...(taskQueueNextAction?.actionType ? [{ ...taskQueueNextAction, kind: "workflow-action" as const, changeId: body.changeId }] : []),
  ];
  const match = actions.find((action) => action.kind === "workflow-action"
    && action.actionType === body.actionType
    && (!action.changeId || action.changeId === body.changeId)
    && workflowActionScopesMatchStrict(action, body));
  if (!match || !match.actionType) return null;
  return {
    kind: "workflow-action",
    actionType: match.actionType,
    changeId: typeof match.changeId === "string" ? match.changeId : body.changeId,
    enabled: match.enabled,
    scope: match,
  };
}

export async function assertCurrentAutomationApprovalAction(
  input: CurrentWorkflowActionInput,
  body: CurrentWorkflowActionRequest,
  _deps: CurrentWorkflowActionDeps,
  existingSnapshot?: CurrentWorkflowActionSnapshot,
): Promise<void> {
  const snapshot = existingSnapshot ?? await _deps.getWorkbenchSnapshot(input, { topicId: body.changeId }) as CurrentWorkflowActionSnapshot;
  const primary = snapshot.right.confirmationQueue.primary;
  const actionId = body.automationCurrentGateApprovalActionId;
  const primaryApprovalAction = primary?.actions.find((action) =>
    action.kind === "approval"
    && action.enabled !== false
    && action.action?.actionId === actionId
  );
  if (
    !primary
    || !primaryApprovalAction
    || !actionId
    || !isScopedAutomationAllowedApprovalAction(actionId)
    || !body.changeId
    || (primary.changeId && primary.changeId !== body.changeId)
    || (primaryApprovalAction.changeId && primaryApprovalAction.changeId !== body.changeId)
  ) {
    throwStaleWorkflowTarget();
  }
  const targetId = body.automationCurrentGateTargetId;
  const currentTargetId = primary.resultId ?? primaryApprovalAction.targetId ?? automationApprovalTargetFromArgs(actionId, primaryApprovalAction.action?.args);
  if (!targetId || currentTargetId !== targetId) throwStaleWorkflowTarget();
  if (body.automationCurrentGateRunId && primary.runId && body.automationCurrentGateRunId !== primary.runId) throwStaleWorkflowTarget();
  const currentArtifact = primary.evidenceRefs?.[0] ?? primaryApprovalAction.artifact;
  if (body.automationCurrentGateArtifact && currentArtifact && body.automationCurrentGateArtifact !== currentArtifact) throwStaleWorkflowTarget();

  if (actionId !== "audit.accept") return;

  if (!input.project) throwStaleWorkflowTarget();
  const memory = await resolveProjectMemory(input.project);
  const audits = await listAuditResults(memory, body.changeId).catch(() => []);
  const audit = audits.find((item) => item.id === targetId);
  if (
    !audit
    || audit.changeId !== body.changeId
    || audit.status !== "approved"
    || (body.automationCurrentGateRunId && audit.runId !== body.automationCurrentGateRunId)
    || (body.automationCurrentGateArtifact && audit.artifacts.audit !== body.automationCurrentGateArtifact)
  ) {
    throwStaleWorkflowTarget();
  }
}

function automationApprovalTargetFromArgs(actionId: string, args: string[] | undefined): string | undefined {
  if (!args) return undefined;
  if (actionId === "result.apply") return args[3] ?? args[2];
  return args[2];
}

function throwStaleWorkflowTarget(): never {
  const error = new Error("Workflow action target is stale or no longer available.");
  error.name = "Conflict";
  throw error;
}
