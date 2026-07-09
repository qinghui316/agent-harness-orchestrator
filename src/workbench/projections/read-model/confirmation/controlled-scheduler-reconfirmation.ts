import { isControlledSchedulerConcreteAction } from "../../../../workflow-scheduler/controlled-step.js";
import {
  buildControlledSchedulerCurrentGateCarrier,
  controlledSchedulerSourceGateActionType as workflowControlledSchedulerSourceGateActionType,
} from "../../../../workflow-scheduler/controlled-advance-candidate.js";
import { validateWorkflowActionRequiredTargets, workflowActionScopesMatchStrict, type WorkflowActionScopeCarrier } from "../../../../workflow-actions/registry.js";
import { currentGateScopeMatches } from "../../../../workflow-actions/current-gate.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchControlledSchedulerReconfirmation, WorkbenchControlledSchedulerStopPosture, WorkbenchDecisionAction, WorkbenchWorkpad } from "../../../read-model-types.js";
import type { WorkbenchSchedulerControlledStepEvidenceSummary } from "../../../workflow-projection.js";
import { schedulerUserFacingActionLabel } from "./scheduler-user-surface.js";

type ControlledSchedulerWorkpadReconfirmationInput = Pick<WorkbenchWorkpad, "nextAction" | "goalLoop" | "controlledSchedulerStepReceipt" | "controlledSchedulerStepTrace"> & {
  schedulerControlledStepEvidence?: WorkbenchSchedulerControlledStepEvidenceSummary;
};

export function buildControlledSchedulerReconfirmation(input: {
  item: WorkbenchConfirmationQueueItem;
  sourceActions: WorkbenchDecisionAction[];
  workpad?: WorkbenchWorkpad;
  currentGateActionType?: WorkbenchDecisionAction["actionType"];
}): WorkbenchControlledSchedulerReconfirmation | undefined {
  const currentStepLabel = schedulerUserFacingActionLabel(input.currentGateActionType);
  if (!input.workpad || !input.currentGateActionType || !currentStepLabel) return undefined;

  const currentGate = currentGateCarrier(input.item, input.sourceActions, input.currentGateActionType);
  if (!currentGate) return undefined;
  return buildControlledSchedulerReconfirmationStatus({
    workpad: input.workpad,
    currentGateActionType: input.currentGateActionType,
    currentGate,
    currentStepLabel,
    itemEvidenceRefs: input.item.evidenceRefs,
  });
}

export function buildControlledSchedulerWorkpadReconfirmation(workpad: ControlledSchedulerWorkpadReconfirmationInput): WorkbenchControlledSchedulerReconfirmation | undefined {
  const nextAction = workpad.nextAction;
  if (!workpad.goalLoop) return undefined;
  if (nextAction.kind !== "workflow-action" || !nextAction.enabled || !nextAction.requiresConfirmation) return undefined;
  if (!isControlledSchedulerConcreteAction(nextAction.actionType)) return undefined;
  const currentStepLabel = schedulerUserFacingActionLabel(nextAction.actionType);
  if (!currentStepLabel) return undefined;
  const currentGate = buildControlledSchedulerCurrentGateCarrier(nextAction, nextAction.actionType, nextAction.changeId);
  if (!currentGate.changeId) return undefined;
  if (validateWorkflowActionRequiredTargets(currentGate).length > 0) return undefined;
  return buildControlledSchedulerReconfirmationStatus({
    workpad,
    currentGateActionType: nextAction.actionType,
    currentGate,
    currentStepLabel,
    itemEvidenceRefs: [],
  });
}

