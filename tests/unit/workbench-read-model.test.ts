import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createChange, closeChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { startLocalCommandRun } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { appendTopicThreadEntry, createWorkbenchTopic } from "../../src/workbench/chat.js";
import { readTopicThreadLog } from "../../src/workbench/thread-log.js";
import { answerClarification, reanalyzeIntake, runIntakeScan } from "../../src/workbench/intake.js";
import { getWorkbenchSnapshot, getWorkbenchStream, getWorkbenchTopic, listWorkbenchApprovals, listWorkbenchRoles, listWorkbenchTopics } from "../../src/workbench/manager.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { buildDecisionInspector } from "../../src/workbench/projections/read-model/decision-inspector.js";
import { getTempDir, minimalDecompositionPlan, minimalReadiness, project, writeAcceptedSpecAndTasks } from "./workbench/fixtures.js";
import type { RunMetadata } from "../../src/types/index.js";

const FORBIDDEN_CONTROLLED_LOOP_PRIMARY_TERMS = [
  "Goal Loop",
  "Goal loop",
  "GoalLoop",
  "planning.scheduler",
  "SchedulerRun",
  "Harness gate",
  "continuation brief",
  "concrete gate",
  "whole-wave",
  "slot allocator",
  "artifactHash",
  "preflight id",
  "derived-non-executing-workbench-handoff",
];

