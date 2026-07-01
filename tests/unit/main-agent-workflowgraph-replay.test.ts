import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMainAgentWorkflowGraphReplaySummary,
  mainAgentLoopRunsRoot,
  mainAgentWorkflowGraphDecisionsPath,
  recordMainAgentWorkflowGraphObservationAndReplay,
} from "../../src/main-agent-orchestration/index.js";
import { ensureMainAgentLoopRun } from "../../src/main-agent-orchestration/loop-evidence.js";
import { recordMainAgentQueueDecisionEvidence } from "../../src/main-agent-orchestration/queue-step-evidence.js";
import type { ManagedProject, ResolvedMemory, TaskQueueItem, TaskQueueRun, WorkflowRun } from "../../src/types/index.js";
import { writeTaskQueueItem, writeTaskQueueRun } from "../../src/task-queue/manager.js";
import { writeWorkflowRun } from "../../src/workflow-run/manager.js";
import { schedulerControlledStepsDir } from "../../src/scheduler-runtime/paths.js";
import { appendSchedulerRuntimeEvent, writeSchedulerRuntimeState } from "../../src/scheduler-runtime/repository.js";
import type { SchedulerControlledStepEvidence, SchedulerRuntimeState } from "../../src/scheduler-runtime/types.js";
import { writeSchedulerRun } from "../../src/workflow-scheduler/repository.js";
import type { SchedulerRun } from "../../src/workflow-scheduler/types.js";

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("main-agent WorkflowGraph replay summary", () => {
  it("keeps canonical queue state ahead of stale historical queue decisions", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const loop = await ensureMainAgentLoopRun(mem, { changeId: "change-a", projectId: "project-a", entrypoint: "task-queue" });
    await recordMainAgentQueueDecisionEvidence(mem, loop.run, {
      queueStepIndex: 0,
      observation: {
        queueRunId: "queue-1",
        workflowRunId: "workflow-1",
        taskQueueProposalId: "proposal-1",
        workflowGraphPlanId: "graph-1",
        readinessManifestId: "ready-1",
        decompositionPlanId: "decomp-1",
        queueStatus: "running",
        workflowStatus: "running",
        totalCount: 1,
        completedCount: 0,
        failedCount: 0,
        blockedCount: 0,
        currentTaskId: "task-1",
        nextItemId: "item-1",
        nextTaskId: "task-1",
      },
      decision: {
        kind: "run-next-item",
        reason: "Historical queue decision.",
        selectedItemId: "item-1",
        taskId: "task-1",
        expectedQueueStatus: "running",
      },
    });
    await writeWorkflowRun(mem, workflowRun({ status: "completed", queueRunId: "queue-1", finishedAt: "2026-07-01T00:03:00.000Z" }));
    await writeTaskQueueRun(mem, taskQueueRun({ status: "completed", workflowRunId: "workflow-1", completedCount: 1, finishedAt: "2026-07-01T00:03:00.000Z" }));
    await writeTaskQueueItem(mem, taskQueueItem({ status: "completed", taskRunId: "taskrun-1", finishedAt: "2026-07-01T00:03:00.000Z" }));

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    expect(summary.currentState.queue.status).toBe("completed");
    expect(summary.latestHistoricalEvidence.queueDecision?.kind).toBe("run-next-item");
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
    expect(summary.executionStarted).toBe(false);
    expect(JSON.stringify(summary.nextObservation)).not.toContain("result.apply");
    expect(JSON.stringify(summary.nextObservation)).not.toContain("change.close");
  });

  it("treats created WorkflowRun without queue binding as a recovery gap instead of running", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    await writeWorkflowRun(mem, workflowRun({ status: "created", queueRunId: undefined }));

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    expect(summary.currentState.workflow.status).toBe("created");
    expect(summary.currentState.queue.id).toBeNull();
    expect(summary.currentState.kind).not.toBe("queue-running");
    expect(summary.gaps.length).toBeGreaterThan(0);
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });

  it("reports queue and workflow scope mismatch as a fail-closed gap", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    await writeWorkflowRun(mem, workflowRun({ status: "running", queueRunId: "queue-1" }));
    await writeTaskQueueRun(mem, taskQueueRun({ status: "running", workflowRunId: "other-workflow" }));

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    expect(summary.currentState.queue.scopeStatus).toBe("mismatch");
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "canonical-observation", status: "scope-mismatch" }),
    ]));
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });

  it("surfaces malformed historical jsonl instead of treating it as empty evidence", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const path = mainAgentWorkflowGraphDecisionsPath(mem, "change-a");
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, "not-json\n", "utf8");

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    expect(summary.evidenceHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "workflowgraph-decisions", status: "malformed" }),
    ]));
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "workflowgraph-decisions", status: "malformed" }),
    ]));
    expect(summary.latestHistoricalEvidence.workflowGraphDecision).toBeNull();
  });

  it("degrades unreadable historical evidence into replay gaps", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const loopRoot = mainAgentLoopRunsRoot(mem);
    await mkdir(loopRoot, { recursive: true });
    await mkdir(join(loopRoot, "loop-as-directory", "loop.json"), { recursive: true });

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    expect(summary.evidenceHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "loop-runs", status: "malformed" }),
    ]));
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "loop-runs", status: "malformed" }),
    ]));
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });

  it("keeps observation helper non-blocking when replay derivation can only produce gaps", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const result = await recordMainAgentWorkflowGraphObservationAndReplay(mem, project(), "change-a");

    expect(result.observationEvidence.authority).toBe("non-executing-main-agent-workflowgraph-decision-evidence");
    expect(result.replaySummary.authority).toBe("read-only-main-agent-workflowgraph-replay-summary");
    expect(result.replaySummary.executionStarted).toBe(false);
    expect(JSON.stringify(result.replaySummary.nextObservation)).not.toContain("actionType");
  });

  it("summarizes valid controlled Scheduler step evidence without exposing executable payloads", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeControlledStep(mem, changePath, controlledStep());

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.controlledScheduler.latestStep).toMatchObject({
      id: "controlled-step-1",
      schedulerRunId: "scheduler-run-1",
      continuationReadinessStatus: "terminal-handoff",
      resultStatus: "completed",
      recordedWithWarning: false,
    });
    expect(summary.evidenceHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-step", status: "available", count: 1 }),
    ]));
    expect(summary.refs.schedulerControlledStepIds).toEqual(["controlled-step-1"]);
    const serialized = JSON.stringify(summary.controlledScheduler);
    expect(serialized).not.toContain("targetScope");
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
  });

  it("classifies controlled Scheduler malformed, old schema, and scope mismatch evidence as gaps", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    const dir = schedulerControlledStepsDir(mem, changePath, "scheduler-run-1");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "malformed.json"), "not-json", "utf8");
    await writeFile(join(dir, "old.json"), JSON.stringify({ version: "0.9", id: "old-step" }), "utf8");
    await writeFile(join(dir, "scope.json"), JSON.stringify(controlledStep({
      id: "controlled-step-scope",
      targetScope: { changeId: "other-change", schedulerRunId: "scheduler-run-1" },
    })), "utf8");

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-step", status: "malformed" }),
      expect.objectContaining({ source: "controlled-scheduler-step", status: "old-schema" }),
      expect.objectContaining({ source: "controlled-scheduler-step", status: "scope-mismatch" }),
    ]));
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });

  it("treats controlled Scheduler warning evidence as degraded and unsafe", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeControlledStep(mem, changePath, controlledStep({ status: "recorded-with-warning" }));

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.controlledScheduler.latestStep?.recordedWithWarning).toBe(true);
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-step", status: "stale" }),
    ]));
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });

  it("treats unscoped controlled Scheduler evidence as unsafe when an expected SchedulerRun is known", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeUnscopedControlledStep(mem, changePath, controlledStep({
      schedulerRunId: undefined,
      targetScope: { changeId: "change-a" },
    }));

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-expected",
    });

    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-step", status: "scope-mismatch" }),
    ]));
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });

  it("summarizes latest same-Change SchedulerRun runtime state without executable payloads", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    const run = schedulerRun();
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerRun(mem, changePath, run);
    await writeSchedulerRuntimeState(mem, changePath, schedulerRuntimeState());
    await appendSchedulerRuntimeEvent(mem, changePath, run, "scheduler-runtime.initialized", {
      status: "initialized",
      summary: "Scheduler runtime initialized.",
      artifactRefs: ["scheduler-runtime-state.json"],
    });
    await writeControlledStep(mem, changePath, controlledStep());

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.controlledSchedulerStateBackflow).toMatchObject({
      authority: "read-only-main-agent-controlled-scheduler-state-backflow",
      executionStarted: false,
      schedulerRun: { id: "scheduler-run-1", status: "prepared" },
      runtimeState: { id: "scheduler-runtime-state-1", status: "initialized" },
      latestRuntimeEvent: {
        type: "scheduler-runtime.initialized",
        status: "initialized",
        summary: "Scheduler runtime initialized.",
      },
      controlledStep: expect.objectContaining({ id: "controlled-step-1" }),
    });
    expect(summary.evidenceHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-state", status: "available" }),
    ]));
    expect(summary.refs.schedulerRunIds).toEqual(["scheduler-run-1"]);
    const serialized = JSON.stringify(summary.controlledSchedulerStateBackflow);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("recommendedAction");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
  });

  it("reports missing Scheduler runtime state as a bounded backflow gap", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-replay-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerRun(mem, changePath, schedulerRun());

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.controlledSchedulerStateBackflow.schedulerRun?.id).toBe("scheduler-run-1");
    expect(summary.controlledSchedulerStateBackflow.runtimeState).toBeNull();
    expect(summary.evidenceHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-state", status: "missing" }),
    ]));
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-state", status: "missing" }),
    ]));
  });
});

