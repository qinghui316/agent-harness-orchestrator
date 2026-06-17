import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getChangeStatusForChange } from "../../src/change/manager.js";
import { buildGoalLoopMainAgentContextSection, compileGoalLoopControllerPolicy, compileGoalLoopDecision, compileGoalLoopEvaluation, compileGoalLoopGateReadinessPreflight, isGoalLoopNextStepPacketFresh, readLatestGoalLoopContinuationBrief, readLatestGoalLoopControllerPolicy, readLatestGoalLoopFeedback, readLatestGoalLoopGateReadinessPreflight, readLatestGoalLoopIteration, readLatestGoalLoopNextStepPacket, recordGoalLoopFeedback, stripGoalLoopControllerPolicyContext, writeGoalLoopNextStepPacket } from "../../src/goal-loop/manager.js";
import { goalLoopDecisionSchema } from "../../src/goal-loop/schemas.js";
import { assertGoalLoopAssistedConcreteGateConfirmation } from "../../src/workbench/actions/goal-loop-gate-confirmation.js";
import { buildVisibleGoalLoopMainAgentContextSection } from "../../src/workbench/codex-chat/goal-loop-context.js";
import { getWorkbenchWorkpadProjection } from "../../src/workbench/projections/read-model/implementation.js";
import { assessGoalLoopSummaryCurrentGateParity, filterGoalLoopSummaryForCurrentGate } from "../../src/workbench/projections/read-model/goal-loop-parity.js";
import { readLatestGoalLoopSummary } from "../../src/workbench/projections/read-model/goal-loop.js";
import type { ManagedProject, ResolvedMemory } from "../../src/types/index.js";
import { schedulerRunArtifactRefs, writeSchedulerRun } from "../../src/workflow-scheduler/repository.js";
import type { SchedulerRun } from "../../src/workflow-scheduler/types.js";
import {
  schedulerClaimReservationArtifactRefs,
  schedulerIntegrationCandidateArtifactRefs,
  schedulerIntegrationCheckHandoffArtifactRefs,
  schedulerIntegrationOutcomeArtifactRefs,
  schedulerRunCompletionArtifactRefs,
  schedulerRuntimeArtifactRefs,
  schedulerWorkerAuditArtifactRefs,
  schedulerWorkerResultArtifactRefs,
  schedulerWorkerReworkPlanArtifactRefs,
  schedulerWorkerReworkResultArtifactRefs,
  schedulerWorkerReworkStartArtifactRefs,
  schedulerWorkerStartArtifactRefs,
  schedulerWorkerValidationArtifactRefs,
  writeSchedulerIntegrationCandidate,
  writeSchedulerIntegrationCheckHandoff,
  writeSchedulerIntegrationOutcome,
  writeSchedulerRunCompletion,
  writeSchedulerRuntimeClaimReservation,
  writeSchedulerRuntimeState,
  writeSchedulerRuntimeWorkerAudit,
  writeSchedulerRuntimeWorkerResult,
  writeSchedulerRuntimeWorkerReworkPlan,
  writeSchedulerRuntimeWorkerReworkResult,
  writeSchedulerRuntimeWorkerReworkStart,
  writeSchedulerRuntimeWorkerStart,
  writeSchedulerRuntimeWorkerValidation,
} from "../../src/scheduler-runtime/repository.js";
import type { SchedulerIntegrationCandidate, SchedulerIntegrationCheckHandoff, SchedulerIntegrationOutcome, SchedulerRunCompletion, SchedulerRuntimeClaimReservation, SchedulerRuntimeState, SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerResult, SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkStart, SchedulerRuntimeWorkerStart, SchedulerRuntimeWorkerValidation } from "../../src/scheduler-runtime/types.js";

let tempDir: string;
let memory: ResolvedMemory;
const changeId = "phase-goal-loop";
const changePath = `harness/changes/active/${changeId}`;

function project(): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path: tempDir,
    addedAt: "2026-06-14T00:00:00.000Z",
    lastSeenAt: "2026-06-14T00:00:00.000Z",
  };
}

