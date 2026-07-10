import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchSchedulerRunCompletionProjection, getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listAgentTasks } from "../../src/agent-task/manager.js";
import { markWorktreeApplied } from "../../src/worktree/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { readLatestWorkflowGraphPlan } from "../../src/workflow-artifacts/manager.js";
import { readSchedulerRuntimeClaimReservation } from "../../src/scheduler-runtime/repository.js";
import { readSchedulerWorkerPathReadModelsForReservation } from "../../src/scheduler-runtime/worker-path-read-model.js";
import { readLatestSchedulerCurrentTransitionView } from "../../src/workflow-runtime/scheduler-current-transition-view.js";
import { execFileAsync, findSchedulerGateAction, getTempDir, prepareSeededSchedulerIntegrationHandoff, project, unwrapWorkflowActionResult } from "../unit/workbench/fixtures.js";

describe("workbench scheduler discard completion slow flow", () => {
  it("records discarded SchedulerRun completion after existing IntegrationCheck discard without mutating source", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Scheduler Discard Completion Acceptance");
    const memory = await resolveProjectMemory(project());
    const changePath = join("harness", "changes", "active", prepared.topic.changeId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, prepared.schedulerRun.id, prepared.claimReservation.id);
    const workerPaths = await readSchedulerWorkerPathReadModelsForReservation(memory, changePath, prepared.schedulerRun.id, reservation);
    expect(workerPaths.map((path) => path.status)).toEqual(["audit-approved", "audit-approved"]);
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

    const afterDiscardMemory = await resolveProjectMemory(project());
    await expect(readLatestWorkflowGraphPlan(afterDiscardMemory, join("harness", "changes", "active", prepared.topic.changeId))).resolves.toMatchObject({ graphMode: "ready-set-v1" });
    const transitionView = await readLatestSchedulerCurrentTransitionView(afterDiscardMemory, join("harness", "changes", "active", prepared.topic.changeId), prepared.schedulerRun.id, "slow acceptance");
    if (transitionView.transition.kind !== "integration-outcome") {
      throw new Error(`Unexpected post-discard transition: ${JSON.stringify(transitionView.transition)}`);
    }
    expect(transitionView.transition).toMatchObject({ kind: "integration-outcome" });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const outcomeAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-outcome.reconcile", (candidate) => candidate.schedulerIntegrationCheckHandoffId === prepared.handoff.handoff?.id));
    if (!outcomeAction) throw new Error(`Missing scheduler integration outcome reconcile action after existing discard; current gate is ${snapshot.center.workpad.nextAction?.actionType ?? "none"}.`);
    const outcomeResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...outcomeAction, confirm: true });
    const outcomeWorkflow = outcomeResult.result as { status?: string; error?: string; result?: unknown };
    if (outcomeWorkflow.status === "failed") throw new Error(outcomeWorkflow.error ?? "discard outcome action failed");
    const outcomePayload = unwrapWorkflowActionResult(outcomeResult.result) as {
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
    let completionPayload = snapshot.center.workpad.schedulerRunCompletion?.schedulerIntegrationOutcomeId === outcomePayload.outcome?.id
      ? {
        completion: snapshot.center.workpad.schedulerRunCompletion,
        schedulerRunStatus: "completed",
        sourceMutated: false,
      }
      : null;
    if (!completionPayload) {
      if (!completeAction) throw new Error("Missing scheduler run completion action after discarded scheduler outcome.");
      const completionResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...completeAction, confirm: true });
      const completionWorkflow = completionResult.result as { status?: string; error?: string; result?: unknown };
      if (completionWorkflow.status === "failed") throw new Error(completionWorkflow.error ?? "discard completion action failed");
      const rawCompletionPayload = unwrapWorkflowActionResult(completionResult.result) as {
        completion?: {
          id?: string;
          status?: string;
          schedulerIntegrationOutcomeId?: string;
          integrationCheckId?: string;
        };
        schedulerRunStatus?: string;
        sourceMutated?: boolean;
      };
      if (rawCompletionPayload.completion) {
        completionPayload = rawCompletionPayload;
      } else {
        snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
        completionPayload = {
          completion: snapshot.center.workpad.schedulerRunCompletion,
          schedulerRunStatus: "completed",
          sourceMutated: false,
        };
      }
    }
    const typedCompletionPayload = completionPayload as {
      completion?: {
        id?: string;
        status?: string;
        schedulerIntegrationOutcomeId?: string;
        integrationCheckId?: string;
      };
      schedulerRunStatus?: string;
      sourceMutated?: boolean;
    };
    expect(typedCompletionPayload).toMatchObject({
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
      typedCompletionPayload.completion?.id,
    );
    expect(completionProjection).toMatchObject({
      id: typedCompletionPayload.completion?.id,
      status: "completed-discarded",
      schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
    });
    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(snapshot.center.workpad.schedulerRunCompletion).toMatchObject({
      id: typedCompletionPayload.completion?.id,
      status: "completed-discarded",
      schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
    });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.run.complete",
      enabled: false,
      schedulerRunCompletionId: typedCompletionPayload.completion?.id,
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
    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(snapshot.center.workpad.schedulerRunCompletion).toMatchObject({
      id: typedCompletionPayload.completion?.id,
      status: "completed-discarded",
    });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      kind: "approval",
      approvalId: `close:${prepared.topic.changeId}`,
      enabled: true,
      requiresConfirmation: true,
    });
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
