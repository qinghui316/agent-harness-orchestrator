import { describe, expect, it } from "vitest";
import {
  buildMainAgentSchedulerCandidateAssessment,
  type MainAgentWorkflowGraphDecisionEvidence,
  type MainAgentWorkflowGraphRecoverySummary,
  type MainAgentWorkflowGraphReplaySummary,
} from "../../src/main-agent-orchestration/index.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("main-agent Scheduler candidate assessment", () => {
  it("observes a candidate signal only from fresh scheduler readiness evidence", () => {
    const result = assess({
      readinessStatus: "ready-for-scheduler-contract",
      readinessManifestId: "ready-1",
    });

    expect(result.authority).toBe("non-executing-main-agent-scheduler-candidate-assessment");
    expect(result.executionStarted).toBe(false);
    expect(result.kind).toBe("candidate-signal-observed");
    expect(result.schedulerSignal.lowConflictEvidencePresent).toBe(true);
    expect(result.refs.readinessManifestIds).toEqual(["ready-1"]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("planning.scheduler.");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("merge");
    expect(serialized).not.toContain("PR");
  });

  it("does not infer scheduler candidacy from active sequential queue evidence", () => {
    const result = assess({
      readinessStatus: "ready-for-scheduler-contract",
      replay: { currentState: { kind: "queue-running" } },
      recovery: { kind: "queue-observable", queue: { status: "running" } },
    });

    expect(result.kind).toBe("sequential-only");
    expect(result.schedulerSignal.lowConflictEvidencePresent).toBe(false);
  });

  it("keeps sequential readiness as sequential-only", () => {
    const result = assess({
      readinessStatus: "ready-for-sequential-taskqueue-proposal",
      readinessManifestId: "ready-sequential",
    });

    expect(result.kind).toBe("sequential-only");
    expect(result.schedulerSignal.source).toBe("none");
  });

  it("treats blocked parallel guardrails as not low conflict", () => {
    const result = assess({
      readinessStatus: "blocked-parallel-guardrails",
      readinessManifestId: "ready-blocked",
    });

    expect(result.kind).toBe("not-low-conflict");
    expect(result.reason).toContain("blocked-parallel-guardrails");
  });

  it("fails closed on stale or scope-mismatched evidence", () => {
    const stale = assess({
      readinessStatus: "ready-for-scheduler-contract",
      observation: { freshness: { status: "stale", reasons: ["Artifact hash drift."] } },
    });
    const mismatch = assess({
      readinessStatus: "ready-for-scheduler-contract",
      replay: { gaps: [{ source: "canonical-observation", status: "scope-mismatch", reason: "Cross Change." }] },
    });

    expect(stale.kind).toBe("stale");
    expect(mismatch.kind).toBe("stale");
    expect(mismatch.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "replay-summary", status: "scope-mismatch" }),
    ]));
  });

  it("blocks candidate assessment when current recovery evidence is blocked", () => {
    const result = assess({
      readinessStatus: "ready-for-scheduler-contract",
      recovery: { kind: "blocked" },
    });

    expect(result.kind).toBe("candidate-blocked");
  });

  it("requires readiness evidence instead of using idle state as a signal", () => {
    const result = assess({
      readinessStatus: null,
      readinessManifestId: null,
      replay: { currentState: { kind: "awaiting-queue-start-gate" } },
    });

    expect(result.kind).toBe("insufficient-evidence");
    expect(result.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "scheduler-readiness", status: "missing" }),
    ]));
  });
});

function assess(input: {
  readinessStatus?: string | null;
  readinessManifestId?: string | null;
  observation?: Partial<MainAgentWorkflowGraphDecisionEvidence["observation"]>;
  replay?: Partial<MainAgentWorkflowGraphReplaySummary> & {
    currentState?: Partial<MainAgentWorkflowGraphReplaySummary["currentState"]>;
    gaps?: MainAgentWorkflowGraphReplaySummary["gaps"];
  };
  recovery?: Partial<MainAgentWorkflowGraphRecoverySummary> & {
    queue?: Partial<MainAgentWorkflowGraphRecoverySummary["queue"]>;
    gaps?: MainAgentWorkflowGraphRecoverySummary["gaps"];
  };
}) {
  const observationEvidence = observationEvidenceFixture(input);
  const replaySummary = replaySummaryFixture(input);
  const recoverySummary = recoverySummaryFixture(input);
  return buildMainAgentSchedulerCandidateAssessment({
    project: project(),
    changeId: "change-a",
    observationEvidence,
    replaySummary,
    recoverySummary,
  });
}

