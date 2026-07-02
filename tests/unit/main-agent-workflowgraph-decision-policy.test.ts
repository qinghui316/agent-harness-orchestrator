import { describe, expect, it } from "vitest";
import {
  evaluateMainAgentWorkflowGraphReplayPolicy,
  type MainAgentWorkflowGraphDecisionPolicyInput,
} from "../../src/main-agent-orchestration/index.js";

type PolicyInputOverrides = {
  currentState?: Partial<MainAgentWorkflowGraphDecisionPolicyInput["currentState"]> & {
    readiness?: Partial<MainAgentWorkflowGraphDecisionPolicyInput["currentState"]["readiness"]>;
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
    expect(policy.strategyDecision).toMatchObject({
      authority: "non-executing-main-agent-strategy-decision",
      executionStarted: false,
      kind: "stale",
      workflowShape: {
        kind: "stale",
        leafInteraction: { roles: [] },
        barrier: "none",
        isolation: "none",
      },
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
    const planningGap = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: { kind: "needs-readiness", reason: "missing readiness" },
    }));
    expect(planningGap).toMatchObject({
      kind: "wait-for-planning-evidence",
      strategyDecision: {
        kind: "read-only-or-clarify",
        workflowShape: { kind: "clarify", leafInteraction: { roles: [] } },
      },
    });

    const awaitingQueueGate = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "awaiting-queue-start-gate",
        reason: "fresh graph",
        readiness: { status: "ready-for-sequential-taskqueue-proposal", nextAllowedAction: "taskqueue.proposal", schedulerEligible: true },
      },
    }));
    expect(awaitingQueueGate).toMatchObject({
      kind: "wait-for-human-gate",
      strategyDecision: {
        kind: "sequential-workflowgraph",
        workflowShape: {
          kind: "pipeline",
          barrier: "pipeline-stage",
          isolation: "single-worktree",
        },
      },
    });

    expect(evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-running",
        queue: { status: "running" },
      },
    }))).toMatchObject({
      kind: "observe-active-queue-loop",
      executionStarted: false,
      strategyDecision: {
        kind: "sequential-workflowgraph",
        workflowShape: { kind: "pipeline" },
      },
    });

    const blocked = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-blocked",
        queue: { status: "failed" },
      },
    }));
    expect(blocked).toMatchObject({
      kind: "blocked",
      strategyDecision: {
        kind: "blocked",
        workflowShape: { kind: "blocked", leafInteraction: { roles: [] } },
      },
    });

    const completed = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-completed",
        queue: { status: "completed" },
      },
    }));
    expect(completed).toMatchObject({
      kind: "completed-await-result-gate",
      strategyDecision: {
        kind: "complete",
        workflowShape: { kind: "terminal" },
        modeCompatibility: { fullAccess: "eligible-for-existing-scoped-automation" },
      },
    });
  });

  it("classifies ready single-change evidence as direct without Scheduler candidacy", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "wait",
        reason: "single change readiness",
        readiness: {
          manifestId: "ready-single",
          status: "ready-for-single-change",
          nextAllowedAction: "code.run",
          schedulerEligible: false,
        },
      },
    }));

    expect(policy.strategyDecision).toMatchObject({
      kind: "direct-single-worktree",
      workflowShape: {
        kind: "direct",
        leafInteraction: { roles: ["coder", "validator", "auditor", "rework"] },
        barrier: "none",
        isolation: "single-worktree",
      },
      modeCompatibility: {
        stepwise: "explain-existing-gate-only",
        fullAccess: "eligible-for-existing-scoped-automation",
      },
    });
    expect(policy.strategyDecision.kind).not.toBe("parallel-scheduler-candidate");
    expect(policy.strategyDecision.stopConditions).toEqual(expect.arrayContaining([
      "plan-confirmation-required",
      "raw-scheduler-required",
      "manual-integration-check-required",
      "integration-apply-discard-required",
      "source-apply-required",
      "change-close-required",
      "remote-pr-merge-required",
      "harness-evolution-required",
      "stale-or-scope-mismatch",
      "ambiguous-or-blocked",
    ]));
  });

  it("classifies fresh Scheduler readiness only as a non-executing parallel candidate", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "wait",
        reason: "scheduler readiness",
        readiness: {
          manifestId: "ready-scheduler",
          status: "ready-for-scheduler-contract",
          nextAllowedAction: "scheduler.contract",
          schedulerEligible: true,
        },
      },
    }));

    expect(policy.strategyDecision).toMatchObject({
      authority: "non-executing-main-agent-strategy-decision",
      executionStarted: false,
      kind: "parallel-scheduler-candidate",
      workflowShape: {
        kind: "parallel-candidate",
        leafInteraction: { roles: ["scheduler-worker", "validator", "auditor", "rework"] },
        barrier: "parallel-barrier",
        isolation: "multi-worktree-candidate",
      },
      modeCompatibility: {
        stepwise: "explain-existing-gate-only",
        fullAccess: "must-stop",
      },
    });
    expect(policy.strategyDecision.reason).toContain("observation only");
    expect(policy.strategyDecision.kind).not.toBe("direct-single-worktree");
    const serialized = JSON.stringify(policy.strategyDecision);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("planning.scheduler.");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("recursiveDelegation");
  });

  it("keeps clarification readiness read-only", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "wait",
        reason: "needs clarification",
        readiness: {
          manifestId: "ready-clarify",
          status: "blocked-needs-clarification",
          nextAllowedAction: "clarification.answer",
          schedulerEligible: false,
        },
      },
    }));

    expect(policy.strategyDecision.kind).toBe("read-only-or-clarify");
    expect(policy.strategyDecision.workflowShape).toMatchObject({
      kind: "clarify",
      leafInteraction: { roles: [] },
      isolation: "none",
    });
    expect(policy.strategyDecision.modeCompatibility.fullAccess).toBe("must-stop");
  });

  it("keeps active queue advice non-executing and payload-free", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        kind: "queue-running",
        queue: { status: "queued" },
      },
    }));

    expect(policy.kind).toBe("observe-active-queue-loop");
    expect(policy.strategyDecision).toMatchObject({
      kind: "sequential-workflowgraph",
      workflowShape: {
        kind: "pipeline",
        leafInteraction: { roles: ["coder", "validator", "auditor", "rework"] },
      },
      modeCompatibility: { fullAccess: "eligible-for-existing-scoped-automation" },
    });
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
    expect(policy.strategyDecision.kind).toBe("complete");
    expect(policy.strategyDecision.workflowShape).toMatchObject({
      kind: "terminal",
      barrier: "integration-required",
      leafInteraction: { roles: [] },
    });
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
    expect(policy.strategyDecision.kind).toBe("sequential-workflowgraph");
    expect(policy.strategyDecision.workflowShape.kind).toBe("pipeline");
  });

  it("keeps workflow shape metadata bounded and non-executable", () => {
    const direct = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        readiness: {
          manifestId: "ready-single",
          status: "ready-for-single-change",
          nextAllowedAction: "code.run",
          schedulerEligible: false,
        },
      },
    })).strategyDecision.workflowShape;
    const parallel = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        readiness: {
          manifestId: "ready-scheduler",
          status: "ready-for-scheduler-contract",
          nextAllowedAction: "scheduler.contract",
          schedulerEligible: true,
        },
      },
    })).strategyDecision.workflowShape;

    expect(direct.kind).toBe("direct");
    expect(parallel.kind).toBe("parallel-candidate");
    expect(direct.kind).not.toBe(parallel.kind);
    expect(direct.isolation).toBe("single-worktree");
    expect(parallel.isolation).toBe("multi-worktree-candidate");
    for (const shape of [direct, parallel]) {
      const serialized = JSON.stringify(shape);
      expect(serialized).not.toContain("recursiveDelegation");
      expect(serialized).not.toContain("actionType");
      expect(serialized).not.toContain("confirmationQueue");
      expect(serialized).not.toContain("planning.scheduler.");
      expect(serialized).not.toContain("result.apply");
      expect(serialized).not.toContain("change.close");
    }
  });

  it("attaches valid strategy advice as read-only metadata without changing the deterministic decision", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        readiness: {
          manifestId: "ready-single",
          status: "ready-for-single-change",
          nextAllowedAction: "code.run",
          schedulerEligible: false,
        },
      },
    }), {
      strategyAdviceInput: {
        kind: "terminal",
        reason: "The model thinks this is done, but baseline is still direct.",
        confidence: 0.9,
        evidenceRefs: ["model-advice:1"],
      },
    });

    expect(policy.strategyDecision.kind).toBe("direct-single-worktree");
    expect(policy.strategyDecision.modeCompatibility.fullAccess).toBe("eligible-for-existing-scoped-automation");
    expect(policy.strategyDecision.strategyAdvice).toMatchObject({
      authority: "read-only-main-agent-strategy-advice",
      executionStarted: false,
      controller: false,
      status: "accepted-readonly",
      kind: "terminal",
      applied: false,
    });
  });

  it("ignores invalid or executable-looking strategy advice without echoing payloads", () => {
    const policy = evaluateMainAgentWorkflowGraphReplayPolicy(input({
      currentState: {
        readiness: {
          manifestId: "ready-scheduler",
          status: "ready-for-scheduler-contract",
          nextAllowedAction: "scheduler.contract",
          schedulerEligible: true,
        },
      },
    }), {
      strategyAdviceInput: {
        kind: "direct",
        reason: "Use planning.scheduler.raw then result.apply",
        recommendedAction: "planning.scheduler.raw",
      },
    });

    expect(policy.strategyDecision.kind).toBe("parallel-scheduler-candidate");
    expect(policy.strategyDecision.modeCompatibility.fullAccess).toBe("must-stop");
    expect(policy.strategyDecision.strategyAdvice).toMatchObject({
      authority: "read-only-main-agent-strategy-advice",
      executionStarted: false,
      controller: false,
      status: "ignored",
      kind: null,
      applied: false,
    });
    const serialized = JSON.stringify(policy.strategyDecision.strategyAdvice);
    expect(serialized).not.toContain("recommendedAction");
    expect(serialized).not.toContain("planning.scheduler.");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("actionType");
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
      readiness: {
        manifestId: null,
        status: null,
        nextAllowedAction: null,
        schedulerEligible: null,
        ...(overrides.currentState?.readiness ?? {}),
      },
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
  delete rest.readiness;
  delete rest.workflow;
  delete rest.queue;
  return rest;
}
