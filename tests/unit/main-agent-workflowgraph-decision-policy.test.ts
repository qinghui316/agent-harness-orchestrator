import { describe, expect, it } from "vitest";
import {
  evaluateMainAgentWorkflowGraphReplayPolicy,
  type MainAgentWorkflowGraphDecisionPolicyInput,
} from "../../src/main-agent-orchestration/index.js";

type PolicyInputOverrides = {
  currentState?: Partial<MainAgentWorkflowGraphDecisionPolicyInput["currentState"]> & {
    workflow?: Partial<MainAgentWorkflowGraphDecisionPolicyInput["currentState"]["workflow"]>;
    queue?: Partial<MainAgentWorkflowGraphDecisionPolicyInput["currentState"]["queue"]>;
  };
  gaps?: MainAgentWorkflowGraphDecisionPolicyInput["gaps"];
  controlledScheduler?: Partial<MainAgentWorkflowGraphDecisionPolicyInput["controlledScheduler"]>;
};

describe("main-agent WorkflowGraph decision policy", () => {
  it("inspects unsafe evidence gaps before deriving a next step", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      gaps: [{ source: "workflowgraph-decisions", status: "malformed", reason: "bad json" }],
    }));

    expect(policy).toMatchObject({
      authority: "non-executing-main-agent-workflowgraph-decision-policy",
      executionStarted: false,
      kind: "inspect-evidence-gap",
      targets: ["workflowgraph-decisions"],
    });
    expect(JSON.stringify(policy)).not.toContain("actionType");
    expect(JSON.stringify(policy)).not.toContain("confirmationQueue");
    expect(JSON.stringify(policy)).not.toContain("recommendedAction");
  });

  it("treats created WorkflowRun without queue binding as observation, not running", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        workflow: { status: "created", queueRunId: null },
        queue: { id: null, status: null },
      },
    }));

    expect(policy.kind).toBe("observe-queue-binding");
    expect(policy.kind).not.toBe("observe-active-queue-loop");
  });

  it("maps planning gaps, queue progress, blocked state, and completion", () => {
    expect(evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: { kind: "needs-readiness", reason: "missing readiness" },
    })).kind).toBe("wait-for-planning-evidence");

    expect(evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "awaiting-queue-start-gate",
        reason: "fresh graph",
      },
    })).kind).toBe("wait-for-human-gate");

    expect(evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-running",
        queue: { status: "running" },
      },
    }))).toMatchObject({
      kind: "observe-active-queue-loop",
      executionStarted: false,
    });

    expect(evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-blocked",
        queue: { status: "failed" },
      },
    })).kind).toBe("blocked");

    expect(evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-completed",
        queue: { status: "completed" },
      },
    })).kind).toBe("completed-await-result-gate");
  });

  it("keeps active queue advice non-executing and payload-free", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-running",
        queue: { status: "queued" },
      },
    }));

    expect(policy.kind).toBe("observe-active-queue-loop");
    expect(policy.reason).toContain("observe");
    const serialized = JSON.stringify(policy);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("recommendedAction");
    expect(serialized).not.toContain("planning.scheduler.");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
  });

  it("consumes controlled Scheduler terminal handoff as read-only observation", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: { kind: "wait", reason: "bounded scheduler handoff" },
      controlledScheduler: {
        healthStatus: "available",
        latestStep: {
          id: "controlled-step-1",
          schedulerRunId: "scheduler-run-1",
          status: "recorded",
          executedAction: "planning.scheduler.worker.reconcile-result",
          routePosture: "terminal-handoff",
          continuationReadinessStatus: "terminal-handoff",
          postStepHandoffStatus: "terminal-handoff",
          postStepStopReason: "Scheduler terminal handoff.",
          resultKind: "scheduler-run-completion",
          resultStatus: "completed",
          recordedWithWarning: false,
          evidenceRefs: ["evidence-ref"],
          artifactRefs: ["artifact-ref"],
          createdAt: "2026-07-01T00:02:00.000Z",
          updatedAt: "2026-07-01T00:02:00.000Z",
        },
      },
    }));

    expect(policy.kind).toBe("completed-await-result-gate");
    const serialized = JSON.stringify(policy);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
  });

  it("does not let controlled Scheduler history override canonical active queue state", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-running",
        queue: { status: "running" },
      },
      controlledScheduler: {
        healthStatus: "available",
        latestStep: {
          id: "controlled-step-1",
          schedulerRunId: "scheduler-run-1",
          status: "recorded",
          executedAction: "planning.scheduler.worker.reconcile-result",
          routePosture: "terminal-handoff",
          continuationReadinessStatus: "terminal-handoff",
          postStepHandoffStatus: "terminal-handoff",
          postStepStopReason: "Scheduler terminal handoff.",
          resultKind: "scheduler-run-completion",
          resultStatus: "completed",
          recordedWithWarning: false,
          evidenceRefs: ["evidence-ref"],
          artifactRefs: ["artifact-ref"],
          createdAt: "2026-07-01T00:02:00.000Z",
          updatedAt: "2026-07-01T00:02:00.000Z",
        },
      },
    }));

    expect(policy.kind).toBe("observe-active-queue-loop");
  });
});

function input(overrides: PolicyInputOverrides = {}): MainAgentWorkflowGraphDecisionPolicyInput {
  return {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-replay-summary",
    executionStarted: false,
    changeId: "change-a",
    projectId: "project-a",
    builtAt: "2026-07-01T00:00:00.000Z",
    currentState: {
      kind: "wait",
      reason: "waiting",
      source: "canonical-managers",
      workflow: {
        id: "workflow-1",
        status: null,
        queueRunId: null,
        ...(overrides.currentState?.workflow ?? {}),
      },
      queue: {
        id: "queue-1",
        status: null,
        scopeStatus: "matched",
        totalCount: 1,
        completedCount: 0,
        blockedCount: 0,
        failedCount: 0,
        ...(overrides.currentState?.queue ?? {}),
      },
      taskRuns: {},
      agentTasks: {},
      ...withoutNested(overrides.currentState),
    },
    latestHistoricalEvidence: {
      workflowGraphDecision: null,
      queueDecision: null,
      roleDecision: null,
      roleEvent: null,
    },
    evidenceHealth: [],
    gaps: overrides.gaps ?? [],
    artifactRefs: [],
    refs: {
      mainAgentLoopRunIds: [],
      workflowRunIds: [],
      taskQueueRunIds: [],
      schedulerControlledStepIds: [],
      taskRunIds: [],
      agentTaskIds: [],
      runIds: [],
      validationIds: [],
      auditIds: [],
    },
    controlledScheduler: {
      latestStep: null,
      expectedSchedulerRunId: null,
      healthStatus: "missing",
      reasons: [],
      artifactRefs: [],
      ...(overrides.controlledScheduler ?? {}),
    },
  };
}

function withoutNested(
  value: PolicyInputOverrides["currentState"],
): Partial<MainAgentWorkflowGraphDecisionPolicyInput["currentState"]> {
  if (!value) return {};
  const rest = { ...value };
  delete rest.workflow;
  delete rest.queue;
  return rest;
}
