import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMainAgentControlledSchedulerWorkerBackflow,
} from "../../src/main-agent-orchestration/controlled-scheduler-worker-backflow.js";
import { buildMainAgentWorkflowGraphReplaySummary } from "../../src/main-agent-orchestration/index.js";
import {
  schedulerWorkerResultsDir,
} from "../../src/scheduler-runtime/paths.js";
import {
  writeSchedulerRuntimeWorkerAudit,
  writeSchedulerRuntimeWorkerReworkAudit,
  writeSchedulerRuntimeWorkerReworkResult,
  writeSchedulerRuntimeWorkerReworkStart,
  writeSchedulerRuntimeWorkerReworkValidation,
  writeSchedulerRuntimeWorkerResult,
  writeSchedulerRuntimeWorkerStart,
  writeSchedulerRuntimeWorkerValidation,
} from "../../src/scheduler-runtime/repository.js";
import type {
  SchedulerRuntimeWorkerAudit,
  SchedulerRuntimeWorkerResult,
  SchedulerRuntimeWorkerReworkAudit,
  SchedulerRuntimeWorkerReworkResult,
  SchedulerRuntimeWorkerReworkStart,
  SchedulerRuntimeWorkerReworkValidation,
  SchedulerRuntimeWorkerStart,
  SchedulerRuntimeWorkerValidation,
} from "../../src/scheduler-runtime/types.js";
import { writeWorkerLease } from "../../src/task-run/repository.js";
import type { ManagedProject, ResolvedMemory, WorkerLease } from "../../src/types/index.js";

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("main-agent controlled Scheduler worker backflow", () => {
  it("summarizes worker start/result/validation/audit posture without executable payloads", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-worker-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeWorkerLease(mem, workerLease());
    const start = workerStart();
    const result = workerResult(start);
    const validation = workerValidation(result);
    const audit = workerAudit(validation);
    await writeSchedulerRuntimeWorkerStart(mem, changePath, start);
    await writeSchedulerRuntimeWorkerResult(mem, changePath, result);
    await writeSchedulerRuntimeWorkerValidation(mem, changePath, validation);
    await writeSchedulerRuntimeWorkerAudit(mem, changePath, audit);

    const summary = await buildMainAgentControlledSchedulerWorkerBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary).toMatchObject({
      authority: "read-only-main-agent-controlled-scheduler-worker-backflow",
      executionStarted: false,
      health: { source: "controlled-scheduler-worker", status: "available" },
      totals: {
        workerLeaseCount: 1,
        workerStarts: 1,
        workerResults: 1,
        workerValidations: 1,
        workerAudits: 1,
        approvedCount: 1,
      },
    });
    expect(summary.workers[0]).toMatchObject({
      kind: "worker",
      startId: "worker-start-1",
      resultId: "worker-result-1",
      validationId: "worker-validation-1",
      auditId: "worker-audit-1",
      status: "audit-approved",
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("actionType");
    expect(serialized).not.toContain("confirmationQueue");
    expect(serialized).not.toContain("result.apply");
    expect(serialized).not.toContain("change.close");
    expect(serialized).not.toContain("merge");
  });

  it("summarizes bounded rework posture without starting another rework", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-worker-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeWorkerLease(mem, workerLease());
    await writeWorkerLease(mem, workerLease({ id: "worker-lease-rework-1", taskRunId: "task-run-rework-1", status: "released" }));
    const start = reworkStart();
    const result = reworkResult(start);
    const validation = reworkValidation(result);
    const audit = reworkAudit(validation);
    await writeSchedulerRuntimeWorkerReworkStart(mem, changePath, start);
    await writeSchedulerRuntimeWorkerReworkResult(mem, changePath, result);
    await writeSchedulerRuntimeWorkerReworkValidation(mem, changePath, validation);
    await writeSchedulerRuntimeWorkerReworkAudit(mem, changePath, audit);

    const summary = await buildMainAgentControlledSchedulerWorkerBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.totals.reworkStarts).toBe(1);
    expect(summary.totals.reworkResults).toBe(1);
    expect(summary.totals.reworkValidations).toBe(1);
    expect(summary.totals.reworkAudits).toBe(1);
    expect(summary.reworks[0]).toMatchObject({
      kind: "rework",
      startId: "worker-rework-start-1",
      resultId: "worker-rework-result-1",
      validationId: "worker-rework-validation-1",
      auditId: "worker-rework-audit-1",
      status: "audit-approved",
    });
  });

  it("keeps missing worker result as incomplete posture rather than an unsafe gap", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-worker-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeWorkerLease(mem, workerLease({ status: "claimed" }));
    await writeSchedulerRuntimeWorkerStart(mem, changePath, workerStart());

    const summary = await buildMainAgentControlledSchedulerWorkerBackflow({
      memory: mem,
      project: project(),
      changeId: "change-a",
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.health.status).toBe("available");
    expect(summary.workers[0]).toMatchObject({ status: "started", resultId: null });
    expect(summary.totals.incompleteCount).toBe(1);
  });

  it("fails closed on WorkerLease / TaskRun scope mismatch", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-worker-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeWorkerLease(mem, workerLease({ taskRunId: "other-task-run" }));
    await writeSchedulerRuntimeWorkerStart(mem, changePath, workerStart());

    const summary = await buildMainAgentControlledSchedulerWorkerBackflow({
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

  it("surfaces malformed worker JSON as an unsafe replay gap", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-worker-backflow-"));
    const mem = memory(root);
    const changePath = "harness/changes/active/change-a";
    await writeChangeMetadata(mem, changePath, "change-a");
    await writeWorkerLease(mem, workerLease());
    await writeSchedulerRuntimeWorkerStart(mem, changePath, workerStart());
    const dir = schedulerWorkerResultsDir(mem, changePath, "scheduler-run-1");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "bad-result.json"), "not-json", "utf8");

    const summary = await buildMainAgentWorkflowGraphReplaySummary(mem, project(), "change-a", {
      changePath,
      schedulerRunId: "scheduler-run-1",
    });

    expect(summary.controlledSchedulerStateBackflow.workerBackflow.health.status).toBe("malformed");
    expect(summary.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "controlled-scheduler-worker", status: "malformed" }),
    ]));
    expect(summary.nextObservation.kind).toBe("inspect-evidence-gap");
  });
});

