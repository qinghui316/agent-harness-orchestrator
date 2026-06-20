import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic } from "../../src/workbench/chat.js";
import { buildChatContext, buildOrchestratorContext } from "../../src/workbench/codex-chat/context.js";
import { buildSchedulerTerminalHandoffContext } from "../../src/workbench/codex-chat/goal-loop-context.js";
import { buildGoalLoopContextPreparedEvidence, goalLoopPromptStackLabels } from "../../src/workbench/codex-chat/goal-loop-prompt-evidence.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { attachControlledSchedulerAdvanceActions, attachGoalLoopAssistedConcreteGateActions, attachGoalLoopControllerRefreshActions, attachGoalLoopFeedbackActions, attachGoalLoopGateReadinessActions } from "../../src/workbench/projections/read-model/confirmation/goal-loop.js";
import { schedulerUserFacingActionCopy } from "../../src/workbench/projections/read-model/confirmation/scheduler-user-surface.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listWorktreeStatuses } from "../../src/worktree/manager.js";
import { listIntegrationChecks } from "../../src/integration-check/manager.js";
import { readLatestGoalLoopContinuationBrief, readLatestGoalLoopDecision, readLatestGoalLoopIteration } from "../../src/goal-loop/manager.js";
import { getTempDir, project, writeAcceptedSpecAndTasks } from "./workbench/fixtures.js";
import { readTopicThreadLog } from "../../src/workbench/thread-log.js";

type SchedulerTerminalHandoffSectionFixture = Parameters<typeof buildSchedulerTerminalHandoffContext>[1];

let tempDir: string;

beforeEach(async () => {
  tempDir = getTempDir();
});

