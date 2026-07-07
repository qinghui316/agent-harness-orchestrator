import { describe, expect, it } from "vitest";
import { buildAgentScopedTranscriptCells, buildParentAgentTranscript, pageParentAgentTranscript } from "../../src/workbench/parent-agent-transcript.js";

describe("parent agent transcript paging", () => {
  it("keeps the full transcript compatible and returns the latest page by default", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Long demand" },
      threadItems: Array.from({ length: 8 }, (_, index) => ({
        id: `msg-${index}`,
        kind: "user-message",
        label: `message ${index}`,
        body: `message ${index}`,
      })),
    });

    expect(transcript.cells).toHaveLength(8);
    expect(transcript.paging).toBeUndefined();

    const page = pageParentAgentTranscript(transcript, { limit: 3 });
    expect(page.cells.map((cell) => cell.text)).toEqual(["message 5", "message 6", "message 7"]);
    expect(page.items).toHaveLength(3);
    expect(page.paging).toEqual({
      limit: 3,
      totalCount: 8,
      hasMoreBefore: true,
      nextBeforeCursor: "cell:user:msg-5",
    });
  });

  it("returns earlier cells before the cursor without changing cell ids or order", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Long demand" },
      threadItems: Array.from({ length: 6 }, (_, index) => ({
        id: `msg-${index}`,
        kind: "user-message",
        label: `message ${index}`,
        body: `message ${index}`,
      })),
    });

    const page = pageParentAgentTranscript(transcript, { limit: 2, beforeCursor: "cell:user:msg-4" });
    expect(page.cells.map((cell) => cell.id)).toEqual(["cell:user:msg-2", "cell:user:msg-3"]);
    expect(page.paging?.hasMoreBefore).toBe(true);
    expect(page.paging?.nextBeforeCursor).toBe("cell:user:msg-2");
  });

  it("keeps synthetic large transcript paging bounded without durable pressure fixtures", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Synthetic pressure" },
      threadItems: syntheticThreadItems(10_000),
    });

    expect(transcript.cells).toHaveLength(10_000);
    const latest = pageParentAgentTranscript(transcript, { limit: 100 });
    expect(latest.cells).toHaveLength(100);
    expect(latest.cells[0]?.id).toBe("cell:user:msg-9900");
    expect(latest.cells.at(-1)?.id).toBe("cell:assistant:block-9999");
    expect(latest.paging).toEqual({
      limit: 100,
      totalCount: 10_000,
      hasMoreBefore: true,
      nextBeforeCursor: "cell:user:msg-9900",
    });

    const earlier = pageParentAgentTranscript(transcript, { limit: 100, beforeCursor: latest.paging?.nextBeforeCursor });
    expect(earlier.cells).toHaveLength(100);
    expect(earlier.cells[0]?.id).toBe("cell:user:msg-9800");
    expect(earlier.cells.at(-1)?.id).toBe("cell:assistant:block-9899");
  });

  it("keeps child-agent transcript cells out of the parent transcript and available by role", () => {
    const childBlock = {
      id: "planning-prose",
      sequence: 1,
      kind: "prose" as const,
      timestamp: "2026-07-02T10:00:00.000Z",
      source: "codex" as const,
      text: "Planning-agent draft body stays in the Agent workspace.",
    };
    const threadItems = [
      {
        id: "main-response",
        kind: "assistant-turn",
        label: "assistant",
        body: "Main agent response.",
        blocks: [{
          id: "main-prose",
          sequence: 1,
          kind: "prose" as const,
          timestamp: "2026-07-02T10:00:00.000Z",
          source: "codex" as const,
          text: "Main agent response.",
        }],
      },
      {
        id: "planning-response",
        kind: "assistant-turn",
        label: "planning-agent",
        body: "Planning-agent draft body stays in the Agent workspace.",
        runId: "run-planning",
        agentRoleId: "planning-agent",
        agentTaskId: "task-planning",
        blocks: [childBlock],
      },
    ];

    const parent = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Agent split" },
      threadItems,
    });
    const childCells = buildAgentScopedTranscriptCells(threadItems, "planning-agent");

    expect(parent.cells.map((cell) => cell.text).join("\n")).toContain("Main agent response.");
    expect(parent.cells.map((cell) => cell.text).join("\n")).not.toContain("Planning-agent draft body");
    expect(childCells).toEqual([
      expect.objectContaining({
        agentRoleId: "planning-agent",
        agentTaskId: "task-planning",
        runId: "run-planning",
        text: "Planning-agent draft body stays in the Agent workspace.",
      }),
    ]);
  });

  it("routes native Plan Mode output to a plan session instead of planning-agent", () => {
    const threadItems = [
      {
        id: "user-1",
        kind: "user-message",
        label: "Plan a small change",
        body: "Plan a small change",
      },
      {
        id: "native-plan-message",
        kind: "assistant-turn",
        label: "计划会话",
        agentRoleId: "plan-session",
        runId: "run-native-plan",
        body: "Native plan body from Codex Plan Mode.",
        blocks: [{
          id: "native-plan-block",
          sequence: 1,
          kind: "prose" as const,
          source: "codex" as const,
          text: "Native plan body from Codex Plan Mode.",
        }],
      },
    ];

    const parent = buildParentAgentTranscript({
      workpad: { conversationId: "conv", title: "Native plan session" },
      threadItems,
    });
    const planSession = buildAgentScopedTranscriptCells(threadItems, "plan-session");
    const planningAgent = buildAgentScopedTranscriptCells(threadItems, "planning-agent");

    expect(parent.cells.map((cell) => cell.text).join("\n")).toBe("Plan a small change");
    expect(planSession).toEqual([
      expect.objectContaining({
        agentRoleId: "plan-session",
        runId: "run-native-plan",
        text: "Native plan body from Codex Plan Mode.",
      }),
    ]);
    expect(planningAgent).toEqual([]);
  });

  it("strips accidental planning sections from main-agent visible prose", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Main plan leak" },
      threadItems: [{
        id: "main-leak",
        kind: "assistant-turn",
        label: "AI",
        blocks: [{
          id: "main-leak-block",
          sequence: 1,
          kind: "prose" as const,
          source: "codex" as const,
          text: "我先确认需求，不会修改文件。\n\n## 目标\n做事\n\n## 验收标准\n- 通过",
        }],
      }],
    });

    expect(transcript.cells.map((cell) => cell.text)).toEqual(["我先确认需求，不会修改文件。"]);
  });

  it("strips persisted project-scoped child-agent leaks when lazy transcript pages are rebuilt", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Lazy transcript leak" },
      threadItems: [{
        id: "persisted-main-leak",
        kind: "assistant-turn",
        label: "AI",
        blocks: [{
          id: "persisted-main-leak-block",
          sequence: 1,
          kind: "prose" as const,
          source: "codex" as const,
          text: [
            "我会先确认当前约束，不修改文件。",
            "",
            "计划代理已经启动，我现在只等待它返回计划。",
            "",
            "实施计划：",
            "1. 读取项目说明。",
            "",
            "验证方式：",
            "打开页面检查。",
          ].join("\n"),
        }],
      }],
    });

    const page = pageParentAgentTranscript(transcript, { limit: 100 });
    const visibleText = page.cells.map((cell) => cell.text).join("\n");

    expect(visibleText).toBe("我会先确认当前约束，不修改文件。");
    expect(visibleText).not.toContain("计划代理");
    expect(visibleText).not.toContain("实施计划");
    expect(visibleText).not.toContain("验证方式");
  });

  it("strips assistant promises to delegate planning-agent from the parent transcript", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Planning delegation leak" },
      threadItems: [{
        id: "main-delegation-leak",
        kind: "assistant-turn",
        label: "AI",
        blocks: [{
          id: "main-delegation-leak-block",
          sequence: 1,
          kind: "prose" as const,
          source: "codex" as const,
          text: "我理解这次目标是完成验收，并保持当前回合只读。\n这条回复之后，我会把只读规划交给 planning-agent；当前不会修改文件。",
        }],
      }],
    });

    expect(transcript.cells.map((cell) => cell.text)).toEqual(["我理解这次目标是完成验收，并保持当前回合只读。"]);
  });
});

function syntheticThreadItems(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(Date.UTC(2026, 5, 26, 0, 0, index % 60)).toISOString();
    if (index % 2 === 0) {
      return {
        id: `msg-${index}`,
        kind: "user-message",
        label: `Scoped user request ${index}`,
        body: `Please update bounded transcript fixture ${index}.`,
        timestamp,
      };
    }
    return {
      id: `msg-${index}`,
      kind: "assistant-turn",
      label: `assistant ${index}`,
      timestamp,
      blocks: [{
        id: `block-${index}`,
        sequence: index,
        kind: "prose" as const,
        timestamp,
        source: "codex" as const,
        title: `Codex response ${index}`,
        text: `Synthetic assistant transcript body ${index}. ${"detail ".repeat(index % 8)}`,
      }],
    };
  });
}
