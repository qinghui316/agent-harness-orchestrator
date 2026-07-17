// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourceWorkspacePanel } from "../../src/web/src/panels/workbench/ResourceWorkspacePanel.js";
import { projectFileResourceTabs, workspaceResourceRequestScope } from "../../src/web/src/controllers/useWorkspaceResourceController.js";
import type { AgentWorkspaceAgent, TextDocumentResource, WorkspaceResourceTab } from "../../src/web/src/types.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Resource workspace panel", () => {
  it("keeps project files while retiring conversation-scoped Agent and Plan tabs", () => {
    const tabs: WorkspaceResourceTab[] = [
      { resourceId: "agent:one", target: { kind: "agent", conversationId: "conversation-1", agentSurfaceId: "agent:one" } },
      { resourceId: "plan:one", target: { kind: "document", conversationId: "conversation-1", documentId: "plan:one" } },
      { resourceId: "project-file:notes.md", target: { kind: "project-file", relativePath: "notes.md" } },
    ];

    expect(projectFileResourceTabs(tabs)).toEqual([tabs[2]]);
    expect(workspaceResourceRequestScope("repo", "conversation-1", tabs[2]!.target)).toBe(
      workspaceResourceRequestScope("repo", "conversation-2", tabs[2]!.target),
    );
    expect(workspaceResourceRequestScope("repo", "conversation-1", tabs[1]!.target)).not.toBe(
      workspaceResourceRequestScope("repo", "conversation-2", tabs[1]!.target),
    );
  });

  it("renders mixed stable tabs while keeping documents read-only and Agent composer behavior", () => {
    const agent = planningAgent();
    const tabs: WorkspaceResourceTab[] = [
      { resourceId: `agent:${agent.id}`, target: { kind: "agent", conversationId: "conversation-1", agentSurfaceId: agent.id } },
      { resourceId: "plan-document-1", target: { kind: "document", conversationId: "conversation-1", documentId: "plan-document-1" } },
      { resourceId: "project-file:docs/notes.md", target: { kind: "project-file", relativePath: "docs/notes.md" } },
    ];
    const documents: Record<string, TextDocumentResource> = {
      "plan-document-1": document("plan-document-1", "plan", "实现计划", "# Plan\n\n完成资源工作区。"),
      "project-file:docs/notes.md": document("project-file:docs/notes.md", "markdown-file", "notes.md", "# Notes"),
    };
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const props = {
      workspace: { selectedAgentId: agent.id, agents: [agent] },
      agentTranscripts: { [agent.id]: agentTranscript() },
      conversationId: "conversation-1",
      tabs,
      documents,
      loadingResourceIds: [],
      resourceErrors: {},
      agentDrafts: {},
      pendingAgentMessages: {},
      onAgentDraftChange: vi.fn(),
      onSubmitAgentMessage: vi.fn(async () => undefined),
      onSelectResource: onSelect,
      onCloseResource: onClose,
      onBack: vi.fn(),
      onLoadEarlierAgentTranscript: vi.fn(async () => undefined),
      modelLabel: "default",
    };
    const view = render(<ResourceWorkspacePanel {...props} selectedResourceId="plan-document-1" />);
    const tablist = screen.getByRole("tablist", { name: "已打开的资源" });
    expect(within(tablist).getByRole("tab", { name: "打开 Plan Agent" })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: "打开 实现计划" })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: "打开 notes.md" })).toBeTruthy();
    expect(screen.getByTestId("agent-workspace-panel").getAttribute("data-resource-workspace")).toBe("true");
    expect(screen.getByTestId("resource-document-surface").textContent).toContain("完成资源工作区");
    expect(screen.queryByTestId("agent-workspace-composer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭 notes.md" }));
    expect(onClose).toHaveBeenCalledWith("project-file:docs/notes.md");

    view.rerender(<ResourceWorkspacePanel {...props} selectedResourceId={`agent:${agent.id}`} />);
    expect(screen.getByTestId("agent-workspace-transcript").textContent).toContain("原有 Agent 对话");
    expect(screen.getByTestId("agent-workspace-composer")).toBeTruthy();
    view.rerender(<ResourceWorkspacePanel {...props} selectedResourceId="plan-document-1" />);
    expect(screen.getByTestId("agent-workspace-composer").closest("section")?.hidden).toBe(true);
    view.rerender(<ResourceWorkspacePanel {...props} selectedResourceId={`agent:${agent.id}`} />);
    expect(screen.getByPlaceholderText("给当前 Agent 发送反馈")).toBeTruthy();
  });
});

function planningAgent(): AgentWorkspaceAgent {
  return {
    id: "agent:codex:thread:planner",
    roleId: "planning-agent",
    providerId: "codex",
    parentAgentId: "main-agent",
    label: "Plan Agent",
    status: "completed",
    summary: "完成",
    evidenceRefs: [],
    actions: [],
  };
}

function agentTranscript() {
  return {
    title: "Plan Agent",
    items: [],
    cells: [{ id: "cell-1", kind: "assistant-message" as const, source: "provider-runtime" as const, text: "原有 Agent 对话" }],
  };
}

function document(resourceId: string, kind: TextDocumentResource["kind"], title: string, content: string): TextDocumentResource {
  return {
    resourceId,
    kind,
    title,
    language: "markdown",
    content,
    revision: "revision-1",
    readOnly: true,
    target: kind === "plan"
      ? { kind: "document", conversationId: "conversation-1", documentId: resourceId }
      : { kind: "project-file", relativePath: "docs/notes.md" },
  };
}
