import { describe, expect, it } from "vitest";
import { runWorkbenchWorkflowActionService, type WorkbenchActionDecisionInput, type WorkbenchActionServiceDeps } from "../../src/workbench/actions/service.js";
import type { ManagedProject } from "../../src/types/index.js";
import type { TopicThreadEntry, WorkbenchWorkflowActionRequest } from "../../src/workbench/types.js";

describe("workbench workflow action service", () => {
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
  append?: (entry: TopicThreadEntry) => void;
  record?: (decision: WorkbenchActionDecisionInput) => void;
  summarize?: () => string;
  execute?: WorkbenchActionServiceDeps["execute"];
} = {}): WorkbenchActionServiceDeps {
  return {
    async resolveChangeId() {
      return "change-1";
    },
    createTranscriptCapture() {
      return { sink: { emit() {} }, text: "", activity: [], blocks: [] };
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
    summarizeResult() {
      return overrides.summarize?.() ?? "已完成。";
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