async function writeControlledStep(
  mem: ResolvedMemory,
  changePath: string,
  step: SchedulerControlledStepEvidence,
): Promise<void> {
  const dir = schedulerControlledStepsDir(mem, changePath, step.schedulerRunId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${step.id}.json`), JSON.stringify(step), "utf8");
}

async function writeUnscopedControlledStep(
  mem: ResolvedMemory,
  changePath: string,
  step: SchedulerControlledStepEvidence,
): Promise<void> {
  const dir = schedulerControlledStepsDir(mem, changePath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${step.id}.json`), JSON.stringify(step), "utf8");
}

async function writeChangeMetadata(mem: ResolvedMemory, changePath: string, changeId: string): Promise<void> {
  const dir = join(mem.memoryRoot, changePath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "change.json"), JSON.stringify({ version: "1.0", id: changeId, title: changeId, state: "active" }), "utf8");
}

function controlledStep(overrides: Partial<SchedulerControlledStepEvidence> = {}): SchedulerControlledStepEvidence {
  const executedAction = "planning.scheduler.worker.reconcile-result";
  const base: SchedulerControlledStepEvidence = {
    version: "1.0",
    id: "controlled-step-1",
    changeId: "change-a",
    schedulerRunId: "scheduler-run-1",
    status: "recorded",
    executedActionType: executedAction,
    targetScope: { changeId: "change-a", schedulerRunId: "scheduler-run-1" },
    preStepEvidence: {
      goalLoopDecisionId: "goal-loop-decision-1",
      goalLoopIterationId: "goal-loop-iteration-1",
      goalLoopContinuationBriefId: "goal-loop-brief-1",
      goalLoopNextStepPacketId: "goal-loop-packet-1",
      goalLoopControllerPolicyId: "goal-loop-policy-1",
      goalLoopGateReadinessPreflightId: "goal-loop-preflight-1",
    },
    postStepEvidence: {
      continuationState: "terminal-handoff",
      executionStarted: false,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
    },
    postStepHandoff: {
      status: "terminal-handoff",
      stopReason: "Scheduler terminal handoff.",
      executedActionType: executedAction,
      needsReevaluation: false,
      executionStarted: false,
      loopAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
    },
    controlledLoopContinuationReadiness: {
      version: "1.0",
      authority: "scheduler-runtime-controlled-loop-continuation-readiness",
      status: "terminal-handoff",
      routePosture: "terminal-handoff",
      executedActionType: executedAction,
      resultKind: "scheduler-run-completion",
      resultId: "scheduler-run-completion-1",
      resultStatus: "completed",
      reason: "Scheduler reached terminal handoff.",
      boundary: "Existing result gate remains human-gated.",
      readinessEvidencePrepared: true,
      needsReevaluation: false,
      humanGateRequired: true,
      humanConfirmationStillRequired: true,
      evidenceRefs: ["scheduler-evidence-ref"],
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    },
    executionStarted: true,
    stoppedAfterOneSchedulerTransition: true,
    humanConfirmationStillRequired: true,
    sourceMutated: false,
    forbiddenAuthority: {
      loopAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      fullParallelExecutorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    },
    artifactRefs: ["scheduler-controlled-step-ref"],
    artifact: "scheduler-controlled-step.json",
    markdownArtifact: "scheduler-controlled-step.md",
    createdAt: "2026-07-01T00:02:00.000Z",
    updatedAt: "2026-07-01T00:02:00.000Z",
  };
  return { ...base, ...overrides };
}

