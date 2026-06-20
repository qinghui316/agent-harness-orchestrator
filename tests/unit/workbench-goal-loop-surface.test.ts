import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic } from "../../src/workbench/chat.js";
import { buildChatContext, buildOrchestratorContext } from "../../src/workbench/codex-chat/context.js";
import { buildControlledSchedulerNextCandidatePromptEvidence, buildSchedulerTerminalHandoffContext } from "../../src/workbench/codex-chat/goal-loop-context.js";
import { buildGoalLoopContextPreparedEvidence, goalLoopPromptStackLabels } from "../../src/workbench/codex-chat/goal-loop-prompt-evidence.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { buildControlledSchedulerWorkpadReconfirmation } from "../../src/workbench/projections/read-model/confirmation/controlled-scheduler-reconfirmation.js";
import { attachControlledSchedulerAdvanceActions, attachGoalLoopAssistedConcreteGateActions, attachGoalLoopControllerRefreshActions, attachGoalLoopFeedbackActions, attachGoalLoopGateReadinessActions } from "../../src/workbench/projections/read-model/confirmation/goal-loop.js";
import { buildControlledSchedulerNextCandidate } from "../../src/workbench/projections/read-model/goal-loop-next-candidate.js";
import { schedulerControlledAdvanceCopy, schedulerUserFacingActionCopy } from "../../src/workbench/projections/read-model/confirmation/scheduler-user-surface.js";
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
    const advanceCopy = schedulerControlledAdvanceCopy({ currentGateActionType: "planning.scheduler.worker.start-next" });

    expect(item).toMatchObject({
      summary: advanceCopy.summary,
      whyNeedsConfirmation: advanceCopy.whyNeedsConfirmation,
      confirmEffect: advanceCopy.confirmEffect,
      riskSummary: advanceCopy.riskSummary,
    });
    expect(item.summary).toContain("继续执行下一个任务");
    expect(item.confirmEffect).toContain("继续执行下一个任务");

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

  it("uses refreshed concrete-step reconfirmation copy for controlled scheduler advance when current gate readiness matches", async () => {
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
        goalLoopNextStepPacketId: "packet-old",
        goalLoopControllerPolicyId: "policy-old",
        goalLoopGateReadinessPreflightId: "preflight-old",
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
      },
      goalLoop: {
        id: "brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "decision-1",
        goalLoopIterationId: "iteration-1",
        goalLoopNextStepPacketId: "packet-1",
        controllerPolicyId: "policy-1",
        gateReadinessPreflightId: "preflight-1",
        controlledSchedulerNextCandidate: {
          status: "ready-for-confirmation",
          label: "下一步候选已刷新",
          body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: true,
          humanConfirmationStillRequired: true,
          evidenceRefs: [
            "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md",
            "harness/changes/active/member-discount/planning/goal-loop-controller-policies/policy.md",
            "harness/changes/active/member-discount/planning/goal-loop-gate-readiness-preflights/preflight.md",
          ],
        },
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
      controlledSchedulerStepReceipt: {
        status: "ready-for-confirmation",
        label: "已完成一个受控步骤",
        body: "本次执行：继续执行下一个任务。下一步候选：继续执行下一个任务。当前步骤检查已刷新。 继续前仍需要你再次确认。",
        executedStepLabel: "继续执行下一个任务",
        nextStepLabel: "继续执行下一个任务",
        readinessLabel: "当前步骤检查已刷新。",
        boundary: "已主动停止；是否继续仍需要你重新确认下一步。",
        humanConfirmationStillRequired: true,
        evidenceRefs: ["harness/workbench/decisions/controlled-advance-1.json"],
        decisionId: "decision-controlled-advance-1",
        updatedAt: "2026-06-20T12:00:00.000Z",
      },
    } as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate], workpad);
    const reconfirmCopy = schedulerControlledAdvanceCopy({
      currentGateActionType: "planning.scheduler.worker.start-next",
      refreshed: true,
    });

    expect(item).toMatchObject({
      summary: reconfirmCopy.summary,
      whyNeedsConfirmation: reconfirmCopy.whyNeedsConfirmation,
      confirmEffect: reconfirmCopy.confirmEffect,
      riskSummary: reconfirmCopy.riskSummary,
    });
    expect(item.summary).toContain("已刷新");
    expect(item.summary).toContain("新的单步确认");
    expect(item.summary).toContain("继续执行下一个任务");
    expect(item.confirmEffect).toContain("继续执行下一个任务");
    expect(item.whyNeedsConfirmation).toContain("不是自动继续");
    expect(item.summary).not.toContain("上一个受控步骤");
    expect(item.evidenceRefs).toEqual([
      "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md",
      "harness/changes/active/member-discount/planning/goal-loop-controller-policies/policy.md",
      "harness/changes/active/member-discount/planning/goal-loop-gate-readiness-preflights/preflight.md",
    ]);
    expect(item.controlledSchedulerNextCandidate).toEqual(expect.objectContaining({
      status: "ready-for-confirmation",
      label: "下一步候选已刷新",
      actionLabel: "继续执行下一个任务",
      readinessEvidencePrepared: true,
      humanConfirmationStillRequired: true,
    }));
    expect(item.controlledSchedulerNextCandidate?.evidenceRefs).toEqual(item.evidenceRefs);
    expect(item.controlledSchedulerReconfirmation).toMatchObject({
      status: "aligned",
      label: "当前步骤可以重新确认",
      lastStoppedStepLabel: "继续执行下一个任务",
      currentStepLabel: "继续执行下一个任务",
      freshnessLabel: "上一步停止记录、下一步候选和当前确认目标一致。",
    });
    expect(item.controlledSchedulerReconfirmation?.body).toContain("上一步已停止");
    expect(item.controlledSchedulerReconfirmation?.body).toContain("当前重新确认目标是“继续执行下一个任务”");
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.worker.start-next")).toBe(false);
    const advance = item.actions.find((action) => action.actionType === "planning.scheduler.controlled-advance.run");
    expect(advance).toMatchObject({
      id: "workflow:planning.scheduler.controlled-advance.run:member-discount:planning.scheduler.worker.start-next:preflight-old",
      label: reconfirmCopy.label,
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-2",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      requiresConfirmation: true,
    });
    expect(advance?.goalLoopNextStepPacketId).toBeUndefined();
    expect(advance?.goalLoopControllerPolicyId).toBeUndefined();
    expect(advance?.goalLoopGateReadinessPreflightId).toBeUndefined();
    expect(item.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);
  });

  it("keeps controlled scheduler advance executable unchanged while surfacing stale reconfirmation mismatch", async () => {
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
      },
      goalLoop: {
        id: "brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "decision-1",
        goalLoopIterationId: "iteration-1",
        goalLoopNextStepPacketId: "packet-1",
        controllerPolicyId: "policy-1",
        gateReadinessPreflightId: "preflight-1",
        controlledSchedulerNextCandidate: {
          status: "ready-for-confirmation",
          label: "下一步候选已刷新",
          body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: true,
          humanConfirmationStillRequired: true,
          evidenceRefs: ["candidate.md"],
        },
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
      controlledSchedulerStepReceipt: {
        status: "ready-for-confirmation",
        label: "已完成一个受控步骤",
        body: "本次执行：检查当前结果。下一步候选：检查当前结果。当前步骤检查已刷新。 继续前仍需要你再次确认。",
        executedStepLabel: "检查当前结果",
        nextStepLabel: "检查当前结果",
        readinessLabel: "当前步骤检查已刷新。",
        boundary: "已主动停止；是否继续仍需要你重新确认下一步。",
        humanConfirmationStillRequired: true,
        evidenceRefs: ["receipt.md"],
        decisionId: "decision-controlled-advance-1",
        updatedAt: "2026-06-20T12:00:00.000Z",
      },
    } as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate], workpad);

    expect(item.controlledSchedulerReconfirmation).toMatchObject({
      status: "stale-mismatch",
      label: "重新确认前需要复核",
      lastStoppedStepLabel: "检查当前结果",
      currentStepLabel: "继续执行下一个任务",
      freshnessLabel: "上一步停止记录与当前目标不一致。",
    });
    expect(item.controlledSchedulerReconfirmation?.body).toContain("但当前确认目标是“继续执行下一个任务”");
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.worker.start-next")).toBe(false);
    expect(item.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);
  });

  it("treats same-label different scheduler targets as stale reconfirmation mismatch", async () => {
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
      },
      goalLoop: {
        id: "brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "decision-1",
        goalLoopIterationId: "iteration-1",
        goalLoopNextStepPacketId: "packet-1",
        controllerPolicyId: "policy-1",
        gateReadinessPreflightId: "preflight-1",
        controlledSchedulerNextCandidate: {
          status: "ready-for-confirmation",
          label: "下一步候选已刷新",
          body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: true,
          humanConfirmationStillRequired: true,
          evidenceRefs: ["candidate.md"],
        },
        controllerVerdict: "recommend-existing-gate",
        controllerGateStatus: "matches-current-gate",
        recommendedActionType: "planning.scheduler.worker.start-first",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
          reservationIntentId: "reservation-intent-2",
          claimIntentId: "claim-2",
        },
      },
      controlledSchedulerStepReceipt: {
        status: "ready-for-confirmation",
        label: "已完成一个受控步骤",
        body: "本次执行：继续执行下一个任务。下一步候选：继续执行下一个任务。当前步骤检查已刷新。 继续前仍需要你再次确认。",
        executedStepLabel: "继续执行下一个任务",
        nextStepLabel: "继续执行下一个任务",
        readinessLabel: "当前步骤检查已刷新。",
        boundary: "已主动停止；是否继续仍需要你重新确认下一步。",
        humanConfirmationStillRequired: true,
        evidenceRefs: ["receipt.md"],
        decisionId: "decision-controlled-advance-1",
        updatedAt: "2026-06-20T12:00:00.000Z",
      },
    } as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate], workpad);

    expect(item.controlledSchedulerReconfirmation).toMatchObject({
      status: "stale-mismatch",
      label: "重新确认前需要复核",
      currentStepLabel: "继续执行下一个任务",
      freshnessLabel: "下一步候选与当前目标不一致。",
    });
    expect(item.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);
  });

  it("surfaces missing receipt, receipt review, and cross-change mismatch states without changing controlled advance action exposure", async () => {
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
      }],
      primary: true,
      status: "pending",
    } as const;
    const baseWorkpad = {
      nextAction: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-next",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
      },
      goalLoop: {
        id: "brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "decision-1",
        goalLoopIterationId: "iteration-1",
        goalLoopNextStepPacketId: "packet-1",
        controllerPolicyId: "policy-1",
        gateReadinessPreflightId: "preflight-1",
        controlledSchedulerNextCandidate: {
          status: "ready-for-confirmation",
          label: "下一步候选已刷新",
          body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: true,
          humanConfirmationStillRequired: true,
          evidenceRefs: ["candidate.md"],
        },
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
    };

    const [missingReceiptItem] = attachControlledSchedulerAdvanceActions(
      [currentGate],
      baseWorkpad as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>,
    );
    expect(missingReceiptItem.controlledSchedulerReconfirmation).toMatchObject({
      status: "missing-receipt",
      currentStepLabel: "继续执行下一个任务",
      freshnessLabel: "缺少上一步停止记录。",
    });
    expect(missingReceiptItem.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);

    const [needsReviewItem] = attachControlledSchedulerAdvanceActions(
      [currentGate],
      {
        ...baseWorkpad,
        controlledSchedulerStepReceipt: {
          status: "needs-review",
          label: "已完成一个受控步骤",
          body: "本次执行：继续执行下一个任务。下一步候选：继续执行下一个任务。当前步骤检查还需要复核。 继续前仍需要你再次确认。",
          executedStepLabel: "继续执行下一个任务",
          nextStepLabel: "继续执行下一个任务",
          readinessLabel: "当前步骤检查还需要复核。",
          boundary: "已主动停止；是否继续仍需要你重新确认下一步。",
          humanConfirmationStillRequired: true,
          evidenceRefs: ["receipt.md"],
          decisionId: "decision-controlled-advance-1",
          updatedAt: "2026-06-20T12:00:00.000Z",
        },
      } as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>,
    );
    expect(needsReviewItem.controlledSchedulerReconfirmation).toMatchObject({
      status: "needs-review",
      currentStepLabel: "继续执行下一个任务",
      freshnessLabel: "上一步停止记录还需要复核。",
    });
    expect(needsReviewItem.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);

    const [crossChangeItem] = attachControlledSchedulerAdvanceActions(
      [currentGate],
      {
        ...baseWorkpad,
        goalLoop: {
          ...baseWorkpad.goalLoop,
          changeId: "other-change",
          recommendedActionScope: {
            ...baseWorkpad.goalLoop.recommendedActionScope,
            changeId: "other-change",
          },
        },
        controlledSchedulerStepReceipt: {
          status: "ready-for-confirmation",
          label: "已完成一个受控步骤",
          body: "本次执行：继续执行下一个任务。下一步候选：继续执行下一个任务。当前步骤检查已刷新。 继续前仍需要你再次确认。",
          executedStepLabel: "继续执行下一个任务",
          nextStepLabel: "继续执行下一个任务",
          readinessLabel: "当前步骤检查已刷新。",
          boundary: "已主动停止；是否继续仍需要你重新确认下一步。",
          humanConfirmationStillRequired: true,
          evidenceRefs: ["receipt.md"],
          decisionId: "decision-controlled-advance-1",
          updatedAt: "2026-06-20T12:00:00.000Z",
        },
      } as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>,
    );
    expect(crossChangeItem.controlledSchedulerReconfirmation).toMatchObject({
      status: "stale-mismatch",
      currentStepLabel: "继续执行下一个任务",
      freshnessLabel: "下一步候选与当前目标不一致。",
    });
    expect(crossChangeItem.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);
  });

  it("derives Workpad controlled scheduler reconfirmation only from the current scoped next action", () => {
    type WorkpadReconfirmationInput = Parameters<typeof buildControlledSchedulerWorkpadReconfirmation>[0];
    const baseWorkpad = {
      nextAction: {
        id: "next:planning.scheduler.worker.start-next:member-discount",
        label: "继续执行下一个任务",
        description: "继续一个受控步骤。",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.worker.start-next",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
      },
      goalLoop: {
        id: "brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "decision-1",
        goalLoopIterationId: "iteration-1",
        goalLoopNextStepPacketId: "packet-1",
        controllerPolicyId: "policy-1",
        gateReadinessPreflightId: "preflight-1",
        controlledSchedulerNextCandidate: {
          status: "ready-for-confirmation",
          label: "下一步候选已刷新",
          body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: true,
          humanConfirmationStillRequired: true,
          evidenceRefs: ["candidate.md"],
        },
        recommendedActionType: "planning.scheduler.worker.start-next",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
          reservationIntentId: "reservation-intent-2",
          claimIntentId: "claim-2",
        },
      },
      controlledSchedulerStepReceipt: {
        status: "ready-for-confirmation",
        label: "已完成一个受控步骤",
        body: "本次执行：继续执行下一个任务。下一步候选：继续执行下一个任务。当前步骤检查已刷新。 继续前仍需要你再次确认。",
        executedStepLabel: "继续执行下一个任务",
        nextStepLabel: "继续执行下一个任务",
        readinessLabel: "当前步骤检查已刷新。",
        boundary: "已主动停止；是否继续仍需要你重新确认下一步。",
        humanConfirmationStillRequired: true,
        evidenceRefs: ["receipt.md"],
        decisionId: "decision-controlled-advance-1",
        updatedAt: "2026-06-20T12:00:00.000Z",
      },
      schedulerControlledStepEvidence: {
        id: "controlled-step-1",
        changeId: "member-discount",
        executedActionType: "planning.scheduler.worker.start-next",
        controlledLoopStopSummary: {
          authority: "scheduler-runtime-controlled-loop-stop-summary",
          executedActionType: "planning.scheduler.worker.start-next",
          stopReason: "one-confirmed-scheduler-transition-completed",
          routePosture: "awaiting-human-gate",
          continuationReadinessStatus: "ready-for-human-gate",
          nextGateActionType: "planning.scheduler.worker.start-next",
          humanGateRequired: true,
          readinessEvidencePrepared: true,
          needsReevaluation: false,
          humanConfirmationStillRequired: true,
          userFacingReason: "当前步骤检查已刷新。",
          boundary: "只读停止摘要。",
          evidenceRefs: ["stop-summary.md"],
          executionStarted: false,
          loopAuthorized: false,
          fullParallelExecutorAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          mergeAuthorized: false,
          remoteLandingAuthorized: false,
          harnessEvolutionAuthorized: false,
        },
      },
    } as const;
    const asInput = (workpad: unknown): WorkpadReconfirmationInput => workpad as WorkpadReconfirmationInput;

    const aligned = buildControlledSchedulerWorkpadReconfirmation(asInput(baseWorkpad));
    expect(aligned).toMatchObject({
      status: "aligned",
      label: "当前步骤可以重新确认",
      currentStepLabel: "继续执行下一个任务",
      freshnessLabel: "上一步停止记录、下一步候选和当前确认目标一致。",
      stopPosture: {
        authority: "non-executing-controlled-scheduler-stop-posture",
        status: "aligned",
        executedStepLabel: "继续执行下一个任务",
        nextStepLabel: "继续执行下一个任务",
        readinessLabel: "当前步骤检查已准备好",
        humanConfirmationStillRequired: true,
        executionStarted: false,
        loopAuthorized: false,
        sourceMutationAuthorized: false,
        closeAuthorized: false,
        harnessEvolutionAuthorized: false,
      },
    });
    expect(aligned?.stopPosture?.body).toContain("停止原因是“已完成一次确认的调度步骤并主动停止”");
    expect(aligned?.stopPosture?.evidenceRefs).toEqual(expect.arrayContaining(["candidate.md", "receipt.md", "stop-summary.md"]));

    const crossChange = buildControlledSchedulerWorkpadReconfirmation(asInput({
      ...baseWorkpad,
      goalLoop: {
        ...baseWorkpad.goalLoop,
        changeId: "other-change",
        recommendedActionScope: {
          ...baseWorkpad.goalLoop.recommendedActionScope,
          changeId: "other-change",
        },
      },
    }));
    expect(crossChange).toMatchObject({
      status: "stale-mismatch",
      freshnessLabel: "下一步候选与当前目标不一致。",
    });
    expect(crossChange?.stopPosture).toBeUndefined();

    expect(buildControlledSchedulerWorkpadReconfirmation(asInput({
      ...baseWorkpad,
      schedulerControlledStepEvidence: {
        ...baseWorkpad.schedulerControlledStepEvidence,
        controlledLoopStopSummary: {
          ...baseWorkpad.schedulerControlledStepEvidence.controlledLoopStopSummary,
          nextGateActionType: "planning.scheduler.worker.reconcile-result",
        },
      },
    }))?.stopPosture).toBeUndefined();

    expect(buildControlledSchedulerWorkpadReconfirmation(asInput({
      ...baseWorkpad,
      goalLoop: undefined,
    }))).toBeUndefined();

    expect(buildControlledSchedulerWorkpadReconfirmation(asInput({
      ...baseWorkpad,
      nextAction: {
        ...baseWorkpad.nextAction,
        reservationIntentId: undefined,
      },
    }))).toBeUndefined();

    expect(buildControlledSchedulerWorkpadReconfirmation(asInput({
      ...baseWorkpad,
      nextAction: {
        ...baseWorkpad.nextAction,
        enabled: false,
      },
    }))).toBeUndefined();
  });

  it("derives sanitized routing posture copy for controlled scheduler next-candidate detail", () => {
    const candidate = buildControlledSchedulerNextCandidate({
      id: "brief-1",
      changeId: "member-discount",
      goalLoopDecisionId: "decision-1",
      goalLoopIterationId: "iteration-1",
      goalLoopNextStepPacketId: "packet-1",
      iterationOrdinal: 1,
      decisionKind: "current-gate-ready",
      continuationVerdict: "continue",
      continuationState: "ready-for-existing-gate",
      recommendationState: "recommend-existing-gate",
      summary: "Goal Loop recommends the current scoped worker gate.",
      recommendedActionType: "planning.scheduler.worker.start-next",
      recommendedActionScope: {
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
      },
      recommendedActionReason: "Recommended action planning.scheduler.worker.start-next is limited to the existing scoped first worker-start gate.",
      separateGateRequired: true,
      humanGateRequired: true,
      conflictLevel: "low",
      parallelEligible: true,
      routingPosture: "single-worker-gate",
      routingLabel: "Single scoped worker gate",
      schedulerExecutionMode: {
        authority: "non-executing-scheduler-execution-mode-evidence",
        mode: "single-gate-staged",
        loopAuthorized: false,
        fullParallelExecutorAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          separateHumanGateRequired: true,
        },
        humanGateRequired: true,
        summary: "The scheduler path is still a single-gate staged capability.",
        reasons: [
          "planning.scheduler.worker.start-next must be revalidated and confirmed as its own concrete Harness gate.",
        ],
        futureLoopRequirements: [
          "accepted architecture decision for a real scheduler loop or full parallel executor",
          "IntegrationCheck before any source apply path",
        ],
      },
      conflictReasons: [
        "planning.scheduler.worker.start-next is the current existing scoped worker gate; parallel eligibility is limited to this single human-confirmed transition.",
      ],
      completionStatus: "incomplete",
      resumePreconditionCount: 0,
      revalidationChecklistCount: 1,
      sourceEvidenceCount: 1,
      stalenessInstruction: "re-read current evidence",
      nextStepPacketArtifact: "packet.json",
      controllerPolicyId: "policy-1",
      controllerVerdict: "recommend-existing-gate",
      controllerGateStatus: "matches-current-gate",
      controllerArtifact: "policy.json",
      gateReadinessPreflightId: "preflight-1",
      gateReadinessPreflightArtifact: "preflight.json",
      updatedAt: "2026-06-20T12:00:00.000Z",
      executionStarted: false,
    });

    expect(candidate).toMatchObject({
      status: "ready-for-confirmation",
      label: "下一步候选已刷新",
      actionLabel: "继续执行下一个任务",
      routingPosture: {
        label: "低冲突，仍需单步确认",
        body: "当前证据只支持继续一个已限定范围的任务步骤；可以评估低冲突并行，但本次仍只确认这一步。",
        boundary: "调度能力仍是单步受控：不会自动循环、整批派发、分配资源槽或启动完整并行执行器。",
        reasons: [
          "继续执行下一个任务是当前已限定范围的步骤；即使冲突较低，也只允许这一次人工确认。",
        ],
      },
    });
    const visibleCopy = [
      candidate?.label,
      candidate?.body,
      candidate?.routingPosture?.label,
      candidate?.routingPosture?.body,
      candidate?.routingPosture?.boundary,
      ...(candidate?.routingPosture?.reasons ?? []),
    ].join("\n");
    expect(visibleCopy).not.toContain("planning.scheduler");
    expect(visibleCopy).not.toContain("SchedulerRun");
    expect(visibleCopy.toLowerCase()).not.toContain("worker");
    expect(visibleCopy.toLowerCase()).not.toContain("slot");
    expect(visibleCopy.toLowerCase()).not.toContain("whole-wave");
    expect(visibleCopy.toLowerCase()).not.toContain("start-all");
  });

  it("does not merge next-candidate evidence refs into controlled scheduler advance unless the candidate is ready", async () => {
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
      evidenceRefs: ["existing-evidence.md"],
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
      },
      goalLoop: {
        id: "brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "decision-1",
        goalLoopIterationId: "iteration-1",
        goalLoopNextStepPacketId: "packet-1",
        controllerPolicyId: "policy-1",
        gateReadinessPreflightId: "preflight-1",
        controlledSchedulerNextCandidate: {
          status: "needs-review",
          label: "下一步候选需要复核",
          body: "下一步候选：继续执行下一个任务。当前步骤检查还需要复核。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: false,
          humanConfirmationStillRequired: true,
          evidenceRefs: ["candidate-should-not-be-merged.md"],
        },
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
    } as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate], workpad);

    expect(item.evidenceRefs).toEqual(["existing-evidence.md"]);
    expect(item.evidenceRefs).not.toContain("candidate-should-not-be-merged.md");
    expect(item.controlledSchedulerNextCandidate).toBeUndefined();
  });

  it("does not merge ready next-candidate evidence refs when the refreshed gate does not match", async () => {
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
      evidenceRefs: ["existing-evidence.md"],
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
      },
      goalLoop: {
        id: "brief-1",
        changeId: "member-discount",
        goalLoopDecisionId: "decision-1",
        goalLoopIterationId: "iteration-1",
        goalLoopNextStepPacketId: "packet-1",
        controllerPolicyId: "policy-1",
        gateReadinessPreflightId: "preflight-1",
        controlledSchedulerNextCandidate: {
          status: "ready-for-confirmation",
          label: "下一步候选已刷新",
          body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新，但仍需要人工确认。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: true,
          humanConfirmationStillRequired: true,
          evidenceRefs: ["ready-candidate-should-not-be-merged.md"],
        },
        controllerVerdict: "recommend-existing-gate",
        controllerGateStatus: "stale-current-gate",
        recommendedActionType: "planning.scheduler.worker.start-next",
        recommendedActionScope: {
          changeId: "member-discount",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-reservation-expected",
          reservationIntentId: "reservation-intent-2",
          claimIntentId: "claim-2",
        },
      },
    } as unknown as NonNullable<Parameters<typeof attachControlledSchedulerAdvanceActions>[1]>;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate], workpad);

    expect(item.evidenceRefs).toEqual(["existing-evidence.md"]);
    expect(item.evidenceRefs).not.toContain("ready-candidate-should-not-be-merged.md");
    expect(item.controlledSchedulerNextCandidate).toBeUndefined();
  });

  it("projects controlled scheduler advance with a combined-result step category", async () => {
    const currentGate = {
      id: "confirm:scheduler-integration-candidate:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationCandidateId: "integration-candidate-1",
      summary: "检查组合结果。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只生成 integration candidate evidence。",
      riskSummary: "不会应用或合并。",
      evidenceRefs: [],
      actions: [{
        id: "workflow:planning.scheduler.integration-candidate.compile:member-discount",
        label: "检查组合结果",
        kind: "workflow-action",
        actionType: "planning.scheduler.integration-candidate.compile",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerIntegrationCandidateId: "integration-candidate-1",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate]);
    const advanceCopy = schedulerControlledAdvanceCopy({ currentGateActionType: "planning.scheduler.integration-candidate.compile" });

    expect(item).toMatchObject({
      summary: advanceCopy.summary,
      whyNeedsConfirmation: advanceCopy.whyNeedsConfirmation,
      confirmEffect: advanceCopy.confirmEffect,
      riskSummary: advanceCopy.riskSummary,
    });
    expect(item.summary).toContain("检查组合结果");
    expect(item.confirmEffect).toContain("检查组合结果");
    expect(item.riskSummary).not.toContain("自动应用");
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.integration-candidate.compile")).toBe(false);
    const advance = item.actions.find((action) => action.actionType === "planning.scheduler.controlled-advance.run");
    expect(advance).toMatchObject({
      label: advanceCopy.label,
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationCandidateId: "integration-candidate-1",
      goalLoopCurrentGateActionType: "planning.scheduler.integration-candidate.compile",
      requiresConfirmation: true,
    });
    expect(item.actions.filter((action) => action.actionType === "planning.scheduler.controlled-advance.run")).toHaveLength(1);
  });

  it("falls back to generic controlled advance copy for ambiguous concrete gate categories without changing replacement semantics", async () => {
    const currentGate = {
      id: "confirm:scheduler-ambiguous:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-expected",
      schedulerIntegrationCandidateId: "integration-candidate-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-2",
      summary: "多个候选步骤。",
      whyNeedsConfirmation: "这是当前可见 Harness gate。",
      confirmEffect: "只执行当前步骤。",
      riskSummary: "不会循环。",
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
        id: "workflow:planning.scheduler.integration-candidate.compile:member-discount",
        label: "检查组合结果",
        kind: "workflow-action",
        actionType: "planning.scheduler.integration-candidate.compile",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerIntegrationCandidateId: "integration-candidate-1",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    } as const;

    const [item] = attachControlledSchedulerAdvanceActions([currentGate]);
    const genericCopy = schedulerControlledAdvanceCopy();

    expect(item).toMatchObject({
      summary: genericCopy.summary,
      whyNeedsConfirmation: genericCopy.whyNeedsConfirmation,
      confirmEffect: genericCopy.confirmEffect,
      riskSummary: genericCopy.riskSummary,
    });
    expect(item.summary).not.toContain("继续执行下一个任务");
    expect(item.summary).not.toContain("检查组合结果");
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.worker.start-next")).toBe(false);
    expect(item.actions.some((action) => action.actionType === "planning.scheduler.integration-candidate.compile")).toBe(false);
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

  it("prepares compact controlled scheduler next-candidate prompt evidence only for matching packets", () => {
    const workpad = {
      goalLoop: {
        changeId: "member-discount",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        controlledSchedulerNextCandidate: {
          status: "ready-for-confirmation",
          label: "下一步候选已刷新",
          body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: true,
          humanConfirmationStillRequired: true,
          evidenceRefs: [
            "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md",
            "harness/changes/active/member-discount/planning/goal-loop-controller-policies/policy.md",
          ],
        },
      },
      controlledSchedulerReconfirmation: {
        status: "aligned",
        label: "当前步骤可以重新确认",
        body: "上一步停在“继续执行下一个任务”之后；停止原因是“已完成一次确认的调度步骤并主动停止”。当前继续目标是“继续执行下一个任务”，仍需要你确认。",
        lastStoppedStepLabel: "继续执行下一个任务",
        currentStepLabel: "继续执行下一个任务",
        freshnessLabel: "上一步停止记录、下一步候选和当前确认目标一致。",
        boundary: "这是只读重新确认状态；不会自动继续、批量派发、分配资源、应用源码、关闭需求、远端落地或维护演进。",
        evidenceRefs: ["receipt.md", "stop-summary.md"],
        stopPosture: {
          authority: "non-executing-controlled-scheduler-stop-posture",
          status: "aligned",
          label: "上一步停止状态已对齐",
          body: "上一步停在“继续执行下一个任务”之后；停止原因是“已完成一次确认的调度步骤并主动停止”。当前继续目标是“继续执行下一个任务”，仍需要你确认。",
          executedStepLabel: "继续执行下一个任务",
          stopReasonLabel: "已完成一次确认的调度步骤并主动停止",
          nextStepLabel: "继续执行下一个任务",
          readinessLabel: "当前步骤检查已准备好",
          boundary: "这是只读停止状态摘要；不会自动继续、批量派发、分配资源、应用源码、关闭需求、远端落地或维护演进。",
          evidenceRefs: ["receipt.md", "stop-summary.md"],
          humanConfirmationStillRequired: true,
          executionStarted: false,
          loopAuthorized: false,
          fullParallelExecutorAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          mergeAuthorized: false,
          remoteLandingAuthorized: false,
          harnessEvolutionAuthorized: false,
        },
      },
    };

    const candidate = buildControlledSchedulerNextCandidatePromptEvidence(workpad as never, "goal-loop-next-step-packet-1");

    expect(candidate).toEqual(expect.objectContaining({
      authority: "non-executing-controlled-scheduler-next-candidate-prompt-evidence",
      status: "ready-for-confirmation",
      label: "下一步候选已刷新",
      actionLabel: "继续执行下一个任务",
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
    expect(candidate?.stopPosture).toMatchObject({
      authority: "non-executing-controlled-scheduler-stop-posture",
      label: "上一步停止状态已对齐",
      nextStepLabel: "继续执行下一个任务",
      humanConfirmationStillRequired: true,
      loopAuthorized: false,
      sourceMutationAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
    expect(candidate?.evidenceRefs).toEqual([
      "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md",
      "harness/changes/active/member-discount/planning/goal-loop-controller-policies/policy.md",
    ]);
    expect(candidate).not.toHaveProperty("recommendedActionScope");
    expect(candidate).not.toHaveProperty("actionPayload");
    expect(candidate).not.toHaveProperty("markdown");

    expect(buildControlledSchedulerNextCandidatePromptEvidence(workpad as never, "stale-packet")).toBeUndefined();

    const compactContext = {
      context: "",
      goalLoopControlledSchedulerNextCandidate: candidate,
    } as Parameters<typeof goalLoopPromptStackLabels>[0];
    expect(goalLoopPromptStackLabels(compactContext)).toContain("goal-loop-controlled-scheduler-next-candidate");
    const prepared = buildGoalLoopContextPreparedEvidence(compactContext);
    expect(prepared.goalLoopControlledSchedulerNextCandidate).toEqual(candidate);
    expect(prepared.goalLoopControlledSchedulerNextCandidate?.stopPosture).toEqual(candidate?.stopPosture);
    expect(prepared.goalLoopControlledSchedulerNextCandidate).not.toHaveProperty("recommendedActionScope");
    expect(prepared.goalLoopControlledSchedulerNextCandidate).not.toHaveProperty("markdown");
  });

  it("keeps needs-review controlled scheduler next-candidate prompt evidence explanatory", () => {
    const candidate = buildControlledSchedulerNextCandidatePromptEvidence({
      goalLoop: {
        changeId: "member-discount",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        controlledSchedulerNextCandidate: {
          status: "needs-review",
          label: "下一步候选需要复核",
          body: "下一步候选：继续执行下一个任务。下一步判断已刷新，但当前步骤检查还需要重新评估或查看证据；不会自动继续。",
          actionLabel: "继续执行下一个任务",
          readinessEvidencePrepared: false,
          humanConfirmationStillRequired: true,
          evidenceRefs: ["harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md"],
        },
      },
    } as never, "goal-loop-next-step-packet-1");

    expect(candidate).toEqual(expect.objectContaining({
      status: "needs-review",
      readinessEvidencePrepared: false,
      humanConfirmationStillRequired: true,
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    }));
    expect(candidate?.body).toContain("还需要重新评估或查看证据");
    expect(candidate?.body).toContain("不会自动继续");
    expect(candidate?.body).not.toContain("已准备好");
    expect(candidate?.body).not.toContain("可以执行");
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
