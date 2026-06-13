import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileGoalLoopDecision, compileGoalLoopEvaluation, readLatestGoalLoopIteration } from "../../src/goal-loop/manager.js";
import type { ResolvedMemory } from "../../src/types/index.js";
import { schedulerRunArtifactRefs, writeSchedulerRun } from "../../src/workflow-scheduler/repository.js";
import type { SchedulerRun } from "../../src/workflow-scheduler/types.js";
import {
  schedulerClaimReservationArtifactRefs,
  schedulerRuntimeArtifactRefs,
  schedulerWorkerStartArtifactRefs,
  writeSchedulerRuntimeClaimReservation,
  writeSchedulerRuntimeState,
  writeSchedulerRuntimeWorkerStart,
} from "../../src/scheduler-runtime/repository.js";
import type { SchedulerRuntimeClaimReservation, SchedulerRuntimeState, SchedulerRuntimeWorkerStart } from "../../src/scheduler-runtime/types.js";

let tempDir: string;
let memory: ResolvedMemory;
const changeId = "phase-goal-loop";
const changePath = `harness/changes/active/${changeId}`;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-goal-loop-"));
  memory = buildMemory(tempDir);
  await mkdir(join(memory.memoryRoot, changePath), { recursive: true });
  await writeJson(join(memory.memoryRoot, changePath, "change.json"), { id: changeId, state: "active", title: "Goal loop" });
  await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n", "utf8");
  await writeFile(join(memory.memoryRoot, changePath, "plan.md"), "# Plan\n", "utf8");
  await writeFile(join(memory.memoryRoot, changePath, "tasks.md"), "# Tasks\n", "utf8");
  await writeJson(join(memory.memoryRoot, changePath, "ac-map.json"), { generatedAt: "2026-06-14T00:00:00.000Z", items: [] });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("GoalLoopDecision", () => {
  it("records non-executing planning evidence and recommends scheduler plan preparation when only planning exists", async () => {
    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("parallel-plan-needed");
    expect(decision.recommendedAction?.actionType).toBe("planning.scheduler.plan.prepare");
    expect(decision.recommendedAction?.scope).toMatchObject({ changeId });
    expect(decision.executionStarted).toBe(false);
  });

  it("does not recommend another scheduler worker start after a worker start already exists", async () => {
    await writeSchedulerEvidence({ withWorkerStart: true });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("wait-for-evidence");
    expect(decision.recommendedAction).toBeUndefined();
    expect(decision.summary).toContain("Scheduler worker evidence already exists");
    expect(decision.executionStarted).toBe(false);
  });

  it("can recommend the first scheduler worker when a reserved claim exists and no worker has started", async () => {
    const { schedulerRun, reservation } = await writeSchedulerEvidence({ withWorkerStart: false });

    const decision = await compileGoalLoopDecision(memory, changePath);

    expect(decision.decisionKind).toBe("scheduler-next-step");
    expect(decision.recommendedAction).toMatchObject({
      actionType: "planning.scheduler.worker.start-first",
      scope: {
        changeId,
        schedulerRunId: schedulerRun.id,
        schedulerClaimReservationId: reservation.id,
      },
    });
    expect(decision.executionStarted).toBe(false);
  });

  it("records first and second goal loop iterations with previous lineage", async () => {
    const first = await compileGoalLoopEvaluation(memory, changePath);

    expect(first.goalLoopIteration).toMatchObject({
      changeId,
      ordinal: 1,
      authority: "non-executing-continuation-evidence",
      trigger: "user-confirmed-evaluate",
      iterationStatus: "recorded",
      continuationVerdict: "recommend-existing-gate",
      goalLoopDecisionId: first.goalLoopDecision.id,
      executionStarted: false,
    });
    expect(first.goalLoopIteration.previousGoalLoopDecisionId).toBeUndefined();
    expect(first.goalLoopIteration.previousGoalLoopIterationId).toBeUndefined();

    const second = await compileGoalLoopEvaluation(memory, changePath);

    expect(second.goalLoopIteration).toMatchObject({
      changeId,
      ordinal: 2,
      previousGoalLoopDecisionId: first.goalLoopDecision.id,
      previousGoalLoopIterationId: first.goalLoopIteration.id,
      goalLoopDecisionId: second.goalLoopDecision.id,
      executionStarted: false,
    });
    expect(second.goalLoopIteration.previousGoalLoopDecisionId).not.toBe(second.goalLoopDecision.id);
    await expect(readLatestGoalLoopIteration(memory, changePath)).resolves.toMatchObject({
      id: second.goalLoopIteration.id,
      ordinal: 2,
    });
  });
});

