import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGoalLoopMainAgentContextSection, compileGoalLoopControllerPolicy, compileGoalLoopDecision, compileGoalLoopEvaluation, isGoalLoopNextStepPacketFresh, readLatestGoalLoopContinuationBrief, readLatestGoalLoopControllerPolicy, readLatestGoalLoopFeedback, readLatestGoalLoopIteration, readLatestGoalLoopNextStepPacket, recordGoalLoopFeedback, stripGoalLoopControllerPolicyContext, writeGoalLoopNextStepPacket } from "../../src/goal-loop/manager.js";
import { assessGoalLoopSummaryCurrentGateParity } from "../../src/workbench/projections/read-model/goal-loop-parity.js";
import { readLatestGoalLoopSummary } from "../../src/workbench/projections/read-model/goal-loop.js";
import type { ResolvedMemory } from "../../src/types/index.js";
import { schedulerRunArtifactRefs, writeSchedulerRun } from "../../src/workflow-scheduler/repository.js";
import type { SchedulerRun } from "../../src/workflow-scheduler/types.js";
import {
  schedulerClaimReservationArtifactRefs,
  schedulerIntegrationCandidateArtifactRefs,
  schedulerIntegrationOutcomeArtifactRefs,
  schedulerRuntimeArtifactRefs,
  schedulerWorkerAuditArtifactRefs,
  schedulerWorkerResultArtifactRefs,
  schedulerWorkerReworkPlanArtifactRefs,
  schedulerWorkerReworkResultArtifactRefs,
  schedulerWorkerReworkStartArtifactRefs,
  schedulerWorkerStartArtifactRefs,
  schedulerWorkerValidationArtifactRefs,
  writeSchedulerIntegrationCandidate,
  writeSchedulerIntegrationOutcome,
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
import type { SchedulerIntegrationCandidate, SchedulerIntegrationOutcome, SchedulerRuntimeClaimReservation, SchedulerRuntimeState, SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerResult, SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkStart, SchedulerRuntimeWorkerStart, SchedulerRuntimeWorkerValidation } from "../../src/scheduler-runtime/types.js";

let tempDir: string;
let memory: ResolvedMemory;
const changeId = "phase-goal-loop";
const changePath = `harness/changes/active/${changeId}`;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-goal-loop-"));
  memory = buildMemory(tempDir);
  await mkdir(join(memory.memoryRoot, changePath), { recursive: true });
  await writeJson(join(memory.memoryRoot, changePath, "change.json"), { id: changeId, state: "active", title: "Goal loop" });
  await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n", "utf8");
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
    expect(decision.executionStarted).toBe(false);
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
    expect(decision.executionStarted).toBe(false);
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
      },
    });
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
        schedulerIntegrationOutcomeId: outcome.id,
      },
    });
  });

  it("renders latest next-step packet as main-Agent context and skips invalid lineage", async () => {
    const result = await compileGoalLoopEvaluation(memory, changePath);

    const section = await buildGoalLoopMainAgentContextSection(memory, changePath, changeId);

    expect(section).toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      artifact: expect.stringContaining("goal-loop-next-step-packets"),
      markdownArtifact: expect.stringContaining("goal-loop-next-step-packets"),
    });
    expect(section?.markdown).toContain("Goal Loop Next-Step Packet");
    expect(section?.markdown).toContain("main-Agent prompt context only");
    expect(section?.markdown).toContain(result.goalLoopNextStepPacket.id);
    expect(section?.markdown).toContain("planning.scheduler.plan.prepare");
    expect(section?.markdown).toContain("Revalidation Checklist");
    expect(section?.markdown).toContain("Forbidden Execution Statements");
    expect(section?.markdown).toContain("not workflow truth");
    await expect(readLatestGoalLoopSummary(memory, changePath)).resolves.toMatchObject({
      goalLoopNextStepPacketId: result.goalLoopNextStepPacket.id,
      recommendedActionType: "planning.scheduler.plan.prepare",
      recommendedActionScope: { changeId },
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
    expect(stripped.markdown).toContain("Goal Loop Next-Step Packet");
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
