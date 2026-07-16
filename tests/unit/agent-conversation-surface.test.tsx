// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalTranscriptCellsFromThreadItem } from "../../src/workbench/parent-agent-transcript.js";
import { AgentWorkspacePanel } from "../../src/web/src/panels/workbench/AgentWorkspacePanel.js";
import { AgentTranscriptPane, ParentAgentTranscriptCellView } from "../../src/web/src/panels/workbench/TranscriptReadingSurface.js";
import { blockFromAssistantEvent, mergeAssistantBlocks, normalizeTurnBlocks } from "../../src/web/src/shell/assistant-blocks.js";
import { replaceCanonicalMessageCells } from "../../src/web/src/liveTranscript.js";
import type { AgentWorkspaceAgent, AssistantTurnBlock, ParentAgentTranscript } from "../../src/web/src/types.js";

afterEach(cleanup);

describe("Agent conversation surfaces", () => {
  it("keeps provider protocol metadata out of visible blocks without inspecting command text", () => {
    const command: AssistantTurnBlock = {
      id: "canonical-command",
      runId: "run-provider",
      sequence: 1,
      kind: "command",
      timestamp: "2026-07-15T00:00:00.000Z",
      source: "provider",
      status: "completed",
      command: "provider-cli run",
      preview: '{"command":"codex --output-last-message result.md"}',
    };
    expect(normalizeTurnBlocks([command])).toEqual([expect.objectContaining({ id: command.id, preview: command.preview })]);
    expect(blockFromAssistantEvent({
      runId: "run-internal",
      kind: "status",
      phase: "updated",
      title: "turn/updated",
      summary: "provider turn metadata",
    })).toBeNull();
  });

  it("replaces one canonical message in place through repeated patches", () => {
    let transcript: ParentAgentTranscript = { title: "Demand", cells: [], items: [] };
    let owned: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      const cell = {
        id: "cell:turn:codex:attempt-1:thread-1:turn-1",
        kind: "process-row" as const,
        source: "provider-runtime" as const,
        title: "正在思考",
        text: "",
        status: "thinking",
        realtime: true,
      };
      transcript = replaceCanonicalMessageCells(transcript, owned, [cell]);
      owned = [cell.id];
      expect(transcript.cells).toHaveLength(1);
    }
    transcript = replaceCanonicalMessageCells(transcript, owned, [{
      ...transcript.cells[0]!,
      title: "已完成 · 5 秒",
      text: "已完成 · 5 秒",
      status: "completed",
      realtime: false,
    }]);
    expect(transcript.cells).toEqual([expect.objectContaining({ title: "已完成 · 5 秒", realtime: false })]);
  });

  it("keeps two turns in one attempt as separate canonical cells", () => {
    let transcript: ParentAgentTranscript = { title: "Demand", cells: [], items: [] };
    transcript = replaceCanonicalMessageCells(transcript, [], [{
      id: "cell:turn:codex:attempt-shared:thread-1:turn-1",
      kind: "process-row",
      source: "provider-runtime",
      text: "已完成 · 4 秒",
    }]);
    transcript = replaceCanonicalMessageCells(transcript, [], [{
      id: "cell:turn:codex:attempt-shared:thread-1:turn-2",
      kind: "process-row",
      source: "provider-runtime",
      text: "已完成 · 3 秒",
    }]);
    expect(transcript.cells.map((cell) => cell.id)).toEqual([
      "cell:turn:codex:attempt-shared:thread-1:turn-1",
      "cell:turn:codex:attempt-shared:thread-1:turn-2",
    ]);
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
      busy={false}
      onSelectAgent={onSelect}
      onCloseAgent={onClose}
      onBack={onBack}
      onSendAgentMessage={async () => undefined}
      providerDisplayName="Claude Code"
      modelLabel="default"
    />);
    const tabs = screen.getByRole("tablist", { name: "已打开的 Agent" });
    expect(within(tabs).getByRole("tab", { name: /Coder Agent 1/ })).toBeTruthy();
    expect(within(tabs).getByRole("tab", { name: /Coder Agent 2/ })).toBeTruthy();
    expect(screen.getByText("Coder one result")).toBeTruthy();
    fireEvent.click(within(tabs).getByRole("tab", { name: /Coder Agent 2/ }));
    expect(onSelect).toHaveBeenCalledWith(second.id);
    fireEvent.click(screen.getByRole("button", { name: "关闭 Coder Agent 1" }));
    expect(onClose).toHaveBeenCalledWith(first.id);
    fireEvent.click(screen.getByRole("button", { name: "返回工具列表" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("groups only adjacent command items and keeps canonical result copy", () => {
    const command = (id: string, sequence: number, status: "completed" | "failed", text: string): AssistantTurnBlock => ({
      id,
      itemId: id,
      providerId: "codex",
      attemptId: "attempt-command",
      runId: "run-command",
      threadId: "thread-command",
      turnId: "turn-command",
      sequence,
      kind: "command",
      timestamp: `2026-07-14T00:00:0${sequence}.000Z`,
      source: "provider",
      status,
      command: text,
      exitCode: status === "failed" ? 1 : 0,
      isError: status === "failed",
    });
    const cells = canonicalTranscriptCellsFromThreadItem({
      id: "assistant-command-run",
      kind: "assistant-turn",
      label: "AI",
      timestamp: "2026-07-14T00:00:01.000Z",
      providerId: "codex",
      attemptId: "attempt-command",
      runId: "run-command",
      threadId: "thread-command",
      turnId: "turn-command",
      blocks: [
        command("cmd-1", 1, "completed", "npm test"),
        command("cmd-2", 2, "failed", "npm run lint"),
        { id: "prose-break", sequence: 3, kind: "prose", timestamp: "2026-07-14T00:00:03.000Z", source: "provider", text: "继续检查。" },
        command("cmd-3", 4, "completed", "npm run build"),
      ],
    });
    expect(cells.filter((cell) => cell.activityKind === "command")).toEqual([
      expect.objectContaining({ title: "运行了 2 条命令 · 1 条失败", status: "failed", isError: true }),
      expect.objectContaining({ title: "命令已完成 · npm run build", status: "completed" }),
    ]);
  });

  it("keeps tool detail collapsed and follows output only while pinned", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1_000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
    const cell = {
      id: "command-live",
      kind: "process-row" as const,
      source: "provider-runtime" as const,
      title: "正在运行命令",
      text: "输出持续更新",
      detailText: "line 1\nline 2",
      status: "running",
      realtime: true,
    };
    const view = render(<AgentTranscriptPane cells={[cell]} />);
    expect(screen.queryByText(/line 2/)).toBeNull();
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

  it("keeps failed command emphasis deterministic and opens child lifecycle rows by canonical target", () => {
    const onOpenAgent = vi.fn();
    const { rerender } = render(<ParentAgentTranscriptCellView
      cell={{
        id: "failed-command",
        kind: "process-row",
        source: "provider-runtime",
        title: "命令执行失败 · npm test",
        text: "命令执行失败 · npm test",
        status: "failed",
        isError: true,
        activityKind: "command",
      }}
      expanded={false}
      onToggleExpanded={vi.fn()}
    />);
    const failed = document.querySelector(".transcript-activity-row") as HTMLElement;
    expect(failed.classList.contains("activity-command")).toBe(true);
    expect(failed.classList.contains("tone-danger")).toBe(true);

    rerender(<ParentAgentTranscriptCellView
      cell={{
        id: "child-lifecycle",
        kind: "process-row",
        source: "provider-runtime",
        title: "Plan Agent · Sagan 正在规划",
        text: "Plan Agent · Sagan 正在规划",
        status: "processing",
        activityKind: "agent",
        targetAgentSurfaceId: "agent:codex:thread:thread-plan",
      }}
      expanded={false}
      onToggleExpanded={vi.fn()}
      onOpenAgent={onOpenAgent}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Plan Agent · Sagan 正在规划" }));
    expect(onOpenAgent).toHaveBeenCalledWith("agent:codex:thread:thread-plan");
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
      cells: [{ id: `${id}:message`, kind: "assistant-message", source: "provider-runtime", text }],
    },
    evidenceRefs: [],
    actions: [],
  };
}
