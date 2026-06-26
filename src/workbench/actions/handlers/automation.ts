import { runScopedAutomation } from "../../../automation-runtime/runner.js";
import { captureAcceptedArtifactHashes, captureAutomationSourceState } from "../../../automation-runtime/safety.js";
import { isScopedAutomationAllowedAction, isScopedAutomationAllowedApprovalAction, isScopedAutomationTerminalHumanGate, scopedAutomationActionPriority, type ScopedAutomationAllowedApprovalActionId } from "../../../automation-runtime/policy.js";
import type { ScopedAutomationChildGate } from "../../../automation-runtime/runner.js";
import type { AutomationStopReason } from "../../../automation-runtime/types.js";
import { decideLocalGoalLoopNextStep } from "../../../goal-loop-runtime/local-loop.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import type { ManagedProject } from "../../../types/index.js";
import { isWorkflowActionType, workflowActionScopesMatchStrict, type WorkflowActionType } from "../../../workflow-actions/registry.js";
import { emitAssistantEvent } from "../../live-events.js";
import { getWorkbenchSnapshot } from "../../manager.js";
import { recordWorkbenchDecision } from "../../decisions.js";
import { resolveTopic } from "../../topic-resolver.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchApprovalAction, WorkbenchDecisionAction } from "../../read-model-types.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../types.js";
import { inferArtifactFromActionResult, inferChangeIdFromAction, inferRunIdFromActionResult, inferTargetIdFromAction, runAllowlistedAction, type WorkbenchApprovalOptions } from "../approval-execution.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction } from "../boundary.js";
import { assertCurrentAutomationApprovalAction, assertCurrentWorkflowAction } from "../current-action-revalidation.js";
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
      resolveCurrentPrimaryGate: async () => resolveCurrentPrimaryAutomationGate(project, changeId),
      dispatchChildAction: async (childRequest, auditScope) => {
        if (childRequest.kind === "approval-action") {
          const action = childRequest.action as WorkbenchApprovalAction;
          const options = childRequest.options as WorkbenchApprovalOptions | undefined;
          await assertCurrentAutomationApprovalAction({ project, path: project.path }, {
            actionType: "planning.automation.scoped-auto.run",
            changeId,
            automationMode: "full-access",
            automationCurrentGateApprovalActionId: childRequest.actionId,
            automationCurrentGateTargetId: childRequest.targetId,
            automationCurrentGateRunId: childRequest.runId,
            automationCurrentGateArtifact: childRequest.artifact,
          }, { getWorkbenchSnapshot: getAutomationInternalSnapshot });
          const approvalResult = await runAllowlistedAction(project, action, options);
          await recordWorkbenchDecision(project, {
            id: `approval:${action.actionId}:${action.args.join(":")}`,
            changeId: inferChangeIdFromAction(action, approvalResult),
            decisionType: action.actionId,
            status: "accepted",
            label: action.label,
            summary: `Accepted ${action.label}.`,
            targetId: inferTargetIdFromAction(action, approvalResult),
            runId: inferRunIdFromActionResult(approvalResult),
            artifact: inferArtifactFromActionResult(approvalResult),
            actionId: action.actionId,
            feedback: null,
            payload: { result: approvalResult, automation: auditScope },
            completedAt: new Date().toISOString(),
          });
          return approvalResult;
        }
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
      summarizeChildResult: (gate, childResult) => gate.kind === "workflow-action"
        ? summarizeActionResult(gate.actionType, childResult)
        : `${gate.actionId} completed`,
      waitForSettledPrimaryGate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
      primaryGateResolutionTimeoutMs: 60_000,
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

export async function runPostPlanScopedAutomation(
  project: ManagedProject,
  changeId: string,
  live: WorkbenchLiveSink | undefined,
  handlers: WorkbenchActionHandlerMap,
): Promise<unknown> {
  const decision = await decideLocalGoalLoopNextStep({
    mode: "full-access",
    changeId,
    services: {
      resolveCurrentPrimaryGate: async () => resolveCurrentPrimaryAutomationGate(project, changeId),
    },
  });
  if (decision.kind !== "run-scoped-automation") {
    const text = `计划已确认，但完全访问权限未启动：${decision.summary}`;
    await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      status: "scoped-automation-not-started",
      text,
    });
    emitAssistantEvent(live, {
      runId: changeId,
      kind: "status",
      phase: "scoped-automation-not-started",
      title: "完全访问权限未启动",
      summary: text,
    });
    return { status: "not-started", stopReason: "stopReason" in decision ? decision.stopReason : decision.kind, summary: decision.summary };
  }
  const request = scopedAutomationRequestFromGate(changeId, decision.gate);
  return runScopedAutomationAction(project, changeId, request, live, handlers);
}

