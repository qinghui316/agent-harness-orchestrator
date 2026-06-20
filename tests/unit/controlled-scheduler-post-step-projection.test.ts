import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileGoalLoopControllerPolicy, compileGoalLoopEvaluation, compileGoalLoopGateReadinessPreflight } from "../../src/goal-loop/manager.js";
import type { GoalLoopRecommendedAction } from "../../src/goal-loop/types.js";
import type { ResolvedMemory } from "../../src/types/index.js";
import { buildControlledSchedulerNextCandidatePromptEvidence } from "../../src/workbench/codex-chat/goal-loop-context.js";
import { buildGoalLoopContextPreparedEvidence, goalLoopPromptStackLabels } from "../../src/workbench/codex-chat/goal-loop-prompt-evidence.js";
import type { WorkbenchWorkpad, WorkpadNextAction } from "../../src/workbench/read-model-types.js";
import { readLatestGoalLoopSummary } from "../../src/workbench/projections/read-model/goal-loop.js";
import { filterGoalLoopSummaryForCurrentGate } from "../../src/workbench/projections/read-model/goal-loop-parity.js";
import { readLatestControlledSchedulerStepReceipt } from "../../src/workbench/projections/read-model/controlled-scheduler-step-receipt.js";
import { WorkbenchStore, type StoredDecisionRecord } from "../../src/workbench/store.js";

let tempDir: string;
let memory: ResolvedMemory;

const changeId = "controlled-post-step";
const changePath = `harness/changes/active/${changeId}`;

