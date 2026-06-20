// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/web/src/App.js";
import { WorkpadView } from "../../src/web/src/panels/workbench/WorkpadPanel.js";
import { WorkpadDiagnosticDetails } from "../../src/web/src/panels/workbench/workpad/WorkpadDetails.js";
import { summarizeActionResult } from "../../src/workbench/actions/results.js";

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
    parentAgentTranscript: {
      title: "会员折扣计价",
      cells: [
        {
          id: "cell:user:e1",
          kind: "user-message",
          source: "user",
          timestamp: "2026-05-15T12:00:00.000Z",
          text: "会员用户满 100 元享 9 折",
        },
        {
          id: "cell:assistant:e3",
          kind: "assistant-message",
          source: "codex-runtime",
          timestamp: "2026-05-15T12:01:00.000Z",
          text: "Codex final summary 完整显示。\n\n下一步可以查看验证和审查证据。",
        },
        {
          id: "cell:command:b2",
          kind: "process-row",
          source: "codex-runtime",
          timestamp: "2026-05-15T12:01:05.000Z",
          title: "已运行命令",
          text: "已运行 1 条命令",
          status: "completed",
          detailText: "npm test\n测试通过",
        },
      ],
      items: [],
      emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
    },
    agentLoop: { runs: [{ id: "run-1", runtime: "coder-codex", status: "completed" }] },
    agentRunGraph: {
      conversationId: "member-discount",
      changeId: "member-discount",
      title: "会员折扣计价",
      summary: "主 agent 已调用规划、实现、验证和审查节点，并整理了后台维护结果。",
      lanes: [
        { id: "main", label: "主流程", description: "主 agent 用户入口" },
        { id: "roles", label: "角色执行", description: "规划、实现、验证、审查" },
        { id: "integration", label: "集成 / PR / 合并", description: "应用、远端和合并后处理" },
        { id: "maintenance", label: "后台维护", description: "记忆、文档和演进候选" },
      ],
      nodes: [
        { id: "main-agent", kind: "main-agent", lane: "main", label: "主 agent", status: "completed", summary: "负责和用户对话并分派角色。", reason: "用户入口和调度入口。", target: { projectId: "repo", conversationId: "member-discount", changeId: "member-discount" }, inputSummary: "用户提出会员折扣需求。", outputSummary: "需求已执行并生成结果。", evidenceRefs: [], attempts: [] },
        { id: "role:planning-agent", kind: "planning-agent", lane: "roles", label: "规划", roleId: "planning-agent", status: "completed", summary: "整理方案草案。", reason: "主 agent 需要把需求转成可执行方案。", target: { projectId: "repo", conversationId: "member-discount", changeId: "member-discount", roleId: "planning-agent" }, inputSummary: "当前需求。", outputSummary: "方案已确认。", evidenceRefs: [{ label: "方案", ref: "latest-bundle.md", kind: "artifact" }], attempts: [] },
        { id: "role:coder-agent", kind: "coder-agent", lane: "roles", label: "coder-agent", roleId: "coder-agent", status: "completed", summary: "已实现会员折扣。", reason: "主 agent 委派实现。", target: { projectId: "repo", conversationId: "member-discount", changeId: "member-discount", roleId: "coder-agent", runId: "run-1", worktreeId: "wt-1" }, inputSummary: "已确认方案。", outputSummary: "代码和测试已更新。", evidenceRefs: [{ label: "执行", ref: "run-1", kind: "run" }], attempts: [{ id: "run-1", status: "completed", summary: "实现完成。", evidenceRefs: [{ label: "执行", ref: "run-1", kind: "run" }] }] },
        { id: "role:validator", kind: "validator", lane: "roles", label: "validator", roleId: "validator", status: "completed", summary: "验证通过。", reason: "需要独立机械验证。", target: { projectId: "repo", conversationId: "member-discount", changeId: "member-discount", roleId: "validator", runId: "validation-1" }, inputSummary: "验收标准和 worktree。", outputSummary: "测试通过。", evidenceRefs: [{ label: "验证", ref: "validation-1", kind: "run" }], attempts: [] },
        { id: "role:auditor-agent", kind: "auditor-agent", lane: "roles", label: "auditor-agent", roleId: "auditor-agent", status: "completed", summary: "审查带备注批准。", reason: "需要独立语义审查。", target: { projectId: "repo", conversationId: "member-discount", changeId: "member-discount", roleId: "auditor-agent", runId: "audit-1" }, inputSummary: "diff 和验证证据。", outputSummary: "可应用但有注意事项。", evidenceRefs: [{ label: "审查", ref: "audit-1", kind: "run" }], attempts: [] },
        { id: "maintenance:closeout", kind: "memory-closeout", lane: "maintenance", label: "记忆 closeout", status: "completed", summary: "后台整理本次需求记忆。", reason: "终态需求需要写入维护账本。", target: { projectId: "repo", conversationId: "member-discount", changeId: "member-discount", maintenanceRunId: "maintenance-1" }, inputSummary: "终态需求证据。", outputSummary: "closeout 已记录。", evidenceRefs: [{ label: "closeout", ref: "maintenance-1", kind: "maintenance" }], attempts: [] },
      ],
      edges: [
        { id: "edge:main:planning", from: "main-agent", to: "role:planning-agent", kind: "delegates", label: "整理方案" },
        { id: "edge:planning:coder", from: "role:planning-agent", to: "role:coder-agent", kind: "continues-to", label: "确认后执行" },
        { id: "edge:coder:validator", from: "role:coder-agent", to: "role:validator", kind: "requires-evidence", label: "验证" },
        { id: "edge:validator:auditor", from: "role:validator", to: "role:auditor-agent", kind: "requires-evidence", label: "审查" },
        { id: "edge:main:maintenance", from: "main-agent", to: "maintenance:closeout", kind: "background-maintenance", label: "后台维护" },
      ],
    },
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
      if (url.includes("/workbench/projections/transcript/")) {
        return new Response(JSON.stringify(snapshot.center.parentAgentTranscript), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/workbench/projections/run-graph/")) {
        return new Response(JSON.stringify({
          ...snapshot.center.agentRunGraph,
          nodes: snapshot.center.agentRunGraph.nodes.filter((node) => node.lane !== "maintenance"),
          edges: snapshot.center.agentRunGraph.edges.filter((edge) => edge.kind !== "background-maintenance"),
        }), {
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
    expect(screen.getByTestId("main-conversation-view")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "对话" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Agent 运行图" })).toBeTruthy();
    expect(screen.getByTestId("parent-agent-transcript")).toBeTruthy();
    expect(screen.queryByTestId("open-agent-run-graph")).toBeNull();
    expect(screen.queryByText("目标与当前理解")).toBeNull();
    expect(screen.queryByText("推荐角色：coder-agent")).toBeNull();
    expect(screen.queryByText("执行范围")).toBeNull();
    expect(screen.queryByText("任务清单")).toBeNull();
    const primarySurface = document.querySelector(".timeline-panel")?.textContent ?? "";
    for (const forbidden of ["Workpad", "Change-level evidence", "TaskRun", "WorkerLease", "audit-blocked", "queue blocked", "Plan mode", "AC ", "Tasks", "Agent 循环", "latest-bundle", "planning-agent"]) {
      expect(primarySurface).not.toContain(forbidden);
    }
    expect(document.querySelector(".parent-agent-transcript")?.textContent).toContain("Codex final summary 完整显示。");
    expect(document.querySelector(".parent-agent-transcript")?.textContent).toContain("已运行 1 条命令");
    expect(document.querySelector(".parent-agent-transcript")?.textContent).not.toContain("结果摘要");
    expect(document.querySelector(".parent-agent-transcript")?.textContent).not.toContain("已生成本地结果");
    expect(screen.getByText("确认完成需求对话")).toBeTruthy();
    expect(screen.getByLabelText("在 Repo 中开始新对话")).toBeTruthy();
    expect(screen.getByLabelText("搜索已加载对话")).toBeTruthy();
    expect(screen.getAllByText("项目").length).toBeGreaterThan(0);
    expect(screen.getByText("Repo")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.queryByText("远程项目")).toBeNull();
    expect(screen.getByText("需要你确认")).toBeTruthy();
    expect(screen.getAllByTestId("parent-message-user").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("parent-message-parent-agent").length).toBeGreaterThan(0);
    expect(screen.queryByText("用户消息")).toBeNull();
    expect(screen.queryByText("AI 计划")).toBeNull();
    expect(screen.queryByText("执行结果")).toBeNull();
    expect(screen.queryByText("工具结果")).toBeNull();
    expect(screen.getByText("Codex final summary 完整显示。")).toBeTruthy();
    expect(screen.queryByText("验证：已通过")).toBeNull();
    expect(screen.queryByText("审查：带备注批准")).toBeNull();
    expect(document.querySelector(".parent-agent-transcript")?.textContent).not.toContain("生成受控计划");
    expect(screen.queryByText("运行 Code")).toBeNull();
    expect(screen.getByText("当前需要你决定")).toBeTruthy();
    expect(document.querySelector(".parent-agent-transcript")?.textContent).not.toContain("结果摘要");
    expect(screen.getByText("推荐动作")).toBeTruthy();
    expect(screen.getByText("接受需求说明")).toBeTruthy();
    expect(screen.getByText("刷新状态")).toBeTruthy();
    expect(screen.queryByText("更多")).toBeNull();
    expect(screen.queryByText("稍后")).toBeNull();
    expect(screen.getByText("记忆：external-local")).toBeTruthy();
    expect(screen.getByText("当前需求：会员折扣计价")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Agent 运行图" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Agent 运行图" }).getAttribute("aria-selected")).toBe("true"));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/projections/run-graph/member-discount"));
    expect(screen.getByTestId("agent-run-graph")).toBeTruthy();
    expect(screen.getByTestId("agent-run-node-main-agent")).toBeTruthy();
    expect(screen.getByTestId("agent-run-node-coder-agent")).toBeTruthy();
    expect(screen.queryByTestId("agent-run-node-memory-closeout")).toBeNull();
    fireEvent.click(screen.getByTestId("agent-run-node-coder-agent"));
    expect(screen.getByTestId("agent-run-node-detail")).toBeTruthy();
    expect(screen.getByText("打开原始日志")).toBeTruthy();
    fireEvent.click(screen.getByText("打开原始日志"));
    await waitFor(() => expect(screen.getByText("模型事件转录")).toBeTruthy());

    fireEvent.click(screen.getAllByText("同意")[0] as HTMLElement);
    expect(screen.getByText("确认")).toBeTruthy();
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions", expect.objectContaining({ method: "POST" }));
    });
  });

  it("renders workflow result summaries in the main thread surface", async () => {
    const controlledAdvanceResult = {
      postStepHandoff: {
        status: "next-confirmation-candidate-ready",
        executedActionType: "planning.scheduler.worker.start-next",
        nextConfirmationCandidate: {
          actionType: "planning.scheduler.worker.reconcile-result",
          readinessEvidencePrepared: true,
          executionStarted: false,
          authorizationGranted: false,
          humanConfirmationStillRequired: true,
        },
        executionStarted: false,
      },
    };
    const resultSummary = summarizeActionResult("planning.scheduler.controlled-advance.run", controlledAdvanceResult);
    const uiSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        thread: {
          items: [
            ...snapshot.center.thread.items,
            {
              id: "workflow-controlled-summary",
              kind: "assistant-turn",
              source: "workflow",
              label: "按当前建议继续一个受控步骤已完成",
              body: resultSummary,
              timestamp: "2026-06-20T12:00:00.000Z",
              status: "completed",
              actionRunId: "action-controlled-summary",
              blocks: [
                { id: "summary-prose", sequence: 1, kind: "prose", timestamp: "2026-06-20T12:00:00.000Z", source: "workflow", title: "执行结果", text: resultSummary },
                { id: "summary-evidence", sequence: 2, kind: "workflow-evidence", timestamp: "2026-06-20T12:00:00.000Z", source: "workflow", title: "执行证据", text: resultSummary, status: "completed" },
              ],
              evidence: [{ id: "workflow:action-controlled-summary", source: "workflow", label: "按当前建议继续一个受控步骤已完成", body: resultSummary, status: "completed" }],
            },
          ],
        },
        parentAgentTranscript: {
          ...snapshot.center.parentAgentTranscript,
          cells: [
            ...snapshot.center.parentAgentTranscript.cells,
            {
              id: "cell:workflow-result:summary-prose",
              kind: "assistant-message",
              source: "workflow-evidence",
              timestamp: "2026-06-20T12:00:00.000Z",
              title: "执行结果",
              text: resultSummary,
              status: "completed",
            },
          ],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(uiSnapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : uiSnapshot);
    }));

    render(<App />);

    await waitFor(() => {
      const timelineText = document.querySelector(".timeline-panel")?.textContent ?? "";
      expect(timelineText).toContain(resultSummary);
    });
    const timelineText = document.querySelector(".timeline-panel")?.textContent ?? "";
    expect(timelineText).toContain("本次执行：继续执行下一个任务");
    expect(timelineText).toContain("下一步候选：检查当前结果");
    expect(timelineText).not.toContain("derived-non-executing-workbench-handoff");
    expect(timelineText).not.toContain("artifactHash");
    expect(timelineText).not.toContain("preflight id");
    expect(timelineText.toLowerCase()).not.toContain("worker");
    expect(timelineText.toLowerCase()).not.toContain("scheduler run");
    expect(timelineText.toLowerCase()).not.toContain("slot");
    expect(timelineText.toLowerCase()).not.toContain("start-all");
    expect(timelineText.toLowerCase()).not.toContain("whole-wave");
  });

  it("renders refreshed controlled scheduler reconfirmation copy in the right confirmation card", async () => {
    const reconfirmItem = {
      id: "confirm:controlled-advance:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      summary: "当前下一步判断和步骤检查已刷新；这次仍是新的单步确认，步骤类别是：继续执行下一个任务。",
      whyNeedsConfirmation: "需要你再次确认当前页面显示的“继续执行下一个任务”；这不是自动继续。",
      confirmEffect: "服务端会重新读取当前状态，重新匹配目标和权限；匹配后只执行“继续执行下一个任务”这一当前合法步骤。",
      riskSummary: "确认后仍会立即停止；不会自动循环、批量派发、组合检查后的应用、关闭、远端落地或维护演进。",
      evidenceRefs: [
        "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md",
        "harness/changes/active/member-discount/planning/goal-loop-controller-policies/policy.md",
        "harness/changes/active/member-discount/planning/goal-loop-gate-readiness-preflights/preflight.md",
      ],
      actions: [{
        id: "workflow:planning.scheduler.controlled-advance.run:member-discount:planning.scheduler.worker.start-next:claim-reservation-expected",
        label: "按当前建议继续一个受控步骤",
        kind: "workflow-action",
        actionType: "planning.scheduler.controlled-advance.run",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-expected",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-2",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    };
    const uiSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          ...snapshot.right.confirmationQueue,
          primary: reconfirmItem,
          current: [reconfirmItem],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : uiSnapshot);
    }));

    render(<App />);

    const card = await screen.findByTestId("decision-inspector-primary");
    expect(within(card).getByText("需要你再次确认当前页面显示的“继续执行下一个任务”；这不是自动继续。")).toBeTruthy();
    expect(within(card).getByText("当前下一步判断和步骤检查已刷新；这次仍是新的单步确认，步骤类别是：继续执行下一个任务。")).toBeTruthy();
    expect(within(card).getByText("服务端会重新读取当前状态，重新匹配目标和权限；匹配后只执行“继续执行下一个任务”这一当前合法步骤。")).toBeTruthy();
    expect(within(card).getByText("确认后仍会立即停止；不会自动循环、批量派发、组合检查后的应用、关闭、远端落地或维护演进。")).toBeTruthy();
    expect(within(card).getByText("查看证据：packet.md")).toBeTruthy();
    expect(within(card).getByText("查看证据：policy.md")).toBeTruthy();
    expect(within(card).getByText("查看证据：preflight.md")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "按当前建议继续一个受控步骤" })).toBeTruthy();
    expect(within(card).getAllByRole("button")).toHaveLength(1);
    const cardText = card.textContent ?? "";
    const normalizedCardText = cardText.toLowerCase();
    expect(cardText).not.toContain("上一个受控步骤");
    expect(cardText).not.toContain("自动应用");
    expect(cardText).not.toContain("自动关闭");
    expect(cardText).not.toContain("合并全部");
    expect(normalizedCardText).not.toContain("worker");
    expect(normalizedCardText).not.toContain("scheduler run");
    expect(normalizedCardText).not.toContain("slot");
    expect(normalizedCardText).not.toContain("start-all");
    expect(normalizedCardText).not.toContain("whole-wave");
  });

  it("submits project-scoped maintenance patch gates through the non-live action endpoint", async () => {
    const maintenanceSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          ...snapshot.right.confirmationQueue,
          primary: null,
          maintenance: [{
            id: "maintenance-canonical-patch-application-gate:canonical-patch-proposal-1",
            kind: "maintenance",
            projectId: "repo",
            maintenancePatchProposalId: "canonical-patch-proposal-1",
            summary: "Prepare non-executing canonical patch proposal.",
            whyNeedsConfirmation: "该 canonical patch 提案进入后续应用路径前必须由人类确认。",
            confirmEffect: "记录一条项目级 canonical patch application gate evidence。",
            riskSummary: "确认只记录 accepted-for-application-follow-up evidence。",
            evidenceRefs: ["workbench/maintenance/canonical-patch-proposals/canonical-patch-proposal-1.json"],
            actions: [{
              id: "maintenance-canonical-patch-application-gate-record:canonical-patch-proposal-1",
              label: "记录 patch 应用 gate",
              kind: "workflow-action",
              enabled: true,
              requiresConfirmation: true,
              actionType: "maintenance.canonical-patch.application-gate.record",
              maintenancePatchProposalId: "canonical-patch-proposal-1",
            }],
            primary: false,
            status: "pending",
          }],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions/live")) throw new Error("Project-scoped maintenance patch gate must not use the live workflow endpoint.");
      if (url.endsWith("/workbench/actions")) {
        expect(init?.body).toContain("\"actionType\":\"maintenance.canonical-patch.application-gate.record\"");
        expect(init?.body).toContain("\"maintenancePatchProposalId\":\"canonical-patch-proposal-1\"");
        return jsonResponse({ snapshot: maintenanceSnapshot });
      }
      return jsonResponse(url.includes("/stream/") ? stream : maintenanceSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("记录 patch 应用 gate")).toBeTruthy());
    fireEvent.click(screen.getByText("记录 patch 应用 gate"));
    expect(screen.getByText("确认")).toBeTruthy();
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions", expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows Goal Loop conflict reasons only when Workpad projection provides them", async () => {
    render(<WorkpadDiagnosticDetails
      workpad={snapshot.center.workpad}
      approvals={snapshot.right.approvals}
      busy={false}
      onWorkflowAction={async () => undefined}
      onConfirmApproval={() => undefined}
      onAnswerClarification={async () => undefined}
      onSelectDecisionContext={() => undefined}
    />);
    expect(screen.queryByTestId("goal-loop-evidence-card")).toBeNull();
  });

  it("renders controlled continuation as a primary summary and read-only details evidence", async () => {
    const goalLoopSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          goalLoop: {
            id: "goal-loop-continuation-brief-1",
            changeId: "member-discount",
            goalLoopDecisionId: "goal-loop-decision-1",
            goalLoopIterationId: "goal-loop-iteration-1",
            goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
            continuationState: "ready-for-existing-gate",
            recommendationState: "recommend-existing-gate",
            summary: "Goal Loop recommends the current scoped worker gate.",
            recommendedActionType: "planning.scheduler.worker.start-first",
            recommendedActionReason: "The first worker-start gate is scoped and current.",
            separateGateRequired: true,
            humanGateRequired: true,
            conflictLevel: "low",
            parallelEligible: true,
            routingPosture: "single-worker-gate",
            routingLabel: "Single scoped worker gate",
            schedulerExecutionMode: {
              authority: "non-executing-scheduler-execution-mode-evidence",
              mode: "single-gate-staged",
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              currentGate: {
                actionType: "planning.scheduler.worker.start-first",
                separateHumanGateRequired: true,
              },
              humanGateRequired: true,
              summary: "The scheduler path is still a single-gate staged capability.",
              reasons: [
                "planning.scheduler.worker.start-first must be revalidated and confirmed as its own concrete Harness gate.",
              ],
              futureLoopRequirements: [
                "accepted architecture decision for a real scheduler loop or full parallel executor",
                "IntegrationCheck before any source apply path",
              ],
            },
            schedulerLoopEvidenceSnapshot: {
              posture: "awaiting-human-gate",
              decisionKind: "current-gate-ready",
              currentLegalActionType: "planning.scheduler.worker.start-first",
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopState: {
              state: "awaiting-human-gate",
              phase12aLabel: "awaiting human gate for one existing gate",
              summary: "The next safe posture is waiting for a human to confirm one existing scoped Harness gate.",
              currentLegalActionType: "planning.scheduler.worker.start-first",
              humanGateRequired: true,
              futureOnlyStates: ["dispatching-approved-scope", "reconciling"],
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledSchedulerNextCandidate: {
              status: "ready-for-confirmation",
              label: "下一步候选已刷新",
              body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
              actionLabel: "继续执行下一个任务",
              readinessEvidencePrepared: true,
              humanConfirmationStillRequired: true,
              evidenceRefs: [
                "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md",
                "harness/changes/active/member-discount/planning/goal-loop-controller-policies/policy.md",
                "harness/changes/active/member-discount/planning/goal-loop-gate-readiness-preflights/preflight.md",
              ],
            },
            conflictReasons: [
              "Recommended action planning.scheduler.worker.start-first is limited to the existing scoped first worker-start gate.",
            ],
            completionStatus: "incomplete",
            artifact: "harness/changes/active/member-discount/planning/goal-loop-continuation-briefs/brief.json",
            nextStepPacketArtifact: "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.json",
            executionStarted: false,
          },
        },
      },
    };
    render(<WorkpadView
      workpad={goalLoopSnapshot.center.workpad}
      approvals={goalLoopSnapshot.right.approvals}
      busy={false}
      onWorkflowAction={async () => undefined}
      onConfirmApproval={() => undefined}
      onAnswerClarification={async () => undefined}
      onSelectDecisionContext={() => undefined}
    />);

    const primarySurface = await screen.findByTestId("controlled-loop-primary-surface");
    expect(within(primarySurface).getByText("受控继续")).toBeTruthy();
    expect(within(primarySurface).getByText("等待你确认")).toBeTruthy();
    expect(primarySurface.textContent).toContain("下一步确认点：继续执行下一个任务");
    expect(primarySurface.textContent).toContain("右侧确认区仍是唯一执行入口");
    expect(primarySurface.textContent).toContain("只推进一个已存在步骤");
    expect(within(primarySurface).queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("goal-loop-evidence-card")).toBeNull();
    for (const forbidden of [
      "Goal Loop",
      "Scheduler",
      "Worker",
      "Workpad",
      "Change",
      "planning.scheduler",
      "artifact",
      "Harness",
      "IntegrationCheck",
      "SchedulerRun",
    ]) {
      expect(primarySurface.textContent).not.toContain(forbidden);
    }

    cleanup();

    const controlledActionSnapshot = {
      ...goalLoopSnapshot,
      center: {
        ...goalLoopSnapshot.center,
        workpad: {
          ...goalLoopSnapshot.center.workpad,
          nextAction: {
            id: "controlled-advance",
            label: "按当前建议继续一个受控步骤",
            description: "右侧确认区会处理这一步。",
            kind: "workflow-action",
            enabled: true,
            requiresConfirmation: true,
            actionType: "planning.scheduler.controlled-advance.run",
          },
        },
      },
    };
    render(<WorkpadView
      workpad={controlledActionSnapshot.center.workpad}
      approvals={controlledActionSnapshot.right.approvals}
      busy={false}
      onWorkflowAction={async () => undefined}
      onConfirmApproval={() => undefined}
      onAnswerClarification={async () => undefined}
      onSelectDecisionContext={() => undefined}
    />);
    const controlledWorkpad = screen.getByTestId("workpad-view");
    expect(within(controlledWorkpad).queryByRole("button", { name: "执行" })).toBeNull();
    expect(within(controlledWorkpad).queryByText("按当前建议继续一个受控步骤")).toBeNull();

    cleanup();

    render(<WorkpadDiagnosticDetails
      workpad={goalLoopSnapshot.center.workpad}
      approvals={goalLoopSnapshot.right.approvals}
      busy={false}
      onWorkflowAction={async () => undefined}
      onConfirmApproval={() => undefined}
      onAnswerClarification={async () => undefined}
      onSelectDecisionContext={() => undefined}
    />);

    const card = await screen.findByTestId("goal-loop-evidence-card");
    expect(within(card).getByText("受控继续建议")).toBeTruthy();
    expect(within(card).getByText("等待你确认")).toBeTruthy();
    expect(within(card).getByText("低冲突")).toBeTruthy();
    expect(within(card).getByText("单个任务确认点")).toBeTruthy();
    expect(within(card).getByText("可并行评估")).toBeTruthy();
    expect(within(card).getByText("单步受控")).toBeTruthy();
    expect(within(card).getByText("需要你确认")).toBeTruthy();
    expect(within(card).getByText("下一步确认点")).toBeTruthy();
    expect(within(card).getAllByText("继续执行下一个任务").length).toBeGreaterThanOrEqual(2);
    expect(within(card).getByText("下一步候选已刷新")).toBeTruthy();
    expect(within(card).getByText("下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。")).toBeTruthy();
    expect(within(card).getByText("确认状态")).toBeTruthy();
    expect(within(card).getByText("继续前仍需要你再次确认。")).toBeTruthy();
    expect(within(card).getByText("检查状态")).toBeTruthy();
    expect(within(card).getByText("当前步骤检查已准备好。")).toBeTruthy();
    expect(within(card).getByText("当前调度仍是单步受控能力，不是自动循环或完整并行执行器。")).toBeTruthy();
    expect(within(card).getByText("只允许你确认一个已存在的具体步骤；确认后仍会停下等待新的证据和下一次确认。")).toBeTruthy();
    expect(within(card).getAllByText("只读建议；不会授权自动循环、整批派发、资源槽分配、源码修改、应用、关闭或 Harness evolution。具体执行仍需要单独确认对应步骤。").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText("需要先有已接受的真实调度循环或完整并行执行器架构决策。")).toBeTruthy();
    expect(within(card).getByText("任何源码应用路径之前都必须先完成 IntegrationCheck。")).toBeTruthy();
    expect(within(card).getByText("当前有一个可确认的受控步骤。")).toBeTruthy();
    expect(within(card).getByText("自动派发已批准范围、自动回收并整合执行结果 仍只是未来设计，不是当前权限。")).toBeTruthy();
    expect(within(card).getByText("建议的“继续执行下一个任务”只限于当前已限定范围的第一个任务启动步骤。")).toBeTruthy();
    expect(card.textContent).not.toContain("planning.scheduler.");
    expect(card.textContent).not.toContain("Loop authorized: false");
    expect(card.textContent).not.toContain("Full executor: false");
    expect(card.textContent).not.toContain("Whole wave: false");
    expect(card.textContent).not.toContain("Slot allocator: false");
    expect(card.textContent).not.toContain("source=false");
    expect(card.textContent).not.toContain("dispatching-approved-scope");
    expect(card.textContent).not.toContain("Phase 12A");
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("renders SchedulerRun terminal cards as read-only boundary evidence", async () => {
    const terminalSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          schedulerRunCompletion: {
            id: "scheduler-run-completion-1",
            changeId: "member-discount",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
            schedulerReconcileSnapshotId: "reconcile-snapshot-1",
            schedulerIntegrationCandidateId: "integration-candidate-1",
            schedulerIntegrationCheckHandoffId: "integration-handoff-1",
            schedulerIntegrationOutcomeId: "integration-outcome-1",
            status: "completed-applied",
            outcomeStatus: "applied",
            integrationCheckId: "integration-check-1",
            integrationCheckStatus: "passed",
            readyCount: 2,
            resultTargetCount: 2,
            outcomeReason: "Existing IntegrationCheck outcome was applied.",
            artifact: "harness/changes/active/member-discount/scheduler-runtime/runs/scheduler-run-1/completions/completion.json",
            updatedAt: "2026-05-15T12:05:00.000Z",
          },
          schedulerRunBlockedCloseout: {
            id: "scheduler-run-closeout-1",
            changeId: "member-discount",
            schedulerRunId: "scheduler-run-2",
            schedulerClaimReservationId: "claim-reservation-2",
            schedulerReconcileSnapshotId: "reconcile-snapshot-2",
            schedulerIntegrationCandidateId: "integration-candidate-2",
            schedulerContractId: "scheduler-contract-1",
            schedulerDispatchDryRunId: "dispatch-dry-run-1",
            schedulerWorkerPlanId: "worker-plan-1",
            schedulerClaimReconcilePlanId: "claim-reconcile-plan-1",
            schedulerLaunchPreflightId: "launch-preflight-1",
            status: "blocked",
            reason: "candidate-blocked",
            closeoutReason: "Ready targets stayed below the IntegrationCheck threshold and no legal worker gate remains.",
            readyCount: 1,
            blockedCount: 2,
            readyWorktreeIds: ["wt-ready-1"],
            blockedReasons: ["worker validation failed", "no legal next worker gate"],
            unstartedReservedIntentIds: ["intent-2"],
            sourceMutated: false,
            executionStarted: false,
            artifact: "harness/changes/active/member-discount/scheduler-runtime/runs/scheduler-run-2/blocked-closeouts/closeout.json",
            updatedAt: "2026-05-15T12:06:00.000Z",
          },
        },
      },
    };

    render(<WorkpadDiagnosticDetails
      workpad={terminalSnapshot.center.workpad}
      approvals={terminalSnapshot.right.approvals}
      busy={false}
      onWorkflowAction={async () => undefined}
      onConfirmApproval={() => undefined}
      onAnswerClarification={async () => undefined}
      onSelectDecisionContext={() => undefined}
    />);

    const completionCard = await screen.findByTestId("scheduler-run-completion-card");
    expect(within(completionCard).getByText("SchedulerRun 完成状态")).toBeTruthy();
    expect(within(completionCard).getByText("只读 terminal evidence；不授权 scheduler loop、full executor、whole-wave dispatch、slot allocation、source mutation、apply、close、PR、landing、merge 或 Harness evolution。")).toBeTruthy();
    expect(within(completionCard).queryByRole("button")).toBeNull();

    const closeoutCard = await screen.findByTestId("scheduler-run-closeout-card");
    expect(within(closeoutCard).getByText("SchedulerRun 结束记录")).toBeTruthy();
    expect(within(closeoutCard).getByText("只读 closeout evidence；不授权 scheduler loop、full executor、whole-wave dispatch、slot allocation、worker start、worktree、run、child Change、source mutation、apply、close、merge 或 Harness evolution。")).toBeTruthy();
    expect(within(closeoutCard).queryByRole("button")).toBeNull();
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
        parentAgentTranscript: {
          title: "会员折扣计价",
          cells: [
            {
              id: "cell:assistant:p1",
              kind: "assistant-message",
              source: "codex-runtime",
              text: "我会检查现有实现。",
            },
            {
              id: "cell:error:err1",
              kind: "process-row",
              source: "codex-runtime",
              title: "Error",
              text: "Reconnecting...",
              isError: true,
            },
            {
              id: "cell:command:c-done",
              kind: "process-row",
              source: "codex-runtime",
              title: "已运行命令",
              text: "已运行 1 条命令",
              status: "completed",
              detailText: "npm test\nok",
            },
          ],
          items: [],
          emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
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
    await waitFor(() => expect(screen.getByText("我会检查现有实现。")).toBeTruthy());
    expect(screen.getByTestId("parent-agent-transcript")).toBeTruthy();
    expect(screen.getAllByTestId("parent-message-parent-agent").length).toBeGreaterThan(0);
    expect(screen.queryByText("AI 回复")).toBeNull();
    expect(screen.queryByText("执行结果")).toBeNull();
    expect(screen.queryByText(/用量/)).toBeNull();
    expect(document.querySelectorAll("[data-testid^='assistant-block']")).toHaveLength(0);
  });

  it("does not render legacy parent transcript items when runtime cells are absent", async () => {
    const legacyOnlySnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        parentAgentTranscript: {
          title: "会员折扣计价",
          cells: [],
          items: [{
            id: "legacy-derived-item",
            actor: "parent-agent",
            blocks: [{
              id: "legacy-derived-block",
              kind: "evidence",
              source: "workflow-evidence",
              title: "证据摘要",
              text: "The confirmed workflow action completed.",
            }],
          }],
          emptyMessage: "暂无真实运行记录。",
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : legacyOnlySnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("暂无真实运行记录。")).toBeTruthy());
    const transcriptText = document.querySelector(".parent-agent-transcript")?.textContent ?? "";
    expect(transcriptText).not.toContain("证据摘要");
    expect(transcriptText).not.toContain("The confirmed workflow action completed.");
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

  it("renders PR review reply and resolve confirmations without merge controls", async () => {
    const replySnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "pr-review:reply:reply-draft-abc123",
            kind: "pr-review",
            conversationId: "member-discount",
            changeId: "member-discount",
            landingPackageId: "landing-worktree-abc123",
            summary: "评审回复草稿已准备好。",
            whyNeedsConfirmation: "回复评审需要你确认。",
            confirmEffect: "会向 PR 评审反馈提交回复；不会 merge、land 或归档需求。",
            riskSummary: "这是 PR review handoff，不是合并授权。",
            evidenceRefs: ["project://.agent-harness/workbench/pr-review/reply-drafts/reply-draft-abc123/pr-review-reply-draft.json"],
            actions: [
              {
                id: "pr-review-reply-submit:landing-worktree-abc123",
                label: "回复评审",
                kind: "workflow-action",
                actionType: "pr-review.reply-submit",
                landingPackageId: "landing-worktree-abc123",
                enabled: true,
                requiresConfirmation: true,
              },
              {
                id: "pr-review-thread-resolve:landing-worktree-abc123",
                label: "标记已处理",
                kind: "workflow-action",
                actionType: "pr-review.thread-resolve",
                landingPackageId: "landing-worktree-abc123",
                enabled: true,
                requiresConfirmation: true,
              },
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
      return jsonResponse(url.includes("/stream/") ? stream : replySnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("回复评审需要你确认。")).toBeTruthy());
    expect(screen.getByRole("button", { name: /回复评审/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /标记已处理/ })).toBeTruthy();
    expect(screen.queryByText("merge queue")).toBeNull();
    expect(screen.queryByText("auto merge")).toBeNull();
    expect(screen.queryByText("land")).toBeNull();
  });

  it("renders a user-confirmed remote landing item without auto-merge controls", async () => {
    const mergeSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "remote-landing:merge:remote-landing-abc123",
            kind: "remote-landing",
            conversationId: "member-discount",
            changeId: "member-discount",
            landingPackageId: "landing-worktree-abc123",
            summary: "PR 已满足远端合并条件。",
            whyNeedsConfirmation: "PR 已提交评审，远端检查没有失败，也没有必须先处理的反馈。",
            confirmEffect: "会执行 GitHub squash merge；不会 push main、启用 auto-merge、删除远端分支或同步本地源码。",
            riskSummary: "合并后远端代码成为稳定边界，本地工作区仍需后续手动同步。",
            evidenceRefs: ["project://.agent-harness/workbench/remote-landing/remote-landing-abc123/remote-landing-summary.md"],
            actions: [{
              id: "remote-landing-merge:landing-worktree-abc123",
              label: "合并 PR",
              kind: "workflow-action",
              actionType: "remote-landing.merge",
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
      return jsonResponse(url.includes("/stream/") ? stream : mergeSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("PR 已满足远端合并条件。")).toBeTruthy());
    expect(screen.getByRole("button", { name: /合并 PR/ })).toBeTruthy();
    expect(screen.getByText("会执行 GitHub squash merge；不会 push main、启用 auto-merge、删除远端分支或同步本地源码。")).toBeTruthy();
    expect(screen.queryByText("merge queue")).toBeNull();
    expect(screen.queryByText("auto merge")).toBeNull();
    expect(screen.queryByText("push main")).toBeNull();
  });

  it("renders landing queue as one current confirmation with folded background PRs", async () => {
    const queueSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "landing-queue:candidate:queue-a",
            kind: "landing-queue",
            conversationId: "member-discount",
            changeId: "member-discount",
            landingPackageId: "landing-a",
            summary: "PR 可合并，但有普通评论需要你确认。",
            whyNeedsConfirmation: "检测到普通评论；请确认是否仍然合并。",
            confirmEffect: "会执行 GitHub squash merge；不会自动回复评论或解决 thread。 合并成功后会刷新剩余 1 个可合并 PR。",
            riskSummary: "普通评论可能仍有人工判断价值；合并前请确认摘要和证据。 该 PR 有普通评论；请确认仍要合并。",
            evidenceRefs: ["project://.agent-harness/workbench/landing-queue/queue/landing-queue-summary.md"],
            actions: [{
              id: "landing-queue-merge-next:landing-a",
              label: "合并 PR",
              kind: "workflow-action",
              actionType: "landing-queue.merge-next",
              landingPackageId: "landing-a",
              enabled: true,
              requiresConfirmation: true,
            }],
            primary: true,
            status: "pending",
          },
          current: [],
          otherDemands: [{
            id: "landing-queue:candidate:queue-b",
            kind: "landing-queue",
            conversationId: "second-demand",
            changeId: "second-demand",
            landingPackageId: "landing-b",
            summary: "PR 已进入合并队列，可以逐个确认合并。",
            whyNeedsConfirmation: "PR 已提交评审，远端检查没有失败，也没有必须先处理的反馈。",
            confirmEffect: "会执行 GitHub squash merge；不会 push main、启用 auto-merge、删除远端分支或同步本地源码。 合并成功后会刷新剩余 1 个可合并 PR。",
            riskSummary: "合并后远端代码成为稳定边界，本地工作区仍需后续手动同步。",
            evidenceRefs: [],
            actions: [],
            primary: false,
            status: "pending",
          }],
          maintenance: [],
          history: [],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : queueSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("PR 可合并，但有普通评论需要你确认。")).toBeTruthy());
    expect(screen.getByRole("button", { name: /合并 PR/ })).toBeTruthy();
    expect(screen.getByText("其他需求等你确认")).toBeTruthy();
    expect(screen.getByText("该 PR 有普通评论；请确认仍要合并。", { exact: false })).toBeTruthy();
    expect(screen.queryByText("自动合并全部")).toBeNull();
    expect(screen.queryByText("push main")).toBeNull();
    expect(screen.queryByText("branch-protection bypass")).toBeNull();
  });

  it("renders post-merge sync and cleanup as explicit confirmation actions", async () => {
    const postMergeSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "post-merge:handoff:post-merge-abc123",
            kind: "post-merge",
            conversationId: "member-discount",
            changeId: "member-discount",
            landingPackageId: "landing-worktree-abc123",
            summary: "远端 PR 已合并。本地项目状态已刷新。",
            whyNeedsConfirmation: "远端 PR 已合并；本地同步和远端分支清理是可选收尾动作。",
            confirmEffect: "会执行一次 fast-forward 同步；不会 checkout、stash、reset、rebase 或创建 merge commit。",
            riskSummary: "同步后本地 base branch 会前进到远端合并后的提交。删除后该远端分支不再可用于继续 push；PR 记录仍保留。",
            evidenceRefs: ["project://.agent-harness/workbench/post-merge/post-merge-abc123/post-merge-summary.md"],
            actions: [
              {
                id: "post-merge-sync-local:landing-worktree-abc123",
                label: "同步本地项目",
                kind: "workflow-action",
                actionType: "post-merge.sync-local.run",
                landingPackageId: "landing-worktree-abc123",
                remoteLandingResultId: "remote-landing-result-abc123",
                enabled: true,
                requiresConfirmation: true,
              },
              {
                id: "post-merge-cleanup-branch:landing-worktree-abc123",
                label: "清理远端 PR 分支",
                kind: "workflow-action",
                actionType: "post-merge.cleanup-branch.run",
                landingPackageId: "landing-worktree-abc123",
                remoteLandingResultId: "remote-landing-result-abc123",
                enabled: true,
                requiresConfirmation: true,
              },
            ],
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
      return jsonResponse(url.includes("/stream/") ? stream : postMergeSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("远端 PR 已合并。本地项目状态已刷新。")).toBeTruthy());
    expect(screen.getByRole("button", { name: /同步本地项目/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /清理远端 PR 分支/ })).toBeTruthy();
    expect(screen.queryByText("reset")).toBeNull();
    expect(screen.queryByText("stash")).toBeNull();
    expect(screen.queryByText("rebase")).toBeNull();
    expect(screen.queryByText("merge queue")).toBeNull();
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
            workflowRunId: "workflow-blocked",
            currentTaskId: "T-001",
            totalCount: 1,
            completedCount: 0,
            blockedReason: "T-001: 审查未通过，需要补证据。",
            nextAction: { id: "task-queue:queue-blocked:task.queue.reconcile", label: "继续处理", actionType: "task.queue.reconcile", workflowRunId: "workflow-blocked", queueRunId: "queue-blocked", enabled: true, requiresConfirmation: true },
            items: [{ id: "queue-blocked-item-001", taskId: "T-001", order: 1, status: "blocked", taskRunId: "taskrun-blocked", workflowRunId: "workflow-blocked" }],
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
    expect(screen.getAllByText(/审查未通过，需要补证据。/).length).toBeGreaterThan(0);
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

  it("submits Goal Loop feedback through the workflow action surface", async () => {
    const initialGoalLoopSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          goalLoop: {
            id: "goal-loop-continuation-brief-1",
            goalLoopDecisionId: "goal-loop-decision-1",
            goalLoopIterationId: "goal-loop-iteration-1",
            goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
            changeId: "member-discount",
            status: "ready",
            recommendedActionType: "planning.confirm-execution",
            recommendedActionScope: { changeId: "member-discount" },
            summary: "主 Agent 建议确认执行。",
            artifact: "harness/changes/active/member-discount/goal-loop/continuation.md",
            nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step.json",
          },
        },
      },
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "confirm:planning:member-discount",
            kind: "planning-confirm",
            conversationId: "member-discount",
            changeId: "member-discount",
            summary: "准备确认执行。",
            whyNeedsConfirmation: "确认后进入现有 Harness gate。",
            confirmEffect: "确认后只执行当前 gate。",
            riskSummary: "可先修正 Goal Loop 建议。",
            evidenceRefs: [],
            actions: [
              {
                id: "workflow:planning.confirm-execution:member-discount",
                label: "确认执行计划",
                kind: "workflow-action",
                actionType: "planning.confirm-execution",
                changeId: "member-discount",
                enabled: true,
                requiresConfirmation: true,
              },
              {
                id: "workflow:planning.goal-loop.feedback.evaluate:goal-loop-next-step-packet-1",
                label: "修正 Goal Loop 建议",
                kind: "feedback",
                actionType: "planning.goal-loop.feedback.evaluate",
                changeId: "member-discount",
                goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
                goalLoopDecisionId: "goal-loop-decision-1",
                goalLoopIterationId: "goal-loop-iteration-1",
                goalLoopContinuationBriefId: "goal-loop-continuation-brief-1",
                enabled: true,
                requiresConfirmation: false,
              },
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
    const refreshedGoalLoopSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          goalLoop: {
            id: "goal-loop-continuation-brief-2",
            goalLoopDecisionId: "goal-loop-decision-2",
            goalLoopIterationId: "goal-loop-iteration-2",
            goalLoopNextStepPacketId: "goal-loop-next-step-packet-2",
            changeId: "member-discount",
            status: "ready",
            recommendedActionType: "planning.confirm-execution",
            recommendedActionScope: { changeId: "member-discount" },
            summary: "主 Agent 已按反馈重新解释关闭前提。",
            artifact: "harness/changes/active/member-discount/goal-loop/continuation-2.md",
            nextStepPacketArtifact: "harness/changes/active/member-discount/goal-loop/next-step-2.json",
          },
        },
        thread: {
          items: [
            ...snapshot.center.thread.items,
            {
              id: "goal-loop-feedback-message-1",
              kind: "assistant-turn",
              source: "chat",
              label: "AI",
              body: "Goal Loop feedback recorded\n\nFeedback: \"先解释为什么现在可以关闭。\"\n\nNo recommendation was executed; the concrete Harness gate still requires its own confirmation.",
              timestamp: "2026-05-15T12:02:00.000Z",
              artifact: "harness/changes/active/member-discount/goal-loop/feedback-1.md",
            },
          ],
        },
      },
      right: {
        ...snapshot.right,
        confirmationQueue: {
          primary: {
            id: "confirm:planning:member-discount",
            kind: "planning-confirm",
            conversationId: "member-discount",
            changeId: "member-discount",
            summary: "准备确认执行。",
            whyNeedsConfirmation: "确认后进入现有 Harness gate。",
            confirmEffect: "确认后只执行当前 gate。",
            riskSummary: "可先修正 Goal Loop 建议。",
            evidenceRefs: [],
            actions: [
              {
                id: "workflow:planning.confirm-execution:member-discount",
                label: "确认执行计划",
                kind: "workflow-action",
                actionType: "planning.confirm-execution",
                changeId: "member-discount",
                enabled: true,
                requiresConfirmation: true,
              },
              {
                id: "workflow:planning.goal-loop.feedback.evaluate:goal-loop-next-step-packet-2",
                label: "修正 Goal Loop 建议",
                kind: "feedback",
                actionType: "planning.goal-loop.feedback.evaluate",
                changeId: "member-discount",
                goalLoopNextStepPacketId: "goal-loop-next-step-packet-2",
                goalLoopDecisionId: "goal-loop-decision-2",
                goalLoopIterationId: "goal-loop-iteration-2",
                goalLoopContinuationBriefId: "goal-loop-continuation-brief-2",
                enabled: true,
                requiresConfirmation: false,
              },
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
    let feedbackRequestCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions/live")) {
        feedbackRequestCount += 1;
        expect(init?.body).toContain("\"actionType\":\"planning.goal-loop.feedback.evaluate\"");
        if (feedbackRequestCount === 1) {
          expect(init?.body).toContain("\"goalLoopNextStepPacketId\":\"goal-loop-next-step-packet-1\"");
          expect(init?.body).toContain("\"feedback\":\"先解释为什么现在可以关闭。\"");
        } else {
          expect(init?.body).toContain("\"goalLoopNextStepPacketId\":\"goal-loop-next-step-packet-2\"");
          expect(init?.body).toContain("\"feedback\":\"再补充执行前提。\"");
        }
        return sseResponse([["snapshot", refreshedGoalLoopSnapshot], ["done", { status: "completed" }]]);
      }
      if (url.endsWith("/workbench/actions")) throw new Error("Goal Loop feedback must use the live workflow action surface.");
      return jsonResponse(url.includes("/stream/") ? stream : initialGoalLoopSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("修正 Goal Loop 建议")).toBeTruthy());
    fireEvent.click(screen.getByText("修正 Goal Loop 建议"));
    fireEvent.change(screen.getByPlaceholderText("写下需要修改的地方"), { target: { value: "先解释为什么现在可以关闭。" } });
    fireEvent.click(screen.getByText("提交反馈"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions/live", expect.objectContaining({ method: "POST" }));
    });
    fireEvent.click(screen.getByText("修正 Goal Loop 建议"));
    fireEvent.change(screen.getByPlaceholderText("写下需要修改的地方"), { target: { value: "再补充执行前提。" } });
    fireEvent.click(screen.getByText("提交反馈"));
    await waitFor(() => expect(feedbackRequestCount).toBe(2));
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

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    expect(screen.queryByTestId("taskgraph-node-T-001")).toBeNull();
    expect(screen.queryByText("运行此任务")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Agent 运行图" }));
    expect(screen.getByTestId("agent-run-graph")).toBeTruthy();
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

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    expect(screen.queryByTestId("task-queue-panel")).toBeNull();
    expect(screen.queryByText("本地顺序执行")).toBeNull();
    expect(screen.queryByText(/并行执行|worker pool|多 agent 协作/)).toBeNull();
    expect(screen.getByRole("tab", { name: "Agent 运行图" })).toBeTruthy();
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
            workflowRunId: "workflow-1",
            taskQueueProposalId: "proposal-1",
            workflowGraphPlanId: "graph-1",
            readinessManifestId: "readiness-1",
            decompositionPlanId: "decomposition-1",
            currentTaskId: "T-001",
            totalCount: 1,
            completedCount: 0,
            pausedReason: "队列已暂停，等待继续。",
            nextAction: { id: "task-queue:queue-1:task.queue.start", label: "继续处理", actionType: "task.queue.start", workflowRunId: "workflow-1", queueRunId: "queue-1", taskQueueProposalId: "proposal-1", workflowGraphPlanId: "graph-1", readinessManifestId: "readiness-1", decompositionPlanId: "decomposition-1", enabled: true, requiresConfirmation: true },
            items: [{ id: "queue-1-item-001", taskId: "T-001", order: 1, status: "queued", workflowRunId: "workflow-1" }],
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

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    expect(screen.queryByText("队列已暂停，等待继续。")).toBeNull();
    expect(screen.queryByText("继续处理")).toBeNull();
    expect(screen.queryByText("运行此任务")).toBeNull();
  });

  it("keeps clarification questions out of the default main transcript", async () => {
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
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : clarificationSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    const transcriptText = document.querySelector(".parent-agent-transcript")?.textContent ?? "";
    expect(transcriptText).not.toContain("是否需要覆盖会员满 100、会员未满 100 和非会员三类测试？");
    expect(screen.queryByTestId("clarification-card")).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith("/api/projects/repo/workbench/clarifications/clarify-1/answer", expect.anything());
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
        parentAgentTranscript: {
          ...snapshot.center.parentAgentTranscript,
          cells: [
            ...snapshot.center.parentAgentTranscript.cells,
            {
              id: "cell:user:live-user-final",
              kind: "user-message",
              source: "user",
              text: "继续说明边界",
            },
            {
              id: "cell:assistant:live-ai-final",
              kind: "assistant-message",
              source: "codex-runtime",
              text: "完整 AI 输出已经落盘。",
            },
            {
              id: "cell:command:live-cmd-1",
              kind: "process-row",
              source: "codex-runtime",
              title: "已运行命令",
              text: "已运行 1 条命令",
              status: "completed",
              detailText: "npm test\n测试通过",
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
    expect(screen.getByTestId("parent-agent-transcript")).toBeTruthy();
    expect(screen.queryByText("AI 回复")).toBeNull();
    expect(screen.queryByText("执行结果")).toBeNull();
    expect(screen.queryByText("用户消息")).toBeNull();
    expect(screen.queryByText("AI 计划")).toBeNull();
    expect(screen.queryByText(/codex-events\.jsonl/)).toBeNull();
    expect(screen.queryByText("Usage recorded")).toBeNull();
    expect(screen.queryByText("Codex turn running")).toBeNull();
    const commandCell = Array.from(document.querySelectorAll(".parent-agent-tool-result"))
      .find((node) => node.textContent?.includes("已运行 1 条命令")) as HTMLElement | undefined;
    expect(commandCell).toBeTruthy();
    fireEvent.click(within(commandCell as HTMLElement).getByText("查看详情"));
    expect(commandCell?.textContent).toMatch(/npm test/);
    expect(document.querySelectorAll("[data-testid^='assistant-block']")).toHaveLength(0);
    expect(document.querySelector(".parent-agent-transcript")?.textContent).toContain("完整 AI 输出已经落盘。");
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
    expect(screen.queryByText("正在处理")).toBeNull();
    expect(screen.queryByText("AI 只读回复")).toBeNull();
    expect(screen.getByText("Reasoning summary")).toBeTruthy();
    const commandCell = Array.from(document.querySelectorAll(".parent-agent-tool-result"))
      .find((node) => node.textContent?.includes("已运行 1 条命令")) as HTMLElement | undefined;
    expect(commandCell).toBeTruthy();
    fireEvent.click(within(commandCell as HTMLElement).getByText("查看详情"));
    expect(commandCell?.textContent).toMatch(/npm test/);
    expect(screen.queryByText("exit 0")).toBeNull();
    expect(screen.queryByText(/5 output tokens/)).toBeNull();
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

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    expect(screen.getAllByText("配送规则调整").length).toBeGreaterThan(0);
    expect(screen.queryByText(/后台需求：1 个处理中/)).toBeNull();
    expect(screen.queryByText("记忆边界")).toBeNull();
    expect(screen.queryByText("发送给当前执行")).toBeNull();
    expect(screen.queryByText("停止并按这条修改")).toBeNull();
    expect(screen.queryByText("新需求对话")).toBeNull();
    expect(screen.getByTitle("停止当前执行")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Agent 运行图" })).toBeTruthy();
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
