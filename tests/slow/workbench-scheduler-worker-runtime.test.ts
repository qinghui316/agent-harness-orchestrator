import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic } from "../../src/workbench/chat.js";
import { getWorkbenchSchedulerClaimReservationProjection, getWorkbenchSchedulerContractProjection, getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listAgentTasks } from "../../src/agent-task/manager.js";
import { listWorktreeStatuses } from "../../src/worktree/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../../src/task-run/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { auditSchedulerFirstWorker, validateSchedulerFirstWorker } from "../../src/scheduler-runtime/manager.js";
import { createFakeCodex, findSchedulerGateAction, getTempDir, git, initGitRepository, project, unwrapControlledSchedulerAdvanceResult, writeAcceptedSpecAndTasks } from "../unit/workbench/fixtures.js";

describe("workbench scheduler worker runtime slow path", () => {
  it("starts and validates the first scheduler worker after prepared launch confirmation", async () => {
    const tempDir = getTempDir();
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Parallel Scheduler Contract",
      body: "Split this into independent parallel work across multiple modules.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const changeDir = join(tempDir, "harness", "changes", "active", topic.changeId);
    await writeFile(join(changeDir, "tasks.md"), [
      "# Tasks",
      "",
      "- [ ] T-001: Update module A.",
      "  - Covers: AC-001",
      "- [ ] T-002: Update module B.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");
    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      prompt: "并行 独立 src/module-a.ts src/module-b.ts",
      confirm: true,
    });
    const planId = (draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id;
    const planPath = join(changeDir, "planning", "decomposition-plan.json");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    plan.units[0].scopeHints = ["src/module-a.ts"];
    plan.units[1].scopeHints = ["src/module-b.ts"];
    plan.units[0].dependsOn = [];
    plan.units[1].dependsOn = [];
    plan.dependencies = [];
    plan.conflictScopes = ["src/module-a.ts", "src/module-b.ts"];
    await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.confirm",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    const readiness = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    const manifest = (readiness.result as { result?: { manifest?: { id?: string; status?: string; nextAllowedAction?: string; decompositionPlanId?: string } } }).result?.manifest;
    expect(manifest).toMatchObject({ status: "ready-for-scheduler-contract", nextAllowedAction: "scheduler.contract" });

    const beforeMemory = await resolveProjectMemory(project());
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.propose",
      changeId: topic.changeId,
      readinessManifestId: manifest?.id,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.plan.prepare",
      decompositionPlanId: planId,
      readinessManifestId: manifest?.id,
    });
    expect(snapshot.center.workpad.taskQueueProposal).toBeUndefined();
    expect(snapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            actionType: "planning.scheduler.plan.prepare",
            decompositionPlanId: planId,
            readinessManifestId: manifest?.id,
          }),
        ]),
      }),
    ]));
    expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => action.actionType))
      .not.toContain("planning.scheduler.contract.compile");
    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.plan.prepare", label: "准备低冲突任务执行路径" }),
    ]));

    const prepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.scheduler.plan.prepare",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      readinessManifestId: manifest?.id,
      confirm: true,
    });
    const preparedResult = (prepared.result as {
      result?: {
        status?: string;
        mode?: string;
        contract?: { id?: string; waveCount?: number; readinessManifestId?: string };
        dryRun?: { id?: string; schedulerContractId?: string; estimatedMaxWaveWidth?: number };
        workerPlan?: { id?: string; schedulerDispatchDryRunId?: string; plannedWorkerCount?: number; stageCount?: number };
        claimReconcilePlan?: { id?: string; schedulerWorkerPlanId?: string; claimIntents?: unknown[]; maxPlannedWaveWidth?: number };
        launchPreflight?: { id?: string; status?: string; schedulerClaimReconcilePlanId?: string; plannedSlotDemand?: number };
        schedulerRun?: { id?: string; status?: string; schedulerLaunchPreflightId?: string; claimIntentCount?: number; plannedSlotDemand?: number };
        runtimeState?: { id?: string; schedulerRunId?: string; blockedCount?: number; lastReconcileSnapshotId?: string; lastClaimReservationId?: string };
        reconcileSnapshot?: { id?: string; schedulerRunId?: string; status?: string; warningCount?: number };
        claimReservation?: { id?: string; schedulerRunId?: string; schedulerReconcileSnapshotId?: string; reservedCount?: number; blockedCount?: number };
        launchBrief?: { status?: string; schedulerRunId?: string; schedulerReconcileSnapshotId?: string; schedulerClaimReservationId?: string; reservedCount?: number; blockedCount?: number; summary?: string };
      };
    }).result;
    expect(preparedResult).toMatchObject({ status: "prepared", mode: "prepared-new-evidence" });
    const contract = preparedResult?.contract;
    const dryRun = preparedResult?.dryRun;
    const workerPlan = preparedResult?.workerPlan;
    const claimReconcilePlan = preparedResult?.claimReconcilePlan;
    const launchPreflight = preparedResult?.launchPreflight;
    const schedulerRun = preparedResult?.schedulerRun;
    const runtimeState = preparedResult?.runtimeState;
    const reconcileSnapshot = preparedResult?.reconcileSnapshot;
    const claimReservation = preparedResult?.claimReservation;
    expect(contract).toMatchObject({ readinessManifestId: manifest?.id });
    expect(dryRun).toMatchObject({ schedulerContractId: contract?.id, estimatedMaxWaveWidth: 2 });
    expect(workerPlan).toMatchObject({ schedulerDispatchDryRunId: dryRun?.id, plannedWorkerCount: 8, stageCount: 8 });
    expect(claimReconcilePlan).toMatchObject({ schedulerWorkerPlanId: workerPlan?.id, maxPlannedWaveWidth: 2 });
    expect(claimReconcilePlan?.claimIntents).toHaveLength(2);
    expect(launchPreflight).toMatchObject({ status: "checked", schedulerClaimReconcilePlanId: claimReconcilePlan?.id, plannedSlotDemand: 2 });
    expect(schedulerRun).toMatchObject({ status: "prepared", schedulerLaunchPreflightId: launchPreflight?.id, claimIntentCount: 2, plannedSlotDemand: 2 });
    expect(runtimeState).toMatchObject({ schedulerRunId: schedulerRun?.id, blockedCount: 0 });
    expect(reconcileSnapshot).toMatchObject({ status: "generated", schedulerRunId: schedulerRun?.id, warningCount: 0 });
    expect(claimReservation).toMatchObject({ status: "reserved", schedulerRunId: schedulerRun?.id, schedulerReconcileSnapshotId: reconcileSnapshot?.id, reservedCount: 2, blockedCount: 0 });
    expect(preparedResult?.launchBrief).toMatchObject({
      status: "ready",
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      schedulerClaimReservationId: claimReservation?.id,
      reservedCount: 2,
      blockedCount: 0,
    });

    const fullContract = await getWorkbenchSchedulerContractProjection({ project: project(), path: tempDir }, topic.changeId, contract?.id);
    expect(fullContract).toMatchObject({
      id: contract?.id,
      schedulerMode: "parallel-readiness-v1",
      waves: [expect.objectContaining({ nodeIds: expect.arrayContaining(["scheduler-node-001", "scheduler-node-002"]) })],
    });
    const fullReservation = await getWorkbenchSchedulerClaimReservationProjection({ project: project(), path: tempDir }, topic.changeId, schedulerRun?.id, claimReservation?.id);
    expect(fullReservation).toMatchObject({
      id: claimReservation?.id,
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      status: "reserved",
    });
    const runtimeEventsPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-runtime-events.jsonl");
    const reservedRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(reservedRuntimeEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ schedulerRunId: schedulerRun?.id, changeId: topic.changeId, type: "scheduler-runtime.initialized" }),
      expect.objectContaining({ schedulerRunId: schedulerRun?.id, changeId: topic.changeId, type: "scheduler-runtime.reconciled" }),
      expect.objectContaining({ schedulerRunId: schedulerRun?.id, changeId: topic.changeId, type: "scheduler-runtime.claim-reserved" }),
    ]));

    const reservedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(reservedSnapshot.center.workpad.schedulerClaimReservation).toMatchObject({
      id: claimReservation?.id,
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      reservedCount: 2,
      blockedCount: 0,
    });
    expect(reservedSnapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.plan.prepare",
      label: "确认低冲突执行方向",
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      schedulerClaimReservationId: claimReservation?.id,
    });
    expect(reservedSnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.plan.prepare", label: "确认低冲突执行方向" }),
    ]));
    const schedulerActions = reservedSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => action.actionType);
    expect(schedulerActions).toContain("planning.scheduler.plan.prepare");
    expect(schedulerActions).not.toContain("planning.scheduler.runtime.initialize");
    expect(schedulerActions).not.toContain("planning.scheduler.runtime.reconcile");
    expect(schedulerActions).not.toContain("planning.scheduler.runtime.reserve-claims");

    const launchAction = reservedSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.plan.prepare" && action.schedulerClaimReservationId === claimReservation?.id);
    if (!launchAction) throw new Error("Missing scheduler launch confirmation action.");
    const launchConfirmation = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      ...launchAction,
      confirm: true,
    });
    expect((launchConfirmation.result as { result?: { mode?: string; launchBrief?: { schedulerClaimReservationId?: string } } }).result).toMatchObject({
      mode: "launch-confirmation",
      launchBrief: { schedulerClaimReservationId: claimReservation?.id },
    });
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.scheduler.plan.prepare",
      changeId: topic.changeId,
      schedulerContractId: launchAction.schedulerContractId,
      schedulerDispatchDryRunId: launchAction.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: launchAction.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: launchAction.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: launchAction.schedulerLaunchPreflightId,
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: "forged-reconcile-snapshot",
      schedulerClaimReservationId: claimReservation?.id,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    expect(await listTaskQueues(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listWorkflowRuns(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listTaskRuns(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listAgentTasks(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listWorktreeStatuses(beforeMemory)).toHaveLength(0);
    expect((await listRuns(beforeMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(0);

    const startSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(startSnapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.worker.start-first",
      label: "开始第一个任务",
      schedulerRunId: schedulerRun?.id,
      schedulerClaimReservationId: claimReservation?.id,
    });
    expect(startSnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionType: "planning.scheduler.controlled-advance.run",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
      }),
    ]));
    const startAction = startSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.start-first", (candidate) => candidate.schedulerClaimReservationId === claimReservation?.id));
    if (!startAction) throw new Error("Missing scheduler first worker action.");

    await initGitRepository(tempDir);
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, ".gitignore"), "harness/\n.agent-harness/\nfake-codex-bin/\n", "utf8");
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }), "utf8");
    await writeFile(join(tempDir, "src", "module-a.ts"), "export const moduleA = 1;\n", "utf8");
    await writeFile(join(tempDir, "src", "module-b.ts"), "export const moduleB = 1;\n", "utf8");
    await git(tempDir, ["add", "."]);
    await git(tempDir, ["commit", "-m", "initial"]);

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    try {
      const started = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...startAction,
        confirm: true,
      });
      const startedActionResult = (started.result as {
        result?: unknown;
      }).result ?? started.result;
      const startedResult = unwrapControlledSchedulerAdvanceResult(startedActionResult) as {
          executionStarted?: boolean;
          workerStart?: {
            id?: string;
            status?: string;
            stage?: string;
            schedulerRunId?: string;
            schedulerClaimReservationId?: string;
            reservationIntentId?: string;
            claimIntentId?: string;
            taskRunId?: string;
            workerLeaseId?: string;
            taskRunRoleId?: string;
            agentRoleId?: string;
            worktreeId?: string;
            runId?: string;
          };
          taskRun?: { id?: string; roleId?: string };
          lease?: { id?: string; taskRunId?: string };
          code?: { run?: { id?: string; changeId?: string; taskRunId?: string; runtime?: string; executionGate?: Record<string, unknown> } };
        };
      expect(startedResult).toMatchObject({
        executionStarted: true,
        workerStart: {
          status: "started",
          stage: "coder",
          schedulerRunId: schedulerRun?.id,
          schedulerClaimReservationId: claimReservation?.id,
          taskRunRoleId: "coder",
          agentRoleId: "coder-agent",
        },
      });
      expect(startedResult?.taskRun).toMatchObject({ id: startedResult?.workerStart?.taskRunId, roleId: "coder" });
      expect(startedResult?.lease).toMatchObject({ id: startedResult?.workerStart?.workerLeaseId, taskRunId: startedResult?.workerStart?.taskRunId });
      expect(startedResult?.code?.run).toMatchObject({
        id: startedResult?.workerStart?.runId,
        changeId: topic.changeId,
        taskRunId: startedResult?.workerStart?.taskRunId,
        executionGate: {
          mode: "scheduler-claim-reservation",
          schedulerRunId: schedulerRun?.id,
          schedulerClaimReservationId: claimReservation?.id,
          reservationIntentId: startedResult?.workerStart?.reservationIntentId,
          claimIntentId: startedResult?.workerStart?.claimIntentId,
          taskRunId: startedResult?.workerStart?.taskRunId,
        },
      });

      const afterMemory = await resolveProjectMemory(project());
      expect(await listTaskQueues(afterMemory, topic.changeId)).toHaveLength(0);
      expect(await listWorkflowRuns(afterMemory, topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(afterMemory, topic.changeId)).toHaveLength(0);
      expect(await listTaskRuns(afterMemory, topic.changeId)).toHaveLength(1);
      expect(await listWorktreeStatuses(afterMemory)).toHaveLength(1);
      expect((await listRuns(afterMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(1);
      const workerStartPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-starts", `${startedResult?.workerStart?.id}.json`);
      expect(JSON.parse(await readFile(workerStartPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        status: "started",
        stage: "coder",
        taskRunRoleId: "coder",
        agentRoleId: "coder-agent",
      });
      const workerRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(workerRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-started",
          payload: expect.objectContaining({
            schedulerClaimReservationId: claimReservation?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            runId: startedResult?.workerStart?.runId,
          }),
        }),
      ]));
      await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...startAction,
        confirm: true,
      })).rejects.toThrow("stale or no longer available");

      const resultSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(resultSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.reconcile-result",
        label: "检查当前 worker 结果",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
      });
      const resultAction = resultSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.reconcile-result", (candidate) => candidate.schedulerWorkerStartId === startedResult?.workerStart?.id));
      if (!resultAction) throw new Error("Missing scheduler first worker result reconcile action.");
      expect(resultAction).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
      });

      const reconciled = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...resultAction,
        confirm: true,
      });
      expect(reconciled.result).toMatchObject({ status: "completed" });
      const reconciledActionResult = (reconciled.result as {
        result?: {
          status?: "terminal" | "running";
          result?: {
            id?: string;
            status?: string;
            schedulerWorkerStartId?: string;
            taskRunId?: string;
            workerLeaseId?: string;
            worktreeId?: string;
            runId?: string;
          };
          taskRun?: { id?: string; status?: string };
          lease?: { id?: string; status?: string };
          codeRun?: { id?: string; status?: string };
        };
      }).result ?? reconciled.result;
      const reconciledResult = unwrapControlledSchedulerAdvanceResult(reconciledActionResult) as {
        status?: "terminal" | "running";
        result?: {
          id?: string;
          status?: string;
          schedulerWorkerStartId?: string;
          taskRunId?: string;
          workerLeaseId?: string;
          worktreeId?: string;
          runId?: string;
        };
        taskRun?: { id?: string; status?: string };
        lease?: { id?: string; status?: string };
        codeRun?: { id?: string; status?: string };
      };
      expect(reconciledResult).toMatchObject({
        status: "terminal",
        result: {
          status: "evidence-ready",
          schedulerWorkerStartId: startedResult?.workerStart?.id,
          taskRunId: startedResult?.workerStart?.taskRunId,
          workerLeaseId: startedResult?.workerStart?.workerLeaseId,
          worktreeId: startedResult?.workerStart?.worktreeId,
          runId: startedResult?.workerStart?.runId,
        },
        taskRun: { id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" },
        lease: { id: startedResult?.workerStart?.workerLeaseId, status: "released" },
        codeRun: { id: startedResult?.workerStart?.runId, status: "completed" },
      });
      expect((await listTaskRuns(afterMemory, topic.changeId))[0]).toMatchObject({ id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" });
      expect((await listWorkerLeases(afterMemory, topic.changeId)).find((lease) => lease.id === startedResult?.workerStart?.workerLeaseId)).toMatchObject({ status: "released" });
      const workerResultPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-results", `${reconciledResult?.result?.id}.json`);
      expect(JSON.parse(await readFile(workerResultPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        status: "evidence-ready",
      });
      const resultRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(resultRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-result-ready",
          payload: expect.objectContaining({
            schedulerWorkerStartId: startedResult?.workerStart?.id,
            schedulerWorkerResultId: reconciledResult?.result?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            runId: startedResult?.workerStart?.runId,
          }),
        }),
      ]));
      const postResultSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(postResultSnapshot.center.workpad.schedulerWorkerResult).toMatchObject({
        id: reconciledResult?.result?.id,
        status: "evidence-ready",
        schedulerWorkerStartId: startedResult?.workerStart?.id,
      });
      expect(postResultSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.validate-first",
        label: "验证当前 worker 结果",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        enabled: true,
      });
      expect(postResultSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.reconcile-result")).toBe(false);
      const validationAction = postResultSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.validate-first", (candidate) => candidate.schedulerWorkerResultId === reconciledResult?.result?.id));
      if (!validationAction) throw new Error("Missing scheduler first worker validation action.");
      expect(validationAction).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
      });
      const validated = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...validationAction,
        confirm: true,
      });
      const validatedActionResult = (validated.result as {
        result?: {
          status?: "passed" | "failed";
          schedulerValidation?: {
            id?: string;
            status?: string;
            schedulerWorkerResultId?: string;
            taskRunId?: string;
            workerLeaseId?: string;
            worktreeId?: string;
            codeRunId?: string;
            validationRunId?: string;
          };
          taskRun?: { id?: string; status?: string };
          validationRun?: { id?: string; runtime?: string; worktree?: { worktreeId?: string } };
          validationResult?: { id?: string; status?: string; worktreeId?: string };
        };
      }).result ?? validated.result;
      const validatedResult = unwrapControlledSchedulerAdvanceResult(validatedActionResult) as {
        status?: "passed" | "failed";
        schedulerValidation?: {
          id?: string;
          status?: string;
          schedulerWorkerResultId?: string;
          taskRunId?: string;
          workerLeaseId?: string;
          worktreeId?: string;
          codeRunId?: string;
          validationRunId?: string;
        };
        taskRun?: { id?: string; status?: string };
        validationRun?: { id?: string; runtime?: string; worktree?: { worktreeId?: string } };
        validationResult?: { id?: string; status?: string; worktreeId?: string };
      };
      expect(validatedResult).toMatchObject({
        status: "passed",
        schedulerValidation: {
          status: "passed",
          schedulerWorkerResultId: reconciledResult?.result?.id,
          taskRunId: startedResult?.workerStart?.taskRunId,
          workerLeaseId: startedResult?.workerStart?.workerLeaseId,
          worktreeId: startedResult?.workerStart?.worktreeId,
          codeRunId: startedResult?.workerStart?.runId,
        },
        taskRun: { id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" },
        validationRun: { runtime: "validator", worktree: { worktreeId: startedResult?.workerStart?.worktreeId } },
        validationResult: { status: "passed", worktreeId: startedResult?.workerStart?.worktreeId },
      });
      const workerValidationPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-validations", `${validatedResult?.schedulerValidation?.id}.json`);
      expect(JSON.parse(await readFile(workerValidationPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        status: "passed",
        worktreeId: startedResult?.workerStart?.worktreeId,
        codeRunId: startedResult?.workerStart?.runId,
        validationRunId: validatedResult?.schedulerValidation?.validationRunId,
      });
      const validationRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(validationRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-validation-passed",
          payload: expect.objectContaining({
            schedulerWorkerStartId: startedResult?.workerStart?.id,
            schedulerWorkerResultId: reconciledResult?.result?.id,
            schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            codeRunId: startedResult?.workerStart?.runId,
            validationRunId: validatedResult?.schedulerValidation?.validationRunId,
            validationStatus: "passed",
          }),
        }),
      ]));
      const postValidationMemory = await resolveProjectMemory(project());
      expect((await listTaskRuns(postValidationMemory, topic.changeId))[0]).toMatchObject({ id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" });
      expect((await listRuns(postValidationMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(2);
      const postValidationSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(postValidationSnapshot.center.workpad.schedulerWorkerValidation).toMatchObject({
        id: validatedResult?.schedulerValidation?.id,
        status: "passed",
        schedulerWorkerResultId: reconciledResult?.result?.id,
      });
      expect(postValidationSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.audit-first",
        label: "审计当前 worker 结果",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        enabled: true,
      });
      expect(postValidationSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.validate-first")).toBe(false);
      const auditAction = postValidationSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.audit-first", (candidate) => candidate.schedulerWorkerValidationId === validatedResult?.schedulerValidation?.id));
      if (!auditAction) throw new Error("Missing scheduler first worker audit action.");
      expect(auditAction).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
      });
      const repeatedValidation = await validateSchedulerFirstWorker(project(), {
        changeId: topic.changeId,
        schedulerRunId: `${schedulerRun?.id}`,
        schedulerWorkerResultId: `${reconciledResult?.result?.id}`,
      });
      expect(repeatedValidation).toMatchObject({
        existing: true,
        executionStarted: false,
        schedulerValidation: { id: validatedResult?.schedulerValidation?.id },
      });
      const audited = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...auditAction,
        confirm: true,
      });
      const auditedActionResult = (audited.result as {
        result?: unknown;
      }).result ?? audited.result;
      const auditedResult = (unwrapControlledSchedulerAdvanceResult(auditedActionResult) as {
        existing?: boolean;
        executionStarted?: boolean;
        schedulerAudit?: {
          id?: string;
          status?: string;
          schedulerWorkerValidationId?: string;
          schedulerWorkerResultId?: string;
          schedulerWorkerStartId?: string;
          taskRunId?: string;
          workerLeaseId?: string;
          worktreeId?: string;
          codeRunId?: string;
          validationRunId?: string;
          auditRunId?: string;
        };
        taskRun?: { id?: string; status?: string };
        auditRun?: { id?: string; runtime?: string; worktree?: { worktreeId?: string } };
        auditResult?: { id?: string; status?: string; worktreeId?: string; validationId?: string };
      });
      expect(auditedResult).toMatchObject({
        executionStarted: true,
        schedulerAudit: {
          status: "approved",
          schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
          schedulerWorkerResultId: reconciledResult?.result?.id,
          schedulerWorkerStartId: startedResult?.workerStart?.id,
          taskRunId: startedResult?.workerStart?.taskRunId,
          workerLeaseId: startedResult?.workerStart?.workerLeaseId,
          worktreeId: startedResult?.workerStart?.worktreeId,
          codeRunId: startedResult?.workerStart?.runId,
          validationRunId: validatedResult?.schedulerValidation?.validationRunId,
        },
        taskRun: { id: startedResult?.workerStart?.taskRunId, status: "completed" },
        auditRun: { runtime: "auditor" },
        auditResult: {
          status: "approved",
          worktreeId: startedResult?.workerStart?.worktreeId,
          validationId: validatedResult?.schedulerValidation?.validationRunId,
        },
      });
      const workerAuditPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-audits", `${auditedResult.schedulerAudit?.id}.json`);
      expect(JSON.parse(await readFile(workerAuditPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        status: "approved",
        worktreeId: startedResult?.workerStart?.worktreeId,
        codeRunId: startedResult?.workerStart?.runId,
        validationRunId: validatedResult?.schedulerValidation?.validationRunId,
        auditRunId: auditedResult.schedulerAudit?.auditRunId,
      });
      const auditRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(auditRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-audit-approved",
          payload: expect.objectContaining({
            schedulerWorkerStartId: startedResult?.workerStart?.id,
            schedulerWorkerResultId: reconciledResult?.result?.id,
            schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
            schedulerWorkerAuditId: auditedResult.schedulerAudit?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            codeRunId: startedResult?.workerStart?.runId,
            validationRunId: validatedResult?.schedulerValidation?.validationRunId,
            auditRunId: auditedResult.schedulerAudit?.auditRunId,
            auditStatus: "approved",
          }),
        }),
      ]));
      const postAuditMemory = await resolveProjectMemory(project());
      expect((await listTaskRuns(postAuditMemory, topic.changeId))[0]).toMatchObject({ id: startedResult?.workerStart?.taskRunId, status: "completed" });
      expect((await listRuns(postAuditMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(3);
      const postAuditSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(postAuditSnapshot.center.workpad.schedulerWorkerAudit).toMatchObject({
        id: auditedResult.schedulerAudit?.id,
        status: "approved",
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
      });
      expect(postAuditSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.integration-candidate.compile",
        enabled: true,
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerAuditId: auditedResult.schedulerAudit?.id,
      });
      expect(postAuditSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.audit-first")).toBe(false);
      expect(postAuditSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => findSchedulerGateAction(
        [action],
        "planning.scheduler.integration-candidate.compile",
        (candidate) => candidate.schedulerWorkerAuditId === auditedResult.schedulerAudit?.id,
      ))).toBe(true);
      expect(postAuditSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => {
        const actionType = action.actionType ?? "";
        return actionType === "apply-check.run" || actionType.startsWith("landing.") || actionType.startsWith("remote-landing.");
      })).toBe(false);
      const repeatedAudit = await auditSchedulerFirstWorker(project(), {
        changeId: topic.changeId,
        schedulerRunId: `${schedulerRun?.id}`,
        schedulerWorkerValidationId: `${validatedResult?.schedulerValidation?.id}`,
      });
      expect(repeatedAudit).toMatchObject({
        existing: true,
        executionStarted: false,
        schedulerAudit: { id: auditedResult.schedulerAudit?.id },
      });
      await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...resultAction,
        confirm: true,
      })).rejects.toThrow("stale or no longer available");
    } finally {
      process.env.PATH = oldPath;
    }
  }, 120000);

});
