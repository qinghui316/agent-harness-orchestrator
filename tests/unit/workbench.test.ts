import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange, closeChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { startLocalCommandRun } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { appendTopicThreadEntry, createWorkbenchTopic, postTopicMessage } from "../../src/workbench/chat.js";
import { answerClarification, reanalyzeIntake, runIntakeScan } from "../../src/workbench/intake.js";
import { getWorkbenchSnapshot, getWorkbenchStream, getWorkbenchTopic, listWorkbenchApprovals, listWorkbenchRoles, listWorkbenchTopics } from "../../src/workbench/manager.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import {
  buildRoleScopedContextProjection,
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
  listDemandMemoryCloseouts,
  maybeRunMaintenanceReviewWindow,
  readMaintenanceReviewWatermark,
  recordDemandMemoryCloseout,
  recordMaintenanceLedgerEntry,
  runMaintenanceCandidatePipeline,
} from "../../src/agent-task/manager.js";
import { buildDelegateTaskManifest, validateDelegateTaskPolicy } from "../../src/agent-task/delegate-task.js";
import { findBoundaryViolations } from "../../src/agent-task/boundary-audit.js";
import { dispatchForegroundRoleTask } from "../../src/agent-task/role-dispatcher.js";
import { evaluateToolPolicy, workerPermissionProfileForRole } from "../../src/agent-task/tool-policy.js";
import {
  claimAvailableDemandWorkers,
  claimNextDemandWorker,
  enqueueDemandWorker,
  listDemandWorkerAttempts,
  listDemandWorkers,
  listMainOrchestratorDecisions,
  markDemandWorkerRunning,
} from "../../src/demand-worker/manager.js";
import { createWorktree } from "../../src/worktree/manager.js";
import { classifyPrFeedbackSnapshotData } from "../../src/pr-feedback/manager.js";
import { cleanupRemoteBranchAfterMerge, preparePostMergeHandoff, syncLocalAfterMerge } from "../../src/post-merge/manager.js";
import { mergeNextLandingQueueCandidate, prepareLandingQueue } from "../../src/landing-queue/manager.js";
import { listTaskQueueItems, listTaskQueues, reconcileTaskQueues, startOrResumeTaskQueue } from "../../src/task-queue/manager.js";
import type { ManagedProject, RunMetadata, TaskQueueItem, TaskQueueRun, TaskRun, WorkerLease } from "../../src/types/index.js";

let tempDir: string;
const execFileAsync = promisify(execFile);

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-workbench-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function project(path = tempDir): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

async function createFakeGh(initial: { isDraft?: boolean; comments?: unknown[]; inlineComments?: unknown[]; failedChecks?: number; canResolveThreads?: boolean; mergeFails?: boolean } = {}): Promise<{ command: string; args: string[]; stateFile: string }> {
  const binDir = join(tempDir, "fake-gh-bin");
  await mkdir(binDir, { recursive: true });
  const stateFile = join(binDir, "state.json");
  await writeFile(stateFile, JSON.stringify({
    isDraft: initial.isDraft ?? true,
    comments: initial.comments ?? [],
    inlineComments: initial.inlineComments ?? [],
    failedChecks: initial.failedChecks ?? 0,
    canResolveThreads: initial.canResolveThreads ?? true,
    mergeFails: initial.mergeFails ?? false,
    mergeCount: 0,
    merged: false,
    replies: [],
    resolvedThreads: [],
  }), "utf8");
  const script = join(binDir, "fake-gh.js");
  await writeFile(script, `#!/usr/bin/env node
const fs = require("fs");
const stateFile = ${JSON.stringify(stateFile)};
const args = process.argv.slice(2);
const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
const writeState = (state) => fs.writeFileSync(stateFile, JSON.stringify(state), "utf8");
if (args[0] === "--version") {
  console.log("gh version 2.0.0");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  console.log("Logged in to github.com");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "view") {
  const state = readState();
  const failedChecks = Array.from({ length: state.failedChecks || 0 }, (_, index) => ({ name: "check-" + index, conclusion: "FAILURE", status: "COMPLETED" }));
  console.log(JSON.stringify({
    url: "https://github.com/qinghui316/private-acceptance/pull/1",
    state: state.merged ? "MERGED" : "OPEN",
    isDraft: Boolean(state.isDraft),
    reviewDecision: null,
    reviews: [],
    comments: state.comments || [],
    headRefName: "aho/test",
    baseRefName: "main",
    headRefOid: "head",
    baseRefOid: "base",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    mergedAt: state.merged ? "2026-05-30T00:00:00.000Z" : null,
    mergeCommit: state.merged ? { oid: "merge-commit-sha" } : null,
    statusCheckRollup: failedChecks,
  }));
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "merge") {
  const state = readState();
  if (state.mergeFails) {
    console.error("Branch protection blocked merge");
    process.exit(1);
  }
  state.merged = true;
  state.mergeCount = (state.mergeCount || 0) + 1;
  writeState(state);
  console.log("Merged pull request");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "ready") {
  const state = readState();
  state.isDraft = false;
  writeState(state);
  console.log("Ready for review");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "comment") {
  const state = readState();
  const bodyIndex = args.indexOf("--body");
  state.replies = state.replies || [];
  state.replies.push({ kind: "pr", body: bodyIndex >= 0 ? args[bodyIndex + 1] : "" });
  writeState(state);
  console.log("Commented");
  process.exit(0);
}
if (args[0] === "api") {
  const state = readState();
  if (args[1] === "graphql") {
    const queryArg = args.find((arg) => String(arg).startsWith("query=")) || "";
    if (queryArg.includes("resolveReviewThread")) {
      if (!state.canResolveThreads) {
        console.error("Thread resolve is unavailable");
        process.exit(1);
      }
      const threadArg = args.find((arg) => String(arg).startsWith("threadId=")) || "threadId=thread-1";
      const threadId = threadArg.slice("threadId=".length);
      state.resolvedThreads = state.resolvedThreads || [];
      state.resolvedThreads.push(threadId);
      writeState(state);
      console.log(JSON.stringify({ data: { resolveReviewThread: { thread: { id: threadId, isResolved: true } } } }));
      process.exit(0);
    }
    if (!state.canResolveThreads) {
      console.error("GraphQL reviewThreads unavailable");
      process.exit(1);
    }
    console.log(JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: (state.inlineComments || []).map((comment, index) => ({
                id: comment.threadId || "thread-" + (index + 1),
                isResolved: false,
                comments: { nodes: [{ id: "graphql-comment-" + String(comment.id || index + 1), databaseId: Number(comment.id || index + 1), body: comment.body || "", path: comment.path || null, line: comment.line || null, author: { login: "reviewer" }, createdAt: "2026-05-29T00:00:00.000Z" }] },
              })),
            },
          },
        },
      },
    }));
    process.exit(0);
  }
  if (/^repos\\/[^/]+\\/[^/]+\\/pulls\\/\\d+\\/comments$/.test(args[1])) {
    console.log(JSON.stringify(state.inlineComments || []));
    process.exit(0);
  }
  const replyMatch = args[1].match(/^repos\\/[^/]+\\/[^/]+\\/pulls\\/\\d+\\/comments\\/(\\d+)\\/replies$/);
  if (replyMatch) {
    const bodyArg = args.find((arg) => String(arg).startsWith("body=")) || "body=";
    state.replies = state.replies || [];
    state.replies.push({ kind: "inline", commentId: replyMatch[1], body: bodyArg.slice("body=".length) });
    writeState(state);
    console.log(JSON.stringify({ id: 999, body: bodyArg.slice("body=".length) }));
    process.exit(0);
  }
}
console.error("Unsupported fake gh command: " + args.join(" "));
process.exit(1);
`, "utf8");
  await chmod(script, 0o755).catch(() => undefined);
  return { command: process.execPath, args: [script], stateFile };
}

