import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMainAgentWorkflowGraphRecoverySummary,
  buildMainAgentWorkflowGraphReplaySummary,
  recordMainAgentWorkflowGraphObservationAndReplay,
} from "../../src/main-agent-orchestration/index.js";
import { writeTaskQueueItem, writeTaskQueueRun } from "../../src/task-queue/manager.js";
import { writeTaskRun } from "../../src/task-run/manager.js";
import type { AuditResult, ManagedProject, ResolvedMemory, RunMetadata, TaskQueueItem, TaskQueueRun, TaskRun, ValidationResult, WorkflowRun } from "../../src/types/index.js";
import { writeWorkflowRun } from "../../src/workflow-run/manager.js";

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("main-agent WorkflowGraph recovery summary", () => {
  it("labels a created WorkflowRun without queue binding as awaiting queue binding", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-recovery-"));
    const mem = memory(root);
    await writeWorkflowRun(mem, workflowRun({ status: "created", queueRunId: undefined, startedAt: null }));
    const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    const summary = await buildMainAgentWorkflowGraphRecoverySummary(mem, project(), "change-a", replaySummary);

    expect(summary.authority).toBe("read-only-main-agent-workflowgraph-recovery-summary");
    expect(summary.executionStarted).toBe(false);
    expect(summary.kind).toBe("awaiting-queue-binding");
    expect(summary.replay.currentStateKind).toBe(replaySummary.currentState.kind);
    expect(summary.replay.nextObservationKind).toBe(replaySummary.nextObservation.kind);
    expect(JSON.stringify(summary)).not.toContain("actionType");
    expect(JSON.stringify(summary)).not.toContain("recommendedAction");
  });

  it("keeps a paused fresh-bound queue observable and records recovery key gaps without writing blocked state", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-recovery-"));
    const mem = memory(root);
    await writeWorkflowRun(mem, workflowRun({ status: "paused", queueRunId: "queue-1" }));
    await writeTaskQueueRun(mem, taskQueueRun({ status: "paused", workflowRunId: "workflow-1" }));
    await writeTaskQueueItem(mem, taskQueueItem({ status: "queued", taskRunId: undefined }));
    const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    const summary = await buildMainAgentWorkflowGraphRecoverySummary(mem, project(), "change-a", replaySummary);

    expect(summary.kind).toBe("queue-observable");
    expect(summary.workflow.recoveryKeyFreshness.status).toBe("unavailable");
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "recovery-key", status: "unavailable" }),
    ]));
    expect(summary.workflow.status).toBe("paused");
  });

  it("fails closed on WorkflowRun and TaskQueue scope mismatch", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-recovery-"));
    const mem = memory(root);
    await writeWorkflowRun(mem, workflowRun({ status: "running", queueRunId: "queue-1" }));
    await writeTaskQueueRun(mem, taskQueueRun({ status: "running", workflowRunId: "other-workflow" }));
    const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    const summary = await buildMainAgentWorkflowGraphRecoverySummary(mem, project(), "change-a", replaySummary);

    expect(summary.kind).toBe("scope-mismatch");
    expect(summary.queue.scopeStatus).toBe("scope-mismatch");
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "task-queue", status: "scope-mismatch" }),
    ]));
  });

  it("derives stage-resume evidence only from the current queue-bound TaskRun", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-recovery-"));
    const mem = memory(root);
    await writeWorkflowRun(mem, workflowRun({ status: "running", queueRunId: "queue-1" }));
    await writeTaskQueueRun(mem, taskQueueRun({ status: "running", workflowRunId: "workflow-1" }));
    await writeTaskQueueItem(mem, taskQueueItem({ status: "running", taskRunId: "taskrun-1" }));
    await writeTaskRun(mem, taskRun({ id: "taskrun-1", status: "evidence-ready" }));
    await writeTaskRun(mem, taskRun({ id: "taskrun-old", status: "completed" }));
    await writeCoderRun(mem, "run-coder-1", "taskrun-1", "wt-1");
    await writeCoderRun(mem, "run-old", "taskrun-old", "wt-old");
    await writeValidationResult(mem, "validation-old", "run-old", "wt-old", "passed");
    await writeAuditResult(mem, "audit-old", "run-old", "wt-old", "approved", "validation-old");
    const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    const summary = await buildMainAgentWorkflowGraphRecoverySummary(mem, project(), "change-a", replaySummary);

    expect(summary.kind).toBe("stage-resume-observable");
    expect(summary.stages).toHaveLength(1);
    expect(summary.stages[0]).toMatchObject({
      taskRunId: "taskrun-1",
      queueItemId: "item-1",
      verdictKind: "continue-validation",
    });
    expect(summary.refs.taskRunIds).toContain("taskrun-1");
    expect(summary.refs.taskRunIds).not.toContain("taskrun-old");
    expect(summary.refs.runIds).toContain("run-coder-1");
  });

  it("labels completed queue evidence as awaiting the existing result gate without apply or close payload", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-recovery-"));
    const mem = memory(root);
    await writeWorkflowRun(mem, workflowRun({ status: "completed", queueRunId: "queue-1", finishedAt: "2026-07-01T00:03:00.000Z" }));
    await writeTaskQueueRun(mem, taskQueueRun({ status: "completed", workflowRunId: "workflow-1", completedCount: 1, finishedAt: "2026-07-01T00:03:00.000Z" }));
    await writeTaskQueueItem(mem, taskQueueItem({ status: "completed", taskRunId: "taskrun-1", finishedAt: "2026-07-01T00:03:00.000Z" }));
    await writeTaskRun(mem, taskRun({ id: "taskrun-1", status: "completed" }));
    await writeCoderRun(mem, "run-coder-1", "taskrun-1", "wt-1");
    await writeValidationResult(mem, "validation-1", "run-coder-1", "wt-1", "passed");
    await writeAuditResult(mem, "audit-1", "run-coder-1", "wt-1", "approved", "validation-1");
    const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a");

    const summary = await buildMainAgentWorkflowGraphRecoverySummary(mem, project(), "change-a", replaySummary);

    expect(summary.kind).toBe("completed-await-result-gate");
    expect(summary.refs.validationIds).toContain("validation-1");
    expect(summary.refs.auditIds).toContain("audit-1");
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("scheduler");
    expect(serialized).not.toContain("IntegrationCheck");
  });

  it("returns recoverySummary from the observation/replay helper", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflowgraph-recovery-"));
    const mem = memory(root);

    const result = await recordMainAgentWorkflowGraphObservationAndReplay(mem, project(), "change-a");

    expect(result.observationEvidence.authority).toBe("non-executing-main-agent-workflowgraph-decision-evidence");
    expect(result.replaySummary.authority).toBe("read-only-main-agent-workflowgraph-replay-summary");
    expect(result.recoverySummary.authority).toBe("read-only-main-agent-workflowgraph-recovery-summary");
    expect(result.recoverySummary.executionStarted).toBe(false);
    expect(result.schedulerCandidateAssessment.authority).toBe("non-executing-main-agent-scheduler-candidate-assessment");
    expect(result.schedulerCandidateAssessment.executionStarted).toBe(false);
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

function taskRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    version: "1.0",
    id: "taskrun-1",
    projectId: "project-a",
    changeId: "change-a",
    taskId: "task-1",
    roleId: "coder",
    attempt: 1,
    status: "running",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:01:00.000Z",
    startedAt: "2026-07-01T00:01:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

async function writeCoderRun(memoryRoot: ResolvedMemory, runId: string, taskRunId: string, worktreeId: string): Promise<void> {
  const dir = join(memoryRoot.runsRoot, runId);
  await mkdir(dir, { recursive: true });
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: "change-a",
    projectPath: root ?? "E:/tmp/project-a",
    runtime: "coder-codex",
    executionMode: "worktree",
    command: ["codex"],
    status: "completed",
    exitCode: 0,
    signal: null,
    startedAt: "2026-07-01T00:01:00.000Z",
    finishedAt: "2026-07-01T00:02:00.000Z",
    artifacts: {
      base: "memory-root",
      directory: dir,
      context: join(dir, "context.json"),
      events: join(dir, "events.jsonl"),
      stdout: join(dir, "stdout.txt"),
      stderr: join(dir, "stderr.txt"),
    },
    worktree: {
      worktreeId,
      branchName: `codex/${worktreeId}`,
      baseRef: "main",
      baseCommit: "0000000",
      checkoutPath: join(memoryRoot.memoryRoot, "worktrees", worktreeId),
      metadataPath: join(memoryRoot.memoryRoot, "worktrees", `${worktreeId}.json`),
    },
    taskIds: ["task-1"],
    taskRunId,
  };
  await writeFile(join(dir, "run.json"), JSON.stringify(run, null, 2), "utf8");
}

