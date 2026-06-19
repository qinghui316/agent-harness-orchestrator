import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { runCodexChat, runOrchestratorPlan } from "../../src/workbench/codex-chat/bridge.js";
import { getWorkbenchSchedulerRunCompletionProjection, getWorkbenchSchedulerWorkerReworkPlanProjection, getWorkbenchSchedulerWorkerReworkResultProjection, getWorkbenchSchedulerWorkerReworkStartProjection, getWorkbenchSchedulerWorkerReworkValidationProjection, getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listAgentTasks } from "../../src/agent-task/manager.js";
import { listWorktreeStatuses, markWorktreeApplied } from "../../src/worktree/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../../src/task-run/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { readSchedulerRuntimeEvents } from "../../src/scheduler-runtime/manager.js";
import { validateSchedulerFirstWorkerRework } from "../../src/scheduler-runtime/worker-rework-validation.js";
import { listSchedulerIntegrationOutcomes } from "../../src/scheduler-runtime/repository.js";
import { listIntegrationChecks } from "../../src/integration-check/manager.js";
import { compileGoalLoopEvaluation } from "../../src/goal-loop/manager.js";
import { createFakeCodex, execFileAsync, getTempDir, prepareSchedulerFirstWorkerThroughResult, prepareSchedulerTwoWorkerIntegrationHandoff, project, readJsonl } from "../unit/workbench/fixtures.js";
import type { RunMetadata } from "../../src/types/index.js";

