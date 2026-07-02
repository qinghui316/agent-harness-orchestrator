import { describe, expect, it } from "vitest";
import {
  buildMainAgentControlledSchedulerRoute,
  type MainAgentSchedulerCandidateAssessment,
  type MainAgentWorkflowGraphRecoverySummary,
  type MainAgentWorkflowGraphReplaySummary,
} from "../../src/main-agent-orchestration/index.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("main-agent controlled scheduler integration route", () => {
  it("routes candidate signal to the existing controlled scheduler owner without an executable request", () => {
    const route = buildMainAgentControlledSchedulerRoute({
      project: project(),
      changeId: "change-a",
      replaySummary: replaySummary(),
      recoverySummary: recoverySummary(),
      schedulerCandidateAssessment: candidateAssessment({ kind: "candidate-signal-observed" }),
    });

    expect(route.authority).toBe("non-executing-main-agent-controlled-scheduler-route");
    expect(route.executionStarted).toBe(false);
    expect(route.kind).toBe("use-existing-controlled-scheduler-path");
    expect(route.route).toEqual({
      requiredPath: "existing-controlled-scheduler-owner",
      rawSchedulerAuthority: false,
      executableRequestGenerated: false,
    });
    const serialized = JSON.stringify(route);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("planning.scheduler.");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("merge");
    expect(serialized).not.toContain("PR");
  });

  it("keeps sequential, blocked, stale, and weak evidence non-executing", () => {
    expect(routeKind("sequential-only")).toBe("sequential-only");
    expect(routeKind("candidate-blocked")).toBe("blocked");
    expect(routeKind("stale")).toBe("stale");
    expect(routeKind("not-low-conflict")).toBe("not-a-candidate");
    expect(routeKind("insufficient-evidence")).toBe("wait-for-controlled-gate");
    expect(routeKind("wait-for-evidence")).toBe("wait-for-controlled-gate");
  });

  it("fails closed on cross-change evidence", () => {
    const route = buildMainAgentControlledSchedulerRoute({
      project: project(),
      changeId: "change-a",
      replaySummary: replaySummary({ changeId: "other-change" }),
      recoverySummary: recoverySummary(),
      schedulerCandidateAssessment: candidateAssessment({ kind: "candidate-signal-observed" }),
    });

    expect(route.kind).toBe("stale");
    expect(route.reason).toContain("cross-Change");
  });
});

function routeKind(kind: MainAgentSchedulerCandidateAssessment["kind"]) {
  return buildMainAgentControlledSchedulerRoute({
    project: project(),
    changeId: "change-a",
    replaySummary: replaySummary(),
    recoverySummary: recoverySummary(),
    schedulerCandidateAssessment: candidateAssessment({ kind }),
  }).kind;
}

function candidateAssessment(input: { kind: MainAgentSchedulerCandidateAssessment["kind"] }): MainAgentSchedulerCandidateAssessment {
  return {
    version: "1.0",
    authority: "non-executing-main-agent-scheduler-candidate-assessment",
    executionStarted: false,
    changeId: "change-a",
    projectId: "project-a",
    assessedAt: "2026-07-01T00:00:00.000Z",
    kind: input.kind,
    reason: "Fixture candidate.",
    replay: {
      currentStateKind: "wait",
      nextObservationKind: "wait",
    },
    recovery: {
      kind: "insufficient-evidence",
      workflowStatus: null,
      queueStatus: null,
      queueScopeStatus: "unavailable",
    },
    schedulerSignal: {
      readinessStatus: "ready-for-scheduler-contract",
      readinessManifestId: "ready-1",
      readinessNextAllowedAction: "scheduler.contract",
      readinessSchedulerEligible: true,
      source: input.kind === "candidate-signal-observed" ? "readiness-contract" : "none",
      lowConflictEvidencePresent: input.kind === "candidate-signal-observed",
    },
    refs: {
      readinessManifestIds: ["ready-1"],
      workflowRunIds: [],
      taskQueueRunIds: [],
      taskRunIds: [],
      schedulerEvidenceRefs: ["harness/changes/active/change-a/readiness/ready-1.json"],
    },
    gaps: [],
  };
}

function replaySummary(overrides: Partial<MainAgentWorkflowGraphReplaySummary> = {}): MainAgentWorkflowGraphReplaySummary {
  return {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-replay-summary",
    executionStarted: false,
    changeId: "change-a",
    projectId: "project-a",
    builtAt: "2026-07-01T00:00:00.000Z",
    currentState: {
      kind: "wait",
      reason: "Fixture current state.",
      source: "canonical-managers",
      readiness: {
        manifestId: null,
        status: null,
        nextAllowedAction: null,
        schedulerEligible: null,
      },
      workflow: { id: null, status: null, queueRunId: null },
      queue: { id: null, status: null, scopeStatus: "unavailable", totalCount: null, completedCount: null, blockedCount: null, failedCount: null },
      taskRuns: {},
      agentTasks: {},
    },
    latestHistoricalEvidence: {
      workflowGraphDecision: null,
      queueDecision: null,
      roleDecision: null,
      roleEvent: null,
    },
    evidenceHealth: [],
    gaps: [],
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
      kind: "wait",
      reason: "Fixture next observation.",
      targets: ["readiness"],
    },
    strategyDecision: {
      authority: "non-executing-main-agent-strategy-decision",
      executionStarted: false,
      kind: "read-only-or-clarify",
      reason: "Fixture strategy.",
      targets: ["readiness"],
      workflowShape: {
        kind: "clarify",
        reason: "Fixture workflow shape.",
        leafInteraction: { roles: [] },
        barrier: "none",
        isolation: "none",
      },
      refs: {
        mainAgentLoopRunIds: [],
        workflowRunIds: [],
        taskQueueRunIds: [],
        schedulerRunIds: [],
        schedulerControlledStepIds: [],
        taskRunIds: [],
        agentTaskIds: [],
        runIds: [],
        validationIds: [],
        auditIds: [],
      },
      gaps: [],
      modeCompatibility: {
        stepwise: "explain-existing-gate-only",
        fullAccess: "must-stop",
        fullAccessReason: "Fixture.",
      },
      stopConditions: ["plan-confirmation-required"],
    },
    ...overrides,
  };
}

function recoverySummary(overrides: Partial<MainAgentWorkflowGraphRecoverySummary> = {}): MainAgentWorkflowGraphRecoverySummary {
  return {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-recovery-summary",
    executionStarted: false,
    changeId: "change-a",
    projectId: "project-a",
    builtAt: "2026-07-01T00:00:00.000Z",
    kind: "insufficient-evidence",
    reason: "Fixture recovery.",
    replay: {
      currentStateKind: "wait",
      nextObservationKind: "wait",
    },
    workflow: {
      id: null,
      status: null,
      queueRunId: null,
      recoveryKeyFreshness: { status: "unavailable", reason: "No WorkflowRun exists." },
    },
    queue: {
      id: null,
      status: null,
      scopeStatus: "unavailable",
      totalCount: null,
      completedCount: null,
      blockedCount: null,
      failedCount: null,
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
    gaps: [],
    ...overrides,
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
