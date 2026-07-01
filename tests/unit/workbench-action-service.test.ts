import { describe, expect, it } from "vitest";
import { runWorkbenchWorkflowActionService, type WorkbenchActionDecisionInput, type WorkbenchActionServiceDeps } from "../../src/workbench/actions/service.js";
import { summarizeActionResult } from "../../src/workbench/actions/results.js";
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
        actionType: "planning.generate",
        status: "running",
      }],
      append(entry) {
        appended.push(entry);
      },
    });

    await expect(runWorkbenchWorkflowActionService(fakeProject(), { actionType: "planning.generate" }, undefined, deps)).rejects.toThrow("当前已有执行正在进行");

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
          actionType: "planning.generate",
          status: "running",
        },
        {
          id: "msg-completed",
          timestamp: "2026-06-20T00:00:01.000Z",
          changeId: "change-1",
          type: "workflow.completed",
          actionRunId: "action-finished",
          actionType: "planning.generate",
          status: "completed",
        },
      ],
      append(entry) {
        appended.push(entry);
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "planning.generate" }, undefined, deps);

    expect(appended.some((entry) => entry.type === "workflow.started" && entry.actionType === "planning.generate")).toBe(true);
    expect(appended.some((entry) => entry.type === "workflow.completed" && entry.actionType === "planning.generate")).toBe(true);
  });

  it("allows stop and steer control actions while another workflow action is in flight", async () => {
    const appended: TopicThreadEntry[] = [];
    const deps = fakeDeps({
      threadEntries: [{
        id: "msg-started",
        timestamp: "2026-06-20T00:00:00.000Z",
        changeId: "change-1",
        type: "workflow.started",
        actionRunId: "action-running",
        actionType: "planning.generate",
        status: "running",
      }],
      append(entry) {
        appended.push(entry);
      },
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "main-agent.execution.stop" }, undefined, deps);
    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "conversation.interrupt" }, undefined, deps);
    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "conversation.steer", prompt: "add detail" }, undefined, deps);

    expect(appended.filter((entry) => entry.type === "workflow.started").map((entry) => entry.actionType)).toEqual(["main-agent.execution.stop", "conversation.interrupt", "conversation.steer"]);
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

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "planning.scheduler.controlled-advance.run" }, undefined, deps);

    const terminal = appended.find((entry) => entry.type === "workflow.completed");
    expect(summarizeCalls).toBe(1);
    expect(terminal?.resultSummary).toBe("当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。");
    expect(decisions[0]?.summary).toBe(terminal?.resultSummary);
  });

  it("persists the concrete controlled advance post-step summary from the shared summarizer", async () => {
    const appended: TopicThreadEntry[] = [];
    const decisions: WorkbenchActionDecisionInput[] = [];
    const result = {
      postStepHandoff: {
        status: "next-confirmation-candidate-ready",
        executedActionType: "planning.scheduler.worker.start-next",
        nextConfirmationCandidate: {
          actionType: "planning.scheduler.worker.reconcile-result",
          readinessEvidencePrepared: true,
          executionStarted: false,
          authorizationGranted: false,
          humanConfirmationStillRequired: true,
        },
        executionStarted: false,
      },
    };
    const expectedSummary = summarizeActionResult("planning.scheduler.controlled-advance.run", result);
    const deps = fakeDeps({
      append(entry) {
        appended.push(entry);
      },
      record(decision) {
        decisions.push(decision);
      },
      async execute() {
        return result;
      },
      summarize: summarizeActionResult,
    });

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "planning.scheduler.controlled-advance.run" }, undefined, deps);

    const terminal = appended.find((entry) => entry.type === "workflow.completed");
    expect(expectedSummary).toContain("本次执行：继续执行下一个任务");
    expect(expectedSummary).toContain("下一步候选：检查当前结果");
    expect(terminal?.resultSummary).toBe(expectedSummary);
    expect(decisions[0]?.summary).toBe(expectedSummary);
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

    await runWorkbenchWorkflowActionService(fakeProject(), { actionType: "planning.scheduler.controlled-advance.run" }, undefined, deps);

    const terminal = appended.find((entry) => entry.type === "workflow.failed");
    expect(terminal?.resultSummary).toBe("按当前建议继续一个受控步骤执行失败。请查看错误和证据后再决定是否重试或调整。");
    expect(terminal?.resultSummary).not.toContain("E:\\");
    expect(terminal?.resultSummary).not.toContain("stack:");
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
} = {}): WorkbenchActionServiceDeps {
  return {
    async resolveChangeId() {
      return "change-1";
    },
    createTranscriptCapture() {
      return { sink: { emit() {} }, text: "", activity: [], blocks: [] };
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
  };
}
