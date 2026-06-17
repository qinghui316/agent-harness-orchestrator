import type { SchedulerExecutionModeAssessment } from "./types.js";

export interface SchedulerExecutionModeAssessmentInput {
  planningComplete: boolean;
  recommendedActionType?: string;
  decisionKind?: string;
  continuationState?: string;
  completionStatus?: string;
  routingPosture?: string;
}

const FUTURE_LOOP_REQUIREMENTS = [
  "accepted architecture decision for a real scheduler loop or full parallel executor",
  "SchedulerIntegrationCandidate before combined result handling",
  "IntegrationCheck before any source apply path",
  "aggregate validation and aggregate audit after integration",
  "ToolPolicyGate and stale-target revalidation for every concrete action",
  "human apply and close gates for high-impact transitions",
];

export function assessSchedulerExecutionMode(input: SchedulerExecutionModeAssessmentInput): SchedulerExecutionModeAssessment {
  if (isTerminalCloseGate(input)) {
    return assessment({
      mode: "terminal-human-close-gate",
      humanGateRequired: true,
      summary: "Scheduler evidence is terminal; completion may only proceed through the existing human close gate.",
      reasons: ["Terminal completion evidence does not authorize scheduler loop continuation or source mutation."],
    });
  }

  if (input.recommendedActionType?.startsWith("planning.scheduler.")) {
    return assessment({
      mode: "single-gate-staged",
      currentGate: {
        actionType: input.recommendedActionType,
        separateHumanGateRequired: true,
      },
      humanGateRequired: true,
      summary: "The scheduler path is still a single-gate staged capability; the recommended scheduler action is one separate human-gated transition.",
      reasons: [
        `${input.recommendedActionType} must be revalidated and confirmed as its own concrete Harness gate.`,
        "This evidence does not authorize a scheduler loop, whole-wave dispatch, slot allocator, or full parallel executor.",
      ],
    });
  }

  if (isBlockedOrWaiting(input)) {
    return assessment({
      mode: "blocked-or-waiting",
      humanGateRequired: input.continuationState === "blocked",
      summary: "Scheduler evidence is blocked or waiting; no loop or parallel executor authority is available.",
      reasons: ["Current evidence requires user direction, rework, integration handling, or more evidence before any next scheduler gate can be recommended."],
    });
  }

  return assessment({
    mode: "waiting-for-evidence",
    humanGateRequired: false,
    summary: "Scheduler execution mode is unavailable until fresh scheduler evidence identifies a concrete existing gate.",
    reasons: input.planningComplete
      ? ["Planning evidence exists, but current scheduler evidence does not prove a legal scheduler gate."]
      : ["Accepted planning artifacts are incomplete, so scheduler execution mode must wait for evidence."],
  });
}

export function legacySchedulerExecutionModeAssessment(): SchedulerExecutionModeAssessment {
  return assessment({
    mode: "waiting-for-evidence",
    humanGateRequired: false,
    summary: "Legacy Goal Loop artifact has no scheduler execution mode evidence; treat it as waiting for fresh evidence.",
    reasons: ["Legacy artifact default is conservative and does not authorize scheduler execution."],
  });
}

function isTerminalCloseGate(input: SchedulerExecutionModeAssessmentInput): boolean {
  return input.decisionKind === "completed-ready-for-human-close-gate"
    || input.continuationState === "ready-for-human-close-gate"
    || input.completionStatus === "ready-for-human-close-gate"
    || input.routingPosture === "close-gate-required";
}

function isBlockedOrWaiting(input: SchedulerExecutionModeAssessmentInput): boolean {
  return input.continuationState === "blocked"
    || input.decisionKind === "blocked"
    || input.routingPosture === "blocked-or-rework"
    || input.routingPosture === "candidate-refresh-required"
    || input.routingPosture === "integration-check-required";
}

function assessment(input: Omit<SchedulerExecutionModeAssessment, "authority" | "loopAuthorized" | "fullParallelExecutorAuthorized" | "wholeWaveDispatchAuthorized" | "slotAllocatorAuthorized" | "futureLoopRequirements">): SchedulerExecutionModeAssessment {
  return {
    authority: "non-executing-scheduler-execution-mode-evidence",
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    futureLoopRequirements: [...FUTURE_LOOP_REQUIREMENTS],
    ...input,
  };
}
