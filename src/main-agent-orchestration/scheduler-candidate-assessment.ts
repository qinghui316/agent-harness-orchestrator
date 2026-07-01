import type { ManagedProject } from "../types/index.js";
import type { MainAgentWorkflowGraphDecisionEvidence } from "./workflowgraph-observation.js";
import type { MainAgentWorkflowGraphRecoverySummary } from "./workflowgraph-recovery.js";
import type { MainAgentWorkflowGraphReplaySummary } from "./workflowgraph-replay.js";

export type MainAgentSchedulerCandidateAssessmentKind =
  | "insufficient-evidence"
  | "stale"
  | "sequential-only"
  | "not-low-conflict"
  | "candidate-signal-observed"
  | "candidate-blocked"
  | "wait-for-evidence";

export type MainAgentSchedulerCandidateGapStatus =
  | "missing"
  | "stale"
  | "scope-mismatch"
  | "malformed"
  | "old-schema"
  | "unavailable";

export interface MainAgentSchedulerCandidateGap {
  source: "workflowgraph-observation" | "replay-summary" | "recovery-summary" | "scheduler-readiness";
  status: MainAgentSchedulerCandidateGapStatus;
  reason: string;
  refs: string[];
}

export interface MainAgentSchedulerCandidateAssessment {
  version: "1.0";
  authority: "non-executing-main-agent-scheduler-candidate-assessment";
  executionStarted: false;
  changeId: string;
  projectId: string | null;
  assessedAt: string;
  /**
   * Evidence label only. This is not a readiness verdict, gate,
   * recommendation, scheduler transition, or execution authority.
   */
  kind: MainAgentSchedulerCandidateAssessmentKind;
  reason: string;
  replay: {
    currentStateKind: MainAgentWorkflowGraphReplaySummary["currentState"]["kind"];
    nextObservationKind: MainAgentWorkflowGraphReplaySummary["nextObservation"]["kind"];
  };
  recovery: {
    kind: MainAgentWorkflowGraphRecoverySummary["kind"];
    workflowStatus: MainAgentWorkflowGraphRecoverySummary["workflow"]["status"];
    queueStatus: MainAgentWorkflowGraphRecoverySummary["queue"]["status"];
    queueScopeStatus: MainAgentWorkflowGraphRecoverySummary["queue"]["scopeStatus"];
  };
  schedulerSignal: {
    readinessStatus: string | null;
    readinessManifestId: string | null;
    source: "readiness-status" | "none";
    lowConflictEvidencePresent: boolean;
  };
  refs: {
    readinessManifestIds: string[];
    workflowRunIds: string[];
    taskQueueRunIds: string[];
    taskRunIds: string[];
    schedulerEvidenceRefs: string[];
  };
  gaps: MainAgentSchedulerCandidateGap[];
}

export interface BuildMainAgentSchedulerCandidateAssessmentInput {
  project: ManagedProject;
  changeId: string;
  observationEvidence: MainAgentWorkflowGraphDecisionEvidence;
  replaySummary: MainAgentWorkflowGraphReplaySummary;
  recoverySummary: MainAgentWorkflowGraphRecoverySummary;
}

export function buildMainAgentSchedulerCandidateAssessment(
  input: BuildMainAgentSchedulerCandidateAssessmentInput,
): MainAgentSchedulerCandidateAssessment {
  const readinessStatus = input.observationEvidence.observation.stage.readinessStatus;
  const readinessManifestId = input.observationEvidence.observation.stage.readinessManifestId;
  const gaps = buildGaps(input);
  const refs = buildRefs(input, readinessManifestId);
  const kindAndReason = deriveAssessmentKind({
    readinessStatus,
    observationEvidence: input.observationEvidence,
    replaySummary: input.replaySummary,
    recoverySummary: input.recoverySummary,
    gaps,
  });
  return {
    version: "1.0",
    authority: "non-executing-main-agent-scheduler-candidate-assessment",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    assessedAt: new Date().toISOString(),
    kind: kindAndReason.kind,
    reason: kindAndReason.reason,
    replay: {
      currentStateKind: input.replaySummary.currentState.kind,
      nextObservationKind: input.replaySummary.nextObservation.kind,
    },
    recovery: {
      kind: input.recoverySummary.kind,
      workflowStatus: input.recoverySummary.workflow.status,
      queueStatus: input.recoverySummary.queue.status,
      queueScopeStatus: input.recoverySummary.queue.scopeStatus,
    },
    schedulerSignal: {
      readinessStatus,
      readinessManifestId,
      source: readinessStatus === "ready-for-scheduler-contract" ? "readiness-status" : "none",
      lowConflictEvidencePresent: kindAndReason.kind === "candidate-signal-observed",
    },
    refs,
    gaps,
  };
}