async function resolveCurrentPrimaryAutomationGate(
  project: ManagedProject,
  changeId: string,
): Promise<ScopedAutomationChildGate | { stopReason: AutomationStopReason; summary: string }> {
  const snapshot = await getAutomationInternalSnapshot({ project, path: project.path }, { topicId: changeId });
  const primary = snapshot.right.confirmationQueue.primary;
  if (!primary) return { stopReason: "no-primary-gate", summary: "当前没有需要确认的主 gate。" };
  if (primary.changeId && primary.changeId !== changeId) return { stopReason: "stale-target", summary: "当前主 gate 已漂移到其他 Change。" };
  const action = chooseCurrentAutomationWorkflowAction(primary.actions);
  if (!action) {
    const disabledWorkflow = primary.actions.find((item) => item.kind === "workflow-action" && item.actionType);
    if (disabledWorkflow) return { stopReason: "blocked", summary: disabledWorkflow.disabledReason ?? "当前 workflow gate 暂不可执行。" };
    return approvalGateToAutomationGate(project, changeId, primary);
  }
  if (action.changeId && action.changeId !== changeId) return { stopReason: "stale-target", summary: "当前 workflow gate 已漂移到其他 Change。" };
  return { kind: "workflow-action", ...decisionActionToWorkflowRequest(action, changeId) };
}