describe("workbench Goal Loop surface", () => {
  it("projects goal loop evaluation as a fallback confirmation without starting execution", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Goal Loop Fallback",
      body: "Evaluate the long-running goal before doing more work.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      kind: "planning-confirm",
      changeId: topic.changeId,
      summary: "主 Agent 可以先评估当前需求的下一步。",
      whyNeedsConfirmation: "需要你确认是否先让主 Agent 做一次非执行评估。",
      confirmEffect: "确认后只记录下一步建议和对话说明，不会执行建议里的动作。",
      riskSummary: "后续任何执行、组合检查、应用、关闭或远端操作仍需要单独确认。",
    });
    const action = snapshot.right.confirmationQueue.primary?.actions.find((item) => item.actionType === "planning.goal-loop.evaluate");
    expect(action).toMatchObject({
      label: "评估下一步",
      changeId: topic.changeId,
      requiresConfirmation: true,
    });
    expectQueueItemUserCopyNotToContainInternalTerms(snapshot.right.confirmationQueue.primary, [
      "GoalLoopDecision",
      "GoalLoopIteration",
      "continuation brief",
      "next-step packet",
      "TaskRun",
      "WorkerLease",
      "worktree",
      "source mutation",
    ]);

    const actionResult = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.goal-loop.evaluate",
      changeId: topic.changeId,
      confirm: true,
    });
    expect(actionResult.result).toMatchObject({ status: "completed" });
    const result = actionResult.result.result as {
      goalLoopDecision?: { changeId: string; executionStarted: boolean; authority: string; id: string };
      goalLoopIteration?: { changeId: string; executionStarted: boolean; authority: string; goalLoopDecisionId: string; ordinal: number; continuationState: string };
      goalLoopContinuationBrief?: { changeId: string; executionStarted: boolean; authority: string; sourceGoalLoopDecisionId: string; sourceGoalLoopIterationId: string; id: string };
      goalLoopNextStepPacket?: { changeId: string; executionStarted: boolean; authority: string; sourceGoalLoopDecisionId: string; sourceGoalLoopIterationId: string; sourceGoalLoopContinuationBriefId: string; id: string };
    };
    expect(result.goalLoopDecision).toMatchObject({
      changeId: topic.changeId,
      executionStarted: false,
      authority: "non-executing-planning-evidence",
    });
    expect(result.goalLoopIteration).toMatchObject({
      changeId: topic.changeId,
      executionStarted: false,
      authority: "non-executing-continuation-evidence",
      goalLoopDecisionId: result.goalLoopDecision?.id,
      ordinal: 1,
      continuationState: "ready-for-existing-gate",
    });
    expect(result.goalLoopContinuationBrief).toMatchObject({
      changeId: topic.changeId,
      executionStarted: false,
      authority: "non-executing-continuation-brief-evidence",
      sourceGoalLoopDecisionId: result.goalLoopDecision?.id,
      sourceGoalLoopIterationId: result.goalLoopIteration?.id,
    });
    expect(result.goalLoopNextStepPacket).toMatchObject({
      changeId: topic.changeId,
      executionStarted: false,
      authority: "non-executing-main-agent-next-step-packet",
      sourceGoalLoopDecisionId: result.goalLoopDecision?.id,
      sourceGoalLoopIterationId: result.goalLoopIteration?.id,
      sourceGoalLoopContinuationBriefId: result.goalLoopContinuationBrief?.id,
    });
    const threadLog = await readTopicThreadLog(await resolveProjectMemory(project()), join("harness", "changes", "active", topic.changeId));
    const goalLoopMessage = threadLog.find((entry) => entry.type === "assistant.message" && entry.status === "goal-loop-evaluated");
    expect(goalLoopMessage).toMatchObject({
      text: "下一步评估已完成。这里只记录建议和证据，没有执行任何步骤；继续执行仍需要你单独确认。",
      artifact: result.goalLoopContinuationBrief?.artifact,
    });
    expectUserCopyNotToContainInternalTerms(goalLoopMessage?.text ?? "", [
      "GoalLoopContinuationBrief",
      "Goal Loop",
      "continuation brief",
      "Recommended Action Snapshot",
      "planning.scheduler",
      "Harness gate",
      "concrete gate",
    ]);
    const memory = await resolveProjectMemory(project());
    await expect(readLatestGoalLoopDecision(memory, join("harness", "changes", "active", topic.changeId))).resolves.toMatchObject({
      changeId: topic.changeId,
      executionStarted: false,
    });
    await expect(readLatestGoalLoopIteration(memory, join("harness", "changes", "active", topic.changeId))).resolves.toMatchObject({
      changeId: topic.changeId,
      goalLoopDecisionId: result.goalLoopDecision?.id,
      continuationState: "ready-for-existing-gate",
      executionStarted: false,
    });
    await expect(readLatestGoalLoopContinuationBrief(memory, join("harness", "changes", "active", topic.changeId))).resolves.toMatchObject({
      changeId: topic.changeId,
      sourceGoalLoopDecisionId: result.goalLoopDecision?.id,
      sourceGoalLoopIterationId: result.goalLoopIteration?.id,
      executionStarted: false,
    });
    const resumedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(resumedSnapshot.center.workpad.goalLoop).toBeUndefined();
    expect(resumedSnapshot.center.workpad.nextAction.actionType).not.toBe("planning.goal-loop.evaluate");
    const chatContext = await buildChatContext(project(), memory, topic.changeId, "continue the goal");
    expect(chatContext.goalLoopNextStepPacketId).toBeUndefined();
    expect(chatContext.context).not.toContain("Goal Loop Next-Step Packet");
    const orchestratorContext = await buildOrchestratorContext(project(), memory, join("harness", "changes", "active", topic.changeId), topic.changeId, "plan the next step");
    expect(orchestratorContext.goalLoopNextStepPacketId).toBeUndefined();
    expect(orchestratorContext.context).not.toContain("Goal Loop Next-Step Packet");
    expect(await listRuns(memory)).toHaveLength(0);
    expect(await listWorktreeStatuses(memory)).toHaveLength(0);
    expect(await listIntegrationChecks(memory)).toHaveLength(0);
  });

  it("projects goal loop feedback as a secondary action on the matching current gate", async () => {
    const currentGate = {
      id: "confirm:scheduler-plan:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      summary: "准备并行执行计划。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只准备 non-executing scheduler evidence。",
      riskSummary: "用户仍可要求主 Agent 修正建议。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.plan.prepare:member-discount",
        label: "准备并行执行计划",
        kind: "workflow-action",
        actionType: "planning.scheduler.plan.prepare",
        changeId: "member-discount",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.plan.prepare",
        changeId: "member-discount",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        recommendedActionType: "planning.scheduler.plan.prepare",
        recommendedActionScope: { changeId: "member-discount" },
        artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
        nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
      },
    } as const;

    const [item] = attachGoalLoopFeedbackActions([currentGate], workpad as never);

    expect(item.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.plan.prepare" }),
      expect.objectContaining({
        kind: "feedback",
        actionType: "planning.goal-loop.feedback.evaluate",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopContinuationBriefId: "goal-loop-continuation-brief-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      }),
    ]));
  });

  it("projects goal loop controller refresh as a secondary action on the matching current gate", async () => {
    const currentGate = {
      id: "confirm:scheduler-worker:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      summary: "启动第一个 worker。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只启动指定 worker。",
      riskSummary: "用户仍可要求主 Agent 修正建议。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-first:member-discount",
        label: "启动第一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        recommendedActionType: "planning.scheduler.worker.start-first",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
        },
        artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
        nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
      },
    } as const;

    const [item] = attachGoalLoopControllerRefreshActions([currentGate], workpad as never);

    expect(item.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.worker.start-first" }),
      expect.objectContaining({
        kind: "workflow-action",
        actionType: "planning.goal-loop.controller.refresh",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopContinuationBriefId: "goal-loop-continuation-brief-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        requiresConfirmation: true,
      }),
    ]));
  });

  it("projects goal loop gate readiness preflight as a secondary action on the matching current gate", async () => {
    const currentGate = {
      id: "confirm:scheduler-worker:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      summary: "启动第一个 worker。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只启动指定 worker。",
      riskSummary: "用户仍可要求主 Agent 修正建议。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-first:member-discount",
        label: "启动第一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        controllerPolicyId: "goal-loop-controller-policy-1",
        controllerVerdict: "recommend-existing-gate",
        controllerGateStatus: "matches-current-gate",
        recommendedActionType: "planning.scheduler.worker.start-first",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
        },
        artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
        nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
        controllerArtifact: "harness/changes/active/member-discount/goal-loop/controller.json",
      },
    } as const;

    const [item] = attachGoalLoopGateReadinessActions([currentGate], workpad as never);

    expect(item.primary).toBe(true);
    expect(item.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.worker.start-first" }),
      expect.objectContaining({
        kind: "workflow-action",
        actionType: "planning.goal-loop.gate-readiness.prepare",
        changeId: "member-discount",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        requiresConfirmation: true,
      }),
    ]));
  });

  it("projects controlled scheduler step instead of duplicate concrete action when preflight evidence is ready", async () => {
    const currentGate = {
      id: "confirm:scheduler-worker:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      summary: "启动第一个 worker。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只启动指定 worker。",
      riskSummary: "用户仍可要求主 Agent 修正建议。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-first:member-discount",
        label: "启动第一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        controllerPolicyId: "goal-loop-controller-policy-1",
        gateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
        controllerVerdict: "recommend-existing-gate",
        controllerGateStatus: "matches-current-gate",
        recommendedActionType: "planning.scheduler.worker.start-first",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
        },
        artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
        nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
        controllerArtifact: "harness/changes/active/member-discount/goal-loop/controller.json",
        gateReadinessPreflightArtifact: "harness/changes/active/member-discount/goal-loop/preflight.json",
      },
    } as const;

    const [item] = attachGoalLoopAssistedConcreteGateActions([currentGate], workpad as never);
    const assistedAction = item.actions.find((action) => action.goalLoopGateReadinessPreflightId === "goal-loop-gate-readiness-preflight-1");

    expect(assistedAction).toMatchObject({
      kind: "workflow-action",
      actionType: "planning.scheduler.controlled-step.run",
      label: schedulerUserFacingActionCopy("planning.scheduler.controlled-step.run").label,
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopGateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      requiresConfirmation: true,
    });
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.worker.start-first")).toBe(false);
    expect(item.actions.some((action) => action.actionType === "planning.goal-loop.gate.invoke")).toBe(false);
  });

  it("projects controlled scheduler start-next with all scoped ids and no duplicate concrete action", async () => {
    const currentGate = {
      id: "confirm:scheduler-worker-next:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-2",
      summary: "启动下一个 worker。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只启动指定 next worker。",
      riskSummary: "不会自动启动后续 validation/audit。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-next:member-discount",
        label: "启动下一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-next",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-next",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        controllerPolicyId: "goal-loop-controller-policy-1",
        gateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
        controllerVerdict: "recommend-existing-gate",
        controllerGateStatus: "matches-current-gate",
        recommendedActionType: "planning.scheduler.worker.start-next",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
          reservationIntentId: "reservation-intent-2",
          claimIntentId: "claim-2",
        },
        artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
        nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
        controllerArtifact: "harness/changes/active/member-discount/goal-loop/controller.json",
        gateReadinessPreflightArtifact: "harness/changes/active/member-discount/goal-loop/preflight.json",
      },
    } as const;

    const [item] = attachGoalLoopAssistedConcreteGateActions([currentGate], workpad as never);
    const assistedAction = item.actions.find((action) => action.goalLoopGateReadinessPreflightId === "goal-loop-gate-readiness-preflight-1");

    expect(assistedAction).toMatchObject({
      kind: "workflow-action",
      actionType: "planning.scheduler.controlled-step.run",
      label: schedulerUserFacingActionCopy("planning.scheduler.controlled-step.run").label,
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-2",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopGateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      requiresConfirmation: true,
    });
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.worker.start-next")).toBe(false);
    expect(item.actions.filter((action) => action.actionType === "planning.scheduler.controlled-step.run")).toHaveLength(1);
    expect(item.actions.some((action) => action.actionType === "planning.goal-loop.gate.invoke")).toBe(false);
  });

  it("projects controlled scheduler advance as the single executable scheduler gate without old Goal Loop evidence ids", async () => {
    const currentGate = {
      id: "confirm:scheduler-worker-next:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-2",
      summary: "启动下一个 worker。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只启动指定 next worker。",
      riskSummary: "不会自动启动后续 validation/audit。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-next:member-discount",
        label: "启动下一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-next",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
        enabled: true,
        requiresConfirmation: true,
      }, {
        id: "workflow:planning.goal-loop.feedback.evaluate:packet-old",
        label: "修正 Goal Loop 建议",
        kind: "feedback",
        actionType: "planning.goal-loop.feedback.evaluate",
        changeId: "member-discount",
        goalLoopNextStepPacketId: "packet-old",
        enabled: true,
        requiresConfirmation: false,
      }],
      primary: true,
      status: "pending",
    } as const;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate]);
    const advanceCopy = schedulerUserFacingActionCopy("planning.scheduler.controlled-advance.run");

    expect(item).toMatchObject({
      summary: advanceCopy.summary,
      whyNeedsConfirmation: advanceCopy.whyNeedsConfirmation,
      confirmEffect: advanceCopy.confirmEffect,
      riskSummary: advanceCopy.riskSummary,
    });

    expect(item.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.goal-loop.feedback.evaluate" }),
      expect.objectContaining({
        kind: "workflow-action",
        actionType: "planning.scheduler.controlled-advance.run",
        label: advanceCopy.label,
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        requiresConfirmation: true,
      }),
    ]));
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.worker.start-next")).toBe(false);
    const advance = item.actions.find((action) => action.actionType === "planning.scheduler.controlled-advance.run");
    expect(advance?.goalLoopNextStepPacketId).toBeUndefined();
    expect(advance?.goalLoopControllerPolicyId).toBeUndefined();
    expect(advance?.goalLoopGateReadinessPreflightId).toBeUndefined();
    expect(item.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);
  });

  it("does not project Goal Loop-assisted start-next when reservation intent scope mismatches", async () => {
    const currentGate = {
      id: "confirm:scheduler-worker-next:member-discount:other",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      reservationIntentId: "reservation-intent-other",
      claimIntentId: "claim-2",
      summary: "启动另一个 next worker。",
      whyNeedsConfirmation: "目标必须匹配。",
      confirmEffect: "只启动指定 next worker。",
      riskSummary: "不匹配时不能使用 Goal Loop assistance。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-next:member-discount:other",
        label: "启动下一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-next",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-other",
        claimIntentId: "claim-2",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-next",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        controllerPolicyId: "goal-loop-controller-policy-1",
        gateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
        controllerVerdict: "recommend-existing-gate",
        controllerGateStatus: "matches-current-gate",
        recommendedActionType: "planning.scheduler.worker.start-next",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
          reservationIntentId: "reservation-intent-2",
          claimIntentId: "claim-2",
        },
      },
    } as const;

    const [item] = attachGoalLoopAssistedConcreteGateActions([currentGate], workpad as never);

    expect(item.actions.some((action) => action.goalLoopGateReadinessPreflightId === "goal-loop-gate-readiness-preflight-1")).toBe(false);
    expect(item.actions).toHaveLength(1);
  });

  it("does not project Goal Loop secondary or assisted actions beside a disabled matching concrete gate", async () => {
    const disabledGate = {
      id: "confirm:scheduler-worker:member-discount:disabled",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      summary: "启动第一个 worker。",
      whyNeedsConfirmation: "这是当前可见但不可用的 Harness gate。",
      confirmEffect: "禁用时不能执行。",
      riskSummary: "Goal Loop 不能为 disabled gate 补出 enabled affordance。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-first:member-discount:disabled",
        label: "启动第一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: false,
        requiresConfirmation: true,
        disabledReason: "Stale target.",
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        controllerPolicyId: "goal-loop-controller-policy-1",
        gateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
        controllerVerdict: "recommend-existing-gate",
        controllerGateStatus: "matches-current-gate",
        recommendedActionType: "planning.scheduler.worker.start-first",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
        },
        artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
        nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
        controllerArtifact: "harness/changes/active/member-discount/goal-loop/controller.json",
        gateReadinessPreflightArtifact: "harness/changes/active/member-discount/goal-loop/preflight.json",
      },
    } as const;

    const [feedbackItem] = attachGoalLoopFeedbackActions([disabledGate], workpad as never);
    const [controllerItem] = attachGoalLoopControllerRefreshActions([disabledGate], workpad as never);
    const [readinessItem] = attachGoalLoopGateReadinessActions([disabledGate], workpad as never);
    const [assistedItem] = attachGoalLoopAssistedConcreteGateActions([disabledGate], workpad as never);

    expect(feedbackItem.actions.some((action) => action.actionType === "planning.goal-loop.feedback.evaluate")).toBe(false);
    expect(controllerItem.actions.some((action) => action.actionType === "planning.goal-loop.controller.refresh")).toBe(false);
    expect(readinessItem.actions.some((action) => action.actionType === "planning.goal-loop.gate-readiness.prepare")).toBe(false);
    expect(assistedItem.actions.some((action) => action.goalLoopGateReadinessPreflightId === "goal-loop-gate-readiness-preflight-1")).toBe(false);
    expect(feedbackItem.actions).toHaveLength(1);
    expect(controllerItem.actions).toHaveLength(1);
    expect(readinessItem.actions).toHaveLength(1);
    expect(assistedItem.actions).toHaveLength(1);
  });

  it("does not project goal loop feedback on a same-action gate with mismatched target scope", async () => {
    const currentGate = {
      id: "confirm:scheduler-worker:member-discount:other",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-other",
      summary: "启动其他 worker。",
      whyNeedsConfirmation: "这是另一个 Harness gate。",
      confirmEffect: "只启动指定 worker。",
      riskSummary: "目标必须匹配。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.worker.start-first:member-discount:other",
        label: "启动第一个 worker",
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-other",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;
    const workpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        enabled: true,
        requiresConfirmation: true,
      },
      goalLoop: {
        id: "goal-loop-continuation-brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "goal-loop-decision-1",
        goalLoopIterationId: "goal-loop-iteration-1",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        recommendedActionType: "planning.scheduler.worker.start-first",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
        },
        artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
        nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
      },
    } as const;

    const [item] = attachGoalLoopFeedbackActions([currentGate], workpad as never);

    expect(item.actions.some((action) => action.actionType === "planning.goal-loop.feedback.evaluate")).toBe(false);
    const [controllerItem] = attachGoalLoopControllerRefreshActions([currentGate], workpad as never);
    expect(controllerItem.actions.some((action) => action.actionType === "planning.goal-loop.controller.refresh")).toBe(false);
  });


  it("keeps scheduler terminal handoff prompt evidence compact and terminal-state matched", () => {
    const section = {
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      routingPosture: "blocked-or-rework",
      routingLabel: "Blocked or bounded rework",
      schedulerExecutionMode: "blocked-or-waiting",
      controlledLoopState: {
        state: "quality-routing",
        phase12aLabel: "reconciling quality/rework evidence",
        summary: "Blocked terminal evidence controls the next step.",
        humanGateRequired: true,
        futureOnlyStates: ["dispatching-approved-scope", "reconciling"],
        loopAuthorized: false,
        fullParallelExecutorAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
        sourceMutationAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
        harnessEvolutionAuthorized: false,
      },
      markdown: "## Goal Loop Next-Step Packet",
    } as SchedulerTerminalHandoffSectionFixture;
    const workpad = {
      goalLoop: {
        changeId: "blocked-change",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        completionStatus: "blocked",
      },
      schedulerRunBlockedCloseout: {
        id: "scheduler-run-closeout-1",
        changeId: "blocked-change",
        schedulerRunId: "scheduler-run-1",
        status: "blocked",
        reason: "candidate-blocked",
        closeoutReason: "Candidate cannot proceed to IntegrationCheck.",
        readyCount: 1,
        blockedCount: 1,
        readyWorktreeIds: ["worktree-a"],
        blockedReasons: ["candidate blocked"],
        unstartedReservedIntentIds: ["intent-2"],
        sourceMutated: false,
        executionStarted: false,
        artifact: "harness/changes/active/blocked-change/scheduler-runtime/closeout.json",
        markdownArtifact: "harness/changes/active/blocked-change/scheduler-runtime/closeout.md",
      },
    };

    const blockedHandoff = buildSchedulerTerminalHandoffContext(workpad as never, section);
    expect(blockedHandoff).toEqual(expect.objectContaining({
      authority: "non-executing-scheduler-terminal-handoff-prompt-evidence",
      kind: "blocked-closeout",
      id: "scheduler-run-closeout-1",
      changeId: "blocked-change",
      schedulerRunId: "scheduler-run-1",
      status: "blocked",
      blockedReason: "candidate-blocked",
      readyCount: 1,
      blockedCount: 1,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    }));
    expect(blockedHandoff).not.toHaveProperty("readyWorktreeIds");
    expect(blockedHandoff).not.toHaveProperty("recommendedActionScope");
    expect(blockedHandoff).not.toHaveProperty("actionPayload");
    expect(blockedHandoff).not.toHaveProperty("markdown");

    const compactContext = {
      context: "",
      goalLoopSchedulerTerminalHandoff: blockedHandoff,
    } as Parameters<typeof goalLoopPromptStackLabels>[0];
    expect(goalLoopPromptStackLabels(compactContext)).toContain("goal-loop-scheduler-terminal-handoff");
    const prepared = buildGoalLoopContextPreparedEvidence(compactContext);
    expect(prepared.goalLoopSchedulerTerminalHandoff).toEqual(expect.objectContaining({
      kind: "blocked-closeout",
      id: "scheduler-run-closeout-1",
      loopAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    }));
    expect(prepared.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("readyWorktreeIds");
    expect(prepared.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("scope");
    expect(prepared.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("markdown");

    const nonTerminal = buildSchedulerTerminalHandoffContext({
      ...workpad,
      goalLoop: { ...workpad.goalLoop, completionStatus: "incomplete" },
    } as never, section);
    expect(nonTerminal).toBeUndefined();

    const completionSection = {
      ...section,
      controlledLoopState: {
        ...section.controlledLoopState,
        state: "terminal-handoff",
        phase12aLabel: "terminal handoff",
      },
    } as SchedulerTerminalHandoffSectionFixture;
    const completionHandoff = buildSchedulerTerminalHandoffContext({
      goalLoop: {
        changeId: "completed-change",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-2",
        completionStatus: "ready-for-human-close-gate",
      },
      schedulerRunCompletion: {
        id: "scheduler-run-completion-1",
        changeId: "completed-change",
        schedulerRunId: "scheduler-run-2",
        status: "completed-applied",
        outcomeStatus: "applied",
        integrationCheckStatus: "passed",
        readyCount: 2,
        resultTargetCount: 2,
        outcomeReason: "Integration outcome was applied by the existing apply path.",
        artifact: "harness/changes/active/completed-change/scheduler-runtime/completion.json",
      },
    } as never, completionSection);
    expect(completionHandoff).toEqual(expect.objectContaining({
      kind: "completion",
      id: "scheduler-run-completion-1",
      status: "completed-applied",
      outcomeStatus: "applied",
      integrationCheckStatus: "passed",
      readyCount: 2,
      resultTargetCount: 2,
      applyAuthorized: false,
      closeAuthorized: false,
    }));
    expect(completionHandoff).not.toHaveProperty("resultTargetWorktreeIds");
    expect(completionHandoff).not.toHaveProperty("worktreeIds");
  });

});

function expectQueueItemUserCopyNotToContainInternalTerms(
  item: { summary: string; whyNeedsConfirmation: string; confirmEffect: string; riskSummary: string } | null | undefined,
  forbiddenTerms: string[],
): void {
  expect(item).toBeTruthy();
  const visibleCopy = [item?.summary, item?.whyNeedsConfirmation, item?.confirmEffect, item?.riskSummary].join("\n");
  expectUserCopyNotToContainInternalTerms(visibleCopy, forbiddenTerms);
}

function expectUserCopyNotToContainInternalTerms(copy: string, forbiddenTerms: string[]): void {
  for (const term of forbiddenTerms) {
    expect(copy).not.toContain(term);
  }
}