export function buildDegradedMainAgentSchedulerCandidateAssessment(
  project: ManagedProject,
  changeId: string,
  replaySummary: MainAgentWorkflowGraphReplaySummary,
  recoverySummary: MainAgentWorkflowGraphRecoverySummary,
  reason: string,
): MainAgentSchedulerCandidateAssessment {
  return {
    version: "1.0",
    authority: "non-executing-main-agent-scheduler-candidate-assessment",
    executionStarted: false,
    changeId,
    projectId: project.id,
    assessedAt: new Date().toISOString(),
    kind: "insufficient-evidence",
    reason,
    replay: {
      currentStateKind: replaySummary.currentState.kind,
      nextObservationKind: replaySummary.nextObservation.kind,
    },
    recovery: {
      kind: recoverySummary.kind,
      workflowStatus: recoverySummary.workflow.status,
      queueStatus: recoverySummary.queue.status,
      queueScopeStatus: recoverySummary.queue.scopeStatus,
    },
    schedulerSignal: {
      readinessStatus: null,
      readinessManifestId: null,
      source: "none",
      lowConflictEvidencePresent: false,
    },
    refs: {
      readinessManifestIds: [],
      workflowRunIds: recoverySummary.refs.workflowRunIds,
      taskQueueRunIds: recoverySummary.refs.taskQueueRunIds,
      taskRunIds: recoverySummary.refs.taskRunIds,
      schedulerEvidenceRefs: [],
    },
    gaps: [{
      source: "scheduler-readiness",
      status: "unavailable",
      reason,
      refs: [],
    }],
  };
}

function deriveAssessmentKind(input: {
  readinessStatus: string | null;
  observationEvidence: MainAgentWorkflowGraphDecisionEvidence;
  replaySummary: MainAgentWorkflowGraphReplaySummary;
  recoverySummary: MainAgentWorkflowGraphRecoverySummary;
  gaps: MainAgentSchedulerCandidateGap[];
}): { kind: MainAgentSchedulerCandidateAssessmentKind; reason: string } {
  if (hasBlockingGap(input.gaps) || input.replaySummary.currentState.kind === "stale" || ["stale", "scope-mismatch"].includes(input.recoverySummary.kind)) {
    return {
      kind: "stale",
      reason: "Scheduler candidate assessment cannot trust stale, malformed, or scope-mismatched WorkflowGraph evidence.",
    };
  }
  if (input.recoverySummary.kind === "blocked" || input.replaySummary.currentState.kind === "queue-blocked") {
    return {
      kind: "candidate-blocked",
      reason: "Current WorkflowGraph evidence is blocked before any Scheduler candidate can be observed.",
    };
  }
  if (hasSequentialQueueEvidence(input.replaySummary, input.recoverySummary)) {
    return {
      kind: "sequential-only",
      reason: "Current WorkflowGraph evidence is already bound to sequential queue or result-gate observation.",
    };
  }
  switch (input.readinessStatus) {
    case "ready-for-scheduler-contract":
      if (input.observationEvidence.observation.freshness.status !== "fresh") {
        return {
          kind: "stale",
          reason: "Scheduler readiness exists but WorkflowGraph artifact freshness is not current.",
        };
      }
      return {
        kind: "candidate-signal-observed",
        reason: "Fresh same-Change readiness evidence explicitly marks this graph as Scheduler-contract eligible.",
      };
    case "ready-for-sequential-taskqueue-proposal":
    case "ready-for-single-change":
      return {
        kind: "sequential-only",
        reason: "Readiness evidence selects a sequential or single-change path, not Scheduler.",
      };
    case "blocked-parallel-guardrails":
    case "blocked-multi-change-boundary":
    case "invalid":
      return {
        kind: "not-low-conflict",
        reason: `Readiness evidence is ${input.readinessStatus}; low-conflict Scheduler candidacy is not proven.`,
      };
    case "blocked-needs-clarification":
      return {
        kind: "candidate-blocked",
        reason: "Readiness evidence requires clarification before Scheduler candidacy can be observed.",
      };
    case null:
      return {
        kind: "insufficient-evidence",
        reason: "No readiness evidence exists, so Scheduler candidacy cannot be inferred.",
      };
    default:
      return {
        kind: "wait-for-evidence",
        reason: `Readiness evidence is ${input.readinessStatus}; wait for a fresh Scheduler-specific signal.`,
      };
  }
}

