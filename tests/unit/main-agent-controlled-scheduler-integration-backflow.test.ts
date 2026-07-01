import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMainAgentControlledSchedulerIntegrationBackflow,
  buildMainAgentWorkflowGraphReplaySummary,
} from "../../src/main-agent-orchestration/index.js";
import { writeCheckArtifacts } from "../../src/integration-check/repository.js";
import { integrationCheckRoot } from "../../src/integration-check/paths.js";
import type { IntegrationCheckRecord } from "../../src/integration-check/types.js";
import {
  writeSchedulerIntegrationCandidate,
  writeSchedulerIntegrationCheckHandoff,
  writeSchedulerIntegrationOutcome,
  writeSchedulerRunBlockedCloseout,
  writeSchedulerRunCompletion,
} from "../../src/scheduler-runtime/repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerIntegrationOutcome,
  SchedulerRunBlockedCloseout,
  SchedulerRunCompletion,
} from "../../src/scheduler-runtime/types.js";
import type { ManagedProject, ResolvedMemory } from "../../src/types/index.js";

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("main-agent controlled Scheduler IntegrationCheck backflow", () => {
  it("summarizes candidate, handoff, exact IntegrationCheck, outcome, and completion without executable payloads", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-integration-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerIntegrationCandidate(mem, changePath, candidate());
    await writeSchedulerIntegrationCheckHandoff(mem, changePath, handoff());
    await writeIntegrationCheck(mem, integrationCheck({ status: "applied", appliedAt: "2026-07-01T00:10:00.000Z" }));
    await writeSchedulerIntegrationOutcome(mem, changePath, outcome({ status: "applied", integrationCheckStatus: "applied", appliedAt: "2026-07-01T00:10:00.000Z" }));
    await writeSchedulerRunCompletion(mem, changePath, completion({ status: "completed-applied", outcomeStatus: "applied", integrationCheckStatus: "applied" }));

    const summary = await buildMainAgentControlledSchedulerIntegrationBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary).toMatchObject({
      authority: "read-only-main-agent-controlled-scheduler-integration-backflow",
      executionStarted: false,
      health: { source: "controlled-scheduler-integration", status: "available" },
      candidate: { id: "candidate-1", status: "ready" },
      handoff: { id: "handoff-1", integrationCheckId: "integration-check-1" },
      integrationCheck: { id: "integration-check-1", status: "applied" },
      outcome: { id: "outcome-1", status: "applied" },
      completion: { id: "completion-1", status: "completed-applied" },
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("planning.scheduler.");
  });

  it("treats missing exact IntegrationCheck after handoff as unsafe stale gap", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-integration-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerIntegrationCandidate(mem, changePath, candidate());
    await writeSchedulerIntegrationCheckHandoff(mem, changePath, handoff());

    const summary = await buildMainAgentControlledSchedulerIntegrationBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.integrationCheck).toBeNull();
    expect(summary.health.status).toBe("stale");
    expect(summary.health.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "stale" }),
    ]));
  });

  it("surfaces unsafe IntegrationCheck gap through replay policy", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-integration-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerIntegrationCandidate(mem, changePath, candidate());
    await writeSchedulerIntegrationCheckHandoff(mem, changePath, handoff());

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.controlledSchedulerStateBackflow.integrationCheckBackflow.health.status).toBe("stale");
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-integration", status: "stale" }),
    ]));
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });

  it("treats outcome scope mismatch as unsafe", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-integration-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerIntegrationCandidate(mem, changePath, candidate());
    await writeSchedulerIntegrationCheckHandoff(mem, changePath, handoff());
    await writeIntegrationCheck(mem, integrationCheck());
    await writeSchedulerIntegrationOutcome(mem, changePath, outcome({ resultTargetWorktreeIds: ["worktree-1"] }));

    const summary = await buildMainAgentControlledSchedulerIntegrationBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.health.status).toBe("scope-mismatch");
    expect(summary.health.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "scope-mismatch" }),
    ]));
  });

  it("marks blocked closeout conflicting with handoff as unsafe", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-integration-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerIntegrationCandidate(mem, changePath, candidate());
    await writeSchedulerIntegrationCheckHandoff(mem, changePath, handoff());
    await writeIntegrationCheck(mem, integrationCheck());
    await writeSchedulerRunBlockedCloseout(mem, changePath, blockedCloseout());

    const summary = await buildMainAgentControlledSchedulerIntegrationBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.blockedCloseout?.id).toBe("blocked-closeout-1");
    expect(summary.health.status).toBe("scope-mismatch");
    expect(summary.health.reasons.join("\n")).toContain("conflicts with IntegrationCheck handoff/outcome/completion");
  });

  it("keeps passed IntegrationCheck as waiting posture, not completion or apply/discard advice", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-integration-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeSchedulerIntegrationCandidate(mem, changePath, candidate());
    await writeSchedulerIntegrationCheckHandoff(mem, changePath, handoff());
    await writeIntegrationCheck(mem, integrationCheck({ status: "passed" }));

    const summary = await buildMainAgentControlledSchedulerIntegrationBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.integrationCheck).toMatchObject({ id: "integration-check-1", status: "passed" });
    expect(summary.completion).toBeNull();
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("recommendedAction");
  });
});

