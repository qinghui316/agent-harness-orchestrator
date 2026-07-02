import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessMainAgentResumeConsumption,
  assessMainAgentStrategyConsumption,
  buildMainAgentStrategyConsumptionContext,
  buildMainAgentStrategyAdvice,
  mainAgentWorkflowGraphDecisionsPath,
  type MainAgentResumeContinuationContext,
  type MainAgentStrategyConsumptionGateSummary,
  type MainAgentStrategyDecision,
} from "../../src/main-agent-orchestration/index.js";
import type { ManagedProject, ResolvedMemory } from "../../src/types/index.js";

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("main-agent strategy consumption", () => {
  it("builds strategy context without recording WorkflowGraph decision evidence", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-strategy-consumption-"));
    const mem = memory(root);
    const context = await buildMainAgentStrategyConsumptionContext(mem, project(), "change-a");

    expect(context).toMatchObject({
      authority: "read-only-main-agent-strategy-consumption-context",
      executionStarted: false,
    });
    expect(context.strategyDecision).toBe(context.replaySummary.strategyDecision);
    expect(existsSync(mainAgentWorkflowGraphDecisionsPath(mem, "change-a"))).toBe(false);
  });

  it("keeps request-approval explanatory and non-executing", () => {
    const assessment = assessMainAgentStrategyConsumption({
      strategyDecision: strategy("direct-single-worktree"),
      mode: "request-approval",
      selectedChangeId: "change-a",
      currentGate: workflowGate(),
    });

    expect(assessment).toMatchObject({
      authority: "non-executing-main-agent-strategy-consumption-assessment",
      executionStarted: false,
      status: "explain-existing-gate",
      mode: "request-approval",
      strategyKind: "direct-single-worktree",
    });
    expect(JSON.stringify(assessment)).not.toContain("actionType");
    expect(JSON.stringify(assessment)).not.toContain("confirmationQueue");
    expect(JSON.stringify(assessment)).not.toContain("planning.scheduler.");
  });

  it("allows full-access only for existing scoped local gates and eligible strategy kinds", () => {
    for (const kind of ["direct-single-worktree", "sequential-workflowgraph", "complete"] as const) {
      expect(assessMainAgentStrategyConsumption({
        strategyDecision: strategy(kind),
        mode: "full-access",
        selectedChangeId: "change-a",
        currentGate: workflowGate(),
      })).toMatchObject({
        status: "allow-existing-scoped-automation",
        strategyKind: kind,
        gatePosture: {
          kind: "workflow",
          enabled: true,
          scopedAutomationEligible: true,
          sameChange: true,
        },
      });
    }
  });

  it("keeps advice-assisted final strategy inside existing request/full-access gates", () => {
    const adviceAssisted = strategy("direct-single-worktree", {
      kindSource: "bounded-advice",
      deterministicBaseline: {
        kind: "read-only-or-clarify",
        reason: "ambiguous baseline",
        targets: ["workflowgraph-observation"],
      },
      adviceConsumption: {
        authority: "non-executing-main-agent-strategy-advice-consumption",
        executionStarted: false,
        controller: false,
        status: "accepted-bounded",
        baselineKind: "read-only-or-clarify",
        finalKind: "direct-single-worktree",
        finalKindSource: "bounded-advice",
        adviceKind: "direct",
        reason: "Bounded advice selected direct-single-worktree.",
        evidenceRefs: ["advice:direct"],
      },
    });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: adviceAssisted,
      mode: "request-approval",
      selectedChangeId: "change-a",
      currentGate: workflowGate(),
    })).toMatchObject({
      status: "explain-existing-gate",
      strategyKind: "direct-single-worktree",
    });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: adviceAssisted,
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate(),
    })).toMatchObject({
      status: "allow-existing-scoped-automation",
      gatePosture: {
        enabled: true,
        sameChange: true,
        scopedAutomationEligible: true,
      },
    });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: adviceAssisted,
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ scopedAutomationEligible: false }),
    })).toMatchObject({ status: "stop-for-human-gate" });
  });

  it("allows existing local approval gates for complete strategy without embedding approval payloads", () => {
    const assessment = assessMainAgentStrategyConsumption({
      strategyDecision: strategy("complete"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: approvalGate(),
    });

    expect(assessment.status).toBe("allow-existing-scoped-automation");
    expect(assessment.gatePosture.family).toBe("local-approval");
    const serialized = JSON.stringify(assessment);
    expect(serialized).not.toContain("audit.accept");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("actionType");
  });

  it("stops parallel, clarify, stale, blocked, disabled, and cross-change cases", () => {
    expect(assessMainAgentStrategyConsumption({
      strategyDecision: strategy("parallel-scheduler-candidate"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ family: "controlled-scheduler" }),
    })).toMatchObject({ status: "stop-for-human-gate" });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: strategy("read-only-or-clarify"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate(),
    })).toMatchObject({ status: "stop-for-human-gate" });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: strategy("stale", { gaps: [{ source: "replay-summary", status: "stale", reason: "old" }] }),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate(),
    })).toMatchObject({ status: "stale" });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: strategy("blocked"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate(),
    })).toMatchObject({ status: "blocked" });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ enabled: false }),
    })).toMatchObject({ status: "blocked" });

    expect(assessMainAgentStrategyConsumption({
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ changeId: "change-b" }),
    })).toMatchObject({ status: "stale" });
  });

  it("fails closed when the current gate is not scoped-automation eligible", () => {
    const assessment = assessMainAgentStrategyConsumption({
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ scopedAutomationEligible: false }),
    });

    expect(assessment.status).toBe("stop-for-human-gate");
    expect(assessment.gatePosture.scopedAutomationEligible).toBe(false);
  });

  it("does not intercept ordinary full-access when no explicit continuation was requested", () => {
    const assessment = assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext({ status: "not-requested", resumePoint: undefined }),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    });

    expect(assessment).toMatchObject({
      authority: "non-executing-main-agent-resume-consumption-assessment",
      executionStarted: false,
      status: "not-requested",
    });
  });

  it("keeps request-approval resume continuation explain-only", () => {
    const assessment = assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "request-approval",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    });

    expect(assessment.status).toBe("explain-existing-gate");
    expect(assessment.resumePosture.scopedLocalLane).toBe(true);
    expect(JSON.stringify(assessment)).not.toContain("confirmationPayload");
    expect(JSON.stringify(assessment)).not.toContain("planning.scheduler.");
  });

  it("allows full-access resume only for scoped-local exact current gate matches", () => {
    const assessment = assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    });

    expect(assessment).toMatchObject({
      status: "allow-existing-scoped-automation",
      resumePosture: {
        scopedLocalLane: true,
        gateKindMatches: true,
        actionMatches: true,
        targetIdsMatch: true,
      },
    });
  });

  it("fails closed for non-scoped lanes, current gate mismatch, and non-eligible strategies", () => {
    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext({ lane: "manual-gate" }),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stop-for-human-gate" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "validate.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stale" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-2"] }),
    })).toMatchObject({ status: "stale" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("parallel-scheduler-candidate"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stop-for-human-gate" });
  });

  it("maps unavailable or unsafe continuation context to fail-closed statuses", () => {
    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext({ status: "missing", resumePoint: undefined }),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stop-for-human-gate" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext({ status: "scope-mismatch", resumePoint: undefined }),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stale" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext({ status: "blocked", resumePoint: undefined }),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "blocked" });
  });

  it("prioritizes stale resume and strategy evidence before blocked or explain-only states", () => {
    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("stale"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stale" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("direct-single-worktree", { gaps: [{ source: "replay-summary", status: "scope-mismatch", reason: "wrong scope" }] }),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stale" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("blocked"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "blocked" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext({ status: "blocked", resumePoint: undefined }),
      strategyDecision: strategy("direct-single-worktree"),
      mode: "full-access",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ changeId: "change-b", actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stale" });

    expect(assessMainAgentResumeConsumption({
      resumeContinuationContext: resumeContext(),
      strategyDecision: strategy("direct-single-worktree", { gaps: [{ source: "workflowgraph-decisions", status: "stale", reason: "old" }] }),
      mode: "request-approval",
      selectedChangeId: "change-a",
      currentGate: workflowGate({ actionType: "code.run", targetIds: ["task-1"] }),
    })).toMatchObject({ status: "stale" });
  });

  it("validates read-only strategy advice without accepting executable payload hints", () => {
    const advice = buildMainAgentStrategyAdvice({
      kind: "pipeline",
      reason: "Evidence suggests sequential workflow.",
      confidence: 0.7,
      evidenceRefs: ["workflow-run:1", "workflow-run:1", "task-queue:1"],
    });
    expect(advice).toMatchObject({
      authority: "read-only-main-agent-strategy-advice",
      executionStarted: false,
      controller: false,
      status: "accepted-readonly",
      kind: "pipeline",
      applied: false,
      evidenceRefs: ["workflow-run:1", "task-queue:1"],
    });

    for (const raw of [
      { kind: "direct", reason: "do it", actionType: "code.run" },
      { kind: "terminal", reason: "result.apply is ready" },
      { kind: "parallel-candidate", reason: "ready", recommendedAction: "planning.scheduler.raw" },
      { kind: "blocked", reason: "ready", schedulerPayload: { action: "dispatch" } },
      { kind: "stale", reason: "ready", approvalActionId: "audit.accept" },
    ]) {
      const rejected = buildMainAgentStrategyAdvice(raw);
      expect(rejected).toMatchObject({
        status: "ignored",
        kind: null,
        applied: false,
      });
      const serialized = JSON.stringify(rejected);
      expect(serialized).not.toContain("actionType");
      expect(serialized).not.toContain("recommendedAction");
      expect(serialized).not.toContain("planning.scheduler.");
      expect(serialized).not.toContain("result.apply");
      expect(serialized).not.toContain("audit.accept");
    }
  });
});

