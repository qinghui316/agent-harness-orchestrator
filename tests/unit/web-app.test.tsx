// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/web/src/App.js";
import { DecisionInspectorPane } from "../../src/web/src/panels/workbench/DecisionPanels.js";
import { WorkpadView } from "../../src/web/src/panels/workbench/WorkpadPanel.js";
import { WorkpadDiagnosticDetails } from "../../src/web/src/panels/workbench/workpad/WorkpadDetails.js";
import { TopicComposer } from "../../src/web/src/shell/composer.js";
import { summarizeActionResult } from "../../src/workbench/actions/results.js";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon(): void {}
    open(): void {}
    onData(): { dispose: () => void } {
      return { dispose: () => undefined };
    }
    write(): void {}
    dispose(): void {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit(): void {}
  },
}));

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

const codexDiagnostics = {
  provider: "codex",
  available: true,
  version: "codex-cli 1.2.3",
  configPath: "C:/Users/test/.codex/config.toml",
  currentModel: "gpt-5.3-codex",
  configModel: "gpt-5.3-codex",
  selectedModel: null,
  effectiveModel: "gpt-5.3-codex",
  effectiveModelSource: "config",
  approvalFlagPlacement: "after-exec",
  capabilities: {
    supportsJson: true,
    supportsSandbox: true,
    supportsCd: true,
    supportsAddDir: true,
    supportsColor: true,
    supportsOutputLastMessage: true,
    supportsSafeResume: true,
  },
  errors: [],
  projectTrust: {
    trusted: false,
    projectKey: "E:/repo",
    configExists: true,
    reason: "Project trust is not configured.",
  },
} as const;

const codexModelSettings = {
  selectedModel: null,
  customModels: [],
  configModel: "gpt-5.3-codex",
  configPath: "C:/Users/test/.codex/config.toml",
  configExists: true,
  effectiveModel: "gpt-5.3-codex",
  effectiveModelSource: "config",
  modelList: {
    available: true,
    candidates: [
      { id: "gpt-5.3-codex", label: "GPT 5.3 Codex", source: "runtime", isDefault: true },
      { id: "gpt-5.5", label: "GPT 5.5", source: "runtime" },
    ],
  },
  candidates: [
    { id: "gpt-5.3-codex", label: "GPT 5.3 Codex", source: "runtime", isDefault: true },
    { id: "gpt-5.5", label: "GPT 5.5", source: "runtime" },
  ],
} as const;

const providerCapabilityPayload = {
  providers: [{
    providerId: "codex",
    productMode: "harness",
    status: "degraded",
    runnable: true,
    effectiveModel: "gpt-5.3-codex",
    effectiveModelSource: "config",
    snapshotHash: "capability-1234",
    snapshotVersion: 2,
    checkedAt: "2026-06-29T00:00:00.000Z",
    capabilities: [
      {
        key: "model.list",
        label: "模型列表",
        spec: "supported",
        runtime: "degraded",
        summary: "Codex runtime 暂时不能返回模型列表，仍可使用配置或默认模型。",
        reason: "runtime unavailable",
      },
      {
        key: "skills",
        label: "Skills",
        spec: "supported",
        runtime: "ready",
        summary: "2 个 Codex runtime Skill 可用。",
      },
      {
        key: "image.input",
        label: "图片输入",
        spec: "supported",
        runtime: "ready",
        summary: "图片附件可传给 Codex app-server。",
      },
    ],
  }],
} as const;

function fetchCallUrls(): string[] {
  return (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit?]> } }).mock.calls
    .map(([input]) => String(input));
}

async function openDecisionPane(): Promise<HTMLElement> {
  const current = screen.queryByTestId("decision-inspector-primary");
  if (current) return current;
  const toggle = await screen.findByTestId("decision-pane-toggle");
  fireEvent.click(toggle);
  fireEvent.click(await screen.findByTestId("right-tool-launcher-confirm"));
  return screen.findByTestId("decision-inspector-primary");
}

function boundedContinuationQueueItem() {
  return {
    id: "confirm:goal-loop-controlled-continue:member-discount",
    kind: "planning-confirm",
    conversationId: "member-discount",
    changeId: "member-discount",
    summary: "主 Agent 可以在当前目标内连续推进几个已验证的 scheduler 步骤。",
    whyNeedsConfirmation: "需要你确认一次 bounded continuation 授权；每一步仍会重新读取证据和校验 target。",
    confirmEffect: "确认后最多推进 5 步，遇到阻塞、漂移、终点 gate 或预算耗尽就停止并显示新的当前 gate。",
    riskSummary: "这不是全自动任务模式；应用、关闭、远端落地、维护演进和产品取舍仍需要单独确认。",
    evidenceRefs: ["preflight.md"],
    primary: true,
    status: "pending",
    actions: [{
      id: "workflow:planning.goal-loop.controlled-continue.run:preflight-1",
      label: "连续推进当前目标",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.goal-loop.controlled-continue.run",
      changeId: "member-discount",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "policy-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-1",
      claimIntentId: "claim-1",
      maxSteps: 10,
    }],
  } as const;
}

function planningConfirmQueueItem() {
  return {
    id: "confirm:planning:member-discount",
    kind: "planning-confirm",
    conversationId: "member-discount",
    changeId: "member-discount",
    summary: "规划草案已准备好。",
    whyNeedsConfirmation: "需要你确认计划；确认计划不会启动执行。",
    confirmEffect: "确认后写入当前需求的 spec/plan/tasks/ac-map。",
    riskSummary: "计划确认是人工边界。",
    evidenceRefs: ["planning-bundle.md"],
    primary: true,
    status: "pending",
    actions: [{
      id: "workflow:planning.confirm-execution:planning-bundle-1",
      label: "确认规划",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.confirm-execution",
      changeId: "member-discount",
      planningBundleId: "planning-bundle-1",
    }],
  } as const;
}

function decompositionConfirmQueueItem() {
  return {
    id: "confirm:decomposition:member-discount",
    kind: "planning-confirm",
    conversationId: "member-discount",
    changeId: "member-discount",
    summary: "分解计划已准备好。",
    whyNeedsConfirmation: "需要你确认任务分解。",
    confirmEffect: "确认后写入当前需求的 decomposition 证据。",
    riskSummary: "不会自动 apply 或 close。",
    evidenceRefs: ["decomposition.md"],
    primary: true,
    status: "pending",
    actions: [{
      id: "workflow:planning.decomposition.confirm:decomp-1",
      label: "确认任务分解",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.decomposition.confirm",
      changeId: "member-discount",
      decompositionPlanId: "decomp-1",
    }],
  } as const;
}

function decomposeQueueItem() {
  return {
    id: "confirm:planning-decompose:member-discount",
    kind: "planning-confirm",
    conversationId: "member-discount",
    changeId: "member-discount",
    summary: "规划已确认，可以生成拆分提案。",
    whyNeedsConfirmation: "需要你确认生成拆分提案。",
    confirmEffect: "记录拆分提案草案；不会创建子需求、后台执行任务、工作副本或启动执行。",
    riskSummary: "拆分提案必须再经过确认和执行边界检查后，才可能进入下一步真实执行。",
    evidenceRefs: ["planning-bundle.md"],
    primary: true,
    status: "pending",
    actions: [{
      id: "workflow:planning.decompose:member-discount",
      label: "生成拆分提案",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.decompose",
      changeId: "member-discount",
    }],
  } as const;
}

function auditAcceptQueueItem(automationEligible = true) {
  return {
    id: "confirm:approval:audit:audit-1",
    kind: "request-changes",
    conversationId: "member-discount",
    changeId: "member-discount",
    resultId: "audit-1",
    runId: "audit-run-1",
    summary: "审查证据可以接受。",
    whyNeedsConfirmation: "审查证据可接受：audit-1",
    confirmEffect: "接受后会记录审查证据，下一步才是应用到项目。",
    riskSummary: "这不会修改 source root。",
    evidenceRefs: ["runs/audit-run-1/audit.json"],
    primary: true,
    status: "pending",
    actions: [{
      id: "accept:audit:audit-1",
      label: "接受审查证据",
      kind: "approval",
      enabled: true,
      requiresConfirmation: true,
      changeId: "member-discount",
      approvalId: "audit:audit-1",
      automationEligible,
      action: { actionId: "audit.accept", label: "接受审查证据", command: "audit", args: ["accept", "repo", "audit-1"], mutates: true, requiresConfirmation: true },
    }],
  } as const;
}

function recoveryQueueItem(actionType: "result.refresh-rework" | "result.revalidate" | "result.reaudit" = "result.refresh-rework") {
  const label = actionType === "result.refresh-rework" ? "要求修改" : actionType === "result.revalidate" ? "重新验证" : "重新审查";
  return {
    id: `confirm:recovery:${actionType}:wt-1`,
    kind: "request-changes",
    conversationId: "member-discount",
    changeId: "member-discount",
    resultId: "wt-1",
    worktreeId: "wt-1",
    summary: "当前结果需要修改或补证据。",
    whyNeedsConfirmation: "需要处理当前验证或审查失败。",
    confirmEffect: "只会在当前工作副本里推进一轮本地修复或证据刷新，不会应用到 source root。",
    riskSummary: "应用、关闭、远端落地和合并仍需要单独人工确认。",
    evidenceRefs: ["runs/validation-run-1/validation.json"],
    primary: true,
    status: "pending",
    actions: [{
      id: `workflow:${actionType}:wt-1`,
      label,
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType,
      changeId: "member-discount",
      worktreeId: "wt-1",
    }],
  } as const;
}

function applyQueueItem(automationEligible = false) {
  return {
    id: "confirm:apply:wt-1",
    kind: "single-result-apply",
    conversationId: "member-discount",
    changeId: "member-discount",
    resultId: "wt-1",
    worktreeId: "wt-1",
    summary: "结果可应用到项目。",
    whyNeedsConfirmation: "确认应用代码",
    confirmEffect: "会修改 source root 并提交本地结果。",
    riskSummary: "这是 source mutation，必须人工确认。",
    evidenceRefs: ["runs/audit-run-1/audit.json"],
    primary: true,
    status: "pending",
    actions: [{
      id: "accept:apply:wt-1",
      label: "应用到项目",
      kind: "approval",
      enabled: true,
      requiresConfirmation: true,
      changeId: "member-discount",
      approvalId: "apply:wt-1",
      automationEligible,
      action: { actionId: "result.apply", label: "应用到项目", command: "result", args: ["apply", "repo", "member-discount", "wt-1"], mutates: true, requiresConfirmation: true },
    }],
  } as const;
}

function closeQueueItem(automationEligible = false) {
  return {
    id: "confirm:close:member-discount",
    kind: "request-changes",
    conversationId: "member-discount",
    changeId: "member-discount",
    resultId: "member-discount",
    summary: "需求已完成，可以关闭。",
    whyNeedsConfirmation: "确认完成需求",
    confirmEffect: "会关闭并归档当前本地需求。",
    riskSummary: "不会执行远端提交、PR 或合并。",
    evidenceRefs: ["harness/changes/active/member-discount/summary.md"],
    primary: true,
    status: "pending",
    actions: [{
      id: "accept:close:member-discount",
      label: "确认完成需求",
      kind: "approval",
      enabled: true,
      requiresConfirmation: true,
      changeId: "member-discount",
      approvalId: "close:member-discount",
      automationEligible,
      action: { actionId: "change.close", label: "确认完成需求", command: "change", args: ["close", "repo", "member-discount"], mutates: true, requiresConfirmation: true },
    }],
  } as const;
}

function landingPrepareQueueItem() {
  return {
    id: "landing:candidate:wt-1",
    kind: "landing-readiness",
    conversationId: "member-discount",
    changeId: "member-discount",
    resultId: "wt-1",
    worktreeId: "wt-1",
    summary: "本地结果已应用，可以做提交/PR 前检查。",
    whyNeedsConfirmation: "本地结果已应用，可以做提交/PR 前检查。",
    confirmEffect: "会生成本地落地证据包和 merge-reviewer 审查；不会 commit、push、创建 PR 或 merge。",
    riskSummary: "这是本地证据准备，不是远端落地。",
    evidenceRefs: ["runs/audit-run-1/audit.json"],
    primary: true,
    status: "pending",
    actions: [{
      id: "landing-prepare:wt-1",
      label: "开始落地检查",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      automationEligible: true,
      actionType: "landing.prepare",
      changeId: "member-discount",
      worktreeId: "wt-1",
      worktreeIds: ["wt-1"],
    }],
  } as const;
}

function integrationApplyQueueItem() {
  return {
    id: "apply-check:apply-check-1",
    kind: "integration-apply",
    conversationId: "member-discount",
    changeId: "member-discount",
    applyCheckId: "apply-check-1",
    summary: "组合结果已通过兼容性检查。",
    whyNeedsConfirmation: "兼容性检查已通过，是否应用这些结果需要你确认。",
    confirmEffect: "确认后会把检查通过的组合结果应用到项目源码。",
    riskSummary: "这是 source mutation，必须人工确认。",
    evidenceRefs: ["apply-check-1/integration-check.json"],
    primary: true,
    status: "passed",
    actions: [
      {
        id: "apply-check-apply:apply-check-1",
        label: "确认应用到项目",
        kind: "approval",
        enabled: true,
        requiresConfirmation: true,
        changeId: "member-discount",
        approvalId: "apply-check:apply-check-1",
        action: { actionId: "apply-check.apply", label: "确认应用到项目", command: "apply-check", args: ["apply", "apply-check-1", "artifact-hash-1"], mutates: true, requiresConfirmation: true },
      },
      {
        id: "apply-check-discard:apply-check-1",
        label: "放弃",
        kind: "approval",
        enabled: true,
        requiresConfirmation: true,
        changeId: "member-discount",
        approvalId: "apply-check:apply-check-1",
        action: { actionId: "apply-check.discard", label: "放弃组合结果", command: "apply-check", args: ["discard", "apply-check-1"], mutates: true, requiresConfirmation: true },
      },
    ],
  } as const;
}

function rawSchedulerQueueItem() {
  return {
    id: "confirm:scheduler:start-next:member-discount",
    kind: "planning-confirm",
    conversationId: "member-discount",
    changeId: "member-discount",
    summary: "下一个低冲突任务可以开始。",
    whyNeedsConfirmation: "这是当前阶段门，必须通过受控连续推进包装后才能进入完全访问权限。",
    confirmEffect: "只开始一个任务，不会应用结果或关闭需求。",
    riskSummary: "不是完整并行执行器。",
    evidenceRefs: ["scheduler-run.md"],
    primary: true,
    status: "pending",
    actions: [{
      id: "workflow:planning.scheduler.worker.start-next:claim-1",
      label: "开始下一个任务",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.scheduler.worker.start-next",
      changeId: "member-discount",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-1",
      claimIntentId: "claim-1",
    }],
  } as const;
}

function schedulerPreparationQueueItem() {
  return {
    ...rawSchedulerQueueItem(),
    actions: [
      {
        id: "workflow:planning.scheduler.controlled-advance.run:claim-1",
        label: "继续执行下一个任务",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.controlled-advance.run",
        changeId: "member-discount",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
        reservationIntentId: "reservation-1",
        claimIntentId: "claim-1",
      },
      {
        id: "workflow:planning.goal-loop.evaluate:member-discount:scheduler-continuation",
        label: "准备连续推进",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.goal-loop.evaluate",
        changeId: "member-discount",
      },
    ],
  } as const;
}