async function writePlanningBundleFixture(changeId: string, goal = "Implement pricing rule"): Promise<void> {
  const changeDir = join(tempDir, "harness", "changes", "active", changeId);
  const planningDir = join(changeDir, "planning");
  await mkdir(planningDir, { recursive: true });
  const specMd = `# Spec\n\n## Goal\n\n${goal}\n\n## Acceptance Criteria\n\n- AC-001: Implement and test the requested behavior.\n`;
  const planMd = "# Plan\n\n1. Update implementation.\n2. Add tests.\n";
  const tasksMd = "- [ ] T-001: Implement requested behavior\n  - Covers: AC-001\n";
  await writeFile(join(planningDir, "latest-bundle.json"), JSON.stringify({
    id: `bundle-${changeId}`,
    status: "draft",
    goal,
    constraints: ["Do not apply source root without confirmation."],
    acceptanceCriteria: ["Implement and test the requested behavior."],
    design: "Use existing pricing module and tests.",
    tasks: [{ id: "T-001", title: "Implement requested behavior", acIds: ["AC-001"] }],
    risks: [],
    openQuestions: [],
    specMd,
    planMd,
    tasksMd,
    acMapCandidate: null,
    artifact: `harness/changes/active/${changeId}/planning/latest-bundle.md`,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

describe("workbench read model", () => {
  it("classifies Draft PR feedback for main-agent rework decisions", () => {
    expect(classifyPrFeedbackSnapshotData({
      state: "OPEN",
      reviewDecision: "CHANGES_REQUESTED",
      reviews: [],
      comments: [],
      statusCheckRollup: [],
    })).toBe("changes-requested");
    expect(classifyPrFeedbackSnapshotData({
      state: "OPEN",
      reviewDecision: "REVIEW_REQUIRED",
      reviews: [],
      comments: [],
      statusCheckRollup: [{ conclusion: "FAILURE" }],
    })).toBe("checks-failed");
    expect(classifyPrFeedbackSnapshotData({
      state: "OPEN",
      reviewDecision: "APPROVED",
      reviews: [],
      comments: [{ body: "nit" }],
      statusCheckRollup: [],
    })).toBe("comments-only");
    expect(classifyPrFeedbackSnapshotData({
      state: "MERGED",
      reviewDecision: "APPROVED",
      reviews: [],
      comments: [],
      statusCheckRollup: [],
    })).toBe("stale-pr");
  });

  it("lists active and archived changes as topics", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archive Me" });
    await writeFile(join(tempDir, "harness", "changes", "active", "archive-me", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);
    await createChange(project(), { title: "Active Topic" });

    const topics = await listWorkbenchTopics({ project: project(), path: tempDir });

    expect(topics.map((item) => [item.id, item.state])).toEqual(expect.arrayContaining([
      ["active-topic", "active"],
      ["archive-me", "archive"],
    ]));
  });

  it("builds a snapshot with selected topic, semantic thread, roles, gaps, and close approval", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workbench Smoke" });
    await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('hello')"]);
    await writeFile(join(tempDir, "harness", "changes", "active", "workbench-smoke", "reviews", "review.md"), "Status: approved\n", "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir });

    expect(snapshot.left.topics[0]).toMatchObject({ id: "workbench-smoke", state: "active" });
    expect(snapshot.center.selectedTopic?.id).toBe("workbench-smoke");
    expect(snapshot.center.workpad).toMatchObject({
      title: "Workbench Smoke",
      state: "active",
      nextAction: expect.objectContaining({ kind: "approval", approvalId: "close:workbench-smoke" }),
    });
    expect(snapshot.center.agentLoop.runs).toHaveLength(1);
    expect(snapshot.center.thread.items.some((item) => item.kind === "change-state")).toBe(true);
    expect(snapshot.center.thread.items.some((item) => item.runId === snapshot.center.agentLoop.runs[0]?.id)).toBe(false);
    expect(snapshot.center.activeTab).toBe("conversation");
    expect(snapshot.center.parentAgentTranscript.cells).toHaveLength(0);
    expect(snapshot.center.parentAgentTranscript.items).toHaveLength(0);
    const transcriptText = JSON.stringify(snapshot.center.parentAgentTranscript);
    for (const forbidden of ["AI 回复", "执行结果", "TaskRun", "WorkerLease", "DemandWorker", "TaskRepository", "blocked", "T-001", "AC-001"]) {
      expect(transcriptText).not.toContain(forbidden);
    }
    expect(snapshot.right.approvals.some((item) => item.kind === "change-close")).toBe(true);
    expect(snapshot.right.approvals.find((item) => item.kind === "change-close")?.action).toMatchObject({
      actionId: "change.close",
      mutates: true,
      requiresConfirmation: true,
    });
    expect(snapshot.roles.map((item) => item.id)).toEqual(expect.arrayContaining(["coder", "auditor", "validator"]));
    expect(snapshot.harnessGaps.map((item) => item.id)).toEqual(expect.arrayContaining(["roleCatalog", "sessionModel", "subagentSpec"]));
  });

  it("projects Codex runtime output into transcript cells before derived workflow summaries", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Codex Transcript", body: "实现会员满 100 九折" });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "assistant.message",
      text: "Fallback final message should not duplicate the cell stream.",
      runId: "run-codex-transcript",
      blocks: [
        { id: "p1", runId: "run-codex-transcript", sequence: 1, kind: "prose", timestamp: "2026-05-31T00:00:00.000Z", source: "codex", text: "我会先检查计价模块。" },
        { id: "p2", runId: "run-codex-transcript", sequence: 2, kind: "prose", timestamp: "2026-05-31T00:00:01.000Z", source: "codex", text: "然后补充边界测试。" },
        { id: "cmd", runId: "run-codex-transcript", sequence: 3, kind: "command", timestamp: "2026-05-31T00:00:02.000Z", source: "codex", title: "Command completed", command: "npm test", preview: "测试通过", status: "completed", exitCode: 0 },
        { id: "validation", runId: "run-codex-transcript", sequence: 4, kind: "workflow-evidence", timestamp: "2026-05-31T00:00:03.000Z", source: "validation", title: "验证通过", text: "targeted tests passed", status: "passed", artifactRef: "runs/validation.md" },
      ],
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.id });
    const cells = snapshot.center.parentAgentTranscript.cells;

    expect(cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "assistant-message",
        source: "codex-runtime",
        text: expect.stringContaining("我会先检查计价模块"),
      }),
      expect.objectContaining({
        kind: "process-row",
        title: "已运行命令",
        text: "已运行 1 条命令",
        detailText: expect.stringContaining("npm test"),
      }),
    ]));
    expect(cells.filter((cell) => cell.kind === "assistant-message")).toHaveLength(1);
    expect(JSON.stringify(cells)).not.toContain("Fallback final message should not duplicate");
    expect(JSON.stringify(cells)).not.toContain("验证通过");
    expect(JSON.stringify(cells)).not.toContain("targeted tests passed");
    expect(cells.find((cell) => cell.kind === "process-row")?.text).not.toContain("测试通过");
  });

  it("keeps archived topic messages in the semantic thread stream", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Archive Messages", body: "Need a durable archived thread." });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "orchestrator.plan",
      text: "I prepared the plan card.",
      planCard: {
        title: "Archived plan",
        summary: "This plan should survive archive lookup.",
        steps: [{ label: "Review", description: "Read the archived evidence." }],
        warnings: [],
      },
    });
    await writeFile(join(tempDir, "harness", "changes", "active", topic.changeId, "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.center.selectedTopic).toMatchObject({ id: topic.changeId, state: "archive" });
    expect(snapshot.center.workpad).toMatchObject({
      state: "readonly",
      nextAction: expect.objectContaining({ enabled: false, kind: "none" }),
    });
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "Need a durable archived thread." }),
      expect.objectContaining({
        kind: "assistant-turn",
        planCard: expect.objectContaining({ title: "Archived plan" }),
        blocks: expect.arrayContaining([
          expect.objectContaining({ kind: "plan-card", title: "Archived plan" }),
        ]),
      }),
    ]));
  });

  it("projects code workflow summaries with validation and audit evidence without raw run events", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Code Evidence", body: "Implement the pricing rule." });
    const run = await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('code')"]);
    await appendTopicThreadEntry(project(), topic.changeId, { type: "workflow.started", actionRunId: "action-code", actionType: "code.run", status: "running" });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.completed",
      actionRunId: "action-code",
      actionType: "code.run",
      status: "completed",
      runId: run.run.id,
      text: "I updated the pricing rule and kept validation evidence attached.",
      activity: [
        { kind: "status", label: "running", detail: "Coder", timestamp: run.run.startedAt },
        {
          kind: "assistant-event",
          event: {
            runId: run.run.id,
            kind: "command",
            phase: "completed",
            title: "Command completed",
            summary: "npm test",
            command: "npm test",
            preview: "ok",
            exitCode: 0,
          },
          timestamp: run.run.finishedAt ?? run.run.startedAt,
        },
        { kind: "tool", tool: { runId: run.run.id, phase: "completed", name: "Validation", status: "passed" }, timestamp: run.run.finishedAt ?? run.run.startedAt },
      ],
    });
    await writeFile(join(tempDir, ".agent-harness", "runs", run.run.id, "validation.json"), JSON.stringify({
      version: "1.0",
      id: "validation-code",
      runId: run.run.id,
      changeId: topic.changeId,
      profile: "default",
      status: "passed",
      executionMode: "direct",
      startedAt: run.run.startedAt,
      finishedAt: run.run.finishedAt ?? run.run.startedAt,
      commands: [{
        name: "test",
        command: ["npm", "test"],
        cwd: tempDir,
        status: "passed",
        exitCode: 0,
        signal: null,
        startedAt: run.run.startedAt,
        finishedAt: run.run.finishedAt ?? run.run.startedAt,
        stdout: "ok",
        stderr: "",
      }],
    }, null, 2), "utf8");
    await writeFile(join(tempDir, ".agent-harness", "runs", run.run.id, "audit.json"), JSON.stringify({
      version: "1.0",
      id: "audit-code",
      runId: run.run.id,
      changeId: topic.changeId,
      status: "approved-with-notes",
      startedAt: run.run.startedAt,
      finishedAt: run.run.finishedAt ?? run.run.startedAt,
      findings: [],
      artifacts: {
        audit: `.agent-harness/runs/${run.run.id}/audit.json`,
        auditMarkdown: `.agent-harness/runs/${run.run.id}/audit.md`,
        lastMessage: `.agent-harness/runs/${run.run.id}/last-message.md`,
      },
    }, null, 2), "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.center.thread.items.filter((item) => item.kind === "workflow-summary" && item.actionRunId === "action-code")).toHaveLength(0);
    expect(snapshot.center.thread.items.filter((item) => item.kind === "assistant-turn" && item.runId === run.run.id)).toHaveLength(1);
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "assistant-turn",
        body: "I updated the pricing rule and kept validation evidence attached.",
        activity: expect.arrayContaining([
          expect.objectContaining({ kind: "assistant-event" }),
          expect.objectContaining({ kind: "tool" }),
        ]),
        blocks: expect.arrayContaining([
          expect.objectContaining({ kind: "prose", text: "I updated the pricing rule and kept validation evidence attached." }),
          expect.objectContaining({ kind: "command", command: "npm test" }),
          expect.objectContaining({ kind: "workflow-evidence", source: "workflow", status: "completed" }),
          expect.objectContaining({ kind: "workflow-evidence", source: "validation", status: "passed" }),
          expect.objectContaining({ kind: "workflow-evidence", source: "audit", status: "approved-with-notes" }),
        ]),
        evidence: expect.arrayContaining([
          expect.objectContaining({ source: "workflow", status: "completed" }),
          expect.objectContaining({ source: "validation", status: "passed" }),
          expect.objectContaining({ source: "audit", status: "approved-with-notes" }),
        ]),
      }),
    ]));
    expect(snapshot.center.thread.items.some((item) => item.kind === "evidence" && item.runId === run.run.id)).toBe(false);
    expect(snapshot.center.thread.items.some((item) => item.label === "process.started" || item.label === "run.completed")).toBe(false);
  });

  it("prefers persisted assistant blocks over legacy activity when rebuilding the thread", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Block Dedupe", body: "Show one command and one usage." });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "assistant.message",
      runId: "run-dedupe",
      text: "I checked the repository.",
      blocks: [
        { id: "p1", runId: "run-dedupe", sequence: 1, kind: "prose", timestamp: "2026-05-15T12:00:00.000Z", source: "codex", text: "I checked the repository." },
        { id: "c1", runId: "run-dedupe", itemId: "cmd-1", sequence: 2, kind: "command", timestamp: "2026-05-15T12:00:01.000Z", source: "codex", command: "npm test", preview: "ok", exitCode: 0 },
        { id: "u1", runId: "run-dedupe", sequence: 3, kind: "usage", timestamp: "2026-05-15T12:00:02.000Z", source: "codex", text: "用量：1 input tokens · 2 output tokens" },
      ],
      activity: [
        { kind: "assistant-event", event: { runId: "run-dedupe", itemId: "cmd-1", kind: "command", phase: "completed", command: "npm test", preview: "ok", exitCode: 0 }, timestamp: "2026-05-15T12:00:03.000Z" },
        { kind: "usage", usage: { input_tokens: 1, output_tokens: 2 }, timestamp: "2026-05-15T12:00:04.000Z" },
      ],
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    const turn = snapshot.center.thread.items.find((item) => item.kind === "assistant-turn" && item.runId === "run-dedupe");

    expect(turn?.blocks?.filter((block) => block.kind === "command")).toHaveLength(1);
    expect(turn?.blocks?.filter((block) => block.kind === "usage")).toHaveLength(1);
    expect(turn?.blocks?.map((block) => block.sequence)).toEqual([1, 2, 3]);
  });

  it("projects deterministic intake scan, clarification, and reanalysis into Workpad", async () => {
    await initHarness(project());
    await writeFile(join(tempDir, "package.json"), JSON.stringify({
      scripts: { test: "vitest", typecheck: "tsc --noEmit" },
    }, null, 2), "utf8");
    await mkdir(join(tempDir, "src"), { recursive: true });
    await mkdir(join(tempDir, "tests"), { recursive: true });
    await writeFile(join(tempDir, "src", "pricing.ts"), "export const price = 100;\n", "utf8");
    await writeFile(join(tempDir, "tests", "pricing.test.ts"), "import '../src/pricing';\n", "utf8");
    const topic = await createWorkbenchTopic(project(), {
      title: "Member Discount Intake",
      body: "帮我新增会员订单满 100 元享 9 折，非会员不打折，并补测试。",
    });

    const scan = await runIntakeScan(project(), topic.changeId, "会员满 100 九折");
    const firstIteration = await reanalyzeIntake(project(), topic.changeId, "折扣金额四舍五入到分，只有会员订单参与。");
    expect(firstIteration.clarification).toBeTruthy();
    if (!firstIteration.clarification) throw new Error("Expected clarification");

    await answerClarification(project(), topic.changeId, firstIteration.clarification.id, [{ questionId: "q-tests", answer: "要覆盖会员满 100、会员未满 100、非会员三类测试。" }]);
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(scan.run.runtime).toBe("intake-scan");
    expect(existsSync(join(tempDir, ".agent-harness", "runs", scan.run.id, "scan.json"))).toBe(true);
    expect(existsSync(join(tempDir, ".agent-harness", "runs", scan.run.id, "scan.md"))).toBe(true);
    expect(existsSync(join(tempDir, "harness", "changes", "active", topic.changeId, "spec.md"))).toBe(true);
    expect(await readFile(join(tempDir, "harness", "changes", "active", topic.changeId, "spec.md"), "utf8")).toContain("TBD");
    expect(snapshot.center.workpad.intake.relatedArtifacts).toEqual(expect.arrayContaining([scan.run.artifacts.intakeScanMarkdown]));
    expect(snapshot.center.workpad.intake.confirmedConstraints).toEqual(expect.arrayContaining([
      "折扣金额四舍五入到分，只有会员订单参与",
      "要覆盖会员满 100、会员未满 100、非会员三类测试",
    ]));
    expect(snapshot.center.workpad.intake.pendingClarifications).toHaveLength(0);
    expect(snapshot.center.workpad.nextAction).toMatchObject({ actionType: "planning.generate", enabled: true });
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "intake-summary", label: "需求分析" }),
      expect.objectContaining({ kind: "clarification", label: "需要确认" }),
      expect.objectContaining({ kind: "clarification", label: "已回答确认" }),
    ]));
    expect(snapshot.center.thread.items.some((item) => /stdout|stderr|jsonl|process/.test(`${item.body ?? ""}${item.label}`))).toBe(false);
  });

  it("replays run stream artifacts with bounded previews and diagnostics", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Stream Topic" });
    const result = await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('hello stream')"]);
    const runDir = join(tempDir, ".agent-harness", "runs", result.run.id);
    await writeFile(join(runDir, "last-message.md"), "x".repeat(5000), "utf8");
    await rm(join(runDir, "stderr.log"), { force: true });

    const stream = await getWorkbenchStream({ project: project(), path: tempDir }, result.run.id);

    expect(stream.live).toBe(false);
    expect(stream.run.id).toBe(result.run.id);
    expect(stream.events.map((item) => item.type)).toEqual(expect.arrayContaining(["run.created", "process.started", "run.completed"]));
    expect(stream.artifacts.find((item) => item.key === "stdout")).toMatchObject({ exists: true, kind: "log" });
    expect(stream.artifacts.find((item) => item.key === "lastMessage")).toMatchObject({ exists: true, truncated: true });
    expect(stream.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("stderr")]));
  });

  it("returns a diagnostic snapshot when durable memory is unavailable", async () => {
    const snapshot = await getWorkbenchSnapshot({ project: null, path: tempDir });

    expect(snapshot.left.topics).toHaveLength(0);
    expect(snapshot.center.selectedTopic).toBeNull();
    expect(snapshot.center.workpad).toMatchObject({
      state: "diagnostic",
      nextAction: expect.objectContaining({ enabled: false }),
    });
    expect(snapshot.warnings).toEqual(expect.arrayContaining([
      "Project is not registered; snapshot is diagnostic only.",
      "Project is not managed by AHO.",
      "Durable memory is unavailable. AHO will not infer project history.",
    ]));
  });

  it("summarizes bundled role profiles without enabling scheduling", async () => {
    const roles = await listWorkbenchRoles();
    const coder = roles.find((item) => item.id === "coder");
    const validator = roles.find((item) => item.id === "validator");

    expect(coder).toMatchObject({ writeCapability: "worktree-write", preferredRuntime: "codex" });
    expect(validator).toMatchObject({ writeCapability: "deterministic-writer", preferredRuntime: "local-command" });
    expect(roles.every((item) => item.sections.length > 0)).toBe(true);
  });

  it("derives spec proposal approval items from existing artifacts", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Spec Proposal Topic" });
    const run = await writeSpecProposalRun("spec-proposal-topic");
    const otherRun = await writeSpecProposalRun("other-topic");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir });

    expect(snapshot.center.workpad.nextAction).toMatchObject({
      kind: "approval",
      approvalId: `spec:${run.id}`,
      enabled: true,
    });
    expect(snapshot.right.approvals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `spec:${run.id}`,
        kind: "spec-proposal",
        targetId: run.id,
        action: expect.objectContaining({
          actionId: "change.spec.accept",
          command: "change",
          args: ["spec", "accept", "repo", run.id],
          mutates: true,
          requiresConfirmation: true,
        }),
      }),
      expect.objectContaining({
        id: `spec:${otherRun.id}`,
        kind: "spec-proposal",
        targetId: otherRun.id,
      }),
    ]));
  });

  it("hides accepted proposals from pending approvals and keeps completed decisions", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Decision Topic" });
    const run = await writeSpecProposalRun("decision-topic");
    const memory = await resolveProjectMemory(project());
    await writeFile(join(tempDir, ".agent-harness", "runs", run.id, "events.jsonl"), [
      JSON.stringify({ timestamp: new Date().toISOString(), type: "change.spec.proposal.completed", runId: run.id }),
      JSON.stringify({ timestamp: new Date().toISOString(), type: "change.spec.proposal.accepted", runId: run.id }),
      "",
    ].join("\n"), "utf8");
    const store = await WorkbenchStore.open(memory);
    try {
      store.upsertDecision({
        id: `approval:change.spec.accept:${run.id}`,
        projectId: "repo",
        changeId: "decision-topic",
        decisionType: "change.spec.accept",
        status: "accepted",
        label: "Accept spec proposal",
        summary: "Accepted Spec proposal.",
        targetId: run.id,
        runId: run.id,
        artifact: run.artifacts.specProposal ?? null,
        actionId: "change.spec.accept",
        feedback: null,
        payloadJson: "{}",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } finally {
      store.close();
    }

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "decision-topic" });

    expect(snapshot.right.approvals.some((item) => item.id === `spec:${run.id}`)).toBe(false);
    expect(snapshot.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: run.id, status: "accepted", artifact: run.artifacts.specProposal }),
    ]));
  });

  it("keeps accepted close decisions attached to the closed topic", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Close Decision Topic" });
    await writeFile(join(tempDir, "harness", "changes", "active", "close-decision-topic", "reviews", "review.md"), "Status: approved\n", "utf8");

    const before = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "close-decision-topic" });
    const closeAction = before.right.approvals.find((item) => item.kind === "change-close")?.action;
    expect(closeAction).toBeTruthy();
    if (!closeAction) throw new Error("Expected close action");

    await executeWorkbenchAction({ project: project(), path: tempDir }, { action: closeAction, confirm: true });
    const after = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "close-decision-topic" });

    expect(after.right.approvals.some((item) => item.kind === "change-close")).toBe(false);
    expect(after.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "change.close",
        changeId: "close-decision-topic",
        targetId: "close-decision-topic",
        status: "accepted",
      }),
    ]));
  });

  it("lists project-level approvals and filters display by topic", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Approval Topic" });
    const run = await writeSpecProposalRun("approval-topic");
    await writeSpecProposalRun("other-topic");

    const allApprovals = await listWorkbenchApprovals({ project: project(), path: tempDir });
    const topicApprovals = await listWorkbenchApprovals({ project: project(), path: tempDir }, { topicId: "approval-topic" });

    expect(allApprovals.filter((item) => item.kind === "spec-proposal")).toHaveLength(2);
    expect(topicApprovals).toEqual([
      expect.objectContaining({
        id: `spec:${run.id}`,
        changeId: "approval-topic",
      }),
    ]);
  });

  it("returns one selected topic by id", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Specific Topic" });

    const topic = await getWorkbenchTopic({ project: project(), path: tempDir }, "specific-topic");

    expect(topic).toMatchObject({ id: "specific-topic", state: "active" });
  });

  it("derives Workpad TaskGraph from accepted tasks and AC map", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Task Preview" });
    await writeFile(join(tempDir, "harness", "changes", "active", "task-preview", "spec.md"), [
      "# Spec",
      "",
      "## Acceptance Criteria",
      "",
      "- AC-001: Show Workpad task preview.",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(tempDir, "harness", "changes", "active", "task-preview", "plan.md"), "# Plan\n\nImplement deterministic task preview.\n", "utf8");
    await writeFile(join(tempDir, "harness", "changes", "active", "task-preview", "tasks.md"), [
      "# Tasks",
      "",
      "- [x] T-001: Render deterministic task preview.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "task-preview" });

    expect(snapshot.center.workpad.progress).toMatchObject({ spec: "ready", tasks: "ready", acCount: 1, taskCount: 1 });
    expect(snapshot.center.workpad.tasks).toEqual([
      expect.objectContaining({ id: "T-001", title: "Render deterministic task preview.", done: true, acIds: ["AC-001"] }),
    ]);
    expect(snapshot.center.workpad.taskGraph.nodes).toEqual([
      expect.objectContaining({
        taskId: "T-001",
        title: "Render deterministic task preview.",
        checked: true,
        acIds: ["AC-001"],
        nextAction: expect.objectContaining({ actionType: "task.run.start", taskIds: ["T-001"], enabled: true }),
      }),
    ]);
    expect(snapshot.center.workpad.codingPackages).toEqual([
      expect.objectContaining({
        id: "coding-package:task-preview:implementation",
        recommendedRoleId: "coder-agent",
        executionUnit: "single-agent",
        assignmentStatus: "not-assigned",
        taskIds: ["T-001"],
        completedTaskIds: ["T-001"],
        acIds: ["AC-001"],
        coveredAcIds: ["AC-001"],
        missingEvidenceAcIds: [],
      }),
    ]);
  });

  it("attaches task-scoped coder, validation, and audit evidence to the matching TaskGraph node", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Task Evidence" });
    await writeAcceptedSpecAndTasks("task-evidence");
    await writeCoderRun("task-evidence", "run-task-1", ["T-001"], "wt-task-1", "completed");
    await writeCoderRun("task-evidence", "run-change-level", [], "wt-change", "completed");
    await writeValidationResult("task-evidence", "validation-task-1", "wt-task-1", "passed");
    await writeAuditResult("task-evidence", "audit-task-1", "wt-task-1", "approved-with-notes");
    await writeValidationResult("task-evidence", "validation-change-level", "wt-unmatched", "passed");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "task-evidence" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");

    expect(node).toMatchObject({
      status: "evidence-ready",
      latestEvidence: expect.arrayContaining([
        expect.objectContaining({ id: "run:run-task-1", source: "run", worktreeId: "wt-task-1" }),
        expect.objectContaining({ id: "validation:validation-task-1", source: "validation", worktreeId: "wt-task-1" }),
        expect.objectContaining({ id: "audit:audit-task-1", source: "audit", worktreeId: "wt-task-1" }),
      ]),
    });
    expect(snapshot.center.workpad.taskGraph.changeLevelEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "run:run-change-level" }),
      expect.objectContaining({ id: "validation:validation-change-level" }),
    ]));
  });

  it("disables task run actions for archived topics without losing TaskGraph facts", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archived TaskGraph" });
    await writeAcceptedSpecAndTasks("archived-taskgraph");
    await writeFile(join(tempDir, "harness", "changes", "active", "archived-taskgraph", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "archived-taskgraph" });

    expect(snapshot.center.workpad.state).toBe("readonly");
    expect(snapshot.center.workpad.taskGraph.nodes).toEqual([
      expect.objectContaining({
        taskId: "T-001",
        nextAction: expect.objectContaining({ enabled: false, disabledReason: "需求对话不是可执行状态。" }),
      }),
    ]);
  });

  it("rejects unknown task ids before starting a Workbench task run", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Unknown Task" });
    await writeAcceptedSpecAndTasks("unknown-task");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.start",
      changeId: "unknown-task",
      taskIds: ["T-999"],
      confirm: true,
    });

    expect(result.result).toMatchObject({ status: "failed", error: expect.stringContaining("Unknown task id") });
  });

  it("projects latest TaskRun and WorkerLease state on the matching TaskGraph node", async () => {
    await initHarness(project());
    await createChange(project(), { title: "TaskRun State" });
    await writeAcceptedSpecAndTasks("taskrun-state");
    await writeTaskRunRecord("taskrun-state", "taskrun-1", "T-001", "blocked", 1, {
      runId: "run-taskrun-1",
      worktreeId: "wt-taskrun-1",
      blockedReason: "Audit failed.",
      leaseId: "lease-1",
    });
    await writeWorkerLeaseRecord("taskrun-state", "lease-1", "taskrun-1", "T-001", "released");
    await writeCoderRun("taskrun-state", "run-taskrun-1", ["T-001"], "wt-taskrun-1", "completed", "taskrun-1");
    await writeAuditResult("taskrun-state", "audit-taskrun-1", "wt-taskrun-1", "failed");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "taskrun-state" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");

    expect(node).toMatchObject({
      status: "blocked",
      taskRun: expect.objectContaining({ id: "taskrun-1", status: "blocked", attempt: 1, runId: "run-taskrun-1", worktreeId: "wt-taskrun-1" }),
      workerLease: expect.objectContaining({ id: "lease-1", status: "released", workerId: expect.stringContaining("local") }),
      nextAction: expect.objectContaining({ actionType: "task.run.retry", taskRunId: "taskrun-1", enabled: false, label: "正在自动修改" }),
      autoRework: expect.objectContaining({ available: true, attempt: 0, budget: 1 }),
      blockers: expect.arrayContaining(["Audit failed."]),
    });
  });

  it("reconciles a claimed TaskRun from run, validation, and audit artifacts", async () => {
    await initHarness(project());
    await createChange(project(), { title: "TaskRun Reconcile" });
    await writeAcceptedSpecAndTasks("taskrun-reconcile");
    await writeTaskRunRecord("taskrun-reconcile", "taskrun-reconcile-1", "T-001", "claimed", 1, {
      leaseId: "lease-reconcile-1",
    });
    await writeWorkerLeaseRecord("taskrun-reconcile", "lease-reconcile-1", "taskrun-reconcile-1", "T-001", "claimed");
    await writeCoderRun("taskrun-reconcile", "run-reconcile-1", ["T-001"], "wt-reconcile-1", "completed", "taskrun-reconcile-1");
    await writeValidationResult("taskrun-reconcile", "validation-reconcile-1", "wt-reconcile-1", "passed");
    await writeAuditResult("taskrun-reconcile", "audit-reconcile-1", "wt-reconcile-1", "approved-with-notes");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.reconcile",
      changeId: "taskrun-reconcile",
      taskRunId: "taskrun-reconcile-1",
      confirm: true,
    });
    expect(result.result).toMatchObject({
      status: "completed",
      result: {
        taskRuns: [expect.objectContaining({ id: "taskrun-reconcile-1", status: "completed", runId: "run-reconcile-1", worktreeId: "wt-reconcile-1" })],
        workerLeases: [expect.objectContaining({ id: "lease-reconcile-1", status: "released" })],
      },
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "taskrun-reconcile" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");
    expect(node).toMatchObject({
      status: "evidence-ready",
      taskRun: expect.objectContaining({ id: "taskrun-reconcile-1", status: "completed" }),
      workerLease: expect.objectContaining({ id: "lease-reconcile-1", status: "released" }),
    });
  });

  it("creates a TaskQueue from accepted tasks and skips checked tasks", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Task Queue" });
    await writeAcceptedSpecAndTasks("task-queue");
    await writeFile(join(tempDir, "harness", "changes", "active", "task-queue", "tasks.md"), [
      "# Tasks",
      "",
      "- [x] T-001: Completed task.",
      "  - Covers: AC-001",
      "- [ ] T-002: Runnable task.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");

    const result = await startOrResumeTaskQueue(project(), { changeId: "task-queue" });
    const memory = await resolveProjectMemory(project());
    const items = await listTaskQueueItems(memory, "task-queue", result.queue.id);

    expect(result.queue).toMatchObject({ status: "queued", totalCount: 1, completedCount: 0 });
    expect(items).toEqual([
      expect.objectContaining({ taskId: "T-001", status: "skipped", order: 1 }),
      expect.objectContaining({ taskId: "T-002", status: "queued", order: 2 }),
    ]);
  });

  it("projects TaskQueue status into Workpad and disables single-task actions while queued", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Queued Workpad" });
    await writeAcceptedSpecAndTasks("queued-workpad");
    const result = await startOrResumeTaskQueue(project(), { changeId: "queued-workpad" });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "queued-workpad" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");

    expect(snapshot.center.workpad.taskQueue).toMatchObject({
      id: result.queue.id,
      status: "queued",
      totalCount: 1,
      nextAction: expect.objectContaining({ actionType: "task.queue.reconcile", label: "刷新执行状态" }),
    });
    expect(node?.nextAction).toMatchObject({ enabled: false, disabledReason: "本地顺序执行正在运行或等待恢复。" });
  });

  it("projects blocked queue as the primary decision and moves stale audit approvals to history", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Queue Blocked Decision" });
    await writeAcceptedSpecAndTasks("queue-blocked-decision");
    await writeTaskQueueRecord("queue-blocked-decision", "queue-blocked-1", "blocked", { currentTaskId: "T-001", totalCount: 1, blockedReason: "T-001: Audit blocked." });
    await writeTaskQueueItemRecord("queue-blocked-decision", "queue-blocked-1", "queue-blocked-1-item-001", "T-001", 1, "blocked", { taskRunId: "taskrun-blocked-1", blockedReason: "Audit blocked." });
    await writeTaskRunRecord("queue-blocked-decision", "taskrun-blocked-1", "T-001", "blocked", 2, {
      runId: "run-blocked-1",
      worktreeId: "wt-blocked-1",
      blockedReason: "Audit blocked.",
    });
    await writeCoderRun("queue-blocked-decision", "run-blocked-1", ["T-001"], "wt-blocked-1", "completed", "taskrun-blocked-1");
    await writeAuditResult("queue-blocked-decision", "audit-old-approved", "wt-blocked-1", "approved-with-notes");
    await writeAuditResult("queue-blocked-decision", "audit-latest-blocked", "wt-blocked-1", "blocked");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "queue-blocked-decision" });

    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "task.run.retry",
      taskRunId: "taskrun-blocked-1",
      label: "要求修改",
    });
    expect(snapshot.right.decisionInspector.primary).toMatchObject({
      kind: "queue-blocker",
      queueRunId: "queue-blocked-1",
      taskId: "T-001",
      taskRunId: "taskrun-blocked-1",
      title: "任务暂停：T-001",
      userStatus: "needs-rework",
    });
    expect(snapshot.right.decisionInspector.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "feedback", label: "要求修改" }),
      expect.objectContaining({ kind: "evidence", label: "查看证据" }),
    ]));
    expect(snapshot.right.decisionInspector.primary?.actions.filter((action) => action.kind === "evidence")).toHaveLength(1);
    expect(snapshot.right.decisionInspector.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: expect.stringContaining("audit-old-approved") }),
    ]));
  });

  it("records proposal request-changes feedback without accepting the proposal", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Feedback Proposal" });
    const run = await writeSpecProposalRun("feedback-proposal");
    const before = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "feedback-proposal" });
    const action = before.right.approvals.find((item) => item.id === `spec:${run.id}`)?.action;
    expect(action).toBeTruthy();
    if (!action) throw new Error("Expected spec proposal action");

    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      action,
      feedback: "补充边界后再生成 Spec。",
      feedbackContext: {
        contextId: `approval:spec:${run.id}`,
        approvalId: `spec:${run.id}`,
        changeId: "feedback-proposal",
        targetId: run.id,
        runId: run.id,
      },
    });

    const after = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "feedback-proposal" });

    expect(after.right.approvals.some((item) => item.id === `spec:${run.id}`)).toBe(true);
    expect(after.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "requested-changes",
        changeId: "feedback-proposal",
        targetId: run.id,
        runId: run.id,
        feedback: "补充边界后再生成 Spec。",
      }),
    ]));
    expect(after.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "decision", status: "requested-changes", body: "User requested changes instead of accepting this decision." }),
    ]));
  });

  it("abandons an active Workpad without requiring close readiness", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Abandon Workpad" });

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      abandon: { changeId: "abandon-workpad", reason: "用户不需要继续。" },
      confirm: true,
    });
    const topics = await listWorkbenchTopics({ project: project(), path: tempDir });

    expect(result.result).toMatchObject({
      change: expect.objectContaining({ id: "abandon-workpad", state: "archived" }),
    });
    expect(topics.find((topic) => topic.id === "abandon-workpad")).toMatchObject({ state: "archive" });
  });

  it("reconciles a running TaskQueue item from completed TaskRun evidence", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Queue Reconcile" });
    await writeAcceptedSpecAndTasks("queue-reconcile");
    await writeTaskQueueRecord("queue-reconcile", "queue-1", "running", { currentTaskId: "T-001", totalCount: 1 });
    await writeTaskQueueItemRecord("queue-reconcile", "queue-1", "queue-1-item-001", "T-001", 1, "running", { taskRunId: "taskrun-queue-1" });
    await writeTaskRunRecord("queue-reconcile", "taskrun-queue-1", "T-001", "completed", 1, {
      runId: "run-queue-1",
      worktreeId: "wt-queue-1",
      leaseId: "lease-queue-1",
    });
    await writeWorkerLeaseRecord("queue-reconcile", "lease-queue-1", "taskrun-queue-1", "T-001", "claimed");
    await writeCoderRun("queue-reconcile", "run-queue-1", ["T-001"], "wt-queue-1", "completed", "taskrun-queue-1");
    await writeValidationResult("queue-reconcile", "validation-queue-1", "wt-queue-1", "passed");
    await writeAuditResult("queue-reconcile", "audit-queue-1", "wt-queue-1", "approved-with-notes");

    const result = await reconcileTaskQueues(project(), { changeId: "queue-reconcile", queueRunId: "queue-1" });

    expect(result.queues).toEqual([expect.objectContaining({ id: "queue-1", status: "completed", completedCount: 1 })]);
    expect(result.items).toEqual([expect.objectContaining({ id: "queue-1-item-001", status: "completed", taskRunId: "taskrun-queue-1" })]);
    const memory = await resolveProjectMemory(project());
    const leases = await listTaskQueues(memory, "queue-reconcile");
    expect(leases[0]).toMatchObject({ status: "completed" });
  });

  it("projects multiple Workpads with scoped background activity and memory isolation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Selected Blocked Workpad" });
    await writeAcceptedSpecAndTasks("selected-blocked-workpad");
    await writeTaskQueueRecord("selected-blocked-workpad", "queue-selected", "blocked", {
      currentTaskId: "T-001",
      totalCount: 1,
      blockedReason: "T-001: Audit blocked.",
    });
    await writeTaskQueueItemRecord("selected-blocked-workpad", "queue-selected", "queue-selected-item-001", "T-001", 1, "blocked", {
      taskRunId: "taskrun-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeTaskRunRecord("selected-blocked-workpad", "taskrun-selected-1", "T-001", "blocked", 1, {
      runId: "run-selected-1",
      worktreeId: "wt-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeCoderRun("selected-blocked-workpad", "run-selected-1", ["T-001"], "wt-selected-1", "completed", "taskrun-selected-1");

    await writeRawActiveChange("background-running-workpad", "Background Running Workpad");
    await writeAcceptedSpecAndTasks("background-running-workpad");
    await writeCoderRun("background-running-workpad", "run-background-1", ["T-001"], "wt-background-1", "running");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "selected-blocked-workpad" });

    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "selected-blocked-workpad", runtimeStatus: "blocked", selected: true, blocker: expect.stringContaining("Audit blocked") }),
      expect.objectContaining({ id: "background-running-workpad", runtimeStatus: "running", selected: false, latestRunId: "run-background-1" }),
    ]));
    expect(snapshot.center.workpad.background).toMatchObject({
      runningCount: 1,
      blockedCount: 0,
      waitingDecisionCount: 0,
      items: [expect.objectContaining({ id: "background-running-workpad", runtimeStatus: "running" })],
    });
    expect(snapshot.center.workpad.memoryIsolation).toMatchObject({
      projectStableNamespace: "project/stable",
      currentChangeNamespace: "change/selected-blocked-workpad",
      runNamespaces: expect.arrayContaining(["run/run-selected-1"]),
      relatedWorkpads: [expect.objectContaining({
        changeId: "background-running-workpad",
        status: "running",
        factBoundary: "local-evidence-only",
      })],
    });
    const memoryText = JSON.stringify(snapshot.center.workpad.memoryIsolation);
    expect(memoryText).not.toMatch(/stdout\.log|stderr\.log|events\.jsonl|codex-events\.jsonl|process\.started/);
    expect(snapshot.center.workpad.nextAction).toMatchObject({ label: "正在自动修改", enabled: false });
    expect(snapshot.right.decisionInspector.primary).toBeNull();
  });

  it("creates a separate active demand conversation instead of appending when another demand is active", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Current Active Demand" });

    const next = await createWorkbenchTopic(project(), {
      title: "Independent Follow-up Demand",
      body: "这是另一个独立需求，不应污染当前 Workpad。",
    });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: next.changeId });

    expect(next.changeId).toBe("independent-follow-up-demand");
    expect(snapshot.center.selectedTopic).toMatchObject({ id: next.changeId, state: "active" });
    expect(snapshot.center.workpad.state).toBe("active");
    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "current-active-demand", runtimeStatus: "active" }),
      expect.objectContaining({ id: "independent-follow-up-demand", runtimeStatus: "active", selected: true }),
    ]));
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "这是另一个独立需求，不应污染当前 Workpad。" }),
    ]));
  });

  it("projects confirmed planning next action into the right confirmation queue", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Ready Demand",
      body: "Run the accepted plan.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.confirm-execution",
      enabled: true,
    });
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      kind: "planning-confirm",
      changeId: topic.changeId,
      summary: expect.stringContaining("方案已经准备好"),
    });
    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.confirm-execution", label: "确认执行" }),
    ]));
  });

  it("records supplemental input as pending feedback while a demand run is still running", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Running Demand" });
    await writeAcceptedSpecAndTasks("running-demand");
    await writeCoderRun("running-demand", "run-running-1", ["T-001"], "wt-running-1", "running");

    const result = await postTopicMessage(project(), "running-demand", "补充：金额需要四舍五入到分。");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "running-demand" });

    expect(result).toMatchObject({ run: null, routingDecision: "same-topic", assistantMessage: "已记录，将在下一轮生效。" });
    expect(snapshot.center.workpad.pendingFeedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "补充：金额需要四舍五入到分。", runId: "run-running-1", status: "pending-next-turn" }),
    ]));
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "补充：金额需要四舍五入到分。", runId: "run-running-1" }),
      expect.objectContaining({ kind: "assistant-turn", body: "已记录，将在下一轮生效。", runId: "run-running-1" }),
    ]));
  });

  it("projects result review and applies a reviewed worktree through one user decision", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Result Review Demand" });
      await writeAcceptedSpecAndTasks("result-review-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "result-review-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('ok')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "result-review-demand");
      await writeValidationResultWithHash("result-review-demand", "run-validation-review", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("result-review-demand", "run-audit-review", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");

      const beforeApply = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "result-review-demand" });
      expect(beforeApply.center.workpad.resultReview).toMatchObject({
        status: "ready-to-apply",
        worktreeId: worktree.metadata.worktreeId,
        validation: expect.objectContaining({ status: "passed" }),
        audit: expect.objectContaining({ status: "approved-with-notes" }),
      });
      const applyApproval = beforeApply.right.decisionInspector.primary;
      expect(applyApproval).toMatchObject({ kind: "apply-gate" });
      expect(applyApproval?.actions.find((action) => action.kind === "approval")?.action).toMatchObject({
        actionId: "result.apply",
        args: ["apply", "", "result-review-demand", worktree.metadata.worktreeId],
      });

      const resultApplyAction = applyApproval?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
      if (!resultApplyAction) throw new Error("Missing result.apply action.");
      const applied = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        action: resultApplyAction,
        confirm: true,
      });

      expect(applied.result).toMatchObject({
        result: {
          apply: expect.objectContaining({ status: "applied", committed: false }),
          auditAccepted: expect.objectContaining({ auditId: "run-audit-review" }),
        },
        finalization: expect.objectContaining({ status: "not-archived" }),
      });
      const afterApply = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "result-review-demand" });
      expect(afterApply.center.workpad.resultReview).toMatchObject({ status: "applied-source-dirty" });
      expect(afterApply.center.selectedTopic?.state).toBe("active");
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("prepares a local landing package after apply without committing, pushing, or creating PR controls", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Landing Demand" });
      await writeAcceptedSpecAndTasks("landing-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "landing-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('landing')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "landing-demand");
      await writeValidationResultWithHash("landing-demand", "run-validation-landing", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("landing-demand", "run-audit-landing", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "landing-demand" });
      const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
      if (!applyAction) throw new Error("Missing result.apply action.");
      await executeWorkbenchAction({ project: project(), path: tempDir }, { action: applyAction, confirm: true });
      const statusBeforeLanding = (await execFileAsync("git", ["status", "--short"], { cwd: tempDir })).stdout;

      const afterApply = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "landing-demand" });
      expect(afterApply.right.confirmationQueue.primary).toMatchObject({
        kind: "landing-readiness",
        whyNeedsConfirmation: "本地结果已应用，可以做提交/PR 前检查。",
      });
      expect(afterApply.right.confirmationQueue.primary?.actions[0]).toMatchObject({
        actionType: "landing.prepare",
        worktreeId: worktree.metadata.worktreeId,
      });

      const prepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "landing.prepare",
        changeId: "landing-demand",
        worktreeId: worktree.metadata.worktreeId,
        confirm: true,
      });
      const pkg = (prepared.result as { result: { package: { status: string; review?: { roleId: string; verdict: string }; artifactRefs: string[] } } }).result.package;
      expect(pkg).toMatchObject({
        status: "ready",
        review: expect.objectContaining({ roleId: "merge-reviewer-agent", verdict: "ready" }),
      });
      expect(pkg.artifactRefs).toEqual(expect.arrayContaining([
        expect.stringContaining("landing-package.json"),
        expect.stringContaining("landing-summary.md"),
        expect.stringContaining("source-diff.patch"),
        expect.stringContaining("merge-review.md"),
      ]));
      const statusAfterLanding = (await execFileAsync("git", ["status", "--short"], { cwd: tempDir })).stdout;
      expect(statusAfterLanding).toBe(statusBeforeLanding);

      const reviewedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "landing-demand" });
      expect(reviewedSnapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "pr-draft",
        whyNeedsConfirmation: "远端 PR 能力未配置。",
      });
      expect(reviewedSnapshot.right.confirmationQueue.primary?.actions.some((action) => action.actionType === "pr-draft.create")).toBe(false);
      const prPrepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-draft.prepare",
        changeId: "landing-demand",
        landingPackageId: pkg.id,
        confirm: true,
      });
      const prPkg = (prPrepared.result as { result: { package: { landingPackageId: string; bodyArtifact: string; status: string } } }).result.package;
      expect(prPkg).toMatchObject({
        landingPackageId: pkg.id,
        status: "prepared",
      });
      expect(prPkg.bodyArtifact).toContain("pr-body.md");
      const prCreate = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-draft.create",
        changeId: "landing-demand",
        landingPackageId: pkg.id,
        confirm: true,
      });
      expect(prCreate.result as { status: string; error?: string }).toMatchObject({
        status: "failed",
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("prepares and submits a Draft PR for human review without merging or archiving", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    const oldGhCommand = process.env.AHO_GH_COMMAND;
    const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    const fakeGh = await createFakeGh();
    process.env.AHO_GH_COMMAND = fakeGh.command;
    process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
    try {
      await initGitRepository(tempDir);
      await git(tempDir, ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "PR Review Demand" });
      await writeAcceptedSpecAndTasks("pr-review-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "pr-review-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('review')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "pr-review-demand");
      await writeValidationResultWithHash("pr-review-demand", "run-validation-pr-review", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("pr-review-demand", "run-audit-pr-review", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "pr-review-demand" });
      const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
      if (!applyAction) throw new Error("Missing result.apply action.");
      await executeWorkbenchAction({ project: project(), path: tempDir }, { action: applyAction, confirm: true });
      const landingPrepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "landing.prepare",
        changeId: "pr-review-demand",
        worktreeId: worktree.metadata.worktreeId,
        confirm: true,
      });
      const landingPackage = (landingPrepared.result as { result: { package: { id: string } } }).result.package;
      const prPrepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-draft.prepare",
        changeId: "pr-review-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      const prPackage = (prPrepared.result as { result: { package: { id: string; packageArtifact: string } } }).result.package;
      const prPackagePath = join(memory.workbenchRoot, "pr-drafts", prPackage.id, "pr-draft-package.json");
      const createdPackage = {
        ...JSON.parse(await readFile(prPackagePath, "utf8")),
        status: "created",
        prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
      };
      await writeFile(prPackagePath, JSON.stringify(createdPackage, null, 2), "utf8");

      const preparedReview = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-review.prepare",
        changeId: "pr-review-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      expect(preparedReview.result).toMatchObject({
        result: {
          readiness: expect.objectContaining({
            status: "ready",
            canSubmit: true,
            prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
          }),
        },
      });

      const readySnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "pr-review-demand" });
      expect(readySnapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "pr-review",
        summary: "Draft PR 已准备好提交人工评审。",
      });
      expect(readySnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ actionType: "pr-review.submit", label: "提交人工评审" }),
      ]));

      const submitted = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-review.submit",
        changeId: "pr-review-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      expect(submitted.result).toMatchObject({
        result: {
          readiness: expect.objectContaining({ status: "already-ready", canSubmit: false }),
          handoff: expect.objectContaining({ status: "submitted" }),
        },
      });
      const state = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
      expect(state.isDraft).toBe(false);
      const afterSubmit = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "pr-review-demand" });
      expect(afterSubmit.center.selectedTopic?.state).toBe("active");
      expect(afterSubmit.right.confirmationQueue.primary?.actions.some((action) => action.actionType === "pr-review.submit")).toBe(false);
      expect(afterSubmit.right.confirmationQueue.primary?.actions.some((action) => action.actionType === "pr-review.feedback-refresh")).toBe(true);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
      if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
      else process.env.AHO_GH_COMMAND = oldGhCommand;
      if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
      else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
    }
  });

  it("prepares and performs a user-confirmed remote PR merge with merged closeout", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    const oldGhCommand = process.env.AHO_GH_COMMAND;
    const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    const fakeGh = await createFakeGh({ isDraft: false });
    process.env.AHO_GH_COMMAND = fakeGh.command;
    process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
    try {
      await initGitRepository(tempDir);
      await git(tempDir, ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Remote Landing Demand" });
      await writeAcceptedSpecAndTasks("remote-landing-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "remote-landing-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('landing')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "remote-landing-demand");
      await writeValidationResultWithHash("remote-landing-demand", "run-validation-remote-landing", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("remote-landing-demand", "run-audit-remote-landing", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "remote-landing-demand" });
      const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
      if (!applyAction) throw new Error("Missing result.apply action.");
      await executeWorkbenchAction({ project: project(), path: tempDir }, { action: applyAction, confirm: true });
      await recordDemandMemoryCloseout(memory, {
        changeId: "remote-landing-demand",
        title: "Remote landing demand applied locally",
        terminalKind: "applied",
        finalResult: "Local apply completed before remote landing.",
        userDecision: "applied",
      });
      const landingPrepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "landing.prepare",
        changeId: "remote-landing-demand",
        worktreeId: worktree.metadata.worktreeId,
        confirm: true,
      });
      const landingPackage = (landingPrepared.result as { result: { package: { id: string } } }).result.package;
      const prPrepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-draft.prepare",
        changeId: "remote-landing-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      const prPackage = (prPrepared.result as { result: { package: { id: string } } }).result.package;
      const prPackagePath = join(memory.workbenchRoot, "pr-drafts", prPackage.id, "pr-draft-package.json");
      await writeFile(prPackagePath, JSON.stringify({
        ...JSON.parse(await readFile(prPackagePath, "utf8")),
        status: "created",
        prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
      }, null, 2), "utf8");

      const readiness = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "remote-landing.prepare",
        changeId: "remote-landing-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      expect(readiness.result).toMatchObject({
        result: {
          readiness: expect.objectContaining({
            status: "ready",
            canMerge: true,
            prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
          }),
        },
      });
      const readySnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "remote-landing-demand" });
      expect(readySnapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "remote-landing",
        summary: "PR 已满足远端合并条件。",
      });
      expect(readySnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ actionType: "remote-landing.merge", label: "合并 PR" }),
      ]));

      const merged = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "remote-landing.merge",
        changeId: "remote-landing-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      expect(merged.result).toMatchObject({
        result: {
          result: expect.objectContaining({
            status: "merged",
            mergeMethod: "squash",
          }),
        },
      });
      const ghState = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
      expect(ghState.merged).toBe(true);
      const closeouts = await listDemandMemoryCloseouts(memory);
      expect(closeouts).toEqual(expect.arrayContaining([
        expect.objectContaining({ changeId: "remote-landing-demand", terminalKind: "applied" }),
        expect.objectContaining({ changeId: "remote-landing-demand", terminalKind: "merged" }),
      ]));
      const mergedResult = (merged.result as { result: { result: { id: string } } }).result.result;
      const postMergeSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "remote-landing-demand" });
      expect(postMergeSnapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "post-merge",
        summary: "PR 已远端合并，可以检查本地项目和远端分支收尾状态。",
      });
      const postMerge = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "post-merge.prepare",
        changeId: "remote-landing-demand",
        landingPackageId: landingPackage.id,
        remoteLandingResultId: mergedResult.id,
        confirm: true,
      });
      expect(postMerge.result).toMatchObject({
        result: {
          handoff: expect.objectContaining({
            status: "merged",
            localSyncReadiness: expect.objectContaining({
              canSync: false,
            }),
          }),
        },
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
      if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
      else process.env.AHO_GH_COMMAND = oldGhCommand;
      if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
      else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
    }
  });

  it("builds a landing queue from explicit PR targets and merges only one refreshed PR", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    const oldGhCommand = process.env.AHO_GH_COMMAND;
    const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    const fakeGh = await createFakeGh({ isDraft: false });
    process.env.AHO_GH_COMMAND = fakeGh.command;
    process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
    try {
      await initGitRepository(tempDir);
      await git(tempDir, ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      const memory = await resolveProjectMemory(project());
      await mkdir(join(memory.workbenchRoot, "landing", "landing-a"), { recursive: true });
      await mkdir(join(memory.workbenchRoot, "landing", "landing-b"), { recursive: true });
      const landingBase = {
        version: "1.0",
        projectId: memory.projectId,
        status: "ready",
        sourceHead: "head",
        sourceDiffHash: "diff",
        sourceDiffStat: " package.json | 1 +",
        changedFiles: ["package.json"],
        attributable: true,
        unattributedFiles: [],
        summary: "Landing package ready.",
        riskSummary: "Reviewed local landing evidence.",
        artifactRefs: ["project://.agent-harness/workbench/landing/landing-summary.md"],
        createdAt: "2026-05-30T00:00:00.000Z",
        reviewedAt: "2026-05-30T00:00:00.000Z",
        review: {
          version: "1.0",
          roleId: "merge-reviewer-agent",
          verdict: "ready",
          summary: "Ready.",
          riskSummary: "No blocker.",
          evidenceRefs: [],
          missingChecks: [],
          suggestedNextAction: "Remote landing.",
          createdAt: "2026-05-30T00:00:00.000Z",
        },
      };
      await writeFile(join(memory.workbenchRoot, "landing", "landing-a", "landing-package.json"), JSON.stringify({
        ...landingBase,
        id: "landing-a",
        target: { kind: "worktree", changeIds: ["demand-a"], worktreeIds: ["worktree-a"], applyRunId: "apply-a", expectedDiffHash: "diff", evidenceRefs: [] },
        review: { ...landingBase.review, packageId: "landing-a" },
      }, null, 2), "utf8");
      await writeFile(join(memory.workbenchRoot, "landing", "landing-b", "landing-package.json"), JSON.stringify({
        ...landingBase,
        id: "landing-b",
        target: { kind: "worktree", changeIds: ["demand-b"], worktreeIds: ["worktree-b"], applyRunId: "apply-b", expectedDiffHash: "diff", evidenceRefs: [] },
        createdAt: "2026-05-30T00:01:00.000Z",
        reviewedAt: "2026-05-30T00:01:00.000Z",
        review: { ...landingBase.review, packageId: "landing-b", createdAt: "2026-05-30T00:01:00.000Z" },
      }, null, 2), "utf8");
      await mkdir(join(memory.workbenchRoot, "pr-drafts", "pr-draft-a"), { recursive: true });
      await mkdir(join(memory.workbenchRoot, "pr-drafts", "pr-draft-b"), { recursive: true });
      const draftBase = {
        version: "1.0",
        projectId: memory.projectId,
        provider: "github-cli",
        status: "created",
        title: "AHO test",
        bodyArtifact: "project://.agent-harness/workbench/pr-drafts/body.md",
        packageArtifact: "project://.agent-harness/workbench/pr-drafts/package.json",
        remoteName: "origin",
        remoteUrl: "https://github.com/qinghui316/private-acceptance.git",
        baseBranch: "main",
        branchName: "aho/test",
        landingEvidenceRefs: [],
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      };
      await writeFile(join(memory.workbenchRoot, "pr-drafts", "pr-draft-a", "pr-draft-package.json"), JSON.stringify({
        ...draftBase,
        id: "pr-draft-a",
        landingPackageId: "landing-a",
        prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
      }, null, 2), "utf8");
      await writeFile(join(memory.workbenchRoot, "pr-drafts", "pr-draft-b", "pr-draft-package.json"), JSON.stringify({
        ...draftBase,
        id: "pr-draft-b",
        landingPackageId: "landing-b",
        prUrl: "https://github.com/qinghui316/private-acceptance/pull/2",
        branchName: "aho/test-b",
        updatedAt: "2026-05-30T00:01:00.000Z",
      }, null, 2), "utf8");

      const queue = await prepareLandingQueue(project());
      expect(queue.readyCount).toBe(2);
      expect(queue.candidates.map((candidate) => candidate.landingPackageId)).toEqual(["landing-a", "landing-b"]);
      expect(queue.candidates.every((candidate) => candidate.canMerge)).toBe(true);

      const merged = await mergeNextLandingQueueCandidate(project(), "landing-a");
      expect(merged.result).toMatchObject({
        status: "merged",
        landingPackageId: "landing-a",
      });
      expect(merged.after).toBeTruthy();
      const ghState = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
      expect(ghState.mergeCount).toBe(1);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
      if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
      else process.env.AHO_GH_COMMAND = oldGhCommand;
      if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
      else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
    }
  });

  it("allows post-merge fast-forward sync and remote branch cleanup only from explicit merged evidence", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    const oldGhCommand = process.env.AHO_GH_COMMAND;
    const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    const fakeGh = await createFakeGh({ isDraft: false });
    const ghState = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
    ghState.merged = true;
    await writeFile(fakeGh.stateFile, JSON.stringify(ghState), "utf8");
    process.env.AHO_GH_COMMAND = fakeGh.command;
    process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
    try {
      await initGitRepository(tempDir);
      await git(tempDir, ["branch", "-M", "main"]);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n.tmp-origin.git/\n.tmp-updater/\n", "utf8");
      await writeFile(join(tempDir, "README.md"), "initial\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      const originDir = join(tempDir, ".tmp-origin.git");
      await git(tempDir, ["init", "--bare", originDir]);
      await git(tempDir, ["remote", "add", "origin", originDir]);
      await git(tempDir, ["push", "-u", "origin", "HEAD:main"]);
      await git(tempDir, ["branch", "aho/test"]);
      await git(tempDir, ["push", "origin", "aho/test"]);
      const updaterDir = join(tempDir, ".tmp-updater");
      await execFileAsync("git", ["clone", originDir, updaterDir]);
      await git(updaterDir, ["checkout", "main"]);
      await git(updaterDir, ["config", "user.email", "test@example.com"]);
      await git(updaterDir, ["config", "user.name", "Test User"]);
      await writeFile(join(updaterDir, "README.md"), "initial\nmerged remotely\n", "utf8");
      await git(updaterDir, ["add", "README.md"]);
      await git(updaterDir, ["commit", "-m", "simulate remote merge"]);
      await git(updaterDir, ["push", "origin", "main"]);
      await initHarness(project());
      const memory = await resolveProjectMemory(project());
      const now = new Date().toISOString();
      const landingId = "landing-post-merge-test";
      const prDraftId = "pr-draft-post-merge-test";
      const remoteLandingResultId = "remote-landing-result-post-merge-test";
      await mkdir(join(memory.workbenchRoot, "landing", landingId), { recursive: true });
      await writeFile(join(memory.workbenchRoot, "landing", landingId, "landing-package.json"), JSON.stringify({
        version: "1.0",
        id: landingId,
        projectId: memory.projectId,
        target: { kind: "worktree", changeIds: ["post-merge-demand"], worktreeIds: ["worktree-post-merge"], expectedDiffHash: "diff", evidenceRefs: [] },
        status: "ready",
        sourceHead: null,
        sourceDiffHash: "diff",
        sourceDiffStat: "README.md | 1 +",
        changedFiles: ["README.md"],
        attributable: true,
        unattributedFiles: [],
        summary: "Post-merge landing package.",
        riskSummary: "Test package.",
        artifactRefs: [],
        createdAt: now,
        reviewedAt: now,
        review: {
          version: "1.0",
          packageId: landingId,
          roleId: "merge-reviewer-agent",
          verdict: "ready",
          summary: "Ready.",
          riskSummary: "Low.",
          evidenceRefs: [],
          missingChecks: [],
          suggestedNextAction: "Prepare PR.",
          createdAt: now,
        },
      }, null, 2), "utf8");
      await mkdir(join(memory.workbenchRoot, "pr-drafts", prDraftId), { recursive: true });
      await writeFile(join(memory.workbenchRoot, "pr-drafts", prDraftId, "pr-draft-package.json"), JSON.stringify({
        version: "1.0",
        id: prDraftId,
        landingPackageId: landingId,
        projectId: memory.projectId,
        provider: "github-cli",
        status: "created",
        title: "AHO: post-merge-demand",
        bodyArtifact: "project://body.md",
        packageArtifact: "project://pr-draft-package.json",
        remoteName: "origin",
        remoteUrl: originDir,
        baseBranch: "main",
        branchName: "aho/test",
        prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
        landingEvidenceRefs: [],
        createdAt: now,
        updatedAt: now,
      }, null, 2), "utf8");
      await mkdir(join(memory.workbenchRoot, "remote-landing", "remote-landing-attempt-post-merge-test"), { recursive: true });
      await writeFile(join(memory.workbenchRoot, "remote-landing", "remote-landing-attempt-post-merge-test", "remote-landing-result.json"), JSON.stringify({
        version: "1.0",
        id: remoteLandingResultId,
        attemptId: "remote-landing-attempt-post-merge-test",
        readinessId: "remote-landing-ready-post-merge-test",
        prDraftPackageId: prDraftId,
        landingPackageId: landingId,
        projectId: memory.projectId,
        prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
        status: "merged",
        mergeMethod: "squash",
        mergeCommit: "merge-commit-sha",
        mergedAt: now,
        artifactRefs: [],
        createdAt: now,
      }, null, 2), "utf8");

      const handoff = await preparePostMergeHandoff(project(), landingId, remoteLandingResultId);
      expect(handoff.localSyncReadiness).toMatchObject({ status: "ready", canSync: true });
      expect(handoff.remoteBranchCleanupReadiness).toMatchObject({ status: "ready", canCleanup: true, headBranch: "aho/test" });
      const sync = await syncLocalAfterMerge(project(), landingId, remoteLandingResultId);
      expect(sync.result.status).toBe("synced");
      const cleanup = await cleanupRemoteBranchAfterMerge(project(), landingId, remoteLandingResultId);
      expect(cleanup.result.status).toBe("deleted");
      const remoteBranch = await execFileAsync("git", ["ls-remote", "--heads", "origin", "aho/test"], { cwd: tempDir });
      expect(remoteBranch.stdout.trim()).toBe("");
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
      if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
      else process.env.AHO_GH_COMMAND = oldGhCommand;
      if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
      else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
    }
  });

  it("captures inline PR review feedback and routes replies through explicit review actions", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    const oldGhCommand = process.env.AHO_GH_COMMAND;
    const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    const fakeGh = await createFakeGh({
      isDraft: false,
      inlineComments: [
        { id: 101, body: "Please fix the missing threshold edge case.", path: "src/pricing.ts", line: 12, html_url: "https://github.com/qinghui316/private-acceptance/pull/1#discussion_r101" },
      ],
      canResolveThreads: true,
    });
    process.env.AHO_GH_COMMAND = fakeGh.command;
    process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
    try {
      await initGitRepository(tempDir);
      await git(tempDir, ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "PR Feedback Demand" });
      await writeAcceptedSpecAndTasks("pr-feedback-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "pr-feedback-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('feedback')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "pr-feedback-demand");
      await writeValidationResultWithHash("pr-feedback-demand", "run-validation-pr-feedback", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("pr-feedback-demand", "run-audit-pr-feedback", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "pr-feedback-demand" });
      const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
      if (!applyAction) throw new Error("Missing result.apply action.");
      await executeWorkbenchAction({ project: project(), path: tempDir }, { action: applyAction, confirm: true });
      const landingPrepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "landing.prepare",
        changeId: "pr-feedback-demand",
        worktreeId: worktree.metadata.worktreeId,
        confirm: true,
      });
      const landingPackage = (landingPrepared.result as { result: { package: { id: string } } }).result.package;
      const prPrepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-draft.prepare",
        changeId: "pr-feedback-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      const prPackage = (prPrepared.result as { result: { package: { id: string } } }).result.package;
      const prPackagePath = join(memory.workbenchRoot, "pr-drafts", prPackage.id, "pr-draft-package.json");
      await writeFile(prPackagePath, JSON.stringify({
        ...JSON.parse(await readFile(prPackagePath, "utf8")),
        status: "created",
        prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
      }, null, 2), "utf8");

      const feedback = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-review.feedback-refresh",
        changeId: "pr-feedback-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      expect(feedback.result).toMatchObject({
        result: {
          summary: expect.objectContaining({
            classification: "inline-comments-actionable",
            actionable: true,
            inlineCommentsCount: 1,
          }),
        },
      });
      await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-review.refresh",
        changeId: "pr-feedback-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-review.reply-prepare",
        changeId: "pr-feedback-demand",
        landingPackageId: landingPackage.id,
        prompt: "这个评论请解释原因后回复",
        confirm: true,
      });
      expect(draft.result).toMatchObject({
        result: {
          draft: expect.objectContaining({
            targetKind: "review-thread",
            canResolveThread: true,
            status: "draft",
          }),
        },
      });
      const replySnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "pr-feedback-demand" });
      expect(replySnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ actionType: "pr-review.reply-submit", label: "回复评审" }),
        expect.objectContaining({ actionType: "pr-review.thread-resolve", label: "标记已处理" }),
      ]));
      await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-review.reply-submit",
        changeId: "pr-feedback-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "pr-review.thread-resolve",
        changeId: "pr-feedback-demand",
        landingPackageId: landingPackage.id,
        confirm: true,
      });
      const state = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
      expect(state.replies).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "inline", commentId: "101" })]));
      expect(state.resolvedThreads).toEqual(expect.arrayContaining(["thread-1"]));
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
      if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
      else process.env.AHO_GH_COMMAND = oldGhCommand;
      if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
      else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
    }
  });

  it("scopes result review apply decisions to the selected demand worktree", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange("demand-a", "Demand A");
      await writeRawActiveChange("demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('b')\\\"\"}}\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "demand-b" });
      const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;

      expect(snapshot.center.selectedTopic?.id).toBe("demand-b");
      expect(snapshot.center.workpad.resultReview).toMatchObject({
        status: "ready-to-apply",
        worktreeId: worktreeB.metadata.worktreeId,
        applyReadiness: expect.objectContaining({ kind: "ready" }),
      });
      expect(applyAction).toMatchObject({
        actionId: "result.apply",
        args: ["apply", "", "demand-b", worktreeB.metadata.worktreeId],
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("projects multiple ready results into a confirmation queue integration check", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await writeFile(join(tempDir, "pricing.ts"), "export const base = 1;\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange("demand-a", "Demand A");
      await writeRawActiveChange("demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved-with-notes");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "demand-a" });
      expect(snapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "integration-check",
        whyNeedsConfirmation: "多个结果都已准备好应用。",
      });
      expect(snapshot.right.confirmationQueue.primary?.actions[0]).toMatchObject({
        actionType: "apply-check.run",
        worktreeIds: expect.arrayContaining([worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId]),
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("runs an integration check in a temporary worktree without changing source root", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange("demand-a", "Demand A");
      await writeRawActiveChange("demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved-with-notes");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      const checked = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "apply-check.run",
        changeId: "demand-a",
        worktreeIds: [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId],
        confirm: true,
      });
      expect(checked.result).toMatchObject({
        result: {
          check: expect.objectContaining({ status: "passed" }),
        },
      });
      expect(existsSync(join(tempDir, "a.txt"))).toBe(false);
      expect(existsSync(join(tempDir, "b.txt"))).toBe(false);

      const after = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "demand-a" });
      expect(after.right.confirmationQueue.primary).toMatchObject({
        kind: "integration-apply",
        whyNeedsConfirmation: "兼容性检查已通过，是否应用这些结果需要你确认。",
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("runs integration fix on aggregate validation failure and applies repaired artifact only after confirmation", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange("demand-a", "Demand A");
      await writeRawActiveChange("demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved-with-notes");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "integration-validation-fail.txt"), "temporary aggregate failure marker\n", "utf8");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      const checked = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        actionType: "apply-check.run",
        changeId: "demand-a",
        worktreeIds: [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId],
        confirm: true,
      });
      const check = (checked.result as { result: { check: { id: string; status: string; latestArtifactRef?: string; aggregateValidation?: { status: string }; aggregateAudit?: { status: string }; fixAttempts?: Array<{ status: string }> } } }).result.check;
      expect(check).toMatchObject({
        status: "passed",
        latestArtifactRef: expect.stringContaining("repaired.patch"),
        aggregateValidation: expect.objectContaining({ status: "passed" }),
        aggregateAudit: expect.objectContaining({ status: "approved" }),
      });
      expect(check.fixAttempts?.[0]).toMatchObject({ status: "completed" });
      expect(existsSync(join(tempDir, "a.txt"))).toBe(false);
      expect(existsSync(join(tempDir, "b.txt"))).toBe(false);
      expect(existsSync(join(tempDir, "integration-validation-fail.txt"))).toBe(false);

      await executeWorkbenchAction({ project: project(), path: tempDir }, {
        action: {
          actionId: "apply-check.apply",
          command: "apply-check",
          args: ["apply", check.id],
          label: "确认应用到项目",
          mutates: true,
          requiresConfirmation: true,
        },
        confirm: true,
      });
      expect(existsSync(join(tempDir, "a.txt"))).toBe(true);
      expect(existsSync(join(tempDir, "b.txt"))).toBe(true);
      expect(existsSync(join(tempDir, "integration-validation-fail.txt"))).toBe(false);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("classifies source drift as same-demand refresh rework instead of apply", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Source Drift Demand" });
      await writeAcceptedSpecAndTasks("source-drift-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "source-drift-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('drift')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "source-drift-demand");
      await writeValidationResultWithHash("source-drift-demand", "run-validation-drift", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("source-drift-demand", "run-audit-drift", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");
      await writeFile(join(tempDir, "README.md"), "Project changed after result review.\n", "utf8");
      await git(tempDir, ["add", "README.md"]);
      await git(tempDir, ["commit", "-m", "source changed"]);

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "source-drift-demand" });
      const primary = snapshot.right.decisionInspector.primary;

      expect(snapshot.center.workpad.resultReview?.applyReadiness).toMatchObject({
        kind: "source-drift",
        message: "项目已变化，需要重新处理这个结果。",
      });
      expect(primary).toMatchObject({
        title: "项目已变化，需要重新处理这个结果。",
        targetId: worktree.metadata.worktreeId,
      });
      expect(primary?.actions.some((action) => action.actionType === "result.refresh-rework")).toBe(true);
      expect(primary?.actions.some((action) => action.action?.actionId === "result.apply")).toBe(false);
      expect(JSON.stringify(snapshot.center.workpad.resultReview)).not.toContain("Source HEAD drifted");
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("classifies dirty source as refresh status without automatic coder rework", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(tempDir, ".aho-home");
    try {
      await initGitRepository(tempDir);
      await writeFile(join(tempDir, ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(tempDir, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(tempDir, ["add", "."]);
      await git(tempDir, ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Dirty Source Demand" });
      await writeAcceptedSpecAndTasks("dirty-source-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "dirty-source-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('dirty')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "dirty-source-demand");
      await writeValidationResultWithHash("dirty-source-demand", "run-validation-dirty", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("dirty-source-demand", "run-audit-dirty", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");
      await writeFile(join(tempDir, "README.md"), "Uncommitted local edit.\n", "utf8");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "dirty-source-demand" });
      const primary = snapshot.right.decisionInspector.primary;

      expect(snapshot.center.workpad.resultReview?.applyReadiness).toMatchObject({
        kind: "dirty-source",
        message: "项目里有未处理的本地改动，暂时不能应用。",
      });
      expect(primary?.actions.some((action) => action.actionType === "result.refresh-status")).toBe(true);
      expect(primary?.actions.some((action) => action.actionType === "result.refresh-rework")).toBe(false);
      expect(primary?.actions.some((action) => action.action?.actionId === "result.apply")).toBe(false);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("creates a linked follow-up demand instead of mutating an archived conversation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archived Demand" });
    await writeFile(join(tempDir, "harness", "changes", "active", "archived-demand", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);

    const result = await postTopicMessage(project(), "archived-demand", "继续修改实现并补测试。");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "archived-demand" });

    expect(result.routingDecision).toBe("new-topic-required");
    expect(result.assistantMessage).toContain("linked follow-up");
    const followUpId = snapshot.center.thread.items.find((item) => item.kind === "assistant-turn" && item.body?.includes("linked follow-up"))?.artifact;
    expect(followUpId).toBeTruthy();
    expect(snapshot.center.workpad.conversationLifecycle).toBe("archived-readonly");
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "继续修改实现并补测试。" }),
    ]));
  });

  it("persists AgentTaskRepository results and projects them into the role pipeline", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Agent Task Demand" });
    const memory = await resolveProjectMemory(project());

    const task = await createAgentTask(memory, {
      conversationId: "agent-task-demand",
      changeId: "agent-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Implement the accepted demand.",
      inputArtifacts: ["harness/changes/active/agent-task-demand/spec.md"],
    });
    await completeAgentTask(memory, task, {
      status: "completed",
      summary: "Coder returned a worktree proposal.",
      artifactRefs: ["runs/run-agent-task/implementation.md"],
      nextRecommendation: "Run validation.",
    });

    const tasks = await listAgentTasks(memory, "agent-task-demand");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "agent-task-demand" });

    expect(tasks).toHaveLength(1);
    expect(snapshot.center.workpad.rolePipeline?.agentTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: task.id,
        roleId: "coder-agent",
        status: "completed",
        resultSummary: "Coder returned a worktree proposal.",
        evidenceRefs: ["runs/run-agent-task/implementation.md"],
      }),
    ]));
    expect(snapshot.center.parentAgentTranscript.cells).toHaveLength(0);
    expect(snapshot.center.agentRunGraph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "main-agent",
        kind: "main-agent",
        status: "idle",
      }),
      expect.objectContaining({
        kind: "coder-agent",
        roleId: "coder-agent",
        status: "completed",
        outputSummary: "Coder returned a worktree proposal.",
        evidenceRefs: expect.arrayContaining([
          expect.objectContaining({ ref: "runs/run-agent-task/implementation.md", kind: "artifact" }),
        ]),
      }),
    ]));
    const coderNode = snapshot.center.agentRunGraph.nodes.find((node) => node.kind === "coder-agent");
    expect(coderNode?.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: task.id,
        status: "completed",
        summary: "Coder returned a worktree proposal.",
      }),
    ]));
    expect(snapshot.center.agentRunGraph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "main-agent",
        to: coderNode?.id,
        kind: "delegates",
      }),
      expect.objectContaining({
        from: coderNode?.id,
        to: "main-agent",
        kind: "returns",
      }),
    ]));
  });

  it("validates delegateTask policy and records queued to running AgentTask lifecycle", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Delegate Task Demand" });
    const memory = await resolveProjectMemory(project());
    const manifest = buildDelegateTaskManifest();

    expect(manifest.allowedRoles.map((role) => role.roleId)).toEqual(expect.arrayContaining(["coder-agent", "validator", "auditor-agent", "rework-coder"]));
    const accepted = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement the confirmed demand in an AHO-owned worktree.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
    });
    expect(accepted.ok).toBe(true);
    const forbidden = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Apply this result and merge the PR.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
    });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.readableMessage).toContain("用户确认");

    const dispatched = await dispatchForegroundRoleTask(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement via delegated task.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
      delegationMode: "orchestrator-policy",
    });
    expect(dispatched.task.status).toBe("running");
    expect(dispatched.task.startedAt).toBeTruthy();
    expect(dispatched.policyAuditRef).toContain("tool-events.jsonl");
    const tasks = await listAgentTasks(memory, "delegate-task-demand");
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: dispatched.task.id, roleId: "coder-agent", status: "running" }),
    ]));
  });

  it("enforces worker permission boundaries for delegation and high-impact actions", () => {
    expect(workerPermissionProfileForRole("main-agent").mayDelegate).toBe(true);
    expect(workerPermissionProfileForRole("coder-agent").mayDelegate).toBe(false);

    const workerDelegation = evaluateToolPolicy({
      actionType: "delegateTask",
      actorRoleId: "coder-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(workerDelegation.status).toBe("denied");
    expect(workerDelegation.readableMessage).toContain("不能继续委派");

    const roleMerge = evaluateToolPolicy({
      actionType: "remote-landing.merge",
      actorRoleId: "auditor-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(roleMerge.status).toBe("denied");

    const mainApply = evaluateToolPolicy({
      actionType: "remote-landing.merge",
      actorRoleId: "main-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(mainApply.status).toBe("needs-user-confirmation");
  });

  it("detects post-run boundary violations for source writes and read-only role writes", () => {
    const coderViolations = findBoundaryViolations(workerPermissionProfileForRole("coder-agent"), {
      sourceChanged: true,
      changedPaths: ["src/pricing.ts", ".env"],
      artifactRefs: ["runs/run-1/implementation.md"],
    });
    expect(coderViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "source-root-modified" }),
      expect.objectContaining({ kind: "denied-path", path: ".env" }),
    ]));

    const validatorViolations = findBoundaryViolations(workerPermissionProfileForRole("validator"), {
      changedPaths: ["src/pricing.ts"],
      artifactRefs: ["validation/run-1/validation.json"],
    });
    expect(validatorViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "readonly-role-write", path: "src/pricing.ts" }),
    ]));

    const scopedViolations = findBoundaryViolations(workerPermissionProfileForRole("auditor-agent"), {
      artifactRefs: ["C:/outside/audit.json", "../other-change/audit.json"],
    });
    expect(scopedViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "cross-demand-artifact" }),
    ]));
  });

  it("routes planning confirmation through a demand worker queue when no worker slot is available", async () => {
    await initHarness(project());
    const active = await createWorkbenchTopic(project(), { title: "Queued Demand", body: "Implement later." });
    const running = await createWorkbenchTopic(project(), { title: "Running Demand", body: "Already running." });
    const runningTwo = await createWorkbenchTopic(project(), { title: "Running Demand 2", body: "Already running too." });
    await writePlanningBundleFixture(active.changeId);
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: running.changeId });
    const claimed = await claimNextDemandWorker(memory, { changeId: running.changeId });
    if (!claimed) throw new Error("Expected running demand to be claimed.");
    await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
    await enqueueDemandWorker(memory, { changeId: runningTwo.changeId });
    const claimedTwo = await claimNextDemandWorker(memory, { changeId: runningTwo.changeId });
    if (!claimedTwo) throw new Error("Expected second running demand to be claimed.");
    await markDemandWorkerRunning(memory, claimedTwo.worker, claimedTwo.attempt);

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: active.changeId,
      confirm: true,
    });

    expect(result.result).toMatchObject({ status: "completed", result: expect.objectContaining({ status: "queued" }) });
    expect(existsSync(join(tempDir, "harness", "changes", "active", active.changeId, "spec.md"))).toBe(true);
    expect(existsSync(join(tempDir, "harness", "changes", "active", active.changeId, "ac-map.json"))).toBe(true);
    const workers = await listDemandWorkers(memory);
    expect(workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: running.changeId, status: "running" }),
      expect.objectContaining({ changeId: runningTwo.changeId, status: "running" }),
      expect.objectContaining({ changeId: active.changeId, status: "queued" }),
    ]));
    const tasks = await listAgentTasks(memory, active.changeId);
    expect(tasks).toHaveLength(0);
  });

  it("does not wait on background demand workers when the current demand remains queued", async () => {
    await initHarness(project());
    const older = await createWorkbenchTopic(project(), { title: "Older Demand", body: "Run first." });
    const olderTwo = await createWorkbenchTopic(project(), { title: "Older Demand 2", body: "Run second." });
    const active = await createWorkbenchTopic(project(), { title: "Current Demand", body: "Run after earlier demands." });
    await writePlanningBundleFixture(active.changeId);
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: older.changeId });
    await enqueueDemandWorker(memory, { changeId: olderTwo.changeId });

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: active.changeId,
      confirm: true,
      prompt: "current-demand-prompt",
    });

    expect(result.result).toMatchObject({
      status: "completed",
      result: expect.objectContaining({
        status: "queued",
        claimed: 2,
        backgroundStarted: 2,
        worker: expect.objectContaining({ changeId: active.changeId, status: "queued" }),
      }),
    });
  });

  it("claims one demand at a time when configured for sequential execution", async () => {
    await initHarness(project());
    const first = await createWorkbenchTopic(project(), { title: "First Demand", body: "A" });
    const second = await createWorkbenchTopic(project(), { title: "Second Demand", body: "B" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: first.changeId });
    await enqueueDemandWorker(memory, { changeId: second.changeId });

    const claimed = await claimNextDemandWorker(memory, { maxConcurrentDemands: 1 });
    if (!claimed) throw new Error("Expected first queued demand to be claimed.");
    await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
    const blockedBySlot = await claimNextDemandWorker(memory, { maxConcurrentDemands: 1 });

    expect(blockedBySlot).toBeNull();
    const attempts = await listDemandWorkerAttempts(memory, first.changeId);
    expect(attempts).toHaveLength(1);
    const workers = await listDemandWorkers(memory);
    expect(workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: first.changeId, status: "running" }),
      expect.objectContaining({ changeId: second.changeId, status: "queued" }),
    ]));
  });

  it("claims available demand workers up to the default bounded worker slots", async () => {
    await initHarness(project());
    const first = await createWorkbenchTopic(project(), { title: "First Demand", body: "A" });
    const second = await createWorkbenchTopic(project(), { title: "Second Demand", body: "B" });
    const third = await createWorkbenchTopic(project(), { title: "Third Demand", body: "C" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: first.changeId });
    await enqueueDemandWorker(memory, { changeId: second.changeId });
    await enqueueDemandWorker(memory, { changeId: third.changeId });

    const claimed = await claimAvailableDemandWorkers(memory);
    for (const claim of claimed) {
      await markDemandWorkerRunning(memory, claim.worker, claim.attempt);
    }

    expect(claimed.map((claim) => claim.worker.changeId)).toEqual([first.changeId, second.changeId]);
    const workers = await listDemandWorkers(memory);
    expect(workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: first.changeId, status: "running" }),
      expect.objectContaining({ changeId: second.changeId, status: "running" }),
      expect.objectContaining({ changeId: third.changeId, status: "queued" }),
    ]));
  });

  it("projects demand worker state into conversation summaries without task-level queue coupling", async () => {
    await initHarness(project());
    const running = await createWorkbenchTopic(project(), { title: "Running Demand", body: "A" });
    const queued = await createWorkbenchTopic(project(), { title: "Queued Demand", body: "B" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: running.changeId });
    const claimed = await claimNextDemandWorker(memory, { changeId: running.changeId });
    if (!claimed) throw new Error("Expected worker to be claimed.");
    await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
    await enqueueDemandWorker(memory, { changeId: queued.changeId, waitingReason: "等待本地处理槽位。" });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: running.changeId });

    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: running.changeId, userStatusLabel: "处理中" }),
      expect.objectContaining({ id: queued.changeId, userStatusLabel: "稍后处理" }),
    ]));
    expect(snapshot.center.workpad.background).toMatchObject({ queuedCount: 1 });
    expect(snapshot.center.workpad.background.items[0]).toMatchObject({ id: queued.changeId, userStatusLabel: "稍后处理" });
  });

  it("records MainOrchestrator decisions for demand enqueue and claim", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Decision Demand", body: "A" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: topic.changeId });
    const claimed = await claimNextDemandWorker(memory, { changeId: topic.changeId });
    expect(claimed).toBeTruthy();

    const decisions = await listMainOrchestratorDecisions(memory);
    expect(decisions.map((decision) => decision.action)).toEqual(expect.arrayContaining(["enqueue", "coding"]));
    expect(decisions.every((decision) => decision.changeId === topic.changeId)).toBe(true);
  });

  it("records background maintenance ledger entries and creates human-gated candidate reviews", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    await recordMaintenanceLedgerEntry(memory, {
      eventType: "apply",
      changeId: "maintenance-demand",
      summary: "Applied demand created reusable documentation evidence.",
      artifactRefs: ["harness/changes/archive/maintenance/summary.md"],
    });
    const result = await runMaintenanceCandidatePipeline(memory);
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir });

    expect(result.status).toBe("reviewed");
    expect(result.candidate).toMatchObject({
      status: "candidate",
      sourceLedgerEntryIds: expect.any(Array),
      subtype: expect.any(String),
      fingerprint: expect.any(String),
    });
    expect(result.score).toMatchObject({ confidence: expect.any(String), dimensions: expect.any(Object) });
    expect(result.review).toMatchObject({ recommendation: expect.stringMatching(/accept|defer|reject|needs-human-review/) });
    expect(snapshot.center.workpad.maintenance).toMatchObject({
      ledgerCount: 1,
      latest: expect.objectContaining({ eventType: "apply" }),
    });
  });

  it("records terminal demand closeouts, runs five-change maintenance review, and keeps maintenance out of confirmation queue", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    for (let index = 1; index <= 4; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `closeout-${index}`,
        title: `Demand ${index}`,
        terminalKind: "archived",
        finalResult: `Demand ${index} completed.`,
        userDecision: "archived",
        evidenceRefs: [`harness/changes/archive/closeout-${index}/summary.md`],
        reusableLessonCandidates: [{ summary: "Keep validation evidence linked.", evidenceRefs: [`evidence-${index}.md`] }],
        docsDriftCandidates: [{ document: "docs/STATUS.md", summary: "Status handoff needs a refresh.", evidenceRefs: [`status-${index}.md`] }],
      });
    }

    expect(await maybeRunMaintenanceReviewWindow(memory)).toMatchObject({ status: "skipped" });

    await recordDemandMemoryCloseout(memory, {
      changeId: "closeout-5",
      title: "Demand 5",
      terminalKind: "applied",
      finalResult: "Demand 5 applied.",
      userDecision: "applied",
      changedFiles: ["src/pricing.ts"],
      evidenceRefs: ["harness/changes/archive/closeout-5/summary.md"],
      reusableLessonCandidates: [{ summary: "Keep source apply decisions scoped to explicit result targets." }],
      docsDriftCandidates: [{ document: "docs/MEMORY.md", summary: "Memory tier rules need update." }],
    });
    await recordDemandMemoryCloseout(memory, {
      changeId: "closeout-5",
      title: "Demand 5 duplicate applied event",
      terminalKind: "applied",
      finalResult: "Duplicate terminal event should not create a second closeout.",
      userDecision: "applied",
    });

    const closeouts = await listDemandMemoryCloseouts(memory);
    const watermark = await readMaintenanceReviewWatermark(memory);
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir });

    expect(closeouts).toHaveLength(5);
    expect(watermark?.lastReviewedChangeIds).toEqual(["closeout-1:archived", "closeout-2:archived", "closeout-3:archived", "closeout-4:archived", "closeout-5:applied"]);
    expect(watermark?.lastReviewWindowId).toMatch(/^maintenance-review-/);
    expect(snapshot.center.workpad.maintenance).toMatchObject({
      closeoutCount: 5,
      status: "reviewed",
      unreviewedTerminalCount: 0,
      latestReviewWindowId: watermark?.lastReviewWindowId,
    });
    expect(snapshot.right.confirmationQueue.maintenance).toEqual([]);

    const coderContext = buildRoleScopedContextProjection({
      roleId: "coder-agent",
      currentDemandRefs: ["change/current/summary.md"],
      stableMemoryRefs: ["project/stable/compact.md"],
      selectedHistoryRefs: ["hot/1.md", "hot/2.md", "hot/3.md", "hot/4.md"],
    });
    const maintenanceContext = buildRoleScopedContextProjection({
      roleId: "memory-maintenance-agent",
      currentDemandRefs: ["change/current/summary.md"],
      stableMemoryRefs: ["project/stable/compact.md"],
      selectedHistoryRefs: ["hot/1.md", "hot/2.md", "hot/3.md", "hot/4.md"],
    });

    expect(coderContext.includesMaintenanceWindow).toBe(false);
    expect(coderContext.excludedSources).toContain("hot/warm/cold maintenance window");
    expect(coderContext.includedSources).not.toContain("hot/4.md");
    expect(maintenanceContext.includesMaintenanceWindow).toBe(true);
    expect(maintenanceContext.allowedMemoryTier).toBe("maintenance-hot-warm-cold");
    expect(maintenanceContext.includedSources).toContain("hot/4.md");
  });
});