function buildControlledSchedulerReconfirmationStatus(input: {
  workpad: ControlledSchedulerWorkpadReconfirmationInput;
  currentGateActionType: WorkbenchDecisionAction["actionType"];
  currentGate: WorkflowActionScopeCarrier;
  currentStepLabel: string;
  itemEvidenceRefs: string[];
}): WorkbenchControlledSchedulerReconfirmation | undefined {
  const receipt = input.workpad.controlledSchedulerStepReceipt ?? input.workpad.controlledSchedulerStepTrace?.items[0];
  const candidate = input.workpad.goalLoop?.controlledSchedulerNextCandidate;
  const sourceEvidenceRefs = unique([
    ...(receipt?.evidenceRefs ?? []),
    ...(candidate?.evidenceRefs ?? []),
    ...(input.workpad.schedulerControlledStepEvidence?.controlledLoopStopSummary?.evidenceRefs ?? []),
    ...input.itemEvidenceRefs,
  ]);

  if (!receipt) {
    return {
      status: "missing-receipt",
      label: "需要重新确认当前步骤",
      body: `当前确认目标是：${input.currentStepLabel}。暂时没有可展示的上一步停止记录；继续前仍需要你确认这一项。`,
      currentStepLabel: input.currentStepLabel,
      freshnessLabel: "缺少上一步停止记录。",
      boundary: boundaryText(),
      evidenceRefs: sourceEvidenceRefs,
    };
  }

  const goalLoopActionType = readGoalLoopActionType(input.workpad.goalLoop);
  const goalLoopScope = readGoalLoopScope(input.workpad.goalLoop);
  const expectedGoalLoopChangeId = goalLoopScope ? singleScopeValue(goalLoopScope.changeId) : undefined;
  const goalLoopGateMatches = Boolean(goalLoopActionType && goalLoopScope
    && goalLoopActionType === input.currentGateActionType
    && currentGateScopeMatches({ actionType: goalLoopActionType, changeId: expectedGoalLoopChangeId, expectedScope: goalLoopScope, actual: input.currentGate })
    && workflowActionScopesMatchStrict({ actionType: goalLoopActionType, ...goalLoopScope }, input.currentGate));
  const labelMismatch = receipt.nextStepLabel && receipt.nextStepLabel !== input.currentStepLabel
    ? "stopped-step"
    : candidate?.actionLabel && candidate.actionLabel !== input.currentStepLabel
      ? "next-candidate"
      : null;
  const mismatch = labelMismatch ?? (!goalLoopGateMatches ? "next-candidate" : null);
  if (mismatch) {
    return {
      status: "stale-mismatch",
      label: "重新确认前需要复核",
      body: `上一步停止后指向“${receipt.nextStepLabel ?? candidate?.actionLabel ?? "当前候选步骤"}”，但当前确认目标是“${input.currentStepLabel}”。继续前请先确认页面证据已经刷新。`,
      lastStoppedStepLabel: receipt.executedStepLabel,
      currentStepLabel: input.currentStepLabel,
      freshnessLabel: mismatch === "stopped-step" ? "上一步停止记录与当前目标不一致。" : "下一步候选与当前目标不一致。",
      boundary: boundaryText(),
      evidenceRefs: sourceEvidenceRefs,
    };
  }

  if (receipt.status !== "ready-for-confirmation" || candidate?.status !== "ready-for-confirmation" || candidate.readinessEvidencePrepared !== true) {
    return {
      status: "needs-review",
      label: "重新确认前需要复核",
      body: `上一步已停止在“${receipt.executedStepLabel}”之后；当前确认目标是“${input.currentStepLabel}”，但步骤检查还需要复核。`,
      lastStoppedStepLabel: receipt.executedStepLabel,
      currentStepLabel: input.currentStepLabel,
      freshnessLabel: receipt.status === "ready-for-confirmation" ? "当前步骤检查还需要复核。" : "上一步停止记录还需要复核。",
      boundary: boundaryText(),
      evidenceRefs: sourceEvidenceRefs,
    };
  }
  const continuationDecision = input.workpad.schedulerControlledStepEvidence?.controlledLoopContinuationDecision;
  if (continuationDecision && continuationDecision.status !== "ready-for-human-gate") {
    return {
      status: "needs-review",
      label: "重新确认前需要复核",
      body: `上一步已停止在“${receipt.executedStepLabel}”之后；当前确认目标是“${input.currentStepLabel}”，但继续判断还需要复核：${continuationDecision.reason}`,
      lastStoppedStepLabel: receipt.executedStepLabel,
      currentStepLabel: input.currentStepLabel,
      freshnessLabel: continuationDecision.reason,
      boundary: boundaryText(),
      evidenceRefs: unique([...sourceEvidenceRefs, ...continuationDecision.evidenceRefs]),
    };
  }

  const stopPosture = buildAlignedStopPosture({
    step: input.workpad.schedulerControlledStepEvidence,
    currentGateChangeId: input.currentGate.changeId,
    currentGateActionType: input.currentGateActionType,
    currentStepLabel: input.currentStepLabel,
    receiptExecutedStepLabel: receipt.executedStepLabel,
    evidenceRefs: sourceEvidenceRefs,
  });

  return {
    status: "aligned",
    label: "当前步骤可以重新确认",
    body: stopPosture
      ? `${stopPosture.body} 下一步判断和步骤检查已刷新。`
      : `上一步已停止在“${receipt.executedStepLabel}”之后；当前重新确认目标是“${input.currentStepLabel}”。下一步判断和步骤检查已刷新。`,
    lastStoppedStepLabel: receipt.executedStepLabel,
    currentStepLabel: input.currentStepLabel,
    freshnessLabel: "上一步停止记录、下一步候选和当前确认目标一致。",
    stopPosture,
    boundary: boundaryText(),
    evidenceRefs: sourceEvidenceRefs,
  };
}