function schedulerGateReadinessQueueItem() {
  return {
    ...rawSchedulerQueueItem(),
    actions: [
      {
        id: "workflow:planning.goal-loop.controller.refresh:packet-1",
        label: "刷新下一步判断",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.goal-loop.controller.refresh",
        changeId: "member-discount",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
      {
        id: "workflow:planning.goal-loop.gate-readiness.prepare:policy-1",
        label: "检查当前步骤",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.goal-loop.gate-readiness.prepare",
        changeId: "member-discount",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopControllerPolicyId: "policy-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
      {
        id: "workflow:planning.scheduler.controlled-advance.run:claim-1",
        label: "按当前建议继续一个受控步骤",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.controlled-advance.run",
        changeId: "member-discount",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
    ],
  } as const;
}

function integrationCheckQueueItemWithGoalLoopGuidance() {
  return {
    id: "confirm:planning.scheduler.integration-check.run:member-discount:candidate-1",
    kind: "planning-confirm",
    conversationId: "member-discount",
    changeId: "member-discount",
    summary: "需要你确认进入组合结果检查；应用到项目仍有单独人工确认。",
    whyNeedsConfirmation: "需要你确认进入组合结果检查；应用到项目仍有单独人工确认。",
    confirmEffect: "只会生成或记录组合候选、交接或结果证据。",
    riskSummary: "不会自动应用、放弃、提交、创建 PR、合并、继续下一任务循环或修改项目源码。",
    evidenceRefs: ["candidate.json"],
    primary: true,
    status: "pending",
    actions: [
      {
        id: "workflow:planning.scheduler.integration-check.run:member-discount:candidate-1",
        label: "检查组合结果",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.integration-check.run",
        changeId: "member-discount",
        schedulerRunId: "scheduler-run-1",
        schedulerIntegrationCandidateId: "candidate-1",
      },
      {
        id: "workflow:planning.goal-loop.controller.refresh:packet-1",
        label: "刷新下一步判断",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.goal-loop.controller.refresh",
        changeId: "member-discount",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopCurrentGateActionType: "planning.scheduler.integration-check.run",
        schedulerRunId: "scheduler-run-1",
        schedulerIntegrationCandidateId: "candidate-1",
      },
      {
        id: "workflow:planning.goal-loop.gate-readiness.prepare:policy-1",
        label: "检查当前步骤",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.goal-loop.gate-readiness.prepare",
        changeId: "member-discount",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopControllerPolicyId: "policy-1",
        goalLoopCurrentGateActionType: "planning.scheduler.integration-check.run",
        schedulerRunId: "scheduler-run-1",
        schedulerIntegrationCandidateId: "candidate-1",
      },
    ],
  } as const;
}

describe("Workbench web app", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, String(value)); },
        removeItem: (key: string) => { storage.delete(key); },
        clear: () => { storage.clear(); },
      },
    });
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
      if (url === "/api/codex/diagnostics" || url.endsWith("/codex/diagnostics")) {
        return jsonResponse(codexDiagnostics);
      }
      if (url === "/api/codex/models" || url.endsWith("/codex/models")) {
        return jsonResponse(codexModelSettings);
      }
      if (url === "/api/providers/capabilities" || url.endsWith("/providers/capabilities")) {
        return jsonResponse(providerCapabilityPayload);
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders composer attachment chips with a real paperclip entry", () => {
    const onRemoveAttachment = vi.fn();
    render(
      <TopicComposer
        value=""
        onChange={() => undefined}
        mode="chat"
        onModeChange={() => undefined}
        automationMode="request-approval"
        onAutomationModeChange={() => undefined}
        modelLabel="gpt-5.5"
        enabledSkillCount={0}
        projectId="repo"
        skills={[]}
        activeSkillIds={[]}
        selectedFileRefs={[]}
        attachments={[{
          id: "att-20260628120000-abcdef123456",
          fileName: "screenshot.png",
          mediaType: "image/png",
          kind: "image",
          size: 2048,
          hash: "abcdef1234567890",
          source: "composer",
          createdAt: "2026-06-28T12:00:00.000Z",
          storagePath: "attachments/att-20260628120000-abcdef123456/content.png",
          runtimeMode: "codex-image-input",
          previewUrl: "data:image/png;base64,AAAA",
        }]}
        onAttachFiles={() => undefined}
        onRemoveAttachment={onRemoveAttachment}
        onToggleSkill={() => undefined}
        onSelectedFileRefsChange={() => undefined}
        onSend={async () => undefined}
        actionRunning={null}
        busy={false}
        canRunCode={false}
      />,
    );

    expect(screen.getByLabelText("添加附件")).toBeTruthy();
    expect(screen.getByText("screenshot.png")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("移除 screenshot.png"));
    expect(onRemoveAttachment).toHaveBeenCalledWith("att-20260628120000-abcdef123456");
  });

  it("loads a paged transcript and keeps large conversations bounded in the DOM", async () => {
    const largeTranscript = {
      ...snapshot.center.parentAgentTranscript,
      cells: Array.from({ length: 1000 }, (_, index) => ({
        id: `cell:assistant:${index}`,
        kind: "assistant-message",
        source: "codex-runtime",
        text: `message ${index}`,
      })),
      items: [],
      paging: { limit: 100, totalCount: 1000, hasMoreBefore: false },
    };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(largeTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    });

    render(<App />);

    await screen.findByTestId("transcript-virtual-list");
    await waitFor(() => expect(fetchCallUrls().some((url) => url.includes("/workbench/projections/transcript/member-discount?limit=100"))).toBe(true));
    expect(screen.getAllByTestId("parent-message-parent-agent").length).toBeLessThan(80);
  });

  it("folds very long transcript messages until the user expands them", async () => {
    const hiddenSentinel = "FULL_SENTINEL_END";
    const longText = `preview line\n${"a".repeat(7000)}\n${hiddenSentinel}`;
    const transcript = {
      ...snapshot.center.parentAgentTranscript,
      cells: [{
        id: "cell:assistant:long",
        kind: "assistant-message",
        source: "codex-runtime",
        text: longText,
      }],
      items: [],
      paging: { limit: 100, totalCount: 1, hasMoreBefore: false },
    };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(transcript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    });

    render(<App />);

    await screen.findByText("展开完整内容");
    expect(screen.queryByText(new RegExp(hiddenSentinel))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "展开完整内容" }));
    await screen.findByText(new RegExp(hiddenSentinel));
  });

  it("renders transcript as reference-style reading prose and collapsible activity rows", async () => {
    const transcript = {
      ...snapshot.center.parentAgentTranscript,
      cells: [{
        id: "cell:user:reading",
        kind: "user-message",
        source: "user",
        text: "请实现这个需求",
      }, {
        id: "cell:assistant:reading",
        kind: "assistant-message",
        source: "codex-runtime",
        text: "# 实现计划\n\n1. 读取现有实现\n2. 修改显示层\n\n> 保持 Harness 边界\n\n```ts\nconst ok = true;\n```",
      }, {
        id: "cell:process:reading",
        kind: "process-row",
        source: "codex-runtime",
        title: "已运行命令",
        text: "已运行 1 条命令",
        detailText: "npm test\nPASS transcript surface",
        evidenceRefs: [{ kind: "artifact", label: "output", ref: "runs/run-1/output.md" }],
      }, {
        id: "cell:process:duplicate-summary",
        kind: "process-row",
        source: "codex-runtime",
        title: "Planning draft generated",
        text: "Planning draft generated 已完成",
        status: "completed",
      }, {
        id: "cell:evidence:reading",
        kind: "evidence-row",
        source: "workflow-evidence",
        title: "验证材料",
        text: "验证通过",
      }, {
        id: "cell:process:failed",
        kind: "process-row",
        source: "codex-runtime",
        title: "验证失败",
        text: "验证失败",
        status: "failed",
        isError: true,
      }],
      items: [],
      paging: { limit: 100, totalCount: 6, hasMoreBefore: false },
    };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(transcript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    });

    render(<App />);

    await screen.findByTestId("transcript-virtual-list");
    await screen.findByText("请实现这个需求");
    const userMessage = Array.from(document.querySelectorAll(".transcript-user-message"))
      .find((node) => node.textContent?.includes("请实现这个需求"));
    const assistantMessage = Array.from(document.querySelectorAll(".transcript-assistant-message"))
      .find((node) => node.textContent?.includes("实现计划"));
    expect(userMessage?.textContent).toContain("请实现这个需求");
    expect(assistantMessage?.textContent).toContain("实现计划");
    expect(document.querySelector(".markdown-lite-ordered")?.textContent).toContain("读取现有实现");
    expect(document.querySelector(".markdown-lite-quote")?.textContent).toContain("保持 Harness 边界");
    expect(document.querySelector(".markdown-lite-code-label")?.textContent).toBe("ts");
    const activityRows = Array.from(document.querySelectorAll(".transcript-activity-row"));
    expect(activityRows).toHaveLength(4);
    const processRow = activityRows.find((node) => node.textContent?.includes("已运行 1 条命令")) as HTMLElement | undefined;
    expect(processRow).toBeTruthy();
    expect(processRow?.classList.contains("tone-subtle")).toBe(true);
    expect(processRow?.textContent).not.toContain("PASS transcript surface");
    fireEvent.click(within(processRow as HTMLElement).getByRole("button", { name: "已运行 1 条命令" }));
    expect(processRow?.textContent).toContain("PASS transcript surface");
    expect(processRow?.textContent).toContain("材料：output.md");
    const duplicateSummaryRow = activityRows.find((node) => node.textContent?.includes("Planning draft generated")) as HTMLElement | undefined;
    expect(duplicateSummaryRow).toBeTruthy();
    expect(duplicateSummaryRow?.classList.contains("tone-subtle")).toBe(true);
    expect(duplicateSummaryRow?.textContent).not.toContain("Planning draft generated 已完成");
    const failedRow = activityRows.find((node) => node.textContent?.includes("验证失败")) as HTMLElement | undefined;
    expect(failedRow).toBeTruthy();
    expect(failedRow?.classList.contains("tone-danger")).toBe(true);
    expect(failedRow?.classList.contains("danger")).toBe(true);
    expect(screen.queryByText("查看详情")).toBeNull();
    const transcriptText = screen.getByTestId("parent-agent-transcript").textContent ?? "";
    for (const forbidden of ["full-auto", "parallel executor", "merge queue", "TaskRun", "WorkerLease"]) {
      expect(transcriptText).not.toContain(forbidden);
    }
  });

  it("renders bounded continuation as the primary confirmation and submits maxSteps once confirmed", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: boundedContinuationQueueItem(),
            current: [boundedContinuationQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    expect(card.textContent).toContain("最多推进 5 步");
    expect(card.textContent).toContain("不是全自动任务模式");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");

    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.goal-loop.controlled-continue.run",
      changeId: "member-discount",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "policy-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-1",
      claimIntentId: "claim-1",
      maxSteps: 10,
    });
    const ResizeObserverStub = class {
      observe(): void {}
      disconnect(): void {}
    };
    Object.defineProperty(window, "ResizeObserver", { configurable: true, value: ResizeObserverStub });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("EventSource", class {
      onerror: (() => void) | null = null;
      constructor(public readonly url: string) {}
      addEventListener(): void {}
      close(): void {}
    });
  });

  it("uses composer auto mode to submit scoped-auto with the current gate target ids", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: decompositionConfirmQueueItem(),
            current: [decompositionConfirmQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    expect(within(card).queryByLabelText("后续执行模式")).toBeNull();
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");

    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.decomposition.confirm",
      changeId: "member-discount",
      decompositionPlanId: "decomp-1",
      maxSteps: 10,
    });
  });

  it("uses composer auto mode as post-plan mode without converting planning confirmation to scoped-auto", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: planningConfirmQueueItem(),
            current: [planningConfirmQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    expect(within(card).queryByLabelText("后续执行模式")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "确认规划" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.confirm-execution",
      changeId: "member-discount",
      planningBundleId: "planning-bundle-1",
      postPlanAutomationMode: "full-access",
    });
    expect(execute.mock.calls[0]?.[0]).not.toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
    });
  });

  it("submits request-approval as the default post-plan mode", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: planningConfirmQueueItem(),
            current: [planningConfirmQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "确认规划" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.confirm-execution",
      changeId: "member-discount",
      planningBundleId: "planning-bundle-1",
      postPlanAutomationMode: "request-approval",
    });
  });

  it("submits scoped-auto for the decomposition proposal gate", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: decomposeQueueItem(),
            current: [decomposeQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.decompose",
      changeId: "member-discount",
      maxSteps: 10,
    });
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");
  });

  it("submits scoped-auto for an eligible audit.accept approval gate", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: auditAcceptQueueItem(true),
            current: [auditAcceptQueueItem(true)],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "audit.accept",
      automationCurrentGateTargetId: "audit-1",
      automationCurrentGateRunId: "audit-run-1",
      automationCurrentGateArtifact: "runs/audit-run-1/audit.json",
      changeId: "member-discount",
      maxSteps: 10,
    });
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");
  });

  it("submits scoped-auto for eligible local apply and close approval gates", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness({ close = false }: { close?: boolean }) {
      const [confirming, setConfirming] = useState<string | null>(null);
      const item = close ? closeQueueItem(true) : applyQueueItem(true);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: item,
            current: [item],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    const { rerender } = render(<Harness />);
    let card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "result.apply",
      automationCurrentGateTargetId: "wt-1",
      automationCurrentGateArtifact: "runs/audit-run-1/audit.json",
      changeId: "member-discount",
      maxSteps: 10,
    });

    execute.mockClear();
    rerender(<Harness close />);
    card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "change.close",
      automationCurrentGateTargetId: "member-discount",
      changeId: "member-discount",
      maxSteps: 10,
    });
  });

  it("submits scoped-auto for the local landing.prepare gate with worktree scope", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: landingPrepareQueueItem(),
            current: [landingPrepareQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    expect(within(card).getAllByText("本地结果已应用，可以做提交/PR 前检查。").length).toBeGreaterThan(0);
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateActionType: "landing.prepare",
      changeId: "member-discount",
      worktreeId: "wt-1",
      worktreeIds: ["wt-1"],
      maxSteps: 10,
    });
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("merge queue");
  });

  it("submits scoped-auto for bounded recovery workflow gates with worktree scope", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: recoveryQueueItem("result.refresh-rework"),
            current: [recoveryQueueItem("result.refresh-rework")],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateActionType: "result.refresh-rework",
      changeId: "member-discount",
      worktreeId: "wt-1",
      maxSteps: 10,
    });
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");
  });

  it("does not offer full-access for apply gates or non-eligible audit approvals", () => {
    const execute = vi.fn(async () => undefined);
    const noop = async () => undefined;
    const { rerender } = render(
      <DecisionInspectorPane
        inspector={{ primary: null, related: [], history: [] }}
        confirmationQueue={{
          primary: applyQueueItem(),
          current: [applyQueueItem()],
          otherDemands: [],
          maintenance: [],
          history: [],
        }}
        confirming={null}
        busy={false}
        error={null}
        onConfirmingChange={() => undefined}
        onExecuteAction={execute}
        onFeedback={noop}
        onSelectContext={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "自动推进" })).toBeNull();

    rerender(
      <DecisionInspectorPane
        inspector={{ primary: null, related: [], history: [] }}
        confirmationQueue={{
          primary: integrationApplyQueueItem(),
          current: [integrationApplyQueueItem()],
          otherDemands: [],
          maintenance: [],
          history: [],
        }}
        confirming={null}
        busy={false}
        error={null}
        onConfirmingChange={() => undefined}
        onExecuteAction={execute}
        onFeedback={noop}
        onSelectContext={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "确认应用到项目" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "放弃" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "自动推进" })).toBeNull();

    rerender(
      <DecisionInspectorPane
        inspector={{ primary: null, related: [], history: [] }}
        confirmationQueue={{
          primary: auditAcceptQueueItem(false),
          current: [auditAcceptQueueItem(false)],
          otherDemands: [],
          maintenance: [],
          history: [],
        }}
        confirming={null}
        busy={false}
        error={null}
        onConfirmingChange={() => undefined}
        onExecuteAction={execute}
        onFeedback={noop}
        onSelectContext={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "自动推进" })).toBeNull();
  });

  it("does not offer full-access directly for raw scheduler workflow gates", () => {
    const execute = vi.fn(async () => undefined);
    render(
      <DecisionInspectorPane
        inspector={{ primary: null, related: [], history: [] }}
        confirmationQueue={{
          primary: rawSchedulerQueueItem(),
          current: [rawSchedulerQueueItem()],
          otherDemands: [],
          maintenance: [],
          history: [],
        }}
        confirming={null}
        busy={false}
        error={null}
        onConfirmingChange={() => undefined}
        onExecuteAction={execute}
        onFeedback={async () => undefined}
        onSelectContext={() => undefined}
      />,
    );

    const card = screen.getByTestId("decision-inspector-primary");
    expect(within(card).getByRole("button", { name: "开始下一个任务" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "自动推进" })).toBeNull();
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");
    expect(card.textContent).not.toContain("SchedulerContract");
    expect(card.textContent).not.toContain("WorkerLease");
    expect(card.textContent?.toLowerCase()).not.toContain("worker");
    expect(card.textContent).not.toContain("dry-run");
  });

  it("does not offer full-access for manual IntegrationCheck even with Goal Loop guidance actions", () => {
    const execute = vi.fn(async () => undefined);
    render(
      <DecisionInspectorPane
        inspector={{ primary: null, related: [], history: [] }}
        confirmationQueue={{
          primary: integrationCheckQueueItemWithGoalLoopGuidance(),
          current: [integrationCheckQueueItemWithGoalLoopGuidance()],
          otherDemands: [],
          maintenance: [],
          history: [],
        }}
        confirming={null}
        busy={false}
        error={null}
        onConfirmingChange={() => undefined}
        onExecuteAction={execute}
        onFeedback={async () => undefined}
        onSelectContext={() => undefined}
      />,
    );

    const card = screen.getByTestId("decision-inspector-primary");
    expect(within(card).getByRole("button", { name: "检查组合结果" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "刷新下一步判断" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "自动推进" })).toBeNull();
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");
  });

  it("offers full-access through Goal Loop preparation on supported scheduler gates", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: schedulerPreparationQueueItem(),
            current: [schedulerPreparationQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.goal-loop.evaluate",
      changeId: "member-discount",
      maxSteps: 10,
    });
    expect(execute.mock.calls[0]?.[0]).not.toMatchObject({
      automationCurrentGateActionType: "planning.scheduler.controlled-advance.run",
    });
    expect(card.textContent).not.toContain("full-auto");
    expect(card.textContent).not.toContain("parallel executor");
    expect(card.textContent).not.toContain("merge queue");
  });

  it("prioritizes gate readiness before refreshing older Goal Loop evidence for full-access", async () => {
    const execute = vi.fn(async () => undefined);
    function Harness() {
      const [confirming, setConfirming] = useState<string | null>(null);
      return (
        <DecisionInspectorPane
          inspector={{ primary: null, related: [], history: [] }}
          confirmationQueue={{
            primary: schedulerGateReadinessQueueItem(),
            current: [schedulerGateReadinessQueueItem()],
            otherDemands: [],
            maintenance: [],
            history: [],
          }}
          confirming={confirming}
          busy={false}
          error={null}
          automationMode="full-access"
          onConfirmingChange={setConfirming}
          onExecuteAction={execute}
          onFeedback={async () => undefined}
          onSelectContext={() => undefined}
        />
      );
    }

    render(<Harness />);

    const card = screen.getByTestId("decision-inspector-primary");
    fireEvent.click(within(card).getByRole("button", { name: "自动推进" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      actionType: "planning.automation.scoped-auto.run",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.goal-loop.gate-readiness.prepare",
      changeId: "member-discount",
      maxSteps: 10,
    });
    expect(execute.mock.calls[0]?.[0]).not.toMatchObject({
      automationCurrentGateActionType: "planning.goal-loop.controller.refresh",
    });
    expect(execute.mock.calls[0]?.[0]).not.toMatchObject({
      automationCurrentGateActionType: "planning.scheduler.controlled-advance.run",
    });
  });

  it("renders Chinese workbench panes and replay artifacts", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    expect(screen.getByTestId("main-conversation-view")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "对话" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Agent 编排图" })).toBeTruthy();
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
    await openDecisionPane();
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
    expect(screen.queryByText("刷新状态")).toBeNull();
    expect(screen.queryByText("更多")).toBeNull();
    expect(screen.queryByText("稍后")).toBeNull();
    expect(screen.getByText("项目数据：已准备")).toBeTruthy();
    expect(screen.getByText("当前需求：会员折扣计价")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Agent 编排图" }));
    expect(await screen.findByTestId("agent-run-graph", undefined, { timeout: 5000 })).toBeTruthy();
    expect(fetchCallUrls()).toContain("/api/projects/repo/workbench/projections/run-graph/member-discount");
    expect(screen.getByTestId("agent-orchestration-map")).toBeTruthy();
    expect(screen.getByTestId("agent-orchestration-zoom-in")).toBeTruthy();
    expect(screen.getByTestId("agent-orchestration-zoom-out")).toBeTruthy();
    expect(screen.getByTestId("agent-orchestration-fit")).toBeTruthy();
    expect(screen.getAllByTestId("agent-orchestration-edge").length).toBeGreaterThan(0);
    expect(screen.getByTestId("agent-run-node-main-agent")).toBeTruthy();
    expect(screen.getByTestId("agent-run-node-coder-agent")).toBeTruthy();
    expect(document.querySelector(".agent-orchestration-card .agent-orchestration-avatar")).toBeTruthy();
    const graphText = screen.getByTestId("agent-run-graph").textContent ?? "";
    for (const forbidden of ["full-auto", "parallel executor", "merge queue", "automatic remote", "TaskRun", "WorkerLease"]) {
      expect(graphText).not.toContain(forbidden);
    }
    expect(screen.queryByTestId("agent-run-node-memory-closeout")).toBeNull();
    fireEvent.click(screen.getByTestId("agent-run-node-coder-agent"));
    expect(screen.getByTestId("agent-run-node-detail")).toBeTruthy();
    expect(screen.getByText("打开原始日志")).toBeTruthy();
    fireEvent.click(screen.getByText("打开原始日志"));
    await waitFor(() => expect(screen.getByText("模型事件转录")).toBeTruthy());

    await openDecisionPane();
    fireEvent.click(screen.getAllByText("同意")[0] as HTMLElement);
    expect(screen.getByText("确认")).toBeTruthy();
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions", expect.objectContaining({ method: "POST" }));
    });
  });

  it("defaults the confirmation pane to a collapsed rail and expands without submitting actions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    expect(document.querySelector(".app-shell")?.classList.contains("decision-pane-collapsed")).toBe(true);
    const toggle = screen.getByTestId("decision-pane-toggle");
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toContain("1");
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
    const actionCallCount = fetchCallUrls().filter((url) => url.endsWith("/workbench/actions")).length;

    fireEvent.click(toggle);

    expect(await screen.findByTestId("right-tool-launcher")).toBeTruthy();
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
    fireEvent.click(screen.getByTestId("right-tool-launcher-confirm"));
    const card = await screen.findByTestId("decision-inspector-primary");
    expect(document.querySelector(".app-shell")?.classList.contains("decision-pane-expanded")).toBe(true);
    expect(within(card).getByText("确认完成需求对话")).toBeTruthy();
    expect(fetchCallUrls().filter((url) => url.endsWith("/workbench/actions"))).toHaveLength(actionCallCount);

    fireEvent.click(screen.getByTestId("decision-pane-collapse"));
    expect(screen.getByTestId("decision-pane-toggle")).toBeTruthy();
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
  });

  it("opens the minimal right tool rail with confirmation, files, Git, diagnostics, and a separate terminal toggle", async () => {
    const fileRef = { relativePath: "src/pricing.ts", name: "pricing.ts", kind: "file", extension: ".ts", size: 24 };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url === "/api/projects/repo/files/children?path=") {
        return jsonResponse({ path: "", parentPath: null, entries: [{ relativePath: "src", name: "src", kind: "directory" }, fileRef] });
      }
      if (url === "/api/projects/repo/files/preview?path=src%2Fpricing.ts") {
        return jsonResponse({ ...fileRef, path: fileRef.relativePath, status: "text", content: "export const price = 1;\n", truncated: false });
      }
      if (url === "/api/projects/repo/git/status") {
        return jsonResponse({
          isGitRepository: true,
          branch: "main",
          dirty: true,
          staged: [{ relativePath: "src/staged.ts", name: "staged.ts", group: "staged", indexStatus: "A", worktreeStatus: " ", statusLabel: "新增", additions: 1, deletions: 0 }],
          unstaged: [{ relativePath: "src/pricing.ts", name: "pricing.ts", group: "unstaged", indexStatus: " ", worktreeStatus: "M", statusLabel: "修改", additions: 1, deletions: 1 }],
          untracked: [{ relativePath: "src/new.ts", name: "new.ts", group: "untracked", indexStatus: "?", worktreeStatus: "?", statusLabel: "未跟踪" }],
          totalAdditions: 2,
          totalDeletions: 1,
        });
      }
      if (url === "/api/projects/repo/git/diff?path=src%2Fpricing.ts") {
        return jsonResponse({
          relativePath: "src/pricing.ts",
          name: "pricing.ts",
          status: "text",
          sections: [{ label: "未暂存", kind: "unstaged", patch: "diff --git a/src/pricing.ts b/src/pricing.ts\n@@ -1 +1 @@\n-export const price = 1;\n+export const price = 2;", truncated: false }],
          additions: 1,
          deletions: 1,
        });
      }
      if (url === "/api/projects/repo/terminal/sessions") {
        return jsonResponse({ session: { projectId: "repo", terminalId: "terminal-test", cwd: "E:/repo", shell: "cmd.exe" } });
      }
      if (url.includes("/api/projects/repo/terminal/sessions/") && url.endsWith("/resize")) return jsonResponse({ ok: true });
      if (url.includes("/api/projects/repo/terminal/sessions/") && url.endsWith("/write")) return jsonResponse({ ok: true });
      if (url === "/api/projects/repo/runtime/diagnostics") {
        return jsonResponse({
          generatedAt: "2026-06-29T00:00:00.000Z",
          summary: { status: "degraded", issueCount: 0, degradedCount: 1 },
          items: [
            { id: "terminal:runtime", title: "终端", status: "ok", summary: "终端运行环境可用。" },
            { id: "codex:model-list", title: "模型列表", status: "warning", summary: "模型列表暂不可用，仍可使用配置或默认模型。", detail: "degraded" },
          ],
        });
      }
      if (url === "/api/projects/repo/runtime/activity?limit=100&topicId=member-discount") {
        return jsonResponse({
          generatedAt: "2026-06-29T00:00:01.000Z",
          projectId: "repo",
          topicId: "member-discount",
          limit: 100,
          truncated: false,
          items: [
            {
              id: "provider:codex",
              timestamp: "2026-06-29T00:00:00.000Z",
              type: "provider",
              severity: "warning",
              status: "degraded",
              title: "Codex runtime",
              summary: "Codex runtime 降级，继续使用默认模型。",
              refs: [{ kind: "provider", label: "provider: codex", id: "codex" }],
              details: ["Provider: Codex", "Product Mode: Harness", "Harness Execution Mode: 逐步确认 / 自动推进"],
            },
            {
              id: "validation:run-1",
              timestamp: "2026-06-29T00:00:02.000Z",
              type: "validation",
              severity: "ok",
              status: "passed",
              title: "验证通过",
              summary: "fast · 2 条命令。",
              refs: [{ kind: "run", label: "run-1", id: "run-1" }],
            },
          ],
        });
      }
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    const actionCallCount = fetchCallUrls().filter((url) => url.endsWith("/workbench/actions")).length;

    expect(screen.getByTestId("terminal-dock-toggle").classList.contains("top-tool-button")).toBe(true);
    expect(screen.getByTestId("decision-pane-toggle").classList.contains("top-tool-button")).toBe(true);
    fireEvent.click(screen.getByTestId("decision-pane-toggle"));
    const launcher = await screen.findByTestId("right-tool-launcher");
    expect(within(launcher).getByText("确认")).toBeTruthy();
    expect(screen.getByTestId("right-tool-launcher-files")).toBeTruthy();
    expect(screen.getByTestId("right-tool-launcher-git")).toBeTruthy();
    expect(screen.getByTestId("right-tool-launcher-diagnostics")).toBeTruthy();
    expect(screen.getByTestId("decision-pane-collapse").classList.contains("top-tool-button")).toBe(true);
    expect(screen.queryByTestId("right-tool-tab-terminal")).toBeNull();
    expect(screen.getByTestId("terminal-dock-toggle")).toBeTruthy();
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
    expect(screen.queryByRole("tablist", { name: "右侧工具" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "浏览器" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "日志" })).toBeNull();

    fireEvent.click(screen.getByTestId("right-tool-launcher-confirm"));
    expect(await screen.findByTestId("decision-inspector-primary")).toBeTruthy();
    fireEvent.click(screen.getByTestId("right-tool-back"));
    expect(await screen.findByTestId("right-tool-launcher")).toBeTruthy();

    fireEvent.click(screen.getByTestId("right-tool-launcher-files"));
    const filesPanel = await screen.findByTestId("project-files-panel");
    expect(within(filesPanel).getByText("pricing.ts")).toBeTruthy();
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();

    fireEvent.click(within(filesPanel).getByRole("button", { name: /pricing\.ts/ }));
    await waitFor(() => expect(within(filesPanel).getByText("export const price = 1;")).toBeTruthy());
    fireEvent.click(within(filesPanel).getByText("引用到输入框"));
    expect(screen.getAllByText("pricing.ts").length).toBeGreaterThan(1);

    fireEvent.click(screen.getByTestId("right-tool-back"));
    fireEvent.click(await screen.findByTestId("right-tool-launcher-git"));
    const gitPanel = await screen.findByTestId("project-git-panel");
    expect(within(gitPanel).getByText("main")).toBeTruthy();
    expect(within(gitPanel).getByText("src/pricing.ts")).toBeTruthy();
    expect(within(gitPanel).queryByText("提交")).toBeNull();
    expect(within(gitPanel).queryByText("推送")).toBeNull();
    expect(within(gitPanel).queryByText("PR")).toBeNull();

    fireEvent.click(within(gitPanel).getByRole("button", { name: /src\/pricing\.ts/ }));
    expect((await screen.findByRole("tab", { name: "Git Diff" })).getAttribute("aria-selected")).toBe("true");
    const diffViewer = await screen.findByTestId("git-diff-viewer");
    await waitFor(() => expect(within(diffViewer).getByText("+export const price = 2;")).toBeTruthy());
    expect(within(diffViewer).queryByText("commit")).toBeNull();
    fireEvent.click(within(gitPanel).getAllByText("引用")[0] as HTMLElement);
    await waitFor(() => expect(screen.getByText("staged.ts")).toBeTruthy());

    fireEvent.click(screen.getByTestId("terminal-dock-toggle"));
    expect(await screen.findByTestId("terminal-dock")).toBeTruthy();
    expect(await screen.findByTestId("terminal-xterm")).toBeTruthy();
    expect(fetchCallUrls()).toContain("/api/projects/repo/terminal/sessions");

    fireEvent.click(screen.getByTestId("right-tool-back"));
    fireEvent.click(await screen.findByTestId("right-tool-launcher-diagnostics"));
    const diagnosticsPanel = await screen.findByTestId("runtime-diagnostics-rail-panel");
    expect(within(diagnosticsPanel).getByText("运行诊断")).toBeTruthy();
    expect(within(diagnosticsPanel).getByText("模型列表")).toBeTruthy();
    fireEvent.click(within(diagnosticsPanel).getByTestId("open-runtime-activity-log"));
    const runtimeLog = await screen.findByTestId("runtime-activity-log");
    expect(within(runtimeLog).getByText("运行日志")).toBeTruthy();
    expect(within(runtimeLog).getByText("Codex runtime")).toBeTruthy();
    expect(within(runtimeLog).getByText("验证通过")).toBeTruthy();
    expect(within(runtimeLog).queryByText("Run")).toBeNull();
    expect(within(runtimeLog).queryByText("Stop")).toBeNull();
    expect(within(runtimeLog).queryByText("自动修复")).toBeNull();
    expect(within(diagnosticsPanel).queryByText("打开诊断面板")).toBeNull();
    expect(screen.queryByTestId("runtime-diagnostics-dock")).toBeNull();
    expect(screen.getByTestId("terminal-dock")).toBeTruthy();
    expect(fetchCallUrls().filter((url) => url.endsWith("/workbench/actions"))).toHaveLength(actionCallCount);
  });

  it("shows a readable terminal timeout instead of staying in connecting state", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url === "/api/projects/repo/terminal/sessions") return new Promise<Response>(() => undefined);
      if (url.includes("/api/projects/repo/terminal/sessions/") && url.endsWith("/resize")) return jsonResponse({ ok: true });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("terminal-dock-toggle"));
    expect(screen.getByText("正在连接终端")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText("终端不可用")).toBeTruthy();
    expect(screen.getByText("终端连接超时。请确认 Workbench 服务仍在运行，或重新打开终端。")).toBeTruthy();
    expect(screen.getByTestId("terminal-dock")).toBeTruthy();
  });

  it("opens the center Git diff viewer from the Git rail even before a topic is selected", async () => {
    const homeSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
      right: { ...snapshot.right, approvals: [], decisions: [], decisionInspector: { primary: null, related: [], history: [] }, confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [], history: [] } },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" }, memory: { memoryMode: "repo-local", memoryAvailable: true, harnessReady: true } }] });
      if (url === "/api/projects/repo/git/status") {
        return jsonResponse({
          isGitRepository: true,
          branch: "main",
          dirty: true,
          staged: [],
          unstaged: [{ relativePath: "src/pricing.ts", name: "pricing.ts", group: "unstaged", indexStatus: " ", worktreeStatus: "M", statusLabel: "修改", additions: 1, deletions: 1 }],
          untracked: [],
          totalAdditions: 1,
          totalDeletions: 1,
        });
      }
      if (url === "/api/projects/repo/git/diff?path=src%2Fpricing.ts") {
        return jsonResponse({
          relativePath: "src/pricing.ts",
          name: "pricing.ts",
          status: "text",
          sections: [{ label: "未暂存", kind: "unstaged", patch: "@@ -1 +1 @@\n-export const price = 1;\n+export const price = 2;", truncated: false }],
          additions: 1,
          deletions: 1,
        });
      }
      return jsonResponse(homeSnapshot);
    }));

    render(<App />);
    await waitFor(() => expect(screen.getByText("创造任何东西")).toBeTruthy());
    fireEvent.click(screen.getByTestId("decision-pane-toggle"));
    fireEvent.click(await screen.findByTestId("right-tool-launcher-git"));
    const gitPanel = await screen.findByTestId("project-git-panel");
    fireEvent.click(within(gitPanel).getByRole("button", { name: /src\/pricing\.ts/ }));
    const diffViewer = await screen.findByTestId("git-diff-viewer");
    await waitFor(() => expect(within(diffViewer).getByText("+export const price = 2;")).toBeTruthy());
    expect(screen.queryByText("创造任何东西")).toBeNull();
    expect(fetchCallUrls().filter((url) => url.endsWith("/workbench/actions"))).toHaveLength(0);
  });

  it("keeps the Agent orchestration map usable while the confirmation rail is collapsed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    expect(screen.getByTestId("decision-pane-toggle")).toBeTruthy();
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Agent 编排图" }));

    expect(await screen.findByTestId("agent-run-graph", undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId("agent-orchestration-map")).toBeTruthy();
    expect(screen.getByTestId("agent-orchestration-zoom-in")).toBeTruthy();
    expect(screen.getByTestId("agent-orchestration-fit")).toBeTruthy();
    expect(screen.getAllByTestId("agent-orchestration-edge").length).toBeGreaterThan(0);
    expect(document.querySelector(".agent-orchestration-card .agent-orchestration-avatar")).toBeTruthy();
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
  });

  it("renders a usable manual-gated loop with one real apply confirmation and no future automation affordance", async () => {
    const applyDecision = {
      id: "result:member-discount:wt-1:ready",
      kind: "apply-gate",
      title: "确认应用并本地提交",
      summary: "验证和审查已通过，可以由你确认应用到项目。",
      userStatus: "waiting-confirmation",
      resultSummary: "验证和审查已通过，可以由你确认应用到项目。",
      recommendation: "应用会把当前结果写入项目；要求修改会进入下一轮修改；放弃只丢弃这次结果。",
      explanation: "应用是高影响动作，仍需要明确确认；这不会执行远端提交或合并。",
      severity: "info",
      changeId: "member-discount",
      targetId: "wt-1",
      actions: [{
        id: "apply:wt-1",
        label: "应用并本地提交",
        kind: "approval",
        changeId: "member-discount",
        action: { actionId: "result.apply", label: "应用并本地提交", command: "result", args: ["apply", "", "member-discount", "wt-1"], mutates: true, requiresConfirmation: true },
        options: { commit: true, message: "Apply AHO result: member-discount" },
        enabled: true,
        requiresConfirmation: true,
      }],
    };
    const applyQueueItem = {
      id: "confirm:result:member-discount:wt-1:ready",
      kind: "single-result-apply",
      conversationId: "member-discount",
      changeId: "member-discount",
      resultId: "wt-1",
      worktreeId: "wt-1",
      summary: "验证和审查已通过，可以由你确认应用到项目。",
      whyNeedsConfirmation: "确认应用到项目",
      confirmEffect: "应用会把当前结果写入项目并创建本地提交；要求修改会进入下一轮修改；放弃只丢弃这次结果。",
      riskSummary: "应用是高影响动作，仍需要明确确认；这不会执行远端提交、PR 或合并。",
      evidenceRefs: ["harness/runs/audit-1/audit.md"],
      actions: applyDecision.actions,
      primary: true,
      status: "pending",
    };
    const uiSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        decisionInspector: { ...snapshot.right.decisionInspector, primary: applyDecision, related: [], history: snapshot.right.decisionInspector.history },
        confirmationQueue: { ...snapshot.right.confirmationQueue, primary: applyQueueItem, current: [applyQueueItem], otherDemands: [], maintenance: [] },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(uiSnapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(uiSnapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : uiSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    const transcript = screen.getByTestId("parent-agent-transcript");
    expect(within(transcript).getByText("会员用户满 100 元享 9 折")).toBeTruthy();
    expect(within(transcript).getByText("Codex final summary 完整显示。")).toBeTruthy();
    expect(screen.getByTestId("decision-pane-toggle")).toBeTruthy();
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
    const primaryDecision = await openDecisionPane();
    expect(within(primaryDecision).getByText("确认应用到项目")).toBeTruthy();
    expect(within(primaryDecision).getByText("验证和审查已通过，可以由你确认应用到项目。")).toBeTruthy();
    expect(within(primaryDecision).getAllByRole("button", { name: /应用并本地提交/ })).toHaveLength(1);
    expect(primaryDecision.textContent).toContain("audit.md");
    fireEvent.click(within(primaryDecision).getByRole("button", { name: /应用并本地提交/ }));
    fireEvent.click(within(primaryDecision).getByRole("button", { name: "确认" }));
    await waitFor(() => {
      const actionCall = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit | undefined]> } }).mock.calls.find(([url, init]) =>
        String(url) === "/api/projects/repo/workbench/actions" && init?.method === "POST"
      );
      expect(actionCall).toBeTruthy();
      expect(JSON.parse(String(actionCall?.[1]?.body))).toMatchObject({
        action: { actionId: "result.apply", args: ["apply", "", "member-discount", "wt-1"] },
        confirm: true,
        options: { commit: true, message: "Apply AHO result: member-discount" },
      });
    });

    fireEvent.click(screen.getByRole("tab", { name: "工作台" }));
    const resultReview = await screen.findByTestId("result-review-card");
    expect(within(resultReview).getByText("结果可应用到项目")).toBeTruthy();
    expect(within(resultReview).getByText("验证")).toBeTruthy();
    expect(within(resultReview).getByText("审查")).toBeTruthy();
    expect(within(resultReview).getByText("下一步")).toBeTruthy();

    const visibleText = document.body.textContent ?? "";
    expect(visibleText).not.toMatch(/full-auto|全自动|parallel executor|merge queue|slot allocator|whole-wave/i);
    expect(screen.queryByRole("button", { name: /full-auto|全自动|merge|parallel|slot/i })).toBeNull();
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

  it("renders controlled scheduler workflow receipts from live action SSE before snapshot replacement", async () => {
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
    const reconfirmItem = {
      id: "confirm:controlled-advance:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      summary: "当前下一步判断和步骤检查已刷新；这次仍是新的单步确认，步骤类别是：继续执行下一个任务。",
      whyNeedsConfirmation: "需要你再次确认当前页面显示的“继续执行下一个任务”；这不是自动继续。",
      confirmEffect: "服务端会重新读取当前状态，重新匹配目标和权限；匹配后只执行“继续执行下一个任务”这一当前合法步骤。",
      riskSummary: "确认后仍会立即停止；不会自动循环、批量启动任务、组合检查后的应用、关闭、远端落地或维护演进。",
      evidenceRefs: [],
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
    const liveReadySnapshot = {
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
    const finalSnapshot = {
      ...liveReadySnapshot,
      center: {
        ...liveReadySnapshot.center,
        thread: {
          items: [
            ...liveReadySnapshot.center.thread.items,
            {
              id: "workflow-controlled-summary",
              kind: "assistant-turn",
              source: "workflow",
              label: "按当前建议继续一个受控步骤已完成",
              body: resultSummary,
              timestamp: "2026-06-20T12:00:00.000Z",
              status: "completed",
              actionRunId: "action-controlled-live",
              blocks: [
                { id: "summary-prose", sequence: 1, kind: "prose", timestamp: "2026-06-20T12:00:00.000Z", source: "workflow", title: "执行结果", text: resultSummary },
              ],
            },
          ],
        },
        parentAgentTranscript: {
          ...liveReadySnapshot.center.parentAgentTranscript,
          cells: [
            ...liveReadySnapshot.center.parentAgentTranscript.cells,
            {
              id: "cell:workflow-result:controlled-live",
              kind: "evidence-row",
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
    let snapshotReleased = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions/live")) {
        return delayedSseResponse([
          ["topic.message", {
            id: "workflow-controlled-live",
            type: "workflow.completed",
            changeId: "member-discount",
            actionRunId: "action-controlled-live",
            actionType: "planning.scheduler.controlled-advance.run",
            status: "completed",
            resultSummary,
            timestamp: "2026-06-20T12:00:00.000Z",
          }],
        ], [
          ["snapshot", finalSnapshot],
          ["done", { status: "completed" }],
        ], () => {
          snapshotReleased = true;
        });
      }
      return jsonResponse(url.includes("/stream/") ? stream : liveReadySnapshot);
    }));

    render(<App />);

    const card = await openDecisionPane();
    fireEvent.click(within(card).getByRole("button", { name: "按当前建议继续一个受控步骤" }));
    fireEvent.click(await within(card).findByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions/live", expect.objectContaining({ method: "POST" }));
    });

    await waitFor(() => {
      const timelineText = document.querySelector(".timeline-panel")?.textContent ?? "";
      expect(timelineText).toContain(resultSummary);
    });
    expect(snapshotReleased).toBe(false);
    const liveTimelineText = document.querySelector(".timeline-panel")?.textContent ?? "";
    expect(liveTimelineText).toContain("本次执行：继续执行下一个任务");
    expect(liveTimelineText).toContain("下一步候选：检查当前结果");
    expect(liveTimelineText).not.toContain("planning.scheduler");
    expect(liveTimelineText).not.toContain("SchedulerRun");
    expect(liveTimelineText.toLowerCase()).not.toContain("worker");
    expect(liveTimelineText.toLowerCase()).not.toContain("slot");
    expect(liveTimelineText.toLowerCase()).not.toContain("start-all");
    expect(liveTimelineText.toLowerCase()).not.toContain("whole-wave");
    expect(document.querySelector(".parent-agent-transcript")?.textContent ?? "").not.toContain("按当前建议继续一个受控步骤");
    expect(within(card).queryAllByRole("button", { name: "按当前建议继续一个受控步骤" })).toHaveLength(0);
    expect(within(card.querySelector(".approval-actions") as HTMLElement).getAllByRole("button")).toHaveLength(2);

    await waitFor(() => expect(snapshotReleased).toBe(true));
    await waitFor(() => {
      const timelineText = document.querySelector(".timeline-panel")?.textContent ?? "";
      expect(timelineText).toContain(resultSummary);
    });
  });

  it("renders the latest controlled scheduler step receipt in the real App DOM", async () => {
    const receiptSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          controlledSchedulerStepReceipt: {
            label: "已完成一个受控步骤",
            status: "ready-for-confirmation",
            body: "本次执行：继续执行下一个任务。下一步候选：检查当前结果。当前步骤检查已刷新。 继续前仍需要你再次确认。",
            executedStepLabel: "继续执行下一个任务",
            nextStepLabel: "检查当前结果",
            readinessLabel: "当前步骤检查已刷新。",
            boundary: "已主动停止；是否继续仍需要你重新确认下一步。不会自动连续执行、批量启动任务、分配资源、应用源码、关闭需求或远端落地。",
            humanConfirmationStillRequired: true,
            evidenceRefs: ["harness/changes/active/member-discount/planning/controlled-advance/result.json"],
            decisionId: "workflow:controlled-advance:1",
            updatedAt: "2026-06-20T12:00:00.000Z",
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(receiptSnapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(receiptSnapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : receiptSnapshot);
    }));

    render(<App />);

    const card = await screen.findByTestId("controlled-scheduler-step-receipt");
    expect(within(card).getByText("已完成一个受控步骤")).toBeTruthy();
    expect(within(card).getByText("可以再次确认")).toBeTruthy();
    expect(within(card).getByText("本次执行：继续执行下一个任务。下一步候选：检查当前结果。当前步骤检查已刷新。 继续前仍需要你再次确认。")).toBeTruthy();
    expect(within(card).getByText("本次执行")).toBeTruthy();
    expect(within(card).getByText("继续执行下一个任务")).toBeTruthy();
    expect(within(card).getByText("下一步状态")).toBeTruthy();
    expect(within(card).getAllByText("检查当前结果").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText("继续边界")).toBeTruthy();
    expect(within(card).queryByRole("button")).toBeNull();
    const cardText = card.textContent ?? "";
    for (const forbidden of ["planning.scheduler", "SchedulerRun", "worker", "slot", "whole-wave", "start-all", "ToolPolicy"]) {
      expect(cardText).not.toContain(forbidden);
    }
  });

  it("renders the controlled scheduler step trace in the real App DOM without executable controls", async () => {
    const traceSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          controlledSchedulerStepTrace: {
            label: "受控推进轨迹",
            body: "最近 2 个受控步骤都已在完成后主动停止；继续仍要回到右侧确认区重新确认当前步骤。",
            boundary: "这是只读轨迹，不会自动继续、连续循环、批量启动任务、分配资源、应用源码、关闭需求、远端落地或维护演进。",
            updatedAt: "2026-06-20T12:10:00.000Z",
            evidenceRefs: [
              "harness/changes/active/member-discount/planning/controlled-advance/newest.json",
              "harness/changes/active/member-discount/planning/controlled-advance/older.json",
            ],
            items: [
              {
                label: "已完成一个受控步骤",
                status: "ready-for-confirmation",
                body: "本次执行：检查当前结果。下一步候选：检查当前结果。当前步骤检查已刷新。 继续前仍需要你再次确认。",
                executedStepLabel: "检查当前结果",
                nextStepLabel: "检查当前结果",
                readinessLabel: "当前步骤检查已刷新。",
                boundary: "已主动停止；是否继续仍需要你重新确认下一步。不会自动连续执行、批量启动任务、分配资源、应用源码、关闭需求或远端落地。",
                humanConfirmationStillRequired: true,
                evidenceRefs: ["harness/changes/active/member-discount/planning/controlled-advance/newest.json"],
                decisionId: "workflow:controlled-advance:newest",
                updatedAt: "2026-06-20T12:10:00.000Z",
              },
              {
                label: "已完成一个受控步骤",
                status: "ready-for-confirmation",
                body: "本次执行：继续执行下一个任务。下一步候选：检查当前结果。当前步骤检查已刷新。 继续前仍需要你再次确认。",
                executedStepLabel: "继续执行下一个任务",
                nextStepLabel: "检查当前结果",
                readinessLabel: "当前步骤检查已刷新。",
                boundary: "已主动停止；是否继续仍需要你重新确认下一步。不会自动连续执行、批量启动任务、分配资源、应用源码、关闭需求或远端落地。",
                humanConfirmationStillRequired: true,
                evidenceRefs: ["harness/changes/active/member-discount/planning/controlled-advance/older.json"],
                decisionId: "workflow:controlled-advance:older",
                updatedAt: "2026-06-20T12:00:00.000Z",
              },
            ],
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(traceSnapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(traceSnapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : traceSnapshot);
    }));

    render(<App />);

    const card = await screen.findByTestId("controlled-scheduler-step-trace");
    expect(within(card).getByText("受控推进轨迹")).toBeTruthy();
    expect(within(card).getByText("2 步")).toBeTruthy();
    expect(within(card).getByText("最近一步")).toBeTruthy();
    expect(within(card).getByText("第 2 步")).toBeTruthy();
    expect(within(card).getByText(/检查当前结果；下一步候选：检查当前结果；当前步骤检查已刷新。 继续仍需要再次确认。 时间：.*证据：newest\.json/)).toBeTruthy();
    expect(within(card).getByText(/继续执行下一个任务；下一步候选：检查当前结果；当前步骤检查已刷新。 继续仍需要再次确认。 时间：.*证据：older\.json/)).toBeTruthy();
    expect(within(card).getByText("继续边界")).toBeTruthy();
    expect(within(card).queryByRole("button")).toBeNull();
    const cardText = card.textContent ?? "";
    for (const forbidden of ["planning.scheduler", "SchedulerRun", "worker", "slot", "whole-wave", "start-all", "ToolPolicy"]) {
      expect(cardText).not.toContain(forbidden);
    }
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
      riskSummary: "确认后仍会立即停止；不会自动循环、批量启动任务、组合检查后的应用、关闭、远端落地或维护演进。",
      controlledSchedulerNextCandidate: {
        status: "ready-for-confirmation",
        label: "下一步候选已刷新",
        body: "下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。",
        actionLabel: "继续执行下一个任务",
        routingPosture: {
          label: "低冲突，仍需单步确认",
          body: "当前证据只支持继续一个已限定范围的任务步骤；可以评估低冲突并行，但本次仍只确认这一步。",
          boundary: "调度能力仍是单步受控：不会自动循环、整批派发、分配资源槽或启动完整并行执行器。",
          reasons: [
            "继续执行下一个任务是当前已限定范围的步骤；即使冲突较低，也只允许这一次人工确认。",
          ],
        },
        readinessEvidencePrepared: true,
        humanConfirmationStillRequired: true,
        evidenceRefs: [
          "harness/changes/active/member-discount/planning/goal-loop-next-step-packets/packet.md",
          "harness/changes/active/member-discount/planning/goal-loop-controller-policies/policy.md",
          "harness/changes/active/member-discount/planning/goal-loop-gate-readiness-preflights/preflight.md",
        ],
      },
      controlledSchedulerReconfirmation: {
        status: "aligned",
        label: "当前步骤可以重新确认",
        body: "上一步停在“继续执行下一个任务”之后；停止原因是“已完成一次确认的调度步骤并主动停止”。当前继续目标是“继续执行下一个任务”，仍需要你确认。 下一步判断和步骤检查已刷新。",
        lastStoppedStepLabel: "继续执行下一个任务",
        currentStepLabel: "继续执行下一个任务",
        freshnessLabel: "上一步停止记录、下一步候选和当前确认目标一致。",
        boundary: "这是只读重新确认状态；不会自动继续、批量启动任务、分配资源、应用源码、关闭需求、远端落地或维护演进。",
        stopPosture: {
          authority: "non-executing-controlled-scheduler-stop-posture",
          status: "aligned",
          label: "上一步停止状态已对齐",
          body: "上一步停在“继续执行下一个任务”之后；停止原因是“已完成一次确认的调度步骤并主动停止”。当前继续目标是“继续执行下一个任务”，仍需要你确认。",
          executedStepLabel: "继续执行下一个任务",
          stopReasonLabel: "已完成一次确认的调度步骤并主动停止",
          nextStepLabel: "继续执行下一个任务",
          readinessLabel: "当前步骤检查已准备好",
          boundary: "这是只读停止状态摘要；不会自动继续、批量启动任务、分配资源、应用源码、关闭需求、远端落地或维护演进。",
          evidenceRefs: [
            "harness/workbench/decisions/controlled-advance-1.json",
          ],
          humanConfirmationStillRequired: true,
          executionStarted: false,
          loopAuthorized: false,
          fullParallelExecutorAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          mergeAuthorized: false,
          remoteLandingAuthorized: false,
          harnessEvolutionAuthorized: false,
        },
        evidenceRefs: [
          "harness/workbench/decisions/controlled-advance-1.json",
        ],
      },
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
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          nextAction: {
            id: "next:planning.scheduler.worker.start-next:member-discount",
            label: "继续执行下一个任务",
            description: "继续一个受控步骤。",
            kind: "workflow-action",
            enabled: true,
            requiresConfirmation: true,
            actionType: "planning.scheduler.worker.start-next",
            changeId: "member-discount",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-expected",
            reservationIntentId: "reservation-intent-2",
            claimIntentId: "claim-2",
          },
          goalLoop: {
            id: "goal-loop-continuation-brief-1",
            goalLoopDecisionId: "goal-loop-decision-1",
            goalLoopIterationId: "goal-loop-iteration-1",
            goalLoopNextStepPacketId: "packet-1",
            changeId: "member-discount",
            status: "ready",
            summary: "当前证据建议继续一个受控任务步骤。",
            recommendedActionType: "planning.scheduler.worker.start-next",
            recommendedActionReason: "当前第一个任务启动步骤的范围有效。",
            recommendedActionScope: {
              changeId: "member-discount",
              schedulerRunId: "scheduler-run-1",
              schedulerClaimReservationId: "claim-reservation-expected",
              reservationIntentId: "reservation-intent-2",
              claimIntentId: "claim-2",
            },
            recommendationState: "awaiting-human-gate",
            continuationState: "ready-for-existing-gate",
            conflictLevel: "low",
            conflictReasons: [],
            routingLabel: "Single scoped worker gate",
            routingPosture: "single-gate-staged",
            parallelEligible: true,
            humanGateRequired: true,
            evidenceRefs: [],
            controlledSchedulerNextCandidate: reconfirmItem.controlledSchedulerNextCandidate,
          },
          controlledSchedulerStepReceipt: {
            label: "已完成一个受控步骤",
            status: "ready-for-confirmation",
            body: "本次执行：继续执行下一个任务。下一步候选：继续执行下一个任务。当前步骤检查已刷新。 继续前仍需要你再次确认。",
            executedStepLabel: "继续执行下一个任务",
            nextStepLabel: "继续执行下一个任务",
            readinessLabel: "当前步骤检查已刷新。",
            boundary: "已主动停止；是否继续仍需要你重新确认下一步。不会自动连续执行、批量启动任务、分配资源、应用源码、关闭需求或远端落地。",
            humanConfirmationStillRequired: true,
            evidenceRefs: ["harness/workbench/decisions/controlled-advance-1.json"],
            decisionId: "decision-controlled-advance-1",
            updatedAt: "2026-06-20T12:00:00.000Z",
          },
          controlledSchedulerReconfirmation: reconfirmItem.controlledSchedulerReconfirmation,
        },
      },
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

    await screen.findByTestId("transcript-virtual-list");
    fireEvent.click(await screen.findByRole("tab", { name: "工作台" }));
    await screen.findByTestId("workpad-view");
    const primarySurface = await screen.findByTestId("controlled-loop-primary-surface");
    expect(within(primarySurface).getByText("当前步骤可以重新确认")).toBeTruthy();
    expect(within(primarySurface).getByText("上一步停止记录、下一步候选和当前确认目标一致。")).toBeTruthy();
    expect(within(primarySurface).getByText("当前确认")).toBeTruthy();
    expect(within(primarySurface).queryByRole("button")).toBeNull();
    expect(document.querySelector(".parent-conversation .workpad-next-action")).toBeNull();

    const card = await openDecisionPane();
    expect(within(card).getByText("需要你再次确认当前页面显示的“继续执行下一个任务”；这不是自动继续。")).toBeTruthy();
    expect(within(card).getByText("当前下一步判断和步骤检查已刷新；这次仍是新的单步确认，步骤类别是：继续执行下一个任务。")).toBeTruthy();
    expect(within(card).getByText("服务端会重新读取当前状态，重新匹配目标和权限；匹配后只执行“继续执行下一个任务”这一当前合法步骤。")).toBeTruthy();
    expect(within(card).getByText("确认后仍会立即停止；不会自动循环、批量启动任务、组合检查后的应用、关闭、远端落地或维护演进。")).toBeTruthy();
    expect(within(card).getByText("下一步候选已刷新")).toBeTruthy();
    expect(within(card).getByText("下一步候选：继续执行下一个任务。当前步骤检查已刷新；继续仍需要你再次确认。")).toBeTruthy();
    expect(within(card).getByText(/当前步骤检查已准备好。/)).toBeTruthy();
    expect(within(card).getByText(/继续前仍需要你确认这个步骤。/)).toBeTruthy();
    expect(within(card).getByText("低冲突，仍需单步确认")).toBeTruthy();
    expect(within(card).getByText("当前证据只支持继续一个已限定范围的任务步骤；可以评估低冲突并行，但本次仍只确认这一步。")).toBeTruthy();
    expect(within(card).getByText("调度能力仍是单步受控：不会自动循环、整批派发、分配资源槽或启动完整并行执行器。")).toBeTruthy();
    expect(within(card).getByText("继续执行下一个任务是当前已限定范围的步骤；即使冲突较低，也只允许这一次人工确认。")).toBeTruthy();
    expect(within(card).getByText("当前步骤可以重新确认")).toBeTruthy();
    expect(within(card).getByText("上一步停在“继续执行下一个任务”之后；停止原因是“已完成一次确认的调度步骤并主动停止”。当前继续目标是“继续执行下一个任务”，仍需要你确认。 下一步判断和步骤检查已刷新。")).toBeTruthy();
    expect(within(card).getByText("上一步")).toBeTruthy();
    expect(within(card).getByText("当前确认")).toBeTruthy();
    expect(within(card).getByText("检查状态")).toBeTruthy();
    expect(within(card).getByText("停止原因")).toBeTruthy();
    expect(within(card).getAllByText("已完成一次确认的调度步骤并主动停止").length).toBeGreaterThan(0);
    expect(within(card).getByText("上一步停止记录、下一步候选和当前确认目标一致。")).toBeTruthy();
    expect(within(card).getByText("这是只读重新确认状态；不会自动继续、批量启动任务、分配资源、应用源码、关闭需求、远端落地或维护演进。")).toBeTruthy();
    expect(within(card).getByText("查看证据：packet.md")).toBeTruthy();
    expect(within(card).getByText("查看证据：policy.md")).toBeTruthy();
    expect(within(card).getByText("查看证据：preflight.md")).toBeTruthy();
    expect(within(card).getByText("查看证据：controlled-advance-1.json")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "按当前建议继续一个受控步骤" })).toBeTruthy();
    expect(within(card.querySelector(".approval-actions") as HTMLElement).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(await screen.findByText("查看详情与证据", {}, { timeout: 5000 }));
    const detailCard = await screen.findByTestId("controlled-scheduler-reconfirmation-card");
    expect(within(detailCard).getByText("当前步骤可以重新确认")).toBeTruthy();
    expect(within(detailCard).getByText("停止原因")).toBeTruthy();
    expect(within(detailCard).getByText("继续边界")).toBeTruthy();
    expect(within(detailCard).queryByRole("button")).toBeNull();
    const cardText = card.textContent ?? "";
    const normalizedCardText = cardText.toLowerCase();
    expect(cardText).not.toContain("上一个受控步骤");
    expect(cardText).not.toContain("自动应用");
    expect(cardText).not.toContain("自动关闭");
    expect(cardText).not.toContain("合并全部");
    expect(cardText).not.toContain("planning.scheduler");
    expect(cardText).not.toContain("SchedulerRun");
    expect(normalizedCardText).not.toContain("worker");
    expect(normalizedCardText).not.toContain("scheduler run");
    expect(normalizedCardText).not.toContain("slot");
    expect(normalizedCardText).not.toContain("start-all");
    expect(normalizedCardText).not.toContain("whole-wave");
  });

  it("renders scheduler controlled step runtime evidence in Workpad as read-only", async () => {
    const controlledStepSnapshot = {
      ...snapshot,
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          schedulerControlledStepEvidence: {
            id: "scheduler-controlled-step-1",
            changeId: "member-discount",
            schedulerRunId: "scheduler-run-1",
            status: "recorded",
            executedActionType: "planning.scheduler.worker.start-next",
            postStepStatus: "next-confirmation-candidate-ready",
            nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
            needsReevaluation: false,
            humanConfirmationStillRequired: true,
            sourceMutated: false,
            loopAuthorized: false,
            wholeWaveDispatchAuthorized: false,
            slotAllocatorAuthorized: false,
            applyAuthorized: false,
            closeAuthorized: false,
            mergeAuthorized: false,
            harnessEvolutionAuthorized: false,
            controlledStepResultSummary: {
              resultKind: "schedulerWorkerStart",
              schedulerWorkerStartId: "scheduler-worker-start-1",
              schedulerWorkerStartStatus: "started",
            },
            controlledLoopTurnRouteSummary: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-turn-route-summary",
              executedActionType: "planning.scheduler.worker.start-next",
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              routePosture: "awaiting-human-gate",
              postStepStatus: "next-confirmation-candidate-ready",
              nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
              humanGateRequired: true,
              humanConfirmationStillRequired: true,
              needsReevaluation: false,
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopTick: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
              observe: {
                status: "recorded",
                goalLoopDecisionId: "goal-loop-decision-pre",
                goalLoopIterationId: "goal-loop-iteration-pre",
                goalLoopContinuationBriefId: "goal-loop-brief-pre",
                goalLoopNextStepPacketId: "goal-loop-packet-pre",
                submittedActionType: "planning.scheduler.worker.start-next",
              },
              chooseCheck: {
                status: "recorded",
                goalLoopControllerPolicyId: "goal-loop-controller-pre",
                goalLoopGateReadinessPreflightId: "goal-loop-preflight-pre",
                targetScopeMatched: true,
                concreteGatePreflightNonExecuting: true,
              },
              dispatch: {
                status: "completed",
                executedActionType: "planning.scheduler.worker.start-next",
                executionStarted: true,
                stoppedAfterOneSchedulerTransition: true,
                approvedScopeOnly: true,
              },
              reconcile: {
                status: "recorded",
                goalLoopDecisionId: "goal-loop-decision-post",
                goalLoopIterationId: "goal-loop-iteration-post",
                goalLoopContinuationBriefId: "goal-loop-brief-post",
                goalLoopNextStepPacketId: "goal-loop-packet-post",
                goalLoopControllerPolicyId: "goal-loop-controller-post",
                goalLoopGateReadinessPreflightId: "goal-loop-preflight-post",
                executionStarted: false,
              },
              routeStop: {
                status: "next-confirmation-candidate-ready",
                stopReason: "one-confirmed-scheduler-transition-completed",
                routePosture: "awaiting-human-gate",
                nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
                humanGateRequired: true,
                humanConfirmationStillRequired: true,
                needsReevaluation: false,
              },
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopContinuationReadiness: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-continuation-readiness",
              status: "ready-for-human-gate",
              routePosture: "awaiting-human-gate",
              executedActionType: "planning.scheduler.worker.start-next",
              nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              reason: "The last controlled step stopped and the next candidate is ready for the existing human confirmation gate.",
              boundary: "Read-only continuation readiness; the next transition still requires the existing scoped human gate and ToolPolicy path.",
              readinessEvidencePrepared: true,
              needsReevaluation: false,
              humanGateRequired: true,
              humanConfirmationStillRequired: true,
              evidenceRefs: ["harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md"],
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopIteration: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-iteration-summary",
              status: "completed",
              executedActionType: "planning.scheduler.worker.start-next",
              observeStatus: "recorded",
              chooseCheckStatus: "recorded",
              dispatchStatus: "completed",
              reconcileStatus: "recorded",
              routePosture: "awaiting-human-gate",
              routeStopReason: "one-confirmed-scheduler-transition-completed",
              continuationReadinessStatus: "ready-for-human-gate",
              nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              readinessEvidencePrepared: true,
              needsReevaluation: false,
              humanGateRequired: true,
              humanConfirmationStillRequired: true,
              stoppedAfterOneSchedulerTransition: true,
              approvedScopeOnly: true,
              boundary: "Scheduler-runtime summary of one human-confirmed controlled Scheduler transition; any next transition still requires the existing scoped human gate and ToolPolicy path.",
              evidenceRefs: ["harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md"],
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopStopSummary: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-stop-summary",
              executedActionType: "planning.scheduler.worker.start-next",
              stopReason: "one-confirmed-scheduler-transition-completed",
              routePosture: "awaiting-human-gate",
              continuationReadinessStatus: "ready-for-human-gate",
              nextGateActionType: "planning.scheduler.worker.reconcile-result",
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              humanGateRequired: true,
              readinessEvidencePrepared: true,
              needsReevaluation: false,
              humanConfirmationStillRequired: true,
              userFacingReason: "The last controlled step stopped and the next candidate is ready for the existing human confirmation gate.",
              boundary: "Read-only summary of where one human-confirmed controlled Scheduler step stopped; continuing still requires the existing scoped human confirmation and ToolPolicy path.",
              evidenceRefs: ["harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md"],
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopBoundaryResult: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-boundary-result",
              status: "recorded",
              selectedActionType: "planning.scheduler.worker.start-next",
              submittedActionType: "planning.scheduler.controlled-advance.run",
              dispatchedActionType: "planning.scheduler.worker.start-next",
              selectedGateScope: {
                changeId: "member-discount",
                schedulerRunId: "scheduler-run-1",
                schedulerClaimReservationId: "reservation-1",
              },
              observeStatus: "recorded",
              chooseCheckStatus: "recorded",
              dispatchStatus: "completed",
              reconcileStatus: "recorded",
              boundaryPosture: "awaiting-human-gate",
              continuationReadinessStatus: "ready-for-human-gate",
              stopReason: "one-confirmed-scheduler-transition-completed",
              nextGateActionType: "planning.scheduler.worker.reconcile-result",
              nextGateTargetScopeSource: "fresh-current-gate-required",
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              readinessEvidencePrepared: true,
              needsReevaluation: false,
              humanGateRequired: true,
              humanConfirmationStillRequired: true,
              futureContinuationRequiresFreshEvidence: true,
              futureContinuationRequiresFreshCurrentGate: true,
              stoppedAfterOneSchedulerTransition: true,
              approvedScopeOnly: true,
              boundary: "Scheduler-runtime boundary result for one human-confirmed controlled Scheduler turn. It is prior-turn evidence only; future continuation must re-read fresh Goal Loop, current-gate, ToolPolicy, and human confirmation evidence before dispatch.",
              evidenceRefs: ["harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md"],
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopRuntimeBoundary: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
              status: "recorded",
              changeId: "member-discount",
              schedulerRunId: "scheduler-run-1",
              submittedActionType: "planning.scheduler.controlled-advance.run",
              selectedActionType: "planning.scheduler.worker.start-next",
              dispatchedActionType: "planning.scheduler.worker.start-next",
              observeStatus: "recorded",
              chooseStatus: "recorded",
              humanGateStatus: "confirmed-current-step",
              dispatchStatus: "completed",
              reconcileStatus: "recorded",
              stopStatus: "next-confirmation-candidate-ready",
              stopPosture: "awaiting-human-gate",
              stopReason: "one-confirmed-scheduler-transition-completed",
              continuationReadinessStatus: "ready-for-human-gate",
              nextGateActionType: "planning.scheduler.worker.reconcile-result",
              nextGateTargetScopeSource: "fresh-current-gate-required",
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              observedGoalLoopNextStepPacketId: "goal-loop-packet-pre",
              selectedGoalLoopGateReadinessPreflightId: "goal-loop-preflight-pre",
              reconciledGoalLoopNextStepPacketId: "goal-loop-packet-post",
              readinessEvidencePrepared: true,
              needsReevaluation: false,
              humanConfirmationStillRequired: true,
              stoppedAfterOneSchedulerTransition: true,
              approvedScopeOnly: true,
              priorTurnEvidence: true,
              freshEvidenceRequiredBeforeContinuation: true,
              freshCurrentGateRequiredBeforeContinuation: true,
              boundary: "Scheduler-runtime evidence summary for the currently implemented controlled Scheduler boundary.",
              evidenceRefs: ["harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md"],
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopPostStepRoutingDecision: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-post-step-routing-decision",
              routeFamily: "awaiting-human-gate",
              continuationReadinessStatus: "ready-for-human-gate",
              ownerModule: "scheduler-runtime",
              executedActionType: "planning.scheduler.worker.start-next",
              selectedActionType: "planning.scheduler.worker.start-next",
              dispatchedActionType: "planning.scheduler.worker.start-next",
              existingGateActionType: "planning.scheduler.worker.reconcile-result",
              gateTargetScopeSource: "fresh-current-gate-required",
              dispatchedTargetScope: {
                changeId: "member-discount",
                schedulerRunId: "scheduler-run-1",
                schedulerClaimReservationId: "claim-reservation-1",
              },
              resultKind: "schedulerWorkerStart",
              resultId: "scheduler-worker-start-1",
              resultStatus: "started",
              reason: "The next existing gate is ready for a fresh human confirmation: planning.scheduler.worker.reconcile-result. Existing gate is available after the controlled step stopped.",
              boundary: "Prior-turn scheduler-runtime routing input derived from the existing controlled-step evidence chain.",
              readinessEvidencePrepared: true,
              needsReevaluation: false,
              freshEvidenceRequiredBeforeContinuation: true,
              freshCurrentGateRequiredBeforeContinuation: true,
              humanGateRequired: true,
              humanConfirmationStillRequired: true,
              priorTurnEvidence: true,
              evidenceRefs: ["harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md"],
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            controlledLoopPreDispatchDecision: {
              version: "1.0",
              authority: "scheduler-runtime-controlled-loop-continuation-decision",
              status: "ready-for-human-gate",
              changeId: "member-discount",
              nextGateActionType: "planning.scheduler.worker.start-next",
              reason: "Fresh current human-gate evidence matches the prior controlled Scheduler boundary. Continuation still requires the existing human confirmation and ToolPolicy/stale revalidation path.",
              boundary: "Read-only scheduler-runtime continuation decision. It compares prior controlled Scheduler boundary evidence with fresh current gate evidence and never dispatches, authorizes, mutates source, applies, closes, merges, lands remotely, or evolves Harness state.",
              evidenceRefs: ["harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-previous.md"],
              executionStarted: false,
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              mergeAuthorized: false,
              remoteLandingAuthorized: false,
              harnessEvolutionAuthorized: false,
            },
            artifact: "harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.json",
            markdownArtifact: "harness/changes/active/member-discount/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md",
            updatedAt: "2026-06-21T00:00:00.000Z",
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(controlledStepSnapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(controlledStepSnapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : controlledStepSnapshot);
    }));

    render(<App />);

    await screen.findByTestId("transcript-virtual-list");
    fireEvent.click(await screen.findByRole("tab", { name: "工作台" }));
    await screen.findByTestId("workpad-view");
    fireEvent.click(await screen.findByText("查看详情与证据", {}, { timeout: 5000 }));
    const card = await screen.findByTestId("scheduler-controlled-step-evidence-card");
    expect(within(card).getByText("受控步骤运行证据")).toBeTruthy();
    expect(within(card).getByText("已执行一个用户确认的 Scheduler 步骤，并在完成后停止")).toBeTruthy();
    expect(within(card).getByText("只读 runtime evidence；不授权自动循环、批量启动任务、slot 分配、source apply、close、merge、远端落地或 Harness evolution。")).toBeTruthy();
    expect(within(card).getByText("执行：planning.scheduler.worker.start-next")).toBeTruthy();
    expect(within(card).getByText("后续状态：next-confirmation-candidate-ready")).toBeTruthy();
    expect(within(card).getByText("下一候选：planning.scheduler.worker.reconcile-result")).toBeTruthy();
    expect(within(card).getByText("继续仍需确认")).toBeTruthy();
    expect(within(card).getByText("已刷新")).toBeTruthy();
    expect(within(card).getByText("产物：schedulerWorkerStart")).toBeTruthy();
    expect(within(card).getByText("Worker Start ID：scheduler-worker-start-1")).toBeTruthy();
    expect(within(card).getByText("Worker Start 状态：started")).toBeTruthy();
    expect(within(card).getByText("受控路线")).toBeTruthy();
    expect(within(card).getByText("已停在下一次人工确认")).toBeTruthy();
    expect(within(card).getByText("执行结果")).toBeTruthy();
    expect(within(card).getByText("schedulerWorkerStart / scheduler-worker-start-1 / started")).toBeTruthy();
    expect(within(card).getAllByText("下一确认").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getAllByText("检查当前结果").length).toBeGreaterThanOrEqual(1);
    const preDispatchDecision = within(card).getByTestId("scheduler-controlled-loop-pre-dispatch-decision");
    expect(preDispatchDecision).toBeTruthy();
    expect(within(preDispatchDecision).getByText("执行前判断")).toBeTruthy();
    expect(within(preDispatchDecision).getByText("ready：prior-step 证据与当前确认目标匹配")).toBeTruthy();
    expect(within(preDispatchDecision).getByText("判断边界")).toBeTruthy();
    expect(within(preDispatchDecision).getByText("只证明执行前 guard 状态；ToolPolicy 与人工确认仍来自既有确认路径")).toBeTruthy();
    expect(within(preDispatchDecision).queryByRole("button")).toBeNull();
    const tickSummary = within(card).getByTestId("scheduler-controlled-loop-tick-summary");
    expect(tickSummary).toBeTruthy();
    expect(within(tickSummary).getByText("受控 tick")).toBeTruthy();
    expect(within(tickSummary).getByText("观察 recorded / 检查 recorded / 派发 completed / 复核 recorded")).toBeTruthy();
    expect(within(tickSummary).getByText("停止原因")).toBeTruthy();
    expect(within(tickSummary).getByText("已停在下一次人工确认：one-confirmed-scheduler-transition-completed")).toBeTruthy();
    expect(within(tickSummary).getByText("权限边界")).toBeTruthy();
    expect(within(tickSummary).getByText("不授权自动循环、批量启动任务或 source 变更")).toBeTruthy();
    const stopSummary = within(card).getByTestId("scheduler-controlled-loop-stop-summary");
    expect(stopSummary).toBeTruthy();
    expect(within(stopSummary).getByText("停止位置")).toBeTruthy();
    expect(within(stopSummary).getByText("已停在下一次人工确认 / 下一步已准备好，但必须再次人工确认")).toBeTruthy();
    expect(within(stopSummary).getByText("停止原因")).toBeTruthy();
    expect(within(stopSummary).getByText("The last controlled step stopped and the next candidate is ready for the existing human confirmation gate.")).toBeTruthy();
    expect(within(stopSummary).getByText("只能通过右侧确认区继续；不会自动循环、批量启动任务、应用源码、关闭需求或远端落地")).toBeTruthy();
    expect(within(stopSummary).queryByRole("button")).toBeNull();
    expect(within(card).getByTestId("scheduler-controlled-loop-continuation-readiness")).toBeTruthy();
    expect(within(card).getByText("继续状态")).toBeTruthy();
    expect(within(card).getByText("下一步已准备好，但必须再次人工确认")).toBeTruthy();
    expect(within(card).getByText("仍需右侧确认区单独确认；不会自动循环、批量启动任务、应用源码、关闭需求或远端落地")).toBeTruthy();
    const iterationSummary = within(card).getByTestId("scheduler-controlled-loop-iteration-summary");
    expect(iterationSummary).toBeTruthy();
    expect(within(iterationSummary).getByText("受控迭代")).toBeTruthy();
    expect(within(iterationSummary).getByText("已完成一次受控迭代 / 已停在下一次人工确认 / 下一步已准备好，但必须再次人工确认")).toBeTruthy();
    expect(within(iterationSummary).getByText("迭代阶段")).toBeTruthy();
    expect(within(iterationSummary).getByText("观察 recorded / 检查 recorded / 派发 completed / 复核 recorded")).toBeTruthy();
    expect(within(iterationSummary).getByText("只汇总本次人工确认步骤；下一步仍需既有确认门和 ToolPolicy 路径")).toBeTruthy();
    const boundaryResult = within(card).getByTestId("scheduler-controlled-loop-boundary-result");
    expect(boundaryResult).toBeTruthy();
    expect(within(boundaryResult).getByText("循环边界")).toBeTruthy();
    expect(within(boundaryResult).getByText("已停在下一次人工确认 / ready-for-human-gate / 需重新取证")).toBeTruthy();
    expect(within(boundaryResult).getByText("下一确认")).toBeTruthy();
    expect(within(boundaryResult).getByText("检查当前结果")).toBeTruthy();
    expect(within(boundaryResult).getByText("继续要求")).toBeTruthy();
    expect(within(boundaryResult).getByText("继续前必须重新读取 fresh Goal Loop、当前确认门、ToolPolicy 和人工确认状态")).toBeTruthy();
    expect(within(boundaryResult).queryByRole("button")).toBeNull();
    const runtimeBoundary = within(card).getByTestId("scheduler-controlled-loop-runtime-boundary");
    expect(runtimeBoundary).toBeTruthy();
    expect(within(runtimeBoundary).getByText("运行边界证据")).toBeTruthy();
    expect(within(runtimeBoundary).getByText("已停在下一次人工确认 / ready-for-human-gate / 上一轮证据 / 继续前需 fresh evidence")).toBeTruthy();
    expect(within(runtimeBoundary).getByText("下一确认")).toBeTruthy();
    expect(within(runtimeBoundary).getByText("检查当前结果")).toBeTruthy();
    expect(within(runtimeBoundary).getByText("证据性质")).toBeTruthy();
    expect(within(runtimeBoundary).getByText("这是上一轮受控步骤 evidence summary；继续前必须重新读取 fresh Goal Loop、当前确认门、ToolPolicy 和人工确认状态")).toBeTruthy();
    expect(within(runtimeBoundary).queryByRole("button")).toBeNull();
    const postStepRouting = within(card).getByTestId("scheduler-controlled-loop-post-step-routing-decision");
    expect(postStepRouting).toBeTruthy();
    expect(within(postStepRouting).getByText("后续路由")).toBeTruthy();
    expect(within(postStepRouting).getByText("已停在下一次人工确认 / Scheduler runtime / ready-for-human-gate / 继续前需 fresh evidence")).toBeTruthy();
    expect(within(postStepRouting).getByText("现有门控")).toBeTruthy();
    expect(within(postStepRouting).getByText("检查当前结果")).toBeTruthy();
    expect(within(postStepRouting).getByText("路由边界")).toBeTruthy();
    expect(within(postStepRouting).getByText("只读上一轮路由输入；不会改变右侧确认、ToolPolicy、重新取证、应用源码、关闭需求、远端落地或维护演进")).toBeTruthy();
    expect(within(postStepRouting).queryByRole("button")).toBeNull();
    expect(within(card).getByText("查看证据：scheduler-controlled-step-1.json")).toBeTruthy();
    expect(within(card).queryByRole("button")).toBeNull();
    const normalizedCardText = card.textContent?.toLowerCase() ?? "";
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

    await openDecisionPane();
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
              routingPosture: {
                label: "低冲突，仍需单步确认",
                body: "当前证据只支持继续一个已限定范围的任务步骤；可以评估低冲突并行，但本次仍只确认这一步。",
                boundary: "调度能力仍是单步受控：不会自动循环、整批派发、分配资源槽或启动完整并行执行器。",
                reasons: [
                  "继续执行下一个任务是当前已限定范围的步骤；即使冲突较低，也只允许这一次人工确认。",
                ],
              },
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
    expect(within(primarySurface).getByText("低冲突，仍需单步确认")).toBeTruthy();
    expect(within(primarySurface).getByText("当前证据只支持继续一个已限定范围的任务步骤；可以评估低冲突并行，但本次仍只确认这一步。")).toBeTruthy();
    expect(within(primarySurface).getByText("调度能力仍是单步受控：不会自动循环、整批派发、分配资源槽或启动完整并行执行器。")).toBeTruthy();
    expect(primarySurface.textContent).not.toContain("继续执行下一个任务是当前已限定范围的步骤；即使冲突较低，也只允许这一次人工确认。");
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
    expect(within(card).getAllByText("低冲突，仍需单步确认").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getAllByText("当前证据只支持继续一个已限定范围的任务步骤；可以评估低冲突并行，但本次仍只确认这一步。").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getAllByText("调度能力仍是单步受控：不会自动循环、整批派发、分配资源槽或启动完整并行执行器。").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText("继续执行下一个任务是当前已限定范围的步骤；即使冲突较低，也只允许这一次人工确认。")).toBeTruthy();
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

    await openDecisionPane();
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

    await openDecisionPane();
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

    await openDecisionPane();
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

    await openDecisionPane();
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

    await openDecisionPane();
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

    await openDecisionPane();
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

    await openDecisionPane();
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

    const blockedCard = await openDecisionPane();
    expect(screen.getByText("任务暂停：T-001")).toBeTruthy();
    expect(screen.getAllByText(/审查未通过，需要补证据。/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("要求修改").length).toBeGreaterThan(0);
    expect(within(blockedCard).getAllByText("查看证据")).toHaveLength(1);
    expect(screen.queryByText("确认")).toBeNull();
    expect(screen.getByText("查看历史决策")).toBeTruthy();
  });

  it("shows the close confirmation queue primary instead of a stale failed inspector card", async () => {
    const staleFailedPrimary = {
      id: "validation:validation-old-failed:failed",
      kind: "validation-failed",
      title: "验证未通过：validation-old-failed",
      summary: "旧验证失败已经被后续 rework 和 apply 收口。",
      userStatus: "needs-rework",
      resultSummary: "旧验证失败已经被后续 rework 和 apply 收口。",
      recommendation: "这条旧失败只能作为历史证据。",
      explanation: "旧失败证据不能压过当前 close gate。",
      severity: "blocking",
      changeId: "member-discount",
      targetId: "validation-old-failed",
      runId: "validation-old-failed",
      actions: [{
        id: "revalidate:wt-old",
        label: "重新验证",
        kind: "workflow-action",
        actionType: "result.revalidate",
        changeId: "member-discount",
        worktreeId: "wt-old",
        enabled: true,
        requiresConfirmation: true,
      }],
    };
    const closeQueuePrimary = {
      id: "confirm:approval:close:member-discount",
      kind: "planning-confirm",
      conversationId: "member-discount",
      changeId: "member-discount",
      resultId: "member-discount",
      summary: "这个需求可以结束并归档。",
      whyNeedsConfirmation: "确认完成需求",
      confirmEffect: "同意会完成并归档这个需求。",
      riskSummary: "归档是需求生命周期收口，之后仍可从历史查看。",
      evidenceRefs: [],
      actions: [{
        id: "accept:close:member-discount",
        label: "同意",
        kind: "approval",
        approvalId: "close:member-discount",
        action: { actionId: "change.close", label: "同意", command: "change", args: ["close", "repo", "member-discount"], mutates: true, requiresConfirmation: true },
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    };
    const closeSnapshot = {
      ...snapshot,
      right: {
        ...snapshot.right,
        decisionInspector: {
          ...snapshot.right.decisionInspector,
          primary: staleFailedPrimary,
          related: [snapshot.right.decisionInspector.primary],
          history: [],
        },
        confirmationQueue: {
          ...snapshot.right.confirmationQueue,
          primary: closeQueuePrimary,
          current: [closeQueuePrimary],
          otherDemands: [],
          maintenance: [],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions") && init?.method === "POST") return jsonResponse({ result: { ok: true }, snapshot: closeSnapshot });
      return jsonResponse(url.includes("/stream/") ? stream : closeSnapshot);
    }));

    render(<App />);

    const card = await openDecisionPane();
    expect(within(card).getByText("确认完成需求")).toBeTruthy();
    expect(within(card).getByText("这个需求可以结束并归档。")).toBeTruthy();
    expect(card.textContent).not.toContain("验证未通过：validation-old-failed");
    expect(screen.queryByRole("button", { name: /full-auto|全自动|parallel|merge queue|slot/i })).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "同意" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));
    await waitFor(() => {
      const actionCall = vi.mocked(fetch).mock.calls.find(([url, init]) =>
        String(url) === "/api/projects/repo/workbench/actions" && init?.method === "POST"
      );
      expect(actionCall).toBeTruthy();
      expect(JSON.parse(String(actionCall?.[1]?.body))).toMatchObject({
        action: { actionId: "change.close", args: ["close", "repo", "member-discount"] },
        confirm: true,
      });
    });
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

    await openDecisionPane();
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

    await openDecisionPane();
    await waitFor(() => expect(screen.getAllByText("修正 Goal Loop 建议").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "修正 Goal Loop 建议" }));
    fireEvent.change(screen.getByPlaceholderText("写下需要修改的地方"), { target: { value: "先解释为什么现在可以关闭。" } });
    fireEvent.click(screen.getByText("提交反馈"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/repo/workbench/actions/live", expect.objectContaining({ method: "POST" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "修正 Goal Loop 建议" }));
    fireEvent.change(screen.getByPlaceholderText("写下需要修改的地方"), { target: { value: "再补充执行前提。" } });
    fireEvent.click(screen.getByText("提交反馈"));
    await waitFor(() => expect(feedbackRequestCount).toBe(2));
  });

  it("runs a single TaskGraph task with taskIds in the Workbench action payload", async () => {
    window.history.replaceState({}, "", "/?project=repo&topic=member-discount");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
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
    fireEvent.click(screen.getByRole("tab", { name: "Agent 编排图" }));
    expect(await screen.findByTestId("agent-run-graph")).toBeTruthy();
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
    expect(screen.getByRole("tab", { name: "Agent 编排图" })).toBeTruthy();
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
    fireEvent.click(within(commandCell as HTMLElement).getByRole("button", { name: "已运行 1 条命令" }));
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
    expect(screen.getByRole("group", { name: "执行模式" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "逐步确认" })).toBeTruthy();
    expect(screen.queryByText("Codex · AHO")).toBeNull();
    expect(composer?.textContent).not.toContain("运行 Code");
    expect(screen.getByTitle("发送")).toBeTruthy();
  });

  it("opens a real Codex model picker from the composer and saves the selected model", async () => {
    const postBodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/codex/models" || url === "/api/projects/repo/codex/models") {
        if (init?.method === "POST") {
          postBodies.push(JSON.parse(String(init.body)));
          return jsonResponse({ ...codexModelSettings, selectedModel: "gpt-5.5", effectiveModel: "gpt-5.5", effectiveModelSource: "selected" });
        }
        return jsonResponse(codexModelSettings);
      }
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /选择模型，当前模型：gpt-5\.3-codex/ }));

    const picker = await screen.findByRole("dialog", { name: "选择 Codex 模型" });
    expect(within(picker).getByText("GPT 5.3 Codex")).toBeTruthy();
    expect(within(picker).queryByLabelText("自定义 Codex 模型 id")).toBeNull();
    expect(within(picker).queryByText("添加")).toBeNull();
    expect(within(picker).queryByText("Claude Code")).toBeNull();
    fireEvent.click(within(picker).getAllByRole("button", { name: "选择" }).at(-1) as HTMLElement);

    await waitFor(() => expect(postBodies).toContainEqual({ selectedModel: "gpt-5.5" }));
    expect(await screen.findByRole("button", { name: /选择模型，当前模型：gpt-5\.5/ })).toBeTruthy();
  });

  it("restores the last selected project after refresh from frontend UI state", async () => {
    window.localStorage.setItem("aho.workbench.selectedProjectId", "tools");
    const toolsSnapshot = {
      ...snapshot,
      project: { id: "tools", name: "Tools", path: "E:/tools" },
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const repoProject = { project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" }, codexTrust: { trusted: true } };
    const toolsProject = { project: toolsSnapshot.project, path: "E:/tools", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" }, codexTrust: { trusted: true } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "app", directProjectId: null });
      if (url === "/api/projects") return jsonResponse({ projects: [repoProject, toolsProject] });
      if (url === "/api/projects/tools/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/tools/codex/models") return jsonResponse(codexModelSettings);
      if (url === "/api/projects/tools/skills") return jsonResponse({ roots: [], skills: [] });
      if (url === "/api/projects/tools/workbench/snapshot") return jsonResponse(toolsSnapshot);
      return jsonResponse(snapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    expect(screen.getByRole("button", { name: "选择项目" }).textContent).toContain("Tools");
    expect(fetchCallUrls()).toContain("/api/projects/tools/workbench/snapshot");
  });

  it("selects the direct served project in a clean browser profile", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "Repo" })).toBeTruthy();
    expect(fetchCallUrls()).toContain("/api/projects/repo/workbench/snapshot");
  });

  it("opens a project topic and implemented tab from URL parameters", async () => {
    window.history.replaceState({}, "", "/?project=tools&topic=tools-topic&tab=orchestration");
    const toolsSnapshot = {
      ...snapshot,
      project: { id: "tools", name: "Tools", path: "E:/tools" },
      left: {
        ...snapshot.left,
        topics: [{ id: "tools-topic", title: "工具面板验收", state: "active" }],
        workpads: [{ id: "tools-topic", title: "工具面板验收", state: "active", runtimeStatus: "active", selected: true, waitingDecisionCount: 0 }],
      },
      center: {
        ...snapshot.center,
        selectedTopic: { id: "tools-topic", title: "工具面板验收", state: "active", acCount: 1, taskCount: 1 },
        agentRunGraph: { ...snapshot.center.agentRunGraph, title: "工具面板验收" },
      },
    };
    const repoProject = { project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" }, codexTrust: { trusted: true } };
    const toolsProject = { project: toolsSnapshot.project, path: "E:/tools", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" }, codexTrust: { trusted: true } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [repoProject, toolsProject] });
      if (url === "/api/projects/tools/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/tools/codex/models") return jsonResponse(codexModelSettings);
      if (url === "/api/projects/tools/skills") return jsonResponse({ roots: [], skills: [] });
      if (url === "/api/projects/tools/workbench/snapshot?topic=tools-topic") return jsonResponse(toolsSnapshot);
      if (url === "/api/projects/tools/workbench/projections/run-graph/tools-topic") return jsonResponse(toolsSnapshot.center.agentRunGraph);
      if (url === "/api/projects/tools/workbench/projections/transcript/tools-topic?limit=100") return jsonResponse(toolsSnapshot.center.parentAgentTranscript);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("工具面板验收").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Agent 编排图" }).getAttribute("aria-selected")).toBe("true");
    expect(fetchCallUrls()).toContain("/api/projects/tools/workbench/snapshot?topic=tools-topic");
    expect(fetchCallUrls()).not.toContain("/api/projects/repo/workbench/snapshot");
  });

  it("fails closed when the URL project id is not registered", async () => {
    window.history.replaceState({}, "", "/?project=missing&topic=member-discount");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    expect(fetchCallUrls()).not.toContain("/api/projects/repo/workbench/snapshot");
    expect(fetchCallUrls()).not.toContain("/api/projects/missing/workbench/snapshot?topic=member-discount");
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
    fireEvent.click(within(commandCell as HTMLElement).getByRole("button", { name: "已运行 1 条命令" }));
    expect(commandCell?.textContent).toMatch(/npm test/);
    expect(screen.queryByText("exit 0")).toBeNull();
    expect(screen.queryByText(/5 output tokens/)).toBeNull();
  });

  it("renders operational sidebar project menu and settings entry", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByLabelText("更多项目操作"));
    expect(screen.getByRole("menu", { name: "Repo 项目菜单" })).toBeTruthy();
    expect(screen.getByText("打开项目首页")).toBeTruthy();
    expect(screen.getByText("新建对话")).toBeTruthy();
    expect(screen.queryByText("刷新会话")).toBeNull();
    expect(screen.queryByText("准备项目")).toBeNull();
    expect(screen.queryByText("信任 Codex")).toBeNull();
    expect(screen.getByText("项目设置")).toBeTruthy();
    expect(screen.getByText("移出项目")).toBeTruthy();
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
    expect(screen.getByRole("tab", { name: "Agent 编排图" })).toBeTruthy();
    expect(screen.queryByText(/worker pool|并行 worktree|merge queue/)).toBeNull();
  });

  it("does not expose selected-demand confirmations while the demand is running", async () => {
    const runningSnapshot = {
      ...snapshot,
      left: {
        ...snapshot.left,
        workpads: [{ id: "member-discount", title: "会员折扣计价", state: "active", runtimeStatus: "running", selected: true, waitingDecisionCount: 0, latestRunStatus: "running", latestRunId: "run-planning-active" }],
      },
      center: {
        ...snapshot.center,
        workpad: {
          ...snapshot.center.workpad,
          conversationLifecycle: "running",
          runControlState: {
            canStop: true,
            stopActionType: "conversation.interrupt",
            pendingFeedbackCount: 0,
            explanation: "当前执行正在运行。",
          },
        },
      },
      right: {
        ...snapshot.right,
        confirmationQueue: { ...snapshot.right.confirmationQueue, primary: null, current: [] },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      return jsonResponse(url.includes("/stream/") ? stream : runningSnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("main-conversation-view")).toBeTruthy());
    expect(screen.queryByTestId("decision-inspector-primary")).toBeNull();
    expect(screen.getByTestId("decision-pane-toggle")).toBeTruthy();
    expect(screen.getByTitle("停止当前执行")).toBeTruthy();
  });

  it("disables inline confirmation immediately after submit so repeated clicks do not submit twice", async () => {
    let resolveAction: ((response: Response) => void) | null = null;
    const actionResponse = new Promise<Response>((resolve) => {
      resolveAction = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      if (url.endsWith("/workbench/actions")) return actionResponse;
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    const card = await openDecisionPane();
    fireEvent.click(within(card).getByRole("button", { name: "同意" }));
    const confirmButton = await within(card).findByRole("button", { name: "确认" }) as HTMLButtonElement;
    fireEvent.click(confirmButton);
    expect(confirmButton.disabled).toBe(true);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const actionPosts = vi.mocked(fetch).mock.calls.filter((call) => String(call[0]).endsWith("/workbench/actions"));
      expect(actionPosts).toHaveLength(1);
    });
    resolveAction?.(jsonResponse({ result: { ok: true }, snapshot }));
    await waitFor(() => {
      expect(within(card).queryByRole("button", { name: "确认" })).toBeNull();
    });
  });

  it("renders sidebar project onboarding when no direct project is selected", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") {
        return new Response(JSON.stringify({ mode: "app", directProjectId: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/codex/diagnostics" || url.endsWith("/codex/diagnostics")) {
        return jsonResponse(codexDiagnostics);
      }
      return new Response(JSON.stringify({ projects: [{
        project: snapshot.project,
        path: "E:/repo",
        pathExists: true,
        isGitRepo: true,
        managed: false,
        memory: { registered: true, memoryMode: "external-local", memoryAvailable: false, harnessReady: false, artifactBase: "memory-root" },
        harness: { readiness: "missing" },
      }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("创造任何东西")).toBeTruthy());
    expect(screen.queryByText("新对话")).toBeNull();
    fireEvent.click(screen.getByLabelText("项目菜单"));
    expect(screen.getAllByText("打开文件夹").length).toBeGreaterThan(0);
    expect(screen.getByText("新建项目")).toBeTruthy();
    expect(screen.queryByText("使用现有文件夹")).toBeNull();
    expect(screen.queryByText("新建空项目")).toBeNull();
    expect(screen.queryByText("远程项目")).toBeNull();
    expect(screen.getByTestId("decision-pane-toggle")).toBeTruthy();
    const sidebar = document.querySelector(".codex-sidebar") as HTMLElement;
    expect(sidebar.textContent).not.toMatch(/Harness|memory|AHO_HOME|external-local|TaskGraph|SchedulerRun/);
    await waitFor(() => expect(screen.getByText("需要准备")).toBeTruthy());
  });

  it("renders the project home without triggering project mutations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "app", directProjectId: null });
      if (url === "/api/codex/diagnostics" || url.endsWith("/codex/diagnostics")) return jsonResponse(codexDiagnostics);
      return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    expect(screen.getByRole("button", { name: "选择项目" })).toBeTruthy();
    expect(screen.queryByText("选择一个本地项目开始。")).toBeNull();
    expect(screen.queryByText("添加已有项目")).toBeNull();
    expect(screen.queryByLabelText("已注册项目")).toBeNull();
    expect(screen.queryByText(/项目数据：/)).toBeNull();
    const mutationCalls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(mutationCalls).toHaveLength(0);
  });

  it("renders the selected project home as a desktop-style creation surface with diagnostics in settings", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root", roots: { memoryRoot: "E:/aho-home/projects/repo" } }, harness: { readiness: "ready" }, codexTrust: { trusted: false, configPath: codexDiagnostics.configPath, projectKey: "E:/repo", configExists: true, reason: "Project trust is not configured." } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/providers/capabilities") return jsonResponse(providerCapabilityPayload);
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    expect(screen.getByRole("button", { name: "选择项目" })).toBeTruthy();
    expect(screen.getByLabelText("新建需求输入框")).toBeTruthy();
    expect(await screen.findByText("gpt-5.3-codex")).toBeTruthy();
    const modeToggle = screen.getByRole("group", { name: "执行模式" });
    const stepMode = within(modeToggle).getByRole("button", { name: "逐步确认" });
    const autoMode = within(modeToggle).getByRole("button", { name: "自动推进" });
    expect(stepMode.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(autoMode);
    expect(autoMode.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("最近会话")).toBeNull();
    expect(screen.queryByText("Codex 诊断")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(await screen.findByRole("region", { name: "设置" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "基础" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Codex" }));
    expect(await screen.findByText("能力矩阵")).toBeTruthy();
    expect(screen.getByText("Product mode")).toBeTruthy();
    expect(screen.getByText("Harness")).toBeTruthy();
    expect(screen.getByText("模型列表")).toBeTruthy();
    expect(screen.getByText("runtime unavailable")).toBeTruthy();
    expect(screen.queryByText("Claude Code")).toBeNull();
    expect(screen.queryByText("OpenCode")).toBeNull();
    expect(screen.queryByText("Gemini")).toBeNull();
    expect(screen.queryByText("普通 Agent")).toBeNull();
    expect(screen.getByRole("button", { name: "高级诊断" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "高级诊断" }));
    expect(screen.getByText("codex-cli 1.2.3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "设置" })).toBeNull());
    const mutationCalls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(mutationCalls).toHaveLength(0);
  });

  it("shows a real skills settings panel and composer indicator backed by project APIs", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const skillPayload = {
      roots: [{ rootPath: "E:/skills", sourceKind: "custom", updatedAt: "2026-06-27T00:00:00.000Z" }],
      skills: [
        {
          skillId: "pricing-helper",
          name: "pricing-helper",
          description: "Pricing helper.",
          sourcePath: "E:/skills/pricing-helper",
          sourceKind: "custom",
          sourceHash: "hash-a",
          enabledProject: true,
          enabledTopics: [],
          disabledTopics: [],
          runtimeTargets: [{ provider: "codex", status: "not-synced", materializationMode: "aho-managed" }],
        },
        {
          skillId: "native-helper",
          name: "native-helper",
          description: "Native Codex helper.",
          sourcePath: "C:/Users/qinghui/.codex/skills/native-helper",
          sourceKind: "global-codex",
          sourceHash: "hash-native",
          enabledProject: false,
          enabledTopics: [],
          disabledTopics: [],
          runtimeTargets: [{ provider: "codex", status: "native", materializationMode: "native" }],
        },
        {
          skillId: "aho-harness-onboarding",
          name: "aho-harness-onboarding",
          description: "AHO onboarding helper.",
          sourcePath: "E:/app/templates/system-skills/aho-harness-onboarding",
          sourceKind: "system-aho",
          sourceHash: "hash-system",
          enabledProject: false,
          enabledTopics: [],
          disabledTopics: [],
          runtimeTargets: [{ provider: "codex", status: "not-synced", materializationMode: "aho-managed" }],
        },
      ],
      bridge: { state: "out-of-sync" },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root", roots: { memoryRoot: "E:/aho-home/projects/repo" } }, harness: { readiness: "ready" }, codexTrust: { trusted: true } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/skills") return jsonResponse(skillPayload);
      if (url === "/api/projects/repo/skill-roots" && init?.method === "POST") return jsonResponse(skillPayload);
      if (url === "/api/projects/repo/skills/pricing-helper/enable" && init?.method === "POST") return jsonResponse(skillPayload);
      if (url === "/api/projects/repo/skills/codex-bridge/sync" && init?.method === "POST") return jsonResponse({ synced: [], syncedAgents: [], status: { state: "installed" } });
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    expect(await screen.findByRole("button", { name: "当前使用 1 个技能" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "当前使用 1 个技能" }));
    const panel = await screen.findByRole("region", { name: "设置" });
    expect(within(panel).getAllByRole("heading", { name: "技能" }).length).toBeGreaterThan(0);
    expect(within(panel).getByText("3 个可用 Skill")).toBeTruthy();
    expect(within(panel).getAllByText("pricing-helper").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("native-helper").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("aho-harness-onboarding").length).toBeGreaterThan(0);
    expect(within(panel).getByText("自定义: E:/skills")).toBeTruthy();
    expect(within(panel).queryByText("Skill ID")).toBeNull();
    expect(within(panel).queryByText("Hash")).toBeNull();

    fireEvent.change(within(panel).getByLabelText("Skill 根目录"), { target: { value: "E:/more-skills" } });
    fireEvent.click(within(panel).getByRole("button", { name: "添加" }));
    await waitFor(() => expect(fetchCallUrls()).toContain("/api/projects/repo/skill-roots"));

    fireEvent.click(within(panel).getByRole("button", { name: "同步到 Codex" }));
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map(([url, init]) => [String(url), init?.method ?? "GET"]);
      expect(calls).toContainEqual(["/api/projects/repo/skills/codex-bridge/sync", "POST"]);
    });
    expect(within(panel).queryByRole("button", { name: "禁用" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "启用" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: /native-helper/ }));
    expect(within(panel).getAllByText("Codex 可用").length).toBeGreaterThan(0);
    expect(within(panel).queryByRole("button", { name: "同步到 Codex" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: /aho-harness-onboarding/ }));
    expect(within(panel).getAllByText("AHO 内置").length).toBeGreaterThan(0);
    expect(within(panel).getByRole("button", { name: "同步到 Codex" })).toBeTruthy();

    const calls = vi.mocked(fetch).mock.calls.map(([url, init]) => [String(url), init?.method ?? "GET"]);
    expect(calls).not.toContainEqual(["/api/projects/repo/skills/pricing-helper/enable", "POST"]);
    expect(calls).toContainEqual(["/api/projects/repo/skills/codex-bridge/sync", "POST"]);
    expect(panel.textContent).not.toContain("marketplace");
    expect(panel.textContent).not.toContain("$skill");
  });

  it("uses a slash Skill mention from the home composer and migrates it to the new topic", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const selectedSnapshot = {
      ...snapshot,
      left: {
        ...snapshot.left,
        topics: [{ id: "new-demand", title: "实现设置入口", state: "active" }],
        workpads: [{ id: "new-demand", title: "实现设置入口", state: "active", runtimeStatus: "active", selected: true, waitingDecisionCount: 0 }],
      },
      center: {
        ...snapshot.center,
        selectedTopic: { id: "new-demand", title: "实现设置入口", state: "active", acCount: 0, taskCount: 0 },
      },
    };
    const skillPayload = {
      roots: [],
      skills: [{
        skillId: "pricing-helper",
        name: "pricing-helper",
        description: "Pricing helper.",
        sourcePath: "E:/skills/pricing-helper",
        sourceKind: "custom",
        sourceHash: "hash-a",
        enabledProject: false,
        enabledTopics: [],
        disabledTopics: [],
        runtimeTargets: [{ provider: "codex", status: "not-synced" }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root" }, harness: { readiness: "ready" }, codexTrust: { trusted: true } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/skills") return jsonResponse(skillPayload);
      if (url === "/api/projects/repo/skills/pricing-helper/enable" && init?.method === "POST") return jsonResponse(skillPayload);
      if (url === "/api/projects/repo/workbench/topics" && init?.method === "POST") return jsonResponse({ topic: { changeId: "new-demand" } });
      if (url === "/api/projects/repo/workbench/snapshot?topic=new-demand") return jsonResponse(selectedSnapshot);
      if (url === "/api/projects/repo/workbench/projections/transcript/new-demand?limit=100") return jsonResponse(selectedSnapshot.center.parentAgentTranscript);
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    const input = screen.getByLabelText("新建需求输入框");
    fireEvent.change(input, { target: { value: "/" } });
    const menu = await screen.findByTestId("skill-mention-menu");
    expect(within(menu).getByText("pricing-helper")).toBeTruthy();
    expect(within(menu).getByText("需要同步")).toBeTruthy();
    fireEvent.change(input, { target: { value: "/pricing-helper 实现设置入口" } });
    fireEvent.click(screen.getByTitle("创建需求对话"));

    await waitFor(() => expect(screen.getAllByText("实现设置入口").length).toBeGreaterThan(0));
    const topicPost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/workbench/topics" && init?.method === "POST");
    expect(JSON.parse(String(topicPost?.[1]?.body))).toMatchObject({
      title: "实现设置入口",
      body: "实现设置入口",
      confirm: true,
    });
    const enablePost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/skills/pricing-helper/enable" && init?.method === "POST");
    expect(JSON.parse(String(enablePost?.[1]?.body))).toMatchObject({ enabled: true, topic: "new-demand" });
  });

  it("recognizes dollar Skill mentions in an existing topic without leaving the token in the sent message", async () => {
    const skillPayload = {
      roots: [],
      skills: [{
        skillId: "pricing-helper",
        name: "pricing-helper",
        description: "Pricing helper.",
        sourcePath: "E:/skills/pricing-helper",
        sourceKind: "custom",
        sourceHash: "hash-a",
        enabledProject: false,
        enabledTopics: [],
        disabledTopics: [],
        runtimeTargets: [{ provider: "codex", status: "synced" }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/skills") return jsonResponse(skillPayload);
      if (url === "/api/projects/repo/skills/pricing-helper/enable" && init?.method === "POST") return jsonResponse(skillPayload);
      if (url.includes("/messages/live")) {
        return sseResponse([
          ["topic.message", { id: "live-user", type: "user.message", changeId: "member-discount", text: "请继续" }],
        ]);
      }
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    const input = within(screen.getByLabelText("需求对话输入框")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "$pricing-helper 请继续" } });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => expect(fetchCallUrls()).toContain("/api/projects/repo/workbench/topics/member-discount/messages/live"));
    const enablePost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/skills/pricing-helper/enable" && init?.method === "POST");
    expect(JSON.parse(String(enablePost?.[1]?.body))).toMatchObject({ enabled: true, topic: "member-discount" });
    const livePost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/workbench/topics/member-discount/messages/live" && init?.method === "POST");
    expect(JSON.parse(String(livePost?.[1]?.body))).toMatchObject({ message: "请继续" });
  });

  it("uses an @file reference from the home composer and binds it to the first topic message", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const selectedSnapshot = {
      ...snapshot,
      left: {
        ...snapshot.left,
        topics: [{ id: "new-demand", title: "请改", state: "active" }],
        workpads: [{ id: "new-demand", title: "请改", state: "active", runtimeStatus: "active", selected: true, waitingDecisionCount: 0 }],
      },
      center: {
        ...snapshot.center,
        selectedTopic: { id: "new-demand", title: "请改", state: "active", acCount: 0, taskCount: 0 },
      },
    };
    const fileRef = { relativePath: "src/pricing.ts", name: "pricing.ts", kind: "file", extension: ".ts", size: 24 };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root" }, harness: { readiness: "ready" }, codexTrust: { trusted: true } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/skills") return jsonResponse({ roots: [], skills: [] });
      if (url.startsWith("/api/projects/repo/files/search")) return jsonResponse({ files: [fileRef] });
      if (url === "/api/projects/repo/workbench/topics" && init?.method === "POST") return jsonResponse({ topic: { changeId: "new-demand" } });
      if (url === "/api/projects/repo/workbench/snapshot?topic=new-demand") return jsonResponse(selectedSnapshot);
      if (url === "/api/projects/repo/workbench/projections/transcript/new-demand?limit=100") return jsonResponse(selectedSnapshot.center.parentAgentTranscript);
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    const input = screen.getByLabelText("新建需求输入框");
    fireEvent.change(input, { target: { value: "请改 @src" } });
    const menu = await screen.findByTestId("file-mention-menu");
    fireEvent.click(await within(menu).findByText("src/pricing.ts"));
    expect(screen.getByText("pricing.ts")).toBeTruthy();
    fireEvent.click(screen.getByTitle("创建需求对话"));

    await waitFor(() => expect(screen.getAllByText("请改").length).toBeGreaterThan(0));
    const topicPost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/workbench/topics" && init?.method === "POST");
    expect(JSON.parse(String(topicPost?.[1]?.body))).toMatchObject({
      title: "请改",
      body: "请改",
      contextRefs: [fileRef],
      confirm: true,
    });
  });

  it("binds @file references only to the current message in an existing topic", async () => {
    const fileRef = { relativePath: "src/pricing.ts", name: "pricing.ts", kind: "file", extension: ".ts", size: 24 };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, harness: { readiness: "ready" } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/skills") return jsonResponse({ roots: [], skills: [] });
      if (url.startsWith("/api/projects/repo/files/search")) return jsonResponse({ files: [fileRef] });
      if (url.includes("/messages/live")) {
        return sseResponse([
          ["topic.message", { id: "live-user", type: "user.message", changeId: "member-discount", text: "检查" }],
        ]);
      }
      if (url.includes("/workbench/projections/transcript/")) return jsonResponse(snapshot.center.parentAgentTranscript);
      if (url.includes("/workbench/projections/run-graph/")) return jsonResponse(snapshot.center.agentRunGraph);
      return jsonResponse(url.includes("/stream/") ? stream : snapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    const input = within(screen.getByLabelText("需求对话输入框")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "检查 @src" } });
    const menu = await screen.findByTestId("file-mention-menu");
    fireEvent.click(await within(menu).findByText("src/pricing.ts"));
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => expect(fetchCallUrls()).toContain("/api/projects/repo/workbench/topics/member-discount/messages/live"));
    const livePost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/workbench/topics/member-discount/messages/live" && init?.method === "POST");
    expect(JSON.parse(String(livePost?.[1]?.body))).toMatchObject({
      message: "检查",
      contextRefs: [fileRef],
    });
    const repeatedPost = vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url) === "/api/projects/repo/workbench/topics/member-discount/messages/live" && init?.method === "POST");
    expect(repeatedPost).toHaveLength(1);
  });

  it("opens the project home workspace picker, filters projects, and switches through the existing project route", async () => {
    const repoSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const toolsSnapshot = {
      ...snapshot,
      project: { id: "tools", name: "Tools", path: "E:/tools" },
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const repoProject = {
      project: snapshot.project,
      path: "E:/repo",
      pathExists: true,
      isGitRepo: true,
      managed: true,
      memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root", roots: { memoryRoot: "E:/aho-home/projects/repo" } },
      harness: { readiness: "ready" },
      codexTrust: { trusted: true },
    };
    const toolsProject = {
      project: { id: "tools", name: "Tools", path: "E:/tools" },
      path: "E:/tools",
      pathExists: true,
      isGitRepo: true,
      managed: true,
      memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root", roots: { memoryRoot: "E:/aho-home/projects/tools" } },
      harness: { readiness: "ready" },
      codexTrust: { trusted: true },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") return jsonResponse({ projects: [repoProject, toolsProject] });
      if (url === "/api/projects/repo/codex/diagnostics" || url === "/api/projects/tools/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/tools/workbench/snapshot") return jsonResponse(toolsSnapshot);
      return jsonResponse(repoSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    fireEvent.click(screen.getByRole("button", { name: "选择项目" }));
    const picker = await screen.findByRole("dialog", { name: "项目选择器" });
    expect(within(picker).getByText("Repo")).toBeTruthy();
    expect(within(picker).getByText("Tools")).toBeTruthy();

    fireEvent.change(within(picker).getByLabelText("搜索项目"), { target: { value: "tool" } });
    expect(within(picker).queryByText("Repo")).toBeNull();
    fireEvent.click(within(picker).getByText("Tools"));

    await waitFor(() => {
      expect(fetchCallUrls()).toContain("/api/projects/tools/workbench/snapshot");
    });
    expect(screen.getByRole("button", { name: "选择项目" }).textContent).toContain("Tools");
    expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
    const mutationCalls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(mutationCalls).toHaveLength(0);
  });

  it("exposes real add and create project forms from the workspace picker", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{
          project: snapshot.project,
          path: "E:/repo",
          pathExists: true,
          isGitRepo: true,
          managed: true,
          memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root", roots: { memoryRoot: "E:/aho-home/projects/repo" } },
          harness: { readiness: "ready" },
          codexTrust: { trusted: true },
        }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    fireEvent.click(screen.getByRole("button", { name: "选择项目" }));
    const picker = await screen.findByRole("dialog", { name: "项目选择器" });

    fireEvent.click(within(picker).getByRole("button", { name: "打开文件夹" }));
    expect(within(picker).getAllByText("打开文件夹").length).toBeGreaterThan(0);
    expect(within(picker).getByText("输入路径")).toBeTruthy();

    fireEvent.click(within(picker).getByRole("button", { name: "新建项目" }));
    expect(within(picker).getByText("选择位置")).toBeTruthy();
    expect(within(picker).getByText("初始化 Git")).toBeTruthy();
  });

  it("creates a demand from the desktop-style project home composer", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const selectedSnapshot = {
      ...snapshot,
      left: {
        ...snapshot.left,
        topics: [{ id: "new-demand", title: "实现设置入口", state: "active" }],
        workpads: [{ id: "new-demand", title: "实现设置入口", state: "active", runtimeStatus: "active", selected: true, waitingDecisionCount: 0 }],
      },
      center: {
        ...snapshot.center,
        selectedTopic: { id: "new-demand", title: "实现设置入口", state: "active", acCount: 0, taskCount: 0 },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: true, memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true, artifactBase: "memory-root" }, harness: { readiness: "ready" }, codexTrust: { trusted: true } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/workbench/topics" && init?.method === "POST") {
        return jsonResponse({ topic: { changeId: "new-demand" } });
      }
      if (url === "/api/projects/repo/workbench/snapshot?topic=new-demand") return jsonResponse(selectedSnapshot);
      if (url === "/api/projects/repo/workbench/projections/transcript/new-demand?limit=100") return jsonResponse(selectedSnapshot.center.parentAgentTranscript);
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    fireEvent.change(screen.getByLabelText("新建需求输入框"), { target: { value: "实现设置入口" } });
    fireEvent.click(screen.getByTitle("创建需求对话"));

    await waitFor(() => expect(screen.getByText("实现设置入口")).toBeTruthy());
    const topicPost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/workbench/topics" && init?.method === "POST");
    expect(topicPost).toBeTruthy();
    expect(JSON.parse(String(topicPost?.[1]?.body))).toMatchObject({
      title: "实现设置入口",
      body: "实现设置入口",
      confirm: true,
    });
  });

  it("prepares a registered project only when the first demand is sent", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      memory: { memoryMode: "external-local", harnessReady: false },
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const selectedSnapshot = {
      ...snapshot,
      left: {
        ...snapshot.left,
        topics: [{ id: "prepared-demand", title: "准备后创建需求", state: "active" }],
        workpads: [{ id: "prepared-demand", title: "准备后创建需求", state: "active", runtimeStatus: "active", selected: true, waitingDecisionCount: 0 }],
      },
      center: {
        ...snapshot.center,
        selectedTopic: { id: "prepared-demand", title: "准备后创建需求", state: "active", acCount: 0, taskCount: 0 },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: false, memory: { registered: true, memoryMode: "external-local", memoryAvailable: false, harnessReady: false, artifactBase: "memory-root" }, harness: { readiness: "missing" }, codexTrust: { trusted: true } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/harness/init" && init?.method === "POST") return jsonResponse({ result: { ok: true }, status: { project: snapshot.project } });
      if (url === "/api/projects/repo/workbench/topics" && init?.method === "POST") return jsonResponse({ topic: { changeId: "prepared-demand" } });
      if (url === "/api/projects/repo/workbench/snapshot?topic=prepared-demand") return jsonResponse(selectedSnapshot);
      if (url === "/api/projects/repo/workbench/projections/transcript/prepared-demand?limit=100") return jsonResponse(selectedSnapshot.center.parentAgentTranscript);
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    const postCallsBeforeDemand = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCallsBeforeDemand).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("新建需求输入框"), { target: { value: "准备后创建需求" } });
    fireEvent.click(screen.getByTitle("创建需求对话"));

    await waitFor(() => expect(screen.getByText("准备后创建需求")).toBeTruthy());
    const postUrls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url));
    expect(postUrls).toEqual([
      "/api/projects/repo/harness/init",
      "/api/projects/repo/workbench/topics",
    ]);
  });

  it("stages home attachments until first demand prepares the project", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      memory: { memoryMode: "external-local", harnessReady: false },
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    const selectedSnapshot = {
      ...snapshot,
      left: {
        ...snapshot.left,
        topics: [{ id: "attached-demand", title: "根据附件分析", state: "active" }],
        workpads: [{ id: "attached-demand", title: "根据附件分析", state: "active", runtimeStatus: "active", selected: true, waitingDecisionCount: 0 }],
      },
      center: {
        ...snapshot.center,
        selectedTopic: { id: "attached-demand", title: "根据附件分析", state: "active", acCount: 0, taskCount: 0 },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: false, memory: { registered: true, memoryMode: "external-local", memoryAvailable: false, harnessReady: false, artifactBase: "memory-root" }, harness: { readiness: "missing" }, codexTrust: { trusted: true } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/harness/init" && init?.method === "POST") return jsonResponse({ result: { ok: true }, status: { project: snapshot.project } });
      if (url === "/api/projects/repo/attachments" && init?.method === "POST") {
        return jsonResponse({ attachment: { id: "att-20260628120000-abcdef123456", fileName: "context.md", mediaType: "text/markdown", kind: "text", size: 12, hash: "abcdef1234567890", source: "composer", createdAt: "2026-06-28T12:00:00.000Z", storagePath: "attachments/att-20260628120000-abcdef123456/content.md", runtimeMode: "bounded-text-preview" } });
      }
      if (url === "/api/projects/repo/workbench/topics" && init?.method === "POST") return jsonResponse({ topic: { changeId: "attached-demand" } });
      if (url === "/api/projects/repo/workbench/snapshot?topic=attached-demand") return jsonResponse(selectedSnapshot);
      if (url === "/api/projects/repo/workbench/projections/transcript/attached-demand?limit=100") return jsonResponse(selectedSnapshot.center.parentAgentTranscript);
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput!, { target: { files: [new File(["hello"], "context.md", { type: "text/markdown" })] } });

    await screen.findByText("context.md");
    const postCallsBeforeDemand = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCallsBeforeDemand).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("新建需求输入框"), { target: { value: "根据附件分析" } });
    fireEvent.click(screen.getByTitle("创建需求对话"));

    await waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url));
      expect(urls).toEqual([
        "/api/projects/repo/harness/init",
        "/api/projects/repo/attachments",
        "/api/projects/repo/workbench/topics",
      ]);
    });
    const postUrls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url));
    expect(postUrls).toEqual([
      "/api/projects/repo/harness/init",
      "/api/projects/repo/attachments",
      "/api/projects/repo/workbench/topics",
    ]);
    const topicPost = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/projects/repo/workbench/topics" && init?.method === "POST");
    expect(JSON.parse(String(topicPost?.[1]?.body))).toMatchObject({
      title: "根据附件分析",
      body: "根据附件分析",
      attachmentIds: ["att-20260628120000-abcdef123456"],
    });
  });

  it("cleans up uploaded staged attachments when first demand creation fails", async () => {
    const noTopicSnapshot = {
      ...snapshot,
      memory: { memoryMode: "external-local", harnessReady: false },
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ project: snapshot.project, path: "E:/repo", pathExists: true, isGitRepo: true, managed: false, memory: { registered: true, memoryMode: "external-local", memoryAvailable: false, harnessReady: false, artifactBase: "memory-root" }, harness: { readiness: "missing" }, codexTrust: { trusted: true } }] });
      }
      if (url === "/api/projects/repo/codex/diagnostics") return jsonResponse(codexDiagnostics);
      if (url === "/api/projects/repo/harness/init" && init?.method === "POST") return jsonResponse({ result: { ok: true }, status: { project: snapshot.project } });
      if (url === "/api/projects/repo/attachments" && init?.method === "POST") {
        return jsonResponse({ attachment: { id: "att-20260628120000-abcdef123456", fileName: "context.md", mediaType: "text/markdown", kind: "text", size: 12, hash: "abcdef1234567890", source: "composer", createdAt: "2026-06-28T12:00:00.000Z", storagePath: "attachments/att-20260628120000-abcdef123456/content.md", runtimeMode: "bounded-text-preview" } });
      }
      if (url === "/api/projects/repo/workbench/topics" && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "topic failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/projects/repo/attachments/att-20260628120000-abcdef123456" && init?.method === "DELETE") return jsonResponse({ deleted: true });
      return jsonResponse(noTopicSnapshot);
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "创造任何东西" });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInput!, { target: { files: [new File(["hello"], "context.md", { type: "text/markdown" })] } });
    await screen.findByText("context.md");

    fireEvent.change(screen.getByLabelText("新建需求输入框"), { target: { value: "根据附件分析" } });
    fireEvent.click(screen.getByTitle("创建需求对话"));

    await waitFor(() => expect(fetchCallUrls()).toContain("/api/projects/repo/attachments/att-20260628120000-abcdef123456"));
    expect(screen.getByText("context.md")).toBeTruthy();
  });

  it("does not expose demand creation when a marker exists but durable memory is unavailable", async () => {
    const unavailableSnapshot = {
      ...snapshot,
      memory: { memoryMode: "external-local", harnessReady: false },
      left: { ...snapshot.left, topics: [], workpads: [] },
      center: { ...snapshot.center, selectedTopic: null },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") {
        return new Response(JSON.stringify({ mode: "project", directProjectId: "repo" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/projects") {
        return new Response(JSON.stringify({ projects: [{
          project: snapshot.project,
          path: "E:/repo",
          pathExists: true,
          isGitRepo: true,
          managed: true,
          memory: {
            memoryMode: "external-local",
            memoryAvailable: false,
            harnessReady: false,
            artifactBase: "memory-root",
            roots: { memoryRoot: "E:/aho-home/projects/repo" },
          },
          harness: { readiness: "partial" },
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify(unavailableSnapshot), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText(/项目历史不可用/).length).toBeGreaterThan(0));
    expect(screen.queryByText("初始化 Harness")).toBeNull();
    expect(screen.queryByText("准备项目")).toBeNull();
    expect(screen.queryByText("创建需求对话")).toBeNull();
    expect(screen.queryByLabelText("在 Repo 中开始新对话")).toBeNull();
  });

  it("opens an existing history conversation read-only even when the project is not prepared", async () => {
    const historySnapshot = {
      ...snapshot,
      memory: { memoryMode: "external-local", harnessReady: false },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/app/status") return jsonResponse({ mode: "project", directProjectId: "repo" });
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{
          project: snapshot.project,
          path: "E:/repo",
          pathExists: true,
          isGitRepo: true,
          managed: true,
          memory: {
            memoryMode: "external-local",
            memoryAvailable: false,
            harnessReady: false,
            artifactBase: "memory-root",
            roots: { memoryRoot: "E:/aho-home/projects/repo" },
          },
          harness: { readiness: "partial" },
        }] });
      }
      if (url === "/api/projects/repo/workbench/projections/transcript/member-discount?limit=100") return jsonResponse(snapshot.center.parentAgentTranscript);
      return jsonResponse(historySnapshot);
    }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("会员折扣计价").length).toBeGreaterThan(0));
    expect(screen.queryByText("保存到项目列表")).toBeNull();
    expect(screen.queryByText("这个项目需要准备后才能开始需求对话。")).toBeNull();
    const graphTab = screen.getByRole("tab", { name: "Agent 编排图" });
    fireEvent.click(graphTab);
    expect(graphTab.getAttribute("aria-selected")).toBe("true");
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

    await waitFor(() => expect(screen.getByText("创造任何东西")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("项目菜单"));
    fireEvent.click(screen.getAllByText("打开文件夹")[0]);
    fireEvent.click(screen.getAllByText("打开文件夹")[1]);

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

function delayedSseResponse(
  immediateEvents: Array<[string, unknown]>,
  delayedEvents: Array<[string, unknown]>,
  beforeDelayedEvents: () => void,
): Response {
  const encoder = new TextEncoder();
  const streamBody = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [event, data] of immediateEvents) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      setTimeout(() => {
        beforeDelayedEvents();
        for (const [event, data] of delayedEvents) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
        controller.close();
      }, 250);
    },
  });
  return new Response(streamBody, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