function hasSequentialQueueEvidence(
  replaySummary: MainAgentWorkflowGraphReplaySummary,
  recoverySummary: MainAgentWorkflowGraphRecoverySummary,
): boolean {
  return [
    "queue-running",
    "queue-paused",
    "queue-completed",
  ].includes(replaySummary.currentState.kind)
    || [
      "queue-observable",
      "stage-resume-observable",
      "completed-await-result-gate",
    ].includes(recoverySummary.kind);
}

function hasBlockingGap(gaps: MainAgentSchedulerCandidateGap[]): boolean {
  return gaps.some((gap) => ["stale", "scope-mismatch", "malformed", "old-schema"].includes(gap.status));
}

function buildGaps(input: BuildMainAgentSchedulerCandidateAssessmentInput): MainAgentSchedulerCandidateGap[] {
  const gaps: MainAgentSchedulerCandidateGap[] = [];
  if (input.observationEvidence.changeId !== input.changeId || input.replaySummary.changeId !== input.changeId || input.recoverySummary.changeId !== input.changeId) {
    gaps.push({
      source: "workflowgraph-observation",
      status: "scope-mismatch",
      reason: "Observation, replay, or recovery evidence belongs to a different Change.",
      refs: dedupeStrings([input.observationEvidence.ref]),
    });
  }
  if (!input.observationEvidence.observation.stage.readinessManifestId) {
    gaps.push({
      source: "scheduler-readiness",
      status: "missing",
      reason: "No DecompositionReadinessManifest is available.",
      refs: [],
    });
  }
  if (input.observationEvidence.observation.freshness.status === "stale") {
    gaps.push({
      source: "workflowgraph-observation",
      status: "stale",
      reason: firstReason(input.observationEvidence.observation.freshness.reasons) ?? "WorkflowGraph artifact freshness is stale.",
      refs: input.observationEvidence.artifactRefs,
    });
  }
  if (input.observationEvidence.observation.queue.scopeStatus === "mismatch") {
    gaps.push({
      source: "workflowgraph-observation",
      status: "scope-mismatch",
      reason: "TaskQueue and WorkflowRun scope mismatch.",
      refs: dedupeStrings([input.observationEvidence.observation.queue.queueRunId, input.observationEvidence.observation.queue.workflowRunId]),
    });
  }
  for (const gap of input.replaySummary.gaps) {
    gaps.push({
      source: "replay-summary",
      status: gap.status === "available" ? "unavailable" : gap.status,
      reason: gap.reason,
      refs: [],
    });
  }
  for (const gap of input.recoverySummary.gaps) {
    gaps.push({
      source: "recovery-summary",
      status: gap.status,
      reason: gap.reason,
      refs: gap.refs,
    });
  }
  return gaps;
}

function buildRefs(
  input: BuildMainAgentSchedulerCandidateAssessmentInput,
  readinessManifestId: string | null,
): MainAgentSchedulerCandidateAssessment["refs"] {
  return {
    readinessManifestIds: dedupeStrings([readinessManifestId]),
    workflowRunIds: dedupeStrings([
      ...input.replaySummary.refs.workflowRunIds,
      ...input.recoverySummary.refs.workflowRunIds,
      ...input.observationEvidence.refs.workflowRunIds,
    ]),
    taskQueueRunIds: dedupeStrings([
      ...input.replaySummary.refs.taskQueueRunIds,
      ...input.recoverySummary.refs.taskQueueRunIds,
      ...input.observationEvidence.refs.taskQueueRunIds,
    ]),
    taskRunIds: dedupeStrings([
      ...input.replaySummary.refs.taskRunIds,
      ...input.recoverySummary.refs.taskRunIds,
    ]),
    schedulerEvidenceRefs: dedupeStrings([
      ...input.observationEvidence.artifactRefs,
      ...input.replaySummary.artifactRefs,
    ]),
  };
}

function firstReason(reasons: string[]): string | null {
  return reasons.find((reason) => reason.trim().length > 0) ?? null;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
