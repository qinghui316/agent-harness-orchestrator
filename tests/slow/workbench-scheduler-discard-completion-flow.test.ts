import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { runCodexChat, runOrchestratorPlan } from "../../src/workbench/codex-chat/bridge.js";
import { getWorkbenchSchedulerRunCompletionProjection, getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listAgentTasks } from "../../src/agent-task/manager.js";
import { markWorktreeApplied } from "../../src/worktree/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { compileGoalLoopEvaluation } from "../../src/goal-loop/manager.js";
import { createFakeCodex, execFileAsync, findSchedulerGateAction, getTempDir, prepareSeededSchedulerIntegrationHandoff, project, readJsonl, unwrapControlledSchedulerAdvanceResult } from "../unit/workbench/fixtures.js";
import type { RunMetadata } from "../../src/types/index.js";

describe("workbench scheduler discard completion slow flow", () => {
  it("records discarded SchedulerRun completion after existing IntegrationCheck discard without mutating source", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Scheduler Discard Completion Acceptance");
    const moduleABeforeDiscard = await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8");
    const moduleBBeforeDiscard = await readFile(join(getTempDir(), "src", "module-b.ts"), "utf8");
    const sourceStatusBeforeDiscard = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
    expect(sourceStatusBeforeDiscard.stdout.trim()).toBe("");

    let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      kind: "integration-apply",
      applyCheckId: prepared.handoff.handoff?.integrationCheckId,
    });
    const discardAction = snapshot.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "apply-check.discard")?.action;
    expect(discardAction).toMatchObject({ actionId: "apply-check.discard", command: "apply-check" });
    expect(snapshot.right.confirmationQueue.primary?.actions.some((action) => action.actionType?.includes("scheduler") || action.action?.actionId?.includes("scheduler"))).toBe(false);
    if (!discardAction) throw new Error("Missing existing IntegrationCheck discard action.");

    await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: discardAction, confirm: true });
    expect(await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8")).toBe(moduleABeforeDiscard);
    expect(await readFile(join(getTempDir(), "src", "module-b.ts"), "utf8")).toBe(moduleBBeforeDiscard);
    const sourceStatusAfterDiscard = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
    expect(sourceStatusAfterDiscard.stdout.trim()).toBe("");

    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const outcomeAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-outcome.reconcile", (candidate) => candidate.schedulerIntegrationCheckHandoffId === prepared.handoff.handoff?.id));
    if (!outcomeAction) throw new Error("Missing scheduler integration outcome reconcile action after existing discard.");
    const outcomeResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...outcomeAction, confirm: true });
    const outcomeWorkflow = outcomeResult.result as { status?: string; error?: string; result?: unknown };
    if (outcomeWorkflow.status === "failed") throw new Error(outcomeWorkflow.error ?? "discard outcome action failed");
    const outcomePayload = unwrapControlledSchedulerAdvanceResult(outcomeWorkflow.result ?? outcomeResult.result) as {
      outcome?: {
        id?: string;
        status?: string;
        schedulerIntegrationCheckHandoffId?: string;
        integrationCheckId?: string;
        readyWorktreeIds?: string[];
        resultTargetWorktreeIds?: string[];
      };
    };
    expect(outcomePayload.outcome).toMatchObject({
      status: "discarded",
      schedulerIntegrationCheckHandoffId: prepared.handoff.handoff?.id,
      integrationCheckId: prepared.handoff.handoff?.integrationCheckId,
      readyWorktreeIds: expect.arrayContaining(prepared.refreshedCandidate.readyWorktreeIds ?? []),
      resultTargetWorktreeIds: expect.arrayContaining(prepared.refreshedCandidate.readyWorktreeIds ?? []),
    });
    expect(await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8")).toBe(moduleABeforeDiscard);
    expect(await readFile(join(getTempDir(), "src", "module-b.ts"), "utf8")).toBe(moduleBBeforeDiscard);

    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const completeAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.run.complete", (candidate) => candidate.schedulerIntegrationOutcomeId === outcomePayload.outcome?.id));
    if (!completeAction) throw new Error("Missing scheduler run completion action after discarded scheduler outcome.");
    const completionResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...completeAction, confirm: true });
    const completionWorkflow = completionResult.result as { status?: string; error?: string; result?: unknown };
    if (completionWorkflow.status === "failed") throw new Error(completionWorkflow.error ?? "discard completion action failed");
    const completionPayload = unwrapControlledSchedulerAdvanceResult(completionWorkflow.result ?? completionResult.result) as {
      completion?: {
        id?: string;
        status?: string;
        schedulerIntegrationOutcomeId?: string;
        integrationCheckId?: string;
      };
      schedulerRunStatus?: string;
      sourceMutated?: boolean;
    };
    expect(completionPayload).toMatchObject({
      schedulerRunStatus: "completed",
      sourceMutated: false,
      completion: {
        status: "completed-discarded",
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
        integrationCheckId: prepared.handoff.handoff?.integrationCheckId,
      },
    });
    const completionProjection = await getWorkbenchSchedulerRunCompletionProjection(
      { project: project(), path: getTempDir() },
      prepared.topic.changeId,
      prepared.schedulerRun.id,
      completionPayload.completion?.id,
    );
    expect(completionProjection).toMatchObject({
      id: completionPayload.completion?.id,
      status: "completed-discarded",
      schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
    });
    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(snapshot.center.workpad.schedulerRunCompletion).toMatchObject({
      id: completionPayload.completion?.id,
      status: "completed-discarded",
      schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
    });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.run.complete",
      enabled: false,
      schedulerRunCompletionId: completionPayload.completion?.id,
    });
    const terminalMemory = await resolveProjectMemory(project());
    for (const worktreeId of prepared.refreshedCandidate.readyWorktreeIds ?? []) {
      const applied = await markWorktreeApplied(terminalMemory, worktreeId, {
        applyRunId: `test-close-ready-${worktreeId}`,
      });
      expect(applied).toMatchObject({ worktreeId, status: "applied" });
    }
    const terminalChangePath = join("harness", "changes", "active", prepared.topic.changeId);
    const terminalChangeDir = join(terminalMemory.memoryRoot, terminalChangePath);
    await writeFile(join(terminalChangeDir, "summary.md"), [
      "# Scheduler Discard Completion Acceptance",
      "",
      "## Current Status",
      "",
      "Completed test fixture.",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(terminalChangeDir, "tasks.md"), [
      "# Tasks",
      "",
      "- [x] T-001: Update module A.",
      "  - Covers: AC-001",
      "- [x] T-002: Update module B.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(terminalChangeDir, "spec-tests.json"), JSON.stringify({
      version: "1.0",
      changeId: prepared.topic.changeId,
      updatedAt: new Date().toISOString(),
      mappings: [],
    }, null, 2), "utf8");
    const sourceValidationId = `run-validation-source-close-ready-${Date.now()}`;
    const sourceValidationDir = join(terminalMemory.runsRoot, sourceValidationId);
    const sourceValidationTime = new Date(Date.now() + 60_000).toISOString();
    await mkdir(sourceValidationDir, { recursive: true });
    await writeFile(join(sourceValidationDir, "validation.json"), JSON.stringify({
      version: "1.0",
      id: sourceValidationId,
      runId: sourceValidationId,
      changeId: prepared.topic.changeId,
      profile: "test",
      status: "passed",
      executionMode: "direct",
      startedAt: sourceValidationTime,
      finishedAt: sourceValidationTime,
      commands: [],
    }, null, 2), "utf8");
    await writeFile(join(terminalChangeDir, "reviews", "review.md"), "Status: approved\n", "utf8");
    await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const terminalGoalLoopEvaluation = await compileGoalLoopEvaluation(terminalMemory, terminalChangePath);
    expect(terminalGoalLoopEvaluation.goalLoopDecision).toMatchObject({
      decisionKind: "completed-ready-for-human-close-gate",
      recommendedAction: undefined,
      executionStarted: false,
    });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(snapshot.center.workpad.goalLoop).toMatchObject({
      goalLoopNextStepPacketId: terminalGoalLoopEvaluation.goalLoopNextStepPacket.id,
      closeGateHandoff: expect.objectContaining({
        changeId: prepared.topic.changeId,
        closeActionId: "change.close",
      }),
    });
    expect(snapshot.center.workpad.schedulerRunCompletion).toMatchObject({
      id: completionPayload.completion?.id,
      status: "completed-discarded",
    });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      kind: "approval",
      approvalId: `close:${prepared.topic.changeId}`,
      enabled: true,
      requiresConfirmation: true,
    });
    const actionsBeforeTerminalPromptRuns = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .map((action) => action.actionType)
      .sort();
    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex({ mutateOnExec: false, message: "fake scheduler terminal handoff" });
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    let terminalChatRun!: RunMetadata;
    let terminalChatContext!: string;
    let terminalChatEvents!: Array<Record<string, unknown>>;
    let terminalOrchestratorRun!: RunMetadata;
    let terminalOrchestratorContext!: string;
    let terminalOrchestratorEvents!: Array<Record<string, unknown>>;
    try {
      const terminalChat = await runCodexChat(project(), prepared.topic.changeId, "Explain the terminal scheduler handoff.");
      terminalChatRun = JSON.parse(await readFile(join(terminalMemory.runsRoot, terminalChat.run.id, "run.json"), "utf8")) as RunMetadata;
      terminalChatContext = await readFile(join(terminalMemory.runsRoot, terminalChat.run.id, "context.md"), "utf8");
      terminalChatEvents = await readJsonl(join(terminalMemory.runsRoot, terminalChat.run.id, "events.jsonl"));

      const terminalOrchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Plan from the terminal scheduler handoff.");
      terminalOrchestratorRun = JSON.parse(await readFile(join(terminalMemory.runsRoot, terminalOrchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
      terminalOrchestratorContext = await readFile(join(terminalMemory.runsRoot, terminalOrchestrator.run.id, "context.md"), "utf8");
      terminalOrchestratorEvents = await readJsonl(join(terminalMemory.runsRoot, terminalOrchestrator.run.id, "events.jsonl"));
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
    expect(terminalChatRun.promptStack).toEqual(expect.arrayContaining([
      "goal-loop-next-step-packet",
      "goal-loop-controlled-loop-state",
      "goal-loop-scheduler-terminal-handoff",
    ]));
    expect(terminalChatContext).toContain("### Scheduler Terminal Handoff");
    expect(terminalChatContext).toContain("Terminal kind: completion");
    const terminalChatPrepared = terminalChatEvents.find((event) => event.type === "context.prepared")?.data as Record<string, unknown> | undefined;
    expect(terminalChatPrepared?.goalLoopSchedulerTerminalHandoff).toEqual(expect.objectContaining({
      authority: "non-executing-scheduler-terminal-handoff-prompt-evidence",
      kind: "completion",
      id: completionPayload.completion?.id,
      changeId: prepared.topic.changeId,
      schedulerRunId: prepared.schedulerRun.id,
      status: "completed-discarded",
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    }));
    expect(terminalChatPrepared?.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("readyWorktreeIds");
    expect(terminalChatPrepared?.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("recommendedActionScope");
    expect(terminalChatPrepared?.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("actionPayload");
    expect(terminalChatPrepared?.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("markdown");

    expect(terminalOrchestratorRun.promptStack).toEqual(expect.arrayContaining([
      "goal-loop-next-step-packet",
      "goal-loop-controlled-loop-state",
      "goal-loop-scheduler-terminal-handoff",
    ]));
    expect(terminalOrchestratorContext).toContain("### Scheduler Terminal Handoff");
    const terminalOrchestratorPrepared = terminalOrchestratorEvents.find((event) => event.type === "context.prepared")?.data as Record<string, unknown> | undefined;
    expect(terminalOrchestratorPrepared?.goalLoopSchedulerTerminalHandoff).toEqual(expect.objectContaining({
      kind: "completion",
      id: completionPayload.completion?.id,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    }));
    expect(terminalOrchestratorPrepared?.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("resultTargetWorktreeIds");
    expect(terminalOrchestratorPrepared?.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("scope");
    expect(terminalOrchestratorPrepared?.goalLoopSchedulerTerminalHandoff).not.toHaveProperty("markdown");
    const actionsAfterTerminalPromptRuns = (await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId }))
      .right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .map((action) => action.actionType)
      .sort();
    expect(actionsAfterTerminalPromptRuns).toEqual(actionsBeforeTerminalPromptRuns);
    expect(await listWorkflowRuns(terminalMemory, prepared.topic.changeId)).toHaveLength(0);
    expect(await listTaskQueues(terminalMemory, prepared.topic.changeId)).toHaveLength(0);
    expect(await listAgentTasks(terminalMemory, prepared.topic.changeId)).toHaveLength(0);
    const forbiddenSchedulerFollowUpsAfterDiscardCompletion = new Set([
      "planning.scheduler.worker.start-first",
      "planning.scheduler.worker.start-next",
      "planning.scheduler.worker.reconcile-result",
      "planning.scheduler.worker.validate-first",
      "planning.scheduler.worker.audit-first",
      "planning.scheduler.worker.rework-plan.compile",
      "planning.scheduler.integration-candidate.compile",
      "planning.scheduler.integration-check.run",
      "planning.scheduler.integration-outcome.reconcile",
    ]);
    expect(snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .filter((action) => action.actionType && forbiddenSchedulerFollowUpsAfterDiscardCompletion.has(action.actionType))).toHaveLength(0);
    expect(await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8")).toBe(moduleABeforeDiscard);
    expect(await readFile(join(getTempDir(), "src", "module-b.ts"), "utf8")).toBe(moduleBBeforeDiscard);
    const sourceStatusAfterCompletion = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
    expect(sourceStatusAfterCompletion.stdout.trim()).toBe("");
  }, 600000);
});
