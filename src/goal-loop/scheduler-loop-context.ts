import { schedulerExecutionModeAssessmentsEqual } from "../workflow-scheduler/execution-mode.js";
import type { GoalLoopDecision, GoalLoopNextStepPacket } from "./types.js";

export interface GoalLoopSchedulerLoopSnapshotContext {
  posture: string;
  decisionKind: string;
  currentLegalActionType?: string;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface GoalLoopControlledLoopStateContext {
  state: string;
  phase12aLabel: string;
  summary: string;
  currentLegalActionType?: string;
  humanGateRequired: boolean;
  futureOnlyStates: string[];
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export function isSchedulerLoopSnapshotValidForContext(
  snapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"],
  decision: GoalLoopDecision,
  packet: GoalLoopNextStepPacket,
  expectedChangeId: string,
): boolean {
  if (snapshot.version !== "1.0") return false;
  if (snapshot.authority !== "non-executing-scheduler-loop-evidence-snapshot") return false;
  if (snapshot.changeId !== expectedChangeId || snapshot.changeId !== decision.changeId || snapshot.changeId !== packet.changeId) return false;
  if (snapshot.decisionKind !== decision.decisionKind) return false;
  if (!controlledLoopStateValidForSnapshot(snapshot)) return false;
  if (!schedulerExecutionModeAssessmentsEqual(snapshot.schedulerExecutionMode, decision.schedulerExecutionMode)) return false;
  if (!schedulerExecutionModeAssessmentsEqual(snapshot.schedulerExecutionMode, packet.schedulerExecutionMode)) return false;
  if (!forbiddenAuthorityIsFalse(snapshot.forbiddenAuthority)) return false;
  if (!recommendedActionMatchesSnapshot(decision.recommendedAction, snapshot.currentLegalAction)) return false;
  if (!currentLegalActionMatchesSchedulerGate(snapshot.currentLegalAction, snapshot.schedulerExecutionMode.currentGate)) return false;
  if (snapshot.separateHumanGateRequired !== Boolean(snapshot.currentLegalAction)) return false;
  if (snapshot.currentLegalAction && !snapshot.humanGateRequired) return false;
  if (snapshot.currentLegalAction?.separateHumanGateRequired !== undefined && snapshot.currentLegalAction.separateHumanGateRequired !== true) return false;
  return true;
}

export function summarizeSchedulerLoopSnapshot(snapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]): GoalLoopSchedulerLoopSnapshotContext {
  return {
    posture: snapshot.posture,
    decisionKind: snapshot.decisionKind,
    currentLegalActionType: snapshot.currentLegalAction?.actionType,
    loopAuthorized: snapshot.forbiddenAuthority.loopAuthorized,
    fullParallelExecutorAuthorized: snapshot.forbiddenAuthority.fullParallelExecutorAuthorized,
    wholeWaveDispatchAuthorized: snapshot.forbiddenAuthority.wholeWaveDispatchAuthorized,
    slotAllocatorAuthorized: snapshot.forbiddenAuthority.slotAllocatorAuthorized,
    sourceMutationAuthorized: snapshot.forbiddenAuthority.sourceMutationAuthorized,
    applyAuthorized: snapshot.forbiddenAuthority.applyAuthorized,
    closeAuthorized: snapshot.forbiddenAuthority.closeAuthorized,
    harnessEvolutionAuthorized: snapshot.forbiddenAuthority.harnessEvolutionAuthorized,
  };
}

export function summarizeControlledLoopState(snapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]): GoalLoopControlledLoopStateContext {
  const state = snapshot.controlledLoopState;
  return {
    state: state.state,
    phase12aLabel: state.phase12aLabel,
    summary: state.summary,
    currentLegalActionType: state.currentLegalAction?.actionType,
    humanGateRequired: state.humanGateRequired,
    futureOnlyStates: [...state.futureOnlyStates],
    loopAuthorized: state.forbiddenAuthority.loopAuthorized,
    fullParallelExecutorAuthorized: state.forbiddenAuthority.fullParallelExecutorAuthorized,
    wholeWaveDispatchAuthorized: state.forbiddenAuthority.wholeWaveDispatchAuthorized,
    slotAllocatorAuthorized: state.forbiddenAuthority.slotAllocatorAuthorized,
    sourceMutationAuthorized: state.forbiddenAuthority.sourceMutationAuthorized,
    applyAuthorized: state.forbiddenAuthority.applyAuthorized,
    closeAuthorized: state.forbiddenAuthority.closeAuthorized,
    harnessEvolutionAuthorized: state.forbiddenAuthority.harnessEvolutionAuthorized,
  };
}

function controlledLoopStateValidForSnapshot(snapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]): boolean {
  const state = snapshot.controlledLoopState;
  if (state.version !== "1.0") return false;
  if (state.authority !== "non-executing-controlled-loop-state-evidence") return false;
  if (state.changeId !== snapshot.changeId) return false;
  if (state.state !== snapshot.posture) return false;
  if (!forbiddenAuthorityIsFalse(state.forbiddenAuthority)) return false;
  if (!recommendedActionMatchesSnapshot(snapshot.currentLegalAction, state.currentLegalAction)) return false;
  if (state.separateHumanGateRequired !== snapshot.separateHumanGateRequired) return false;
  if (state.humanGateRequired !== snapshot.humanGateRequired) return false;
  if (!state.futureOnlyStates.includes("dispatching-approved-scope")) return false;
  if (!state.futureOnlyStates.includes("reconciling")) return false;
  return true;
}

function forbiddenAuthorityIsFalse(forbiddenAuthority: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["forbiddenAuthority"]): boolean {
  return forbiddenAuthority.loopAuthorized === false
    && forbiddenAuthority.fullParallelExecutorAuthorized === false
    && forbiddenAuthority.wholeWaveDispatchAuthorized === false
    && forbiddenAuthority.slotAllocatorAuthorized === false
    && forbiddenAuthority.executionStarted === false
    && forbiddenAuthority.sourceMutationAuthorized === false
    && forbiddenAuthority.applyAuthorized === false
    && forbiddenAuthority.closeAuthorized === false
    && forbiddenAuthority.harnessEvolutionAuthorized === false;
}

function recommendedActionMatchesSnapshot(
  action: GoalLoopDecision["recommendedAction"],
  snapshotAction: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["currentLegalAction"],
): boolean {
  if (!action && !snapshotAction) return true;
  if (!action || !snapshotAction) return false;
  return action.actionType === snapshotAction.actionType
    && action.reason === snapshotAction.reason
    && scopedRecordsEqual(action.scope, snapshotAction.scope)
    && snapshotAction.separateHumanGateRequired === true;
}

function currentLegalActionMatchesSchedulerGate(
  action: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["currentLegalAction"],
  currentGate: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["schedulerExecutionMode"]["currentGate"],
): boolean {
  if (!action && !currentGate) return true;
  if (!action || !currentGate) return false;
  return action.actionType === currentGate.actionType && currentGate.separateHumanGateRequired === true;
}

function scopedRecordsEqual(
  left: Record<string, string | string[]>,
  right: Record<string, string | string[]>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, leftValue]) => {
    const rightValue = right[key];
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      return Array.isArray(leftValue)
        && Array.isArray(rightValue)
        && leftValue.length === rightValue.length
        && leftValue.every((value, index) => value === rightValue[index]);
    }
    return leftValue === rightValue;
  });
}
