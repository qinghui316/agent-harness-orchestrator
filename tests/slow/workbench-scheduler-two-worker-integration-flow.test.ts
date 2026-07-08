import { readFile, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { runCodexChat, runOrchestratorPlan } from "../../src/workbench/codex-chat/bridge.js";
import { getWorkbenchSchedulerRunCompletionProjection, getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listAgentTasks } from "../../src/agent-task/manager.js";
import { listWorktreeStatuses } from "../../src/worktree/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listTaskRuns } from "../../src/task-run/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { readSchedulerRuntimeEvents } from "../../src/scheduler-runtime/manager.js";
import { listSchedulerIntegrationOutcomes } from "../../src/scheduler-runtime/repository.js";
import { listIntegrationChecks } from "../../src/integration-check/manager.js";
import { compileGoalLoopEvaluation } from "../../src/goal-loop/manager.js";
import { createFakeCodex, execFileAsync, findSchedulerGateAction, getTempDir, prepareSchedulerFirstWorkerThroughResult, project, readJsonl, unwrapControlledSchedulerAdvanceResult } from "../unit/workbench/fixtures.js";
import type { RunMetadata } from "../../src/types/index.js";

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
          goalLoopCurrentGateActionType: action.goalLoopCurrentGateActionType,
          schedulerWorkerResultId: action.schedulerWorkerResultId,
          schedulerWorkerStartId: action.schedulerWorkerStartId,
          schedulerWorkerValidationId: action.schedulerWorkerValidationId,
          enabled: action.enabled,
        })))}`);
      }
      const firstValidation = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...firstValidationAction, confirm: true });
      const firstValidationResult = unwrapControlledSchedulerAdvanceResult((firstValidation.result as { result?: unknown }).result ?? firstValidation.result) as {
        schedulerValidation?: { id?: string; validationRunId?: string };
      };

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      const firstAuditAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.audit-first", (candidate) => candidate.schedulerWorkerValidationId === firstValidationResult?.schedulerValidation?.id));
      if (!firstAuditAction) throw new Error("Missing first worker audit action.");
      const firstAudit = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...firstAuditAction, confirm: true });
      const firstAuditResult = unwrapControlledSchedulerAdvanceResult((firstAudit.result as { result?: unknown }).result ?? firstAudit.result) as {
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
      expect(firstWorkerTerminalActions.some((action) => action.goalLoopCurrentGateActionType && forbiddenBeforeSameWaveTerminal.has(action.goalLoopCurrentGateActionType))).toBe(false);

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
      expect(snapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.start-next",
        label: "启动同波次下一个 worker",
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
      });
      const startNextAction = snapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.start-next", (candidate) => candidate.schedulerRunId === prepared.schedulerRun.id));
      if (!startNextAction) throw new Error("Missing scheduler start-next action.");
      expect(startNextAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
      });
      expect(startNextAction.schedulerIntegrationCandidateId).toBeUndefined();
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
      const startNextActions = snapshot.right.confirmationQueue.current.flatMap((item) => item.actions);
      const assistedStartNextAction = startNextActions.find((action) => action.actionType === "planning.scheduler.worker.start-next" && action.schedulerRunId === prepared.schedulerRun.id && action.reservationIntentId === startNextAction.reservationIntentId)
        ?? startNextActions.find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.start-next", (candidate) => candidate.schedulerRunId === prepared.schedulerRun.id && candidate.reservationIntentId === startNextAction.reservationIntentId));
      if (!assistedStartNextAction) {
        const actions = snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => ({
          actionType: action.actionType,
          goalLoopCurrentGateActionType: action.goalLoopCurrentGateActionType,
          schedulerRunId: action.schedulerRunId,
          schedulerClaimReservationId: action.schedulerClaimReservationId,
          reservationIntentId: action.reservationIntentId,
          claimIntentId: action.claimIntentId,
          goalLoopControllerPolicyId: action.goalLoopControllerPolicyId,
          goalLoopGateReadinessPreflightId: action.goalLoopGateReadinessPreflightId,
          enabled: action.enabled,
        }));
        throw new Error(`Missing controlled scheduler start-next action. nextAction=${JSON.stringify(snapshot.center.workpad.nextAction)} actions=${JSON.stringify(actions)}`);
      }
      expect(["planning.scheduler.worker.start-next", "planning.scheduler.controlled-advance.run", "planning.goal-loop.controlled-continue.run"]).toContain(assistedStartNextAction.actionType);
      expect(assistedStartNextAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerClaimReservationId: prepared.claimReservation.id,
        reservationIntentId: startNextAction.reservationIntentId,
        claimIntentId: startNextAction.claimIntentId,
      });
      if (assistedStartNextAction.actionType === "planning.scheduler.worker.start-next") {
        expect(assistedStartNextAction.goalLoopCurrentGateActionType).toBeUndefined();
      } else if (assistedStartNextAction.actionType === "planning.scheduler.controlled-advance.run") {
        expect(assistedStartNextAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.worker.start-next");
        expect(assistedStartNextAction.goalLoopNextStepPacketId).toBeUndefined();
        expect(assistedStartNextAction.goalLoopControllerPolicyId).toBeUndefined();
        expect(assistedStartNextAction.goalLoopGateReadinessPreflightId).toBeUndefined();
      } else {
        expect(assistedStartNextAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.worker.start-next");
        expect(assistedStartNextAction.goalLoopControllerPolicyId).toBe(controllerPolicy?.id);
        expect(assistedStartNextAction.goalLoopGateReadinessPreflightId).toBe(preflight?.id);
      }
      expect(assistedStartNextAction).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.start-next" && action.goalLoopGateReadinessPreflightId === preflight?.id)).toBe(false);
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.controlled-step.run")).toBe(false);
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.goal-loop.gate.invoke")).toBe(false);

      const secondStartResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...assistedStartNextAction, confirm: true });
      const secondStartWorkflow = secondStartResult.result as { result?: unknown };
      const secondStartPreflight = (secondStartWorkflow.result as {
        goalLoopGateReadinessPreflight?: {
          controlledSchedulerPostStepRoutingSupport?: {
            authority?: string;
            existingGateActionType?: string;
            continuationDecisionStatus?: string;
            routingReadinessStatus?: string;
            needsReevaluation?: boolean;
            executionStarted?: boolean;
            loopAuthorized?: boolean;
            sourceMutationAuthorized?: boolean;
            applyAuthorized?: boolean;
            closeAuthorized?: boolean;
            currentGateScope?: Record<string, unknown>;
          };
        };
      } | undefined)?.goalLoopGateReadinessPreflight;
      if (secondStartPreflight?.controlledSchedulerPostStepRoutingSupport) {
        expect(secondStartPreflight.controlledSchedulerPostStepRoutingSupport).toMatchObject({
          authority: "non-executing-controlled-scheduler-post-step-routing-preflight-support",
          existingGateActionType: "planning.scheduler.worker.start-next",
          continuationDecisionStatus: "ready-for-human-gate",
          routingReadinessStatus: "ready-for-human-gate",
          needsReevaluation: false,
          executionStarted: false,
          loopAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          currentGateScope: expect.objectContaining({
            changeId: prepared.topic.changeId,
            schedulerRunId: prepared.schedulerRun.id,
            schedulerClaimReservationId: prepared.claimReservation.id,
            reservationIntentId: startNextAction.reservationIntentId,
            claimIntentId: startNextAction.claimIntentId,
          }),
        });
      }
      const secondStart = unwrapControlledSchedulerAdvanceResult(secondStartWorkflow.result ?? secondStartResult.result) as {
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
      };
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
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.reconcile-result", (candidate) => candidate.schedulerWorkerStartId === secondStart.workerStart?.id));
      if (!secondResultAction) throw new Error("Missing second worker result reconcile action.");
      const secondResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...secondResultAction, confirm: true });
      const secondWorkerResult = unwrapControlledSchedulerAdvanceResult((secondResult.result as { result?: unknown }).result ?? secondResult.result) as {
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
      const secondValidationResult = unwrapControlledSchedulerAdvanceResult((secondValidation.result as { result?: unknown }).result ?? secondValidation.result) as {
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
      const secondAuditResult = unwrapControlledSchedulerAdvanceResult((secondAudit.result as { result?: unknown }).result ?? secondAudit.result) as {
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
      const refreshedCandidatePayload = unwrapControlledSchedulerAdvanceResult(refreshedCandidateWorkflow.result ?? refreshedCandidateResult.result) as {
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
      const handoffActions = snapshot.right.confirmationQueue.current.flatMap((item) => item.actions);
      const assistedHandoffAction = handoffActions.find((action) => action.actionType === "planning.scheduler.integration-check.run" && action.schedulerIntegrationCandidateId === refreshedCandidate?.id)
        ?? handoffActions.find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-check.run", (candidate) => candidate.schedulerIntegrationCandidateId === refreshedCandidate?.id));
      if (!assistedHandoffAction) throw new Error("Missing controlled scheduler IntegrationCheck action.");
      expect(["planning.scheduler.integration-check.run", "planning.scheduler.controlled-advance.run", "planning.goal-loop.controlled-continue.run"]).toContain(assistedHandoffAction.actionType);
      expect(assistedHandoffAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      if (assistedHandoffAction.actionType === "planning.scheduler.integration-check.run") {
        expect(assistedHandoffAction.goalLoopCurrentGateActionType).toBeUndefined();
      } else if (assistedHandoffAction.actionType === "planning.scheduler.controlled-advance.run") {
        expect(assistedHandoffAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.integration-check.run");
        expect(assistedHandoffAction.goalLoopNextStepPacketId).toBeUndefined();
        expect(assistedHandoffAction.goalLoopControllerPolicyId).toBeUndefined();
        expect(assistedHandoffAction.goalLoopGateReadinessPreflightId).toBeUndefined();
      } else {
        expect(assistedHandoffAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.integration-check.run");
        expect(assistedHandoffAction.goalLoopControllerPolicyId).toBe(integrationControllerPolicy?.id);
        expect(assistedHandoffAction.goalLoopGateReadinessPreflightId).toBe(integrationPreflight?.id);
      }
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.controlled-step.run")).toBe(false);
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
      const handoff = unwrapControlledSchedulerAdvanceResult(handoffWorkflow.result ?? handoffResult.result) as {
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
      const outcomeActions = snapshot.right.confirmationQueue.current.flatMap((item) => item.actions);
      const outcomeAction = outcomeActions.find((action) => action.actionType === "planning.scheduler.integration-outcome.reconcile" && action.schedulerIntegrationCheckHandoffId === handoff.handoff?.id)
        ?? (snapshot.center.workpad.nextAction.actionType === "planning.scheduler.integration-outcome.reconcile" ? snapshot.center.workpad.nextAction : undefined)
        ?? outcomeActions.find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-outcome.reconcile", (candidate) => candidate.schedulerIntegrationCheckHandoffId === handoff.handoff?.id));
      if (!outcomeAction) throw new Error("Missing scheduler integration outcome reconcile action after existing apply.");
      expect(["planning.scheduler.integration-outcome.reconcile", "planning.scheduler.controlled-advance.run", "planning.goal-loop.controlled-continue.run"]).toContain(outcomeAction.actionType);
      expect(outcomeAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerIntegrationCandidateId: refreshedCandidate?.id,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      if (outcomeAction.actionType === "planning.scheduler.integration-outcome.reconcile") {
        expect(outcomeAction.goalLoopCurrentGateActionType).toBeUndefined();
      } else if (outcomeAction.actionType === "planning.scheduler.controlled-advance.run") {
        expect(outcomeAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.integration-outcome.reconcile");
        expect(outcomeAction.goalLoopNextStepPacketId).toBeUndefined();
        expect(outcomeAction.goalLoopControllerPolicyId).toBeUndefined();
        expect(outcomeAction.goalLoopGateReadinessPreflightId).toBeUndefined();
      } else {
        expect(outcomeAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.integration-outcome.reconcile");
        expect(outcomeAction.goalLoopControllerPolicyId).toBe(outcomeControllerPolicy?.id);
        expect(outcomeAction.goalLoopGateReadinessPreflightId).toBe(outcomePreflight?.id);
      }
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.controlled-step.run")).toBe(false);
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
      const completeActions = snapshot.right.confirmationQueue.current.flatMap((item) => item.actions);
      const completeAction = completeActions.find((action) => action.actionType === "planning.scheduler.run.complete" && action.schedulerIntegrationOutcomeId === outcomePayload.outcome?.id)
        ?? (snapshot.center.workpad.nextAction.actionType === "planning.scheduler.run.complete" ? snapshot.center.workpad.nextAction : undefined)
        ?? completeActions.find((action) => findSchedulerGateAction([action], "planning.scheduler.run.complete", (candidate) => candidate.schedulerIntegrationOutcomeId === outcomePayload.outcome?.id));
      if (!completeAction) throw new Error("Missing controlled scheduler run completion action after scheduler outcome.");
      expect(["planning.scheduler.run.complete", "planning.scheduler.controlled-advance.run", "planning.goal-loop.controlled-continue.run"]).toContain(completeAction.actionType);
      expect(completeAction).toMatchObject({
        schedulerRunId: prepared.schedulerRun.id,
        schedulerReconcileSnapshotId: outcomePayload.outcome?.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: outcomePayload.outcome?.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: outcomePayload.outcome?.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: handoff.handoff?.id,
        schedulerIntegrationOutcomeId: outcomePayload.outcome?.id,
        applyCheckId: handoff.handoff?.integrationCheckId,
        worktreeIds: expect.arrayContaining(refreshedCandidate?.readyWorktreeIds ?? []),
      });
      if (completeAction.actionType === "planning.scheduler.run.complete") {
        expect(completeAction.goalLoopCurrentGateActionType).toBeUndefined();
      } else if (completeAction.actionType === "planning.scheduler.controlled-advance.run") {
        expect(completeAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.run.complete");
        expect(completeAction.goalLoopNextStepPacketId).toBeUndefined();
        expect(completeAction.goalLoopControllerPolicyId).toBeUndefined();
        expect(completeAction.goalLoopGateReadinessPreflightId).toBeUndefined();
      } else {
        expect(completeAction.goalLoopCurrentGateActionType).toBe("planning.scheduler.run.complete");
        expect(completeAction.goalLoopControllerPolicyId).toBe(completionControllerPolicy?.id);
        expect(completeAction.goalLoopGateReadinessPreflightId).toBe(completionPreflight?.id);
      }
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.controlled-step.run")).toBe(false);
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
      const completionPayload = unwrapControlledSchedulerAdvanceResult(completionWorkflow.result ?? completionResult.result) as {
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