async function writeChangeMetadata(mem: ResolvedMemory, changePath: string, changeId: string): Promise<void> {
  const dir = join(mem.memoryRoot, changePath);
  await mkdir(dir, { recursive: true });
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(join(dir, "change.json"), JSON.stringify({ version: "1.0", id: changeId, title: changeId, state: "active" }), "utf8"),
  );
}

async function writeIntegrationCheck(mem: ResolvedMemory, check: IntegrationCheckRecord): Promise<void> {
  await writeCheckArtifacts(mem, join(integrationCheckRoot(mem), check.id), check);
}

function candidate(overrides: Partial<SchedulerIntegrationCandidate> = {}): SchedulerIntegrationCandidate {
  return {
    ...schedulerCommon(),
    id: "candidate-1",
    status: "ready",
    outputs: [],
    readyTargets: readyTargets(),
    readyWorktreeIds: ["worktree-1", "worktree-2"],
    readyCount: 2,
    blockedCount: 0,
    artifact: "candidate.json",
    markdownArtifact: "candidate.md",
    ...overrides,
  };
}

function handoff(overrides: Partial<SchedulerIntegrationCheckHandoff> = {}): SchedulerIntegrationCheckHandoff {
  return {
    ...schedulerCommon(),
    id: "handoff-1",
    status: "completed",
    schedulerIntegrationCandidateId: "candidate-1",
    readyTargets: readyTargets(),
    readyWorktreeIds: ["worktree-1", "worktree-2"],
    integrationCheckId: "integration-check-1",
    integrationCheckStatus: "passed",
    resultTargetWorktreeIds: ["worktree-1", "worktree-2"],
    artifact: "handoff.json",
    markdownArtifact: "handoff.md",
    ...overrides,
  };
}

function outcome(overrides: Partial<SchedulerIntegrationOutcome> = {}): SchedulerIntegrationOutcome {
  return {
    ...schedulerCommon(),
    id: "outcome-1",
    status: "blocked",
    schedulerIntegrationCandidateId: "candidate-1",
    schedulerIntegrationCheckHandoffId: "handoff-1",
    integrationCheckId: "integration-check-1",
    integrationCheckStatus: "passed",
    outcomeReason: "IntegrationCheck passed; waiting for external apply/discard gate.",
    readyWorktreeIds: ["worktree-1", "worktree-2"],
    resultTargetWorktreeIds: ["worktree-1", "worktree-2"],
    targets: [
      { worktreeId: "worktree-1", changeId: "change-a", diffHash: "diff-1", sourceHead: "head-1", applied: false },
      { worktreeId: "worktree-2", changeId: "change-a", diffHash: "diff-2", sourceHead: "head-2", applied: false },
    ],
    sourceHead: "head-main",
    latestArtifactHash: "artifact-hash-1",
    latestArtifactRef: "combined.patch",
    artifact: "outcome.json",
    markdownArtifact: "outcome.md",
    ...overrides,
  };
}