function buildAlignedStopPosture(input: {
  step?: WorkbenchSchedulerControlledStepEvidenceSummary;
  currentGateChangeId?: string | string[];
  currentGateActionType: WorkbenchDecisionAction["actionType"];
  currentStepLabel: string;
  receiptExecutedStepLabel: string;
  evidenceRefs: string[];
}): WorkbenchControlledSchedulerStopPosture | undefined {
  const summary = input.step?.controlledLoopStopSummary;
  if (!input.step || !summary) return undefined;
  if (!scopeValuesMatch(input.step.changeId, input.currentGateChangeId)) return undefined;
  if (summary.nextGateActionType !== input.currentGateActionType) return undefined;
  if (summary.continuationReadinessStatus !== "ready-for-human-gate") return undefined;
  if (!summary.readinessEvidencePrepared || !summary.humanGateRequired || !summary.humanConfirmationStillRequired) return undefined;
  if (
    summary.executionStarted
    || summary.loopAuthorized
    || summary.fullParallelExecutorAuthorized
    || summary.wholeWaveDispatchAuthorized
    || summary.slotAllocatorAuthorized
    || summary.sourceMutationAuthorized
    || summary.applyAuthorized
    || summary.closeAuthorized
    || summary.mergeAuthorized
    || summary.remoteLandingAuthorized
    || summary.harnessEvolutionAuthorized
  ) {
    return undefined;
  }
  const executedStepLabel = schedulerUserFacingActionLabel(summary.executedActionType) ?? input.receiptExecutedStepLabel;
  const nextStepLabel = schedulerUserFacingActionLabel(summary.nextGateActionType) ?? input.currentStepLabel;
  if (nextStepLabel !== input.currentStepLabel) return undefined;
  return {
    authority: "non-executing-controlled-scheduler-stop-posture",
    status: "aligned",
    label: "上一步停止状态已对齐",
    body: `上一步停在“${executedStepLabel}”之后；停止原因是“${stopReasonLabel(summary.stopReason)}”。当前继续目标是“${nextStepLabel}”，仍需要你确认。`,
    executedStepLabel,
    stopReasonLabel: stopReasonLabel(summary.stopReason),
    nextStepLabel,
    readinessLabel: readinessLabel(summary.continuationReadinessStatus),
    boundary: "这是只读停止状态摘要；不会自动继续、批量启动任务、分配资源、应用源码、关闭需求、远端落地或维护演进。",
    evidenceRefs: unique([...input.evidenceRefs, ...(summary.evidenceRefs ?? [])]),
    humanConfirmationStillRequired: true,
    executionStarted: false,
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    remoteLandingAuthorized: false,
    harnessEvolutionAuthorized: false,
  };
}

function stopReasonLabel(reason: string): string {
  if (reason === "one-confirmed-scheduler-transition-completed") return "已完成一次确认的调度步骤并主动停止";
  return reason;
}

function readinessLabel(status: string): string {
  if (status === "ready-for-human-gate") return "当前步骤检查已准备好";
  if (status === "needs-review") return "当前步骤检查需要复核";
  if (status === "waiting") return "等待新的可确认步骤";
  return status;
}

export function controlledSchedulerSourceGateActionType(action: WorkbenchDecisionAction): WorkbenchDecisionAction["actionType"] | undefined {
  return workflowControlledSchedulerSourceGateActionType(action) as WorkbenchDecisionAction["actionType"] | undefined;
}

function boundaryText(): string {
  return "这是只读重新确认状态；不会自动继续、批量启动任务、分配资源、应用源码、关闭需求、远端落地或维护演进。";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function scopeValuesMatch(expected: string | string[] | undefined, actual: string | string[] | undefined): boolean {
  const expectedValues = normalizeScopeValues(expected);
  const actualValues = normalizeScopeValues(actual);
  return expectedValues.length > 0 && expectedValues.length === actualValues.length && expectedValues.every((value, index) => value === actualValues[index]);
}

function singleScopeValue(value: string | string[] | undefined): string | undefined {
  const values = normalizeScopeValues(value);
  return values.length === 1 ? values[0] : undefined;
}

function normalizeScopeValues(value: string | string[] | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value].sort();
  return [];
}

function readGoalLoopScope(goalLoop: WorkbenchWorkpad["goalLoop"]): Record<string, string | string[]> | undefined {
  const value = readGoalLoopField(goalLoop, "recommended" + "ActionScope");
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, string | string[]> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || isStringArray(item)) result[key] = item;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function readGoalLoopActionType(goalLoop: WorkbenchWorkpad["goalLoop"]): string | undefined {
  const value = readGoalLoopField(goalLoop, "recommended" + "ActionType");
  return typeof value === "string" ? value : undefined;
}

function currentGateCarrier(
  item: WorkbenchConfirmationQueueItem,
  sourceActions: WorkbenchDecisionAction[],
  actionType: WorkbenchDecisionAction["actionType"],
): WorkflowActionScopeCarrier | undefined {
  if (!actionType) return undefined;
  const action = sourceActions.find((candidate) => controlledSchedulerSourceGateActionType(candidate) === actionType);
  return buildControlledSchedulerCurrentGateCarrier(action ?? item, actionType, action?.changeId ?? item.changeId, item);
}

function readGoalLoopField(goalLoop: WorkbenchWorkpad["goalLoop"], key: string): unknown {
  return goalLoop ? (goalLoop as unknown as Record<string, unknown>)[key] : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