function strategy(
  kind: MainAgentStrategyDecision["kind"],
  overrides: Partial<MainAgentStrategyDecision> = {},
): MainAgentStrategyDecision {
  return {
    authority: "non-executing-main-agent-strategy-decision",
    executionStarted: false,
    kind,
    kindSource: "deterministic-baseline",
    reason: `${kind} reason`,
    targets: ["target"],
    deterministicBaseline: {
      kind,
      reason: `${kind} reason`,
      targets: ["target"],
    },
    workflowShape: {
      kind: workflowShapeKind(kind),
      reason: `${kind} workflow shape`,
      leafInteraction: {
        roles: kind === "parallel-scheduler-candidate"
          ? ["scheduler-worker", "validator", "auditor", "rework"]
          : kind === "direct-single-worktree" || kind === "sequential-workflowgraph"
            ? ["coder", "validator", "auditor", "rework"]
            : [],
      },
      barrier: kind === "parallel-scheduler-candidate"
        ? "parallel-barrier"
        : kind === "sequential-workflowgraph"
          ? "pipeline-stage"
          : "none",
      isolation: kind === "parallel-scheduler-candidate"
        ? "multi-worktree-candidate"
        : kind === "direct-single-worktree" || kind === "sequential-workflowgraph"
          ? "single-worktree"
          : "none",
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
      fullAccess: ["direct-single-worktree", "sequential-workflowgraph", "complete"].includes(kind) ? "eligible-for-existing-scoped-automation" : "must-stop",
      fullAccessReason: "test",
    },
    stopConditions: [
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
    ],
    adviceConsumption: {
      authority: "non-executing-main-agent-strategy-advice-consumption",
      executionStarted: false,
      controller: false,
      status: "ignored",
      baselineKind: kind,
      finalKind: kind,
      finalKindSource: "deterministic-baseline",
      adviceKind: null,
      reason: "No strategy advice was provided.",
      evidenceRefs: [],
    },
    ...overrides,
  };
}