function completion(overrides: Partial<SchedulerRunCompletion> = {}): SchedulerRunCompletion {
  return {
    ...schedulerCommon(),
    id: "completion-1",
    status: "completed-blocked",
    schedulerIntegrationCandidateId: "candidate-1",
    schedulerIntegrationCheckHandoffId: "handoff-1",
    schedulerIntegrationOutcomeId: "outcome-1",
    integrationCheckId: "integration-check-1",
    integrationCheckStatus: "passed",
    outcomeStatus: "blocked",
    outcomeReason: "IntegrationCheck passed; waiting for external apply/discard gate.",
    readyWorktreeIds: ["worktree-1", "worktree-2"],
    resultTargetWorktreeIds: ["worktree-1", "worktree-2"],
    artifact: "completion.json",
    markdownArtifact: "completion.md",
    ...overrides,
  };
}

function blockedCloseout(overrides: Partial<SchedulerRunBlockedCloseout> = {}): SchedulerRunBlockedCloseout {
  return {
    ...schedulerCommon(),
    id: "blocked-closeout-1",
    status: "blocked",
    reason: "candidate-blocked",
    closeoutReason: "Candidate cannot reach IntegrationCheck.",
    schedulerIntegrationCandidateId: "candidate-1",
    readyWorktreeIds: ["worktree-1", "worktree-2"],
    readyCount: 2,
    blockedCount: 0,
    blockedReasons: ["conflict"],
    unstartedReservedIntentIds: [],
    artifact: "blocked-closeout.json",
    markdownArtifact: "blocked-closeout.md",
    ...overrides,
  };
}

function integrationCheck(overrides: Partial<IntegrationCheckRecord> = {}): IntegrationCheckRecord {
  return {
    version: "1.0",
    id: "integration-check-1",
    projectId: "project-a",
    status: "passed",
    resultTargets: [
      { changeId: "change-a", worktreeId: "worktree-1", diffHash: "diff-1", diffStat: "+1 -0", sourceHead: "head-1" },
      { changeId: "change-a", worktreeId: "worktree-2", diffHash: "diff-2", diffStat: "+2 -0", sourceHead: "head-2" },
    ],
    sourceHead: "head-main",
    createdAt: "2026-07-01T00:08:00.000Z",
    finishedAt: "2026-07-01T00:09:00.000Z",
    summary: "IntegrationCheck passed.",
    riskSummary: "Low risk.",
    artifactRefs: ["combined.patch"],
    artifacts: [{ kind: "combined", path: "combined.patch", hash: "artifact-hash-1", createdAt: "2026-07-01T00:09:00.000Z", source: "integration-check" }],
    latestArtifactHash: "artifact-hash-1",
    latestArtifactRef: "combined.patch",
    fixAttempts: [],
    blockingIssues: [],
    warnings: [],
    ...overrides,
  };
}

function readyTargets() {
  return [
    { worktreeId: "worktree-1", worktreeDiffHash: "diff-1", diffStat: "+1 -0", sourceHead: "head-1", validationRunId: "validation-1", auditRunId: "audit-1" },
    { worktreeId: "worktree-2", worktreeDiffHash: "diff-2", diffStat: "+2 -0", sourceHead: "head-2", validationRunId: "validation-2", auditRunId: "audit-2" },
  ];
}

function schedulerCommon() {
  return {
    version: "1.0" as const,
    changeId: "change-a",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1" as const,
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "scheduler-reconcile-1",
    schedulerClaimReservationId: "scheduler-claim-1",
    schedulerContractId: "scheduler-contract-1",
    schedulerDispatchDryRunId: "scheduler-dry-run-1",
    schedulerWorkerPlanId: "scheduler-worker-plan-1",
    schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    sourceArtifactHashes: { plan: "hash-1" },
    artifactRefs: ["scheduler-ref"],
    createdAt: "2026-07-01T00:01:00.000Z",
    updatedAt: "2026-07-01T00:02:00.000Z",
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
