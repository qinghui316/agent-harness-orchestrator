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
import { getWorkbenchSnapshot, getWorkbenchStream, getWorkbenchTopic, getWorkbenchTranscriptProjection, listWorkbenchApprovals, listWorkbenchRoles, listWorkbenchTopics } from "../../src/workbench/manager.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { createAgentTask } from "../../src/agent-task/manager.js";
import { alignDecisionInspectorWithConfirmationPrimary, buildDecisionInspector } from "../../src/workbench/projections/read-model/decision-inspector.js";
import { buildConfirmationQueue } from "../../src/workbench/projections/read-model/confirmation-queue.js";
import { landingCandidateQueueItem } from "../../src/workbench/projections/read-model/confirmation/landing.js";
import { writeLandingArtifacts } from "../../src/landing/repository.js";
import { landingRoot } from "../../src/landing/utils.js";
import type { LandingReadinessPackage } from "../../src/landing/types.js";
import { prDraftRoot } from "../../src/pr-draft/utils.js";
import { getTempDir, minimalDecompositionPlan, minimalReadiness, prepareSeededSchedulerIntegrationHandoff, project, writeAcceptedSpecAndTasks, writePlanningBundleFixture } from "./workbench/fixtures.js";
import type { RunMetadata } from "../../src/types/index.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchDecisionInspector } from "../../src/workbench/read-model-types.js";

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

it("aligns decision inspector primary with the manual scheduler IntegrationCheck gate", () => {
  const inspector: WorkbenchDecisionInspector = {
    primary: {
      id: "result:member-discount:wt-1:not-approved",
      kind: "apply-gate",
      title: "确认应用到项目",
      summary: "Older worker result context",
      severity: "blocking",
      changeId: "member-discount",
      targetId: "wt-1",
      actions: [],
    },
    related: [],
    history: [],
  };
  const primary: WorkbenchConfirmationQueueItem = {
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
    schedulerIntegrationCandidateId: "candidate-1",
    actions: [{
      id: "workflow:planning.scheduler.integration-check.run:member-discount:candidate-1",
      label: "检查组合结果",
      kind: "workflow-action",
      actionType: "planning.scheduler.integration-check.run",
      changeId: "member-discount",
      enabled: true,
      requiresConfirmation: true,
    }],
  };

  const aligned = alignDecisionInspectorWithConfirmationPrimary(inspector, primary, "member-discount");

  expect(aligned.primary).toMatchObject({
    id: "confirmation:confirm:planning.scheduler.integration-check.run:member-discount:candidate-1",
    kind: "workflow-gate",
    changeId: "member-discount",
    targetId: "candidate-1",
  });
  expect(aligned.primary?.actions).toEqual(expect.arrayContaining([
    expect.objectContaining({ actionType: "planning.scheduler.integration-check.run" }),
  ]));
});

async function writeReadyLandingPackage(changeId: string, id: string): Promise<LandingReadinessPackage> {
  const memory = await resolveProjectMemory(project());
  const directory = join(landingRoot(memory), id);
  const now = new Date().toISOString();
  const artifactRefs = [
    `memory://workbench/landing/${id}/landing-package.json`,
    `memory://workbench/landing/${id}/landing-summary.md`,
    `memory://workbench/landing/${id}/source-diff.patch`,
    `memory://workbench/landing/${id}/merge-review.md`,
  ];
  const pkg: LandingReadinessPackage = {
    version: "1.0",
    id,
    projectId: project().id,
    target: {
      kind: "integration-check",
      changeIds: [changeId],
      worktreeIds: ["wt-alpha", "wt-beta"],
      applyCheckId: `apply-${id}`,
      expectedDiffHash: `diff-${id}`,
      evidenceRefs: [`memory://workbench/integration-checks/apply-${id}/check.json`],
    },
    status: "ready",
    sourceHead: "source-head",
    sourceDiffHash: `diff-${id}`,
    sourceDiffStat: "src/alpha.ts | 1 +",
    changedFiles: ["src/alpha.ts"],
    attributable: true,
    unattributedFiles: [],
    summary: "本地结果已应用，落地检查包已准备好进行提交/PR 前审查。",
    riskSummary: "这是本地提交/PR 前检查；不会 push、创建 PR 或 merge。",
    artifactRefs,
    createdAt: now,
    reviewedAt: now,
    review: {
      version: "1.0",
      packageId: id,
      roleId: "merge-reviewer-agent",
      verdict: "ready",
      summary: "提交/PR 前检查通过。",
      riskSummary: "本地证据完整。",
      evidenceRefs: artifactRefs,
      missingChecks: [],
      suggestedNextAction: "进入本地完成门禁。",
      createdAt: now,
    },
  };
  await mkdir(directory, { recursive: true });
  await writeLandingArtifacts(directory, pkg);
  return pkg;
}

