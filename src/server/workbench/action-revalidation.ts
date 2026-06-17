import { getActiveChanges } from "../../ecl/index.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { assertGoalLoopAssistedConcreteGateConfirmation } from "../../workbench/actions/goal-loop-gate-confirmation.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { revalidatedWorkflowActionSet, workflowActionScopesMatchStrict } from "../../workflow-actions/registry.js";
import type { WorkbenchActionRequest } from "./types.js";

const REVALIDATED_WORKFLOW_ACTION_IDS = revalidatedWorkflowActionSet();

export async function assertCurrentWorkflowAction(input: WorkbenchProjectInput, body: WorkbenchActionRequest): Promise<void> {
  if (!body.actionType || !REVALIDATED_WORKFLOW_ACTION_IDS.has(body.actionType)) return;
  const snapshot = await getWorkbenchSnapshot(input, { topicId: body.changeId });
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
    if (!goalLoopCurrentGateScopeMatches(goalLoop.recommendedActionType, body.changeId, goalLoop.recommendedActionScope, nextAction)) {
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
      ...readGoalLoopCurrentGateRequestScope(body, goalLoop.recommendedActionScope),
    };
    if (!goalLoopCurrentGateScopeMatches(goalLoop.recommendedActionType, body.changeId, goalLoop.recommendedActionScope, nextAction) || !workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
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
      ...readGoalLoopCurrentGateRequestScope(body, goalLoop.recommendedActionScope),
    };
    if (!goalLoopCurrentGateScopeMatches(goalLoop.recommendedActionType, body.changeId, goalLoop.recommendedActionScope, nextAction) || !workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
      const error = new Error("Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
    return;
  }
  const queue = snapshot.right.confirmationQueue;
  const queueActions = [queue.primary, ...queue.current, ...queue.otherDemands]
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
  if (!match) {
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
      await assertGoalLoopAssistedConcreteGateConfirmation(memory, target.path, body.changeId, body, { visibleGate: match });
    } catch (cause) {
      const error = new Error(cause instanceof Error ? cause.message : "Workflow action target is stale or no longer available.");
      error.name = "Conflict";
      throw error;
    }
  }
}

function readGoalLoopCurrentGateRequestScope(body: WorkbenchActionRequest, expectedScope: Record<string, unknown>): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const values = body as unknown as Record<string, unknown>;
  for (const key of Object.keys(expectedScope)) {
    if (key === "changeId") continue;
    const value = values[key];
    if (typeof value === "string") result[key] = value;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) result[key] = value;
  }
  return result;
}

function goalLoopCurrentGateScopeMatches(
  actionType: string,
  changeId: string | undefined,
  expectedScope: Record<string, unknown>,
  actual: unknown,
): boolean {
  const actualRecord = actual as Record<string, unknown>;
  if (actualRecord.actionType !== actionType) return false;
  if (changeId && actualRecord.changeId && actualRecord.changeId !== changeId) return false;
  for (const [key, expected] of Object.entries(expectedScope)) {
    const expectedValue = key === "changeId" ? changeId ?? expected : expected;
    const actualValue = key === "changeId" ? actualRecord.changeId ?? changeId : actualRecord[key];
    if (!goalLoopScopeValuesEqual(expectedValue, actualValue)) return false;
  }
  return true;
}

function goalLoopScopeValuesEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeGoalLoopScopeValues(left);
  const normalizedRight = normalizeGoalLoopScopeValues(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizeGoalLoopScopeValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return [...value].sort();
  return [];
}
