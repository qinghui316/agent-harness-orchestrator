import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
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
});

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
