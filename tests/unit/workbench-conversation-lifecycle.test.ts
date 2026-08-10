import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  prepareSkillNativeWorkbenchFixture,
  writeSkillNativeAcceptedSpecAndTasks,
  writeSkillNativeCoderRun,
  writeSkillNativeTaskQueueItemRecord,
  writeSkillNativeTaskQueueRecord,
  writeSkillNativeTaskRunRecord,
  writeSkillNativeWorkflowRunRecord,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchSnapshot, listWorkbenchTopics } from "../../src/workbench/projections/read-model/implementation.js";
import { getTempDir, project } from "../helpers/skill-native-test-environment.js";

describe("workbench conversation lifecycle", () => {
  let fixture: SkillNativeWorkbenchFixture;

  beforeEach(async () => {
    fixture = await prepareSkillNativeWorkbenchFixture({ project: project() });
  });

  afterEach(() => fixture.restoreEnvironment());

  it("abandons an active Workpad without requiring close readiness", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Abandon Workpad" });

    const result = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      abandon: {
        changeId: topic.changeId,
        conversationId: topic.conversationId,
        graphScopeId: `graph:${topic.conversationId}`,
        reason: "用户不需要继续。",
      },
      confirm: true,
    });
    const topics = await listWorkbenchTopics({ project: project(), path: getTempDir() }, "harness");

    expect(result.result).toMatchObject({
      change: expect.objectContaining({ id: topic.changeId, state: "archived" }),
    });
    expect(topics.find((item) => item.id === topic.conversationId)).toMatchObject({ state: "archive" });
  });

  it("projects multiple Workpads with scoped background activity and memory isolation", async () => {
    const selected = await createConversationChangeFixture(project(), { title: "Selected Blocked Workpad" });
    await writeSkillNativeAcceptedSpecAndTasks(fixture, selected.changeId);
    await writeSkillNativeTaskQueueRecord(fixture, selected.changeId, "queue-selected", "blocked", {
      currentTaskId: "T-001",
      totalCount: 1,
      blockedReason: "T-001: Audit blocked.",
    });
    await writeSkillNativeTaskQueueItemRecord(fixture, selected.changeId, "queue-selected", "queue-selected-item-001", "T-001", 1, "blocked", {
      taskRunId: "taskrun-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeSkillNativeTaskRunRecord(fixture, selected.changeId, "taskrun-selected-1", "T-001", "blocked", 1, {
      runId: "run-selected-1",
      worktreeId: "wt-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeSkillNativeCoderRun(fixture, selected.changeId, "run-selected-1", ["T-001"], "wt-selected-1", "completed", "taskrun-selected-1");
    await writeSkillNativeWorkflowRunRecord(fixture, selected.changeId, "blocked", {
      id: "workflow-selected",
      statusReason: "Audit blocked.",
    });

    const background = await createConversationChangeFixture(project(), { title: "Background Running Workpad" });
    await writeSkillNativeAcceptedSpecAndTasks(fixture, background.changeId);
    await writeSkillNativeCoderRun(fixture, background.changeId, "run-background-1", ["T-001"], "wt-background-1", "running");
    await writeSkillNativeWorkflowRunRecord(fixture, background.changeId, "running", {
      id: "workflow-background",
      currentNodeId: "coder",
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: selected.conversationId });

    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: selected.conversationId, runtimeStatus: "blocked", selected: true, blocker: expect.stringContaining("Audit blocked") }),
      expect.objectContaining({ id: background.conversationId, runtimeStatus: "running", selected: false, latestRunId: "run-background-1" }),
    ]));
    expect(snapshot.center.workpad.background).toMatchObject({
      runningCount: 1,
      blockedCount: 0,
      waitingDecisionCount: 0,
      items: [expect.objectContaining({ id: background.conversationId, runtimeStatus: "running" })],
    });
    expect(snapshot.center.workpad.memoryIsolation).toMatchObject({
      projectStableNamespace: "project/stable",
      currentChangeNamespace: `project/change/${selected.changeId}`,
      runNamespaces: expect.arrayContaining(["run/run-selected-1"]),
      relatedWorkpads: [expect.objectContaining({
        changeId: background.changeId,
        status: "running",
        factBoundary: "local-evidence-only",
      })],
    });
    const memoryText = JSON.stringify(snapshot.center.workpad.memoryIsolation);
    expect(memoryText).not.toMatch(/stdout\.log|stderr\.log|events\.jsonl|codex-events\.jsonl|process\.started/);
    expect(snapshot.center.workpad.nextAction).toMatchObject({ label: "正在自动修改", enabled: false });
    expect(snapshot.right.decisionInspector.primary).toBeNull();
  });

  it("creates a separate active demand conversation instead of appending when another demand is active", async () => {
    const current = await createConversationChangeFixture(project(), { title: "Current Active Demand" });
    const next = await createConversationChangeFixture(project(), {
      title: "Independent Follow-up Demand",
      body: "这是另一个独立需求，不应污染当前 Workpad。",
    });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: next.conversationId });

    expect(next.changeId).toBe("independent-follow-up-demand");
    expect(snapshot.center.selectedTopic).toMatchObject({ id: next.conversationId, boundChangeId: next.changeId, state: "active" });
    expect(snapshot.center.workpad.state).toBe("active");
    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: current.conversationId, runtimeStatus: "active" }),
      expect.objectContaining({ id: next.conversationId, runtimeStatus: "waiting-decision", selected: true }),
    ]));
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "这是另一个独立需求，不应污染当前 Workpad。" }),
    ]));
  });
});