async function writeSchedulerEvidence(options: { withWorkerStart: boolean }): Promise<{ schedulerRun: SchedulerRun; reservation: SchedulerRuntimeClaimReservation }> {
  const now = "2026-06-14T00:00:00.000Z";
  const schedulerRunId = "scheduler-run-1";
  const schedulerRunRefs = schedulerRunArtifactRefs(memory, changePath, schedulerRunId);
  const schedulerRun: SchedulerRun = {
    version: "1.0",
    id: schedulerRunId,
    changeId,
    status: "prepared",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    decompositionPlanId: "decomposition-1",
    readinessManifestId: "readiness-1",
    claimIntentCount: 1,
    plannedSlotDemand: 1,
    maxPlannedWaveWidth: 1,
    blockedCount: 0,
    humanConfirmed: true,
    futureToolPolicyGateRequired: true,
    futureHumanGateRequired: true,
    sourceArtifactHashes: { spec: "hash-1" },
    artifactRefs: [schedulerRunRefs.artifact],
    artifact: schedulerRunRefs.artifact,
    markdownArtifact: schedulerRunRefs.markdownArtifact,
    journalArtifact: schedulerRunRefs.journalArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRun(memory, changePath, schedulerRun);

  const runtimeRefs = schedulerRuntimeArtifactRefs(memory, changePath, schedulerRunId);
  const runtimeState: SchedulerRuntimeState = {
    version: "1.0",
    id: "runtime-state-1",
    changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "initialized",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    decompositionPlanId: "decomposition-1",
    readinessManifestId: "readiness-1",
    claimIntents: [],
    waves: [],
    plannedSlotDemand: 1,
    maxPlannedWaveWidth: 1,
    blockedCount: 0,
    lastReconcileSnapshotId: "snapshot-1",
    lastClaimReservationId: "reservation-1",
    lastClaimReservationSnapshotId: "snapshot-1",
    sourceArtifactHashes: { spec: "hash-1" },
    artifactRefs: [runtimeRefs.artifact],
    artifact: runtimeRefs.artifact,
    eventsArtifact: runtimeRefs.eventsArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeState(memory, changePath, runtimeState);

  const reservationRefs = schedulerClaimReservationArtifactRefs(memory, changePath, schedulerRunId, "reservation-1");
  const reservation: SchedulerRuntimeClaimReservation = {
    version: "1.0",
    id: "reservation-1",
    changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "reserved",
    schedulerRuntimeStateId: runtimeState.id,
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    reservationIntents: [{
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-1",
      plannedWorkerKey: "worker-1",
      nodeId: "node-1",
      unitId: "unit-1",
      waveIndex: 0,
      status: "reserved",
      plannedSlotDemand: 1,
      sourceScopes: ["src/a.ts"],
      blockedReasons: [],
    }],
    waves: [{
      waveIndex: 0,
      reservationIntentIds: ["reservation-intent-1"],
      reservedCount: 1,
      blockedCount: 0,
      plannedSlotDemand: 1,
      status: "reserved",
      blockedReasons: [],
    }],
    sourceLocks: [{
      scope: "src/a.ts",
      waveIndex: 0,
      reservationIntentIds: ["reservation-intent-1"],
      status: "reserved",
      blockedReasons: [],
    }],
    reservedCount: 1,
    blockedCount: 0,
    sourceLockCount: 1,
    sourceArtifactHashes: { spec: "hash-1" },
    artifactRefs: [reservationRefs.artifact],
    artifact: reservationRefs.artifact,
    markdownArtifact: reservationRefs.markdownArtifact,
    createdAt: now,
  };
  await writeSchedulerRuntimeClaimReservation(memory, changePath, reservation);

  if (options.withWorkerStart) {
    const startRefs = schedulerWorkerStartArtifactRefs(memory, changePath, schedulerRunId, "worker-start-1");
    const workerStart: SchedulerRuntimeWorkerStart = {
      version: "1.0",
      id: "worker-start-1",
      changeId,
      schedulerRunId,
      schedulerMode: "parallel-readiness-v1",
      status: "started",
      schedulerRuntimeStateId: runtimeState.id,
      schedulerReconcileSnapshotId: "snapshot-1",
      schedulerClaimReservationId: reservation.id,
      schedulerContractId: "contract-1",
      schedulerDispatchDryRunId: "dry-run-1",
      schedulerWorkerPlanId: "worker-plan-1",
      schedulerClaimReconcilePlanId: "claim-plan-1",
      schedulerLaunchPreflightId: "preflight-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-1",
      plannedWorkerKey: "worker-1",
      nodeId: "node-1",
      unitId: "unit-1",
      waveIndex: 0,
      stageId: "coder",
      stage: "coder",
      taskId: "unit-1",
      taskRunId: "task-run-1",
      workerLeaseId: "lease-1",
      taskRunRoleId: "scheduler-coder",
      agentRoleId: "coder-agent",
      worktreeId: "worktree-1",
      runId: "run-1",
      sourceArtifactHashes: { spec: "hash-1" },
      artifactRefs: [startRefs.artifact],
      artifact: startRefs.artifact,
      markdownArtifact: startRefs.markdownArtifact,
      createdAt: now,
      updatedAt: now,
    };
    await writeSchedulerRuntimeWorkerStart(memory, changePath, workerStart);
  }

  return { schedulerRun, reservation };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildMemory(root: string): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "repo",
    projectRoot: root,
    markerPath: join(root, ".agent-harness.json"),
    agentGuidePath: join(root, "AGENTS.md"),
    memoryRoot: root,
    docsRoot: join(root, "docs"),
    harnessRoot: join(root, "harness"),
    changesRoot: join(root, "harness", "changes"),
    evolutionRoot: join(root, "harness", "evolution"),
    templatesRoot: join(root, "harness", "templates"),
    scriptsRoot: join(root, "scripts"),
    runsRoot: join(root, ".agent-harness", "runs"),
    workbenchRoot: join(root, ".agent-harness", "workbench"),
    workbenchDbPath: join(root, ".agent-harness", "workbench", "workbench.sqlite"),
    agentsRoot: join(root, "agents"),
    commandsRoot: join(root, "commands"),
    agentCatalogPath: join(root, "agents", "catalog.json"),
    skillsRoot: join(root, "skills"),
    worktreeMetadataRoot: join(root, ".agent-harness", "worktrees"),
    worktreeIndexPath: join(root, ".agent-harness", "worktrees", "index.json"),
  };
}
