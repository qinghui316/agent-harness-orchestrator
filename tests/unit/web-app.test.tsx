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
    workpad: {
      title: "会员折扣计价",
      subtitle: "Repo · 进行中 · member-discount",
      state: "active",
      intake: {
        goal: "会员用户满 100 元享 9 折",
        currentUnderstanding: "当前要完成会员折扣计价变更。",
        source: "thread",
        relatedArtifacts: ["runs/run-1/last-message.md"],
        missingInfo: [],
        confirmedConstraints: [],
        openQuestions: [],
        assumptions: [],
        pendingClarifications: [],
      },
      progress: {
        topicState: "active",
        spec: "ready",
        plan: "ready",
        tasks: "ready",
        acCount: 3,
        taskCount: 2,
        runCount: 1,
        latestRunStatus: "completed",
        validationStatus: "passed",
        auditStatus: "approved-with-notes",
      },
      tasks: [
        { id: "T-001", title: "实现会员折扣", done: true, acIds: ["AC-001"], warnings: [] },
      ],
      taskGraph: {
        source: "accepted-tasks",
        nodes: [{
          taskId: "T-001",
          title: "实现会员折扣",
          acIds: ["AC-001"],
          checked: true,
          status: "evidence-ready",
          latestEvidence: [
            { id: "run:run-1", source: "run", label: "Coder completed", status: "completed", runId: "run-1", worktreeId: "wt-1" },
            { id: "validation:run-1", source: "validation", label: "Validation passed", status: "passed", runId: "validation-1", worktreeId: "wt-1" },
          ],
          blockers: [],
          nextAction: { id: "task:T-001:code.run", label: "运行此任务", actionType: "code.run", taskIds: ["T-001"], enabled: true, requiresConfirmation: true },
        }],
        changeLevelEvidence: [],
        warnings: [],
      },
      evidence: [
        { id: "validation:run-1", source: "validation", label: "Validation passed", status: "passed" },
        { id: "audit:run-1", source: "audit", label: "Audit approved-with-notes", status: "approved-with-notes" },
      ],
      blockers: [],
      warnings: [],
      nextAction: {
        id: "approval:close:member-discount",
        label: "Close",
        description: "关闭已完成变更。",
        kind: "approval",
        enabled: true,
        requiresConfirmation: true,
        approvalId: "close:member-discount",
      },
    },
    thread: { items: [
      { id: "e1", kind: "user-message", source: "chat", label: "User", body: "会员用户满 100 元享 9 折", timestamp: "2026-05-15T12:00:00.000Z" },
      {
        id: "e2",
        kind: "plan-card",
        source: "chat",
        label: "Orchestrator plan",
        body: "生成受控计划",
        timestamp: "2026-05-15T12:00:30.000Z",
        planCard: {
          title: "会员折扣计划",
          summary: "先生成 Spec，再推进 Plan 和 Tasks。",
          steps: [{ label: "Spec", description: "生成需求验收标准。" }],
          warnings: [],
        },
        actions: [
          { actionType: "change.spec.propose", label: "生成 Spec", enabled: false, requiresConfirmation: true, disabledReason: "Spec 已存在" },
          { actionType: "change.plan.propose", label: "生成 Plan", enabled: true, requiresConfirmation: true },
          { actionType: "change.plan.propose", label: "生成 Tasks", enabled: false, requiresConfirmation: true, disabledReason: "先生成 Plan" },
          { actionType: "code.run", label: "运行 Code", enabled: false, requiresConfirmation: true, disabledReason: "先生成 Tasks" },
        ],
      },
      {
        id: "e3",
        kind: "assistant-turn",
        source: "workflow",
        label: "Code workflow",
        body: "Codex final summary 完整显示。",
        timestamp: "2026-05-15T12:01:00.000Z",
        runId: "run-1",
        blocks: [
          { id: "b1", runId: "run-1", sequence: 1, kind: "prose", timestamp: "2026-05-15T12:01:00.000Z", source: "codex", text: "Codex final summary 完整显示。" },
          { id: "b2", runId: "run-1", sequence: 2, kind: "command", timestamp: "2026-05-15T12:01:05.000Z", source: "codex", title: "Command completed", command: "npm test", preview: "测试通过", exitCode: 0 },
          { id: "b3", runId: "run-1", sequence: 3, kind: "prose", timestamp: "2026-05-15T12:01:10.000Z", source: "codex", text: "下一步可以查看验证和审查证据。" },
          { id: "b4", runId: "run-1", sequence: 4, kind: "usage", timestamp: "2026-05-15T12:01:11.000Z", source: "codex", title: "用量", text: "用量：10 input tokens · 5 output tokens" },
          { id: "b5", runId: "run-1", sequence: 5, kind: "workflow-evidence", timestamp: "2026-05-15T12:01:12.000Z", source: "validation", title: "验证：已通过", text: "commands=test", status: "passed" },
          { id: "b6", runId: "run-1", sequence: 6, kind: "workflow-evidence", timestamp: "2026-05-15T12:01:13.000Z", source: "audit", title: "审查：带备注批准", text: "0 findings", status: "approved-with-notes" },
        ],
        evidence: [
          { id: "workflow:action-code", source: "workflow", label: "Code workflow", body: "代码工作流完成。", status: "completed", runId: "run-1" },
          { id: "validation:run-1", source: "validation", label: "Validation passed", body: "commands=test", status: "passed", runId: "run-1" },
          { id: "audit:run-1", source: "audit", label: "Audit approved-with-notes", body: "0 findings", status: "approved-with-notes", runId: "run-1" },
        ],
      },
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
    { key: "codexEvents", path: "runs/run-1/codex-events.jsonl", kind: "jsonl", exists: true, preview: JSON.stringify({ type: "item.completed", item: { type: "command_execution", id: "cmd-1", command: "npm test", exit_code: 0, aggregated_output: "ok" } }) },
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
    expect(screen.getByTestId("workpad-view")).toBeTruthy();
    expect(screen.getByText("目标与当前理解")).toBeTruthy();
    expect(screen.getByText("TaskGraph")).toBeTruthy();
    expect(screen.getByText("证据与决策")).toBeTruthy();
    expect(screen.getByText("关闭已完成变更。")).toBeTruthy();
    expect(screen.getAllByText("主题").length).toBeGreaterThan(0);
    expect(screen.getByText("决策")).toBeTruthy();
    expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("线程"));
    expect(screen.getByText("用户消息")).toBeTruthy();
    expect(screen.getByText("AI 计划")).toBeTruthy();
    expect(screen.getAllByText("执行结果").length).toBeGreaterThan(0);
    const blockNodes = Array.from(document.querySelectorAll("[data-testid^='assistant-block']"));
    expect(blockNodes.map((node) => node.getAttribute("data-testid"))).toEqual(expect.arrayContaining([
      "assistant-block-prose",
      "assistant-block-command-group",
      "assistant-block-usage",
      "assistant-block-workflow-evidence",
    ]));
    expect(blockNodes.findIndex((node) => node.textContent?.includes("Codex final summary"))).toBeLessThan(blockNodes.findIndex((node) => node.textContent?.includes("npm test")));
    expect(blockNodes.findIndex((node) => node.textContent?.includes("npm test"))).toBeLessThan(blockNodes.findIndex((node) => node.textContent?.includes("下一步可以查看")));
    expect(screen.getByText("验证：已通过")).toBeTruthy();
    expect(screen.getByText("审查：带备注批准")).toBeTruthy();
    expect(screen.getByText("会员折扣计划")).toBeTruthy();
    expect(screen.getByText("生成 Plan")).toBeTruthy();
    expect(screen.getByText("生成 Spec")).toBeTruthy();
    expect(screen.getAllByText("运行 Code").length).toBeGreaterThan(0);
    expect((screen.getByText("生成 Spec") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("关闭变更")).toBeTruthy();
    expect(screen.getByText("接受 Spec")).toBeTruthy();
    expect(screen.getByText("刷新状态")).toBeTruthy();
    expect(screen.queryByText("更多")).toBeNull();
    expect(screen.queryByText("稍后")).toBeNull();
    expect(screen.getByText("记忆：external-local")).toBeTruthy();
    expect(screen.getByText("当前变更：会员折扣计价")).toBeTruthy();

    fireEvent.click(screen.getByText("Agent 循环"));
    expect(screen.getAllByText("代码实现").length).toBeGreaterThan(0);
    expect(screen.getByText("运行阶段")).toBeTruthy();
    expect(screen.getByText("模型事件转录")).toBeTruthy();
    expect(screen.getByText("AI 最终输出")).toBeTruthy();
    expect(screen.getByText("查看原始日志")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();

    fireEvent.click(screen.getByText("确认"));
    expect(screen.getByText("确认执行")).toBeTruthy();
    fireEvent.click(screen.getByText("确认执行"));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions", expect.objectContaining({ method: "POST" }));
    });
  });

  it("deduplicates persisted assistant command and usage blocks", async () => {
    const dedupeSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        thread: {
          items: [{
            id: "dedupe-turn",
            kind: "assistant-turn",
            source: "chat",
            label: "AI",
            timestamp: "2026-05-15T12:00:00.000Z",
            runId: "run-dedupe",
            blocks: [
              { id: "p1", runId: "run-dedupe", sequence: 1, kind: "prose", timestamp: "2026-05-15T12:00:00.000Z", source: "codex", text: "我会检查现有实现。" },
              { id: "err1", runId: "run-dedupe", sequence: 2, kind: "error", timestamp: "2026-05-15T12:00:00.500Z", source: "codex", title: "Error", text: "Reconnecting..." },
              { id: "err2", runId: "run-dedupe", sequence: 3, kind: "error", timestamp: "2026-05-15T12:00:00.600Z", source: "codex", title: "Codex error", text: "Reconnecting..." },
              { id: "c-start", runId: "run-dedupe", itemId: "cmd-1", sequence: 4, kind: "command", timestamp: "2026-05-15T12:00:01.000Z", source: "codex", status: "started", title: "Command started", command: "npm test" },
              { id: "c-done", runId: "run-dedupe", itemId: "cmd-1", sequence: 5, kind: "command", timestamp: "2026-05-15T12:00:02.000Z", source: "codex", status: "completed", title: "Command completed", command: "npm test", preview: "ok", exitCode: 0 },
              { id: "u1", runId: "run-dedupe", sequence: 6, kind: "usage", timestamp: "2026-05-15T12:00:03.000Z", source: "codex", text: "用量：1 input tokens · 2 output tokens" },
              { id: "u2", runId: "run-dedupe", sequence: 7, kind: "usage", timestamp: "2026-05-15T12:00:04.000Z", source: "codex", text: "用量：1 input tokens · 2 output tokens" },
            ],
          }],
        },
        agentLoop: { runs: [{ id: "run-dedupe", runtime: "codex-readonly", status: "completed" }] },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? { ...stream, run: { id: "run-dedupe", runtime: "codex-readonly", status: "completed" } } : dedupeSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("线程"));
    await waitFor(() => expect(screen.getByText("我会检查现有实现。")).toBeTruthy());
    expect(document.querySelectorAll("[data-testid='assistant-block-command-group']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='assistant-block-command']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='assistant-block-usage']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='assistant-block-error']")).toHaveLength(1);
  });

  it("runs a single TaskGraph task with taskIds in the Workbench action payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions/live")) {
        return sseResponse([
          ["snapshot", snapshot],
          ["done", { status: "completed" }],
        ]);
      }
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("taskgraph-node-T-001")).toBeTruthy());
    fireEvent.click(screen.getByText("运行此任务"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions/live", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"taskIds\":[\"T-001\"]"),
      }));
    });
  });

  it("renders clarification questions and submits answers through the intake API", async () => {
    const clarificationSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          intake: {
            ...snapshot.center.workpad.intake,
            openQuestions: ["测试范围是否要覆盖边界金额？"],
            pendingClarifications: [{
              id: "clarify-1",
              source: "aho",
              status: "pending",
              stage: "intake",
              questions: [{
                id: "q-tests",
                header: "测试范围",
                question: "是否需要覆盖会员满 100、会员未满 100 和非会员三类测试？",
                options: [{ label: "需要", description: "补全三类测试" }],
                allowFreeform: true,
              }],
            }],
          },
        },
      },
    };
    const answeredSnapshot = {
      ...clarificationSnapshot,
      center: {
        ...clarificationSnapshot.center,
        workpad: {
          ...clarificationSnapshot.center.workpad,
          intake: {
            ...clarificationSnapshot.center.workpad.intake,
            confirmedConstraints: ["测试范围需要覆盖"],
            pendingClarifications: [],
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/clarifications/clarify-1/answer")) return jsonResponse({ snapshot: answeredSnapshot });
      return jsonResponse(url.includes("/stream/") ? stream : clarificationSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("需要确认")).toBeTruthy());
    expect(screen.getByTestId("clarification-card")).toBeTruthy();
    expect(screen.getByText("是否需要覆盖会员满 100、会员未满 100 和非会员三类测试？")).toBeTruthy();
    fireEvent.click(screen.getByText("需要"));
    fireEvent.click(screen.getByText("提交回答"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/clarifications/clarify-1/answer", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("补全三类测试"),
      }));
      expect(screen.getByText("测试范围需要覆盖")).toBeTruthy();
    });
  });

  it("routes Workpad supplemental demand text through intake reanalysis before Spec", async () => {
    const intakeReadySnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          nextAction: {
            id: "next:spec",
            label: "生成 Spec",
            description: "需求已经足够清楚，可以生成 Spec proposal。",
            kind: "workflow-action",
            enabled: true,
            requiresConfirmation: false,
            actionType: "change.spec.propose",
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/intake/reanalyze")) return jsonResponse({ snapshot: intakeReadySnapshot });
      return jsonResponse(url.includes("/stream/") ? stream : intakeReadySnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    fireEvent.change(screen.getByPlaceholderText("输入问题或下一步需求"), { target: { value: "折扣金额四舍五入到分，只有会员订单参与。" } });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/intake/reanalyze", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("折扣金额四舍五入到分"),
      }));
    });
    expect(fetch).not.toHaveBeenCalledWith("/api/projects/repo/workbench/topics/member-discount/messages/live", expect.anything());
  });

  it("consumes live message SSE and keeps the composer at the work surface", async () => {
    const liveSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        thread: {
          items: [
            ...snapshot.center.thread.items,
            { id: "live-user-final", kind: "user-message", source: "chat", label: "User", body: "继续说明边界" },
            {
              id: "live-ai-final",
              kind: "assistant-turn",
              source: "chat",
              label: "AI",
              body: "完整 AI 输出已经落盘。",
              artifact: "runs/run-live/last-message.md",
              activity: [
                { kind: "status", label: "running", detail: "Codex" },
                { kind: "assistant-event", event: { runId: "run-live", kind: "status", phase: "running", title: "Codex turn running", summary: "Codex started processing the turn." } },
                { kind: "assistant-event", event: { runId: "run-live", kind: "command", phase: "completed", title: "Command completed", command: "npm test", preview: "测试通过", exitCode: 0 } },
                { kind: "assistant-event", event: { runId: "run-live", kind: "command", phase: "completed", title: "Command completed", command: "Get-Content run.json", preview: "{\"runtime\":\"codex-readonly\",\"artifacts\":{\"codexEvents\":\"runs/run-live/codex-events.jsonl\"},\"promptStack\":[\"user-message\"],\"command\":[\"codex\",\"--output-last-message\",\"x\"]}", exitCode: 0 } },
                { kind: "assistant-event", event: { runId: "run-live", kind: "usage", phase: "completed", title: "Usage recorded", summary: "10 input tokens · 5 output tokens" } },
                { kind: "tool", tool: { runId: "run-live", phase: "started", name: "Bash", command: "npm test" } },
                { kind: "tool", tool: { runId: "run-live", phase: "completed", name: "Bash", command: "npm test", isError: false, exitCode: 0 } },
                { kind: "usage", usage: { input_tokens: 10, output_tokens: 5 } },
              ],
            },
          ],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") {
        return jsonResponse({ mode: "project", directProjectId: "repo" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      }
      if (url.includes("/messages/live")) {
        return sseResponse([
          ["topic.message", { id: "live-user", type: "user.message", changeId: "member-discount", text: "继续说明边界" }],
          ["run.started", { runId: "run-live", changeId: "member-discount", runtime: "codex-readonly", actionType: "chat.ask" }],
          ["run.status", { runId: "run-live", status: "running", label: "Codex" }],
          ["tool.event", { runId: "run-live", itemId: "cmd-1", phase: "started", name: "Bash", command: "npm test" }],
          ["tool.event", { runId: "run-live", itemId: "cmd-1", phase: "completed", name: "Bash", command: "npm test", isError: false, exitCode: 0 }],
          ["assistant.event", { runId: "run-live", itemId: "cmd-1", kind: "command", phase: "completed", title: "Command completed", command: "npm test", preview: "测试通过", exitCode: 0 }],
          ["assistant.event", { runId: "run-live", kind: "usage", phase: "completed", title: "Usage recorded", summary: "10 input tokens · 5 output tokens" }],
          ["assistant.delta", { runId: "run-live", delta: "实时 AI 输出" }],
          ["usage", { runId: "run-live", usage: { input_tokens: 10, output_tokens: 5 } }],
          ["assistant.message", { id: "live-ai", type: "assistant.message", changeId: "member-discount", runId: "run-live", text: "完整 AI 输出已经落盘。" }],
          ["snapshot", liveSnapshot],
          ["done", { status: "completed" }],
        ]);
      }
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    expect(document.querySelector(".thread-header")).toBeTruthy();
    expect(document.querySelector(".topic-composer")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("输入问题或下一步需求"), { target: { value: "继续说明边界" } });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => expect(screen.getByText("完整 AI 输出已经落盘。")).toBeTruthy());
    expect(screen.getAllByText("测试通过").length).toBeGreaterThan(0);
    expect(screen.getByText("内部执行详情已记录到 Agent Loop，可在原始日志中查看。")).toBeTruthy();
    expect(screen.queryByText(/codex-events\.jsonl/)).toBeNull();
    expect(screen.getByText("Usage recorded")).toBeTruthy();
    expect(screen.queryByText("Codex turn running")).toBeNull();
    expect(screen.getAllByText("npm test").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-testid='assistant-block-usage']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='assistant-block-command']")).toHaveLength(1);
    expect(screen.getByText("查看证据：last-message.md")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/topics/member-discount/messages/live", expect.objectContaining({ method: "POST" }));
  });

  it("hides composer controls that do not have active capabilities", async () => {
    const noCodeSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        selectedTopic: { id: "member-discount", title: "会员折扣计价", state: "active", acCount: 3, taskCount: 0 },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : noCodeSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    const composer = document.querySelector(".topic-composer");
    expect(screen.queryByTitle("添加上下文")).toBeNull();
    expect(screen.queryByText("完全访问权限")).toBeNull();
    expect(screen.queryByText("Codex · AHO")).toBeNull();
    expect(composer?.textContent).not.toContain("运行 Code");
    expect(screen.getByTitle("发送")).toBeTruthy();
  });

  it("renders rich live assistant turn before canonical snapshot replacement", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") {
        return jsonResponse({ mode: "project", directProjectId: "repo" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      }
      if (url.includes("/messages/live")) {
        return sseResponse([
          ["topic.message", { id: "live-user", type: "user.message", changeId: "member-discount", text: "继续说明边界" }],
          ["run.started", { runId: "run-live", changeId: "member-discount", runtime: "codex-readonly", actionType: "chat.ask" }],
          ["run.status", { runId: "run-live", status: "running", label: "Codex" }],
          ["tool.event", { runId: "run-live", itemId: "cmd-1", phase: "started", name: "Bash", command: "npm test" }],
          ["tool.event", { runId: "run-live", itemId: "cmd-1", phase: "completed", name: "Bash", command: "npm test", isError: false, exitCode: 0 }],
          ["assistant.event", { runId: "run-live", itemId: "cmd-1", kind: "command", phase: "completed", title: "Command completed", command: "npm test", preview: "测试通过", exitCode: 0 }],
          ["assistant.event", { runId: "run-live", kind: "reasoning-summary", phase: "completed", title: "Reasoning summary", preview: "Checked existing constraints." }],
          ["assistant.delta", { runId: "run-live", delta: "实时 AI 输出" }],
          ["usage", { runId: "run-live", usage: { input_tokens: 10, output_tokens: 5 } }],
          ["done", { status: "completed" }],
        ]);
      }
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    fireEvent.change(screen.getByPlaceholderText("输入问题或下一步需求"), { target: { value: "继续说明边界" } });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => expect(screen.getByText("实时 AI 输出")).toBeTruthy());
    expect(screen.getByText("AI 只读回复")).toBeTruthy();
    expect(screen.getAllByText("测试通过").length).toBeGreaterThan(0);
    expect(screen.getByText("Reasoning summary")).toBeTruthy();
    expect(screen.getAllByText("npm test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("exit 0").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5 output tokens/).length).toBeGreaterThan(0);
  });

  it("renders operational sidebar panels for repo memory and settings", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("仓库"));
    expect(screen.getByText("分支")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    fireEvent.click(screen.getByText("记忆"));
    expect(screen.getByText("external-local")).toBeTruthy();
    fireEvent.click(screen.getByText("设置"));
    expect(screen.getByText("刷新工作台")).toBeTruthy();
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(events: Array<[string, unknown]>): Response {
  const encoder = new TextEncoder();
  const streamBody = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [event, data] of events) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(streamBody, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