function workflowShapeKind(kind: MainAgentStrategyDecision["kind"]): MainAgentStrategyDecision["workflowShape"]["kind"] {
  switch (kind) {
    case "direct-single-worktree":
      return "direct";
    case "sequential-workflowgraph":
      return "pipeline";
    case "parallel-scheduler-candidate":
      return "parallel-candidate";
    case "blocked":
      return "blocked";
    case "complete":
      return "terminal";
    case "stale":
      return "stale";
    case "read-only-or-clarify":
    case "wait-for-human-gate":
      return "clarify";
  }
}

function project(): ManagedProject {
  return {
    id: "project-a",
    name: "project-a",
    path: root ?? "E:/tmp/project-a",
    addedAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-07-01T00:00:00.000Z",
  };
}

function memory(memoryRoot: string): ResolvedMemory {
  return {
    mode: "external-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project-a",
    projectRoot: memoryRoot,
    markerPath: join(memoryRoot, ".agent-harness/project.json"),
    agentGuidePath: join(memoryRoot, "AGENTS.md"),
    memoryRoot,
    docsRoot: join(memoryRoot, "docs"),
    harnessRoot: join(memoryRoot, "harness"),
    changesRoot: join(memoryRoot, "harness/changes"),
    evolutionRoot: join(memoryRoot, "harness/evolution"),
    templatesRoot: join(memoryRoot, "templates"),
    scriptsRoot: join(memoryRoot, "scripts"),
    runsRoot: join(memoryRoot, "runs"),
    workbenchRoot: join(memoryRoot, "workbench"),
    workbenchDbPath: join(memoryRoot, "workbench/workbench.sqlite"),
    agentsRoot: join(memoryRoot, "agents"),
    commandsRoot: join(memoryRoot, "commands"),
    agentCatalogPath: join(memoryRoot, "agents/catalog.json"),
    skillsRoot: join(memoryRoot, "skills"),
    worktreeMetadataRoot: join(memoryRoot, "worktrees"),
    worktreeIndexPath: join(memoryRoot, "worktrees/index.json"),
  };
}