describe("controlled scheduler post-step projection", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-controlled-post-step-"));
    memory = buildMemory(tempDir);
    await mkdir(join(memory.memoryRoot, changePath), { recursive: true });
    await writeJson(join(memory.memoryRoot, changePath, "change.json"), {
      version: "1.0",
      id: changeId,
      state: "active",
      title: "Controlled post-step",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      closedAt: null,
      archivePath: null,
    });
    await writeFile(join(memory.memoryRoot, changePath, "summary.md"), "# Summary\n\nReady.\n", "utf8");
    await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n\n- AC-001: Advance once.\n", "utf8");
    await writeFile(join(memory.memoryRoot, changePath, "plan.md"), "# Plan\n", "utf8");
    await writeFile(join(memory.memoryRoot, changePath, "tasks.md"), "# Tasks\n", "utf8");
    await writeJson(join(memory.memoryRoot, changePath, "ac-map.json"), { generatedAt: "2026-06-20T00:00:00.000Z", items: [] });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("keeps the latest post-step Goal Loop packet visible through the existing Workpad read-model filter", async () => {
    await compileGoalLoopEvaluation(memory, changePath);
    const postStep = await compileGoalLoopEvaluation(memory, changePath);

    const summary = await readLatestGoalLoopSummary(memory, changePath, changeId);

    expect(summary).toMatchObject({
      goalLoopDecisionId: postStep.goalLoopDecision.id,
      goalLoopIterationId: postStep.goalLoopIteration.id,
      goalLoopNextStepPacketId: postStep.goalLoopNextStepPacket.id,
      executionStarted: false,
    });

    expect(filterGoalLoopSummaryForCurrentGate(summary, nextActionFor(postStep.goalLoopNextStepPacket.recommendedAction))).toMatchObject({
      goalLoopDecisionId: postStep.goalLoopDecision.id,
      goalLoopIterationId: postStep.goalLoopIteration.id,
      goalLoopNextStepPacketId: postStep.goalLoopNextStepPacket.id,
      executionStarted: false,
      controlledSchedulerNextCandidate: {
        status: "needs-review",
        label: "下一步候选需要复核",
        readinessEvidencePrepared: false,
        humanConfirmationStillRequired: true,
      },
    });
  });

  it("marks the Workpad next candidate ready only when controller and preflight evidence match the fresh packet", async () => {
    await compileGoalLoopEvaluation(memory, changePath);
    const postStep = await compileGoalLoopEvaluation(memory, changePath);
    const currentGate = currentGateFor(postStep.goalLoopNextStepPacket.recommendedAction);
    const controller = await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate,
      goalLoopNextStepPacketId: postStep.goalLoopNextStepPacket.id,
      requireCurrentGateMatch: true,
    });
    const preflight = await compileGoalLoopGateReadinessPreflight(memory, changePath, {
      goalLoopNextStepPacketId: postStep.goalLoopNextStepPacket.id,
      goalLoopControllerPolicyId: controller.id,
      currentGate,
    });

    const summary = await readLatestGoalLoopSummary(memory, changePath, changeId);
    const filtered = filterGoalLoopSummaryForCurrentGate(summary, nextActionFor(postStep.goalLoopNextStepPacket.recommendedAction));

    expect(filtered).toMatchObject({
      controllerPolicyId: controller.id,
      gateReadinessPreflightId: preflight.id,
      controlledSchedulerNextCandidate: {
        status: "ready-for-confirmation",
        label: "下一步候选已刷新",
        readinessEvidencePrepared: true,
        humanConfirmationStillRequired: true,
      },
    });
    expect(filtered?.controlledSchedulerNextCandidate?.body).toContain("继续仍需要你再次确认");
    expect(filtered?.controlledSchedulerNextCandidate?.body).not.toContain("planning.scheduler");
    expect(filtered?.controlledSchedulerNextCandidate?.body).not.toContain("Scheduler");

    const promptEvidence = buildControlledSchedulerNextCandidatePromptEvidence(
      { goalLoop: filtered } as WorkbenchWorkpad,
      postStep.goalLoopNextStepPacket.id,
    );
    expect(promptEvidence).toEqual(expect.objectContaining({
      authority: "non-executing-controlled-scheduler-next-candidate-prompt-evidence",
      status: "ready-for-confirmation",
      actionLabel: filtered?.controlledSchedulerNextCandidate?.actionLabel,
      readinessEvidencePrepared: true,
      humanConfirmationStillRequired: true,
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    }));
    expect(promptEvidence?.evidenceRefs).toEqual(expect.arrayContaining([
      expect.stringContaining("goal-loop-next-step-packets"),
      expect.stringContaining("goal-loop-controller-policies"),
      expect.stringContaining("goal-loop-gate-readiness-preflights"),
    ]));
    expect(promptEvidence).not.toHaveProperty("recommendedActionScope");
    expect(promptEvidence).not.toHaveProperty("actionPayload");
    expect(promptEvidence).not.toHaveProperty("markdown");

    const contextResult = {
      context: "",
      goalLoopNextStepPacketId: postStep.goalLoopNextStepPacket.id,
      goalLoopControlledSchedulerNextCandidate: promptEvidence,
    } as Parameters<typeof goalLoopPromptStackLabels>[0];
    expect(goalLoopPromptStackLabels(contextResult)).toContain("goal-loop-controlled-scheduler-next-candidate");
    expect(buildGoalLoopContextPreparedEvidence(contextResult).goalLoopControlledSchedulerNextCandidate).toEqual(promptEvidence);
  });

  it("derives a sanitized Workpad step receipt from the latest completed controlled advance decision", async () => {
    await upsertDecision({
      id: "workflow:controlled-advance:1",
      decisionType: "planning.scheduler.controlled-advance.run",
      status: "completed",
      artifact: "harness/changes/active/controlled-post-step/planning/controlled-advance/result.json",
      payloadJson: JSON.stringify({
        scope: { changeId },
        result: {
          postStepHandoff: {
            authority: "derived-non-executing-workbench-handoff",
            status: "next-confirmation-candidate-ready",
            stopReason: "one-confirmed-scheduler-transition-completed",
            executedActionType: "planning.scheduler.worker.start-next",
            nextConfirmationCandidate: {
              actionType: "planning.scheduler.worker.reconcile-result",
              readinessEvidencePrepared: true,
              executionStarted: false,
              authorizationGranted: false,
              humanConfirmationStillRequired: true,
            },
            needsReevaluation: false,
            executionStarted: false,
            loopAuthorized: false,
            wholeWaveDispatchAuthorized: false,
            slotAllocatorAuthorized: false,
          },
        },
      }),
      updatedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:00.000Z",
    });

    const receipt = await readLatestControlledSchedulerStepReceipt(memory, changeId);

    expect(receipt).toMatchObject({
      label: "已完成一个受控步骤",
      status: "ready-for-confirmation",
      executedStepLabel: "继续执行下一个任务",
      nextStepLabel: "检查当前结果",
      humanConfirmationStillRequired: true,
      evidenceRefs: ["harness/changes/active/controlled-post-step/planning/controlled-advance/result.json"],
    });
    expect(receipt?.body).toContain("本次执行：继续执行下一个任务");
    expect(receipt?.body).toContain("下一步候选：检查当前结果");
    expect(receipt?.body).toContain("继续前仍需要你再次确认");
    expect(JSON.stringify(receipt)).not.toContain("planning.scheduler");
    expect(JSON.stringify(receipt)).not.toContain("SchedulerRun");
    expect(JSON.stringify(receipt)).not.toContain("whole-wave");
  });

  it("hides the receipt when the latest completed controlled advance decision has invalid handoff evidence", async () => {
    await upsertDecision({
      id: "workflow:controlled-advance:valid-old",
      decisionType: "planning.scheduler.controlled-advance.run",
      status: "completed",
      payloadJson: JSON.stringify({
        scope: { changeId },
        result: {
          postStepHandoff: {
            authority: "derived-non-executing-workbench-handoff",
            status: "next-step-evaluation-refreshed",
            stopReason: "one-confirmed-scheduler-transition-completed",
            executedActionType: "planning.scheduler.worker.start-next",
            needsReevaluation: false,
            executionStarted: false,
            loopAuthorized: false,
            wholeWaveDispatchAuthorized: false,
            slotAllocatorAuthorized: false,
          },
        },
      }),
      updatedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:00.000Z",
    });
    await upsertDecision({
      id: "workflow:controlled-advance:invalid-new",
      decisionType: "planning.scheduler.controlled-advance.run",
      status: "completed",
      payloadJson: JSON.stringify({
        scope: { changeId },
        result: {
          postStepHandoff: {
            status: "next-step-evaluation-refreshed",
            executionStarted: false,
          },
        },
      }),
      updatedAt: "2026-06-20T12:05:00.000Z",
      completedAt: "2026-06-20T12:05:00.000Z",
    });

    await upsertDecision({
      id: "workflow:controlled-advance:failed-newer",
      decisionType: "planning.scheduler.controlled-advance.run",
      status: "failed",
      payloadJson: "{}",
      updatedAt: "2026-06-20T12:10:00.000Z",
      completedAt: "2026-06-20T12:10:00.000Z",
    });

    await upsertDecision({
      id: "workflow:other-valid-newer",
      decisionType: "planning.goal-loop.evaluate",
      status: "completed",
      payloadJson: JSON.stringify({ result: { postStepHandoff: {} } }),
      updatedAt: "2026-06-20T12:15:00.000Z",
      completedAt: "2026-06-20T12:15:00.000Z",
    });

    await expect(readLatestControlledSchedulerStepReceipt(memory, changeId)).resolves.toBeNull();
  });

  it("hides the receipt when the controlled advance decision is missing the persisted scope wrapper", async () => {
    await upsertDecision({
      id: "workflow:controlled-advance:missing-scope",
      decisionType: "planning.scheduler.controlled-advance.run",
      status: "completed",
      payloadJson: JSON.stringify({
        result: {
          postStepHandoff: {
            authority: "derived-non-executing-workbench-handoff",
            status: "next-step-evaluation-refreshed",
            stopReason: "one-confirmed-scheduler-transition-completed",
            executedActionType: "planning.scheduler.worker.start-next",
            needsReevaluation: false,
            executionStarted: false,
            loopAuthorized: false,
            wholeWaveDispatchAuthorized: false,
            slotAllocatorAuthorized: false,
          },
        },
      }),
      updatedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:00.000Z",
    });

    await expect(readLatestControlledSchedulerStepReceipt(memory, changeId)).resolves.toBeNull();
  });

  it("hides the receipt when the persisted controlled advance scope targets another change", async () => {
    await upsertDecision({
      id: "workflow:controlled-advance:wrong-scope",
      decisionType: "planning.scheduler.controlled-advance.run",
      status: "completed",
      payloadJson: JSON.stringify({
        scope: { changeId: "other-change" },
        result: {
          postStepHandoff: {
            authority: "derived-non-executing-workbench-handoff",
            status: "next-step-evaluation-refreshed",
            stopReason: "one-confirmed-scheduler-transition-completed",
            executedActionType: "planning.scheduler.worker.start-next",
            needsReevaluation: false,
            executionStarted: false,
            loopAuthorized: false,
            wholeWaveDispatchAuthorized: false,
            slotAllocatorAuthorized: false,
          },
        },
      }),
      updatedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:00.000Z",
    });

    await expect(readLatestControlledSchedulerStepReceipt(memory, changeId)).resolves.toBeNull();
  });
});

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

