import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closeChange, createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic, postTopicMessage } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, listWorkbenchTopics } from "../../src/workbench/manager.js";
import { writeRawActiveChange } from "./workbench/change-fixtures.js";
import {
  getTempDir,
  project,
  writeAcceptedSpecAndTasks,
  writeCoderRun,
  writeTaskQueueItemRecord,
  writeTaskQueueRecord,
  writeTaskRunRecord,
} from "./workbench/fixtures.js";

describe("workbench conversation lifecycle", () => {
  it("abandons an active Workpad without requiring close readiness", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Abandon Workpad" });

    const result = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      abandon: { changeId: "abandon-workpad", reason: "用户不需要继续。" },
      confirm: true,
    });
    const topics = await listWorkbenchTopics({ project: project(), path: getTempDir() });

    expect(result.result).toMatchObject({
      change: expect.objectContaining({ id: "abandon-workpad", state: "archived" }),
    });
    expect(topics.find((topic) => topic.id === "abandon-workpad")).toMatchObject({ state: "archive" });
  });

  it("projects multiple Workpads with scoped background activity and memory isolation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Selected Blocked Workpad" });
    await writeAcceptedSpecAndTasks("selected-blocked-workpad");
    await writeTaskQueueRecord("selected-blocked-workpad", "queue-selected", "blocked", {
      currentTaskId: "T-001",
      totalCount: 1,
      blockedReason: "T-001: Audit blocked.",
    });
    await writeTaskQueueItemRecord("selected-blocked-workpad", "queue-selected", "queue-selected-item-001", "T-001", 1, "blocked", {
      taskRunId: "taskrun-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeTaskRunRecord("selected-blocked-workpad", "taskrun-selected-1", "T-001", "blocked", 1, {
      runId: "run-selected-1",
      worktreeId: "wt-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeCoderRun("selected-blocked-workpad", "run-selected-1", ["T-001"], "wt-selected-1", "completed", "taskrun-selected-1");

    await writeRawActiveChange(getTempDir(), "background-running-workpad", "Background Running Workpad");
    await writeAcceptedSpecAndTasks("background-running-workpad");
    await writeCoderRun("background-running-workpad", "run-background-1", ["T-001"], "wt-background-1", "running");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "selected-blocked-workpad" });

    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "selected-blocked-workpad", runtimeStatus: "blocked", selected: true, blocker: expect.stringContaining("Audit blocked") }),
      expect.objectContaining({ id: "background-running-workpad", runtimeStatus: "running", selected: false, latestRunId: "run-background-1" }),
    ]));
    expect(snapshot.center.workpad.background).toMatchObject({
      runningCount: 1,
      blockedCount: 0,
      waitingDecisionCount: 0,
      items: [expect.objectContaining({ id: "background-running-workpad", runtimeStatus: "running" })],
    });
    expect(snapshot.center.workpad.memoryIsolation).toMatchObject({
      projectStableNamespace: "project/stable",
      currentChangeNamespace: "change/selected-blocked-workpad",
      runNamespaces: expect.arrayContaining(["run/run-selected-1"]),
      relatedWorkpads: [expect.objectContaining({
        changeId: "background-running-workpad",
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
    await initHarness(project());
    await createChange(project(), { title: "Current Active Demand" });

    const next = await createWorkbenchTopic(project(), {
      title: "Independent Follow-up Demand",
      body: "这是另一个独立需求，不应污染当前 Workpad。",
    });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: next.changeId });

    expect(next.changeId).toBe("independent-follow-up-demand");
    expect(snapshot.center.selectedTopic).toMatchObject({ id: next.changeId, state: "active" });
    expect(snapshot.center.workpad.state).toBe("active");
    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "current-active-demand", runtimeStatus: "active" }),
      expect.objectContaining({ id: "independent-follow-up-demand", runtimeStatus: "active", selected: true }),
    ]));
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "这是另一个独立需求，不应污染当前 Workpad。" }),
    ]));
  });

  it("records supplemental input as pending feedback while a demand run is still running", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Running Demand" });
    await writeAcceptedSpecAndTasks("running-demand");
    await writeCoderRun("running-demand", "run-running-1", ["T-001"], "wt-running-1", "running");

    const result = await postTopicMessage(project(), "running-demand", "补充：金额需要四舍五入到分。");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "running-demand" });

    expect(result).toMatchObject({ run: null, routingDecision: "same-topic", assistantMessage: "已记录，将在下一轮生效。" });
    expect(snapshot.center.workpad.pendingFeedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "补充：金额需要四舍五入到分。", runId: "run-running-1", status: "pending-next-turn" }),
    ]));
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "补充：金额需要四舍五入到分。", runId: "run-running-1" }),
      expect.objectContaining({ kind: "assistant-turn", body: "已记录，将在下一轮生效。", runId: "run-running-1" }),
    ]));
  });

  it("creates a linked follow-up demand instead of mutating an archived conversation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archived Demand" });
    await writeFile(join(getTempDir(), "harness", "changes", "active", "archived-demand", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(getTempDir());

    const result = await postTopicMessage(project(), "archived-demand", "继续修改实现并补测试。");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "archived-demand" });

    expect(result.routingDecision).toBe("new-topic-required");
    expect(result.assistantMessage).toContain("linked follow-up");
    const followUpId = snapshot.center.thread.items.find((item) => item.kind === "assistant-turn" && item.body?.includes("linked follow-up"))?.artifact;
    expect(followUpId).toBeTruthy();
    expect(snapshot.center.workpad.conversationLifecycle).toBe("archived-readonly");
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "继续修改实现并补测试。" }),
    ]));
  });
});