async function writeChangeMetadata(mem: ResolvedMemory, changePath: string, changeId: string): Promise<void> {
  const dir = join(mem.memoryRoot, changePath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "change.json"), JSON.stringify({ version: "1.0", id: changeId, title: changeId, state: "active" }), "utf8");
}

function workerLease(overrides: Partial<WorkerLease> = {}): WorkerLease {
  return {
    version: "1.0",
    id: "worker-lease-1",
    projectId: "project-a",
    changeId: "change-a",
    taskRunId: "task-run-1",
    taskId: "task-1",
    roleId: "coder",
    workerId: "worker-1",
    status: "released",
    claimedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:02:00.000Z",
    releasedAt: "2026-07-01T00:02:00.000Z",
    expiresAt: "2026-07-01T01:00:00.000Z",
    ...overrides,
  };
}

function workerStart(overrides: Partial<SchedulerRuntimeWorkerStart> = {}): SchedulerRuntimeWorkerStart {
  return {
    ...workerCommon(),
    id: "worker-start-1",
    status: "started",
    stage: "coder",
    taskRunRoleId: "coder",
    agentRoleId: "coder",
    worktreeId: "worktree-1",
    runId: "run-1",
    artifact: "worker-start.json",
    markdownArtifact: "worker-start.md",
    ...overrides,
  };
}

function workerResult(start = workerStart(), overrides: Partial<SchedulerRuntimeWorkerResult> = {}): SchedulerRuntimeWorkerResult {
  return {
    ...workerCommon(),
    id: "worker-result-1",
    status: "evidence-ready",
    schedulerWorkerStartId: start.id,
    stage: "coder",
    taskRunStatus: "completed",
    workerLeaseStatus: "released",
    agentRoleId: "coder",
    worktreeId: "worktree-1",
    runId: "run-1",
    runStatus: "completed",
    artifact: "worker-result.json",
    markdownArtifact: "worker-result.md",
    ...overrides,
  };
}

function workerValidation(result = workerResult(), overrides: Partial<SchedulerRuntimeWorkerValidation> = {}): SchedulerRuntimeWorkerValidation {
  return {
    ...workerCommon(),
    id: "worker-validation-1",
    status: "passed",
    schedulerWorkerStartId: result.schedulerWorkerStartId,
    schedulerWorkerResultId: result.id,
    stage: "validation",
    taskRunStatus: "completed",
    worktreeId: "worktree-1",
    codeRunId: "run-1",
    validationRunId: "validation-1",
    validationStatus: "passed",
    artifact: "worker-validation.json",
    markdownArtifact: "worker-validation.md",
    ...overrides,
  };
}

function workerAudit(validation = workerValidation(), overrides: Partial<SchedulerRuntimeWorkerAudit> = {}): SchedulerRuntimeWorkerAudit {
  return {
    ...workerCommon(),
    id: "worker-audit-1",
    status: "approved",
    schedulerWorkerStartId: validation.schedulerWorkerStartId,
    schedulerWorkerResultId: validation.schedulerWorkerResultId,
    schedulerWorkerValidationId: validation.id,
    stage: "audit",
    taskRunStatus: "completed",
    worktreeId: "worktree-1",
    codeRunId: "run-1",
    validationRunId: "validation-1",
    validationStatus: "passed",
    auditRunId: "audit-1",
    auditStatus: "approved",
    artifact: "worker-audit.json",
    markdownArtifact: "worker-audit.md",
    ...overrides,
  };
}