function workflowGate(overrides: Partial<MainAgentStrategyConsumptionGateSummary> = {}): MainAgentStrategyConsumptionGateSummary {
  return {
    kind: "workflow",
    changeId: "change-a",
    actionType: "code.run",
    targetIds: ["task-1"],
    enabled: true,
    scopedAutomationEligible: true,
    family: "local-workflow",
    ...overrides,
  };
}

function approvalGate(overrides: Partial<MainAgentStrategyConsumptionGateSummary> = {}): MainAgentStrategyConsumptionGateSummary {
  return {
    kind: "approval",
    changeId: "change-a",
    approvalActionId: "audit.accept",
    targetIds: ["audit-1"],
    enabled: true,
    scopedAutomationEligible: true,
    family: "local-approval",
    ...overrides,
  };
}

function resumeContext(
  overrides: {
    status?: MainAgentResumeContinuationContext["status"];
    lane?: NonNullable<MainAgentResumeContinuationContext["resumePoint"]>["lane"];
    resumePoint?: MainAgentResumeContinuationContext["resumePoint"];
  } = {},
): MainAgentResumeContinuationContext {
  const status = overrides.status ?? "available";
  const point = overrides.resumePoint ?? (status === "available" ? {
    id: "resume-1",
    ref: "resume-ref",
    changeId: "change-a",
    projectId: "project-a",
    lane: overrides.lane ?? "scoped-local-automation",
    stopReason: "blocked",
    summary: "Resume from scoped stop.",
    currentGate: {
      kind: "workflow-action",
      actionType: "code.run",
      changeId: "change-a",
      targetIds: ["task-1"],
    },
    reusableEvidenceRefs: [],
    mustRevalidate: ["current-visible-gate"],
    forbiddenActions: ["raw-scheduler"],
    nextOwner: "main-agent",
    refs: {
      goalLoopFeedbackIds: [],
      goalLoopNextStepPacketIds: [],
      workflowRunIds: [],
      taskQueueRunIds: [],
      taskRunIds: [],
      schedulerRunIds: [],
      workerLeaseIds: [],
      integrationCheckIds: [],
      agentTaskIds: [],
      runIds: [],
      validationIds: [],
      auditIds: [],
    },
  } : undefined);
  return {
    authority: "read-only-main-agent-resume-continuation-context",
    executionStarted: false,
    status,
    reason: `${status} reason`,
    projectId: "project-a",
    changeId: "change-a",
    attemptedLanes: ["scoped-local-automation"],
    matchStatus: status === "available" ? "bound" : status === "not-requested" ? undefined : status,
    resumePoint: point,
    reusePosture: status === "available" ? "must-reobserve" : status === "blocked" ? "blocked" : "none",
    subordinateTo: [],
    mustRevalidate: point?.mustRevalidate ?? [],
    forbiddenActions: point?.forbiddenActions ?? [],
    promptEvidence: [],
  };
}
