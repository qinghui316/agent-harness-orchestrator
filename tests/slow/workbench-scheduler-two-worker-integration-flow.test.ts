import { rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchSchedulerRunCompletionProjection, getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listAgentTasks } from "../../src/agent-task/manager.js";
import { listWorktreeStatuses } from "../../src/worktree/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listTaskRuns } from "../../src/task-run/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { readSchedulerRuntimeEvents } from "../../src/scheduler-runtime/manager.js";
import { listSchedulerIntegrationOutcomes } from "../../src/scheduler-runtime/repository.js";
import { listIntegrationChecks } from "../../src/integration-check/manager.js";
import { createFakeCodex, execFileAsync, findSchedulerGateAction, getTempDir, prepareSchedulerFirstWorkerThroughResult, project, unwrapWorkflowActionResult } from "../unit/workbench/fixtures.js";

describe("workbench scheduler two-worker integration slow flow", () => {
  it("carries a second scheduler worker through current-worker gates and hands refreshed ready targets to IntegrationCheck", async () => {
    const prepared = await prepareSchedulerFirstWorkerThroughResult({
      title: "Scheduler Two Worker Acceptance",
    });

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    try {
      process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;

      let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const firstValidationActions = snapshot.right.confirmationQueue.current.flatMap((item) => item.actions);
      const firstValidationAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.validate-first", (candidate) => candidate.schedulerWorkerResultId === prepared.workerResult.id));
      if (!firstValidationAction) {
        throw new Error(`Missing first worker validation action. workerResultId=${prepared.workerResult.id}; actions=${JSON.stringify(firstValidationActions.map((action) => ({
          actionType: action.actionType,
          schedulerWorkerResultId: action.schedulerWorkerResultId,
          schedulerWorkerStartId: action.schedulerWorkerStartId,
          schedulerWorkerValidationId: action.schedulerWorkerValidationId,
          enabled: action.enabled,
        })))}`);
      }
      const firstValidation = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...firstValidationAction, confirm: true });
      const firstValidationResult = unwrapWorkflowActionResult(firstValidation.result) as {
        schedulerValidation?: { id?: string; validationRunId?: string };
      };

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const firstAuditAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.audit-first", (candidate) => candidate.schedulerWorkerValidationId === firstValidationResult?.schedulerValidation?.id));
      if (!firstAuditAction) throw new Error("Missing first worker audit action.");
      const firstAudit = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...firstAuditAction, confirm: true });
      const firstAuditResult = unwrapWorkflowActionResult(firstAudit.result) as {
        schedulerAudit?: { id?: string; claimIntentId?: string; worktreeId?: string };
      };
      expect(firstAuditResult.schedulerAudit).toMatchObject({
        id: expect.any(String),
        worktreeId: prepared.workerStart.worktreeId,
      });
      await rm(join(getTempDir(), "README.md"), { force: true });
      const firstSourceStatus = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
      if (firstSourceStatus.stdout.trim()) throw new Error(`source dirty before first candidate: ${firstSourceStatus.stdout}`);

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const firstWorkerTerminalActions = snapshot.right.confirmationQueue.current.flatMap((item) => item.actions);
      const forbiddenBeforeSameWaveTerminal = new Set([
        "planning.scheduler.integration-candidate.compile",
        "planning.scheduler.integration-check.run",
        "planning.scheduler.run.complete",
        "planning.scheduler.run.close-blocked",
      ]);
      expect(firstWorkerTerminalActions.some((action) => action.actionType && forbiddenBeforeSameWaveTerminal.has(action.actionType))).toBe(false);

      const memory = await resolveProjectMemory(project());
      const changePath = join("harness", "changes", "active", prepared.topic.changeId);
      const secondStart = { workerStart: prepared.secondWorkerStart };
      expect(secondStart.workerStart).toMatchObject({
        schedulerClaimReservationId: prepared.claimReservation.id,
      });
      expect(secondStart.workerStart?.id).not.toBe(prepared.workerStart.id);
      expect(secondStart.workerStart?.worktreeId).not.toBe(prepared.workerStart.worktreeId);

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.reconcile-result",
        label: "检查当前 worker 结果",
        schedulerWorkerStartId: secondStart.workerStart?.id,
      });
      const secondResultAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.reconcile-result", (candidate) => candidate.schedulerWorkerStartId === secondStart.workerStart?.id));
      if (!secondResultAction) throw new Error("Missing second worker result reconcile action.");
      const secondResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...secondResultAction, confirm: true });
      const secondWorkerResult = unwrapWorkflowActionResult(secondResult.result) as {
        result?: {
          result?: { id?: string; status?: string };
          taskRun?: { id?: string; status?: string };
          lease?: { id?: string; status?: string };
        };
      };
      expect(secondWorkerResult).toMatchObject({
        result: { status: "evidence-ready", id: expect.any(String) },
        taskRun: { id: secondStart.workerStart?.taskRunId, status: "evidence-ready" },
        lease: { id: secondStart.workerStart?.workerLeaseId, status: "released" },
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const secondValidationAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.validate-first", (candidate) => candidate.schedulerWorkerResultId === secondWorkerResult?.result?.id));
      if (!secondValidationAction) throw new Error("Missing second worker validation action.");
      expect(secondValidationAction).toMatchObject({
        schedulerWorkerStartId: secondStart.workerStart?.id,
        taskRunId: secondStart.workerStart?.taskRunId,
        worktreeId: secondStart.workerStart?.worktreeId,
        runId: secondStart.workerStart?.runId,
      });
      const secondValidation = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...secondValidationAction, confirm: true });
      const secondValidationResult = unwrapWorkflowActionResult(secondValidation.result) as {
        result?: {
          schedulerValidation?: { id?: string; status?: string; validationRunId?: string };
          taskRun?: { id?: string; status?: string };
        };
      };
      expect(secondValidationResult).toMatchObject({
        schedulerValidation: { status: "passed", id: expect.any(String) },
        taskRun: { id: secondStart.workerStart?.taskRunId, status: "evidence-ready" },
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const secondAuditAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.audit-first", (candidate) => candidate.schedulerWorkerValidationId === secondValidationResult?.schedulerValidation?.id));
      if (!secondAuditAction) throw new Error("Missing second worker audit action.");
      expect(secondAuditAction).toMatchObject({
        schedulerWorkerStartId: secondStart.workerStart?.id,
        schedulerWorkerResultId: secondWorkerResult?.result?.id,
        schedulerWorkerValidationId: secondValidationResult?.schedulerValidation?.id,
        validationRunId: secondValidationResult?.schedulerValidation?.validationRunId,
        worktreeId: secondStart.workerStart?.worktreeId,
      });
      const secondAudit = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...secondAuditAction, confirm: true });
      const secondAuditResult = unwrapWorkflowActionResult(secondAudit.result) as {
        schedulerAudit?: { id?: string; status?: string; claimIntentId?: string; worktreeId?: string };
        taskRun?: { id?: string; status?: string };
      };
      expect(secondAuditResult).toMatchObject({
        schedulerAudit: {
          status: "approved",
          id: expect.any(String),
          worktreeId: secondStart.workerStart?.worktreeId,
        },
        taskRun: { id: secondStart.workerStart?.taskRunId, status: "completed" },
      });
      await rm(join(getTempDir(), "README.md"), { force: true });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.integration-candidate.compile",
        label: "生成 scheduler integration 候选",
        schedulerRunId: prepared.schedulerRun.id,
      });
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.start-next")).toBe(false);
      const refreshedCandidateAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-candidate.compile", (candidate) => candidate.schedulerRunId === prepared.schedulerRun.id));
      if (!refreshedCandidateAction) throw new Error("Missing refreshed scheduler integration candidate action.");
      const refreshedCandidateResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...refreshedCandidateAction, confirm: true });
      const refreshedCandidateWorkflow = refreshedCandidateResult.result as { status?: string; error?: string; result?: unknown };
      if (refreshedCandidateWorkflow.status === "failed") throw new Error(refreshedCandidateWorkflow.error ?? "refreshed candidate action failed");
      expect(refreshedCandidateWorkflow).toMatchObject({ status: "completed" });
      const refreshedCandidatePayload = unwrapWorkflowActionResult(refreshedCandidateResult.result) as {
        candidate?: {
          id?: string;
          status?: string;
          readyCount?: number;
          blockedCount?: number;
          readyWorktreeIds?: string[];
          outputs?: Array<{ claimIntentId?: string }>;
        };
      };
      const refreshedCandidate = refreshedCandidatePayload.candidate;
      expect(refreshedCandidate).toMatchObject({
        status: "ready",
        readyCount: 2,
        blockedCount: 0,
      });
      expect(refreshedCandidate?.readyWorktreeIds?.sort()).toEqual([prepared.workerStart.worktreeId, secondStart.workerStart?.worktreeId].sort());
      expect(refreshedCandidate?.outputs?.map((output) => output.claimIntentId).sort()).toEqual([prepared.workerStart.claimIntentId, secondStart.workerStart?.claimIntentId].sort());

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.integration-check.run",
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerRunId: prepared.schedulerRun.id,
      });
      const handoffAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-check.run", (candidate) => candidate.schedulerIntegrationCandidateId === refreshedCandidate?.id));
      if (!handoffAction) throw new Error("Missing scheduler IntegrationCheck handoff action.");
      expect(handoffAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });

      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...handoffAction,
        worktreeIds: [...(handoffAction.worktreeIds ?? []), "forged-worktree"],
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|worktreeIds target scope mismatch|forged-worktree/i);
      await expect(listIntegrationChecks(memory)).resolves.toHaveLength(0);

      const handoffResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...handoffAction, confirm: true });
      const handoffWorkflow = handoffResult.result as { status?: string; error?: string; result?: unknown };
      if (handoffWorkflow.status === "failed") throw new Error(handoffWorkflow.error ?? "handoff action failed");
      expect(handoffWorkflow).toMatchObject({ status: "completed" });
      const handoff = unwrapWorkflowActionResult(handoffResult.result) as {
        handoff?: {
          id?: string;
          schedulerIntegrationCandidateId?: string;
          readyWorktreeIds?: string[];
          resultTargetWorktreeIds?: string[];
          integrationCheckId?: string;
        };
        integrationCheck?: { id?: string; status?: string; summary?: string; blockingIssues?: string[]; resultTargets?: Array<{ worktreeId?: string }> };
      };
      if (handoff.integrationCheck?.status !== "passed") {
        throw new Error(`Scheduler IntegrationCheck did not pass: ${JSON.stringify(handoff.integrationCheck)}`);
      }
      expect(handoff.handoff).toMatchObject({
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        readyWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        resultTargetWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        integrationCheckId: handoff.integrationCheck?.id,
      });
      expect(handoff.integrationCheck?.resultTargets?.map((target) => target.worktreeId).sort()).toEqual(refreshedCandidate?.readyWorktreeIds?.sort());
      const sourceStatusAfterHandoff = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
      expect(sourceStatusAfterHandoff.stdout.trim()).toBe("");

      const finalMemory = await resolveProjectMemory(project());
      expect(await listWorkflowRuns(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listTaskQueues(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listTaskRuns(finalMemory, prepared.topic.changeId)).toHaveLength(2);
      expect(await listWorktreeStatuses(finalMemory)).toHaveLength(2);
      expect(await listIntegrationChecks(finalMemory)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: handoff.handoff?.integrationCheckId,
          resultTargets: expect.arrayContaining([
            expect.objectContaining({ worktreeId: prepared.workerStart.worktreeId }),
            expect.objectContaining({ worktreeId: secondStart.workerStart?.worktreeId }),
          ]),
        }),
      ]));

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "integration-apply",
        applyCheckId: handoff.handoff?.integrationCheckId,
      });
      const applyAction = snapshot.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "apply-check.apply")?.action;
      const discardAction = snapshot.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "apply-check.discard")?.action;
      expect(applyAction).toMatchObject({ actionId: "apply-check.apply", command: "apply-check" });
      expect(discardAction).toMatchObject({ actionId: "apply-check.discard", command: "apply-check" });
      expect(snapshot.right.confirmationQueue.primary?.actions.some((action) => action.actionType?.includes("scheduler") || action.action?.actionId?.includes("scheduler"))).toBe(false);
      if (!applyAction) throw new Error("Missing existing IntegrationCheck apply action.");

      await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: applyAction, confirm: true });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.integration-outcome.reconcile",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      const outcomeAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.integration-outcome.reconcile"
          && action.schedulerIntegrationCheckHandoffId === handoff.handoff?.id);
      if (!outcomeAction) throw new Error("Missing concrete scheduler integration outcome reconcile action after existing apply.");
      expect(outcomeAction).toMatchObject({
        actionType: "planning.scheduler.integration-outcome.reconcile",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...outcomeAction,
        schedulerIntegrationCandidateId: "forged-candidate",
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|SchedulerIntegrationCandidate target scope mismatch|forged-candidate/i);
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...outcomeAction,
        applyCheckId: "forged-apply-check",
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|applyCheckId target scope mismatch|forged-apply-check/i);
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...outcomeAction,
        worktreeIds: [...(outcomeAction.worktreeIds ?? []), "forged-worktree"],
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|worktreeIds target scope mismatch|forged-worktree/i);
      await expect(listSchedulerIntegrationOutcomes(memory, changePath, prepared.schedulerRun.id)).resolves.toHaveLength(0);

      const outcomeResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...outcomeAction, confirm: true });
      const outcomeWorkflow = outcomeResult.result as { status?: string; error?: string; result?: unknown };
      if (outcomeWorkflow.status === "failed") throw new Error(outcomeWorkflow.error ?? "outcome action failed");
      const outcomePayload = unwrapWorkflowActionResult(outcomeResult.result) as {
        outcome?: {
          id?: string;
          status?: string;
          schedulerReconcileSnapshotId?: string;
          schedulerClaimReservationId?: string;
          schedulerIntegrationCandidateId?: string;
          schedulerIntegrationCheckHandoffId?: string;
          integrationCheckId?: string;
          readyWorktreeIds?: string[];
          resultTargetWorktreeIds?: string[];
        };
      };
      if (!outcomePayload.outcome) {
        throw new Error(`Scheduler integration outcome action did not return outcome payload: ${JSON.stringify(outcomeResult.result)}`);
      }
      expect(outcomePayload.outcome).toMatchObject({
        status: "applied",
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        integrationCheckId: handoff.handoff?.integrationCheckId,
        readyWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        resultTargetWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.run.complete",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      const completeAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.run.complete"
          && action.schedulerIntegrationOutcomeId === outcomePayload.outcome?.id);
      if (!completeAction) throw new Error("Missing concrete scheduler run completion action after scheduler outcome.");
      expect(completeAction).toMatchObject({
        actionType: "planning.scheduler.run.complete",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...completeAction,
        schedulerReconcileSnapshotId: "forged-reconcile-snapshot",
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|schedulerReconcileSnapshotId target scope mismatch|forged-reconcile-snapshot/i);
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...completeAction,
        schedulerClaimReservationId: "forged-claim-reservation",
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|schedulerClaimReservationId target scope mismatch|forged-claim-reservation/i);
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...completeAction,
        schedulerIntegrationCandidateId: "forged-candidate",
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|SchedulerIntegrationCandidate target scope mismatch|forged-candidate/i);
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...completeAction,
        schedulerIntegrationCheckHandoffId: "forged-handoff",
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|SchedulerIntegrationCheckHandoff target scope mismatch|forged-handoff/i);
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...completeAction,
        applyCheckId: "forged-apply-check",
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|applyCheckId target scope mismatch|forged-apply-check/i);
      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...completeAction,
        worktreeIds: [...(completeAction.worktreeIds ?? []), "forged-worktree"],
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|worktreeIds target scope mismatch|forged-worktree/i);

      const completionResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...completeAction, confirm: true });
      const completionWorkflow = completionResult.result as { status?: string; error?: string; result?: unknown };
      if (completionWorkflow.status === "failed") throw new Error(completionWorkflow.error ?? "completion action failed");
      const completionPayload = unwrapWorkflowActionResult(completionResult.result) as {
        completion?: {
          id?: string;
          status?: string;
          schedulerIntegrationOutcomeId?: string;
          integrationCheckId?: string;
          readyWorktreeIds?: string[];
          resultTargetWorktreeIds?: string[];
        };
        schedulerRunStatus?: string;
        sourceMutated?: boolean;
      };
      expect(completionPayload).toMatchObject({
        schedulerRunStatus: "completed",
        sourceMutated: false,
        completion: {
          status: "completed-applied",
          schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
          integrationCheckId: handoff.handoff?.integrationCheckId,
          readyWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
          resultTargetWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
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
        schedulerRunId: prepared.schedulerRun.id,
        status: "completed-applied",
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
      });
      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.schedulerRunCompletion).toMatchObject({
        id: completionPayload.completion?.id,
        status: "completed-applied",
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
      });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        kind: "approval",
        enabled: true,
        requiresConfirmation: true,
      });
      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions)).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: expect.objectContaining({ actionId: "audit.accept" }) }),
      ]));
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.run.complete")).toBe(false);
      const forbiddenSchedulerFollowUpsAfterCompletion = new Set([
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
      const executableSchedulerFollowUpsAfterCompletion = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .filter((action) => action.actionType && forbiddenSchedulerFollowUpsAfterCompletion.has(action.actionType));
      expect(executableSchedulerFollowUpsAfterCompletion).toHaveLength(0);
      expect(await listWorkflowRuns(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listTaskQueues(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      const schedulerRuntimeEvents = await readSchedulerRuntimeEvents(
        finalMemory,
        join("harness", "changes", "active", prepared.topic.changeId),
        prepared.schedulerRun.id,
      );
      expect(schedulerRuntimeEvents.filter((event) => event.type === "scheduler-runtime.integration-candidate-compiled")).toHaveLength(1);
      expect(schedulerRuntimeEvents.some((event) => (
        event.type === "scheduler-runtime.integration-check-handoff-completed"
        && event.payload?.schedulerIntegrationCheckHandoffId === handoff.handoff?.id
        && event.payload?.integrationCheckId === handoff.handoff?.integrationCheckId
      ))).toBe(true);
      expect(schedulerRuntimeEvents.some((event) => (
        event.type === "scheduler-runtime.integration-outcome-recorded"
        && event.payload?.schedulerIntegrationCheckHandoffId === handoff.handoff?.id
        && event.payload?.outcomeStatus === "applied"
      ))).toBe(true);
      expect(schedulerRuntimeEvents.some((event) => (
        event.type === "scheduler-runtime.run-completed"
        && event.payload?.schedulerIntegrationOutcomeId === outcomePayload.outcome?.id
        && event.payload?.completionStatus === "completed-applied"
      ))).toBe(true);
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  }, 600000);
});
