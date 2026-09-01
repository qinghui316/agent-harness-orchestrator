// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchJson: vi.fn(), postJson: vi.fn() }));
vi.mock("../../src/web/src/api.js", () => api);

import { useConversationReviewController } from "../../src/web/src/controllers/useConversationReviewController.js";
import { parseReviewCommand } from "../../src/web/src/reviewCommand.js";
import { ReviewInlineSelector } from "../../src/web/src/shell/composer.js";
import { TranscriptReviewCard } from "../../src/web/src/panels/workbench/TranscriptReadingSurface.js";
import type { ProjectGitReviewOptions } from "../../src/web/src/types.js";

describe("Conversation Review frontend owners", () => {
  it("parses only the strict Review command family", () => {
    expect(parseReviewCommand("/review")).toEqual({ kind: "open-selector" });
    expect(parseReviewCommand("/review base origin/main")).toEqual({ kind: "target", target: { type: "base-branch", branch: "origin/main" } });
    expect(parseReviewCommand("/review commit abc123 Fix title")).toEqual({ kind: "target", target: { type: "commit", sha: "abc123", title: "Fix title" } });
    expect(parseReviewCommand("/review custom focus on races")).toEqual({ kind: "target", target: { type: "custom", instructions: "focus on races" } });
    expect(parseReviewCommand("/review focus on privacy")).toEqual({ kind: "target", target: { type: "custom", instructions: "focus on privacy" } });
    expect(parseReviewCommand("/reviewer inspect")).toEqual({ kind: "not-review" });
  });

  it("fences Git options by project identity", async () => {
    const pending = new Map<string, (value: ProjectGitReviewOptions) => void>();
    api.fetchJson.mockImplementation((url: string) => new Promise<ProjectGitReviewOptions>((resolve) => pending.set(url, resolve)));
    const { result, rerender } = renderHook(
      ({ projectId }) => useConversationReviewController(controllerInput(projectId)),
      { initialProps: { projectId: "project-a" } },
    );

    await act(async () => { void result.current.openSelector(); });
    rerender({ projectId: "project-b" });
    await act(async () => { void result.current.openSelector(); });
    await act(async () => pending.get("/api/projects/project-a/git/review-options")?.(reviewOptions("project-a")));
    expect(result.current.options).toBeNull();
    await act(async () => pending.get("/api/projects/project-b/git/review-options")?.(reviewOptions("project-b")));
    expect(result.current.options?.branch).toBe("project-b");
  });

  it("clears only an accepted slash command and suppresses duplicate submission", async () => {
    let resolvePost!: (value: { projectId: string; conversationId: string }) => void;
    api.postJson.mockImplementation(() => new Promise<{ projectId: string; conversationId: string }>((resolve) => { resolvePost = resolve; }));
    const clearAcceptedCommand = vi.fn(async () => undefined);
    const navigateConversation = vi.fn(async () => undefined);
    const { result } = renderHook(() => useConversationReviewController({
      ...controllerInput("project-a"),
      clearAcceptedCommand,
      navigateConversation,
    }));

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.start({ type: "uncommitted-changes" }, "/review");
      void result.current.start({ type: "uncommitted-changes" }, "/review");
      await Promise.resolve();
    });
    expect(api.postJson).toHaveBeenCalledTimes(1);
    await act(async () => { resolvePost({ projectId: "project-a", conversationId: "conversation-created" }); await first; });
    expect(clearAcceptedCommand).toHaveBeenCalledWith("/review", "draft-revision");
    expect(navigateConversation).toHaveBeenCalledWith("project-a", "conversation-created");
    expect(navigateConversation.mock.invocationCallOrder[0]).toBeLessThan(clearAcceptedCommand.mock.invocationCallOrder[0]!);

    api.postJson.mockResolvedValueOnce({ projectId: "project-a", conversationId: "conversation-created-2" });
    await act(async () => result.current.start({ type: "uncommitted-changes" }));
    expect(clearAcceptedCommand).toHaveBeenCalledTimes(1);
  });

  it("owns keyboard focus and supports Arrow and Escape navigation", () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(<ReviewInlineSelector options={reviewOptions("project-a")} loading={false} submitting={false} onClose={onClose} onStart={onStart} />);
    const selector = screen.getByRole("dialog", { name: "选择代码审查方式" });
    expect(document.activeElement).toBe(selector);
    fireEvent.keyDown(selector, { key: "ArrowDown" });
    fireEvent.keyDown(selector, { key: "Enter" });
    expect(onStart).toHaveBeenCalledWith({ type: "uncommitted-changes" });
    fireEvent.keyDown(selector, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens only safe project-relative links from a Review card", () => {
    const onOpenProjectFile = vi.fn();
    render(<TranscriptReviewCard
      cell={{
        id: "review-card",
        kind: "review-card",
        source: "provider-runtime",
        title: "审查未提交改动",
        text: "[source](src/source.ts:7-9), plain.ts:11-12, and [external](https://example.test/review)",
        status: "completed",
        isError: false,
      }}
      onOpenProjectFile={onOpenProjectFile}
    />);

    fireEvent.click(screen.getByRole("button", { name: "source" }));
    expect(onOpenProjectFile).toHaveBeenCalledWith("src/source.ts");
    fireEvent.click(screen.getByRole("button", { name: "plain.ts:11-12" }));
    expect(onOpenProjectFile).toHaveBeenCalledWith("plain.ts");
    expect(screen.queryByRole("button", { name: "external" })).toBeNull();
  });
});

function controllerInput(projectId: string) {
  return {
    projectId,
    productMode: "agent" as const,
    conversationId: null,
    providerId: "codex",
    expectedTimelineRevision: null,
    running: false,
    queue: { snapshot: null, loading: false, enqueue: vi.fn() },
    flushDraft: vi.fn(async () => "draft-revision"),
    clearAcceptedCommand: vi.fn(async () => undefined),
    navigateConversation: vi.fn(async () => undefined),
    onError: vi.fn(),
  };
}

function reviewOptions(projectId: string): ProjectGitReviewOptions {
  return {
    generation: `${projectId}:generation`,
    isGitRepository: true,
    branch: projectId,
    head: "a".repeat(40),
    dirty: true,
    branches: [{ name: "origin/main", sha: "c".repeat(40) }],
    commits: [{ sha: "b".repeat(40), shortSha: "bbbbbbb", summary: "Review me", timestamp: "2026-09-01T00:00:00.000Z" }],
  };
}
