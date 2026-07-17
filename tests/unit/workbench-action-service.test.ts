import { describe, expect, it } from "vitest";
import { runWorkbenchWorkflowActionService, type WorkbenchActionDecisionInput, type WorkbenchActionServiceDeps } from "../../src/workbench/actions/service.js";
import { createAssistantTranscriptCapture } from "../../src/workbench/live-transcript.js";
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

    expect([...new Map(appended.filter((entry) => entry.type === "workflow.started").map((entry) => [entry.actionRunId, entry.actionType])).values()]).toEqual([
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

    const terminal = appended.findLast((entry) => entry.type === "workflow.completed");
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

    const terminal = appended.findLast((entry) => entry.type === "workflow.failed");
    expect(terminal?.resultSummary).toBe("按当前建议继续一个受控步骤执行失败。请查看错误和证据后再决定是否重试或调整。");
    expect(terminal?.resultSummary).not.toContain("E:\\");
    expect(terminal?.resultSummary).not.toContain("stack:");
  });

  it("marks an unterminated child turn failed when the owning workflow throws", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      append(entry) {
        appended.push(entry);
      },
      async execute() {
        throw new Error("provider interrupted");
      },
      capture: {
        sink: { emit() {} },
        text: "",
        activity: [],
        blocks: [],
        childCaptures: new Map([["thread-coder:turn-running", {
          canonicalId: "child:codex:attempt-coder:thread-coder:turn-running",
          providerId: "codex",
          attemptId: "attempt-coder",
          runId: "run-coder",
          threadId: "thread-coder",
          parentThreadId: "thread-main",
          turnId: "turn-running",
          roleId: "coder-agent",
          activity: [{ kind: "status", label: "thinking", timestamp: "2026-06-20T00:00:01.000Z" }],
          blocks: [],
        }]]),
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    expect(appended.findLast((entry) => entry.type === "assistant.message")).toMatchObject({
      threadId: "thread-coder",
      turnId: "turn-running",
      status: "failed",
    });
  });

  it("fails closed when a child capture lacks canonical turn identity", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      append(entry) {
        appended.push(entry);
      },
      capture: {
        sink: { emit() {} },
        text: "",
        activity: [],
        blocks: [],
        childCaptures: new Map([
          ["thread-coder:missing-canonical", {
            canonicalId: "",
            providerId: "codex",
            attemptId: "attempt-coder",
            runId: "run-coder",
            threadId: "thread-coder",
            parentThreadId: "thread-main",
            turnId: "turn-1",
            roleId: "coder-agent",
            activity: [{ kind: "status", label: "completed", timestamp: "2026-06-20T00:00:01.000Z" }],
            blocks: [],
          }],
          ["thread-coder:missing-turn", {
            canonicalId: "child:codex:attempt-coder:thread-coder:turn-2",
            providerId: "codex",
            attemptId: "attempt-coder",
            runId: "run-coder",
            threadId: "thread-coder",
            parentThreadId: "thread-main",
            turnId: "",
            roleId: "coder-agent",
            activity: [{ kind: "status", label: "completed", timestamp: "2026-06-20T00:00:02.000Z" }],
            blocks: [],
          }],
        ]),
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    expect(appended.filter((entry) => entry.type === "assistant.message")).toHaveLength(0);
  });

  it("persists each real child turn before the workflow result so refresh keeps the Agent timeline", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      append(entry) {
        appended.push(entry);
      },
      capture: {
        sink: { emit() {} },
        text: "",
        activity: [],
        blocks: [],
        childCaptures: new Map([
          ["thread-coder:turn-1", {
            canonicalId: "child:codex:attempt-coder:thread-coder:turn-1",
            providerId: "codex",
            attemptId: "attempt-coder",
            runId: "run-coder",
            threadId: "thread-coder",
            parentThreadId: "thread-main",
            turnId: "turn-1",
            roleId: "coder-agent",
            activity: [{ kind: "status", label: "completed", timestamp: "2026-06-20T00:00:02.000Z" }],
            blocks: [{
              id: "assistant:run-coder:thread-coder:item-1:reasoning",
              runId: "run-coder",
              threadId: "thread-coder",
              turnId: "turn-1",
              sequence: 1,
              kind: "reasoning-summary",
              timestamp: "2026-06-20T00:00:01.000Z",
              source: "provider",
              text: "正在检查实现边界",
            }],
          }],
        ]),
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, undefined, deps);

    const child = appended.find((entry) => entry.type === "assistant.message");
    expect(child).toMatchObject({
      runId: "run-coder",
      threadId: "thread-coder",
      parentThreadId: "thread-main",
      turnId: "turn-1",
      agentRoleId: "coder-agent",
      agentSurfaceId: "agent:codex:thread:thread-coder",
    });
    expect(child?.blocks).toHaveLength(1);
    expect(appended.findIndex((entry) => entry === child)).toBeLessThan(appended.findLastIndex((entry) => entry.type === "workflow.completed"));
  });

  it("persists canonical provider activity before emitting the matching live event", async () => {
    const order: string[] = [];
    const deps = fakeDeps({
      createCapture: createAssistantTranscriptCapture,
      append(entry) {
        if (entry.blocks?.some((block) => block.kind === "prose" && block.text === "正在实现")) order.push("persist");
      },
      async execute(_project, _changeId, _request, live) {
        live?.emit({
          event: "assistant.delta",
          data: {
            providerId: "codex",
            attemptId: "attempt-1",
            runId: "run-1",
            threadId: "thread-main",
            turnId: "turn-1",
            itemId: "item-1",
            delta: "正在实现",
          },
        });
        return { ok: true };
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "code.run" }, {
      emit(event) {
        if (event.event === "assistant.delta") order.push("emit");
      },
    }, deps);

    expect(order.indexOf("persist")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("persist")).toBeLessThan(order.indexOf("emit"));
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
  capture?: ReturnType<WorkbenchActionServiceDeps["createTranscriptCapture"]>;
  createCapture?: WorkbenchActionServiceDeps["createTranscriptCapture"];
} = {}): WorkbenchActionServiceDeps {
  return {
    async resolveChangeId() {
      return "change-1";
    },
    createTranscriptCapture(_live, persistBeforeEmit) {
      if (overrides.createCapture) return overrides.createCapture(_live, persistBeforeEmit);
      if (overrides.capture) return overrides.capture;
      const capture = { sink: { emit(event: unknown) { overrides.events?.push(event); persistBeforeEmit?.(capture); } }, text: "", activity: [], blocks: [], childCaptures: new Map() } as ReturnType<WorkbenchActionServiceDeps["createTranscriptCapture"]>;
      return capture;
    },
    async openTimelineWriter() {
      return {
        upsert(entry: TopicThreadEntry) {
          overrides.append?.(entry);
          return entry;
        },
        close() {},
      };
    },
    async readThreadEntries() {
      return overrides.threadEntries ?? [];
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
