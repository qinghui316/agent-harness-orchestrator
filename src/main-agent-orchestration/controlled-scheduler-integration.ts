import type { ManagedProject } from "../types/index.js";
import type { MainAgentSchedulerCandidateAssessment, MainAgentSchedulerCandidateGap } from "./scheduler-candidate-assessment.js";
import type { MainAgentWorkflowGraphRecoverySummary } from "./workflowgraph-recovery.js";
import type { MainAgentWorkflowGraphReplaySummary } from "./workflowgraph-replay.js";

export type MainAgentControlledSchedulerRouteKind =
  | "use-existing-controlled-scheduler-path"
  | "wait-for-controlled-gate"
  | "sequential-only"
  | "stale"
  | "blocked"
  | "not-a-candidate";

export interface MainAgentControlledSchedulerRoute {
  version: "1.0";
  authority: "non-executing-main-agent-controlled-scheduler-route";
  executionStarted: false;
  changeId: string;
  projectId: string | null;
  assessedAt: string;
  kind: MainAgentControlledSchedulerRouteKind;
  reason: string;
  candidateKind: MainAgentSchedulerCandidateAssessment["kind"];
  schedulerSignal: MainAgentSchedulerCandidateAssessment["schedulerSignal"];
  route: {
    requiredPath: "existing-controlled-scheduler-owner";
    rawSchedulerAuthority: false;
    executableRequestGenerated: false;
  };
  refs: MainAgentSchedulerCandidateAssessment["refs"];
  gaps: MainAgentSchedulerCandidateGap[];
}

export interface BuildMainAgentControlledSchedulerRouteInput {
  project: ManagedProject;
  changeId: string;
  replaySummary: MainAgentWorkflowGraphReplaySummary;
  recoverySummary: MainAgentWorkflowGraphRecoverySummary;
  schedulerCandidateAssessment: MainAgentSchedulerCandidateAssessment;
}

export function buildMainAgentControlledSchedulerRoute(
  input: BuildMainAgentControlledSchedulerRouteInput,
): MainAgentControlledSchedulerRoute {
  const kindAndReason = routeKindFor(input);
  return {
    version: "1.0",
    authority: "non-executing-main-agent-controlled-scheduler-route",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    assessedAt: new Date().toISOString(),
    kind: kindAndReason.kind,
    reason: kindAndReason.reason,
    candidateKind: input.schedulerCandidateAssessment.kind,
    schedulerSignal: input.schedulerCandidateAssessment.schedulerSignal,
    route: {
      requiredPath: "existing-controlled-scheduler-owner",
      rawSchedulerAuthority: false,
      executableRequestGenerated: false,
    },
    refs: input.schedulerCandidateAssessment.refs,
    gaps: input.schedulerCandidateAssessment.gaps,
  };
}

export function buildDegradedMainAgentControlledSchedulerRoute(
  project: ManagedProject,
  changeId: string,
  schedulerCandidateAssessment: MainAgentSchedulerCandidateAssessment,
  reason: string,
): MainAgentControlledSchedulerRoute {
  return {
    version: "1.0",
    authority: "non-executing-main-agent-controlled-scheduler-route",
    executionStarted: false,
    changeId,
    projectId: project.id,
    assessedAt: new Date().toISOString(),
    kind: "wait-for-controlled-gate",
    reason,
    candidateKind: schedulerCandidateAssessment.kind,
    schedulerSignal: schedulerCandidateAssessment.schedulerSignal,
    route: {
      requiredPath: "existing-controlled-scheduler-owner",
      rawSchedulerAuthority: false,
      executableRequestGenerated: false,
    },
    refs: schedulerCandidateAssessment.refs,
    gaps: schedulerCandidateAssessment.gaps,
  };
}

function routeKindFor(input: BuildMainAgentControlledSchedulerRouteInput): { kind: MainAgentControlledSchedulerRouteKind; reason: string } {
  if (input.schedulerCandidateAssessment.changeId !== input.changeId || input.replaySummary.changeId !== input.changeId || input.recoverySummary.changeId !== input.changeId) {
    return {
      kind: "stale",
      reason: "Controlled scheduler route cannot trust cross-Change main-agent evidence.",
    };
  }
  switch (input.schedulerCandidateAssessment.kind) {
    case "candidate-signal-observed":
      return {
        kind: "use-existing-controlled-scheduler-path",
        reason: "Scheduler candidate evidence is observable; any future execution must use the existing controlled scheduler owner.",
      };
    case "sequential-only":
      return {
        kind: "sequential-only",
        reason: "Current evidence belongs to the sequential WorkflowGraph path.",
      };
    case "candidate-blocked":
      return {
        kind: "blocked",
        reason: "Current Scheduler candidate evidence is blocked.",
      };
    case "stale":
      return {
        kind: "stale",
        reason: "Current Scheduler candidate evidence is stale or scope-mismatched.",
      };
    case "not-low-conflict":
      return {
        kind: "not-a-candidate",
        reason: "Current evidence does not prove a low-conflict Scheduler candidate.",
      };
    case "insufficient-evidence":
    case "wait-for-evidence":
      return {
        kind: "wait-for-controlled-gate",
        reason: "Controlled scheduler route is waiting for fresh Scheduler-specific evidence.",
      };
  }
}