function currentGateFor(recommendedAction: GoalLoopRecommendedAction | undefined) {
  if (!recommendedAction) throw new Error("Expected Goal Loop evaluation to recommend a current gate.");
  return {
    actionType: recommendedAction.actionType,
    scope: recommendedAction.scope,
  };
}

function nextActionFor(recommendedAction: GoalLoopRecommendedAction | undefined): WorkpadNextAction {
  if (!recommendedAction) throw new Error("Expected Goal Loop evaluation to recommend a current gate.");
  return {
    id: "current-visible-gate",
    label: "Current visible gate",
    description: "Current visible gate.",
    kind: "workflow-action",
    enabled: true,
    requiresConfirmation: true,
    actionType: recommendedAction.actionType,
    changeId,
    ...recommendedAction.scope,
  };
}

async function upsertDecision(overrides: Partial<StoredDecisionRecord>): Promise<void> {
  const store = await WorkbenchStore.open(memory);
  try {
    store.upsertDecision({
      id: overrides.id ?? `decision-${Date.now()}`,
      projectId: "repo",
      changeId,
      decisionType: overrides.decisionType ?? "planning.scheduler.controlled-advance.run",
      status: overrides.status ?? "completed",
      label: overrides.label ?? "按当前建议继续一个受控步骤",
      summary: overrides.summary ?? "受控步骤已完成。",
      targetId: overrides.targetId ?? null,
      runId: overrides.runId ?? null,
      artifact: overrides.artifact ?? null,
      actionId: overrides.actionId ?? "planning.scheduler.controlled-advance.run",
      feedback: overrides.feedback ?? null,
      payloadJson: overrides.payloadJson ?? "{}",
      createdAt: overrides.createdAt ?? overrides.updatedAt ?? "2026-06-20T12:00:00.000Z",
      updatedAt: overrides.updatedAt ?? "2026-06-20T12:00:00.000Z",
      completedAt: overrides.completedAt ?? "2026-06-20T12:00:00.000Z",
    });
  } finally {
    store.close();
  }
}
