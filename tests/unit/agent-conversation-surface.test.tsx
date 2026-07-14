// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWorkspacePanel } from "../../src/web/src/panels/workbench/AgentWorkspacePanel.js";
import { mergeAssistantBlocks } from "../../src/web/src/shell/assistant-blocks.js";
import { coalesceMainLiveTurns, findCompatibleLiveTurn, mergeLiveItemsIntoTranscript, parentTranscriptCellsFromLiveThreadItem, reconcileTimelineCells, transcriptContainsMainTurn } from "../../src/web/src/liveTranscript.js";
import { AgentTranscriptPane } from "../../src/web/src/panels/workbench/TranscriptReadingSurface.js";
import { threadItemFromTopicEntry } from "../../src/web/src/shell/thread-stream.js";
import type { AgentWorkspaceAgent, AssistantTurnBlock, ThreadStreamItem, TopicMessageEntry } from "../../src/web/src/types.js";

afterEach(cleanup);

describe("Agent conversation surfaces", () => {
  it("upgrades one provisional run to its provider thread and turn identity", () => {
    const provisional = {
      id: "live-turn:run-1:main:turn",
      runId: "run-1",
      status: "connecting",
      text: "",
      events: [],
      blocks: [],
      startedAt: "2026-07-14T00:00:00.000Z",
    };

    expect(findCompatibleLiveTurn([provisional], "run-1", { threadId: "thread-1", turnId: "turn-1", agentRoleId: "main-agent" })).toBe(provisional);
  });

  it("does not merge two established provider turns merely because they share a run", () => {
    const mainTurn = {
      id: "live-turn:run-1:thread-1:previous-turn",
      runId: "run-1",
      threadId: "thread-1",
      turnId: "previous-turn",
      agentRoleId: "main-agent",
      status: "connecting",
      text: "",
      events: [],
      blocks: [],
      startedAt: "2026-07-14T00:00:00.000Z",
    };

    expect(findCompatibleLiveTurn([mainTurn], "run-1", {
      threadId: "thread-1",
      turnId: "current-turn",
      agentRoleId: "main-agent",
    })).toBeUndefined();
  });

  it("removes a completed main live turn when the transcript records the run without provider thread metadata", () => {
    expect(transcriptContainsMainTurn([{
      id: "cell:turn:run-1:main:turn",
      kind: "process-row",
      source: "codex-runtime",
      runId: "run-1",
      text: "已思考 2 秒",
    }], { runId: "run-1" })).toBe(true);
  });

  it("keeps distinct provider turns separate and converts one completion to stable elapsed history", () => {
    expect(coalesceMainLiveTurns([
      liveTurn("thinking", "thread-1", "previous-turn"),
      liveTurn("thinking", "thread-1", "current-turn"),
    ])).toHaveLength(2);
    const running = mergeLiveItemsIntoTranscript({ title: "Demand", cells: [], items: [] }, [], [liveTurn("thinking", "thread-1", "current-turn")]);
    expect(running.cells.filter((cell) => cell.realtime)).toHaveLength(1);

    const completed = mergeLiveItemsIntoTranscript({ title: "Demand", cells: [], items: [] }, [], [{
      ...liveTurn("completed", "thread-1", "current-turn"),
      endedAt: "2026-07-14T00:00:05.000Z",
    }]);
    expect(completed.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "cell:turn:run-1:thread-1:current-turn", title: "已完成 · 5 秒", status: "completed", realtime: false }),
    ]));
  });

  it("calibrates a live turn in place when the durable snapshot arrives", () => {
    const live = mergeLiveItemsIntoTranscript({ title: "Demand", cells: [], items: [] }, [], [liveTurn("thinking", "thread-1", "turn-1")]);
    const liveBoundary = live.cells.find((cell) => cell.id === "cell:turn:run-1:thread-1:turn-1");
    expect(liveBoundary).toEqual(expect.objectContaining({ realtime: true, title: "正在思考" }));

    const reconciled = reconcileTimelineCells(live.cells, [{
      id: "cell:turn:run-1:thread-1:turn-1",
      kind: "process-row",
      source: "codex-runtime",
      runId: "run-1",
      threadId: "thread-1",
      turnId: "turn-1",
      title: "已完成 · 5 秒",
      text: "已完成 · 5 秒",
      status: "completed",
    }]);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toEqual(expect.objectContaining({
      id: liveBoundary?.id,
      title: "已完成 · 5 秒",
      status: "completed",
      realtime: false,
    }));
  });

  it("keeps one canonical timeline through live events, snapshot handoff, and refresh", () => {
    const threadId = "thread-1";
    const turnId = "turn-1";
    const runId = "run-1";
    const userEntry = {
      id: "user-message-1",
      type: "user.message",
      timestamp: "2026-07-14T00:00:00.000Z",
      text: "创建欢迎页",
    } as TopicMessageEntry;
    const liveUser = threadItemFromTopicEntry(userEntry);
    expect(liveUser?.id).toBe(userEntry.id);

    const blocks: AssistantTurnBlock[] = [{
      id: `prose:${runId}:${threadId}:assistant-item-1`,
      runId,
      threadId,
      turnId,
      itemId: "assistant-item-1",
      sequence: 1,
      kind: "prose",
      timestamp: "2026-07-14T00:00:01.000Z",
      source: "codex",
      text: "我会先检查项目。",
    }, {
      id: `tool:${runId}:${threadId}:command-item-1`,
      runId,
      threadId,
      turnId,
      itemId: "command-item-1",
      sequence: 2,
      kind: "command",
      timestamp: "2026-07-14T00:00:02.000Z",
      source: "codex",
      status: "completed",
      command: "dir",
      preview: "index.html",
    }, {
      id: `prose:${runId}:${threadId}:assistant-item-2`,
      runId,
      threadId,
      turnId,
      itemId: "assistant-item-2",
      sequence: 3,
      kind: "prose",
      timestamp: "2026-07-14T00:00:03.000Z",
      source: "codex",
      text: "欢迎页已完成。",
    }];
    const assistant: ThreadStreamItem = {
      id: "assistant-message-1",
      kind: "assistant-turn",
      label: "AI",
      source: "chat",
      timestamp: "2026-07-14T00:00:01.000Z",
      runId,
      threadId,
      turnId,
      blocks,
    };
    const completedTurn = {
      ...liveTurn("completed", threadId, turnId),
      blocks,
      endedAt: "2026-07-14T00:00:05.000Z",
    };

    const live = mergeLiveItemsIntoTranscript({ title: "Demand", cells: [], items: [] }, [liveUser!, assistant], [completedTurn]);
    const durable = mergeLiveItemsIntoTranscript({ title: "Demand", cells: [], items: [] }, [liveUser!, assistant], [completedTurn]);
    const handoff = mergeLiveItemsIntoTranscript(durable, [liveUser!, assistant], [completedTurn]);

    expect(handoff.cells.map((cell) => cell.id)).toEqual(durable.cells.map((cell) => cell.id));
    expect(new Set(handoff.cells.map((cell) => cell.id)).size).toBe(handoff.cells.length);
    expect(handoff.cells.filter((cell) => cell.kind === "user-message")).toHaveLength(1);
    expect(handoff.cells.filter((cell) => cell.kind === "assistant-message")).toHaveLength(2);
    expect(handoff.cells.filter((cell) => cell.activityKind === "command")).toHaveLength(1);
    expect(handoff.cells.filter((cell) => cell.activityKind === "turn")).toHaveLength(1);
    expect(handoff.cells.at(-1)).toEqual(expect.objectContaining({
      id: `cell:turn:${runId}:${threadId}:${turnId}`,
      title: "已完成 · 5 秒",
      realtime: false,
    }));
    expect(live.cells.map((cell) => cell.id)).toEqual(handoff.cells.map((cell) => cell.id));
  });

  it("accumulates provider-visible reasoning summary deltas on one block", () => {
    const first = {
      id: "reasoning:1",
      kind: "reasoning-summary" as const,
      sequence: 1,
      timestamp: "2026-07-14T00:00:00.000Z",
      status: "updated" as const,
      text: "检查结构",
    };

    expect(mergeAssistantBlocks(first, { ...first, text: "并运行测试" }).text).toBe("检查结构并运行测试");
  });

  it("shows in-progress reasoning only in the tail activity and keeps completed reasoning before the turn boundary", () => {
    const reasoning = {
      id: "reasoning:run-1:item-1",
      runId: "run-1",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      kind: "reasoning-summary" as const,
      sequence: 1,
      timestamp: "2026-07-14T00:00:01.000Z",
      source: "codex" as const,
      status: "updated",
      text: "正在追踪复合身份",
    };
    const running = mergeLiveItemsIntoTranscript({ title: "Demand", cells: [], items: [] }, [], [{
      ...liveTurn("thinking", "thread-1", "turn-1"),
      blocks: [reasoning],
    }]);
    expect(running.cells).toHaveLength(1);
    expect(running.cells[0]).toEqual(expect.objectContaining({ title: "正在思考 · 正在追踪复合身份", realtime: true }));

    const completed = mergeLiveItemsIntoTranscript({ title: "Demand", cells: [], items: [] }, [], [{
      ...liveTurn("completed", "thread-1", "turn-1"),
      blocks: [{ ...reasoning, status: "completed" }],
      endedAt: "2026-07-14T00:00:05.000Z",
    }]);
    expect(completed.cells.map((cell) => cell.title)).toEqual([
      "思考摘要 · 正在追踪复合身份",
      "已完成 · 5 秒",
    ]);
  });

  it("keeps same-role provider threads in separate closeable tabs", () => {
    const first = agent("thread:coder-1", "thread-coder-1", "Coder Agent 1", "Coder one result");
    const second = agent("thread:coder-2", "thread-coder-2", "Coder Agent 2", "Coder two result");
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const onBack = vi.fn();
    render(<AgentWorkspacePanel
      workspace={{ selectedAgentId: first.id, agents: [first, second] }}
      selectedAgentId={first.id}
      openAgentIds={[first.id, second.id]}
      liveItems={[]}
      liveTurns={[]}
      busy={false}
      onSelectAgent={onSelect}
      onCloseAgent={onClose}
      onBack={onBack}
      onAnswerClarification={async () => undefined}
      onSendAgentMessage={async () => undefined}
      modelLabel="default"
    />);

    const tabs = screen.getByRole("tablist", { name: "已打开的 Agent" });
    expect(within(tabs).getByRole("tab", { name: /Coder Agent 1/ })).toBeTruthy();
    expect(within(tabs).getByRole("tab", { name: /Coder Agent 2/ })).toBeTruthy();
    expect(screen.getByText("Coder one result")).toBeTruthy();
    expect(screen.queryByText("Coder two result")).toBeNull();

    fireEvent.click(within(tabs).getByRole("tab", { name: /Coder Agent 2/ }));
    expect(onSelect).toHaveBeenCalledWith(second.id);
    fireEvent.click(screen.getByRole("button", { name: "关闭 Coder Agent 1" }));
    expect(onClose).toHaveBeenCalledWith(first.id);
    fireEvent.click(screen.getByRole("button", { name: "返回工具列表" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Coder Agent 1" })).toBeNull();
  });

  it("groups only adjacent command items and keeps canonical success and failure copy", () => {
    const command = (id: string, sequence: number, status: "completed" | "failed", commandText: string): AssistantTurnBlock => ({
      id,
      itemId: id,
      runId: "run-command",
      threadId: "thread-command",
      turnId: "turn-command",
      sequence,
      kind: "command",
      timestamp: `2026-07-14T00:00:0${sequence}.000Z`,
      source: "codex",
      status,
      command: commandText,
      exitCode: status === "failed" ? 1 : 0,
      isError: status === "failed",
    });
    const item: ThreadStreamItem = {
      id: "assistant-command-run",
      kind: "assistant-turn",
      label: "AI",
      source: "chat",
      timestamp: "2026-07-14T00:00:01.000Z",
      blocks: [
        command("cmd-1", 1, "completed", "npm test"),
        command("cmd-2", 2, "failed", "npm run lint"),
        { id: "prose-break", sequence: 3, kind: "prose", timestamp: "2026-07-14T00:00:03.000Z", source: "codex", text: "继续检查。" },
        command("cmd-3", 4, "completed", "npm run build"),
      ],
    };

    const cells = parentTranscriptCellsFromLiveThreadItem(item);
    expect(cells.filter((cell) => cell.activityKind === "command")).toEqual([
      expect.objectContaining({ title: "运行了 2 条命令 · 1 条失败", text: "运行了 2 条命令 · 1 条失败", status: "failed", isError: true }),
      expect.objectContaining({ title: "命令已完成 · npm run build", text: "命令已完成 · npm run build", status: "completed" }),
    ]);
    expect(cells.findIndex((cell) => cell.kind === "assistant-message")).toBeLessThan(cells.findIndex((cell) => cell.title === "命令已完成 · npm run build"));
  });

  it("keeps tool detail collapsed until the user expands it", () => {
    render(<AgentTranscriptPane cells={[{
      id: "command-1",
      kind: "process-row",
      source: "codex-runtime",
      title: "命令已完成 · npm test",
      text: "npm test",
      detailText: "$ npm test\nexit: 0\nall passed",
      status: "completed",
      activityKind: "command",
    }]} />);

    expect(screen.queryByText(/all passed/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "命令已完成 · npm test" }));
    expect(screen.getByText(/all passed/)).toBeTruthy();
    expect(document.querySelectorAll(".tool-result-details")).toHaveLength(1);
    expect(document.querySelector(".tool-result-details pre")?.parentElement?.classList.contains("tool-result-details")).toBe(true);
  });

  it("follows live tool output only while the user remains at the detail bottom", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1_000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
    const cell = {
      id: "command-live",
      kind: "process-row" as const,
      source: "codex-runtime" as const,
      title: "正在运行命令",
      text: "输出持续更新",
      detailText: "line 1\nline 2",
      status: "running",
      realtime: true,
    };
    const view = render(<AgentTranscriptPane cells={[cell]} />);
    fireEvent.click(screen.getByRole("button", { name: /正在运行命令/ }));
    const details = document.querySelector(".tool-result-details") as HTMLDivElement;
    expect(details.scrollTop).toBe(1_000);

    details.scrollTop = 100;
    fireEvent.scroll(details);
    view.rerender(<AgentTranscriptPane cells={[{ ...cell, detailText: `${cell.detailText}\nline 3` }]} />);
    expect(details.scrollTop).toBe(100);
    expect(details.textContent).toContain("line 3");
    vi.restoreAllMocks();
  });
});

function agent(id: string, providerThreadId: string, label: string, text: string): AgentWorkspaceAgent {
  return {
    id,
    roleId: "coder-agent",
    providerThreadId,
    runId: `run:${providerThreadId}`,
    label,
    status: "completed",
    summary: text,
    transcript: {
      title: label,
      items: [],
      cells: [{ id: `${id}:message`, kind: "assistant-message", source: "codex-runtime", text }],
    },
    evidenceRefs: [],
    actions: [],
  };
}

function liveTurn(status: string, threadId?: string, turnId?: string) {
  return {
    id: `live-turn:run-1:${threadId ?? "main"}:${turnId ?? "turn"}`,
    runId: "run-1",
    threadId,
    turnId,
    agentRoleId: "main-agent",
    status,
    text: "",
    events: [],
    blocks: [],
    startedAt: "2026-07-14T00:00:00.000Z",
  };
}