describe("workbench scheduler slow flows", () => {
  it("carries a second scheduler worker through current-worker gates and hands refreshed ready targets to IntegrationCheck", async () => {
    const prepared = await prepareSchedulerFirstWorkerThroughResult({
      title: "Scheduler Two Worker Acceptance",
    });

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    try {
      process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;

      let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const firstValidationAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.validate-first" && action.schedulerWorkerResultId === prepared.workerResult.id);
      if (!firstValidationAction) throw new Error("Missing first worker validation action.");
      const firstValidation = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...firstValidationAction, confirm: true });
      const firstValidationResult = (firstValidation.result as {
        result?: {
          schedulerValidation?: { id?: string; validationRunId?: string };
        };
      }).result;

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const firstAuditAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.audit-first" && action.schedulerWorkerValidationId === firstValidationResult?.schedulerValidation?.id);
      if (!firstAuditAction) throw new Error("Missing first worker audit action.");
      const firstAudit = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...firstAuditAction, confirm: true });
      const firstAuditResult = ((firstAudit.result as { result?: unknown }).result ?? firstAudit.result) as {
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
      const firstCandidateAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.integration-candidate.compile" && action.schedulerRunId === prepared.schedulerRun.id);
      if (!firstCandidateAction) throw new Error("Missing first scheduler integration candidate action.");
      const firstCandidateResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...firstCandidateAction, confirm: true });
      const firstCandidateWorkflow = firstCandidateResult.result as { status?: string; error?: string; result?: unknown };
      if (firstCandidateWorkflow.status === "failed") throw new Error(firstCandidateWorkflow.error ?? "first candidate action failed");
      expect(firstCandidateWorkflow).toMatchObject({ status: "completed" });
      const firstCandidatePayload = (firstCandidateWorkflow.result ?? firstCandidateResult.result) as {
        candidate?: {
          id?: string;
          status?: string;
          readyCount?: number;
          blockedCount?: number;
          readyWorktreeIds?: string[];
          outputs?: Array<{ claimIntentId?: string }>;
        };
      };
      const firstCandidate = firstCandidatePayload.candidate;
      if (firstCandidate?.readyCount !== 1) {
        throw new Error(`first candidate not ready: ${JSON.stringify(firstCandidate?.outputs ?? firstCandidate)}`);
      }
      expect(firstCandidate).toMatchObject({
        status: "waiting",
        readyCount: 1,
        blockedCount: 0,
        readyWorktreeIds: [prepared.workerStart.worktreeId],
      });
      expect(firstCandidate?.outputs?.map((output) => output.claimIntentId)).toEqual([prepared.workerStart.claimIntentId]);

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.start-next",
        label: "启动下一个 worker",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
      });
      const startNextAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.start-next" && action.schedulerRunId === prepared.schedulerRun.id);
      if (!startNextAction) throw new Error("Missing scheduler start-next action.");
      expect(startNextAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        schedulerIntegrationCandidateId: firstCandidate?.id,
      });
      expect(startNextAction.reservationIntentId).not.toBe(prepared.workerStart.reservationIntentId);
      expect(startNextAction.claimIntentId).not.toBe(prepared.workerStart.claimIntentId);

      const memory = await resolveProjectMemory(project());
      const changePath = join("harness", "changes", "active", prepared.topic.changeId);
      const goalLoopEvaluation = await compileGoalLoopEvaluation(memory, changePath);
      expect(goalLoopEvaluation.goalLoopNextStepPacket).toMatchObject({
        recommendedAction: {
          actionType: "planning.scheduler.worker.start-next",
          scope: {
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerClaimReservationId: prepared.claimReservation.id,
            reservationIntentId: startNextAction.reservationIntentId,
            claimIntentId: startNextAction.claimIntentId,
          },
        },
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.goalLoop).toMatchObject({
        goalLoopNextStepPacketId: goalLoopEvaluation.goalLoopNextStepPacket.id,
        recommendedActionType: "planning.scheduler.worker.start-next",
        schedulerLoopEvidenceSnapshot: {
          posture: "awaiting-human-gate",
          decisionKind: "scheduler-next-step",
          currentLegalActionType: "planning.scheduler.worker.start-next",
          loopAuthorized: false,
          fullParallelExecutorAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          harnessEvolutionAuthorized: false,
        },
        recommendedActionScope: expect.objectContaining({
          changeId: prepared.topic.changeId,
          schedulerRunId: prepared.schedulerRun.id,
          schedulerClaimReservationId: prepared.claimReservation.id,
          reservationIntentId: startNextAction.reservationIntentId,
          claimIntentId: startNextAction.claimIntentId,
        }),
        routingPosture: "single-worker-gate",
        routingLabel: "Single scoped worker gate",
      });
      const controllerRefreshAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.controller.refresh" && action.goalLoopCurrentGateActionType === "planning.scheduler.worker.start-next");
      if (!controllerRefreshAction) throw new Error("Missing Goal Loop controller refresh action for scheduler start-next.");
      expect(controllerRefreshAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        reservationIntentId: startNextAction.reservationIntentId,
        claimIntentId: startNextAction.claimIntentId,
      });
      expect(controllerRefreshAction).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      const controllerRefresh = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...controllerRefreshAction, confirm: true });
      const controllerPolicy = (((controllerRefresh.result as { result?: unknown }).result ?? controllerRefresh.result) as {
        goalLoopControllerPolicy?: { id?: string; verdict?: string; gateStatus?: string; executionStarted?: boolean };
      }).goalLoopControllerPolicy;
      expect(controllerPolicy).toMatchObject({
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const gateReadinessAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.gate-readiness.prepare" && action.goalLoopCurrentGateActionType === "planning.scheduler.worker.start-next");
      if (!gateReadinessAction) throw new Error("Missing Goal Loop gate readiness action for scheduler start-next.");
      expect(gateReadinessAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        reservationIntentId: startNextAction.reservationIntentId,
        claimIntentId: startNextAction.claimIntentId,
        goalLoopControllerPolicyId: controllerPolicy?.id,
      });
      const gateReadiness = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...gateReadinessAction, confirm: true });
      if ((gateReadiness.result as { status?: string; error?: string }).status !== "completed") {
        throw new Error((gateReadiness.result as { error?: string }).error ?? "Goal Loop gate readiness action failed.");
      }
      expect(gateReadiness.result).toMatchObject({ status: "completed" });
      const preflight = ((gateReadiness.result as {
        result?: {
          goalLoopGateReadinessPreflight?: {
            id?: string;
            currentGate?: { actionType?: string; scope?: Record<string, unknown> };
            concreteGateInvoked?: boolean;
            toolPolicyAuthorizedConcreteGate?: boolean;
            executionStarted?: boolean;
          };
        };
      }).result)?.goalLoopGateReadinessPreflight;
      expect(preflight).toMatchObject({
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: expect.objectContaining({
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerClaimReservationId: prepared.claimReservation.id,
            reservationIntentId: startNextAction.reservationIntentId,
            claimIntentId: startNextAction.claimIntentId,
          }),
        },
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const assistedStartNextAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.start-next" && action.goalLoopGateReadinessPreflightId === preflight?.id);
      if (!assistedStartNextAction) throw new Error("Missing assisted scheduler start-next action.");
      expect(assistedStartNextAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        reservationIntentId: startNextAction.reservationIntentId,
        claimIntentId: startNextAction.claimIntentId,
        goalLoopNextStepPacketId: goalLoopEvaluation.goalLoopNextStepPacket.id,
        goalLoopControllerPolicyId: controllerPolicy?.id,
        goalLoopGateReadinessPreflightId: preflight?.id,
      });
      expect(assistedStartNextAction).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.goal-loop.gate.invoke")).toBe(false);

      const secondStartResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...assistedStartNextAction, confirm: true });
      const secondStart = (((secondStartResult.result as { result?: unknown }).result ?? secondStartResult.result) as {
        workerStart?: {
          id?: string;
          schedulerClaimReservationId?: string;
          reservationIntentId?: string;
          claimIntentId?: string;
          taskRunId?: string;
          workerLeaseId?: string;
          worktreeId?: string;
          runId?: string;
        };
        code?: { run?: { executionGate?: Record<string, unknown> } };
      });
      expect(secondStart.workerStart).toMatchObject({
        schedulerClaimReservationId: prepared.claimReservation.id,
        reservationIntentId: assistedStartNextAction.reservationIntentId,
        claimIntentId: assistedStartNextAction.claimIntentId,
      });
      expect(secondStart.workerStart?.id).not.toBe(prepared.workerStart.id);
      expect(secondStart.workerStart?.worktreeId).not.toBe(prepared.workerStart.worktreeId);
      expect(secondStart.code?.run?.executionGate).toMatchObject({
        mode: "scheduler-claim-reservation",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        reservationIntentId: startNextAction.reservationIntentId,
        claimIntentId: startNextAction.claimIntentId,
        taskRunId: secondStart.workerStart?.taskRunId,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.reconcile-result",
        label: "检查当前 worker 结果",
        schedulerWorkerStartId: secondStart.workerStart?.id,
      });
      const secondResultAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.reconcile-result" && action.schedulerWorkerStartId === secondStart.workerStart?.id);
      if (!secondResultAction) throw new Error("Missing second worker result reconcile action.");
      const secondResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...secondResultAction, confirm: true });
      const secondWorkerResult = (secondResult.result as {
        result?: {
          result?: { id?: string; status?: string };
          taskRun?: { id?: string; status?: string };
          lease?: { id?: string; status?: string };
        };
      }).result;
      expect(secondWorkerResult).toMatchObject({
        result: { status: "evidence-ready", id: expect.any(String) },
        taskRun: { id: secondStart.workerStart?.taskRunId, status: "evidence-ready" },
        lease: { id: secondStart.workerStart?.workerLeaseId, status: "released" },
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const secondValidationAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.validate-first" && action.schedulerWorkerResultId === secondWorkerResult?.result?.id);
      if (!secondValidationAction) throw new Error("Missing second worker validation action.");
      expect(secondValidationAction).toMatchObject({
        schedulerWorkerStartId: secondStart.workerStart?.id,
        taskRunId: secondStart.workerStart?.taskRunId,
        worktreeId: secondStart.workerStart?.worktreeId,
        runId: secondStart.workerStart?.runId,
      });
      const secondValidation = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...secondValidationAction, confirm: true });
      const secondValidationResult = (secondValidation.result as {
        result?: {
          schedulerValidation?: { id?: string; status?: string; validationRunId?: string };
          taskRun?: { id?: string; status?: string };
        };
      }).result;
      expect(secondValidationResult).toMatchObject({
        schedulerValidation: { status: "passed", id: expect.any(String) },
        taskRun: { id: secondStart.workerStart?.taskRunId, status: "evidence-ready" },
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const secondAuditAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.audit-first" && action.schedulerWorkerValidationId === secondValidationResult?.schedulerValidation?.id);
      if (!secondAuditAction) throw new Error("Missing second worker audit action.");
      expect(secondAuditAction).toMatchObject({
        schedulerWorkerStartId: secondStart.workerStart?.id,
        schedulerWorkerResultId: secondWorkerResult?.result?.id,
        schedulerWorkerValidationId: secondValidationResult?.schedulerValidation?.id,
        validationRunId: secondValidationResult?.schedulerValidation?.validationRunId,
        worktreeId: secondStart.workerStart?.worktreeId,
      });
      const secondAudit = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...secondAuditAction, confirm: true });
      const secondAuditResult = ((secondAudit.result as { result?: unknown }).result ?? secondAudit.result) as {
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
        .find((action) => action.actionType === "planning.scheduler.integration-candidate.compile" && action.schedulerRunId === prepared.schedulerRun.id);
      if (!refreshedCandidateAction) throw new Error("Missing refreshed scheduler integration candidate action.");
      const refreshedCandidateResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...refreshedCandidateAction, confirm: true });
      const refreshedCandidateWorkflow = refreshedCandidateResult.result as { status?: string; error?: string; result?: unknown };
      if (refreshedCandidateWorkflow.status === "failed") throw new Error(refreshedCandidateWorkflow.error ?? "refreshed candidate action failed");
      expect(refreshedCandidateWorkflow).toMatchObject({ status: "completed" });
      const refreshedCandidatePayload = (refreshedCandidateWorkflow.result ?? refreshedCandidateResult.result) as {
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
        .find((action) => action.actionType === "planning.scheduler.integration-check.run" && action.schedulerIntegrationCandidateId === refreshedCandidate?.id);
      if (!handoffAction) throw new Error("Missing scheduler IntegrationCheck handoff action.");
      expect(handoffAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });

      const integrationGoalLoopEvaluation = await compileGoalLoopEvaluation(memory, changePath);
      expect(integrationGoalLoopEvaluation.goalLoopNextStepPacket).toMatchObject({
        recommendedAction: {
          actionType: "planning.scheduler.integration-check.run",
          scope: {
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerIntegrationCandidateId: refreshedCandidate?.id,
            worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
          },
        },
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.goalLoop).toMatchObject({
        goalLoopNextStepPacketId: integrationGoalLoopEvaluation.goalLoopNextStepPacket.id,
        recommendedActionType: "planning.scheduler.integration-check.run",
        recommendedActionScope: expect.objectContaining({
          changeId: prepared.topic.changeId,
          schedulerRunId: prepared.schedulerRun.id,
          schedulerIntegrationCandidateId: refreshedCandidate?.id,
          worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        }),
        routingPosture: "integration-check-required",
        routingLabel: "IntegrationCheck path required",
      });
      const integrationControllerRefreshAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.controller.refresh" && action.goalLoopCurrentGateActionType === "planning.scheduler.integration-check.run");
      if (!integrationControllerRefreshAction) throw new Error("Missing Goal Loop controller refresh action for scheduler IntegrationCheck.");
      expect(integrationControllerRefreshAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      const integrationControllerRefresh = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...integrationControllerRefreshAction, confirm: true });
      const integrationControllerPolicy = (((integrationControllerRefresh.result as { result?: unknown }).result ?? integrationControllerRefresh.result) as {
        goalLoopControllerPolicy?: { id?: string; verdict?: string; gateStatus?: string; executionStarted?: boolean };
      }).goalLoopControllerPolicy;
      expect(integrationControllerPolicy).toMatchObject({
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const integrationGateReadinessAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.gate-readiness.prepare" && action.goalLoopCurrentGateActionType === "planning.scheduler.integration-check.run");
      if (!integrationGateReadinessAction) throw new Error("Missing Goal Loop gate readiness action for scheduler IntegrationCheck.");
      expect(integrationGateReadinessAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        goalLoopControllerPolicyId: integrationControllerPolicy?.id,
      });
      const integrationGateReadiness = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...integrationGateReadinessAction, confirm: true });
      if ((integrationGateReadiness.result as { status?: string; error?: string }).status !== "completed") {
        throw new Error((integrationGateReadiness.result as { error?: string }).error ?? "Goal Loop IntegrationCheck gate readiness action failed.");
      }
      const integrationPreflight = ((integrationGateReadiness.result as {
        result?: {
          goalLoopGateReadinessPreflight?: {
            id?: string;
            currentGate?: { actionType?: string; scope?: Record<string, unknown> };
            concreteGateInvoked?: boolean;
            toolPolicyAuthorizedConcreteGate?: boolean;
            executionStarted?: boolean;
          };
        };
      }).result)?.goalLoopGateReadinessPreflight;
      expect(integrationPreflight).toMatchObject({
        currentGate: {
          actionType: "planning.scheduler.integration-check.run",
          scope: expect.objectContaining({
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerIntegrationCandidateId: refreshedCandidate?.id,
            worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
          }),
        },
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const assistedHandoffAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.integration-check.run" && action.goalLoopGateReadinessPreflightId === integrationPreflight?.id);
      if (!assistedHandoffAction) throw new Error("Missing assisted scheduler IntegrationCheck action.");
      expect(assistedHandoffAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        goalLoopNextStepPacketId: integrationGoalLoopEvaluation.goalLoopNextStepPacket.id,
        goalLoopControllerPolicyId: integrationControllerPolicy?.id,
        goalLoopGateReadinessPreflightId: integrationPreflight?.id,
      });
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.goal-loop.gate.invoke")).toBe(false);

      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...assistedHandoffAction,
        worktreeIds: [...(assistedHandoffAction.worktreeIds ?? []), "forged-worktree"],
        confirm: true,
      })).rejects.toThrow(/stale|scope mismatch|worktreeIds target scope mismatch|forged-worktree/i);
      await expect(listIntegrationChecks(memory)).resolves.toHaveLength(0);

      const handoffResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...assistedHandoffAction, confirm: true });
      const handoffWorkflow = handoffResult.result as { status?: string; error?: string; result?: unknown };
      if (handoffWorkflow.status === "failed") throw new Error(handoffWorkflow.error ?? "handoff action failed");
      expect(handoffWorkflow).toMatchObject({ status: "completed" });
      const handoff = (handoffWorkflow.result ?? handoffResult.result) as {
        handoff?: {
          id?: string;
          schedulerIntegrationCandidateId?: string;
          readyWorktreeIds?: string[];
          resultTargetWorktreeIds?: string[];
          integrationCheckId?: string;
        };
        integrationCheck?: { id?: string; resultTargets?: Array<{ worktreeId?: string }> };
      };
      expect(handoff.handoff).toMatchObject({
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        readyWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        resultTargetWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        integrationCheckId: handoff.integrationCheck?.id,
      });
      expect(handoff.integrationCheck?.resultTargets?.map((target) => target.worktreeId).sort()).toEqual(refreshedCandidate?.readyWorktreeIds?.sort());
      const sourceStatusAfterAssistedHandoff = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
      expect(sourceStatusAfterAssistedHandoff.stdout.trim()).toBe("");

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

      const outcomeGoalLoopEvaluation = await compileGoalLoopEvaluation(memory, changePath);
      expect(outcomeGoalLoopEvaluation.goalLoopNextStepPacket).toMatchObject({
        recommendedAction: {
          actionType: "planning.scheduler.integration-outcome.reconcile",
          scope: {
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerIntegrationCandidateId: refreshedCandidate?.id,
            schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
            applyCheckId: handoff.handoff?.integrationCheckId,
            worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
          },
        },
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.integration-outcome.reconcile",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      expect(snapshot.center.workpad.goalLoop).toMatchObject({
        goalLoopNextStepPacketId: outcomeGoalLoopEvaluation.goalLoopNextStepPacket.id,
        recommendedActionType: "planning.scheduler.integration-outcome.reconcile",
        recommendedActionScope: expect.objectContaining({
          changeId: prepared.topic.changeId,
          schedulerRunId: prepared.schedulerRun.id,
          schedulerIntegrationCandidateId: refreshedCandidate?.id,
          schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
          applyCheckId: handoff.handoff?.integrationCheckId,
          worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        }),
        routingPosture: "integration-check-required",
        routingLabel: "IntegrationCheck path required",
      });
      const outcomeControllerRefreshAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.controller.refresh" && action.goalLoopCurrentGateActionType === "planning.scheduler.integration-outcome.reconcile");
      if (!outcomeControllerRefreshAction) throw new Error("Missing Goal Loop controller refresh action for scheduler integration outcome.");
      expect(outcomeControllerRefreshAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      const outcomeControllerRefresh = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...outcomeControllerRefreshAction, confirm: true });
      const outcomeControllerPolicy = (((outcomeControllerRefresh.result as { result?: unknown }).result ?? outcomeControllerRefresh.result) as {
        goalLoopControllerPolicy?: { id?: string; verdict?: string; gateStatus?: string; executionStarted?: boolean };
      }).goalLoopControllerPolicy;
      expect(outcomeControllerPolicy).toMatchObject({
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const outcomeGateReadinessAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.gate-readiness.prepare" && action.goalLoopCurrentGateActionType === "planning.scheduler.integration-outcome.reconcile");
      if (!outcomeGateReadinessAction) throw new Error("Missing Goal Loop gate readiness action for scheduler integration outcome.");
      expect(outcomeGateReadinessAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        goalLoopControllerPolicyId: outcomeControllerPolicy?.id,
      });
      const outcomeGateReadiness = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...outcomeGateReadinessAction, confirm: true });
      if ((outcomeGateReadiness.result as { status?: string; error?: string }).status !== "completed") {
        throw new Error((outcomeGateReadiness.result as { error?: string }).error ?? "Goal Loop outcome gate readiness action failed.");
      }
      const outcomePreflight = ((outcomeGateReadiness.result as {
        result?: {
          goalLoopGateReadinessPreflight?: {
            id?: string;
            currentGate?: { actionType?: string; scope?: Record<string, unknown> };
            concreteGateInvoked?: boolean;
            toolPolicyAuthorizedConcreteGate?: boolean;
            executionStarted?: boolean;
          };
        };
      }).result)?.goalLoopGateReadinessPreflight;
      expect(outcomePreflight).toMatchObject({
        currentGate: {
          actionType: "planning.scheduler.integration-outcome.reconcile",
          scope: expect.objectContaining({
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerIntegrationCandidateId: refreshedCandidate?.id,
            schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
            applyCheckId: handoff.handoff?.integrationCheckId,
            worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
          }),
        },
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const outcomeAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.integration-outcome.reconcile" && action.goalLoopGateReadinessPreflightId === outcomePreflight?.id);
      if (!outcomeAction) throw new Error("Missing scheduler integration outcome reconcile action after existing apply.");
      expect(outcomeAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        goalLoopNextStepPacketId: outcomeGoalLoopEvaluation.goalLoopNextStepPacket.id,
        goalLoopControllerPolicyId: outcomeControllerPolicy?.id,
        goalLoopGateReadinessPreflightId: outcomePreflight?.id,
      });
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.goal-loop.gate.invoke")).toBe(false);

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
      const outcomePayload = (outcomeWorkflow.result ?? outcomeResult.result) as {
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
        status: "applied",
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        integrationCheckId: handoff.handoff?.integrationCheckId,
        readyWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        resultTargetWorktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const completionGoalLoopEvaluation = await compileGoalLoopEvaluation(memory, changePath);
      expect(completionGoalLoopEvaluation.goalLoopNextStepPacket).toMatchObject({
        recommendedAction: {
          actionType: "planning.scheduler.run.complete",
          scope: {
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
            schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
            schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
            schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
            schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
            applyCheckId: handoff.handoff?.integrationCheckId,
            worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
          },
        },
        executionStarted: false,
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
      expect(snapshot.center.workpad.goalLoop).toMatchObject({
        goalLoopNextStepPacketId: completionGoalLoopEvaluation.goalLoopNextStepPacket.id,
        recommendedActionType: "planning.scheduler.run.complete",
        recommendedActionScope: expect.objectContaining({
          changeId: prepared.topic.changeId,
          schedulerRunId: prepared.schedulerRun.id,
          schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
          schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
          schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
          schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
          schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
          applyCheckId: handoff.handoff?.integrationCheckId,
          worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        }),
        routingPosture: "integration-check-required",
        routingLabel: "IntegrationCheck path required",
      });
      const completionControllerRefreshAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.controller.refresh" && action.goalLoopCurrentGateActionType === "planning.scheduler.run.complete");
      if (!completionControllerRefreshAction) throw new Error("Missing Goal Loop controller refresh action for SchedulerRun completion.");
      expect(completionControllerRefreshAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      const completionControllerRefresh = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...completionControllerRefreshAction, confirm: true });
      const completionControllerPolicy = (((completionControllerRefresh.result as { result?: unknown }).result ?? completionControllerRefresh.result) as {
        goalLoopControllerPolicy?: { id?: string; verdict?: string; gateStatus?: string; executionStarted?: boolean };
      }).goalLoopControllerPolicy;
      expect(completionControllerPolicy).toMatchObject({
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const completionGateReadinessAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.goal-loop.gate-readiness.prepare" && action.goalLoopCurrentGateActionType === "planning.scheduler.run.complete");
      if (!completionGateReadinessAction) throw new Error("Missing Goal Loop gate readiness action for SchedulerRun completion.");
      expect(completionGateReadinessAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        goalLoopControllerPolicyId: completionControllerPolicy?.id,
      });
      const completionGateReadiness = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...completionGateReadinessAction, confirm: true });
      if ((completionGateReadiness.result as { status?: string; error?: string }).status !== "completed") {
        throw new Error((completionGateReadiness.result as { error?: string }).error ?? "Goal Loop completion gate readiness action failed.");
      }
      const completionPreflight = ((completionGateReadiness.result as {
        result?: {
          goalLoopGateReadinessPreflight?: {
            id?: string;
            currentGate?: { actionType?: string; scope?: Record<string, unknown> };
            concreteGateInvoked?: boolean;
            toolPolicyAuthorizedConcreteGate?: boolean;
            executionStarted?: boolean;
          };
        };
      }).result)?.goalLoopGateReadinessPreflight;
      expect(completionPreflight).toMatchObject({
        currentGate: {
          actionType: "planning.scheduler.run.complete",
          scope: expect.objectContaining({
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
            schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
            schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
            schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
            schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
            applyCheckId: handoff.handoff?.integrationCheckId,
            worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
          }),
        },
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const completeAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.run.complete" && action.goalLoopGateReadinessPreflightId === completionPreflight?.id);
      if (!completeAction) throw new Error("Missing assisted scheduler run completion action after scheduler outcome.");
      expect(completeAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
        goalLoopNextStepPacketId: completionGoalLoopEvaluation.goalLoopNextStepPacket.id,
        goalLoopControllerPolicyId: completionControllerPolicy?.id,
        goalLoopGateReadinessPreflightId: completionPreflight?.id,
      });
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.goal-loop.gate.invoke")).toBe(false);

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
      const completionPayload = (completionWorkflow.result ?? completionResult.result) as {
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
        actionType: "planning.scheduler.run.complete",
        enabled: false,
        schedulerRunCompletionId: completionPayload.completion?.id,
      });
      const closeReadyGoalLoopEvaluation = await compileGoalLoopEvaluation(memory, changePath);
      expect(closeReadyGoalLoopEvaluation.goalLoopDecision).toMatchObject({
        decisionKind: "completed-ready-for-human-close-gate",
        recommendedAction: undefined,
        executionStarted: false,
      });
      expect(closeReadyGoalLoopEvaluation.goalLoopNextStepPacket).toMatchObject({
        recommendationState: "ready-for-human-close-gate",
        separateGateRequired: true,
        humanGateRequired: true,
        executionStarted: false,
      });
      expect(closeReadyGoalLoopEvaluation.goalLoopNextStepPacket.recommendedAction).toBeUndefined();
      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.goalLoop).toBeUndefined();
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

      const actionsBeforeTerminalPromptRuns = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .map((action) => action.actionType)
        .sort();
      const terminalChat = await runCodexChat(project(), prepared.topic.changeId, "Explain the terminal scheduler handoff.");
      const terminalChatRun = JSON.parse(await readFile(join(memory.runsRoot, terminalChat.run.id, "run.json"), "utf8")) as RunMetadata;
      const terminalChatContext = await readFile(join(memory.runsRoot, terminalChat.run.id, "context.md"), "utf8");
      const terminalChatEvents = await readJsonl(join(memory.runsRoot, terminalChat.run.id, "events.jsonl"));
      expect(terminalChatRun.promptStack).not.toContain("goal-loop-next-step-packet");
      expect(terminalChatRun.promptStack).not.toContain("goal-loop-controlled-loop-state");
      expect(terminalChatRun.promptStack).not.toContain("goal-loop-scheduler-terminal-handoff");
      expect(terminalChatContext).not.toContain("### Scheduler Terminal Handoff");
      const terminalChatPrepared = terminalChatEvents.find((event) => event.type === "context.prepared")?.data as Record<string, unknown> | undefined;
      expect(terminalChatPrepared).toEqual(expect.objectContaining({
        path: expect.any(String),
      }));
      expect(terminalChatPrepared).not.toHaveProperty("goalLoopSchedulerTerminalHandoff");

      const terminalOrchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Plan from the terminal scheduler handoff.");
      const terminalOrchestratorRun = JSON.parse(await readFile(join(memory.runsRoot, terminalOrchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
      const terminalOrchestratorContext = await readFile(join(memory.runsRoot, terminalOrchestrator.run.id, "context.md"), "utf8");
      const terminalOrchestratorEvents = await readJsonl(join(memory.runsRoot, terminalOrchestrator.run.id, "events.jsonl"));
      expect(terminalOrchestratorRun.promptStack).not.toContain("goal-loop-next-step-packet");
      expect(terminalOrchestratorRun.promptStack).not.toContain("goal-loop-controlled-loop-state");
      expect(terminalOrchestratorRun.promptStack).not.toContain("goal-loop-scheduler-terminal-handoff");
      expect(terminalOrchestratorContext).not.toContain("### Scheduler Terminal Handoff");
      expect(terminalOrchestratorEvents).toEqual(expect.arrayContaining([expect.objectContaining({
        type: "context.prepared",
        data: expect.not.objectContaining({
          goalLoopSchedulerTerminalHandoff: expect.any(Object),
        }),
      })]));
      const actionsAfterTerminalPromptRuns = (await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId }))
        .right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .map((action) => action.actionType)
        .sort();
      expect(actionsAfterTerminalPromptRuns).toEqual(actionsBeforeTerminalPromptRuns);
      expect(await listWorkflowRuns(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listTaskQueues(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(finalMemory, prepared.topic.changeId)).toHaveLength(0);
      const schedulerRuntimeEvents = await readSchedulerRuntimeEvents(
        finalMemory,
        join("harness", "changes", "active", prepared.topic.changeId),
        prepared.schedulerRun.id,
      );
      expect(schedulerRuntimeEvents.filter((event) => event.type === "scheduler-runtime.integration-candidate-compiled")).toHaveLength(2);
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
  }, 300000);


  it("records discarded SchedulerRun completion after existing IntegrationCheck discard without mutating source", async () => {
    const prepared = await prepareSchedulerTwoWorkerIntegrationHandoff("Scheduler Discard Completion Acceptance");
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
      .find((action) => action.actionType === "planning.scheduler.integration-outcome.reconcile" && action.schedulerIntegrationCheckHandoffId === prepared.handoff.handoff?.id);
    if (!outcomeAction) throw new Error("Missing scheduler integration outcome reconcile action after existing discard.");
    const outcomeResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...outcomeAction, confirm: true });
    const outcomeWorkflow = outcomeResult.result as { status?: string; error?: string; result?: unknown };
    if (outcomeWorkflow.status === "failed") throw new Error(outcomeWorkflow.error ?? "discard outcome action failed");
    const outcomePayload = (outcomeWorkflow.result ?? outcomeResult.result) as {
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
      .find((action) => action.actionType === "planning.scheduler.run.complete" && action.schedulerIntegrationOutcomeId === outcomePayload.outcome?.id);
    if (!completeAction) throw new Error("Missing scheduler run completion action after discarded scheduler outcome.");
    const completionResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...completeAction, confirm: true });
    const completionWorkflow = completionResult.result as { status?: string; error?: string; result?: unknown };
    if (completionWorkflow.status === "failed") throw new Error(completionWorkflow.error ?? "discard completion action failed");
    const completionPayload = (completionWorkflow.result ?? completionResult.result) as {
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
    const terminalChat = await runCodexChat(project(), prepared.topic.changeId, "Explain the terminal scheduler handoff.");
    const terminalChatRun = JSON.parse(await readFile(join(terminalMemory.runsRoot, terminalChat.run.id, "run.json"), "utf8")) as RunMetadata;
    const terminalChatContext = await readFile(join(terminalMemory.runsRoot, terminalChat.run.id, "context.md"), "utf8");
    const terminalChatEvents = await readJsonl(join(terminalMemory.runsRoot, terminalChat.run.id, "events.jsonl"));
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

    const terminalOrchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Plan from the terminal scheduler handoff.");
    const terminalOrchestratorRun = JSON.parse(await readFile(join(terminalMemory.runsRoot, terminalOrchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
    const terminalOrchestratorContext = await readFile(join(terminalMemory.runsRoot, terminalOrchestrator.run.id, "context.md"), "utf8");
    const terminalOrchestratorEvents = await readJsonl(join(terminalMemory.runsRoot, terminalOrchestrator.run.id, "events.jsonl"));
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
  }, 300000);


  it("compiles a scheduler worker rework plan after first worker validation fails and starts bounded same-worktree rework", async () => {
    const prepared = await prepareSchedulerFirstWorkerThroughResult({
      title: "Scheduler Worker Rework Plan",
      packageTestScript: "node -e \"process.exit(1)\"",
    });

    const postResultSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const validationAction = postResultSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.validate-first" && action.schedulerWorkerResultId === prepared.workerResult.id);
    if (!validationAction) throw new Error("Missing scheduler first worker validation action.");
    const validated = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      ...validationAction,
      confirm: true,
    });
    const validatedResult = (validated.result as {
      result?: {
        status?: "passed" | "failed";
        schedulerValidation?: {
          id?: string;
          status?: string;
          schedulerWorkerResultId?: string;
          schedulerWorkerStartId?: string;
          taskRunId?: string;
          workerLeaseId?: string;
          worktreeId?: string;
          codeRunId?: string;
          validationRunId?: string;
        };
        taskRun?: { id?: string; status?: string; blockedReason?: string };
        validationResult?: { id?: string; status?: string; worktreeId?: string };
      };
    }).result;
    expect(validatedResult).toMatchObject({
      status: "failed",
      schedulerValidation: {
        status: "failed",
        schedulerWorkerResultId: prepared.workerResult.id,
        schedulerWorkerStartId: prepared.workerStart.id,
        taskRunId: prepared.workerStart.taskRunId,
        workerLeaseId: prepared.workerStart.workerLeaseId,
        worktreeId: prepared.workerStart.worktreeId,
        codeRunId: prepared.workerStart.runId,
      },
      taskRun: { id: prepared.workerStart.taskRunId, status: "blocked" },
      validationResult: { status: "failed", worktreeId: prepared.workerStart.worktreeId },
    });

    const afterValidationMemory = await resolveProjectMemory(project());
    expect((await listTaskRuns(afterValidationMemory, prepared.topic.changeId))[0]).toMatchObject({
      id: prepared.workerStart.taskRunId,
      status: "blocked",
    });
    const afterValidationRunCount = (await listRuns(afterValidationMemory)).filter((run) => run.changeId === prepared.topic.changeId).length;
    const afterValidationWorktreeCount = (await listWorktreeStatuses(afterValidationMemory)).length;
    const afterValidationTaskRunCount = (await listTaskRuns(afterValidationMemory, prepared.topic.changeId)).length;
    const afterValidationLeaseCount = (await listWorkerLeases(afterValidationMemory, prepared.topic.changeId)).length;

    const reworkSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(reworkSnapshot.center.workpad.schedulerWorkerValidation).toMatchObject({
      id: validatedResult?.schedulerValidation?.id,
      status: "failed",
      schedulerWorkerResultId: prepared.workerResult.id,
    });
    expect(reworkSnapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.worker.rework-plan.compile",
      label: "生成当前 worker rework 计划",
      schedulerRunId: prepared.schedulerRun.id,
      schedulerClaimReservationId: prepared.claimReservation.id,
      schedulerWorkerStartId: prepared.workerStart.id,
      schedulerWorkerResultId: prepared.workerResult.id,
      schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
      enabled: true,
    });
    expect(reworkSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.audit-first")).toBe(false);
    const reworkAction = reworkSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.rework-plan.compile" && action.schedulerWorkerValidationId === validatedResult?.schedulerValidation?.id);
    if (!reworkAction) throw new Error("Missing scheduler first worker rework plan action.");
    expect(reworkAction).toMatchObject({
      schedulerRunId: prepared.schedulerRun.id,
      schedulerClaimReservationId: prepared.claimReservation.id,
      schedulerWorkerStartId: prepared.workerStart.id,
      schedulerWorkerResultId: prepared.workerResult.id,
      schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
      taskRunId: prepared.workerStart.taskRunId,
      workerLeaseId: prepared.workerStart.workerLeaseId,
      worktreeId: prepared.workerStart.worktreeId,
      runId: prepared.workerStart.runId,
      validationRunId: validatedResult?.schedulerValidation?.validationRunId,
    });

    const compiled = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      ...reworkAction,
      confirm: true,
    });
    const reworkResult = ((compiled.result as {
      result?: unknown;
    }).result ?? compiled.result) as {
      existing?: boolean;
      executionStarted?: boolean;
      reworkPlan?: {
        id?: string;
        status?: string;
        blockingSource?: string;
        schedulerRunId?: string;
        schedulerClaimReservationId?: string;
        schedulerWorkerStartId?: string;
        schedulerWorkerResultId?: string;
        schedulerWorkerValidationId?: string;
        schedulerWorkerAuditId?: string;
        taskRunId?: string;
        workerLeaseId?: string;
        targetWorktreeId?: string;
        targetCodeRunId?: string;
        validationRunId?: string;
        futureCodeGateMode?: string;
      };
    };
    expect(reworkResult).toMatchObject({
      existing: false,
      executionStarted: false,
      reworkPlan: {
        status: "planned",
        blockingSource: "validation-failed",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        schedulerWorkerStartId: prepared.workerStart.id,
        schedulerWorkerResultId: prepared.workerResult.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        taskRunId: prepared.workerStart.taskRunId,
        workerLeaseId: prepared.workerStart.workerLeaseId,
        targetWorktreeId: prepared.workerStart.worktreeId,
        targetCodeRunId: prepared.workerStart.runId,
        validationRunId: validatedResult?.schedulerValidation?.validationRunId,
        futureCodeGateMode: "scheduler-claim-rework",
      },
    });
    expect(reworkResult.reworkPlan?.schedulerWorkerAuditId).toBeUndefined();
    const reworkPlanPath = join(prepared.changeDir, "planning", "scheduler-runs", `${prepared.schedulerRun.id}`, "scheduler-worker-rework-plans", `${reworkResult.reworkPlan?.id}.json`);
    expect(JSON.parse(await readFile(reworkPlanPath, "utf8"))).toMatchObject({
      id: reworkResult.reworkPlan?.id,
      changeId: prepared.topic.changeId,
      schedulerRunId: prepared.schedulerRun.id,
      blockingSource: "validation-failed",
      targetWorktreeId: prepared.workerStart.worktreeId,
      futureCodeGateMode: "scheduler-claim-rework",
    });
    const fullReworkPlan = await getWorkbenchSchedulerWorkerReworkPlanProjection(
      { project: project(), path: getTempDir() },
      prepared.topic.changeId,
      prepared.schedulerRun.id,
      reworkResult.reworkPlan?.id,
    );
    expect(fullReworkPlan).toMatchObject({
      id: reworkResult.reworkPlan?.id,
      blockingSource: "validation-failed",
      schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
    });
    const runtimeEvents = (await readFile(prepared.runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(runtimeEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schedulerRunId: prepared.schedulerRun.id,
        changeId: prepared.topic.changeId,
        type: "scheduler-runtime.worker-rework-planned",
        payload: expect.objectContaining({
          schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
          schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
          blockingSource: "validation-failed",
          worktreeId: prepared.workerStart.worktreeId,
        }),
      }),
    ]));

    const afterReworkMemory = await resolveProjectMemory(project());
    expect((await listRuns(afterReworkMemory)).filter((run) => run.changeId === prepared.topic.changeId)).toHaveLength(afterValidationRunCount);
    expect(await listWorktreeStatuses(afterReworkMemory)).toHaveLength(afterValidationWorktreeCount);
    expect(await listTaskRuns(afterReworkMemory, prepared.topic.changeId)).toHaveLength(afterValidationTaskRunCount);
    expect(await listWorkerLeases(afterReworkMemory, prepared.topic.changeId)).toHaveLength(afterValidationLeaseCount);
    expect(await listTaskQueues(afterReworkMemory, prepared.topic.changeId)).toHaveLength(0);
    expect(await listWorkflowRuns(afterReworkMemory, prepared.topic.changeId)).toHaveLength(0);
    expect(await listAgentTasks(afterReworkMemory, prepared.topic.changeId)).toHaveLength(0);

    const afterPlanSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(afterPlanSnapshot.center.workpad.schedulerWorkerReworkPlan).toMatchObject({
      id: reworkResult.reworkPlan?.id,
      status: "planned",
      blockingSource: "validation-failed",
    });
    expect(afterPlanSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.rework-plan.compile")).toBe(false);
    const reworkStartAction = afterPlanSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.rework-start-first" && action.schedulerWorkerReworkPlanId === reworkResult.reworkPlan?.id);
    if (!reworkStartAction) throw new Error("Missing scheduler first worker rework start action.");
    expect(reworkStartAction).toMatchObject({
      schedulerRunId: prepared.schedulerRun.id,
      schedulerClaimReservationId: prepared.claimReservation.id,
      schedulerWorkerStartId: prepared.workerStart.id,
      schedulerWorkerResultId: prepared.workerResult.id,
      schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
      schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
      taskRunId: prepared.workerStart.taskRunId,
      workerLeaseId: prepared.workerStart.workerLeaseId,
      worktreeId: prepared.workerStart.worktreeId,
      runId: prepared.workerStart.runId,
      validationRunId: validatedResult?.schedulerValidation?.validationRunId,
    });

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    try {
      process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
      const startedRework = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...reworkStartAction,
        confirm: true,
      });
      const reworkStartResult = ((startedRework.result as { result?: unknown }).result ?? startedRework.result) as {
        executionStarted?: boolean;
        reworkStart?: {
          id?: string;
          status?: string;
          schedulerWorkerReworkPlanId?: string;
          reworkTaskRunId?: string;
          reworkWorkerLeaseId?: string;
          worktreeId?: string;
          originalCodeRunId?: string;
          reworkRunId?: string;
        };
        code?: { run?: { id?: string; worktree?: { worktreeId?: string } } };
      };
      expect(reworkStartResult).toMatchObject({
        executionStarted: true,
        reworkStart: {
          status: "started",
          schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
          worktreeId: prepared.workerStart.worktreeId,
          originalCodeRunId: prepared.workerStart.runId,
        },
        code: {
          run: { worktree: { worktreeId: prepared.workerStart.worktreeId } },
        },
      });
      expect(reworkStartResult.reworkStart?.reworkRunId).toBe(reworkStartResult.code?.run?.id);
      const reworkStartPath = join(prepared.changeDir, "planning", "scheduler-runs", `${prepared.schedulerRun.id}`, "scheduler-worker-rework-starts", `${reworkStartResult.reworkStart?.id}.json`);
      const reworkStartJson = JSON.parse(await readFile(reworkStartPath, "utf8"));
      expect(reworkStartJson).toMatchObject({
        id: reworkStartResult.reworkStart?.id,
        changeId: prepared.topic.changeId,
        schedulerRunId: prepared.schedulerRun.id,
        schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
        worktreeId: prepared.workerStart.worktreeId,
        originalCodeRunId: prepared.workerStart.runId,
        reworkRunId: reworkStartResult.code?.run?.id,
      });
      const fullReworkStart = await getWorkbenchSchedulerWorkerReworkStartProjection(
        { project: project(), path: getTempDir() },
        prepared.topic.changeId,
        prepared.schedulerRun.id,
        reworkStartResult.reworkStart?.id,
      );
      expect(fullReworkStart).toMatchObject({
        id: reworkStartResult.reworkStart?.id,
        schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
        worktreeId: prepared.workerStart.worktreeId,
      });
      const afterReworkStartMemory = await resolveProjectMemory(project());
      expect((await listRuns(afterReworkStartMemory)).filter((run) => run.changeId === prepared.topic.changeId)).toHaveLength(afterValidationRunCount + 1);
      expect(await listWorktreeStatuses(afterReworkStartMemory)).toHaveLength(afterValidationWorktreeCount);
      expect(await listTaskRuns(afterReworkStartMemory, prepared.topic.changeId)).toHaveLength(afterValidationTaskRunCount + 1);
      expect(await listWorkerLeases(afterReworkStartMemory, prepared.topic.changeId)).toHaveLength(afterValidationLeaseCount + 1);
      expect(await listTaskQueues(afterReworkStartMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listWorkflowRuns(afterReworkStartMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(afterReworkStartMemory, prepared.topic.changeId)).toHaveLength(0);
      const reworkRun = (await listRuns(afterReworkStartMemory)).find((run) => run.id === reworkStartResult.code?.run?.id);
      expect(reworkRun).toMatchObject({
        changeId: prepared.topic.changeId,
        agent: { roleId: "rework-coder" },
        executionGate: expect.objectContaining({
          mode: "scheduler-claim-rework",
          schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
          schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        }),
      });
      const afterStartSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(afterStartSnapshot.center.workpad.schedulerWorkerReworkStart).toMatchObject({
        id: reworkStartResult.reworkStart?.id,
        status: "started",
        worktreeId: prepared.workerStart.worktreeId,
      });
      expect(afterStartSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.rework-start-first")).toBe(false);
      const reworkResultAction = afterStartSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.rework-reconcile-result" && action.schedulerWorkerReworkStartId === reworkStartResult.reworkStart?.id);
      if (!reworkResultAction) throw new Error("Missing scheduler first worker rework result reconcile action.");
      expect(reworkResultAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        schedulerWorkerStartId: prepared.workerStart.id,
        schedulerWorkerResultId: prepared.workerResult.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
        schedulerWorkerReworkStartId: reworkStartResult.reworkStart?.id,
        taskRunId: reworkStartResult.reworkStart?.reworkTaskRunId,
        workerLeaseId: reworkStartResult.reworkStart?.reworkWorkerLeaseId,
        worktreeId: prepared.workerStart.worktreeId,
        runId: reworkStartResult.reworkStart?.reworkRunId,
      });

      const reconciledRework = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...reworkResultAction,
        confirm: true,
      });
      const reconciledReworkResult = ((reconciledRework.result as { result?: unknown }).result ?? reconciledRework.result) as {
        status?: string;
        result?: {
          id?: string;
          status?: string;
          schedulerWorkerReworkStartId?: string;
          reworkTaskRunId?: string;
          reworkWorkerLeaseId?: string;
          worktreeId?: string;
          reworkRunId?: string;
          taskRunStatus?: string;
          workerLeaseStatus?: string;
        };
      };
      expect(reconciledReworkResult).toMatchObject({
        status: "terminal",
        result: {
          status: "evidence-ready",
          schedulerWorkerReworkStartId: reworkStartResult.reworkStart?.id,
          reworkTaskRunId: reworkStartResult.reworkStart?.reworkTaskRunId,
          reworkWorkerLeaseId: reworkStartResult.reworkStart?.reworkWorkerLeaseId,
          worktreeId: prepared.workerStart.worktreeId,
          reworkRunId: reworkStartResult.reworkStart?.reworkRunId,
          taskRunStatus: "evidence-ready",
          workerLeaseStatus: "released",
        },
      });
      const reworkResultPath = join(prepared.changeDir, "planning", "scheduler-runs", `${prepared.schedulerRun.id}`, "scheduler-worker-rework-results", `${reconciledReworkResult.result?.id}.json`);
      const reworkResultJson = JSON.parse(await readFile(reworkResultPath, "utf8"));
      expect(reworkResultJson).toMatchObject({
        id: reconciledReworkResult.result?.id,
        changeId: prepared.topic.changeId,
        schedulerRunId: prepared.schedulerRun.id,
        schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
        schedulerWorkerReworkStartId: reworkStartResult.reworkStart?.id,
        worktreeId: prepared.workerStart.worktreeId,
        reworkRunId: reworkStartResult.reworkStart?.reworkRunId,
        status: "evidence-ready",
      });
      const fullReworkResult = await getWorkbenchSchedulerWorkerReworkResultProjection(
        { project: project(), path: getTempDir() },
        prepared.topic.changeId,
        prepared.schedulerRun.id,
        reconciledReworkResult.result?.id,
      );
      expect(fullReworkResult).toMatchObject({
        id: reconciledReworkResult.result?.id,
        status: "evidence-ready",
        schedulerWorkerReworkStartId: reworkStartResult.reworkStart?.id,
      });
      const afterReworkResultMemory = await resolveProjectMemory(project());
      expect((await listRuns(afterReworkResultMemory)).filter((run) => run.changeId === prepared.topic.changeId)).toHaveLength(afterValidationRunCount + 1);
      expect(await listWorktreeStatuses(afterReworkResultMemory)).toHaveLength(afterValidationWorktreeCount);
      expect(await listTaskRuns(afterReworkResultMemory, prepared.topic.changeId)).toHaveLength(afterValidationTaskRunCount + 1);
      expect((await listWorkerLeases(afterReworkResultMemory, prepared.topic.changeId)).find((lease) => lease.id === reworkStartResult.reworkStart?.reworkWorkerLeaseId)).toMatchObject({ status: "released" });
      expect(await listTaskQueues(afterReworkResultMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listWorkflowRuns(afterReworkResultMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(afterReworkResultMemory, prepared.topic.changeId)).toHaveLength(0);
      const afterReworkResultSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(afterReworkResultSnapshot.center.workpad.schedulerWorkerReworkResult).toMatchObject({
        id: reconciledReworkResult.result?.id,
        status: "evidence-ready",
        worktreeId: prepared.workerStart.worktreeId,
      });
      expect(afterReworkResultSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.rework-reconcile-result")).toBe(false);
      expect(afterReworkResultSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.validate-first" || action.actionType === "planning.scheduler.worker.audit-first")).toBe(false);
      const reworkValidationAction = afterReworkResultSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.rework-validate-first" && action.schedulerWorkerReworkResultId === reconciledReworkResult.result?.id);
      if (!reworkValidationAction) throw new Error("Missing scheduler first worker rework validation action.");
      expect(reworkValidationAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        schedulerWorkerStartId: prepared.workerStart.id,
        schedulerWorkerResultId: prepared.workerResult.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
        schedulerWorkerReworkStartId: reworkStartResult.reworkStart?.id,
        schedulerWorkerReworkResultId: reconciledReworkResult.result?.id,
        taskRunId: reworkStartResult.reworkStart?.reworkTaskRunId,
        workerLeaseId: reworkStartResult.reworkStart?.reworkWorkerLeaseId,
        worktreeId: prepared.workerStart.worktreeId,
        runId: reworkStartResult.reworkStart?.reworkRunId,
      });

      const validatedRework = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...reworkValidationAction,
        confirm: true,
      });
      const validatedReworkResult = ((validatedRework.result as { result?: unknown }).result ?? validatedRework.result) as {
        existing?: boolean;
        status?: "passed" | "failed";
        schedulerReworkValidation?: {
          id?: string;
          status?: string;
          schedulerWorkerReworkResultId?: string;
          schedulerWorkerReworkStartId?: string;
          schedulerWorkerReworkPlanId?: string;
          reworkTaskRunId?: string;
          reworkWorkerLeaseId?: string;
          worktreeId?: string;
          reworkRunId?: string;
          validationRunId?: string;
        };
        taskRun?: { id?: string; status?: string; blockedReason?: string };
        validationResult?: { id?: string; status?: string; worktreeId?: string };
      };
      expect(validatedReworkResult).toMatchObject({
        status: "failed",
        schedulerReworkValidation: {
          status: "failed",
          schedulerWorkerReworkResultId: reconciledReworkResult.result?.id,
          schedulerWorkerReworkStartId: reworkStartResult.reworkStart?.id,
          schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
          reworkTaskRunId: reworkStartResult.reworkStart?.reworkTaskRunId,
          reworkWorkerLeaseId: reworkStartResult.reworkStart?.reworkWorkerLeaseId,
          worktreeId: prepared.workerStart.worktreeId,
          reworkRunId: reworkStartResult.reworkStart?.reworkRunId,
        },
        taskRun: { id: reworkStartResult.reworkStart?.reworkTaskRunId, status: "blocked", blockedReason: "Rework validation failed." },
        validationResult: { status: "failed", worktreeId: prepared.workerStart.worktreeId },
      });
      const reworkValidationPath = join(prepared.changeDir, "planning", "scheduler-runs", `${prepared.schedulerRun.id}`, "scheduler-worker-rework-validations", `${validatedReworkResult.schedulerReworkValidation?.id}.json`);
      const reworkValidationJson = JSON.parse(await readFile(reworkValidationPath, "utf8"));
      expect(reworkValidationJson).toMatchObject({
        id: validatedReworkResult.schedulerReworkValidation?.id,
        changeId: prepared.topic.changeId,
        schedulerRunId: prepared.schedulerRun.id,
        schedulerWorkerReworkResultId: reconciledReworkResult.result?.id,
        schedulerWorkerReworkStartId: reworkStartResult.reworkStart?.id,
        schedulerWorkerReworkPlanId: reworkResult.reworkPlan?.id,
        worktreeId: prepared.workerStart.worktreeId,
        reworkRunId: reworkStartResult.reworkStart?.reworkRunId,
        validationRunId: validatedReworkResult.schedulerReworkValidation?.validationRunId,
        status: "failed",
      });
      const fullReworkValidation = await getWorkbenchSchedulerWorkerReworkValidationProjection(
        { project: project(), path: getTempDir() },
        prepared.topic.changeId,
        prepared.schedulerRun.id,
        validatedReworkResult.schedulerReworkValidation?.id,
      );
      expect(fullReworkValidation).toMatchObject({
        id: validatedReworkResult.schedulerReworkValidation?.id,
        status: "failed",
        schedulerWorkerReworkResultId: reconciledReworkResult.result?.id,
      });
      const afterReworkValidationMemory = await resolveProjectMemory(project());
      expect((await listRuns(afterReworkValidationMemory)).filter((run) => run.changeId === prepared.topic.changeId)).toHaveLength(afterValidationRunCount + 2);
      expect(await listWorktreeStatuses(afterReworkValidationMemory)).toHaveLength(afterValidationWorktreeCount);
      expect(await listTaskRuns(afterReworkValidationMemory, prepared.topic.changeId)).toHaveLength(afterValidationTaskRunCount + 1);
      expect((await listWorkerLeases(afterReworkValidationMemory, prepared.topic.changeId)).find((lease) => lease.id === reworkStartResult.reworkStart?.reworkWorkerLeaseId)).toMatchObject({ status: "released" });
      expect(await listTaskQueues(afterReworkValidationMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listWorkflowRuns(afterReworkValidationMemory, prepared.topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(afterReworkValidationMemory, prepared.topic.changeId)).toHaveLength(0);
      const afterReworkValidationSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(afterReworkValidationSnapshot.center.workpad.schedulerWorkerReworkValidation).toMatchObject({
        id: validatedReworkResult.schedulerReworkValidation?.id,
        status: "failed",
        worktreeId: prepared.workerStart.worktreeId,
      });
      expect(afterReworkValidationSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.rework-validate-first")).toBe(false);
      expect(afterReworkValidationSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.audit-first" || action.actionType === "planning.scheduler.worker.rework-start-first")).toBe(false);

      const repeatedReworkValidation = await validateSchedulerFirstWorkerRework(project(), {
        changeId: prepared.topic.changeId,
        schedulerRunId: prepared.schedulerRun.id,
        schedulerWorkerReworkResultId: reconciledReworkResult.result?.id ?? "",
      });
      expect(repeatedReworkValidation).toMatchObject({
        existing: true,
        schedulerReworkValidation: { id: validatedReworkResult.schedulerReworkValidation?.id },
      });
      const afterRepeatedReworkValidationMemory = await resolveProjectMemory(project());
      expect((await listRuns(afterRepeatedReworkValidationMemory)).filter((run) => run.changeId === prepared.topic.changeId)).toHaveLength(afterValidationRunCount + 2);

      await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...reworkValidationAction,
        confirm: true,
      })).rejects.toThrow(/stale|no longer available/i);
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }

    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      ...reworkAction,
      confirm: true,
    })).rejects.toThrow(/stale|no longer available/i);
    const afterRepeatedMemory = await resolveProjectMemory(project());
    expect((await listRuns(afterRepeatedMemory)).filter((run) => run.changeId === prepared.topic.changeId)).toHaveLength(afterValidationRunCount + 2);
    expect(await listWorktreeStatuses(afterRepeatedMemory)).toHaveLength(afterValidationWorktreeCount);
    expect(await listTaskRuns(afterRepeatedMemory, prepared.topic.changeId)).toHaveLength(afterValidationTaskRunCount + 1);
    expect(await listWorkerLeases(afterRepeatedMemory, prepared.topic.changeId)).toHaveLength(afterValidationLeaseCount + 1);
  }, 90000);

});