function schedulerRun(overrides: Partial<SchedulerRun> = {}): SchedulerRun {
  return {
    version: "1.0",
    id: "scheduler-run-1",
    changeId: "change-a",
    status: "prepared",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId: "scheduler-contract-1",
    schedulerDispatchDryRunId: "scheduler-dry-run-1",
    schedulerWorkerPlanId: "scheduler-worker-plan-1",
    schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    decompositionPlanId: "decomp-1",
    readinessManifestId: "ready-1",
    claimIntentCount: 2,
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    blockedCount: 0,
    humanConfirmed: true,
    futureToolPolicyGateRequired: true,
    futureHumanGateRequired: true,
    sourceArtifactHashes: {},
    artifactRefs: ["scheduler-run-ref"],
    artifact: "scheduler-runs/scheduler-run-1.json",
    markdownArtifact: "scheduler-runs/scheduler-run-1.md",
    journalArtifact: "scheduler-runs/scheduler-run-1.jsonl",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:01:00.000Z",
    ...overrides,
  };
}

function schedulerRuntimeState(overrides: Partial<SchedulerRuntimeState> = {}): SchedulerRuntimeState {
  return {
    version: "1.0",
    id: "scheduler-runtime-state-1",
    changeId: "change-a",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    status: "initialized",
    schedulerContractId: "scheduler-contract-1",
    schedulerDispatchDryRunId: "scheduler-dry-run-1",
    schedulerWorkerPlanId: "scheduler-worker-plan-1",
    schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    decompositionPlanId: "decomp-1",
    readinessManifestId: "ready-1",
    claimIntents: [],
    waves: [],
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    blockedCount: 0,
    sourceArtifactHashes: {},
    artifactRefs: ["scheduler-runtime-state-ref"],
    artifact: "scheduler-runtime/scheduler-runtime-state.json",
    eventsArtifact: "scheduler-runtime/events.jsonl",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:01:00.000Z",
    ...overrides,
  };
}

