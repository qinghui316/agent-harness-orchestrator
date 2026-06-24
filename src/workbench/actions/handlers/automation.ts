import { runScopedAutomation } from "../../../automation-runtime/runner.js";
import { captureAcceptedArtifactHashes, captureAutomationSourceState } from "../../../automation-runtime/safety.js";
import type { AutomationStopReason } from "../../../automation-runtime/types.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import type { ManagedProject } from "../../../types/index.js";
import { isWorkflowActionType, workflowActionScopesMatchStrict, type WorkflowActionType } from "../../../workflow-actions/registry.js";
import { emitAssistantEvent } from "../../live-events.js";
import { getWorkbenchSnapshot } from "../../manager.js";
import { resolveTopic } from "../../topic-resolver.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchDecisionAction } from "../../read-model-types.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../types.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction } from "../boundary.js";
import { assertCurrentWorkflowAction } from "../current-action-revalidation.js";
import { dispatchWorkbenchWorkflowAction, type WorkbenchActionHandlerMap } from "../dispatcher.js";
import { summarizeActionResult } from "../results.js";

const AUTOMATION_INTERNAL_SNAPSHOT_OPTIONS = {
  ignoreActiveWorkflowActions: true,
  ignoreActiveWorkflowActionTypes: ["planning.automation.scoped-auto.run"],
} as const;

export async function runScopedAutomationAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  handlers: WorkbenchActionHandlerMap,
) {
  const automationRequest = assertScopedAutomationRequest(changeId, request);
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Workbench scoped automation runtime");
  const [sourceState, acceptedArtifactHashes] = await Promise.all([
    captureAutomationSourceState(memory),
    captureAcceptedArtifactHashes(memory, changePath),
  ]);

  const result = await runScopedAutomation({
    memory,
    changePath,
    projectId: project.id,
    sourceState,
    acceptedArtifactHashes,
    request: automationRequest,
    services: {
      resolveCurrentPrimaryGate: async () => resolveCurrentPrimaryWorkflowGate(project, changeId),
      dispatchChildAction: async (childRequest, auditScope) => {
        const workflowRequest = {
          ...childRequest,
          changeId,
          automationAuthorizationId: readString(auditScope, "coveredByAutomationAuthorizationId"),
          automationRunId: readString(auditScope, "automationRunId"),
        } as WorkbenchWorkflowActionRequest;
        assertWorkflowActionScope(workflowRequest);
        await assertCurrentWorkflowAction({ project, path: project.path }, workflowRequest, { getWorkbenchSnapshot: getAutomationInternalSnapshot });
        await auditHighImpactWorkflowAction(project, changeId, workflowRequest, live);
        return dispatchWorkbenchWorkflowAction(handlers, project, changeId, workflowRequest, live);
      },
      summarizeChildResult: (actionType, childResult) => summarizeActionResult(actionType, childResult),
    },
  });

  const text = `已在当前需求授权范围内自动推进 ${result.automationRun.completedSteps} 步。停止原因：${result.summary}`;
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scoped-automation-stopped",
    text,
    artifact: result.automationRun.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.automationRun.id,
    kind: "file-change",
    phase: "scoped-automation-stopped",
    title: "完全访问权限",
    summary: text,
    artifactRef: result.automationRun.artifact,
  });
  return result;
}

async function resolveCurrentPrimaryWorkflowGate(
  project: ManagedProject,
  changeId: string,
): Promise<WorkbenchWorkflowActionRequest & { actionType: WorkflowActionType } | { stopReason: AutomationStopReason; summary: string }> {
  const snapshot = await getAutomationInternalSnapshot({ project, path: project.path }, { topicId: changeId });
  const primary = snapshot.right.confirmationQueue.primary;
  if (!primary) return { stopReason: "no-primary-gate", summary: "当前没有需要确认的主 gate。" };
  if (primary.changeId && primary.changeId !== changeId) return { stopReason: "stale-target", summary: "当前主 gate 已漂移到其他 Change。" };
  const action = primary.actions.find((item) => item.kind === "workflow-action" && item.enabled && item.actionType);
  if (!action) {
    const disabledWorkflow = primary.actions.find((item) => item.kind === "workflow-action" && item.actionType);
    if (disabledWorkflow) return { stopReason: "blocked", summary: disabledWorkflow.disabledReason ?? "当前 workflow gate 暂不可执行。" };
    return { stopReason: "terminal-human-gate", summary: "当前主 gate 需要人工 approval，自动推进已停止。" };
  }
  if (action.changeId && action.changeId !== changeId) return { stopReason: "stale-target", summary: "当前 workflow gate 已漂移到其他 Change。" };
  return decisionActionToWorkflowRequest(action, changeId);
}

function getAutomationInternalSnapshot(
  input: Parameters<typeof getWorkbenchSnapshot>[0],
  options: Parameters<typeof getWorkbenchSnapshot>[1] = {},
): ReturnType<typeof getWorkbenchSnapshot> {
  return getWorkbenchSnapshot(input, {
    ...options,
    ignoreActiveWorkflowActions: AUTOMATION_INTERNAL_SNAPSHOT_OPTIONS.ignoreActiveWorkflowActions,
    ignoreActiveWorkflowActionTypes: [...AUTOMATION_INTERNAL_SNAPSHOT_OPTIONS.ignoreActiveWorkflowActionTypes],
  });
}

function assertScopedAutomationRequest(
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
): WorkbenchWorkflowActionRequest & {
  actionType: "planning.automation.scoped-auto.run";
  changeId: string;
  automationMode: "full-access";
  automationCurrentGateActionType: WorkflowActionType;
} {
  if (request.actionType !== "planning.automation.scoped-auto.run") throw new Error("Expected planning.automation.scoped-auto.run.");
  if (request.changeId !== changeId) throw new Error("planning.automation.scoped-auto.run changeId scope mismatch.");
  if (request.automationMode !== "full-access") throw new Error("planning.automation.scoped-auto.run requires automationMode full-access.");
  if (!request.automationCurrentGateActionType) throw new Error("planning.automation.scoped-auto.run requires automationCurrentGateActionType.");
  return request as ReturnType<typeof assertScopedAutomationRequest>;
}

function decisionActionToWorkflowRequest(action: WorkbenchDecisionAction, changeId: string): WorkbenchWorkflowActionRequest & { actionType: WorkflowActionType } {
  if (!action.actionType) throw new Error("Current primary action is missing actionType.");
  if (!isWorkflowActionType(action.actionType)) throw new Error(`Unsupported workflow action: ${action.actionType}`);
  return {
    ...action,
    actionType: action.actionType,
    changeId: action.changeId ?? changeId,
  } as unknown as WorkbenchWorkflowActionRequest & { actionType: WorkflowActionType };
}

export function scopedAutomationInitialGateMatches(request: WorkbenchWorkflowActionRequest, action: WorkbenchDecisionAction, changeId: string): boolean {
  if (request.actionType !== "planning.automation.scoped-auto.run" || !request.automationCurrentGateActionType) return false;
  if (!action.actionType || !isWorkflowActionType(action.actionType)) return false;
  const requestedGate = { ...request, actionType: request.automationCurrentGateActionType, changeId };
  const expectedGate = { ...action, actionType: request.automationCurrentGateActionType, changeId: action.changeId ?? changeId };
  return workflowActionScopesMatchStrict(expectedGate, requestedGate);
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}
