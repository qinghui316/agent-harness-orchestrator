// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/web/src/App.js";

const snapshot = {
  project: { id: "repo", name: "Repo", path: "E:/repo" },
  memory: { memoryMode: "external-local", harnessReady: true },
  left: {
    repo: { branch: "main", dirty: false, path: "E:/repo" },
    topics: [{ id: "member-discount", title: "会员折扣计价", state: "active" }],
    workpads: [{ id: "member-discount", title: "会员折扣计价", state: "active", runtimeStatus: "active", selected: true, waitingDecisionCount: 1, latestRunStatus: "completed" }],
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
      codingPackages: [{
        id: "coding-package:member-discount:implementation",
        title: "会员折扣计价 implementation package",
        summary: "默认由一个 coder-agent 处理当前需求实现范围。",
        taskIds: ["T-001"],
        completedTaskIds: ["T-001"],
        acIds: ["AC-001"],
        coveredAcIds: ["AC-001"],
        missingEvidenceAcIds: [],
        recommendedRoleId: "coder-agent",
        executionUnit: "single-agent",
        assignmentStatus: "not-assigned",
        splitReadiness: "likely-single",
        splitRationale: "当前只有一个主要待执行任务，默认不拆分。",
        mergeRisk: "单 agent work package 的合并风险较低；TaskGraph 用于检查覆盖和 evidence，不强制拆分 coder。",
        status: "evidence-ready",
      }],
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
          taskRun: { id: "taskrun-1", status: "completed", attempt: 1, roleId: "coder", runId: "run-1", worktreeId: "wt-1" },
          workerLease: { id: "lease-1", status: "released", workerId: "local-test", claimedAt: "2026-05-15T12:00:00.000Z", expiresAt: "2026-05-15T13:00:00.000Z" },
          blockers: [],
          nextAction: { id: "task:T-001:task.run.start", label: "运行此任务", actionType: "task.run.start", taskIds: ["T-001"], enabled: true, requiresConfirmation: true },
        }],
        changeLevelEvidence: [],
        warnings: [],
      },
      taskQueue: {
        id: "none",
        status: "none",
        totalCount: 1,
        completedCount: 0,
        nextAction: { id: "task-queue:start", label: "运行当前任务", actionType: "task.queue.start", enabled: true, requiresConfirmation: true },
        items: [],
      },
      evidence: [
        { id: "validation:run-1", source: "validation", label: "Validation passed", status: "passed" },
        { id: "audit:run-1", source: "audit", label: "Audit approved-with-notes", status: "approved-with-notes" },
      ],
      resultReview: {
        status: "ready-to-apply",
        title: "结果可应用到项目",
        summary: "已生成本地结果，验证通过，审查带备注批准。",
        worktreeId: "wt-1",
        changedFiles: ["src/pricing.ts", "tests/pricing.test.ts"],
        diffStat: " src/pricing.ts | 8 ++++++++\n tests/pricing.test.ts | 12 ++++++++++++",
        validation: { id: "validation-1", status: "passed", runId: "validation-1" },
        audit: {
          id: "audit-1",
          status: "approved-with-notes",
          runId: "audit-1",
          findingCount: 1,
          notes: ["边界金额建议人工复核。"],
          artifact: "harness/runs/audit-1/audit.md",
        },
        applyReadiness: { ready: true, label: "可以应用到项目", blockingIssues: [], warnings: [] },
        evidence: [
          { id: "validation:validation-1", label: "验证：passed", status: "passed", runId: "validation-1" },
          { id: "audit:audit-1", label: "审查：approved-with-notes", status: "approved-with-notes", runId: "audit-1" },
        ],
      },
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
      background: {
        totalCount: 1,
        runningCount: 0,
        queuedCount: 0,
        blockedCount: 0,
        waitingDecisionCount: 0,
        items: [],
      },
      memoryIsolation: {
        projectStableNamespace: "project/stable",
        currentChangeNamespace: "change/member-discount",
        runNamespaces: ["run/run-1"],
        agentSessionNamespace: "agent/{roleId}/session/{sessionId}",
        relatedWorkpads: [],
        stableFactSources: ["applied source changes", "accepted spec / plan / tasks"],
        writeBoundaries: ["coder-agent writes assigned worktree proposal and run artifacts only"],
        warnings: ["Running Workpad proposals, diffs, stdout/stderr, JSONL, and process metadata are not project stable facts."],
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
    decisionInspector: {
      primary: {
        id: "approval:close:member-discount",
        kind: "close-gate",
        title: "确认完成需求对话",
        summary: "关闭已完成变更。",
        userStatus: "waiting-confirmation",
        resultSummary: "这个需求对话可以结束并归档。",
        recommendation: "同意会完成并归档这个需求对话。",
        explanation: "归档是需求生命周期收口，之后仍可从历史查看。",
        severity: "info",
        changeId: "member-discount",
        targetId: "member-discount",
        actions: [{
          id: "accept:close:member-discount",
          label: "同意",
          kind: "approval",
          approvalId: "close:member-discount",
          action: { actionId: "change.close", label: "同意", command: "change", args: ["close", "repo"], mutates: true, requiresConfirmation: true },
          enabled: true,
          requiresConfirmation: true,
        }],
      },
      related: [],
      history: [{
        id: "decision:decision-1",
        kind: "history",
        title: "接受 Spec",
        summary: "已接受 Spec proposal",
        severity: "info",
        targetId: "proposal-1",
        timestamp: "2026-05-15T12:00:00.000Z",
        actions: [],
      }],
    },
    confirmationQueue: {
      primary: {
        id: "confirm:close:member-discount",
        kind: "planning-confirm",
        conversationId: "member-discount",
        changeId: "member-discount",
        summary: "这个需求对话可以结束并归档。",
        whyNeedsConfirmation: "确认完成需求对话",
        confirmEffect: "同意会完成并归档这个需求对话。",
        riskSummary: "归档后仍可从历史查看。",
        evidenceRefs: [],
        actions: [{
          id: "accept:close:member-discount",
          label: "同意",
          kind: "approval",
          approvalId: "close:member-discount",
          action: { actionId: "change.close", label: "同意", command: "change", args: ["close", "repo"], mutates: true, requiresConfirmation: true },
          enabled: true,
          requiresConfirmation: true,
        }],
        primary: true,
        status: "pending",
      },
      current: [],
      otherDemands: [],
      maintenance: [],
      history: [],
    },
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
    expect(screen.getByText("当前理解")).toBeTruthy();
    expect(screen.getByText(/我已经整理了本轮实现结果/)).toBeTruthy();
    expect(screen.getByText("查看详情与证据")).toBeTruthy();
    expect(screen.queryByText("目标与当前理解")).toBeNull();
    expect(screen.queryByText("推荐角色：coder-agent")).toBeNull();
    expect(screen.queryByText("执行范围")).toBeNull();
    expect(screen.queryByText("任务清单")).toBeNull();
    const primarySurface = document.querySelector(".timeline-panel")?.textContent ?? "";
    for (const forbidden of ["Workpad", "Change-level evidence", "TaskRun", "WorkerLease", "audit-blocked", "queue blocked", "Plan mode", "AC ", "Tasks", "Agent 循环", "latest-bundle", "planning-agent"]) {
      expect(primarySurface).not.toContain(forbidden);
    }
    fireEvent.click(screen.getByText("查看详情与证据"));
    expect(screen.getByText("目标与当前理解")).toBeTruthy();
    expect(screen.getByText("推荐角色：coder-agent")).toBeTruthy();
    expect(screen.getByText("执行范围")).toBeTruthy();
    expect(screen.getByText("执行粒度：单一 coder-agent")).toBeTruthy();
    expect(screen.queryByText("运行 Package")).toBeNull();
    expect(screen.queryByText("并行执行")).toBeNull();
    expect(screen.getByText("任务清单")).toBeTruthy();
    expect(screen.getByText("证据与决策")).toBeTruthy();
    const resultReviewCard = screen.getByTestId("result-review-card");
    expect(resultReviewCard).toBeTruthy();
    expect(within(resultReviewCard).getByText("结果可应用到项目")).toBeTruthy();
    expect(within(resultReviewCard).getByText("src/pricing.ts")).toBeTruthy();
    expect(within(resultReviewCard).getByText(/边界金额建议人工复核/)).toBeTruthy();
    expect(screen.getAllByText("关闭已完成变更。").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("在 Repo 中开始新对话")).toBeTruthy();
    expect(screen.getByLabelText("搜索已加载对话")).toBeTruthy();
    expect(screen.getAllByText("项目").length).toBeGreaterThan(0);
    expect(screen.getByText("Repo")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.queryByText("远程项目")).toBeNull();
    expect(screen.getByText("需要你确认")).toBeTruthy();
    expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "对话" }));
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
    expect(screen.getByText("生成执行方案")).toBeTruthy();
    expect(screen.getByText("生成需求说明")).toBeTruthy();
    expect(screen.queryByText("运行 Code")).toBeNull();
    expect((screen.getByText("生成需求说明") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("当前需要你决定")).toBeTruthy();
    expect(screen.getByText("结果摘要")).toBeTruthy();
    expect(screen.getByText("推荐动作")).toBeTruthy();
    expect(screen.getByText("接受需求说明")).toBeTruthy();
    expect(screen.getByText("刷新状态")).toBeTruthy();
    expect(screen.queryByText("更多")).toBeNull();
    expect(screen.queryByText("稍后")).toBeNull();
    expect(screen.getByText("记忆：external-local")).toBeTruthy();
    expect(screen.getByText("当前需求：会员折扣计价")).toBeTruthy();
    fireEvent.click(screen.getByText("执行证据"));
    expect(screen.getAllByText("代码实现").length).toBeGreaterThan(0);
    expect(screen.getByText("运行阶段")).toBeTruthy();
    expect(screen.getByText("模型事件转录")).toBeTruthy();
    expect(screen.getByText("AI 最终输出")).toBeTruthy();
    expect(screen.getByText("查看原始日志")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();

    fireEvent.click(screen.getAllByText("同意")[0] as HTMLElement);
    expect(screen.getByText("确认")).toBeTruthy();
    fireEvent.click(screen.getByText("确认"));
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
    fireEvent.click(screen.getByRole("button", { name: "对话" }));
    await waitFor(() => expect(screen.getByText("我会检查现有实现。")).toBeTruthy());
    expect(document.querySelectorAll("[data-testid='assistant-block-command-group']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='assistant-block-command']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='assistant-block-usage']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='assistant-block-error']")).toHaveLength(1);
  });

  it("renders PR provider guidance without a fake create button when remote handoff is unavailable", async () => {
    const landingSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "pr-draft:provider:landing-worktree-abc123",
            kind: "pr-draft",
            conversationId: "member-discount",
            changeId: "member-discount",
            landingPackageId: "landing-worktree-abc123",
            summary: "当前项目没有配置 Git remote。",
            whyNeedsConfirmation: "远端 PR 能力未配置。",
            confirmEffect: "配置 Git remote、安装 GitHub CLI，并运行 gh auth login 后才能创建 Draft PR。",
            riskSummary: "AHO 不会伪造创建 PR；provider ready 前不会显示创建 PR 草稿按钮。",
            evidenceRefs: ["project://.agent-harness/workbench/landing/landing-worktree-abc123/merge-review.md"],
            actions: [{
              id: "evidence:merge-review",
              label: "查看证据",
              kind: "evidence",
              enabled: true,
              requiresConfirmation: false,
              artifact: "project://.agent-harness/workbench/landing/landing-worktree-abc123/merge-review.md",
            }],
            primary: true,
            status: "passed",
          },
          current: [],
          otherDemands: [],
          maintenance: [],
          history: [],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : landingSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("远端 PR 能力未配置。")).toBeTruthy());
    expect(screen.getAllByText("查看证据").length).toBeGreaterThan(0);
    expect(screen.queryByText("创建 PR 草稿")).toBeNull();
    expect(screen.queryByText("推送")).toBeNull();
    expect(screen.queryByText("远程合并")).toBeNull();
  });

  it("renders a single Draft PR confirmation when provider is ready", async () => {
    const prReadySnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "pr-draft:create:landing-worktree-abc123",
            kind: "pr-draft",
            conversationId: "member-discount",
            changeId: "member-discount",
            landingPackageId: "landing-worktree-abc123",
            summary: "提交/PR 前检查已通过，可以创建 Draft PR。",
            whyNeedsConfirmation: "需要你确认是否创建远端 Draft PR。",
            confirmEffect: "会创建或更新远端分支并创建 Draft PR；不会 merge、land 或启用自动合并。",
            riskSummary: "创建 Draft PR 会产生本地提交并 push 到远端分支。",
            evidenceRefs: ["project://.agent-harness/workbench/landing/landing-worktree-abc123/merge-review.md"],
            actions: [{
              id: "pr-draft-create:landing-worktree-abc123",
              label: "创建 PR 草稿",
              kind: "workflow-action",
              actionType: "pr-draft.create",
              landingPackageId: "landing-worktree-abc123",
              enabled: true,
              requiresConfirmation: true,
            }],
            primary: true,
            status: "pending",
          },
          current: [],
          otherDemands: [],
          maintenance: [],
          history: [],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : prReadySnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("需要你确认是否创建远端 Draft PR。")).toBeTruthy());
    expect(screen.getByRole("button", { name: /创建 PR 草稿/ })).toBeTruthy();
    expect(screen.queryByText("merge queue")).toBeNull();
    expect(screen.queryByText("auto merge")).toBeNull();
  });

  it("renders a ready-for-review confirmation without merge controls", async () => {
    const reviewReadySnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "pr-review:pr-draft-abc123:landing-worktree-abc123",
            kind: "pr-review",
            conversationId: "member-discount",
            changeId: "member-discount",
            landingPackageId: "landing-worktree-abc123",
            summary: "Draft PR 已准备好提交人工评审。",
            whyNeedsConfirmation: "需要你确认是否提交人工评审。",
            confirmEffect: "会将 Draft PR 标记为 Ready for Review；不会 merge、land 或启用自动合并。",
            riskSummary: "提交后进入人工评审，后续反馈仍回到当前需求对话处理。",
            evidenceRefs: ["project://.agent-harness/workbench/pr-review/pr-review-abc/pr-review-summary.md"],
            actions: [{
              id: "pr-review-submit:landing-worktree-abc123",
              label: "提交人工评审",
              kind: "workflow-action",
              actionType: "pr-review.submit",
              landingPackageId: "landing-worktree-abc123",
              enabled: true,
              requiresConfirmation: true,
            }],
            primary: true,
            status: "pending",
          },
          current: [],
          otherDemands: [],
          maintenance: [],
          history: [],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : reviewReadySnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("需要你确认是否提交人工评审。")).toBeTruthy());
    expect(screen.getByRole("button", { name: /提交人工评审/ })).toBeTruthy();
    expect(screen.getByText("会将 Draft PR 标记为 Ready for Review；不会 merge、land 或启用自动合并。")).toBeTruthy();
    expect(screen.queryByText("merge queue")).toBeNull();
    expect(screen.queryByText("auto merge")).toBeNull();
    expect(screen.queryByText("land")).toBeNull();
  });

  it("shows a blocked queue as the primary decision instead of a generic approval list", async () => {
    const blockedSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          taskQueue: {
            id: "queue-blocked",
            status: "blocked",
            currentTaskId: "T-001",
            totalCount: 1,
            completedCount: 0,
            blockedReason: "T-001: 审查未通过，需要补证据。",
            nextAction: { id: "task-queue:queue-blocked:task.queue.reconcile", label: "继续处理", actionType: "task.queue.reconcile", enabled: true, requiresConfirmation: true },
            items: [{ id: "queue-blocked-item-001", taskId: "T-001", order: 1, status: "blocked", taskRunId: "taskrun-blocked" }],
          },
          nextAction: {
            id: "decision:queue-blocked:T-001:feedback",
            label: "要求修改",
            description: "T-001: 审查未通过，需要补证据。",
            kind: "feedback",
            enabled: true,
            requiresConfirmation: false,
            taskRunId: "taskrun-blocked",
          },
          taskGraph: {
            ...snapshot.center.workpad.taskGraph,
            nodes: [{
              ...snapshot.center.workpad.taskGraph.nodes[0],
              status: "blocked",
              taskRun: { id: "taskrun-blocked", status: "blocked", attempt: 1, roleId: "coder", runId: "run-blocked", worktreeId: "wt-blocked", blockedReason: "审查未通过，需要补证据。" },
              blockers: ["审查未通过，需要补证据。"],
              nextAction: { id: "task:T-001:task.run.retry:taskrun-blocked", label: "要求修改", actionType: "task.run.retry", taskIds: ["T-001"], taskRunId: "taskrun-blocked", enabled: true, requiresConfirmation: true },
            }],
          },
        },
      },
      right: {
        ...snapshot.right,
        decisionInspector: {
          primary: {
            id: "queue:queue-blocked:blocked",
            kind: "queue-blocker",
            title: "任务暂停：T-001",
            summary: "T-001: 审查未通过，需要补证据。",
            userStatus: "needs-rework",
            resultSummary: "任务暂停在 T-001。",
            recommendation: "主对话会接收失败原因；你可以要求修改，系统会把反馈绑定到该任务结果。",
            explanation: "执行状态仍用于恢复和归因；你只需要处理当前暂停的任务。",
            severity: "blocking",
            changeId: "member-discount",
            taskId: "T-001",
            taskRunId: "taskrun-blocked",
            queueRunId: "queue-blocked",
            runId: "run-blocked",
            actions: [
              { id: "feedback:taskrun-blocked", label: "要求修改", kind: "feedback", enabled: true, requiresConfirmation: false },
              { id: "evidence:run-blocked", label: "查看证据", kind: "evidence", enabled: true, requiresConfirmation: false, runId: "run-blocked" },
              { id: "abandon:member-discount", label: "放弃", kind: "workflow-action", actionType: "change.abandon", enabled: true, requiresConfirmation: true },
            ],
          },
          related: [],
          history: [{
            id: "approval:audit-old-approved",
            kind: "history",
            title: "审查证据可接受：audit-old-approved",
            summary: "旧审查证据",
            severity: "info",
            timestamp: "2026-05-15T12:00:00.000Z",
            actions: [],
          }],
        },
        confirmationQueue: {
          primary: {
            id: "confirm:queue:queue-blocked:blocked",
            kind: "request-changes",
            conversationId: "member-discount",
            changeId: "member-discount",
            runId: "run-blocked",
            summary: "T-001: 审查未通过，需要补证据。",
            whyNeedsConfirmation: "任务暂停：T-001",
            confirmEffect: "主对话会接收失败原因；你可以要求修改，系统会把反馈绑定到该任务结果。",
            riskSummary: "执行状态仍用于恢复和归因；你只需要处理当前暂停的任务。",
            evidenceRefs: [],
            actions: [
              { id: "feedback:taskrun-blocked", label: "要求修改", kind: "feedback", enabled: true, requiresConfirmation: false },
              { id: "evidence:run-blocked", label: "查看证据", kind: "evidence", enabled: true, requiresConfirmation: false },
            ],
            primary: true,
            status: "pending",
          },
          current: [],
          otherDemands: [],
          maintenance: [],
          history: [],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions/live")) return sseResponse([["snapshot", blockedSnapshot], ["done", { status: "completed" }]]);
      return jsonResponse(url.includes("/stream/") ? stream : blockedSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("decision-inspector-primary")).toBeTruthy());
    expect(screen.getByText("任务暂停：T-001")).toBeTruthy();
    expect(screen.getAllByText("审查未通过，需要补证据。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("要求修改").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("decision-inspector-primary")).getAllByText("查看证据")).toHaveLength(1);
    expect(screen.queryByText("确认")).toBeNull();
    expect(screen.getByText("查看历史决策")).toBeTruthy();
  });

  it("uses inline feedback for proposal request-changes", async () => {
    const proposalSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        decisionInspector: {
          primary: {
            id: "approval:spec:run-spec",
            kind: "spec-proposal",
            title: "Spec proposal: run-spec",
            summary: "等待接受或要求修改。",
            severity: "info",
            changeId: "member-discount",
            targetId: "run-spec",
            runId: "run-spec",
            actions: [
              { id: "accept:spec:run-spec", label: "接受 Spec", kind: "approval", approvalId: "spec:run-spec", action: { actionId: "change.spec.accept", label: "接受 Spec", command: "change", args: ["spec", "accept", "repo", "run-spec"], mutates: true, requiresConfirmation: true }, enabled: true, requiresConfirmation: true },
              { id: "feedback:spec:run-spec", label: "要求修改", kind: "feedback", approvalId: "spec:run-spec", action: { actionId: "change.spec.accept", label: "接受 Spec", command: "change", args: ["spec", "accept", "repo", "run-spec"], mutates: true, requiresConfirmation: true }, enabled: true, requiresConfirmation: false },
            ],
            rework: { mode: "inline-feedback", label: "要求修改", placeholder: "写下需要修改的点、补充约束或复审要求。" },
          },
          related: [],
          history: [],
        },
        confirmationQueue: {
          primary: {
            id: "confirm:approval:spec:run-spec",
            kind: "planning-confirm",
            conversationId: "member-discount",
            changeId: "member-discount",
            runId: "run-spec",
            resultId: "run-spec",
            summary: "等待接受或要求修改。",
            whyNeedsConfirmation: "需求说明草案: run-spec",
            confirmEffect: "确认后会更新内部需求说明。",
            riskSummary: "也可以要求修改并补充约束。",
            evidenceRefs: [],
            actions: [
              { id: "accept:spec:run-spec", label: "接受 Spec", kind: "approval", approvalId: "spec:run-spec", action: { actionId: "change.spec.accept", label: "接受 Spec", command: "change", args: ["spec", "accept", "repo", "run-spec"], mutates: true, requiresConfirmation: true }, enabled: true, requiresConfirmation: true },
              { id: "feedback:spec:run-spec", label: "要求修改", kind: "feedback", approvalId: "spec:run-spec", action: { actionId: "change.spec.accept", label: "接受 Spec", command: "change", args: ["spec", "accept", "repo", "run-spec"], mutates: true, requiresConfirmation: true }, enabled: true, requiresConfirmation: false },
            ],
            primary: true,
            status: "pending",
          },
          current: [],
          otherDemands: [],
          maintenance: [],
          history: [],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions")) return jsonResponse({ result: { status: "requested-changes" }, snapshot: proposalSnapshot });
      return jsonResponse(url.includes("/stream/") ? stream : proposalSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("需求说明草案: run-spec")).toBeTruthy());
    fireEvent.click(screen.getByText("要求修改"));
    expect(screen.getByTestId("decision-feedback-editor")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("写下需要修改的地方"), { target: { value: "补充金额舍入规则。" } });
    fireEvent.click(screen.getByText("提交反馈"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"feedback\":\"补充金额舍入规则。\""),
      }));
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"contextId\":\"confirm:approval:spec:run-spec\""),
      }));
    });
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

    await waitFor(() => expect(screen.getByTestId("workpad-view")).toBeTruthy());
    fireEvent.click(screen.getByText("查看详情与证据"));
    await waitFor(() => expect(screen.getByTestId("taskgraph-node-T-001")).toBeTruthy());
    fireEvent.click(screen.getByText("运行此任务"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions/live", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"actionType\":\"task.run.start\""),
      }));
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions/live", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"taskIds\":[\"T-001\"]"),
      }));
    });
  });

  it("runs the local TaskQueue from Workpad without exposing fake parallel controls", async () => {
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

    await waitFor(() => expect(screen.getByTestId("workpad-view")).toBeTruthy());
    fireEvent.click(screen.getByText("查看详情与证据"));
    await waitFor(() => expect(screen.getByTestId("task-queue-panel")).toBeTruthy());
    expect(screen.getByText("本地顺序执行")).toBeTruthy();
    expect(screen.queryByText(/并行执行|worker pool|多 agent 协作/)).toBeNull();
    fireEvent.click(screen.getByText("运行当前任务"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions/live", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"actionType\":\"task.queue.start\""),
      }));
    });
  });

  it("shows paused TaskQueue recovery copy and disables individual task run", async () => {
    const pausedSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          taskQueue: {
            id: "queue-1",
            status: "paused",
            currentTaskId: "T-001",
            totalCount: 1,
            completedCount: 0,
            pausedReason: "队列已暂停，等待继续。",
            nextAction: { id: "task-queue:queue-1:task.queue.start", label: "继续处理", actionType: "task.queue.start", enabled: true, requiresConfirmation: true },
            items: [{ id: "queue-1-item-001", taskId: "T-001", order: 1, status: "queued" }],
          },
          taskGraph: {
            ...snapshot.center.workpad.taskGraph,
            nodes: [{
              ...snapshot.center.workpad.taskGraph.nodes[0],
              nextAction: { id: "task:T-001:task.run.start", label: "运行此任务", actionType: "task.run.start", taskIds: ["T-001"], enabled: false, requiresConfirmation: true, disabledReason: "本地顺序执行正在运行或等待恢复。" },
              blockers: ["本地顺序执行正在运行或等待恢复。"],
            }],
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : pausedSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("workpad-view")).toBeTruthy());
    fireEvent.click(screen.getByText("查看详情与证据"));
    await waitFor(() => expect(screen.getByText("队列已暂停，等待继续。")).toBeTruthy());
    expect(screen.getByText("继续处理")).toBeTruthy();
    expect((screen.getByText("运行此任务") as HTMLButtonElement).disabled).toBe(true);
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
    fireEvent.click(screen.getByLabelText("项目详情"));
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByText("仓库")).toBeTruthy();
    expect(screen.getByText("记忆")).toBeTruthy();
    expect(screen.getByText("external-local")).toBeTruthy();
    expect(screen.getByText("刷新项目")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();
  });

  it("keeps background demand and memory diagnostics out of the primary conversation surface", async () => {
    const multiSnapshot = {
      ...snapshot,
      left: {
        ...snapshot.left,
        workpads: [
          { id: "member-discount", title: "会员折扣计价", state: "active", runtimeStatus: "running", selected: true, waitingDecisionCount: 1, latestRunStatus: "running", latestRunId: "run-member-1" },
          { id: "shipping-rule", title: "配送规则调整", state: "active", runtimeStatus: "running", selected: false, waitingDecisionCount: 0, latestRunStatus: "running", latestRunId: "run-shipping-1" },
        ],
      },
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          background: {
            totalCount: 2,
            runningCount: 1,
            queuedCount: 0,
            blockedCount: 0,
            waitingDecisionCount: 0,
            items: [
              { id: "shipping-rule", title: "配送规则调整", state: "active", runtimeStatus: "running", selected: false, waitingDecisionCount: 0, latestRunStatus: "running", latestRunId: "run-shipping-1" },
            ],
          },
          memoryIsolation: {
            ...snapshot.center.workpad.memoryIsolation,
            relatedWorkpads: [
              { changeId: "shipping-rule", title: "配送规则调整", status: "running", latestRunId: "run-shipping-1", factBoundary: "local-evidence-only" },
            ],
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : multiSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("workpad-view")).toBeTruthy());
    expect(screen.getAllByText("配送规则调整").length).toBeGreaterThan(0);
    expect(screen.queryByText(/后台需求：1 个处理中/)).toBeNull();
    expect(screen.queryByText("记忆边界")).toBeNull();
    expect(screen.queryByText("发送给当前执行")).toBeNull();
    expect(screen.queryByText("停止并按这条修改")).toBeNull();
    expect(screen.queryByText("新需求对话")).toBeNull();
    expect(screen.getByTitle("停止当前执行")).toBeTruthy();
    fireEvent.click(screen.getByText("查看详情与证据"));
    expect(screen.getByText("后台需求")).toBeTruthy();
    expect(screen.getByText("记忆边界")).toBeTruthy();
    expect(screen.getByText(/project\/stable/)).toBeTruthy();
    expect(screen.getByText(/change\/member-discount/)).toBeTruthy();
    expect(screen.getAllByText(/配送规则调整 · 处理中/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/worker pool|并行 worktree|merge queue/)).toBeNull();
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
    expect(screen.queryByText("新对话")).toBeNull();
    fireEvent.click(screen.getByLabelText("项目菜单"));
    expect(screen.getByText("使用现有文件夹")).toBeTruthy();
    expect(screen.getByText("新建空项目")).toBeTruthy();
    expect(screen.queryByText("远程项目")).toBeNull();
    expect(screen.getByText("暂无需要确认")).toBeTruthy();
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
    fireEvent.click(screen.getByLabelText("项目菜单"));
    fireEvent.click(screen.getByText("使用现有文件夹"));
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