async function writeValidationResult(memoryRoot: ResolvedMemory, validationId: string, _runId: string, worktreeId: string, status: ValidationResult["status"]): Promise<void> {
  const dir = join(memoryRoot.runsRoot, validationId);
  await mkdir(dir, { recursive: true });
  const validation: ValidationResult = {
    version: "1.0",
    id: validationId,
    runId: validationId,
    changeId: "change-a",
    profile: "default",
    status,
    executionMode: "worktree",
    worktreeId,
    startedAt: "2026-07-01T00:02:00.000Z",
    finishedAt: "2026-07-01T00:02:30.000Z",
    commands: [],
  };
  await writeFile(join(dir, "validation.json"), JSON.stringify(validation, null, 2), "utf8");
}

async function writeAuditResult(memoryRoot: ResolvedMemory, auditId: string, _runId: string, worktreeId: string, status: AuditResult["status"], validationId: string): Promise<void> {
  const dir = join(memoryRoot.runsRoot, auditId);
  await mkdir(dir, { recursive: true });
  const audit: AuditResult = {
    version: "1.0",
    id: auditId,
    runId: auditId,
    changeId: "change-a",
    status,
    worktreeId,
    validationId,
    startedAt: "2026-07-01T00:03:00.000Z",
    finishedAt: "2026-07-01T00:03:30.000Z",
    findings: [],
    artifacts: {
      audit: join(dir, "audit.json"),
      auditMarkdown: join(dir, "audit.md"),
      lastMessage: join(dir, "last-message.txt"),
    },
  };
  await writeFile(join(dir, "audit.json"), JSON.stringify(audit, null, 2), "utf8");
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
