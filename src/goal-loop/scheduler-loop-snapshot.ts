import type {
  GoalLoopCompletionAudit,
  GoalLoopConflictAssessment,
  GoalLoopDecisionKind,
  GoalLoopRecommendedAction,
} from "./types.js";
import type { SchedulerExecutionModeAssessment } from "../workflow-scheduler/types.js";

export type SchedulerLoopEvidenceAuthority = "non-executing-scheduler-loop-evidence-snapshot";
export type ControlledLoopStateAuthority = "non-executing-controlled-loop-state-evidence";

export type SchedulerLoopPostureState =
  | "waiting"
  | "recommending-gate"
  | "awaiting-human-gate"
  | "quality-routing"
  | "integration-barrier"
  | "terminal-handoff";

export type ControlledLoopState = SchedulerLoopPostureState;
export type ControlledLoopFutureOnlyState = "dispatching-approved-scope" | "reconciling";

export type SchedulerLoopUnsafeEvidenceKind =
  | "malformed"
  | "stale"
  | "superseded"
  | "cross-change"
  | "ambiguous"
  | "missing";

export interface SchedulerLoopUnsafeEvidence {
  kind: SchedulerLoopUnsafeEvidenceKind;
  summary: string;
  artifactId?: string;
}

export interface SchedulerLoopForbiddenAuthority {
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  executionStarted: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface SchedulerLoopCurrentLegalAction {
  actionType: GoalLoopRecommendedAction["actionType"];
  scope: GoalLoopRecommendedAction["scope"];
  separateHumanGateRequired: true;
  reason: string;
}

export interface ControlledLoopStateEvidence {
  version: "1.0";
  authority: ControlledLoopStateAuthority;
  changeId: string;
  state: ControlledLoopState;
  phase12aLabel: string;
  summary: string;
  reasons: string[];
  currentLegalAction?: SchedulerLoopCurrentLegalAction;
  separateHumanGateRequired: boolean;
  humanGateRequired: boolean;
  futureOnlyStates: ControlledLoopFutureOnlyState[];
  forbiddenAuthority: SchedulerLoopForbiddenAuthority;
}

export interface SchedulerLoopEvidenceSnapshotInput {
  changeId: string;
  planningComplete: boolean;
  decisionKind: GoalLoopDecisionKind;
  recommendedAction?: GoalLoopRecommendedAction;
  conflictAssessment: GoalLoopConflictAssessment;
  completionAudit: GoalLoopCompletionAudit;
  schedulerExecutionMode: SchedulerExecutionModeAssessment;
  unsafeEvidence?: SchedulerLoopUnsafeEvidence[];
}

export interface SchedulerLoopEvidenceSnapshot {
  version: "1.0";
  authority: SchedulerLoopEvidenceAuthority;
  changeId: string;
  planningComplete: boolean;
  decisionKind: GoalLoopDecisionKind;
  posture: SchedulerLoopPostureState;
  controlledLoopState: ControlledLoopStateEvidence;
  reasons: string[];
  currentLegalAction?: SchedulerLoopCurrentLegalAction;
  separateHumanGateRequired: boolean;
  humanGateRequired: boolean;
  unsafeEvidence: SchedulerLoopUnsafeEvidence[];
  conflictAssessment: GoalLoopConflictAssessment;
  completionAudit: GoalLoopCompletionAudit;
  schedulerExecutionMode: SchedulerExecutionModeAssessment;
  forbiddenAuthority: SchedulerLoopForbiddenAuthority;
}

const FORBIDDEN_AUTHORITY: SchedulerLoopForbiddenAuthority = {
  loopAuthorized: false,
  fullParallelExecutorAuthorized: false,
  wholeWaveDispatchAuthorized: false,
  slotAllocatorAuthorized: false,
  executionStarted: false,
  sourceMutationAuthorized: false,
  applyAuthorized: false,
  closeAuthorized: false,
  harnessEvolutionAuthorized: false,
};

export function legacySchedulerLoopEvidenceSnapshot(changeId: string): SchedulerLoopEvidenceSnapshot {
  const controlledLoopState: ControlledLoopStateEvidence = {
    version: "1.0",
    authority: "non-executing-controlled-loop-state-evidence",
    changeId,
    state: "waiting",
    phase12aLabel: "observing/waiting",
    summary: "Legacy GoalLoopDecision artifact has no controlled-loop state evidence; treat as observe-only waiting evidence.",
    reasons: ["Legacy GoalLoopDecision artifact has no scheduler-loop evidence snapshot or controlled-loop state evidence."],
    separateHumanGateRequired: false,
    humanGateRequired: false,
    futureOnlyStates: ["dispatching-approved-scope", "reconciling"],
    forbiddenAuthority: { ...FORBIDDEN_AUTHORITY },
  };

  return {
    version: "1.0",
    authority: "non-executing-scheduler-loop-evidence-snapshot",
    changeId,
    planningComplete: false,
    decisionKind: "wait-for-evidence",
    posture: "waiting",
    controlledLoopState,
    reasons: ["Legacy GoalLoopDecision artifact has no scheduler-loop evidence snapshot; treat as waiting for fresh evidence."],
    separateHumanGateRequired: false,
    humanGateRequired: false,
    unsafeEvidence: [{
      kind: "missing",
      summary: "Legacy GoalLoopDecision artifact did not include scheduler-loop evidence snapshot.",
    }],
    conflictAssessment: {
      level: "unknown",
      parallelEligible: false,
      routingPosture: "wait-for-evidence",
      routingLabel: "Wait for evidence",
      reasons: ["Legacy GoalLoopDecision artifact has no scheduler-loop conflict posture evidence."],
    },
    completionAudit: {
      status: "incomplete",
      evidence: [],
      missing: ["Fresh scheduler-loop evidence snapshot"],
    },
    schedulerExecutionMode: {
      authority: "non-executing-scheduler-execution-mode-evidence",
      mode: "waiting-for-evidence",
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      humanGateRequired: false,
      summary: "Legacy GoalLoopDecision artifact has no scheduler-loop evidence snapshot; treat as waiting for fresh evidence.",
      reasons: ["Legacy scheduler-loop snapshot default is conservative and does not authorize scheduler execution."],
      futureLoopRequirements: [
        "fresh GoalLoopDecision with scheduler-loop evidence snapshot",
        "accepted architecture decision for a real scheduler loop or full parallel executor",
        "ToolPolicyGate and human gate for every concrete action",
      ],
    },
    forbiddenAuthority: { ...FORBIDDEN_AUTHORITY },
  };
}

export function classifySchedulerLoopEvidenceSnapshot(input: SchedulerLoopEvidenceSnapshotInput): SchedulerLoopEvidenceSnapshot {
  const controlledLoopState = classifyControlledLoopState(input);
  const currentLegalAction = controlledLoopState.currentLegalAction;
  const posture = controlledLoopState.state;
  const unsafeEvidence = input.unsafeEvidence ?? [];
  const unsafeReasons = unsafeEvidence.map((evidence) => `${evidence.kind}: ${evidence.summary}`);
  const reasons = [
    ...unsafeReasons,
    ...input.conflictAssessment.reasons,
    ...input.schedulerExecutionMode.reasons,
  ];

  return {
    version: "1.0",
    authority: "non-executing-scheduler-loop-evidence-snapshot",
    changeId: input.changeId,
    planningComplete: input.planningComplete,
    decisionKind: input.decisionKind,
    posture,
    controlledLoopState,
    reasons,
    currentLegalAction,
    separateHumanGateRequired: Boolean(currentLegalAction),
    humanGateRequired: input.schedulerExecutionMode.humanGateRequired || Boolean(currentLegalAction),
    unsafeEvidence,
    conflictAssessment: input.conflictAssessment,
    completionAudit: input.completionAudit,
    schedulerExecutionMode: input.schedulerExecutionMode,
    forbiddenAuthority: { ...FORBIDDEN_AUTHORITY },
  };
}

export function classifyControlledLoopState(input: SchedulerLoopEvidenceSnapshotInput): ControlledLoopStateEvidence {
  const unsafeEvidence = input.unsafeEvidence ?? [];
  const unsafeReasons = unsafeEvidence.map((evidence) => `${evidence.kind}: ${evidence.summary}`);
  const unsafe = unsafeEvidence.length > 0;
  const currentLegalAction = unsafe ? undefined : currentLegalActionFor(input.recommendedAction);
  const state = unsafe ? "waiting" : classifyControlledLoopStateKind(input, currentLegalAction);
  const reasons = [
    ...unsafeReasons,
    ...input.conflictAssessment.reasons,
    ...input.schedulerExecutionMode.reasons,
  ];

  return {
    version: "1.0",
    authority: "non-executing-controlled-loop-state-evidence",
    changeId: input.changeId,
    state,
    phase12aLabel: phase12aLabelForState(state),
    summary: controlledLoopStateSummary(state),
    reasons,
    currentLegalAction,
    separateHumanGateRequired: Boolean(currentLegalAction),
    humanGateRequired: input.schedulerExecutionMode.humanGateRequired || Boolean(currentLegalAction),
    futureOnlyStates: ["dispatching-approved-scope", "reconciling"],
    forbiddenAuthority: { ...FORBIDDEN_AUTHORITY },
  };
}

export function controlledLoopStateEvidenceFromSnapshot(snapshot: Omit<SchedulerLoopEvidenceSnapshot, "controlledLoopState">): ControlledLoopStateEvidence {
  return {
    version: "1.0",
    authority: "non-executing-controlled-loop-state-evidence",
    changeId: snapshot.changeId,
    state: snapshot.posture,
    phase12aLabel: phase12aLabelForState(snapshot.posture),
    summary: controlledLoopStateSummary(snapshot.posture),
    reasons: [...snapshot.reasons],
    currentLegalAction: snapshot.currentLegalAction,
    separateHumanGateRequired: snapshot.separateHumanGateRequired,
    humanGateRequired: snapshot.humanGateRequired,
    futureOnlyStates: ["dispatching-approved-scope", "reconciling"],
    forbiddenAuthority: { ...snapshot.forbiddenAuthority },
  };
}

export function assertSchedulerLoopEvidenceSnapshotNonExecuting(snapshot: SchedulerLoopEvidenceSnapshot): void {
  const forbiddenAuthority = snapshot.forbiddenAuthority;
  const schedulerExecutionMode = snapshot.schedulerExecutionMode;
  if (
    forbiddenAuthority.loopAuthorized
    || forbiddenAuthority.fullParallelExecutorAuthorized
    || forbiddenAuthority.wholeWaveDispatchAuthorized
    || forbiddenAuthority.slotAllocatorAuthorized
    || forbiddenAuthority.executionStarted
    || forbiddenAuthority.sourceMutationAuthorized
    || forbiddenAuthority.applyAuthorized
    || forbiddenAuthority.closeAuthorized
    || forbiddenAuthority.harnessEvolutionAuthorized
    || schedulerExecutionMode.loopAuthorized
    || schedulerExecutionMode.fullParallelExecutorAuthorized
    || schedulerExecutionMode.wholeWaveDispatchAuthorized
    || schedulerExecutionMode.slotAllocatorAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.loopAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.fullParallelExecutorAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.wholeWaveDispatchAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.slotAllocatorAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.executionStarted
    || snapshot.controlledLoopState.forbiddenAuthority.sourceMutationAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.applyAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.closeAuthorized
    || snapshot.controlledLoopState.forbiddenAuthority.harnessEvolutionAuthorized
  ) {
    throw new Error("Scheduler loop evidence snapshot must remain non-executing.");
  }
}

function currentLegalActionFor(action: GoalLoopRecommendedAction | undefined): SchedulerLoopCurrentLegalAction | undefined {
  if (!action) return undefined;
  return {
    actionType: action.actionType,
    scope: action.scope,
    separateHumanGateRequired: true,
    reason: action.reason,
  };
}

function classifyControlledLoopStateKind(
  input: SchedulerLoopEvidenceSnapshotInput,
  currentLegalAction: SchedulerLoopCurrentLegalAction | undefined,
): SchedulerLoopPostureState {
  if (input.decisionKind === "completed-ready-for-human-close-gate" || input.completionAudit.status === "ready-for-human-close-gate") {
    return "terminal-handoff";
  }
  if (
    input.decisionKind === "blocked"
    || input.completionAudit.status === "blocked"
    || input.conflictAssessment.routingPosture === "blocked-or-rework"
  ) {
    return "quality-routing";
  }
  if (input.conflictAssessment.routingPosture === "integration-check-required") {
    return "integration-barrier";
  }
  if (!currentLegalAction) return "waiting";
  return input.schedulerExecutionMode.humanGateRequired ? "awaiting-human-gate" : "recommending-gate";
}

function phase12aLabelForState(state: ControlledLoopState): string {
  switch (state) {
    case "waiting":
      return "observing/waiting";
    case "recommending-gate":
      return "recommending one existing gate";
    case "awaiting-human-gate":
      return "awaiting human gate for one existing gate";
    case "quality-routing":
      return "reconciling quality/rework evidence";
    case "integration-barrier":
      return "integration barrier";
    case "terminal-handoff":
      return "terminal handoff";
  }
}

function controlledLoopStateSummary(state: ControlledLoopState): string {
  switch (state) {
    case "waiting":
      return "Observe current evidence and wait for a fresh legal Harness gate; no scheduler loop action is authorized.";
    case "recommending-gate":
      return "A single existing Harness gate may be recommended as evidence, but it still needs its own confirmation.";
    case "awaiting-human-gate":
      return "The next safe posture is waiting for a human to confirm one existing scoped Harness gate.";
    case "quality-routing":
      return "Quality, validation, audit, blocked, or rework evidence controls the next step; do not dispatch parallel work.";
    case "integration-barrier":
      return "IntegrationCheck handoff/outcome evidence is the barrier before any aggregate apply path.";
    case "terminal-handoff":
      return "Terminal SchedulerRun evidence can only hand off to existing human close/apply gates.";
  }
}
