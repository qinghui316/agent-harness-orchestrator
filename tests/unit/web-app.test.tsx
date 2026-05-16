// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/web/src/App.js";

const snapshot = {
  project: { id: "repo", name: "Repo", path: "E:/repo" },
  memory: { memoryMode: "external-local", harnessReady: true },
  left: {
    repo: { branch: "main", dirty: false, path: "E:/repo" },
    topics: [{ id: "member-discount", title: "会员折扣计价", state: "active" }],
  },
  center: {
    selectedTopic: { id: "member-discount", title: "会员折扣计价", state: "active", acCount: 3, taskCount: 2 },
    thread: { events: [
      { id: "e1", type: "change.created", label: "会员用户满 100 元享 9 折", timestamp: "2026-05-15T12:00:00.000Z" },
      { id: "e2", type: "validation.passed", label: "commands=test", timestamp: "2026-05-15T12:01:00.000Z" },
    ] },
    agentLoop: { runs: [{ id: "run-1", runtime: "coder-codex", status: "completed" }] },
  },
  right: {
    approvals: [{
      id: "close:member-discount",
      kind: "change-close",
      label: "关闭变更",
      severity: "info",
      action: { actionId: "change.close", label: "Close", command: "change", args: ["close", "repo"], mutates: true, requiresConfirmation: true },
    }],
    decisions: [{
      id: "decision-1",
      kind: "change.spec.accept",
      label: "接受 Spec",
      status: "accepted",
      summary: "已接受 Spec proposal",
      targetId: "proposal-1",
      updatedAt: "2026-05-15T12:00:00.000Z",
      completedAt: "2026-05-15T12:00:00.000Z",
    }],
  },
  harnessGaps: [],
  warnings: [],
};

const stream = {
  run: { id: "run-1", runtime: "coder-codex", status: "completed" },
  live: false,
  events: [{ id: "r1", type: "run.completed", label: "run.completed", timestamp: "2026-05-15T12:00:00.000Z" }],
  artifacts: [
    { key: "events", path: "runs/run-1/events.jsonl", kind: "jsonl", exists: true, preview: "run.completed" },
    { key: "stdout", path: "runs/run-1/stdout.log", kind: "log", exists: true, preview: "ok" },
    { key: "lastMessage", path: "runs/run-1/last-message.md", kind: "markdown", exists: true, preview: "done" },
    { key: "diff", path: "runs/run-1/diff.patch", kind: "patch", exists: true, preview: "+ discount" },
  ],
  diagnostics: [],
};

describe("Workbench web app", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") {
        return new Response(JSON.stringify({ mode: "project", directProjectId: "repo" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/projects") {
        return new Response(JSON.stringify({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(url.includes("/stream/") ? stream : snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders Chinese workbench panes and replay artifacts", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    expect(screen.getAllByText("主题").length).toBeGreaterThan(0);
    expect(screen.getByText("决策")).toBeTruthy();
    expect(screen.getByText("已完成")).toBeTruthy();
    expect(screen.getByText("需求意图")).toBeTruthy();
    expect(screen.getByText("验证通过")).toBeTruthy();
    expect(screen.getByText("关闭变更")).toBeTruthy();
    expect(screen.getByText("接受 Spec")).toBeTruthy();
    expect(screen.getAllByText("状态").length).toBeGreaterThan(0);
    expect(screen.getByText("更多")).toBeTruthy();
    expect(screen.getByText("记忆：external-local")).toBeTruthy();
    expect(screen.getByText("当前变更：会员折扣计价")).toBeTruthy();

    fireEvent.click(screen.getByText("确认"));
    expect(screen.getByText("确认执行")).toBeTruthy();
    fireEvent.click(screen.getByText("确认执行"));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions", expect.objectContaining({ method: "POST" }));
    });
  });

  it("renders sidebar project onboarding when no direct project is selected", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") {
        return new Response(JSON.stringify({ mode: "app", directProjectId: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: false, harness: { readiness: "missing" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("选择一个项目开始")).toBeTruthy());
    expect(screen.getByText("添加")).toBeTruthy();
    expect(screen.getByText("新建")).toBeTruthy();
    expect(screen.getByText("暂无待确认动作")).toBeTruthy();
    fireEvent.click(screen.getByText("Repo"));
    await waitFor(() => expect(screen.getByText("初始化 Harness")).toBeTruthy());
  });

  it("adds an existing project from the native folder picker", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") {
        return new Response(JSON.stringify({ mode: "app", directProjectId: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/dialog/open-folder") {
        return new Response(JSON.stringify({ path: "E:/picked", canceled: false, supported: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/projects" && init?.method === "POST") {
        return new Response(JSON.stringify({ project: { id: "picked", name: "Picked", path: "E:/picked" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ projects: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("选择一个项目开始")).toBeTruthy());
    fireEvent.click(screen.getByText("添加"));
    fireEvent.click(screen.getByText("选择文件夹添加"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/dialog/open-folder", expect.objectContaining({ method: "POST" }));
      expect(fetch).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("E:/picked"),
      }));
    });
  });
});