async function writeRawActiveChange(changeId: string, title: string): Promise<void> {
  const changeDir = join(tempDir, "harness", "changes", "active", changeId);
  await mkdir(join(changeDir, "reviews"), { recursive: true });
  const now = new Date().toISOString();
  await writeFile(join(changeDir, "change.json"), JSON.stringify({
    version: "1.0",
    id: changeId,
    title,
    state: "active",
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    archivePath: null,
  }, null, 2), "utf8");
  await writeFile(join(changeDir, "summary.md"), `# ${title}\n\n## Status\n\nActive test fixture.\n`, "utf8");
  await writeFile(join(changeDir, "spec.md"), "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Complete one task-scoped change.\n", "utf8");
  await writeFile(join(changeDir, "plan.md"), "# Plan\n\nImplement this accepted task list.\n", "utf8");
  await writeFile(join(changeDir, "tasks.md"), "# Tasks\n\n- [ ] T-001: Implement one task.\n  - Covers: AC-001\n", "utf8");
  await writeFile(join(changeDir, "reviews", "review.md"), "Status: pending\n", "utf8");
}

async function writeAcceptedSpecAndTasks(changeId: string): Promise<void> {
  const changeDir = join(tempDir, "harness", "changes", "active", changeId);
  await writeFile(join(changeDir, "spec.md"), [
    "# Spec",
    "",
    "## Acceptance Criteria",
    "",
    "- AC-001: Complete one task-scoped change.",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(changeDir, "plan.md"), "# Plan\n\nImplement this accepted task list.\n", "utf8");
  await writeFile(join(changeDir, "tasks.md"), [
    "# Tasks",
    "",
    "- [ ] T-001: Implement one task.",
    "  - Covers: AC-001",
    "",
  ].join("\n"), "utf8");
}

async function writeCoderRun(changeId: string, runId: string, taskIds: string[], worktreeId: string, status: RunMetadata["status"], taskRunId?: string): Promise<RunMetadata> {
  const runDir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: tempDir,
    runtime: "coder-codex",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["codex"],
    status,
    exitCode: status === "failed" ? 1 : 0,
    signal: null,
    startedAt: now,
    finishedAt: status === "running" || status === "created" ? null : now,
    artifacts: {
      base: "project-root",
      directory: `.agent-harness/runs/${runId}`,
      context: `.agent-harness/runs/${runId}/context.md`,
      events: `.agent-harness/runs/${runId}/events.jsonl`,
      stdout: `.agent-harness/runs/${runId}/stdout.log`,
      stderr: `.agent-harness/runs/${runId}/stderr.log`,
    },
    worktree: {
      worktreeId,
      branchName: `aho/${runId}`,
      baseRef: "HEAD",
      baseCommit: "abc123",
      checkoutPath: join(tempDir, ".agent-harness", "worktrees", worktreeId),
      metadataPath: `.agent-harness/worktrees/${worktreeId}.json`,
    },
    ...(taskIds.length > 0 ? { taskIds } : {}),
    ...(taskRunId ? { taskRunId } : {}),
  };
  await writeFile(join(runDir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  await writeFile(join(runDir, "events.jsonl"), `${JSON.stringify({ timestamp: now, type: "run.completed", runId })}\n`, "utf8");
  return run;
}

async function writeTaskRunRecord(
  changeId: string,
  taskRunId: string,
  taskId: string,
  status: TaskRun["status"],
  attempt: number,
  overrides: Partial<TaskRun> = {},
): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "task-runs", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const taskRun: TaskRun = {
    version: "1.0",
    id: taskRunId,
    projectId: "test-project",
    changeId,
    taskId,
    roleId: "coder",
    attempt,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: status === "running" || status === "claimed" || status === "queued" ? null : now,
    ...overrides,
  };
  await writeFile(join(dir, `${taskRunId}.json`), JSON.stringify(taskRun, null, 2), "utf8");
}

async function writeWorkerLeaseRecord(changeId: string, leaseId: string, taskRunId: string, taskId: string, status: WorkerLease["status"]): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "worker-leases", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const lease: WorkerLease = {
    version: "1.0",
    id: leaseId,
    projectId: "test-project",
    changeId,
    taskRunId,
    taskId,
    roleId: "coder",
    workerId: "local-test",
    status,
    claimedAt: now,
    updatedAt: now,
    releasedAt: status === "released" ? now : null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  await writeFile(join(dir, `${leaseId}.json`), JSON.stringify(lease, null, 2), "utf8");
}

async function writeTaskQueueRecord(
  changeId: string,
  queueId: string,
  status: TaskQueueRun["status"],
  overrides: Partial<TaskQueueRun> = {},
): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "task-queues", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const queue: TaskQueueRun = {
    version: "1.0",
    id: queueId,
    projectId: "test-project",
    changeId,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: status === "queued" ? null : now,
    finishedAt: status === "completed" || status === "blocked" || status === "failed" ? now : null,
    totalCount: 1,
    completedCount: status === "completed" ? 1 : 0,
    ...overrides,
  };
  await writeFile(join(dir, `${queueId}.json`), JSON.stringify(queue, null, 2), "utf8");
}