function reworkStart(overrides: Partial<SchedulerRuntimeWorkerReworkStart> = {}): SchedulerRuntimeWorkerReworkStart {
  return {
    ...reworkCommon(),
    id: "worker-rework-start-1",
    status: "started",
    schedulerWorkerReworkPlanId: "worker-rework-plan-1",
    stage: "bounded-rework",
    taskRunRoleId: "rework-coder",
    agentRoleId: "rework-coder",
    worktreeId: "worktree-1",
    originalCodeRunId: "run-1",
    reworkRunId: "run-rework-1",
    artifact: "worker-rework-start.json",
    markdownArtifact: "worker-rework-start.md",
    ...overrides,
  };
}

function reworkResult(start = reworkStart(), overrides: Partial<SchedulerRuntimeWorkerReworkResult> = {}): SchedulerRuntimeWorkerReworkResult {
  return {
    ...reworkCommon(),
    id: "worker-rework-result-1",
    status: "evidence-ready",
    schedulerWorkerReworkPlanId: start.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: start.id,
    stage: "bounded-rework",
    taskRunStatus: "completed",
    workerLeaseStatus: "released",
    agentRoleId: "rework-coder",
    worktreeId: "worktree-1",
    originalCodeRunId: "run-1",
    reworkRunId: "run-rework-1",
    reworkRunStatus: "completed",
    artifact: "worker-rework-result.json",
    markdownArtifact: "worker-rework-result.md",
    ...overrides,
  };
}

function reworkValidation(result = reworkResult(), overrides: Partial<SchedulerRuntimeWorkerReworkValidation> = {}): SchedulerRuntimeWorkerReworkValidation {
  return {
    ...reworkCommon(),
    id: "worker-rework-validation-1",
    status: "passed",
    schedulerWorkerReworkPlanId: result.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: result.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: result.id,
    stage: "validation",
    taskRunStatus: "completed",
    worktreeId: "worktree-1",
    originalCodeRunId: "run-1",
    reworkRunId: "run-rework-1",
    validationRunId: "validation-rework-1",
    validationStatus: "passed",
    artifact: "worker-rework-validation.json",
    markdownArtifact: "worker-rework-validation.md",
    ...overrides,
  };
}

function reworkAudit(validation = reworkValidation(), overrides: Partial<SchedulerRuntimeWorkerReworkAudit> = {}): SchedulerRuntimeWorkerReworkAudit {
  return {
    ...reworkCommon(),
    id: "worker-rework-audit-1",
    status: "approved",
    schedulerWorkerReworkPlanId: validation.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: validation.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: validation.schedulerWorkerReworkResultId,
    schedulerWorkerReworkValidationId: validation.id,
    stage: "audit",
    taskRunStatus: "completed",
    worktreeId: "worktree-1",
    originalCodeRunId: "run-1",
    reworkRunId: "run-rework-1",
    validationRunId: "validation-rework-1",
    validationStatus: "passed",
    auditRunId: "audit-rework-1",
    auditStatus: "approved",
    artifact: "worker-rework-audit.json",
    markdownArtifact: "worker-rework-audit.md",
    ...overrides,
  };
}

function workerCommon() {
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
    reservationIntentId: "reservation-intent-1",
    claimIntentId: "claim-intent-1",
    plannedWorkerKey: "worker-key-1",
    nodeId: "node-1",
    unitId: "unit-1",
    waveIndex: 0,
    stageId: "stage-1",
    taskId: "task-1",
    taskRunId: "task-run-1",
    workerLeaseId: "worker-lease-1",
    sourceArtifactHashes: {},
    artifactRefs: ["worker-ref"],
    createdAt: "2026-07-01T00:01:00.000Z",
    updatedAt: "2026-07-01T00:02:00.000Z",
  };
}

function reworkCommon() {
  return {
    version: "1.0" as const,
    changeId: "change-a",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1" as const,
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "scheduler-reconcile-1",
    schedulerClaimReservationId: "scheduler-claim-1",
    schedulerWorkerStartId: "worker-start-1",
    schedulerWorkerResultId: "worker-result-1",
    schedulerWorkerValidationId: "worker-validation-1",
    schedulerWorkerAuditId: "worker-audit-1",
    schedulerContractId: "scheduler-contract-1",
    schedulerDispatchDryRunId: "scheduler-dry-run-1",
    schedulerWorkerPlanId: "scheduler-worker-plan-1",
    schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    reservationIntentId: "reservation-intent-1",
    claimIntentId: "claim-intent-1",
    plannedWorkerKey: "worker-key-1",
    nodeId: "node-1",
    unitId: "unit-1",
    waveIndex: 0,
    stageId: "stage-1",
    taskId: "task-1",
    originalTaskRunId: "task-run-1",
    originalWorkerLeaseId: "worker-lease-1",
    reworkTaskRunId: "task-run-rework-1",
    reworkWorkerLeaseId: "worker-lease-rework-1",
    sourceArtifactHashes: {},
    artifactRefs: ["worker-rework-ref"],
    createdAt: "2026-07-01T00:03:00.000Z",
    updatedAt: "2026-07-01T00:04:00.000Z",
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
