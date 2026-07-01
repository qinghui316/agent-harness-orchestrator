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
    expect(policy.kind).not.toBe("continue-queue-step-loop");
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
    })).kind).toBe("continue-queue-step-loop");

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
      taskRunIds: [],
      agentTaskIds: [],
      runIds: [],
      validationIds: [],
      auditIds: [],
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