function chooseCurrentAutomationWorkflowAction(actions: WorkbenchDecisionAction[]): WorkbenchDecisionAction | undefined {
  const candidates = actions.filter((item) =>
    item.kind === "workflow-action"
    && item.enabled
    && item.actionType
    && isScopedAutomationAllowedAction(item.actionType)
  );
  return candidates
    .map((action, index) => ({ action, index, priority: scopedAutomationActionPriority(action.actionType) }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)[0]?.action;
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
  automationCurrentGateActionType?: WorkflowActionType;
  automationCurrentGateApprovalActionId?: ScopedAutomationAllowedApprovalActionId;
} {
  if (request.actionType !== "planning.automation.scoped-auto.run") throw new Error("Expected planning.automation.scoped-auto.run.");
  if (request.changeId !== changeId) throw new Error("planning.automation.scoped-auto.run changeId scope mismatch.");
  if (request.automationMode !== "full-access") throw new Error("planning.automation.scoped-auto.run requires automationMode full-access.");
  if (!request.automationCurrentGateActionType && !request.automationCurrentGateApprovalActionId) throw new Error("planning.automation.scoped-auto.run requires a current gate target.");
  if (request.automationCurrentGateActionType && request.automationCurrentGateApprovalActionId) throw new Error("planning.automation.scoped-auto.run requires exactly one current gate target.");
  if (request.automationCurrentGateApprovalActionId && !isScopedAutomationAllowedApprovalAction(request.automationCurrentGateApprovalActionId)) throw new Error("planning.automation.scoped-auto.run supports only local allowlisted approval automation.");
  return request as ReturnType<typeof assertScopedAutomationRequest>;
}

async function approvalGateToAutomationGate(
  project: ManagedProject,
  changeId: string,
  primary: NonNullable<Awaited<ReturnType<typeof getAutomationInternalSnapshot>>["right"]["confirmationQueue"]["primary"]>,
): Promise<ScopedAutomationChildGate | { stopReason: AutomationStopReason; summary: string }> {
  const approval = primary.actions.find((item) => item.kind === "approval" && item.enabled && item.action);
  if (!approval?.action) return { stopReason: "terminal-human-gate", summary: "当前主 gate 需要人工 approval，自动推进已停止。" };
  const actionId = approval.action.actionId;
  if (!actionId) return { stopReason: "terminal-human-gate", summary: "当前主 gate 缺少 approval action id，自动推进已停止。" };
  if (isScopedAutomationTerminalHumanGate(actionId)) {
    return { stopReason: "terminal-human-gate", summary: "Scoped automation stopped at a human terminal gate." };
  }
  if (!isScopedAutomationAllowedApprovalAction(actionId)) {
    return { stopReason: "unsupported-gate", summary: "当前 approval gate 不在完全访问权限 V1 范围内。" };
  }
  const targetId = primary.resultId ?? automationApprovalTargetFromArgs(actionId, approval.action.args);
  const artifact = primary.evidenceRefs?.[0] ?? approval.artifact;
  const runId = primary.runId ?? approval.runId;
  try {
    await assertCurrentAutomationApprovalAction({ project, path: project.path }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId,
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: actionId,
      automationCurrentGateTargetId: targetId,
      automationCurrentGateRunId: runId,
      automationCurrentGateArtifact: artifact,
    }, { getWorkbenchSnapshot: getAutomationInternalSnapshot });
  } catch {
    return { stopReason: "stale-target", summary: "当前 approval gate 不满足自动推进条件。" };
  }
  return {
    kind: "approval-action",
    actionId,
    changeId,
    approvalId: approval.approvalId,
    targetId,
    runId,
    artifact,
    action: approval.action,
    options: approval.options,
  };
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

function scopedAutomationRequestFromGate(changeId: string, gate: ScopedAutomationChildGate): WorkbenchWorkflowActionRequest {
  if (gate.kind === "approval-action") {
    return {
      actionType: "planning.automation.scoped-auto.run",
      changeId,
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: gate.actionId,
      automationCurrentGateTargetId: gate.targetId,
      automationCurrentGateRunId: gate.runId,
      automationCurrentGateArtifact: gate.artifact,
      maxSteps: 10,
    };
  }
  const actionType = gate.actionType;
  const scope = { ...gate } as Record<string, unknown>;
  delete scope.kind;
  delete scope.actionType;
  return {
    ...(scope as unknown as WorkbenchWorkflowActionRequest),
    actionType: "planning.automation.scoped-auto.run",
    changeId,
    automationMode: "full-access",
    automationCurrentGateActionType: actionType,
    maxSteps: 10,
  };
}

export function scopedAutomationInitialGateMatches(request: WorkbenchWorkflowActionRequest, action: WorkbenchDecisionAction, changeId: string): boolean {
  if (request.actionType !== "planning.automation.scoped-auto.run") return false;
  if (request.automationCurrentGateApprovalActionId) {
    if (request.automationCurrentGateApprovalActionId !== action.action?.actionId) return false;
    if ((action.changeId ?? changeId) !== changeId) return false;
    if (!isScopedAutomationAllowedApprovalAction(request.automationCurrentGateApprovalActionId)) return false;
    if (request.automationCurrentGateTargetId && !automationApprovalTargetMatches(request.automationCurrentGateApprovalActionId, request.automationCurrentGateTargetId, action)) {
      return false;
    }
    return action.automationEligible === true;
  }
  if (!request.automationCurrentGateActionType || !action.actionType || !isWorkflowActionType(action.actionType)) return false;
  const requestedGate = { ...request, actionType: request.automationCurrentGateActionType, changeId };
  const expectedGate = { ...action, actionType: request.automationCurrentGateActionType, changeId: action.changeId ?? changeId };
  return workflowActionScopesMatchStrict(expectedGate, requestedGate);
}

function automationApprovalTargetMatches(actionId: ScopedAutomationAllowedApprovalActionId, requestedTargetId: string, action: WorkbenchDecisionAction): boolean {
  const approvalIdTarget = action.approvalId?.replace(new RegExp(`^${approvalPrefixForAction(actionId)}:`), "");
  const actionArgsTarget = automationApprovalTargetFromArgs(actionId, action.action?.args);
  return requestedTargetId === approvalIdTarget || requestedTargetId === actionArgsTarget;
}

function approvalPrefixForAction(actionId: ScopedAutomationAllowedApprovalActionId): string {
  if (actionId === "audit.accept") return "audit";
  if (actionId === "result.apply") return "apply";
  return "close";
}

function automationApprovalTargetFromArgs(actionId: ScopedAutomationAllowedApprovalActionId, args: string[] | undefined): string | undefined {
  if (!args) return undefined;
  if (actionId === "result.apply") return args[3] ?? args[2];
  return args[2];
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}
