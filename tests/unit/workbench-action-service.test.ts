import { describe, expect, it } from "vitest";
import { runWorkbenchWorkflowActionService, type WorkbenchActionDecisionInput, type WorkbenchActionServiceDeps } from "../../src/workbench/actions/service.js";
import type { ManagedProject } from "../../src/types/index.js";
import type { TopicThreadEntry, WorkbenchWorkflowActionRequest } from "../../src/workbench/types.js";

describe("workbench workflow action service", () => {
  it("rejects a second non-control workflow action while another workflow action is in flight", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      threadEntries: [{
        id: "msg-started",
        timestamp: "2026-06-20T00:00:00.000Z",
        changeId: "change-1",
        type: "workflow.started",
        actionRunId: "action-running",
        actionType: "code.run",
        status: "running",
      }],
      append(entry) {
        appended.push(entry);
      },
    });

    await expect(runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps)).rejects.toThrow("当前已有执行正在进行");

    expect(appended).toHaveLength(0);
  });

  it("allows a workflow action after the prior workflow action has a terminal entry", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      threadEntries: [
        {
          id: "msg-started",
          timestamp: "2026-06-20T00:00:00.000Z",
          changeId: "change-1",
          type: "workflow.started",
          actionRunId: "action-finished",
          actionType: "code.run",
          status: "running",
        },
        {
          id: "msg-completed",
          timestamp: "2026-06-20T00:00:01.000Z",
          changeId: "change-1",
          type: "workflow.completed",
          actionRunId: "action-finished",
          actionType: "code.run",
          status: "completed",
        },
      ],
      append(entry) {
        appended.push(entry);
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    expect(appended.some((entry) => entry.type === "workflow.started" && entry.actionType === "code.run")).toBe(true);
    expect(appended.some((entry) => entry.type === "workflow.completed" && entry.actionType === "code.run")).toBe(true);
  });

  it("allows canonical and legacy main-agent stop control actions while another workflow action is in flight", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      threadEntries: [{
        id: "msg-started",
        timestamp: "2026-06-20T00:00:00.000Z",
        changeId: "change-1",
        type: "workflow.started",
        actionRunId: "action-running",
        actionType: "code.run",
        status: "running",
      }],
      append(entry) {
        appended.push(entry);
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "main-agent.execution.stop" }, undefined, deps);
    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "role.pipeline.stop" }, undefined, deps);
    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "conversation.interrupt" }, undefined, deps);
    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "conversation.steer", prompt: "add detail" }, undefined, deps);

    expect(appended.filter((entry) => entry.type === "workflow.started").map((entry) => entry.actionType)).toEqual([
      "main-agent.execution.stop",
      "role.pipeline.stop",
      "conversation.interrupt",
      "conversation.steer",
    ]);
  });

  it("keeps legacy inbound main-agent execution ids as historical echo evidence", async () => {
    const appended: TopicThreadEntry[] = [];
    const decisions: WorkbenchActionDecisionInput[] = [];
    const deps = fakeDeps({
      append(entry) {
        appended.push(entry);
      },
      record(decision) {
        decisions.push(decision);
      },
    });

    const result = await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "role.pipeline.start" }, undefined, deps);

    expect(result.actionType).toBe("role.pipeline.start");
    expect(appended.find((entry) => entry.type === "workflow.started")?.actionType).toBe("role.pipeline.start");
    expect(appended.find((entry) => entry.type === "workflow.completed")?.actionType).toBe("role.pipeline.start");
    expect(decisions[0]?.decisionType).toBe("role.pipeline.start");
    expect(decisions[0]?.actionId).toBe("role.pipeline.start");
    expect(decisions[0]?.summary).toBe("已完成。");
  });

  it("computes one result summary and reuses it for terminal thread entries and decision history", async () => {
    const appended: TopicThreadEntry[] = [];
    const decisions: WorkbenchActionDecisionInput[] = [];
    let summarizeCalls = 0;
    const deps = fakeDeps({
      append(entry) {
        appended.push(entry);
      },
      record(decision) {
        decisions.push(decision);
      },
      summarize() {
        summarizeCalls += 1;
        return "当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。";
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    const terminal = appended.find((entry) => entry.type === "workflow.completed");
    expect(summarizeCalls).toBe(1);
    expect(terminal?.resultSummary).toBe("当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。");
    expect(decisions[0]?.summary).toBe(terminal?.resultSummary);
  });

  it("uses a safe display summary for thrown workflow failures", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      append(entry) {
        appended.push(entry);
      },
      async execute() {
        throw new Error("failed at E:\\secret\\internal.ts\nstack: debug object");
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    const terminal = appended.find((entry) => entry.type === "workflow.failed");
    expect(terminal?.resultSummary).toBe("按当前建议继续一个受控步骤执行失败。请查看错误和证据后再决定是否重试或调整。");
    expect(terminal?.resultSummary).not.toContain("E:\\");
    expect(terminal?.resultSummary).not.toContain("stack:");
  });

  it("resumes a paused native Goal once after a concrete action completes", async () => {
    const resumes: Array<{ actionRunId: string; actionType: string; status: string; result: unknown }> = [];
    const deps = fakeDeps({
      resume(input) {
        resumes.push(input);
      },
    });

    const result = await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    expect(resumes).toEqual([expect.objectContaining({
      actionRunId: result.actionRunId,
      actionType: "code.run",
      status: "completed",
      result: { ok: true },
    })]);
  });

  it("keeps a completed workflow result when native Goal resume fails", async () => {
    const emitted: unknown[] = [];
    const deps = fakeDeps({
      events: emitted,
      async resume() {
        throw new Error("unsupported provider Goal state");
      },
    });

    const result = await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    expect(result).toMatchObject({ status: "completed", result: { ok: true } });
    expect(emitted).toContainEqual(expect.objectContaining({
      event: "error",
      data: expect.objectContaining({ message: expect.stringContaining("native Goal resume failed") }),
    }));
  });

  it("delivers failed action evidence but never resumes for interrupt controls", async () => {
    const resumes: Array<{ actionType: string; status: string; result: unknown }> = [];
    const failedDeps = fakeDeps({
      async execute() {
        throw new Error("leaf failed");
      },
      resume(input) {
        resumes.push(input);
      },
    });
    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, failedDeps);

    const interruptDeps = fakeDeps({
      resume(input) {
        resumes.push(input);
      },
    });
    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "conversation.interrupt" }, undefined, interruptDeps);

    expect(resumes).toEqual([expect.objectContaining({
      actionType: "code.run",
      status: "failed",
      result: { error: "leaf failed" },
    })]);
  });
});

