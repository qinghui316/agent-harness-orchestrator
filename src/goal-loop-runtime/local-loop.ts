import type { AutomationStopReason } from "../automation-runtime/types.js";
import type { ScopedAutomationChildGate } from "../automation-runtime/runner.js";

export type LocalGoalLoopMode = "request-approval" | "full-access";

export type LocalGoalLoopDecision =
  | {
    kind: "run-scoped-automation";
    mode: "full-access";
    changeId: string;
    gate: ScopedAutomationChildGate;
    summary: string;
  }
  | {
    kind: "wait-for-human";
    mode: LocalGoalLoopMode;
    changeId: string;
    gate?: ScopedAutomationChildGate;
    stopReason?: AutomationStopReason;
    summary: string;
  }
  | {
    kind: "completed";
    mode: LocalGoalLoopMode;
    changeId: string;
    stopReason: "no-primary-gate";
    summary: string;
  }
  | {
    kind: "blocked";
    mode: LocalGoalLoopMode;
    changeId: string;
    stopReason: AutomationStopReason;
    summary: string;
  };

export interface LocalGoalLoopServices {
  checkSafety?(previousResult: unknown | null): Promise<{ stopReason: "source-drift" | "accepted-artifact-drift"; summary: string } | null>;
  resolveCurrentPrimaryGate(previousResult: unknown | null): Promise<ScopedAutomationChildGate | { stopReason: AutomationStopReason; summary: string }>;
}

export async function decideLocalGoalLoopNextStep(input: {
  mode: LocalGoalLoopMode;
  changeId: string;
  previousResult?: unknown | null;
  services: LocalGoalLoopServices;
}): Promise<LocalGoalLoopDecision> {
  const { mode, changeId, services } = input;
  const previousResult = input.previousResult ?? null;
  const safety = services.checkSafety ? await services.checkSafety(previousResult) : null;
  if (safety) {
    return {
      kind: "blocked",
      mode,
      changeId,
      stopReason: safety.stopReason,
      summary: safety.summary,
    };
  }

  const next = await services.resolveCurrentPrimaryGate(previousResult);
  if ("stopReason" in next) return decisionForStop(mode, changeId, next);
  if (next.changeId !== changeId) {
    return {
      kind: "blocked",
      mode,
      changeId,
      stopReason: "stale-target",
      summary: "Local Goal Loop current gate is not scoped to the selected Change.",
    };
  }
  if (mode === "request-approval") {
    return {
      kind: "wait-for-human",
      mode,
      changeId,
      gate: next,
      summary: "Loop observed the next legal gate and is waiting for user approval.",
    };
  }
  return {
    kind: "run-scoped-automation",
    mode,
    changeId,
    gate: next,
    summary: "Loop observed an allowed local gate and will delegate execution to scoped automation.",
  };
}

function decisionForStop(
  mode: LocalGoalLoopMode,
  changeId: string,
  stop: { stopReason: AutomationStopReason; summary: string },
): LocalGoalLoopDecision {
  if (stop.stopReason === "no-primary-gate") {
    return {
      kind: "completed",
      mode,
      changeId,
      stopReason: "no-primary-gate",
      summary: stop.summary,
    };
  }
  if (stop.stopReason === "terminal-human-gate" || stop.stopReason === "unsupported-gate") {
    return {
      kind: "wait-for-human",
      mode,
      changeId,
      stopReason: stop.stopReason,
      summary: stop.summary,
    };
  }
  return {
    kind: "blocked",
    mode,
    changeId,
    stopReason: stop.stopReason,
    summary: stop.summary,
  };
}
