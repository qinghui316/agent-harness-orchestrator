import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendWorkflowRunEvent, readWorkflowRun, readWorkflowRunEvents, summarizeWorkflowRun, writeWorkflowRun } from "../../src/workflow-run/manager.js";
import type { DefaultCodeChangeWorkflowRun, ResolvedMemory, TaskQueueWorkflowRun } from "../../src/types/index.js";

describe("WorkflowRun default code-change source", () => {
  let root: string;
  let memory: ResolvedMemory;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflow-run-"));
    memory = buildMemory(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads, writes, summarizes, and journals default-code-change WorkflowRuns", async () => {
    const run = defaultRun("change-default");

    await writeWorkflowRun(memory, run);
    await appendWorkflowRunEvent(memory, run, "node.started", { data: { nodeId: "coder" } });

    await expect(readWorkflowRun(memory, "change-default", run.id)).resolves.toMatchObject({
      source: "default-code-change-workflow",
      templateId: "default-code-change-workflow",
      nodes: expect.arrayContaining([expect.objectContaining({ nodeId: "coder" })]),
    });
    await expect(readWorkflowRunEvents(memory, "change-default", run.id)).resolves.toEqual([
      expect.objectContaining({ type: "node.started", workflowRunId: run.id, changeId: "change-default" }),
    ]);
    expect(summarizeWorkflowRun(run)).toMatchObject({
      source: "default-code-change-workflow",
      currentNodeId: "coder",
      totalCount: 3,
      completedCount: 2,
    });
  });

  it("keeps old taskqueue-proposal WorkflowRuns compatible", async () => {
    const run = taskQueueRun("change-taskqueue");

    await writeWorkflowRun(memory, run);

    await expect(readWorkflowRun(memory, "change-taskqueue", run.id)).resolves.toMatchObject({
      source: "taskqueue-proposal",
      taskQueueProposalId: "proposal-1",
      items: [expect.objectContaining({ taskId: "T-001" })],
    });
    expect(summarizeWorkflowRun(run)).toMatchObject({
      source: "taskqueue-proposal",
      currentTaskId: "T-001",
      totalCount: 1,
      completedCount: 0,
    });
  });
});

function defaultRun(changeId: string): DefaultCodeChangeWorkflowRun {
  return {
    version: "1.0",
    id: "workflow-default-1",
    changeId,
    status: "running",
    source: "default-code-change-workflow",
    templateId: "default-code-change-workflow",
    currentNodeId: "coder",
    nodes: [
      { nodeId: "coder", status: "completed", roleId: "coder-agent", attempt: 1, runId: "run-1", worktreeId: "wt-1", artifactRefs: ["runs/run-1"], updatedAt: "2026-07-07T00:00:00.000Z" },
      { nodeId: "validation", status: "queued", roleId: "validator", attempt: 1, artifactRefs: [], updatedAt: "2026-07-07T00:00:00.000Z" },
      { nodeId: "audit", status: "queued", roleId: "auditor-agent", attempt: 1, artifactRefs: [], updatedAt: "2026-07-07T00:00:00.000Z" },
      { nodeId: "rework-coder", status: "skipped", roleId: "rework-coder", attempt: 2, artifactRefs: [], updatedAt: "2026-07-07T00:00:00.000Z" },
    ],
    maxReworkAttempts: 1,
    reworkAttempts: 0,
    recoveryKey: {
      version: "1.0",
      changeId,
      templateId: "default-code-change-workflow",
      createdAt: "2026-07-07T00:00:00.000Z",
    },
    artifactRefs: ["runs/run-1"],
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    startedAt: "2026-07-07T00:00:00.000Z",
    finishedAt: null,
  };
}

function taskQueueRun(changeId: string): TaskQueueWorkflowRun {
  return {
    version: "1.0",
    id: "workflow-taskqueue-1",
    changeId,
    status: "created",
    source: "taskqueue-proposal",
    taskQueueProposalId: "proposal-1",
    workflowGraphPlanId: "graph-1",
    readinessManifestId: "ready-1",
    decompositionPlanId: "decomp-1",
    currentTaskId: "T-001",
    items: [{ taskId: "T-001", status: "queued", order: 1, updatedAt: "2026-07-07T00:00:00.000Z" }],
    recoveryKey: {
      version: "1.0",
      changeId,
      decompositionPlanId: "decomp-1",
      readinessManifestId: "ready-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      acceptedArtifactHashes: {},
      proposalHash: "proposal",
      readinessHash: "ready",
      workflowGraphPlanHash: "graph",
      sourceHash: "source",
      policyHash: "policy",
      capabilityHash: "capability",
      createdAt: "2026-07-07T00:00:00.000Z",
    },
    artifactRefs: ["workflow/graph-1.json"],
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
  };
}

function buildMemory(root: string): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project",
    projectRoot: root,
    markerPath: join(root, ".agent-harness", "project.json"),
    agentGuidePath: join(root, "AGENTS.md"),
    memoryRoot: join(root, ".agent-harness"),
    docsRoot: join(root, ".agent-harness", "docs"),
    harnessRoot: join(root, ".agent-harness", "harness"),
    changesRoot: join(root, ".agent-harness", "harness", "changes"),
    evolutionRoot: join(root, ".agent-harness", "harness", "evolution"),
    templatesRoot: join(root, ".agent-harness", "templates"),
    scriptsRoot: join(root, ".agent-harness", "scripts"),
    runsRoot: join(root, ".agent-harness", "runs"),
    workbenchRoot: join(root, ".agent-harness", "workbench"),
    workbenchDbPath: join(root, ".agent-harness", "workbench", "workbench.sqlite"),
    agentsRoot: join(root, ".agent-harness", "agents"),
    commandsRoot: join(root, ".agent-harness", "commands"),
    agentCatalogPath: join(root, ".agent-harness", "agents", "catalog.json"),
    skillsRoot: join(root, ".agent-harness", "skills"),
    worktreeMetadataRoot: join(root, ".agent-harness", "worktrees"),
    worktreeIndexPath: join(root, ".agent-harness", "worktrees", "index.json"),
  };
}
