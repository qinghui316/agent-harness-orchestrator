import { mkdtemp, rm, readFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mainAgentWorkflowGraphDecisionsPath,
  readMainAgentWorkflowGraphDecisionEvidence,
  recordMainAgentWorkflowGraphObservationAndReplay,
  recordMainAgentWorkflowGraphObservation,
  type MainAgentWorkflowGraphObservation,
} from "../../src/main-agent-orchestration/index.js";
import { decideMainAgentWorkflowGraph } from "../../src/main-agent-orchestration/workflowgraph-observation.js";
import type { ManagedProject, ResolvedMemory } from "../../src/types/index.js";

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("main-agent WorkflowGraph observation evidence", () => {
  it("keeps observation and replay current-state classifications aligned for representative states", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-observation-parity-"));
    const mem = memory(root);

    const observationEvidence = await recordMainAgentWorkflowGraphObservation(mem, project(), "change-a");
    const replayResult = await recordMainAgentWorkflowGraphObservationAndReplay(mem, project(), "change-a");

    expect(replayResult.observationEvidence.decision.kind).toBe(observationEvidence.decision.kind);
    expect(replayResult.replaySummary.currentState.kind).toBe(replayResult.observationEvidence.decision.kind);
    expect(replayResult.replaySummary.currentState.source).toBe("canonical-managers");
    expect(replayResult.replaySummary.executionStarted).toBe(false);
  });

  it("decides graph stage without selecting queue items", () => {
    expect(decideMainAgentWorkflowGraph(observation({
      stage: { decompositionPlanId: null },
    })).kind).toBe("needs-decomposition");

    expect(decideMainAgentWorkflowGraph(observation({
      stage: {
        decompositionPlanId: "decomp-1",
        decompositionPlanStatus: "confirmed",
        readinessManifestId: null,
      },
    })).kind).toBe("needs-readiness");

    expect(decideMainAgentWorkflowGraph(observation({
      stage: readyCompiledStage(),
    }))).toMatchObject({
      kind: "awaiting-queue-start-gate",
    });

    expect(decideMainAgentWorkflowGraph(observation({
      stage: readyCompiledStage(),
      queue: { queueRunId: "queue-1", scopeStatus: "matched", queueStatus: "running", workflowRunId: "workflow-1", workflowStatus: "running" },
    })).kind).toBe("queue-running");

    expect(decideMainAgentWorkflowGraph(observation({
      stage: readyCompiledStage(),
      queue: { queueRunId: null, scopeStatus: "unbound", queueStatus: null, workflowRunId: "workflow-1", workflowStatus: "created" },
    }))).toMatchObject({
      kind: "wait",
      reason: "WorkflowRun is created and waiting for queue binding or recovery; it is not running and should not restart the queue gate.",
    });

    expect(decideMainAgentWorkflowGraph(observation({
      stage: readyCompiledStage(),
      queue: { queueRunId: null, scopeStatus: "unbound", queueStatus: null, workflowRunId: "workflow-1", workflowStatus: "created" },
      recovery: { status: "stale", reasons: ["recovery key drift"] },
    }))).toMatchObject({
      kind: "stale",
      reason: "recovery key drift",
    });

    expect(decideMainAgentWorkflowGraph(observation({
      stage: readyCompiledStage(),
      queue: { queueRunId: "queue-1", scopeStatus: "mismatch", queueStatus: "running", workflowRunId: "workflow-1", workflowStatus: "running" },
    }))).toMatchObject({
      kind: "stale",
      reason: "TaskQueue and WorkflowRun scope mismatch.",
    });

    expect(decideMainAgentWorkflowGraph(observation({
      stage: readyCompiledStage(),
      freshness: { status: "stale", reasons: ["hash drift"] },
    }))).toMatchObject({
      kind: "stale",
      reason: "hash drift",
    });
  });

  it("writes bounded non-executing evidence and reads malformed files fail-closed", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-observation-"));
    const evidence = await recordMainAgentWorkflowGraphObservation(memory(root), project(), "change-a");
    expect(evidence).toMatchObject({
      authority: "non-executing-main-agent-workflowgraph-decision-evidence",
      executionStarted: false,
      changeId: "change-a",
    });
    expect(evidence.decision.kind).toBe("needs-decomposition");

    const path = mainAgentWorkflowGraphDecisionsPath(memory(root), "change-a");
    const raw = await readFile(path, "utf8");
    expect(raw).toContain("workflowgraph-decisions.jsonl");
    expect(raw).not.toContain("selectedItemId");
    expect(raw).not.toContain("\"taskId\":");
    await expect(readMainAgentWorkflowGraphDecisionEvidence(memory(root), "change-a")).resolves.toHaveLength(1);

    await appendFile(path, "not-json\n", "utf8");
    await expect(readMainAgentWorkflowGraphDecisionEvidence(memory(root), "change-a")).resolves.toEqual([]);
  });

  it("records graph observation before building a non-executing replay summary", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-observation-replay-"));
    const result = await recordMainAgentWorkflowGraphObservationAndReplay(memory(root), project(), "change-a");

    expect(result.observationEvidence).toMatchObject({
      authority: "non-executing-main-agent-workflowgraph-decision-evidence",
      executionStarted: false,
      changeId: "change-a",
    });
    expect(result.replaySummary).toMatchObject({
      authority: "read-only-main-agent-workflowgraph-replay-summary",
      executionStarted: false,
      changeId: "change-a",
    });
    expect(result.replaySummary.latestHistoricalEvidence.workflowGraphDecision?.id)
      .toBe(result.observationEvidence.id);

    const nextObservation = JSON.stringify(result.replaySummary.nextObservation);
    expect(nextObservation).not.toContain("actionType");
    expect(nextObservation).not.toContain("confirmationQueue");
    expect(nextObservation).not.toContain("recommendedAction");
    expect(nextObservation).not.toContain("result.apply");
    expect(nextObservation).not.toContain("change.close");
  });
});