function observationEvidenceFixture(input: {
  readinessStatus?: string | null;
  readinessManifestId?: string | null;
  observation?: Partial<MainAgentWorkflowGraphDecisionEvidence["observation"]>;
}): MainAgentWorkflowGraphDecisionEvidence {
  const readinessStatus = input.readinessStatus === undefined ? "ready-for-scheduler-contract" : input.readinessStatus;
  const readinessManifestId = input.readinessManifestId === undefined ? "ready-1" : input.readinessManifestId;
  const observation: MainAgentWorkflowGraphDecisionEvidence["observation"] = {
    version: "1.0",
    changeId: "change-a",
    projectId: "project-a",
    observedAt: "2026-07-01T00:00:00.000Z",
    stage: {
      decompositionPlanId: "decomp-1",
      decompositionPlanStatus: "confirmed",
      readinessManifestId,
      readinessStatus,
      taskQueueProposalId: null,
      taskQueueProposalStatus: null,
      workflowGraphPlanId: null,
      workflowGraphPlanStatus: null,
    },
    queue: {
      queueRunId: null,
      workflowRunId: null,
      scopeStatus: "unavailable",
      queueStatus: null,
      workflowStatus: null,
      totalCount: null,
      completedCount: null,
      blockedCount: null,
      failedCount: null,
    },
    freshness: { status: "fresh", reasons: [] },
    recovery: { status: "unavailable", reasons: ["No WorkflowRun exists."] },
    artifactRefs: readinessManifestId ? [`harness/changes/active/change-a/readiness/${readinessManifestId}.json`] : [],
    refs: {
      mainAgentLoopRunIds: [],
      workflowRunIds: [],
      taskQueueRunIds: [],
    },
    ...input.observation,
  };
  if (input.observation?.stage) observation.stage = { ...observation.stage, ...input.observation.stage };
  if (input.observation?.queue) observation.queue = { ...observation.queue, ...input.observation.queue };
  if (input.observation?.freshness) observation.freshness = { ...observation.freshness, ...input.observation.freshness };
  return {
    version: "1.0",
    authority: "non-executing-main-agent-workflowgraph-decision-evidence",
    executionStarted: false,
    id: "workflowgraph-decision-1",
    ref: "agent-tasks/main-agent-workflowgraph/change-a/workflowgraph-decisions.jsonl#workflowgraph-decision-1",
    changeId: "change-a",
    projectId: "project-a",
    createdAt: "2026-07-01T00:00:00.000Z",
    observation,
    decision: {
      kind: "wait",
      reason: "Fixture.",
    },
    artifactRefs: observation.artifactRefs,
    refs: observation.refs,
  };
}

function replaySummaryFixture(input: {
  replay?: Partial<MainAgentWorkflowGraphReplaySummary> & {
    currentState?: Partial<MainAgentWorkflowGraphReplaySummary["currentState"]>;
    gaps?: MainAgentWorkflowGraphReplaySummary["gaps"];
  };
}): MainAgentWorkflowGraphReplaySummary {
  const currentState: MainAgentWorkflowGraphReplaySummary["currentState"] = {
    kind: "awaiting-queue-start-gate",
    reason: "Fixture current state.",
    source: "canonical-managers",
    workflow: { id: null, status: null, queueRunId: null },
    queue: {
      id: null,
      status: null,
      scopeStatus: "unavailable",
      totalCount: null,
      completedCount: null,
      blockedCount: null,
      failedCount: null,
    },
    taskRuns: {},
    agentTasks: {},
    ...input.replay?.currentState,
  };
  return {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-replay-summary",
    executionStarted: false,
    changeId: "change-a",
    projectId: "project-a",
    builtAt: "2026-07-01T00:00:00.000Z",
    latestHistoricalEvidence: {
      workflowGraphDecision: null,
      queueDecision: null,
      roleDecision: null,
      roleEvent: null,
    },
    evidenceHealth: [],
    gaps: input.replay?.gaps ?? [],
    artifactRefs: [],
    refs: {
      mainAgentLoopRunIds: [],
      workflowRunIds: [],
      taskQueueRunIds: [],
      taskRunIds: [],
      agentTaskIds: [],
      runIds: [],
      validationIds: [],
      auditIds: [],
    },
    nextObservation: {
      kind: "wait-for-planning-evidence",
      reason: "Fixture next observation.",
      targets: ["readiness"],
    },
    ...input.replay,
    currentState,
  };
}

function recoverySummaryFixture(input: {
  recovery?: Partial<MainAgentWorkflowGraphRecoverySummary> & {
    queue?: Partial<MainAgentWorkflowGraphRecoverySummary["queue"]>;
    gaps?: MainAgentWorkflowGraphRecoverySummary["gaps"];
  };
}): MainAgentWorkflowGraphRecoverySummary {
  const queue: MainAgentWorkflowGraphRecoverySummary["queue"] = {
    id: null,
    status: null,
    scopeStatus: "unavailable",
    totalCount: null,
    completedCount: null,
    blockedCount: null,
    failedCount: null,
    ...input.recovery?.queue,
  };
  return {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-recovery-summary",
    executionStarted: false,
    changeId: "change-a",
    projectId: "project-a",
    builtAt: "2026-07-01T00:00:00.000Z",
    kind: "insufficient-evidence",
    reason: "No WorkflowRun exists.",
    replay: {
      currentStateKind: "awaiting-queue-start-gate",
      nextObservationKind: "wait-for-planning-evidence",
    },
    workflow: {
      id: null,
      status: null,
      queueRunId: null,
      recoveryKeyFreshness: {
        status: "unavailable",
        reason: "No WorkflowRun exists.",
      },
    },
    stages: [],
    refs: {
      workflowRunIds: [],
      taskQueueRunIds: [],
      taskRunIds: [],
      runIds: [],
      validationIds: [],
      auditIds: [],
    },
    gaps: input.recovery?.gaps ?? [{
      source: "workflow-run",
      status: "missing",
      reason: "No WorkflowRun exists.",
      refs: [],
    }],
    ...input.recovery,
    queue,
  };
}

function project(): ManagedProject {
  return {
    id: "project-a",
    name: "project-a",
    path: "E:/tmp/project-a",
    addedAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-07-01T00:00:00.000Z",
  };
}