function fakeProject(): ManagedProject {
  return { id: "project", name: "Project", path: "E:\\repo" } as ManagedProject;
}

function fakeDeps(overrides: {
  threadEntries?: TopicThreadEntry[];
  append?: (entry: TopicThreadEntry) => void;
  record?: (decision: WorkbenchActionDecisionInput) => void;
  summarize?: WorkbenchActionServiceDeps["summarizeResult"];
  execute?: WorkbenchActionServiceDeps["execute"];
  resume?: NonNullable<WorkbenchActionServiceDeps["resumeGoalAfterAction"]>;
  events?: unknown[];
} = {}): WorkbenchActionServiceDeps {
  return {
    async resolveChangeId() {
      return "change-1";
    },
    createTranscriptCapture() {
      return { sink: { emit(event) { overrides.events?.push(event); } }, text: "", activity: [], blocks: [] };
    },
    async readThreadEntries() {
      return overrides.threadEntries ?? [];
    },
    async appendThreadEntry(_project, changeId, input) {
      const entry: TopicThreadEntry = {
        id: `msg-${input.type}`,
        timestamp: "2026-06-20T00:00:00.000Z",
        changeId,
        ...input,
      };
      overrides.append?.(entry);
      return entry;
    },
    execute: overrides.execute ?? (async () => ({ ok: true })),
    labelForAction() {
      return "按当前建议继续一个受控步骤";
    },
    extractRunId() {
      return "run-1";
    },
    failureMessage() {
      return null;
    },
    summarizeResult(actionType, result) {
      return overrides.summarize?.(actionType, result) ?? "已完成。";
    },
    artifactForResult() {
      return null;
    },
    targetId() {
      return "change-1";
    },
    scopePayload(_request: WorkbenchWorkflowActionRequest, changeId: string) {
      return { changeId };
    },
    async recordDecision(_project, input) {
      overrides.record?.(input);
    },
    resumeGoalAfterAction: overrides.resume,
  };
}
