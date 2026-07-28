// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorkbenchSnapshot } from "../../src/web/src/controllers/useProjectConversationSession.js";
import { ProjectConversationSidebar } from "../../src/web/src/shell/sidebar.js";
import type { ProjectStatus, Snapshot } from "../../src/web/src/types.js";

afterEach(cleanup);

describe("Conversation sidebar rename", () => {
  it("saves once on Enter even when blur follows", async () => {
    const rename = vi.fn(async () => undefined);
    renderSidebar(rename);
    fireEvent.click(screen.getByLabelText("Old title 会话菜单"));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = screen.getByLabelText("重命名 Old title");
    fireEvent.change(input, { target: { value: "New title" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1));
    expect(rename).toHaveBeenCalledWith("repo-1", "conv-1", "New title");
  });

  it("restores the prior title and keeps an inline error after failure", async () => {
    const rename = vi.fn(async () => { throw new Error("rename failed"); });
    renderSidebar(rename);
    fireEvent.click(screen.getByLabelText("Old title 会话菜单"));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = screen.getByLabelText("重命名 Old title");
    fireEvent.change(input, { target: { value: "Broken title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("rename failed"));
    expect((screen.getByLabelText("重命名 Old title") as HTMLInputElement).value).toBe("Old title");
  });

  it("saves on blur and cancels on Escape", async () => {
    const rename = vi.fn(async () => undefined);
    renderSidebar(rename);
    fireEvent.click(screen.getByLabelText("Old title 会话菜单"));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    let input = screen.getByLabelText("重命名 Old title");
    fireEvent.change(input, { target: { value: "Blur title" } });
    fireEvent.blur(input);
    await waitFor(() => expect(rename).toHaveBeenCalledWith("repo-1", "conv-1", "Blur title"));

    fireEvent.click(screen.getByLabelText("Old title 会话菜单"));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    input = screen.getByLabelText("重命名 Old title");
    fireEvent.change(input, { target: { value: "Cancelled title" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("重命名 Old title")).toBeNull();
    expect(rename).toHaveBeenCalledTimes(1);
  });
});

function renderSidebar(onRenameConversation: (projectId: string, conversationId: string, title: string) => Promise<void>): void {
  const project = managedProject();
  const snapshot: Snapshot = {
    ...emptyWorkbenchSnapshot,
    project: project.project!,
    memory: { harnessReady: true },
    left: {
      ...emptyWorkbenchSnapshot.left,
      topics: [{ id: "conv-1", title: "Old title", state: "active" }],
      workpads: [{
        id: "conv-1",
        title: "Old title",
        state: "active",
        runtimeStatus: "active",
        userStatusLabel: "进行中",
        selected: true,
        waitingDecisionCount: 0,
      }],
    },
  };
  render(<ProjectConversationSidebar
    projects={[project]}
    selectedProjectId="repo-1"
    selectedTopicId="conv-1"
    snapshots={{ "repo-1": snapshot }}
    snapshot={snapshot}
    search=""
    onSearch={vi.fn()}
    expandedProjects={new Set(["repo-1"])}
    projectMenuMode="closed"
    projectDetailsId={null}
    onProjectMenuMode={vi.fn()}
    onProjectDetails={vi.fn()}
    onNewConversation={vi.fn(async () => undefined)}
    onOpenProject={vi.fn(async () => undefined)}
    onToggleProject={vi.fn(async () => undefined)}
    onChooseConversation={vi.fn(async () => undefined)}
    onHideConversation={vi.fn(async () => undefined)}
    onRenameConversation={onRenameConversation}
    onRemoveProject={vi.fn(async () => undefined)}
    onRefresh={vi.fn(async () => undefined)}
    onOpenSettings={vi.fn()}
    onOpenProjectSettings={vi.fn()}
  />);
}

function managedProject(): ProjectStatus {
  return {
    project: { id: "repo-1", name: "Repo", path: "C:/repo" },
    path: "C:/repo",
    pathExists: true,
    isGitRepo: true,
    managed: true,
    harness: { readiness: "ready" },
  };
}