function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  const base: WorkflowRun = {
    version: "1.0",
    id: "workflow-1",
    changeId: "change-a",
    status: "running",
    source: "taskqueue-proposal",
    taskQueueProposalId: "proposal-1",
    workflowGraphPlanId: "graph-1",
    readinessManifestId: "ready-1",
    decompositionPlanId: "decomp-1",
    queueRunId: "queue-1",
    currentTaskId: "task-1",
    items: [{ taskId: "task-1", status: "running", taskRunId: "taskrun-1", order: 1 }],
    recoveryKey: {
      version: "1.0",
      changeId: "change-a",
      decompositionPlanId: "decomp-1",
      readinessManifestId: "ready-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      acceptedArtifactHashes: {},
      proposalHash: "proposal-hash",
      readinessHash: "readiness-hash",
      workflowGraphPlanHash: "graph-hash",
      sourceHash: "source-hash",
      policyHash: "policy-hash",
      capabilityHash: "capability-hash",
      createdAt: "2026-07-01T00:00:00.000Z",
    },
    artifactRefs: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:01:00.000Z",
    startedAt: "2026-07-01T00:01:00.000Z",
    finishedAt: null,
  };
  const run = { ...base, ...overrides };
  if (Object.prototype.hasOwnProperty.call(overrides, "queueRunId") && overrides.queueRunId === undefined) delete run.queueRunId;
  return run;
}