async function writeCreatedPrDraftPackage(landingPackageId: string, id: string): Promise<void> {
  const memory = await resolveProjectMemory(project());
  const directory = join(prDraftRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(join(directory, "pr-draft-package.json"), JSON.stringify({
    version: "1.0",
    id,
    landingPackageId,
    projectId: project().id,
    provider: "github-cli",
    status: "created",
    title: "Existing Draft",
    bodyArtifact: `memory://workbench/pr-drafts/${id}/body.md`,
    packageArtifact: `memory://workbench/pr-drafts/${id}/pr-draft-package.json`,
    remoteName: "origin",
    remoteUrl: "https://github.com/example/repo.git",
    baseBranch: "main",
    branchName: "aho/existing-draft",
    prUrl: "https://github.com/example/repo/pull/1",
    landingEvidenceRefs: [`memory://workbench/landing/${landingPackageId}/landing-package.json`],
    createdAt: now,
    updatedAt: now,
  }, null, 2), "utf8");
}

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

    const transcript = await getWorkbenchTranscriptProjection({ project: project(), path: getTempDir() }, topic.id);
    const cells = transcript.cells;

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

    const detail = await getWorkbenchTopic({ project: project(), path: getTempDir() }, topic.changeId);

    expect(detail.threadItems.filter((item) => item.kind === "workflow-summary" && item.actionRunId === "action-code")).toHaveLength(0);
    expect(detail.threadItems.filter((item) => item.kind === "assistant-turn" && item.runId === run.run.id)).toHaveLength(1);
    expect(detail.threadItems).toEqual(expect.arrayContaining([
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
    expect(detail.threadItems.some((item) => item.kind === "evidence" && item.runId === run.run.id)).toBe(false);
    expect(detail.threadItems.some((item) => item.label === "process.started" || item.label === "run.completed")).toBe(false);
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
    const transcript = await getWorkbenchTranscriptProjection({ project: project(), path: getTempDir() }, topic.changeId);
    expect(transcript.cells).toEqual(expect.arrayContaining([
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

  it("suppresses selected demand primary confirmations while a run is active", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Running Planning", body: "Generate a plan." });
    await writeCoderRun(topic.changeId, "run-planning-active", [], "wt-planning-active", "running");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });

    expect(snapshot.center.workpad.runControlState?.canStop).toBe(true);
    expect(snapshot.right.confirmationQueue.primary).toBeNull();
    expect(JSON.stringify(snapshot.right.confirmationQueue.current)).not.toContain(topic.changeId);
  });

  it("suppresses result review decisions while a foreground validator task is running", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Validator Running Result Review" });
    await writeAcceptedSpecAndTasks("validator-running-result-review");
    await writeCoderRun("validator-running-result-review", "run-validator-running", [], "wt-validator-running", "completed");
    const memory = await resolveProjectMemory(project());
    await createAgentTask(memory, {
      conversationId: "validator-running-result-review",
      changeId: "validator-running-result-review",
      roleId: "validator",
      kind: "foreground",
      summary: "Run independent mechanical validation for the coder worktree.",
      inputArtifacts: ["runs/run-validator-running"],
      initialStatus: "running",
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "validator-running-result-review" });

    expect(snapshot.center.workpad.userStatus).toBe("processing");
    expect(snapshot.center.workpad.runControlState?.canStop).toBe(true);
    expect(snapshot.center.workpad.rolePipeline).toMatchObject({
      stage: "validation",
      status: "running",
    });
    expect(snapshot.right.confirmationQueue.primary).toBeNull();
    expect(snapshot.right.decisionInspector.primary).toBeNull();
    expect(JSON.stringify(snapshot.right.confirmationQueue.current)).not.toContain("result.apply");
    expect(JSON.stringify(snapshot.right.decisionInspector)).not.toContain("放弃这次结果");
  });

  it("suppresses selected demand primary confirmations only while a workflow action is in flight", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Planning Gate", body: "Generate a plan." });
    await writePlanningBundleFixture(topic.changeId, "Generate a small plan.");
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.started",
      actionRunId: "action-planning",
      actionType: "planning.generate",
      status: "running",
    });

    let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
    expect(snapshot.right.confirmationQueue.primary).toBeNull();

    const automationInternalSnapshot = await getWorkbenchSnapshot(
      { project: project(), path: getTempDir() },
      { topicId: topic.changeId, ignoreActiveWorkflowActions: true },
    );
    expect(automationInternalSnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.confirm-execution", planningBundleId: expect.any(String) }),
    ]));

    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.completed",
      actionRunId: "action-planning",
      actionType: "planning.generate",
      status: "completed",
    });
    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });

    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.confirm-execution", planningBundleId: expect.any(String) }),
    ]));
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

  it("reads package scripts from a UTF-8 BOM package.json during intake scan", async () => {
    await initHarness(project());
    await writeFile(join(getTempDir(), "package.json"), `\uFEFF${JSON.stringify({
      scripts: { test: "vitest", build: "tsc -p tsconfig.json" },
    }, null, 2)}`, "utf8");
    const topic = await createWorkbenchTopic(project(), {
      title: "BOM Package Intake",
      body: "请检查 package scripts。",
    });

    const { scan } = await runIntakeScan(project(), topic.changeId, "请读取项目脚本并继续。");

    expect(scan.scripts).toEqual(expect.arrayContaining([
      { name: "test", command: "vitest" },
      { name: "build", command: "tsc -p tsconfig.json" },
    ]));
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

  it("aligns decision inspector primary with close gate when stale failures remain as evidence", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const selectedTopic = {
      id: "close-projection-target",
      name: "close-projection-target",
      title: "Close Projection Target",
      state: "active",
      path: "harness/changes/active/close-projection-target",
      change: null,
      runs: [],
      taskQueues: [],
      taskQueueItems: [],
      taskRuns: [],
      workerLeases: [],
      worktrees: [],
      validations: [{
        id: "validation-old-failed",
        runId: "validation-old-failed",
        status: "failed",
        worktreeId: "wt-old",
        finishedAt: "2026-06-22T00:00:00.000Z",
      }],
      audits: [],
      threadItems: [],
    };
    const workpad = {
      resultReview: undefined,
      taskGraph: { nodes: [] },
      nextAction: {
        id: "none",
        label: "None",
        description: "No workpad action.",
        kind: "none",
        enabled: false,
        requiresConfirmation: false,
      },
    };
    const inspector = buildDecisionInspector({
      selectedTopic,
      workpad,
      approvals: [{
        id: "close:close-projection-target",
        kind: "change-close",
        label: "Close",
        changeId: "close-projection-target",
        targetId: "close-projection-target",
        severity: "info",
        action: {
          actionId: "change.close",
          label: "Close",
          command: "change",
          args: ["close", "repo", "close-projection-target"],
          mutates: true,
          requiresConfirmation: true,
        },
      }],
      decisions: [],
    } as Parameters<typeof buildDecisionInspector>[0]);
    const queue = await buildConfirmationQueue({
      project: project(),
      memory,
      selectedTopic,
      workpad,
      decisionInspector: inspector,
      includeProjectWideActions: false,
    } as Parameters<typeof buildConfirmationQueue>[0]);

    expect(queue.current.filter((item) => item.primary)).toHaveLength(1);
    expect(queue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: expect.objectContaining({
          actionId: "change.close",
          args: ["close", "repo", "close-projection-target"],
        }),
      }),
    ]));
    expect(inspector.primary).toMatchObject({
      kind: "close-gate",
      changeId: "close-projection-target",
      targetId: "close-projection-target",
    });
    expect(inspector.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: expect.objectContaining({
          actionId: "change.close",
          args: ["close", "repo", "close-projection-target"],
        }),
      }),
    ]));
    expect(inspector.related).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "validation-failed",
        changeId: "close-projection-target",
        targetId: "validation-old-failed",
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

  it("marks only plain approved audit approvals as scoped-automation eligible", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Audit Automation" });
    await writeAuditResult("audit-automation", "audit-approved", "wt-approved", "approved");
    await writeAuditResult("audit-automation", "audit-notes", "wt-notes", "approved-with-notes");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "audit-automation" });
    const approved = snapshot.right.approvals.find((item) => item.id === "audit:audit-approved");
    const notes = snapshot.right.approvals.find((item) => item.id === "audit:audit-notes");

    expect(approved).toMatchObject({
      kind: "audit-proposal",
      automationEligible: true,
      action: expect.objectContaining({ actionId: "audit.accept" }),
    });
    expect(notes).toMatchObject({
      kind: "audit-proposal",
      automationEligible: false,
      reason: expect.stringContaining("manual acceptance"),
    });
  });

  it("projects IntegrationCheck apply/discard as human gates outside scoped automation", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Integration Apply Discard Projection");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const primary = snapshot.right.confirmationQueue.primary;
    const applyAction = primary?.actions.find((action) => action.action?.actionId === "apply-check.apply")?.action;
    const discardAction = primary?.actions.find((action) => action.action?.actionId === "apply-check.discard")?.action;

    expect(primary).toMatchObject({
      kind: "integration-apply",
      applyCheckId: prepared.handoff.handoff?.integrationCheckId,
      primary: true,
    });
    expect(applyAction).toMatchObject({
      actionId: "apply-check.apply",
      command: "apply-check",
      args: ["apply", prepared.handoff.handoff?.integrationCheckId, prepared.latestArtifactHash],
    });
    expect(discardAction).toMatchObject({
      actionId: "apply-check.discard",
      command: "apply-check",
      args: ["discard", prepared.handoff.handoff?.integrationCheckId],
    });
    expect(primary?.actions.some((action) => action.actionType === "planning.automation.scoped-auto.run")).toBe(false);
    expect(primary?.actions.some((action) => action.automationEligible === true)).toBe(false);
    expect(JSON.stringify(primary)).not.toMatch(/full-auto|parallel executor|merge queue/i);
  });

  it("projects integration apply to local landing instead of stale scheduler or audit gates", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Integration Apply Outcome Completion");
    const checkId = prepared.handoff.handoff.integrationCheckId;

    const beforeApply = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const applyAction = beforeApply.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "apply-check.apply")?.action;
    expect(applyAction).toMatchObject({
      actionId: "apply-check.apply",
      args: ["apply", checkId, prepared.latestArtifactHash],
    });

    await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      changeId: prepared.topic.changeId,
      action: applyAction,
      confirm: true,
    });

    const afterApply = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const afterApplyJson = JSON.stringify(afterApply.right.confirmationQueue.current);
    expect(afterApplyJson).not.toContain("\"actionId\":\"apply-check.apply\"");
    expect(afterApplyJson).not.toContain("\"actionId\":\"apply-check.discard\"");
    expect(afterApply.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.integration-outcome.reconcile",
      enabled: true,
    });
    expect(afterApply.right.confirmationQueue.primary).toMatchObject({
      kind: "landing-readiness",
      changeId: prepared.topic.changeId,
      primary: true,
    });
    expect(afterApply.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionType: "landing.prepare",
        applyCheckId: checkId,
        automationEligible: true,
      }),
    ]));
    expect(afterApply.right.confirmationQueue.current.some((item) =>
      item.actions.some((action) => action.goalLoopCurrentGateActionType === "planning.scheduler.integration-outcome.reconcile")
    )).toBe(true);
    expect(JSON.stringify(afterApply.right.decisionInspector.primary)).toContain("landing.prepare");
    expect(JSON.stringify(afterApply.right.decisionInspector.primary)).not.toContain("audit-approved");
  });

  it("routes ready local landing to change.close instead of PR provider when close is ready", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Local Landing Close" });
    await writeFile(join(getTempDir(), "harness", "changes", "active", "local-landing-close", "reviews", "review.md"), "Status: approved\n", "utf8");
    await writeReadyLandingPackage("local-landing-close", "landing-local-close-ready");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "local-landing-close" });
    const currentJson = JSON.stringify(snapshot.right.confirmationQueue.current);

    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: expect.objectContaining({ actionId: "change.close" }),
      }),
    ]));
    expect(snapshot.right.decisionInspector.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: expect.objectContaining({ actionId: "change.close" }),
      }),
    ]));
    expect(currentJson).not.toContain("pr-draft:provider:landing-local-close-ready");
  });

  it("shows local close blocker instead of PR provider when ready landing cannot close yet", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Local Landing Blocked" });
    await writeReadyLandingPackage("local-landing-blocked", "landing-local-close-blocked");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "local-landing-blocked" });
    const primary = snapshot.right.confirmationQueue.primary;

    expect(primary).toMatchObject({
      id: "landing:local-terminal-blocker:landing-local-close-blocked",
      kind: "request-changes",
      changeId: "local-landing-blocked",
      landingPackageId: "landing-local-close-blocked",
      primary: true,
      status: "failed",
    });
    expect(primary?.summary).toContain("本地落地检查已通过");
    expect(JSON.stringify(snapshot.right.confirmationQueue.current)).not.toContain("pr-draft:provider:landing-local-close-blocked");
    expect(JSON.stringify(snapshot.right.decisionInspector.primary)).toContain("landing-local-close-blocked");
  });

  it("preserves existing Draft PR flow after ready landing", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Remote Landing Existing Draft" });
    await writeReadyLandingPackage("remote-landing-existing-draft", "landing-existing-draft");
    await writeCreatedPrDraftPackage("landing-existing-draft", "draft-existing");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "remote-landing-existing-draft" });

    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      id: "pr-draft:created:draft-existing",
      kind: "pr-draft",
      landingPackageId: "landing-existing-draft",
      changeId: "remote-landing-existing-draft",
    });
    expect(JSON.stringify(snapshot.right.confirmationQueue.primary)).toContain("Draft PR 已创建");
  });

  it("marks local landing.prepare as scoped-automation eligible without widening remote landing", () => {
    const item = landingCandidateQueueItem(project(), {
      kind: "worktree",
      worktreeId: "wt-1",
      changeIds: ["change-1"],
      summary: "本地结果已应用，可以做提交/PR 前检查。",
      riskSummary: "这是本地证据准备。",
    }, "change-1");

    expect(item).toMatchObject({
      kind: "landing-readiness",
      changeId: "change-1",
      worktreeId: "wt-1",
      primary: true,
    });
    expect(item.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionType: "landing.prepare",
        worktreeId: "wt-1",
        automationEligible: true,
      }),
    ]));
    expect(JSON.stringify(item)).not.toMatch(/remote-landing|pr-draft|merge-next|Harness evolution|full-auto|parallel executor/i);
  });

  it("offers bounded rework for failed result validation without reviving stale code.run", () => {
    const inspector = buildDecisionInspector({
      selectedTopic: {
        id: "change-1",
        name: "change-1",
        title: "Change 1",
        state: "active",
        path: "harness/changes/active/change-1",
        change: null,
        runs: [],
        taskQueues: [],
        taskQueueItems: [],
        taskRuns: [],
        workerLeases: [],
        worktrees: [],
        validations: [{
          id: "validation-1",
          runId: "validation-1",
          status: "failed",
          worktreeId: "wt-1",
          finishedAt: "2026-06-22T00:00:00.000Z",
        }],
        audits: [],
        threadItems: [],
      },
      workpad: {
        resultReview: {
          status: "needs-rework",
          title: "需要修改",
          summary: "验证未通过，需要修改。",
          worktreeId: "wt-1",
          changedFiles: ["src/example.ts"],
          validation: { id: "validation-1", runId: "validation-1", status: "failed" },
          applyReadiness: {
            ready: false,
            kind: "not-approved",
            label: "not approved",
            message: "验证或审查还没有通过，反馈会进入下一轮修改。",
            blockingIssues: ["Validation failed."],
            warnings: [],
          },
          evidence: [],
        },
        taskGraph: { nodes: [] },
      },
      approvals: [
        {
          id: "apply:old-wt",
          kind: "worktree-apply",
          label: "old apply",
          changeId: "change-1",
          targetId: "old-wt",
          severity: "info",
          action: { actionId: "result.apply", label: "Apply old", command: "result", args: ["apply", "repo", "change-1", "old-wt"], mutates: true, requiresConfirmation: true },
        },
      ],
      decisions: [],
    });

    expect(inspector.primary).toMatchObject({
      kind: "validation-failed",
      changeId: "change-1",
      runId: "validation-1",
    });
    expect(inspector.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionType: "result.refresh-rework",
        changeId: "change-1",
        worktreeId: "wt-1",
        requiresConfirmation: true,
      }),
      expect.objectContaining({
        actionType: "result.revalidate",
        changeId: "change-1",
        worktreeId: "wt-1",
        requiresConfirmation: true,
      }),
    ]));
    expect(inspector.primary?.actions.some((action) => action.actionType === "code.run")).toBe(false);
  });

  it("offers bounded rework and reaudit for blocked audit without exposing apply", () => {
    const inspector = buildDecisionInspector({
      selectedTopic: {
        id: "change-1",
        name: "change-1",
        title: "Change 1",
        state: "active",
        path: "harness/changes/active/change-1",
        change: null,
        runs: [],
        taskQueues: [],
        taskQueueItems: [],
        taskRuns: [],
        workerLeases: [],
        worktrees: [],
        validations: [],
        audits: [{
          id: "audit-1",
          runId: "audit-run-1",
          status: "blocked",
          worktreeId: "wt-1",
          finishedAt: "2026-06-22T00:00:00.000Z",
        }],
        threadItems: [],
      },
      workpad: {
        resultReview: {
          status: "needs-rework",
          title: "需要修改",
          summary: "审查未通过，需要修改。",
          worktreeId: "wt-1",
          changedFiles: ["src/example.ts"],
          audit: { id: "audit-1", runId: "audit-run-1", status: "blocked" },
          applyReadiness: {
            ready: false,
            kind: "not-approved",
            label: "not approved",
            message: "验证或审查还没有通过，反馈会进入下一轮修改。",
            blockingIssues: ["Audit blocked."],
            warnings: [],
          },
          evidence: [],
        },
        taskGraph: { nodes: [] },
      },
      approvals: [],
      decisions: [],
    });

    expect(inspector.primary).toMatchObject({
      kind: "audit-blocked",
      changeId: "change-1",
      runId: "audit-run-1",
    });
    expect(inspector.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionType: "result.refresh-rework",
        changeId: "change-1",
        worktreeId: "wt-1",
        requiresConfirmation: true,
      }),
      expect.objectContaining({
        actionType: "result.reaudit",
        changeId: "change-1",
        worktreeId: "wt-1",
        requiresConfirmation: true,
      }),
    ]));
    expect(inspector.primary?.actions.some((action) => action.action?.actionId === "result.apply")).toBe(false);
    expect(inspector.related.flatMap((context) => context.actions).some((action) => action.action?.actionId === "result.apply")).toBe(false);
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
      .map((action) => ({ args: action.action?.args, options: action.options }));

    expect(applyActions).toEqual([
      {
        args: ["apply", "", "change-1", "wt-1"],
        options: { commit: true, message: "Apply AHO result: change-1" },
      },
      { args: ["apply", "repo", "change-1", "wt-2"], options: undefined },
      { args: ["apply", "repo", "change-2", "wt-1"], options: undefined },
    ]);
  });

  it("preserves scoped automation eligibility on local apply and close approval surfaces", () => {
    const inspector = buildDecisionInspector({
      selectedTopic: { id: "change-1", title: "Change 1", state: "active", validations: [], audits: [] },
      workpad: { taskGraph: { nodes: [] } },
      approvals: [
        { id: "apply:wt-1", kind: "worktree-apply", label: "apply", changeId: "change-1", targetId: "wt-1", severity: "info", automationEligible: true, action: { actionId: "result.apply", label: "Apply", command: "result", args: ["apply", "repo", "change-1", "wt-1"], mutates: true, requiresConfirmation: true } },
        { id: "close:change-1", kind: "change-close", label: "close", changeId: "change-1", targetId: "change-1", severity: "info", automationEligible: true, action: { actionId: "change.close", label: "Close", command: "change", args: ["close", "repo", "change-1"], mutates: true, requiresConfirmation: true } },
      ],
      decisions: [],
    } as Parameters<typeof buildDecisionInspector>[0]);

    const approvalActions = [inspector.primary, ...inspector.related]
      .flatMap((context) => context?.actions ?? [])
      .filter((action) => action.kind === "approval");

    expect(approvalActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: expect.objectContaining({ actionId: "result.apply" }), automationEligible: true }),
      expect.objectContaining({ action: expect.objectContaining({ actionId: "change.close" }), automationEligible: true }),
    ]));
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