function expectConflict(
  decision: Awaited<ReturnType<typeof compileGoalLoopDecision>>,
  level: "low" | "medium" | "high" | "unknown",
  parallelEligible: boolean,
  reasonIncludes?: string,
): void {
  expect(decision.conflictAssessment.level).toBe(level);
  expect(decision.conflictAssessment.parallelEligible).toBe(parallelEligible);
  if (reasonIncludes) {
    expect(decision.conflictAssessment.reasons.join("\n")).toContain(reasonIncludes);
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-goal-loop-"));
  memory = buildMemory(tempDir);
  await mkdir(join(memory.memoryRoot, changePath), { recursive: true });
  await writeJson(join(memory.memoryRoot, changePath, "change.json"), {
    version: "1.0",
    id: changeId,
    state: "active",
    title: "Goal loop",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    closedAt: null,
    archivePath: null,
  });
  await writeFile(join(memory.memoryRoot, changePath, "summary.md"), "# Summary\n\nReady.\n", "utf8");
  await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n\n- AC-001: Goal loop close handoff works.\n", "utf8");
  await writeFile(join(memory.memoryRoot, changePath, "plan.md"), "# Plan\n", "utf8");
  await writeFile(join(memory.memoryRoot, changePath, "tasks.md"), "# Tasks\n", "utf8");
  await writeJson(join(memory.memoryRoot, changePath, "ac-map.json"), { generatedAt: "2026-06-14T00:00:00.000Z", items: [] });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("GoalLoopDecision", () => {
  it("records non-executing planning evidence and recommends scheduler plan preparation when only planning exists", async () => {
    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("parallel-plan-needed");
    expect(decision.recommendedAction?.actionType).toBe("planning.scheduler.plan.prepare");
    expect(decision.recommendedAction?.scope).toMatchObject({ changeId });
    expectConflict(decision, "unknown", false, "Scheduler plan preparation");
    expect(decision.executionStarted).toBe(false);
  });

  it("anchors Goal Loop freshness to accepted artifact content hashes", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);

    expect(result.goalLoopDecision.sourceEvidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "AcceptedChangeArtifact",
        id: "spec.md",
        artifact: `${changePath}/spec.md`,
        hash: expect.any(String),
      }),
      expect.objectContaining({
        kind: "AcceptedChangeArtifact",
        id: "plan.md",
        artifact: `${changePath}/plan.md`,
        hash: expect.any(String),
      }),
      expect.objectContaining({
        kind: "AcceptedChangeArtifact",
        id: "tasks.md",
        artifact: `${changePath}/tasks.md`,
        hash: expect.any(String),
      }),
      expect.objectContaining({
        kind: "AcceptedChangeArtifact",
        id: "ac-map.json",
        artifact: `${changePath}/ac-map.json`,
        hash: expect.any(String),
      }),
    ]));
    await expect(isGoalLoopNextStepPacketFresh(memory, changePath, result.goalLoopNextStepPacket)).resolves.toBe(true);
  });

  it("stales Goal Loop guidance and assisted concrete gate when accepted artifacts drift", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const currentGate = {
      actionType: "planning.scheduler.plan.prepare" as const,
      scope: { changeId },
    };
    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate,
      requireCurrentGateMatch: true,
    });
    const preflight = await compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: policy.id,
      currentGate,
    });

    await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n\nChanged accepted scope.\n", "utf8");

    await expect(isGoalLoopNextStepPacketFresh(memory, changePath, result.goalLoopNextStepPacket)).resolves.toBe(false);
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toBeNull();
    await expect(buildGoalLoopMainAgentContextSection(memory, changePath, changeId)).resolves.toBeNull();
    await expect(assertGoalLoopAssistedConcreteGateConfirmation(memory, changePath, changeId, {
      actionType: "planning.scheduler.plan.prepare",
      changeId,
      goalLoopGateReadinessPreflightId: preflight.id,
    })).rejects.toThrow("packet is stale");
  });

  it("rejects gate readiness preflight after accepted artifact drift", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const currentGate = {
      actionType: "planning.scheduler.plan.prepare" as const,
      scope: { changeId },
    };
    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate,
      requireCurrentGateMatch: true,
    });

    await writeFile(join(memory.memoryRoot, changePath, "plan.md"), "# Plan\n\nChanged accepted plan.\n", "utf8");

    await expect(compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: policy.id,
      currentGate,
    })).rejects.toThrow("packet is stale");
  });

  it("does not stale Goal Loop packets when only ac-map generatedAt changes", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);

    await writeJson(join(memory.memoryRoot, changePath, "ac-map.json"), {
      generatedAt: "2026-06-16T00:00:00.000Z",
      items: [],
    });

    await expect(isGoalLoopNextStepPacketFresh(memory, changePath, result.goalLoopNextStepPacket)).resolves.toBe(true);
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
    });
  });

  it("recommends current worker result reconcile after a worker start exists", async () => {
    const { schedulerRun, workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("scheduler-next-step");
    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.reconcile-result",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerWorkerStartId: workerStart?.id,
      },
    });
    expectConflict(decision, "medium", false, "scheduler worker is active");
    expect(decision.executionStarted).toBe(false);
  });

  it("can recommend the first scheduler worker when a reserved claim exists and no worker has started", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("scheduler-next-step");
    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.start-first",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerClaimReservationId: reservation.id,
      },
    });
    expectConflict(decision, "low", true, "planning.scheduler.worker.start-first");
    expect(decision.conflictAssessment).toMatchObject({
      routingPosture: "single-worker-gate",
      routingLabel: "Single scoped worker gate",
    });
    expect(decision.executionStarted).toBe(false);
  });

  it("exposes low-conflict worker-start posture through the Workbench Goal Loop summary", async () => {
    await writeSchedulerEvidence({ withWorkerStart: false });
    const result = await compileGoalLoopEvaluation(memory, changePath);

    const summary = await readLatestGoalLoopSummary(memory, changePath);

    expect(result.goalLoopDecision.conflictAssessment).toMatchObject({
      level: "low",
      parallelEligible: true,
    });
    expect(summary).toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      conflictLevel: "low",
      parallelEligible: true,
      routingPosture: "single-worker-gate",
      routingLabel: "Single scoped worker gate",
      conflictReasons: result.goalLoopContinuationBrief.conflictAssessment.reasons,
    });
    expect(summary?.conflictReasons.join("\n")).toContain("planning.scheduler.worker.start-first");
  });

  it("records first and second goal loop iterations with previous lineage", async () => {
    const first = await compileGoalLoopEvaluation(memory, changePath);

    expect(first.goalLoopIteration).toMatchObject({
      changeId,
      ordinal: 1,
      authority: "non-executing-continuation-evidence",
      trigger: "user-confirmed-evaluate",
      iterationStatus: "recorded",
      continuationVerdict: "recommend-existing-gate",
      continuationState: "ready-for-existing-gate",
      controlPolicy: {
        authority: "evidence-only-control-constraints",
        canAutoContinue: false,
        canAutoExecuteRecommendedAction: false,
        recommendedActionType: "planning.scheduler.plan.prepare",
      },
      budgetSignal: {
        status: "unknown",
      },
      goalLoopDecisionId: first.goalLoopDecision.id,
      executionStarted: false,
    });
    expect(first.goalLoopContinuationBrief).toMatchObject({
      changeId,
      authority: "non-executing-continuation-brief-evidence",
      sourceGoalLoopDecisionId: first.goalLoopDecision.id,
      sourceGoalLoopIterationId: first.goalLoopIteration.id,
      iterationOrdinal: 1,
      continuationState: "ready-for-existing-gate",
      executionStarted: false,
    });
    expect(first.goalLoopNextStepPacket).toMatchObject({
      changeId,
      authority: "non-executing-main-agent-next-step-packet",
      sourceGoalLoopDecisionId: first.goalLoopDecision.id,
      sourceGoalLoopIterationId: first.goalLoopIteration.id,
      sourceGoalLoopContinuationBriefId: first.goalLoopContinuationBrief.id,
      recommendationState: "separate-gate-required",
      separateGateRequired: true,
      executionStarted: false,
    });
    expect(first.goalLoopNextStepPacket.revalidationChecklist).toEqual(expect.arrayContaining([
      expect.stringContaining("Re-read the selected Change"),
      expect.stringContaining("Do not execute a recommended action"),
    ]));
    expect(first.goalLoopContinuationBrief.mainAgentInstructions).toEqual(expect.arrayContaining([
      expect.stringContaining("full user objective"),
      expect.stringContaining("Observe current repository evidence"),
    ]));
    expect(first.goalLoopContinuationBrief.forbiddenExecutionStatements).toEqual(expect.arrayContaining([
      expect.stringContaining("Do not execute the recommended action"),
      expect.stringContaining("Do not start scheduler workers"),
    ]));
    expect(first.goalLoopContinuationBrief.stalenessInstruction).toContain("re-read");
    expect(first.goalLoopIteration.resumePreconditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "selected-change-scope", satisfied: true }),
      expect.objectContaining({ kind: "separate-human-gated-action", id: "planning.scheduler.plan.prepare", satisfied: false }),
    ]));
    expect(first.goalLoopIteration.suppressedBecause).toMatchObject({
      reason: "specific-gate-required",
    });
    expect(first.goalLoopIteration.previousGoalLoopDecisionId).toBeUndefined();
    expect(first.goalLoopIteration.previousGoalLoopIterationId).toBeUndefined();

    const second = await compileGoalLoopEvaluation(memory, changePath);

    expect(second.goalLoopIteration).toMatchObject({
      changeId,
      ordinal: 2,
      previousGoalLoopDecisionId: first.goalLoopDecision.id,
      previousGoalLoopIterationId: first.goalLoopIteration.id,
      goalLoopDecisionId: second.goalLoopDecision.id,
      continuationState: "ready-for-existing-gate",
      executionStarted: false,
    });
    expect(second.goalLoopIteration.previousGoalLoopDecisionId).not.toBe(second.goalLoopDecision.id);
    await expect(readLatestGoalLoopIteration(memory, changePath)).resolves.toMatchObject({
      id: second.goalLoopIteration.id,
      ordinal: 2,
    });
    await expect(readLatestGoalLoopContinuationBrief(memory, changePath)).resolves.toMatchObject({
      id: second.goalLoopContinuationBrief.id,
      sourceGoalLoopIterationId: second.goalLoopIteration.id,
      sourceGoalLoopDecisionId: second.goalLoopDecision.id,
      iterationOrdinal: 2,
      executionStarted: false,
    });
    await expect(readLatestGoalLoopNextStepPacket(memory, changePath)).resolves.toMatchObject({
      id: second.goalLoopNextStepPacket.id,
      sourceGoalLoopIterationId: second.goalLoopIteration.id,
      sourceGoalLoopDecisionId: second.goalLoopDecision.id,
      sourceGoalLoopContinuationBriefId: second.goalLoopContinuationBrief.id,
      executionStarted: false,
    });
  });

  it("records user feedback as scoped evidence and requires a fresh feedback-aware packet", async () => {
    const first = await compileGoalLoopEvaluation(memory, changePath);
    expect(first.goalLoopNextStepPacket.recommendedAction).toBeDefined();

    const feedback = await recordGoalLoopFeedback(memory, changePath, {
      goalLoopNextStepPacketId: first.goalLoopNextStepPacket.id,
      feedbackText: "先不要直接准备并行计划，重新检查冲突范围。",
      currentGate: {
        actionType: first.goalLoopNextStepPacket.recommendedAction!.actionType,
        scope: first.goalLoopNextStepPacket.recommendedAction!.scope,
      },
    });

    expect(feedback).toMatchObject({
      changeId,
      authority: "non-executing-user-feedback-evidence",
      sourceGoalLoopNextStepPacketId: first.goalLoopNextStepPacket.id,
      executionStarted: false,
    });
    await expect(readLatestGoalLoopFeedback(memory, changePath)).resolves.toMatchObject({ id: feedback.id });
    await expect(isGoalLoopNextStepPacketFresh(memory, changePath, first.goalLoopNextStepPacket)).resolves.toBe(false);
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toBeNull();

    const second = await compileGoalLoopEvaluation(memory, changePath, { trigger: "user-feedback-evaluate" });

    expect(second.goalLoopIteration.trigger).toBe("user-feedback-evaluate");
    expect(second.goalLoopDecision.sourceEvidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "GoalLoopFeedback", id: feedback.id }),
    ]));
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toMatchObject({
      goalLoopNextStepPacketId: second.goalLoopNextStepPacket.id,
      sourceEvidenceCount: second.goalLoopContinuationBrief.sourceEvidenceRefs.length,
    });
  });

  it("records non-executing controller policy for the current visible Harness gate", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);

    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId },
      },
    });

    expect(policy).toMatchObject({
      changeId,
      authority: "non-executing-controller-policy-evidence",
      sourceGoalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      verdict: "recommend-existing-gate",
      gateStatus: "matches-current-gate",
      recommendedAction: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId },
      },
      suppressesRecommendedAction: false,
      executionStarted: false,
    });
    expect(policy.forbiddenExecutionStatements).toEqual(expect.arrayContaining([
      expect.stringContaining("Do not call Workbench action handlers"),
      expect.stringContaining("Do not start scheduler workers"),
    ]));
    await expect(readLatestGoalLoopControllerPolicy(memory, changePath)).resolves.toMatchObject({ id: policy.id });
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toMatchObject({
      controllerPolicyId: policy.id,
      controllerVerdict: "recommend-existing-gate",
      controllerGateStatus: "matches-current-gate",
      controllerSummary: expect.stringContaining("existing planning.scheduler.plan.prepare Harness gate"),
    });
  });

  it("records non-executing gate readiness preflight for a matching controller policy", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const currentGate = {
      actionType: "planning.scheduler.plan.prepare" as const,
      scope: { changeId },
    };
    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate,
      requireCurrentGateMatch: true,
    });

    const preflight = await compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: policy.id,
      currentGate,
    });

    expect(preflight).toMatchObject({
      changeId,
      authority: "non-executing-concrete-gate-readiness-preflight-evidence",
      status: "ready",
      sourceGoalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      sourceGoalLoopControllerPolicyId: policy.id,
      currentGate,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      executionStarted: false,
    });
    expect(preflight.forbiddenExecutionStatements).toEqual(expect.arrayContaining([
      expect.stringContaining("Do not call the concrete Workbench action handler"),
      expect.stringContaining("Do not treat this preflight as ToolPolicy authorization"),
    ]));
    await expect(readLatestGoalLoopGateReadinessPreflight(memory, changePath)).resolves.toMatchObject({ id: preflight.id });
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toMatchObject({
      gateReadinessPreflightId: preflight.id,
      gateReadinessPreflightArtifact: expect.stringContaining("goal-loop-gate-readiness-preflights"),
    });
  });

  it("validates Goal Loop-assisted concrete gate confirmation without changing the concrete action path", async () => {
    const { schedulerRun, workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const currentGate = {
      actionType: "planning.scheduler.worker.reconcile-result" as const,
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerWorkerStartId: workerStart!.id,
      },
    };
    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate,
      requireCurrentGateMatch: true,
    });
    const preflight = await compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: policy.id,
      currentGate,
    });

    await expect(assertGoalLoopAssistedConcreteGateConfirmation(memory, changePath, changeId, {
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId,
      schedulerRunId: schedulerRun.id,
      schedulerWorkerStartId: workerStart!.id,
      goalLoopGateReadinessPreflightId: preflight.id,
    })).resolves.toBeUndefined();

    await expect(assertGoalLoopAssistedConcreteGateConfirmation(memory, changePath, changeId, {
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId,
      schedulerRunId: schedulerRun.id,
      schedulerWorkerStartId: "forged-worker-start",
      goalLoopGateReadinessPreflightId: preflight.id,
    })).rejects.toThrow("request scope mismatch");

    await expect(assertGoalLoopAssistedConcreteGateConfirmation(memory, changePath, changeId, {
      actionType: "planning.goal-loop.gate-readiness.prepare",
      changeId,
      goalLoopGateReadinessPreflightId: preflight.id,
    })).rejects.toThrow("recursive Goal Loop actions");
  });

  it("rejects gate readiness preflight for stale or mismatched controller policy targets", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const currentGate = {
      actionType: "planning.scheduler.plan.prepare" as const,
      scope: { changeId },
    };
    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate,
      requireCurrentGateMatch: true,
    });

    await expect(compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: "stale-policy",
      currentGate,
    })).rejects.toThrow("controller policy target is stale");

    await expect(compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: policy.id,
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId: "other-change" },
      },
    })).rejects.toThrow("scope does not match current gate");
  });

  it("suppresses controller guidance when the current visible gate target does not match the packet", async () => {
    await compileGoalLoopEvaluation(memory, changePath);

    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId: "other-change" },
      },
    });

    expect(policy).toMatchObject({
      verdict: "suppress-stale-guidance",
      gateStatus: "change-id-mismatch",
      recommendedAction: undefined,
      suppressesRecommendedAction: true,
      executionStarted: false,
    });
  });

  it("rejects controller refresh when the requested packet or current gate is stale", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);

    await expect(compileGoalLoopControllerPolicy(memory, changePath, {
      goalLoopNextStepPacketId: "stale-packet",
      requireCurrentGateMatch: true,
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId },
      },
    })).rejects.toThrow("refresh target is stale");

    await expect(compileGoalLoopControllerPolicy(memory, changePath, {
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      requireCurrentGateMatch: true,
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId: "other-change" },
      },
    })).rejects.toThrow("not the current matching gate");
  });

  it("suppresses controller guidance when the latest packet is stale", async () => {
    const { workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await compileGoalLoopEvaluation(memory, changePath);
    expect(result.goalLoopNextStepPacket.recommendedAction?.actionType).toBe("planning.scheduler.worker.reconcile-result");
    await writeWorkerResult(workerStart!, "evidence-ready");

    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        scope: {
          changeId,
          schedulerRunId: workerStart!.schedulerRunId,
          schedulerWorkerStartId: workerStart!.id,
        },
      },
    });

    expect(policy).toMatchObject({
      sourceGoalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      verdict: "suppress-stale-guidance",
      gateStatus: "packet-stale",
      suppressesRecommendedAction: true,
      executionStarted: false,
    });
  });

  it("records wait-for-evidence controller policy when no recommended action exists", async () => {
    const { workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    await writeWorkerResult(workerStart!, "failed");
    await compileGoalLoopEvaluation(memory, changePath);

    const policy = await compileGoalLoopControllerPolicy(memory, changePath);

    expect(policy).toMatchObject({
      verdict: "wait-for-evidence",
      gateStatus: "no-recommended-action",
      recommendedAction: undefined,
      suppressesRecommendedAction: false,
      executionStarted: false,
    });
  });

  it("records existing-gate continuation state when a scheduler worker result needs reconcile", async () => {
    await writeSchedulerEvidence({ withWorkerStart: true });

    const { goalLoopDecision, goalLoopIteration } = await compileGoalLoopEvaluation(memory, changePath);

    expect(goalLoopDecision.recommendedAction?.actionType).toBe("planning.scheduler.worker.reconcile-result");
    expect(goalLoopIteration).toMatchObject({
      continuationVerdict: "recommend-existing-gate",
      continuationState: "ready-for-existing-gate",
      controlPolicy: {
        canAutoContinue: false,
        canAutoExecuteRecommendedAction: false,
        recommendedActionType: "planning.scheduler.worker.reconcile-result",
      },
      budgetSignal: {
        status: "unknown",
      },
      suppressedBecause: {
        reason: "specific-gate-required",
      },
      executionStarted: false,
    });
    expect(goalLoopIteration.resumePreconditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "separate-human-gated-action", id: "planning.scheduler.worker.reconcile-result", satisfied: false }),
    ]));
    const waitingBrief = await readLatestGoalLoopContinuationBrief(memory, changePath);
    expect(waitingBrief).toMatchObject({
      sourceGoalLoopIterationId: goalLoopIteration.id,
      continuationState: "ready-for-existing-gate",
      executionStarted: false,
    });
    expect(waitingBrief.recommendedAction?.actionType).toBe("planning.scheduler.worker.reconcile-result");
    const waitingPacket = await readLatestGoalLoopNextStepPacket(memory, changePath);
    expect(waitingPacket).toMatchObject({
      sourceGoalLoopIterationId: goalLoopIteration.id,
      recommendationState: "separate-gate-required",
      separateGateRequired: true,
      executionStarted: false,
    });
    expect(waitingPacket.recommendedAction?.actionType).toBe("planning.scheduler.worker.reconcile-result");
  });

  it("recommends current worker validation after evidence-ready result", async () => {
    const { schedulerRun, workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await writeWorkerResult(workerStart!, "evidence-ready");

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.validate-first",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerWorkerResultId: result.id,
      },
    });
    expectConflict(decision, "medium", false, "validate it");
  });

  it("recommends current worker audit after passed validation", async () => {
    const { schedulerRun, workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await writeWorkerResult(workerStart!, "evidence-ready");
    const validation = await writeWorkerValidation(result, "passed");

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.audit-first",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerWorkerValidationId: validation.id,
      },
    });
    expectConflict(decision, "medium", false, "audit it");
  });

  it("recommends bounded rework planning after failed validation", async () => {
    const { schedulerRun, workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await writeWorkerResult(workerStart!, "evidence-ready");
    const validation = await writeWorkerValidation(result, "failed");

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.rework-plan.compile",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerWorkerValidationId: validation.id,
      },
    });
    expectConflict(decision, "high", false, "validation failed");
  });

  it("recommends rework validation after evidence-ready rework result", async () => {
    const { schedulerRun, workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await writeWorkerResult(workerStart!, "evidence-ready");
    const validation = await writeWorkerValidation(result, "failed");
    const plan = await writeReworkPlan(validation);
    const start = await writeReworkStart(plan);
    const reworkResult = await writeReworkResult(start, "evidence-ready");

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.rework-validate-first",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerWorkerReworkResultId: reworkResult.id,
      },
    });
    expectConflict(decision, "high", false, "bounded rework");
    expect(decision.conflictAssessment).toMatchObject({
      routingPosture: "blocked-or-rework",
      routingLabel: "Blocked or bounded rework",
    });
  });

  it("recommends integration candidate refresh after an approved worker audit", async () => {
    const { schedulerRun, workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await writeWorkerResult(workerStart!, "evidence-ready");
    const validation = await writeWorkerValidation(result, "passed");
    await writeWorkerAudit(validation, "approved");

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.integration-candidate.compile",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
      },
    });
    expectConflict(decision, "high", false, "SchedulerIntegrationCandidate refresh");
    expect(decision.conflictAssessment).toMatchObject({
      routingPosture: "candidate-refresh-required",
      routingLabel: "Scheduler candidate refresh required",
    });
  });

  it("recommends start-next when one ready candidate target exists and another reserved intent remains", async () => {
    const { schedulerRun, workerStart, reservation } = await writeSchedulerEvidence({ withWorkerStart: true, extraReservationIntent: true });
    const result = await writeWorkerResult(workerStart!, "evidence-ready");
    const validation = await writeWorkerValidation(result, "passed");
    await writeWorkerAudit(validation, "approved");
    await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 1, outputClaimIntentIds: ["claim-1"] });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.start-next",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerClaimReservationId: reservation.id,
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
      },
    });
    expectConflict(decision, "low", true, "planning.scheduler.worker.start-next");
    expect(decision.conflictAssessment).toMatchObject({
      routingPosture: "single-worker-gate",
      routingLabel: "Single scoped worker gate",
    });
    expect(decision.executionStarted).toBe(false);
  });

  it("recommends IntegrationCheck when at least two candidate targets are ready", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 2, outputClaimIntentIds: ["claim-1", "claim-2"] });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.integration-check.run",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerIntegrationCandidateId: candidate.id,
        worktreeIds: candidate.readyWorktreeIds,
      },
    });
    expectConflict(decision, "high", false, "IntegrationCheck gate");
    expect(decision.conflictAssessment).toMatchObject({
      routingPosture: "integration-check-required",
      routingLabel: "IntegrationCheck path required",
    });
    expect(decision.executionStarted).toBe(false);
  });

  it("recommends scheduler integration outcome reconciliation with concrete handoff scope after terminal handoff evidence", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 2, outputClaimIntentIds: ["claim-1", "claim-2"] });
    const handoff = await writeIntegrationHandoff(schedulerRun, reservation, candidate, { integrationCheckStatus: "applied" });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.integration-outcome.reconcile",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerIntegrationCandidateId: candidate.id,
        schedulerIntegrationCheckHandoffId: handoff.id,
        applyCheckId: handoff.integrationCheckId,
        worktreeIds: candidate.readyWorktreeIds,
      },
    });
    expectConflict(decision, "high", false, "IntegrationCheck handoff");
    expect(decision.conflictAssessment).toMatchObject({
      routingPosture: "integration-check-required",
      routingLabel: "IntegrationCheck path required",
    });
    expect(decision.executionStarted).toBe(false);
  });

  it("waits for existing apply or discard when scheduler IntegrationCheck handoff is still passed", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 2, outputClaimIntentIds: ["claim-1", "claim-2"] });
    await writeIntegrationHandoff(schedulerRun, reservation, candidate, { integrationCheckStatus: "passed" });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("integration-needed");
    expect(decision.recommendedAction).toBeUndefined();
    expect(decision.summary).toContain("waiting on the existing apply/discard path");
    expectConflict(decision, "high", false, "IntegrationCheck handoff");
    expect(decision.executionStarted).toBe(false);
  });

  it("recommends blocked closeout when a candidate cannot reach two ready targets and no reserved intent remains", async () => {
    const { schedulerRun, workerStart, reservation } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await writeWorkerResult(workerStart!, "evidence-ready");
    const validation = await writeWorkerValidation(result, "passed");
    await writeWorkerAudit(validation, "approved");
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 1, outputClaimIntentIds: ["claim-1"] });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("blocked");
    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.run.close-blocked",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerClaimReservationId: reservation.id,
        schedulerIntegrationCandidateId: candidate.id,
      },
    });
    expectConflict(decision, "high", false, "not a worker-start gate");
  });

  it("recommends scheduler run completion after integration outcome evidence exists", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 2, outputClaimIntentIds: ["claim-1", "claim-2"] });
    const outcome = await writeIntegrationOutcome(schedulerRun, reservation, candidate);

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.run.complete",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerReconcileSnapshotId: outcome.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: outcome.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: outcome.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: outcome.schedulerIntegrationCheckHandoffId,
        schedulerIntegrationOutcomeId: outcome.id,
        applyCheckId: outcome.integrationCheckId,
        worktreeIds: outcome.readyWorktreeIds,
      },
    });
    expectConflict(decision, "high", false, "SchedulerIntegrationOutcome");
  });

  it("attaches close-ready Goal Loop evidence only to the existing matching close approval", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 2, outputClaimIntentIds: ["claim-1", "claim-2"] });
    const outcome = await writeIntegrationOutcome(schedulerRun, reservation, candidate);
    await writeRunCompletion(schedulerRun, reservation, candidate, outcome);
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const summary = await readLatestGoalLoopSummary(memory, changePath);

    expect(result.goalLoopDecision).toMatchObject({
      decisionKind: "completed-ready-for-human-close-gate",
      recommendedAction: undefined,
      conflictAssessment: {
        level: "high",
        parallelEligible: false,
      },
      executionStarted: false,
    });
    expect(result.goalLoopDecision.conflictAssessment).toMatchObject({
      routingPosture: "close-gate-required",
      routingLabel: "Human close gate required",
    });
    expect(result.goalLoopDecision.schedulerExecutionMode).toMatchObject({
      mode: "terminal-human-close-gate",
      loopAuthorized: false,
      humanGateRequired: true,
    });
    expect(result.goalLoopDecision.schedulerExecutionMode).not.toHaveProperty("currentGate");
    expect(result.goalLoopNextStepPacket).toMatchObject({
      recommendationState: "ready-for-human-close-gate",
      continuationState: "ready-for-human-close-gate",
      separateGateRequired: true,
      humanGateRequired: true,
      executionStarted: false,
    });
    expect(result.goalLoopNextStepPacket.recommendedAction).toBeUndefined();
    expect(assessGoalLoopSummaryCurrentGateParity(summary!, {
      id: `approval:close:${changeId}`,
      label: "Close change",
      description: "Existing close approval.",
      kind: "approval",
      enabled: true,
      requiresConfirmation: true,
      approvalId: `close:${changeId}`,
    })).toMatchObject({ visible: true, status: "matches-close-gate" });
    expect(filterGoalLoopSummaryForCurrentGate(summary, {
      id: `approval:close:${changeId}`,
      label: "Close change",
      description: "Existing close approval.",
      kind: "approval",
      enabled: true,
      requiresConfirmation: true,
      approvalId: `close:${changeId}`,
    })).toMatchObject({
      closeGateHandoff: {
        changeId,
        closeActionId: "change.close",
        closeApprovalId: `close:${changeId}`,
        goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
        humanGateRequired: true,
        executionStarted: false,
      },
    });
    expect(filterGoalLoopSummaryForCurrentGate(summary, {
      id: "wrong-gate",
      label: "Prepare scheduler",
      description: "Not the close approval.",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.scheduler.plan.prepare",
      changeId,
    })).toBeNull();
    expect(filterGoalLoopSummaryForCurrentGate(summary, {
      id: "wrong-close",
      label: "Close other change",
      description: "Wrong close approval.",
      kind: "approval",
      enabled: true,
      requiresConfirmation: true,
      approvalId: "close:other-change",
    })).toBeNull();
  });

  it("adds close-ready handoff to visible main-Agent context only through the existing close approval", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 2, outputClaimIntentIds: ["claim-1", "claim-2"] });
    const outcome = await writeIntegrationOutcome(schedulerRun, reservation, candidate);
    await writeRunCompletion(schedulerRun, reservation, candidate, outcome);

    await mkdir(join(memory.memoryRoot, changePath, "reviews"), { recursive: true });
    await writeFile(join(memory.memoryRoot, changePath, "reviews", "review.md"), "Status: approved\n", "utf8");
    const status = await getChangeStatusForChange(project(), changeId);
    expect(status.closeGate.ready).toBe(true);
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const workpad = await getWorkbenchWorkpadProjection({ project: project(), path: tempDir }, changeId);
    expect(workpad.nextAction).toMatchObject({
      kind: "approval",
      approvalId: `close:${changeId}`,
    });
    expect(workpad.goalLoop).toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      closeGateHandoff: {
        closeApprovalId: `close:${changeId}`,
      },
    });
    const visible = await buildVisibleGoalLoopMainAgentContextSection(project(), memory, changePath, changeId);

    expect(visible).toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      closeGateHandoff: {
        closeActionId: "change.close",
        closeApprovalId: `close:${changeId}`,
        humanGateRequired: true,
        executionStarted: false,
      },
    });
    expect(visible?.markdown).toContain("### Human Close Gate Handoff");
    expect(visible?.markdown).toContain(`- Existing approval: close:${changeId}`);
    expect(visible?.markdown).toContain("- Close action: change.close");
    expect(visible?.markdown).toContain("existing human close gate");
  });

  it("suppresses close-ready handoff and main-Agent context after accepted artifact drift", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });
    const candidate = await writeIntegrationCandidate(schedulerRun, reservation, { readyCount: 2, outputClaimIntentIds: ["claim-1", "claim-2"] });
    const outcome = await writeIntegrationOutcome(schedulerRun, reservation, candidate);
    await writeRunCompletion(schedulerRun, reservation, candidate, outcome);

    await mkdir(join(memory.memoryRoot, changePath, "reviews"), { recursive: true });
    await writeFile(join(memory.memoryRoot, changePath, "reviews", "review.md"), "Status: approved\n", "utf8");
    const status = await getChangeStatusForChange(project(), changeId);
    expect(status.closeGate.ready).toBe(true);
    const result = await compileGoalLoopEvaluation(memory, changePath);
    const before = await getWorkbenchWorkpadProjection({ project: project(), path: tempDir }, changeId);
    expect(before.goalLoop).toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      closeGateHandoff: {
        closeApprovalId: `close:${changeId}`,
      },
    });

    await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n\nAccepted scope changed.\n", "utf8");

    await expect(isGoalLoopNextStepPacketFresh(memory, changePath, result.goalLoopNextStepPacket)).resolves.toBe(false);
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toBeNull();
    const after = await getWorkbenchWorkpadProjection({ project: project(), path: tempDir }, changeId);
    expect(after.goalLoop).toBeUndefined();
    await expect(buildVisibleGoalLoopMainAgentContextSection(project(), memory, changePath, changeId)).resolves.toBeNull();
  });

  it("renders latest next-step packet as main-Agent context and skips invalid lineage", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);

    const section = await buildGoalLoopMainAgentContextSection(memory, changePath, changeId);

    expect(section).toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      routingPosture: result.goalLoopNextStepPacket.conflictAssessment.routingPosture,
      routingLabel: result.goalLoopNextStepPacket.conflictAssessment.routingLabel,
      artifact: expect.stringContaining("goal-loop-next-step-packets"),
      markdownArtifact: expect.stringContaining("goal-loop-next-step-packets"),
    });
    expect(section?.markdown).toContain("Goal Loop Next-Step Packet");
    expect(section?.markdown).toContain("main-Agent prompt context only");
    expect(section?.markdown).toContain(result.goalLoopNextStepPacket.id);
    expect(section?.markdown).toContain("planning.scheduler.plan.prepare");
    expect(section?.markdown).toContain("Revalidation Checklist");
    expect(section?.markdown).toContain("Routing Posture");
    expect(section?.markdown).toContain(`routingPosture: ${result.goalLoopNextStepPacket.conflictAssessment.routingPosture}`);
    expect(section?.markdown).toContain(`routingLabel: ${result.goalLoopNextStepPacket.conflictAssessment.routingLabel}`);
    expect(section?.markdown).toContain("prompt-context evidence only");
    expect(section).toMatchObject({
      schedulerExecutionMode: "single-gate-staged",
      schedulerLoopAuthorized: false,
    });
    expect(result.goalLoopDecision.schedulerExecutionMode).toMatchObject({
      mode: "single-gate-staged",
      loopAuthorized: false,
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        separateHumanGateRequired: true,
      },
    });
    expect(result.goalLoopIteration.schedulerExecutionMode).toEqual(result.goalLoopDecision.schedulerExecutionMode);
    expect(result.goalLoopContinuationBrief.schedulerExecutionMode).toEqual(result.goalLoopDecision.schedulerExecutionMode);
    expect(result.goalLoopNextStepPacket.schedulerExecutionMode).toEqual(result.goalLoopDecision.schedulerExecutionMode);
    expect(section?.markdown).toContain("Scheduler Execution Mode");
    expect(section?.markdown).toContain("- Mode: single-gate-staged");
    expect(section?.markdown).toContain("- loopAuthorized: false");
    expect(section?.markdown).toContain("Future Loop Requirements");
    expect(section?.markdown).toContain("must not start workers, dispatch waves, allocate slots, or authorize a scheduler loop/full executor");
    expect(section?.markdown).toContain("Forbidden Execution Statements");
    expect(section?.markdown).toContain("not workflow truth");
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      recommendedActionType: "planning.scheduler.plan.prepare",
      recommendedActionScope: { changeId },
      schedulerExecutionMode: {
        authority: "non-executing-scheduler-execution-mode-evidence",
        mode: "single-gate-staged",
        loopAuthorized: false,
        fullParallelExecutorAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
        humanGateRequired: true,
        currentGate: {
          actionType: "planning.scheduler.plan.prepare",
          separateHumanGateRequired: true,
        },
        reasons: expect.arrayContaining([
          expect.stringContaining("must be revalidated"),
        ]),
        futureLoopRequirements: expect.arrayContaining([
          expect.stringContaining("accepted architecture decision"),
        ]),
      },
    });

    await writeGoalLoopNextStepPacket(memory, changePath, {
      ...result.goalLoopNextStepPacket,
      id: "forged-packet",
      sourceGoalLoopContinuationBriefId: "wrong-brief",
      artifact: "memory-root/harness/changes/active/phase-goal-loop/planning/goal-loop-next-step-packets/forged-packet.json",
      markdownArtifact: "memory-root/harness/changes/active/phase-goal-loop/planning/goal-loop-next-step-packets/forged-packet.md",
    });

    await expect(buildGoalLoopMainAgentContextSection(memory, changePath, changeId)).resolves.toBeNull();
  });

  it("adds valid controller policy evidence to main-Agent context and omits stale policy without hiding the packet", async () => {
    const first = await compileGoalLoopEvaluation(memory, changePath);
    const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId },
      },
    });

    const firstSection = await buildGoalLoopMainAgentContextSection(memory, changePath, changeId);

    expect(firstSection).toMatchObject({
      goalLoopNextStepPacketId: first.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: policy.id,
      controllerVerdict: "recommend-existing-gate",
      controllerGateStatus: "matches-current-gate",
      controllerArtifact: expect.stringContaining("goal-loop-controller-policies"),
      controllerMarkdownArtifact: expect.stringContaining("goal-loop-controller-policies"),
    });
    expect(firstSection?.markdown).toContain("### Controller Policy");
    expect(firstSection?.markdown).toContain("prompt context and evidence only");
    expect(firstSection?.markdown).toContain("not workflow truth");
    expect(firstSection?.markdown).toContain("Do not call Workbench action handlers");
    const stripped = stripGoalLoopControllerPolicyContext(firstSection!);
    expect(stripped.goalLoopNextStepPacketId).toBe(first.goalLoopNextStepPacket.id);
    expect(stripped.goalLoopControllerPolicyId).toBeUndefined();
    expect(stripped.routingPosture).toBe(first.goalLoopNextStepPacket.conflictAssessment.routingPosture);
    expect(stripped.routingLabel).toBe(first.goalLoopNextStepPacket.conflictAssessment.routingLabel);
    expect(stripped.markdown).toContain("Goal Loop Next-Step Packet");
    expect(stripped.markdown).toContain(`routingPosture: ${first.goalLoopNextStepPacket.conflictAssessment.routingPosture}`);
    expect(stripped.markdown).not.toContain("### Controller Policy");

    await recordGoalLoopFeedback(memory, changePath, {
      goalLoopNextStepPacketId: first.goalLoopNextStepPacket.id,
      feedbackText: "重新判断下一步，不要沿用旧控制策略。",
      currentGate: {
        actionType: "planning.scheduler.plan.prepare",
        scope: { changeId },
      },
    });
    const second = await compileGoalLoopEvaluation(memory, changePath, { trigger: "user-feedback-evaluate" });

    const secondSection = await buildGoalLoopMainAgentContextSection(memory, changePath, changeId);

    expect(secondSection).toMatchObject({
      goalLoopNextStepPacketId: second.goalLoopNextStepPacket.id,
    });
    expect(secondSection?.goalLoopControllerPolicyId).toBeUndefined();
    expect(secondSection?.markdown).toContain("Goal Loop Next-Step Packet");
    expect(secondSection?.markdown).not.toContain("### Controller Policy");
  });

  it("matches goal loop packet recommendations only against enabled current gate target ids", async () => {
    const { workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    await compileGoalLoopEvaluation(memory, changePath);
    const summary = await readLatestGoalLoopSummary(memory, changePath);

    expect(summary).toMatchObject({
      recommendedActionType: "planning.scheduler.worker.reconcile-result",
      recommendedActionScope: {
        changeId,
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: workerStart?.id,
      },
    });
    expect(assessGoalLoopSummaryCurrentGateParity(summary!, {
      id: "current-gate",
      label: "Check worker result",
      description: "Current visible gate.",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId,
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: workerStart?.id,
    }).status).toBe("matches-current-gate");
    expect(assessGoalLoopSummaryCurrentGateParity(summary!, {
      id: "wrong-target",
      label: "Check worker result",
      description: "Wrong worker target.",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId,
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "other-worker-start",
    })).toMatchObject({ visible: false, status: "target-mismatch", mismatchedKey: "schedulerWorkerStartId" });
    expect(assessGoalLoopSummaryCurrentGateParity(summary!, {
      id: "disabled",
      label: "Check worker result",
      description: "Disabled gate.",
      kind: "workflow-action",
      enabled: false,
      requiresConfirmation: true,
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId,
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: workerStart?.id,
    })).toMatchObject({ visible: false, status: "wrong-gate-kind" });
  });

  it("hides stale next-step packets from main-Agent context and Workpad summary after evidence advances", async () => {
    const { workerStart } = await writeSchedulerEvidence({ withWorkerStart: true });
    const result = await compileGoalLoopEvaluation(memory, changePath);

    expect(result.goalLoopNextStepPacket.recommendedAction?.actionType).toBe("planning.scheduler.worker.reconcile-result");
    await expect(buildGoalLoopMainAgentContextSection(memory, changePath, changeId)).resolves.toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
    });
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toMatchObject({
      recommendedActionType: "planning.scheduler.worker.reconcile-result",
    });

    await writeWorkerResult(workerStart!, "evidence-ready");

    await expect(buildGoalLoopMainAgentContextSection(memory, changePath, changeId)).resolves.toBeNull();
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toBeNull();
  });

  it("defaults legacy conflict assessments to non-executing wait posture", async () => {
    const decision = await compileGoalLoopDecision(memory, changePath);
    const legacyDecision = JSON.parse(JSON.stringify(decision)) as Record<string, unknown>;
    const conflictAssessment = legacyDecision.conflictAssessment as Record<string, unknown>;
    delete conflictAssessment.routingPosture;
    delete conflictAssessment.routingLabel;
    delete legacyDecision.schedulerExecutionMode;

    const parsed = goalLoopDecisionSchema.parse(legacyDecision);

    expect(parsed.conflictAssessment).toMatchObject({
      routingPosture: "wait-for-evidence",
      routingLabel: "Wait for evidence",
      parallelEligible: false,
    });
    expect(parsed.schedulerExecutionMode).toMatchObject({
      mode: "waiting-for-evidence",
      loopAuthorized: false,
      summary: expect.stringContaining("Legacy Goal Loop artifact"),
    });
  });
});