function taskQueueRun(overrides: Partial<TaskQueueRun> = {}): TaskQueueRun {
  return {
    version: "1.0",
    id: "queue-1",
    projectId: "project-a",
    changeId: "change-a",
    status: "running",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:01:00.000Z",
    startedAt: "2026-07-01T00:01:00.000Z",
    finishedAt: null,
    currentTaskId: "task-1",
    workflowRunId: "workflow-1",
    taskQueueProposalId: "proposal-1",
    workflowGraphPlanId: "graph-1",
    decompositionPlanId: "decomp-1",
    readinessManifestId: "ready-1",
    totalCount: 1,
    completedCount: 0,
    ...overrides,
  };
}

function taskQueueItem(overrides: Partial<TaskQueueItem> = {}): TaskQueueItem {
  return {
    version: "1.0",
    id: "item-1",
    projectId: "project-a",
    changeId: "change-a",
    queueRunId: "queue-1",
    taskId: "task-1",
    order: 1,
    status: "running",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:01:00.000Z",
    startedAt: "2026-07-01T00:01:00.000Z",
    finishedAt: null,
    taskRunId: "taskrun-1",
    workflowRunId: "workflow-1",
    taskQueueProposalId: "proposal-1",
    workflowGraphPlanId: "graph-1",
    decompositionPlanId: "decomp-1",
    readinessManifestId: "ready-1",
    ...overrides,
  };
}

function project(): ManagedProject {
  return {
    id: "project-a",
    name: "project-a",
    path: root ?? "E:/tmp/project-a",
    addedAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-07-01T00:00:00.000Z",
  };
}

function memory(memoryRoot: string): ResolvedMemory {
  return {
    mode: "external-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project-a",
    projectRoot: memoryRoot,
    markerPath: join(memoryRoot, ".agent-harness/project.json"),
    agentGuidePath: join(memoryRoot, "AGENTS.md"),
    memoryRoot,
    docsRoot: join(memoryRoot, "docs"),
    harnessRoot: join(memoryRoot, "harness"),
    changesRoot: join(memoryRoot, "harness/changes"),
    evolutionRoot: join(memoryRoot, "harness/evolution"),
    templatesRoot: join(memoryRoot, "templates"),
    scriptsRoot: join(memoryRoot, "scripts"),
    runsRoot: join(memoryRoot, "runs"),
    workbenchRoot: join(memoryRoot, "workbench"),
    workbenchDbPath: join(memoryRoot, "workbench/workbench.sqlite"),
    agentsRoot: join(memoryRoot, "agents"),
    commandsRoot: join(memoryRoot, "commands"),
    agentCatalogPath: join(memoryRoot, "agents/catalog.json"),
    skillsRoot: join(memoryRoot, "skills"),
    worktreeMetadataRoot: join(memoryRoot, "worktrees"),
    worktreeIndexPath: join(memoryRoot, "worktrees/index.json"),
  };
}