async function writeTaskQueueItemRecord(
  changeId: string,
  queueRunId: string,
  itemId: string,
  taskId: string,
  order: number,
  status: TaskQueueItem["status"],
  overrides: Partial<TaskQueueItem> = {},
): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "task-queue-items", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const item: TaskQueueItem = {
    version: "1.0",
    id: itemId,
    projectId: "test-project",
    changeId,
    queueRunId,
    taskId,
    order,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: status === "queued" || status === "skipped" ? null : now,
    finishedAt: status === "completed" || status === "blocked" || status === "failed" || status === "skipped" ? now : null,
    ...overrides,
  };
  await writeFile(join(dir, `${itemId}.json`), JSON.stringify(item, null, 2), "utf8");
}

async function initGitRepository(cwd: string): Promise<void> {
  await git(cwd, ["init"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function writeValidationResultWithHash(changeId: string, runId: string, worktreeId: string, diffHash: string, status: "passed" | "failed"): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const validation = {
    version: "1.0",
    id: runId,
    runId,
    changeId,
    profile: "test",
    status,
    executionMode: "worktree",
    worktreeId,
    worktreeDiffHash: diffHash,
    startedAt: now,
    finishedAt: now,
    commands: [],
  };
  await writeFile(join(dir, "validation.json"), JSON.stringify(validation, null, 2), "utf8");
}

async function writeAuditResultWithHash(changeId: string, runId: string, worktreeId: string, diffHash: string, status: "approved" | "approved-with-notes" | "blocked" | "failed"): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const audit = {
    version: "1.0",
    id: runId,
    runId,
    changeId,
    status,
    worktreeId,
    validationId: "run-validation-review",
    worktreeDiffHash: diffHash,
    startedAt: now,
    finishedAt: now,
    findings: status === "approved-with-notes" ? [{
      severity: "note",
      area: "risk",
      evidence: "unit test fixture",
      recommendation: "review before applying",
      text: "Package script changed; review before applying.",
    }] : [],
    artifacts: {
      audit: `harness/runs/${runId}/audit.json`,
      auditMarkdown: `harness/runs/${runId}/audit.md`,
      lastMessage: `harness/runs/${runId}/last-message.md`,
      diffStat: `harness/runs/${runId}/diff-stat.txt`,
    },
  };
  await writeFile(join(dir, "audit.json"), JSON.stringify(audit, null, 2), "utf8");
  await writeFile(join(dir, "audit.md"), "Status: approved-with-notes\n", "utf8");
  await writeFile(join(dir, "last-message.md"), "Audit approved with notes.\n", "utf8");
  await writeFile(join(dir, "diff-stat.txt"), " package.json | 2 +-\n", "utf8");
}

async function writeValidationResult(changeId: string, validationId: string, worktreeId: string, status: "passed" | "failed"): Promise<void> {
  const runDir = join(tempDir, ".agent-harness", "runs", validationId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  await writeRunMetadata(changeId, validationId, "validator", "completed", worktreeId, now);
  await writeFile(join(runDir, "validation.json"), JSON.stringify({
    version: "1.0",
    id: validationId,
    runId: validationId,
    changeId,
    profile: "default",
    status,
    executionMode: "worktree",
    worktreeId,
    startedAt: now,
    finishedAt: now,
    commands: [],
  }, null, 2), "utf8");
}

async function writeAuditResult(changeId: string, auditId: string, worktreeId: string, status: "approved" | "approved-with-notes" | "blocked" | "failed"): Promise<void> {
  const runDir = join(tempDir, ".agent-harness", "runs", auditId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  await writeRunMetadata(changeId, auditId, "auditor", "completed", worktreeId, now);
  await writeFile(join(runDir, "audit.json"), JSON.stringify({
    version: "1.0",
    id: auditId,
    runId: auditId,
    changeId,
    status,
    worktreeId,
    startedAt: now,
    finishedAt: now,
    findings: [],
    artifacts: {
      audit: `.agent-harness/runs/${auditId}/audit.json`,
      auditMarkdown: `.agent-harness/runs/${auditId}/audit.md`,
      lastMessage: `.agent-harness/runs/${auditId}/last-message.md`,
    },
  }, null, 2), "utf8");
}

async function writeRunMetadata(
  changeId: string,
  runId: string,
  runtime: RunMetadata["runtime"],
  status: RunMetadata["status"],
  worktreeId: string,
  now: string,
): Promise<void> {
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: tempDir,
    runtime,
    executionMode: "worktree",
    command: [runtime],
    status,
    exitCode: status === "failed" ? 1 : 0,
    signal: null,
    startedAt: now,
    finishedAt: now,
    artifacts: {
      base: "project-root",
      directory: `.agent-harness/runs/${runId}`,
      context: `.agent-harness/runs/${runId}/context.md`,
      events: `.agent-harness/runs/${runId}/events.jsonl`,
      stdout: `.agent-harness/runs/${runId}/stdout.log`,
      stderr: `.agent-harness/runs/${runId}/stderr.log`,
    },
    worktree: {
      worktreeId,
      branchName: `aho/${runId}`,
      baseRef: "HEAD",
      baseCommit: "abc123",
      checkoutPath: join(tempDir, ".agent-harness", "worktrees", worktreeId),
      metadataPath: `.agent-harness/worktrees/${worktreeId}.json`,
    },
  };
  await writeFile(join(tempDir, ".agent-harness", "runs", runId, "run.json"), JSON.stringify(run, null, 2), "utf8");
}

async function writeSpecProposalRun(changeId: string): Promise<RunMetadata> {
  const runId = `run-test-${changeId}`;
  const runDir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: tempDir,
    runtime: "spec-agent",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "completed",
    exitCode: 0,
    signal: null,
    startedAt: now,
    finishedAt: now,
    artifacts: {
      base: "project-root",
      directory: `.agent-harness/runs/${runId}`,
      context: `.agent-harness/runs/${runId}/context.md`,
      events: `.agent-harness/runs/${runId}/events.jsonl`,
      stdout: `.agent-harness/runs/${runId}/stdout.log`,
      stderr: `.agent-harness/runs/${runId}/stderr.log`,
      specProposal: `.agent-harness/runs/${runId}/spec-proposal.json`,
      specProposalMarkdown: `.agent-harness/runs/${runId}/spec-proposal.md`,
      lastMessage: `.agent-harness/runs/${runId}/last-message.md`,
    },
  };
  await writeFile(join(runDir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  await writeFile(join(runDir, "events.jsonl"), `${JSON.stringify({ timestamp: now, type: "change.spec.proposal.completed", runId })}\n`, "utf8");
  await writeFile(join(runDir, "spec-proposal.md"), "# Spec Proposal\n", "utf8");
  await writeFile(join(runDir, "last-message.md"), "Status: proposed\n", "utf8");
  await writeFile(join(runDir, "spec-proposal.json"), JSON.stringify({
    version: "1.0",
    id: runId,
    runId,
    changeId,
    status: "proposed",
    startedAt: now,
    finishedAt: now,
    targetHashes: {},
    specMd: "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Example\n",
    openQuestions: [],
    assumptions: [],
    warnings: [],
    artifacts: {
      proposal: `.agent-harness/runs/${runId}/spec-proposal.json`,
      proposalMarkdown: `.agent-harness/runs/${runId}/spec-proposal.md`,
      lastMessage: `.agent-harness/runs/${runId}/last-message.md`,
    },
  }, null, 2), "utf8");
  expect(existsSync(join(runDir, "spec-proposal.json"))).toBe(true);
  expect(await readFile(join(runDir, "events.jsonl"), "utf8")).toContain("change.spec.proposal.completed");
  return run;
}