describe("workbench read-model projections", () => {
  it("lists active and archived changes as topics", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archive Me" });
    await writeFile(join(getTempDir(), "harness", "changes", "active", "archive-me", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(getTempDir());
    await createChange(project(), { title: "Active Topic" });

    const topics = await listWorkbenchTopics({ project: project(), path: getTempDir() });

    expect(topics.map((item) => [item.id, item.state])).toEqual(expect.arrayContaining([
      ["active-topic", "active"],
      ["archive-me", "archive"],
    ]));
  });

  it("builds a snapshot with selected topic, semantic thread, roles, gaps, and close approval", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workbench Smoke" });
    await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('hello')"]);
    await writeFile(join(getTempDir(), "harness", "changes", "active", "workbench-smoke", "reviews", "review.md"), "Status: approved\n", "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });

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

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.id });
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
    await writeFile(join(getTempDir(), "harness", "changes", "active", topic.changeId, "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(getTempDir());

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });

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
    await writeFile(join(getTempDir(), ".agent-harness", "runs", run.run.id, "validation.json"), JSON.stringify({
      version: "1.0",
      id: run.run.id,
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
        cwd: getTempDir(),
        status: "passed",
        exitCode: 0,
        signal: null,
        startedAt: run.run.startedAt,
        finishedAt: run.run.finishedAt ?? run.run.startedAt,
        stdout: "ok",
        stderr: "",
      }],
    }, null, 2), "utf8");
    await writeFile(join(getTempDir(), ".agent-harness", "runs", run.run.id, "audit.json"), JSON.stringify({
      version: "1.0",
      id: run.run.id,
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

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });

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

  it("projects front-half Workbench gates as one scoped primary confirmation", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Front Half Gates", body: "Implement one focused pricing rule." });
    await writeAcceptedSpecAndTasks(topic.changeId);

    let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.nextAction).toMatchObject({ actionType: "planning.decompose" });
    expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      changeId: topic.changeId,
      actions: [expect.objectContaining({ actionType: "planning.decompose", changeId: topic.changeId })],
    });

    const planningDir = join(getTempDir(), "harness", "changes", "active", topic.changeId, "planning");
    await mkdir(planningDir, { recursive: true });
    const draftPlan = {
      ...minimalDecompositionPlan(topic.changeId),
      status: "draft" as const,
      recommendation: "single-change" as const,
      rationale: "Keep this demand as one Coding Work Package.",
    };
    await writeFile(join(planningDir, "decomposition-plan.json"), JSON.stringify(draftPlan, null, 2), "utf8");
    await writeFile(join(planningDir, "decomposition-plan.md"), "# Decomposition\n", "utf8");

    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      changeId: topic.changeId,
      actions: [expect.objectContaining({
        actionType: "planning.decomposition.confirm",
        changeId: topic.changeId,
        decompositionPlanId: draftPlan.id,
      })],
    });

    const confirmedPlan = { ...draftPlan, status: "confirmed" as const };
    await writeFile(join(planningDir, "decomposition-plan.json"), JSON.stringify(confirmedPlan, null, 2), "utf8");
    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      changeId: topic.changeId,
      actions: [expect.objectContaining({
        actionType: "planning.decomposition.assess-readiness",
        changeId: topic.changeId,
        decompositionPlanId: confirmedPlan.id,
      })],
    });

    const readiness = {
      ...minimalReadiness(topic.changeId, ["T-001"]),
      status: "ready-for-single-change" as const,
      recommendation: "single-change" as const,
      schedulerEligible: false,
      nextAllowedAction: "code.run" as const,
      decompositionPlanId: confirmedPlan.id,
    };
    await writeFile(join(planningDir, "decomposition-readiness.json"), JSON.stringify(readiness, null, 2), "utf8");
    await writeFile(join(planningDir, "decomposition-readiness.md"), "# Readiness\n", "utf8");

    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "code.run",
      readinessManifestId: readiness.id,
    });
    expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      changeId: topic.changeId,
      actions: [expect.objectContaining({
        actionType: "code.run",
        changeId: topic.changeId,
        readinessManifestId: readiness.id,
      })],
    });
    expect(JSON.stringify(snapshot.right.confirmationQueue)).not.toMatch(/full-auto|parallel executor|merge queue|slot allocator|whole-wave/i);
  });

  it("projects controlled loop workflow fallbacks in user-facing terms", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Controlled Loop Copy", body: "Show controlled loop results clearly." });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.started",
      actionRunId: "controlled-running",
      actionType: "planning.goal-loop.controller.refresh",
      status: "running",
    });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.started",
      actionRunId: "controlled-completed",
      actionType: "planning.scheduler.controlled-advance.run",
      status: "running",
    });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.completed",
      actionRunId: "controlled-completed",
      actionType: "planning.scheduler.controlled-advance.run",
      status: "completed",
      resultSummary: "当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。",
    });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.started",
      actionRunId: "controlled-legacy-completed",
      actionType: "planning.scheduler.controlled-advance.run",
      status: "running",
    });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.completed",
      actionRunId: "controlled-legacy-completed",
      actionType: "planning.scheduler.controlled-advance.run",
      status: "completed",
    });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.started",
      actionRunId: "controlled-failed",
      actionType: "planning.goal-loop.gate-readiness.prepare",
      status: "running",
    });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.failed",
      actionRunId: "controlled-failed",
      actionType: "planning.goal-loop.gate-readiness.prepare",
      status: "failed",
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    const controlledItems = snapshot.center.thread.items.filter((item) => item.actionRunId?.startsWith("controlled-"));

    expect(controlledItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionRunId: "controlled-running",
        label: "刷新下一步判断进行中",
        body: "正在刷新下一步判断；这里只会更新是否适合继续的证据。",
      }),
      expect.objectContaining({
        actionRunId: "controlled-completed",
        label: "按当前建议继续一个受控步骤已完成",
        body: "当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。",
        blocks: expect.arrayContaining([
          expect.objectContaining({ kind: "prose", source: "workflow", title: "执行结果", text: "当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。" }),
          expect.objectContaining({ kind: "workflow-evidence", source: "workflow", text: "当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。" }),
        ]),
        evidence: expect.arrayContaining([
          expect.objectContaining({ source: "workflow", body: "当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。" }),
        ]),
      }),
      expect.objectContaining({
        actionRunId: "controlled-legacy-completed",
        label: "按当前建议继续一个受控步骤已完成",
        body: expect.stringContaining("只按当前建议推进了一个受控步骤"),
      }),
      expect.objectContaining({
        actionRunId: "controlled-failed",
        label: "检查当前步骤未完成",
        body: "当前步骤检查未完成；请查看错误和证据后再决定是否重试或调整。",
      }),
    ]));
    expectUserCopyNotToContainInternalTerms(JSON.stringify(controlledItems));
    expect(snapshot.center.parentAgentTranscript.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "assistant-message",
        source: "workflow-evidence",
        text: "当前受控步骤已完成。下一步判断和当前步骤检查已经刷新；需要再次确认后才能继续。",
      }),
    ]));
  });

  it("keeps running workflow fallback copy out of the parent transcript", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Running Workflow Copy", body: "Running workflow should stay out of the main transcript." });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.started",
      actionRunId: "controlled-running-only",
      actionType: "planning.scheduler.controlled-advance.run",
      status: "running",
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    const transcriptText = JSON.stringify(snapshot.center.parentAgentTranscript.cells);

    expect(transcriptText).not.toContain("只会在确认后推进一个受控步骤");
    expect(transcriptText).not.toContain("正在按当前建议推进一个受控步骤");
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

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    const turn = snapshot.center.thread.items.find((item) => item.kind === "assistant-turn" && item.runId === "run-dedupe");

    expect(turn?.blocks?.filter((block) => block.kind === "command")).toHaveLength(1);
    expect(turn?.blocks?.filter((block) => block.kind === "usage")).toHaveLength(1);
    expect(turn?.blocks?.map((block) => block.sequence)).toEqual([1, 2, 3]);
  });

  it("projects deterministic intake scan, clarification, and reanalysis into Workpad", async () => {
    await initHarness(project());
    await writeFile(join(getTempDir(), "package.json"), JSON.stringify({
      scripts: { test: "vitest", typecheck: "tsc --noEmit" },
    }, null, 2), "utf8");
    await mkdir(join(getTempDir(), "src"), { recursive: true });
    await mkdir(join(getTempDir(), "tests"), { recursive: true });
    await writeFile(join(getTempDir(), "src", "pricing.ts"), "export const price = 100;\n", "utf8");
    await writeFile(join(getTempDir(), "tests", "pricing.test.ts"), "import '../src/pricing';\n", "utf8");
    const topic = await createWorkbenchTopic(project(), {
      title: "Member Discount Intake",
      body: "帮我新增会员订单满 100 元享 9 折，非会员不打折，并补测试。",
    });

    const scan = await runIntakeScan(project(), topic.changeId, "会员满 100 九折");
    const firstIteration = await reanalyzeIntake(project(), topic.changeId, "折扣金额四舍五入到分，只有会员订单参与。");
    expect(firstIteration.clarification).toBeTruthy();
    if (!firstIteration.clarification) throw new Error("Expected clarification");

    await answerClarification(project(), topic.changeId, firstIteration.clarification.id, [{ questionId: "q-tests", answer: "要覆盖会员满 100、会员未满 100、非会员三类测试。" }]);
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });

    expect(scan.run.runtime).toBe("intake-scan");
    expect(existsSync(join(getTempDir(), ".agent-harness", "runs", scan.run.id, "scan.json"))).toBe(true);
    expect(existsSync(join(getTempDir(), ".agent-harness", "runs", scan.run.id, "scan.md"))).toBe(true);
    expect(existsSync(join(getTempDir(), "harness", "changes", "active", topic.changeId, "spec.md"))).toBe(true);
    expect(await readFile(join(getTempDir(), "harness", "changes", "active", topic.changeId, "spec.md"), "utf8")).toContain("TBD");
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
    const runDir = join(getTempDir(), ".agent-harness", "runs", result.run.id);
    await writeFile(join(runDir, "last-message.md"), "x".repeat(5000), "utf8");
    await rm(join(runDir, "stderr.log"), { force: true });

    const stream = await getWorkbenchStream({ project: project(), path: getTempDir() }, result.run.id);

    expect(stream.live).toBe(false);
    expect(stream.run.id).toBe(result.run.id);
    expect(stream.events.map((item) => item.type)).toEqual(expect.arrayContaining(["run.created", "process.started", "run.completed"]));
    expect(stream.artifacts.find((item) => item.key === "stdout")).toMatchObject({ exists: true, kind: "log" });
    expect(stream.artifacts.find((item) => item.key === "lastMessage")).toMatchObject({ exists: true, truncated: true });
    expect(stream.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("stderr")]));
  });

  it("returns a diagnostic snapshot when durable memory is unavailable", async () => {
    const snapshot = await getWorkbenchSnapshot({ project: null, path: getTempDir() });

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

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });

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
    await writeFile(join(getTempDir(), ".agent-harness", "runs", run.id, "events.jsonl"), [
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

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "decision-topic" });

    expect(snapshot.right.approvals.some((item) => item.id === `spec:${run.id}`)).toBe(false);
    expect(snapshot.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: run.id, status: "accepted", artifact: run.artifacts.specProposal }),
    ]));
  });

  it("keeps accepted close decisions attached to the closed topic", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Close Decision Topic" });
    await writeFile(join(getTempDir(), "harness", "changes", "active", "close-decision-topic", "reviews", "review.md"), "Status: approved\n", "utf8");

    const before = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "close-decision-topic" });
    const closeAction = before.right.approvals.find((item) => item.kind === "change-close")?.action;
    expect(closeAction).toBeTruthy();
    if (!closeAction) throw new Error("Expected close action");

    await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: closeAction, confirm: true });
    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "close-decision-topic" });

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

  it("closes only the scoped active demand when multiple demands are active", async () => {
    await initHarness(project());
    await createWorkbenchTopic(project(), { title: "First Close Target", body: "First" });
    await createWorkbenchTopic(project(), { title: "Second Close Target", body: "Second" });
    await writeFile(join(getTempDir(), "harness", "changes", "active", "second-close-target", "reviews", "review.md"), "Status: approved\n", "utf8");

    const before = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "second-close-target" });
    const closeAction = before.right.approvals.find((item) => item.kind === "change-close")?.action;
    expect(closeAction).toMatchObject({ actionId: "change.close", args: ["close", "repo", "second-close-target"] });
    if (!closeAction) throw new Error("Expected close action");

    await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: closeAction, confirm: true });
    const topics = await listWorkbenchTopics(project());

    expect(topics.find((topic) => topic.id === "first-close-target")).toMatchObject({ state: "active" });
    expect(topics.find((topic) => topic.id === "second-close-target")).toMatchObject({ state: "archive" });
  });

  it("abandons only the scoped active demand when multiple demands are active", async () => {
    await initHarness(project());
    await createWorkbenchTopic(project(), { title: "First Abandon Target", body: "First" });
    await createWorkbenchTopic(project(), { title: "Second Abandon Target", body: "Second" });

    await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      abandon: { changeId: "second-abandon-target", reason: "Not needed." },
      confirm: true,
    });
    const topics = await listWorkbenchTopics(project());

    expect(topics.find((topic) => topic.id === "first-abandon-target")).toMatchObject({ state: "active" });
    expect(topics.find((topic) => topic.id === "second-abandon-target")).toMatchObject({ state: "archive" });
  });

  it("lists project-level approvals and filters display by topic", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Approval Topic" });
    const run = await writeSpecProposalRun("approval-topic");
    await writeSpecProposalRun("other-topic");

    const allApprovals = await listWorkbenchApprovals({ project: project(), path: getTempDir() });
    const topicApprovals = await listWorkbenchApprovals({ project: project(), path: getTempDir() }, { topicId: "approval-topic" });

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

    const topic = await getWorkbenchTopic({ project: project(), path: getTempDir() }, "specific-topic");

    expect(topic).toMatchObject({ id: "specific-topic", state: "active" });
  });

  it("does not expose forged active Change metadata in topic summaries or details", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Scoped Metadata Topic" });
    await rewriteActiveChangeMetadata("scoped-metadata-topic", { id: "forged-topic", title: "Forged Topic Title" });

    const topics = await listWorkbenchTopics({ project: project(), path: getTempDir() });
    const topic = await getWorkbenchTopic({ project: project(), path: getTempDir() }, "scoped-metadata-topic");

    expect(topics.find((item) => item.id === "forged-topic")).toBeUndefined();
    expect(topics.find((item) => item.id === "scoped-metadata-topic")).toMatchObject({
      id: "scoped-metadata-topic",
      title: "scoped-metadata-topic",
      state: "active",
    });
    expect(topic).toMatchObject({
      id: "scoped-metadata-topic",
      title: "scoped-metadata-topic",
      change: null,
      closeGate: expect.objectContaining({
        ready: false,
        blockingIssues: expect.arrayContaining(["Change metadata id mismatch: directory scoped-metadata-topic contains forged-topic."]),
      }),
    });
  });

  it("imports thread logs under the canonical directory id when active metadata is forged", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Thread Scope Topic" });
    await rewriteActiveChangeMetadata("thread-scope-topic", { id: "forged-thread-topic", title: "Forged Thread Topic" });
    const memory = await resolveProjectMemory(project());
    const changePath = "harness/changes/active/thread-scope-topic";
    await writeFile(join(getTempDir(), changePath, "thread.jsonl"), `${JSON.stringify({
      id: "thread-entry-1",
      type: "user",
      timestamp: "2026-06-10T00:00:00.000Z",
      changeId: "thread-scope-topic",
      text: "hello",
    })}\n`, "utf8");

    const entries = await readTopicThreadLog(memory, changePath);
    const store = await WorkbenchStore.open(memory);
    try {
      expect(entries).toHaveLength(1);
      expect(store.listMessages("repo", "thread-scope-topic")).toHaveLength(1);
      expect(store.listMessages("repo", "forged-thread-topic")).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("keeps valid archived topic lookup scoped by archived metadata", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archived Topic Lookup" });
    await writeFile(join(getTempDir(), "harness", "changes", "active", "archived-topic-lookup", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(getTempDir());

    const topic = await getWorkbenchTopic({ project: project(), path: getTempDir() }, "archived-topic-lookup");

    expect(topic).toMatchObject({
      id: "archived-topic-lookup",
      state: "archive",
      change: expect.objectContaining({ id: "archived-topic-lookup", state: "archived" }),
    });
  });

  it("derives Workpad TaskGraph from accepted tasks and AC map", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Task Preview" });
    await writeFile(join(getTempDir(), "harness", "changes", "active", "task-preview", "spec.md"), [
      "# Spec",
      "",
      "## Acceptance Criteria",
      "",
      "- AC-001: Show Workpad task preview.",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(getTempDir(), "harness", "changes", "active", "task-preview", "plan.md"), "# Plan\n\nImplement deterministic task preview.\n", "utf8");
    await writeFile(join(getTempDir(), "harness", "changes", "active", "task-preview", "tasks.md"), [
      "# Tasks",
      "",
      "- [x] T-001: Render deterministic task preview.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "task-preview" });

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

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "task-evidence" });
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

  it("dedupes only the matching result-review apply approval and preserves other apply targets", () => {
    const inspector = buildDecisionInspector({
      selectedTopic: { id: "change-1", title: "Change 1", state: "active", validations: [], audits: [] },
      workpad: {
        resultReview: {
          status: "ready-to-apply",
          summary: "Ready.",
          worktreeId: "wt-1",
          applyReadiness: { kind: "ready", ready: true, label: "ready", message: "ready", blockingIssues: [], warnings: [] },
        },
        taskGraph: { nodes: [] },
      },
      approvals: [
        { id: "apply:wt-1", kind: "worktree-apply", label: "same", changeId: "change-1", targetId: "wt-1", severity: "info", action: { actionId: "result.apply", label: "Apply same", command: "result", args: ["apply", "repo", "change-1", "wt-1"], mutates: true, requiresConfirmation: true } },
        { id: "apply:wt-2", kind: "worktree-apply", label: "other worktree", changeId: "change-1", targetId: "wt-2", severity: "info", action: { actionId: "result.apply", label: "Apply other worktree", command: "result", args: ["apply", "repo", "change-1", "wt-2"], mutates: true, requiresConfirmation: true } },
        { id: "apply:other-change", kind: "worktree-apply", label: "other change", changeId: "change-2", targetId: "wt-1", severity: "info", action: { actionId: "result.apply", label: "Apply other change", command: "result", args: ["apply", "repo", "change-2", "wt-1"], mutates: true, requiresConfirmation: true } },
      ],
      decisions: [],
    } as Parameters<typeof buildDecisionInspector>[0]);

    const applyActions = [inspector.primary, ...inspector.related]
      .flatMap((context) => context?.actions ?? [])
      .filter((action) => action.kind === "approval" && action.action?.actionId === "result.apply")
      .map((action) => action.action?.args);

    expect(applyActions).toEqual([
      ["apply", "", "change-1", "wt-1"],
      ["apply", "repo", "change-1", "wt-2"],
      ["apply", "repo", "change-2", "wt-1"],
    ]);
  });

});

async function rewriteActiveChangeMetadata(changeId: string, update: Record<string, unknown>): Promise<void> {
  const path = join(getTempDir(), "harness", "changes", "active", changeId, "change.json");
  const metadata = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeFile(path, `${JSON.stringify({ ...metadata, ...update }, null, 2)}\n`, "utf8");
}

async function writeCoderRun(changeId: string, runId: string, taskIds: string[], worktreeId: string, status: RunMetadata["status"], taskRunId?: string): Promise<RunMetadata> {
  const runDir = join(getTempDir(), ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: getTempDir(),
    runtime: "coder-codex",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["codex", "exec"],
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
      checkoutPath: join(getTempDir(), ".agent-harness", "worktrees", worktreeId),
      metadataPath: `.agent-harness/worktrees/${worktreeId}.json`,
    },
    taskIds,
    taskRunId,
  };
  await writeFile(join(runDir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  return run;
}

async function writeValidationResult(changeId: string, validationId: string, worktreeId: string, status: "passed" | "failed"): Promise<void> {
  const dir = join(getTempDir(), ".agent-harness", "runs", validationId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  await writeRunMetadata(changeId, validationId, "validator", "completed", worktreeId, now);
  await writeFile(join(dir, "validation.json"), JSON.stringify({
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
  const dir = join(getTempDir(), ".agent-harness", "runs", auditId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  await writeRunMetadata(changeId, auditId, "auditor", "completed", worktreeId, now);
  await writeFile(join(dir, "audit.json"), JSON.stringify({
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
    projectPath: getTempDir(),
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
      checkoutPath: join(getTempDir(), ".agent-harness", "worktrees", worktreeId),
      metadataPath: `.agent-harness/worktrees/${worktreeId}.json`,
    },
  };
  await writeFile(join(getTempDir(), ".agent-harness", "runs", runId, "run.json"), JSON.stringify(run, null, 2), "utf8");
}

async function writeSpecProposalRun(changeId: string): Promise<RunMetadata> {
  const runId = `run-test-${changeId}`;
  const runDir = join(getTempDir(), ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: getTempDir(),
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

function expectUserCopyNotToContainInternalTerms(copy: string): void {
  for (const forbidden of FORBIDDEN_CONTROLLED_LOOP_PRIMARY_TERMS) {
    expect(copy).not.toContain(forbidden);
  }
}