async function writeSchedulerEvidence(options: { withWorkerStart: boolean; extraReservationIntent?: boolean }): Promise<{ schedulerRun: SchedulerRun; reservation: SchedulerRuntimeClaimReservation; workerStart?: SchedulerRuntimeWorkerStart }> {
  const now = "2026-06-14T00:00:00.000Z";
  const schedulerRunId = "scheduler-run-1";
  const schedulerRunRefs = schedulerRunArtifactRefs(memory, changePath, schedulerRunId);
  const schedulerRun: SchedulerRun = {
    version: "1.0",
    id: schedulerRunId,
    changeId,
    status: "prepared",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    decompositionPlanId: "decomposition-1",
    readinessManifestId: "readiness-1",
    claimIntentCount: 1,
    plannedSlotDemand: 1,
    maxPlannedWaveWidth: 1,
    blockedCount: 0,
    humanConfirmed: true,
    futureToolPolicyGateRequired: true,
    futureHumanGateRequired: true,
    sourceArtifactHashes: { spec: "hash-1" },
    artifactRefs: [schedulerRunRefs.artifact],
    artifact: schedulerRunRefs.artifact,
    markdownArtifact: schedulerRunRefs.markdownArtifact,
    journalArtifact: schedulerRunRefs.journalArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRun(memory, changePath, schedulerRun);

  const runtimeRefs = schedulerRuntimeArtifactRefs(memory, changePath, schedulerRunId);
  const runtimeState: SchedulerRuntimeState = {
    version: "1.0",
    id: "runtime-state-1",
    changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "initialized",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    decompositionPlanId: "decomposition-1",
    readinessManifestId: "readiness-1",
    claimIntents: [],
    waves: [],
    plannedSlotDemand: 1,
    maxPlannedWaveWidth: 1,
    blockedCount: 0,
    lastReconcileSnapshotId: "snapshot-1",
    lastClaimReservationId: "reservation-1",
    lastClaimReservationSnapshotId: "snapshot-1",
    sourceArtifactHashes: { spec: "hash-1" },
    artifactRefs: [runtimeRefs.artifact],
    artifact: runtimeRefs.artifact,
    eventsArtifact: runtimeRefs.eventsArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeState(memory, changePath, runtimeState);

  const reservationRefs = schedulerClaimReservationArtifactRefs(memory, changePath, schedulerRunId, "reservation-1");
  const reservation: SchedulerRuntimeClaimReservation = {
    version: "1.0",
    id: "reservation-1",
    changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "reserved",
    schedulerRuntimeStateId: runtimeState.id,
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    reservationIntents: [{
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-1",
      plannedWorkerKey: "worker-1",
      nodeId: "node-1",
      unitId: "unit-1",
      waveIndex: 0,
      status: "reserved",
      plannedSlotDemand: 1,
      sourceScopes: ["src/a.ts"],
      blockedReasons: [],
    }, ...(options.extraReservationIntent ? [{
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-2",
      plannedWorkerKey: "worker-2",
      nodeId: "node-2",
      unitId: "unit-2",
      waveIndex: 1,
      status: "reserved" as const,
      plannedSlotDemand: 1,
      sourceScopes: ["src/b.ts"],
      blockedReasons: [],
    }] : [])],
    waves: [{
      waveIndex: 0,
      reservationIntentIds: ["reservation-intent-1"],
      reservedCount: 1,
      blockedCount: 0,
      plannedSlotDemand: 1,
      status: "reserved",
      blockedReasons: [],
    }],
    sourceLocks: [{
      scope: "src/a.ts",
      waveIndex: 0,
      reservationIntentIds: ["reservation-intent-1"],
      status: "reserved",
      blockedReasons: [],
    }],
    reservedCount: options.extraReservationIntent ? 2 : 1,
    blockedCount: 0,
    sourceLockCount: 1,
    sourceArtifactHashes: { spec: "hash-1" },
    artifactRefs: [reservationRefs.artifact],
    artifact: reservationRefs.artifact,
    markdownArtifact: reservationRefs.markdownArtifact,
    createdAt: now,
  };
  await writeSchedulerRuntimeClaimReservation(memory, changePath, reservation);

  let workerStart: SchedulerRuntimeWorkerStart | undefined;
  if (options.withWorkerStart) {
    const startRefs = schedulerWorkerStartArtifactRefs(memory, changePath, schedulerRunId, "worker-start-1");
    workerStart = {
      version: "1.0",
      id: "worker-start-1",
      changeId,
      schedulerRunId,
      schedulerMode: "parallel-readiness-v1",
      status: "started",
      schedulerRuntimeStateId: runtimeState.id,
      schedulerReconcileSnapshotId: "snapshot-1",
      schedulerClaimReservationId: reservation.id,
      schedulerContractId: "contract-1",
      schedulerDispatchDryRunId: "dry-run-1",
      schedulerWorkerPlanId: "worker-plan-1",
      schedulerClaimReconcilePlanId: "claim-plan-1",
      schedulerLaunchPreflightId: "preflight-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-1",
      plannedWorkerKey: "worker-1",
      nodeId: "node-1",
      unitId: "unit-1",
      waveIndex: 0,
      stageId: "coder",
      stage: "coder",
      taskId: "unit-1",
      taskRunId: "task-run-1",
      workerLeaseId: "lease-1",
      taskRunRoleId: "scheduler-coder",
      agentRoleId: "coder-agent",
      worktreeId: "worktree-1",
      runId: "run-1",
      sourceArtifactHashes: { spec: "hash-1" },
      artifactRefs: [startRefs.artifact],
      artifact: startRefs.artifact,
      markdownArtifact: startRefs.markdownArtifact,
      createdAt: now,
      updatedAt: now,
    };
    await writeSchedulerRuntimeWorkerStart(memory, changePath, workerStart);
  }

  return { schedulerRun, reservation, workerStart };
}

async function writeWorkerResult(start: SchedulerRuntimeWorkerStart, status: SchedulerRuntimeWorkerResult["status"]): Promise<SchedulerRuntimeWorkerResult> {
  const refs = schedulerWorkerResultArtifactRefs(memory, changePath, start.schedulerRunId, "worker-result-1");
  const result: SchedulerRuntimeWorkerResult = {
    version: "1.0",
    id: "worker-result-1",
    changeId,
    schedulerRunId: start.schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status,
    schedulerRuntimeStateId: start.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: start.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: start.schedulerClaimReservationId,
    schedulerWorkerStartId: start.id,
    schedulerContractId: start.schedulerContractId,
    schedulerDispatchDryRunId: start.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: start.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: start.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: start.schedulerLaunchPreflightId,
    reservationIntentId: start.reservationIntentId,
    claimIntentId: start.claimIntentId,
    plannedWorkerKey: start.plannedWorkerKey,
    nodeId: start.nodeId,
    unitId: start.unitId,
    waveIndex: start.waveIndex,
    stageId: start.stageId,
    stage: "coder",
    taskId: start.taskId,
    taskRunId: start.taskRunId,
    workerLeaseId: start.workerLeaseId,
    taskRunStatus: status === "evidence-ready" ? "evidence-ready" : "failed",
    workerLeaseStatus: "released",
    agentRoleId: start.agentRoleId,
    worktreeId: start.worktreeId,
    runId: start.runId,
    runStatus: status === "evidence-ready" ? "completed" : "failed",
    sourceArtifactHashes: start.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: start.createdAt,
    updatedAt: start.updatedAt,
  };
  await writeSchedulerRuntimeWorkerResult(memory, changePath, result);
  return result;
}

async function writeWorkerValidation(result: SchedulerRuntimeWorkerResult, status: SchedulerRuntimeWorkerValidation["status"]): Promise<SchedulerRuntimeWorkerValidation> {
  const refs = schedulerWorkerValidationArtifactRefs(memory, changePath, result.schedulerRunId, "worker-validation-1");
  const validation: SchedulerRuntimeWorkerValidation = {
    version: "1.0",
    id: "worker-validation-1",
    changeId,
    schedulerRunId: result.schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status,
    schedulerRuntimeStateId: result.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: result.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: result.schedulerClaimReservationId,
    schedulerWorkerStartId: result.schedulerWorkerStartId,
    schedulerWorkerResultId: result.id,
    schedulerContractId: result.schedulerContractId,
    schedulerDispatchDryRunId: result.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: result.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: result.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: result.schedulerLaunchPreflightId,
    reservationIntentId: result.reservationIntentId,
    claimIntentId: result.claimIntentId,
    plannedWorkerKey: result.plannedWorkerKey,
    nodeId: result.nodeId,
    unitId: result.unitId,
    waveIndex: result.waveIndex,
    stageId: "validation",
    stage: "validation",
    taskId: result.taskId,
    taskRunId: result.taskRunId,
    workerLeaseId: result.workerLeaseId,
    taskRunStatus: status === "passed" ? "evidence-ready" : "blocked",
    worktreeId: result.worktreeId ?? "worktree-1",
    codeRunId: result.runId ?? "run-1",
    validationRunId: "validation-run-1",
    validationStatus: status,
    sourceArtifactHashes: result.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
  await writeSchedulerRuntimeWorkerValidation(memory, changePath, validation);
  return validation;
}

async function writeWorkerAudit(validation: SchedulerRuntimeWorkerValidation, status: SchedulerRuntimeWorkerAudit["status"]): Promise<SchedulerRuntimeWorkerAudit> {
  const refs = schedulerWorkerAuditArtifactRefs(memory, changePath, validation.schedulerRunId, "worker-audit-1");
  const audit: SchedulerRuntimeWorkerAudit = {
    version: "1.0",
    id: "worker-audit-1",
    changeId,
    schedulerRunId: validation.schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status,
    schedulerRuntimeStateId: validation.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: validation.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: validation.schedulerClaimReservationId,
    schedulerWorkerStartId: validation.schedulerWorkerStartId,
    schedulerWorkerResultId: validation.schedulerWorkerResultId,
    schedulerWorkerValidationId: validation.id,
    schedulerContractId: validation.schedulerContractId,
    schedulerDispatchDryRunId: validation.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: validation.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: validation.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: validation.schedulerLaunchPreflightId,
    reservationIntentId: validation.reservationIntentId,
    claimIntentId: validation.claimIntentId,
    plannedWorkerKey: validation.plannedWorkerKey,
    nodeId: validation.nodeId,
    unitId: validation.unitId,
    waveIndex: validation.waveIndex,
    stageId: "audit",
    stage: "audit",
    taskId: validation.taskId,
    taskRunId: validation.taskRunId,
    workerLeaseId: validation.workerLeaseId,
    taskRunStatus: status === "approved" || status === "approved-with-notes" ? "completed" : "blocked",
    worktreeId: validation.worktreeId,
    codeRunId: validation.codeRunId,
    validationRunId: validation.validationRunId,
    validationStatus: validation.validationStatus,
    auditRunId: "audit-run-1",
    auditStatus: status,
    sourceArtifactHashes: validation.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: validation.createdAt,
    updatedAt: validation.updatedAt,
  };
  await writeSchedulerRuntimeWorkerAudit(memory, changePath, audit);
  return audit;
}

async function writeReworkPlan(validation: SchedulerRuntimeWorkerValidation): Promise<SchedulerRuntimeWorkerReworkPlan> {
  const refs = schedulerWorkerReworkPlanArtifactRefs(memory, changePath, validation.schedulerRunId, "rework-plan-1");
  const plan: SchedulerRuntimeWorkerReworkPlan = {
    version: "1.0",
    id: "rework-plan-1",
    changeId,
    schedulerRunId: validation.schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "planned",
    blockingSource: "validation-failed",
    reworkReason: "Validation failed.",
    schedulerRuntimeStateId: validation.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: validation.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: validation.schedulerClaimReservationId,
    schedulerWorkerStartId: validation.schedulerWorkerStartId,
    schedulerWorkerResultId: validation.schedulerWorkerResultId,
    schedulerWorkerValidationId: validation.id,
    schedulerContractId: validation.schedulerContractId,
    schedulerDispatchDryRunId: validation.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: validation.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: validation.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: validation.schedulerLaunchPreflightId,
    reservationIntentId: validation.reservationIntentId,
    claimIntentId: validation.claimIntentId,
    plannedWorkerKey: validation.plannedWorkerKey,
    nodeId: validation.nodeId,
    unitId: validation.unitId,
    waveIndex: validation.waveIndex,
    stageId: "bounded-rework",
    stage: "bounded-rework",
    taskId: validation.taskId,
    taskRunId: validation.taskRunId,
    workerLeaseId: validation.workerLeaseId,
    taskRunStatus: validation.taskRunStatus,
    targetWorktreeId: validation.worktreeId,
    targetCodeRunId: validation.codeRunId,
    validationRunId: validation.validationRunId,
    validationStatus: validation.validationStatus,
    futureCodeGateMode: "scheduler-claim-rework",
    recoveryKeyInputs: [validation.id],
    sourceArtifactHashes: validation.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: validation.createdAt,
    updatedAt: validation.updatedAt,
  };
  await writeSchedulerRuntimeWorkerReworkPlan(memory, changePath, plan);
  return plan;
}

async function writeReworkStart(plan: SchedulerRuntimeWorkerReworkPlan): Promise<SchedulerRuntimeWorkerReworkStart> {
  const refs = schedulerWorkerReworkStartArtifactRefs(memory, changePath, plan.schedulerRunId, "rework-start-1");
  const start: SchedulerRuntimeWorkerReworkStart = {
    version: "1.0",
    id: "rework-start-1",
    changeId,
    schedulerRunId: plan.schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "started",
    schedulerRuntimeStateId: plan.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: plan.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: plan.schedulerClaimReservationId,
    schedulerWorkerStartId: plan.schedulerWorkerStartId,
    schedulerWorkerResultId: plan.schedulerWorkerResultId,
    schedulerWorkerValidationId: plan.schedulerWorkerValidationId,
    schedulerWorkerReworkPlanId: plan.id,
    schedulerContractId: plan.schedulerContractId,
    schedulerDispatchDryRunId: plan.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: plan.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: plan.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: plan.schedulerLaunchPreflightId,
    reservationIntentId: plan.reservationIntentId,
    claimIntentId: plan.claimIntentId,
    plannedWorkerKey: plan.plannedWorkerKey,
    nodeId: plan.nodeId,
    unitId: plan.unitId,
    waveIndex: plan.waveIndex,
    stageId: "bounded-rework",
    stage: "bounded-rework",
    taskId: plan.taskId,
    originalTaskRunId: plan.taskRunId,
    originalWorkerLeaseId: plan.workerLeaseId,
    reworkTaskRunId: "rework-task-run-1",
    reworkWorkerLeaseId: "rework-lease-1",
    taskRunRoleId: "scheduler-rework-coder",
    agentRoleId: "rework-coder-agent",
    worktreeId: plan.targetWorktreeId,
    originalCodeRunId: plan.targetCodeRunId,
    reworkRunId: "rework-run-1",
    sourceArtifactHashes: plan.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
  await writeSchedulerRuntimeWorkerReworkStart(memory, changePath, start);
  return start;
}

async function writeReworkResult(start: SchedulerRuntimeWorkerReworkStart, status: SchedulerRuntimeWorkerReworkResult["status"]): Promise<SchedulerRuntimeWorkerReworkResult> {
  const refs = schedulerWorkerReworkResultArtifactRefs(memory, changePath, start.schedulerRunId, "rework-result-1");
  const result: SchedulerRuntimeWorkerReworkResult = {
    version: "1.0",
    id: "rework-result-1",
    changeId,
    schedulerRunId: start.schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status,
    schedulerRuntimeStateId: start.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: start.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: start.schedulerClaimReservationId,
    schedulerWorkerStartId: start.schedulerWorkerStartId,
    schedulerWorkerResultId: start.schedulerWorkerResultId,
    schedulerWorkerValidationId: start.schedulerWorkerValidationId,
    schedulerWorkerAuditId: start.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: start.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: start.id,
    schedulerContractId: start.schedulerContractId,
    schedulerDispatchDryRunId: start.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: start.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: start.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: start.schedulerLaunchPreflightId,
    reservationIntentId: start.reservationIntentId,
    claimIntentId: start.claimIntentId,
    plannedWorkerKey: start.plannedWorkerKey,
    nodeId: start.nodeId,
    unitId: start.unitId,
    waveIndex: start.waveIndex,
    stageId: start.stageId,
    stage: "bounded-rework",
    taskId: start.taskId,
    originalTaskRunId: start.originalTaskRunId,
    originalWorkerLeaseId: start.originalWorkerLeaseId,
    originalCodeRunId: start.originalCodeRunId,
    reworkTaskRunId: start.reworkTaskRunId,
    reworkWorkerLeaseId: start.reworkWorkerLeaseId,
    taskRunStatus: status === "evidence-ready" ? "evidence-ready" : "failed",
    workerLeaseStatus: "released",
    agentRoleId: start.agentRoleId,
    worktreeId: start.worktreeId,
    reworkRunId: start.reworkRunId,
    reworkRunStatus: status === "evidence-ready" ? "completed" : "failed",
    sourceArtifactHashes: start.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: start.createdAt,
    updatedAt: start.updatedAt,
  };
  await writeSchedulerRuntimeWorkerReworkResult(memory, changePath, result);
  return result;
}

async function writeIntegrationCandidate(schedulerRun: SchedulerRun, reservation: SchedulerRuntimeClaimReservation, options: { readyCount: number; outputClaimIntentIds: string[] }): Promise<SchedulerIntegrationCandidate> {
  const refs = schedulerIntegrationCandidateArtifactRefs(memory, changePath, schedulerRun.id, "candidate-1");
  const outputs = options.outputClaimIntentIds.map((claimIntentId, index) => ({
    outputId: `output-${index + 1}`,
    kind: "worker" as const,
    status: "ready" as const,
    blockingReasons: [],
    claimIntentId,
    reservationIntentId: `reservation-intent-${index + 1}`,
    worktreeId: `worktree-${index + 1}`,
    validationRunId: `validation-run-${index + 1}`,
    auditRunId: `audit-run-${index + 1}`,
    artifactRefs: [],
  }));
  const readyTargets = Array.from({ length: options.readyCount }, (_, index) => ({
    worktreeId: `worktree-${index + 1}`,
    worktreeDiffHash: `diff-${index + 1}`,
    diffStat: "1 file changed",
    sourceHead: null,
    validationRunId: `validation-run-${index + 1}`,
    auditRunId: `audit-run-${index + 1}`,
  }));
  const candidate: SchedulerIntegrationCandidate = {
    version: "1.0",
    id: "candidate-1",
    changeId,
    schedulerRunId: schedulerRun.id,
    schedulerMode: "parallel-readiness-v1",
    status: options.readyCount >= 2 ? "ready" : "waiting",
    schedulerRuntimeStateId: "runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: reservation.id,
    schedulerContractId: schedulerRun.schedulerContractId,
    schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
    outputs,
    readyTargets,
    readyWorktreeIds: readyTargets.map((target) => target.worktreeId),
    readyCount: options.readyCount,
    blockedCount: 0,
    sourceArtifactHashes: schedulerRun.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
  await writeSchedulerIntegrationCandidate(memory, changePath, candidate);
  return candidate;
}

async function writeIntegrationHandoff(
  schedulerRun: SchedulerRun,
  reservation: SchedulerRuntimeClaimReservation,
  candidate: SchedulerIntegrationCandidate,
  options: { integrationCheckStatus: string },
): Promise<SchedulerIntegrationCheckHandoff> {
  const refs = schedulerIntegrationCheckHandoffArtifactRefs(memory, changePath, schedulerRun.id, "handoff-1");
  const handoff: SchedulerIntegrationCheckHandoff = {
    version: "1.0",
    id: "handoff-1",
    changeId,
    schedulerRunId: schedulerRun.id,
    schedulerMode: "parallel-readiness-v1",
    status: "completed",
    schedulerRuntimeStateId: "runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: reservation.id,
    schedulerIntegrationCandidateId: candidate.id,
    schedulerContractId: schedulerRun.schedulerContractId,
    schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
    readyTargets: candidate.readyTargets,
    readyWorktreeIds: candidate.readyWorktreeIds,
    integrationCheckId: "integration-check-1",
    integrationCheckStatus: options.integrationCheckStatus,
    resultTargetWorktreeIds: candidate.readyWorktreeIds,
    sourceArtifactHashes: schedulerRun.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
  await writeSchedulerIntegrationCheckHandoff(memory, changePath, handoff);
  return handoff;
}

async function writeIntegrationOutcome(schedulerRun: SchedulerRun, reservation: SchedulerRuntimeClaimReservation, candidate: SchedulerIntegrationCandidate): Promise<SchedulerIntegrationOutcome> {
  const refs = schedulerIntegrationOutcomeArtifactRefs(memory, changePath, schedulerRun.id, "outcome-1");
  const outcome: SchedulerIntegrationOutcome = {
    version: "1.0",
    id: "outcome-1",
    changeId,
    schedulerRunId: schedulerRun.id,
    schedulerMode: "parallel-readiness-v1",
    status: "applied",
    schedulerRuntimeStateId: "runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: reservation.id,
    schedulerIntegrationCandidateId: candidate.id,
    schedulerIntegrationCheckHandoffId: "handoff-1",
    schedulerContractId: schedulerRun.schedulerContractId,
    schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
    integrationCheckId: "integration-check-1",
    integrationCheckStatus: "applied",
    outcomeReason: "Applied.",
    readyWorktreeIds: candidate.readyWorktreeIds,
    resultTargetWorktreeIds: candidate.readyWorktreeIds,
    targets: candidate.readyTargets.map((target) => ({
      worktreeId: target.worktreeId,
      changeId,
      diffHash: target.worktreeDiffHash,
      sourceHead: target.sourceHead,
      applied: true,
      appliedAt: "2026-06-14T00:00:00.000Z",
    })),
    appliedAt: "2026-06-14T00:00:00.000Z",
    sourceHead: null,
    sourceArtifactHashes: schedulerRun.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
  await writeSchedulerIntegrationOutcome(memory, changePath, outcome);
  return outcome;
}

async function writeRunCompletion(
  schedulerRun: SchedulerRun,
  reservation: SchedulerRuntimeClaimReservation,
  candidate: SchedulerIntegrationCandidate,
  outcome: SchedulerIntegrationOutcome,
): Promise<SchedulerRunCompletion> {
  const refs = schedulerRunCompletionArtifactRefs(memory, changePath, schedulerRun.id, "completion-1");
  const completion: SchedulerRunCompletion = {
    version: "1.0",
    id: "completion-1",
    changeId,
    schedulerRunId: schedulerRun.id,
    schedulerMode: "parallel-readiness-v1",
    status: "completed-applied",
    schedulerRuntimeStateId: "runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: reservation.id,
    schedulerIntegrationCandidateId: candidate.id,
    schedulerIntegrationCheckHandoffId: outcome.schedulerIntegrationCheckHandoffId,
    schedulerIntegrationOutcomeId: outcome.id,
    schedulerContractId: schedulerRun.schedulerContractId,
    schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
    integrationCheckId: outcome.integrationCheckId,
    integrationCheckStatus: outcome.integrationCheckStatus,
    outcomeStatus: outcome.status,
    outcomeReason: outcome.outcomeReason,
    readyWorktreeIds: outcome.readyWorktreeIds,
    resultTargetWorktreeIds: outcome.resultTargetWorktreeIds,
    sourceArtifactHashes: schedulerRun.sourceArtifactHashes,
    artifactRefs: [refs.artifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
  await writeSchedulerRunCompletion(memory, changePath, completion);
  await writeSchedulerRun(memory, changePath, {
    ...schedulerRun,
    status: "completed",
    updatedAt: completion.updatedAt,
  });
  return completion;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildMemory(root: string): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "repo",
    projectRoot: root,
    markerPath: join(root, ".agent-harness.json"),
    agentGuidePath: join(root, "AGENTS.md"),
    memoryRoot: root,
    docsRoot: join(root, "docs"),
    harnessRoot: join(root, "harness"),
    changesRoot: join(root, "harness", "changes"),
    evolutionRoot: join(root, "harness", "evolution"),
    templatesRoot: join(root, "harness", "templates"),
    scriptsRoot: join(root, "scripts"),
    runsRoot: join(root, ".agent-harness", "runs"),
    workbenchRoot: join(root, ".agent-harness", "workbench"),
    workbenchDbPath: join(root, ".agent-harness", "workbench", "workbench.sqlite"),
    agentsRoot: join(root, "agents"),
    commandsRoot: join(root, "commands"),
    agentCatalogPath: join(root, "agents", "catalog.json"),
    skillsRoot: join(root, "skills"),
    worktreeMetadataRoot: join(root, ".agent-harness", "worktrees"),
    worktreeIndexPath: join(root, ".agent-harness", "worktrees", "index.json"),
  };
}