function observation(overrides: Partial<MainAgentWorkflowGraphObservation> = {}): MainAgentWorkflowGraphObservation {
  return {
    version: "1.0",
    changeId: "change-a",
    projectId: "project-a",
    observedAt: "2026-06-30T00:00:00.000Z",
    stage: {
      decompositionPlanId: "decomp-1",
      decompositionPlanStatus: "confirmed",
      readinessManifestId: "ready-1",
      readinessStatus: "ready-for-sequential-taskqueue-proposal",
      taskQueueProposalId: "proposal-1",
      taskQueueProposalStatus: "confirmed",
      workflowGraphPlanId: "graph-1",
      workflowGraphPlanStatus: "compiled",
      ...(overrides.stage ?? {}),
    },
    queue: {
      queueRunId: null,
      workflowRunId: null,
      scopeStatus: "unavailable",
      queueStatus: null,
      workflowStatus: null,
      totalCount: null,
      completedCount: null,
      blockedCount: null,
      failedCount: null,
      ...(overrides.queue ?? {}),
    },
    freshness: overrides.freshness ?? { status: "fresh", reasons: [] },
    recovery: overrides.recovery ?? { status: "unavailable", reasons: ["No WorkflowRun exists."] },
    artifactRefs: overrides.artifactRefs ?? [],
    refs: overrides.refs ?? {
      mainAgentLoopRunIds: [],
      workflowRunIds: [],
      taskQueueRunIds: [],
    },
  };
}

function readyCompiledStage(): MainAgentWorkflowGraphObservation["stage"] {
  return {
    decompositionPlanId: "decomp-1",
    decompositionPlanStatus: "confirmed",
    readinessManifestId: "ready-1",
    readinessStatus: "ready-for-sequential-taskqueue-proposal",
    taskQueueProposalId: "proposal-1",
    taskQueueProposalStatus: "confirmed",
    workflowGraphPlanId: "graph-1",
    workflowGraphPlanStatus: "compiled",
  };
}

function project(): ManagedProject {
  return {
    id: "project-a",
    name: "project-a",
    path: root ?? "E:/tmp/project-a",
    addedAt: "2026-06-30T00:00:00.000Z",
    lastSeenAt: "2026-06-30T00:00:00.000Z",
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
