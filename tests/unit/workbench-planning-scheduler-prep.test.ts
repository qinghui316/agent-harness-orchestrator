import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic } from "../../src/workbench/chat.js";
import { getWorkbenchDecompositionPlanProjection, getWorkbenchDecompositionReadinessProjection, getWorkbenchSchedulerClaimReservationProjection, getWorkbenchSchedulerContractProjection, getWorkbenchSnapshot, getWorkbenchTaskQueueProposalProjection, getWorkbenchWorkflowGraphPlanProjection } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listAgentTasks } from "../../src/agent-task/manager.js";
import { buildDeterministicPlanningBundle } from "../../src/workbench/planning/builders.js";
import { listWorktreeStatuses } from "../../src/worktree/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listTaskRuns } from "../../src/task-run/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { getTempDir, project, writeAcceptedSpecAndTasks, writePlanningBundleFixture } from "./workbench/fixtures.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = getTempDir();
});

describe("workbench planning and scheduler preparation", () => {
  it("builds generic planning artifacts from the accepted demand instead of stale demo rules", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const prompt = "为 AHO 增加一个非 CI 的 current-project real Codex acceptance 入口或说明，明确如何用当前项目跑真实 Workbench/Codex 验收，并区分它和 fake fixture 测试。";

    const bundle = buildDeterministicPlanningBundle(memory, "harness/changes/active/real-codex-acceptance", "real-codex-acceptance", prompt, null, false);
    const acceptedText = [...bundle.acceptanceCriteria, bundle.design, bundle.tasks[0]?.title ?? ""].join("\n");

    expect(acceptedText).toContain("完成用户需求");
    expect(acceptedText).toContain("真实 Codex 验收");
    expect(acceptedText).toContain("Workbench action path");
    expect(acceptedText).not.toContain("金额按分");
    expect(acceptedText).not.toContain("pricing rule");
  });

  it("projects confirmed planning next action into the right confirmation queue", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Ready Demand",
      body: "Run the accepted plan.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const planningBundleId = await writePlanningBundleFixture(topic.changeId);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.confirm-execution",
      enabled: true,
    });
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      kind: "planning-confirm",
      changeId: topic.changeId,
      summary: expect.stringContaining("写入内部 spec/plan/tasks/ac-map"),
    });
    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.confirm-execution", label: "确认规划", planningBundleId }),
    ]));
    expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.goal-loop.evaluate")).toBe(false);
  });

  it("rejects stale planning bundle confirmation", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Stale Planning",
      body: "Confirm only the visible planning bundle.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const staleBundleId = await writePlanningBundleFixture(topic.changeId, "First bundle", "first");
    await writePlanningBundleFixture(topic.changeId, "Second bundle", "second");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: topic.changeId,
      planningBundleId: staleBundleId,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("generates and confirms a DecompositionPlan without creating execution artifacts", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Decompose Demand",
      body: "Assess whether this should be split before execution.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const planningBundleId = await writePlanningBundleFixture(topic.changeId, "Implement one scoped demand.");
    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: topic.changeId,
      planningBundleId,
      confirm: true,
    });

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id);
    expect(planId).toBeTruthy();

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.decompositionPlan).toMatchObject({
      id: planId,
      status: "draft",
      recommendation: "single-change",
    });
    expect(snapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "planning-confirm",
        actions: expect.arrayContaining([
          expect.objectContaining({ actionType: "planning.decomposition.confirm", decompositionPlanId: planId }),
        ]),
      }),
    ]));
    const fullPlan = await getWorkbenchDecompositionPlanProjection({ project: project(), path: tempDir }, topic.changeId);
    expect(fullPlan).toMatchObject({ id: planId, status: "draft", units: expect.any(Array) });

    const confirmed = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.confirm",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    expect(confirmed.result).toMatchObject({ status: "completed", result: expect.objectContaining({ executionStarted: false }) });
    const confirmedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(confirmedSnapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ actionType: "planning.decomposition.assess-readiness", decompositionPlanId: planId }),
        ]),
      }),
    ]));
    const readiness = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    const manifest = (readiness.result as { result?: { manifest?: { id?: string; status?: string; executable?: boolean; nextAllowedAction?: string } } }).result?.manifest;
    expect(manifest).toMatchObject({
      status: "ready-for-single-change",
      executable: false,
      nextAllowedAction: "code.run",
    });
    const readinessSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(readinessSnapshot.center.workpad.decompositionReadiness).toMatchObject({
      id: manifest?.id,
      decompositionPlanId: planId,
      status: "ready-for-single-change",
      nextAllowedAction: "code.run",
    });
    const fullManifest = await getWorkbenchDecompositionReadinessProjection({ project: project(), path: tempDir }, topic.changeId);
    expect(fullManifest).toMatchObject({
      id: manifest?.id,
      changeId: topic.changeId,
      decompositionPlanId: planId,
      executable: false,
    });
    const memory = await resolveProjectMemory(project());
    expect(await listAgentTasks(memory, topic.changeId)).toHaveLength(0);
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);
    expect((await getWorkbenchDecompositionPlanProjection({ project: project(), path: tempDir }, topic.changeId))?.status).toBe("confirmed");
  });

  it("rejects draft or stale DecompositionPlan readiness assessment", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Readiness Stale Plan",
      body: "Assess only the visible confirmed decomposition plan.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const planningBundleId = await writePlanningBundleFixture(topic.changeId, "Implement one scoped demand.");
    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: topic.changeId,
      planningBundleId,
      confirm: true,
    });

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id);
    expect(planId).toBeTruthy();

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.confirm",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: "forged-plan",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("fails closed when readiness plan references forged task ids", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Forged Readiness Task",
      body: "Reject decomposition plans that no longer match accepted tasks.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const planningBundleId = await writePlanningBundleFixture(topic.changeId, "Implement one scoped demand.");
    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: topic.changeId,
      planningBundleId,
      confirm: true,
    });

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id);
    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.confirm",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    const planPath = join(tempDir, "harness", "changes", "active", topic.changeId, "planning", "decomposition-plan.json");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    plan.units[0].taskIds = ["T-FORGED"];
    await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    expect(result.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("task-ids-known"),
    });
    const memory = await resolveProjectMemory(project());
    expect(await listAgentTasks(memory, topic.changeId)).toHaveLength(0);
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);
    expect(await getWorkbenchDecompositionReadinessProjection({ project: project(), path: tempDir }, topic.changeId)).toBeNull();
  });

  it("generates TaskQueueProposal only from latest sequential readiness without starting execution", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Sequential Proposal",
      body: "Split this into ordered taskgraph work.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const changeDir = join(tempDir, "harness", "changes", "active", topic.changeId);
    await writeFile(join(changeDir, "tasks.md"), [
      "# Tasks",
      "",
      "- [ ] T-001: First task.",
      "  - Covers: AC-001",
      "- [ ] T-002: Second task.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");
    const planningBundleId = await writePlanningBundleFixture(topic.changeId, "Implement ordered split work.");
    const bundlePath = join(changeDir, "planning", "latest-bundle.json");
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.tasks = [
      { id: "T-001", title: "First task", acIds: ["AC-001"] },
      { id: "T-002", title: "Second task", acIds: ["AC-001"] },
    ];
    bundle.tasksMd = "- [ ] T-001: First task\n  - Covers: AC-001\n- [ ] T-002: Second task\n  - Covers: AC-001\n";
    await writeFile(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: topic.changeId,
      planningBundleId,
      confirm: true,
    });

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string; recommendation?: string } } }).result?.plan?.id);
    expect((draft.result as { result?: { plan?: { recommendation?: string } } }).result?.plan?.recommendation).toBe("taskgraph-sequential");
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
    const manifest = (readiness.result as { result?: { manifest?: { id?: string; status?: string; nextAllowedAction?: string } } }).result?.manifest;
    expect(manifest).toMatchObject({ status: "ready-for-sequential-taskqueue-proposal", nextAllowedAction: "taskqueue.proposal" });

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.propose",
      changeId: topic.changeId,
      readinessManifestId: "forged-readiness",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    const proposed = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.propose",
      changeId: topic.changeId,
      readinessManifestId: manifest?.id,
      confirm: true,
    });
    const proposal = (proposed.result as { result?: { proposal?: { id?: string; itemCount?: number; status?: string; readinessManifestId?: string; executionStarted?: boolean } } }).result?.proposal;
    expect(proposal).toMatchObject({ status: "draft", readinessManifestId: manifest?.id });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.taskQueueProposal).toMatchObject({ id: proposal?.id, itemCount: 2, status: "draft" });
    expect(snapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ actionType: "planning.workflowgraph.compile", taskQueueProposalId: proposal?.id, readinessManifestId: manifest?.id }),
        ]),
      }),
    ]));
    const fullProposal = await getWorkbenchTaskQueueProposalProjection({ project: project(), path: tempDir }, topic.changeId);
    expect(fullProposal).toMatchObject({ id: proposal?.id, items: expect.arrayContaining([expect.objectContaining({ taskId: "T-002" })]) });
    const memory = await resolveProjectMemory(project());
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);

    const compiled = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.workflowgraph.compile",
      changeId: topic.changeId,
      taskQueueProposalId: proposal?.id,
      readinessManifestId: manifest?.id,
      confirm: true,
    });
    const graph = (compiled.result as { result?: { graph?: { id?: string; taskQueueProposalId?: string; readinessManifestId?: string } } }).result?.graph;
    expect(graph).toMatchObject({ taskQueueProposalId: proposal?.id, readinessManifestId: manifest?.id });
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);
    const fullGraph = await getWorkbenchWorkflowGraphPlanProjection({ project: project(), path: tempDir }, topic.changeId, graph?.id);
    expect(fullGraph).toMatchObject({ id: graph?.id, graphMode: "sequential-v1", taskQueueProposalId: proposal?.id });

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.confirm-start",
      changeId: topic.changeId,
      taskQueueProposalId: "forged-proposal",
      workflowGraphPlanId: graph?.id,
      readinessManifestId: manifest?.id,
      decompositionPlanId: manifest?.decompositionPlanId,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("prepares SchedulerContract and claim reservation without starting workers", async () => {
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
    await writePlanningBundleFixture(topic.changeId, "Implement independent parallel module updates.");
    const bundlePath = join(changeDir, "planning", "latest-bundle.json");
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.status = "confirmed";
    bundle.tasks = [
      { id: "T-001", title: "Update module A", acIds: ["AC-001"] },
      { id: "T-002", title: "Update module B", acIds: ["AC-001"] },
    ];
    bundle.tasksMd = "- [ ] T-001: Update module A\n  - Covers: AC-001\n- [ ] T-002: Update module B\n  - Covers: AC-001\n";
    await writeFile(bundlePath, JSON.stringify(bundle, null, 2), "utf8");

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
      expect.objectContaining({ actionType: "planning.scheduler.plan.prepare", label: "准备并行执行计划" }),
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
      label: "确认启动这个并行执行计划",
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      schedulerClaimReservationId: claimReservation?.id,
    });
    expect(reservedSnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.plan.prepare", label: "确认启动这个并行执行计划" }),
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

  });
});
