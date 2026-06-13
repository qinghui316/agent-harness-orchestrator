import { shortHash } from "../fs/path.js";
import { canApplyResultFromGate, classifyApplyReadiness } from "../apply/gate.js";
import { previewWorktreeApply } from "../apply/preview.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { readRun } from "../run/repository.js";
import { listWorkerLeases, readTaskRun } from "../task-run/repository.js";
import type { ManagedProject, RunMetadata, TaskRun, WorkerLease, WorktreeMetadata } from "../types/index.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  listSchedulerRuntimeWorkerAudits,
  listSchedulerRuntimeWorkerReworkAudits,
  readLatestSchedulerIntegrationCandidateProjection,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  schedulerIntegrationCandidateArtifactRefs,
  writeSchedulerIntegrationCandidate,
} from "./repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCandidateOutput,
  SchedulerIntegrationCandidateReadyTarget,
  SchedulerRuntimeState,
  SchedulerRuntimeWorkerAudit,
  SchedulerRuntimeWorkerReworkAudit,
} from "./types.js";

export interface SchedulerIntegrationCandidateInput {
  changeId: string;
  schedulerRunId: string;
}

export interface SchedulerIntegrationCandidateResult {
  status: SchedulerIntegrationCandidate["status"];
  candidate: SchedulerIntegrationCandidate;
  readyTargets: SchedulerIntegrationCandidateReadyTarget[];
  blockedOutputs: SchedulerIntegrationCandidateOutput[];
  executionStarted: false;
}

type ApprovedOutput =
  | { kind: "worker"; audit: SchedulerRuntimeWorkerAudit }
  | { kind: "rework"; audit: SchedulerRuntimeWorkerReworkAudit };

export async function compileSchedulerIntegrationCandidate(project: ManagedProject, input: SchedulerIntegrationCandidateInput): Promise<SchedulerIntegrationCandidateResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler integration candidate cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.integration-candidate.compile SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  assertRuntimeState(runtimeState, run.changeId, run.id);
  if (!runtimeState.lastClaimReservationId || !runtimeState.lastClaimReservationSnapshotId) {
    throw new Error("planning.scheduler.integration-candidate.compile requires latest SchedulerRuntimeClaimReservation.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, runtimeState.lastClaimReservationId);
  if (reservation.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId) {
    throw new Error("planning.scheduler.integration-candidate.compile claim reservation snapshot mismatch.");
  }

  const existing = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  const outputs: SchedulerIntegrationCandidateOutput[] = [];
  const approvedByClaim = new Map<string, { original: SchedulerRuntimeWorkerAudit[]; rework: SchedulerRuntimeWorkerReworkAudit[] }>();
  const workerAudits = await listSchedulerRuntimeWorkerAudits(memory, changePath, run.id);
  const reworkAudits = await listSchedulerRuntimeWorkerReworkAudits(memory, changePath, run.id);

  for (const audit of workerAudits) {
    assertAuditMatchesRuntime(audit, runtimeState);
    if (audit.schedulerClaimReservationId !== reservation.id) continue;
    if (isApproved(audit.status)) {
      const group = approvedByClaim.get(audit.claimIntentId) ?? { original: [], rework: [] };
      group.original.push(audit);
      approvedByClaim.set(audit.claimIntentId, group);
    } else {
      outputs.push(blockedOutputFromWorkerAudit(audit, [`Scheduler worker audit is ${audit.status}.`]));
    }
  }

  for (const audit of reworkAudits) {
    assertReworkAuditMatchesRuntime(audit, runtimeState);
    if (audit.schedulerClaimReservationId !== reservation.id) continue;
    if (isApproved(audit.status)) {
      const group = approvedByClaim.get(audit.claimIntentId) ?? { original: [], rework: [] };
      group.rework.push(audit);
      approvedByClaim.set(audit.claimIntentId, group);
    } else {
      outputs.push(blockedOutputFromReworkAudit(audit, [`Scheduler rework audit is ${audit.status}.`]));
    }
  }

  for (const [claimIntentId, group] of approvedByClaim.entries()) {
    if (group.original.length > 0 && group.rework.length > 0) {
      outputs.push({
        outputId: `inconsistency-${shortHash(`${run.id}:${reservation.id}:${claimIntentId}`).slice(0, 12)}`,
        kind: "inconsistency",
        status: "blocked",
        blockingReasons: ["Original worker audit and rework audit are both approved for the same claimIntentId."],
        claimIntentId,
        artifactRefs: [...group.original, ...group.rework].flatMap((item) => item.artifactRefs),
      });
      continue;
    }
    if (group.original.length > 1 || group.rework.length > 1) {
      outputs.push({
        outputId: `inconsistency-${shortHash(`${run.id}:${reservation.id}:${claimIntentId}:duplicate`).slice(0, 12)}`,
        kind: "inconsistency",
        status: "blocked",
        blockingReasons: ["Multiple approved scheduler audit outputs exist for the same claimIntentId."],
        claimIntentId,
        artifactRefs: [...group.original, ...group.rework].flatMap((item) => item.artifactRefs),
      });
      continue;
    }
    const approved: ApprovedOutput | undefined = group.original[0] ? { kind: "worker", audit: group.original[0] } : group.rework[0] ? { kind: "rework", audit: group.rework[0] } : undefined;
    if (!approved) continue;
    outputs.push(await outputFromApprovedAudit(project, memory, approved));
  }

  const readyTargets = outputs
    .filter((output) => output.status === "ready" && output.worktreeId && output.worktreeDiffHash && output.validationRunId && output.auditRunId)
    .map((output) => ({
      worktreeId: output.worktreeId as string,
      worktreeDiffHash: output.worktreeDiffHash as string,
      diffStat: output.diffStat ?? "",
      sourceHead: output.sourceHead ?? null,
      validationRunId: output.validationRunId as string,
      auditRunId: output.auditRunId as string,
    }));
  const candidateId = buildIntegrationCandidateId(run.id, reservation.id);
  const refs = schedulerIntegrationCandidateArtifactRefs(memory, changePath, run.id, candidateId);
  const now = new Date().toISOString();
  const readyCount = readyTargets.length;
  const blockedCount = outputs.filter((output) => output.status === "blocked").length;
  const candidate: SchedulerIntegrationCandidate = {
    version: "1.0",
    id: candidateId,
    changeId: run.changeId,
    schedulerRunId: run.id,
    schedulerMode: run.schedulerMode,
    status: readyCount >= 2 ? "ready" : outputs.length === 0 ? "blocked" : "waiting",
    schedulerRuntimeStateId: runtimeState.id,
    schedulerReconcileSnapshotId: reservation.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: reservation.id,
    schedulerContractId: run.schedulerContractId,
    schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: run.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
    outputs,
    readyTargets,
    readyWorktreeIds: readyTargets.map((target) => target.worktreeId),
    readyCount,
    blockedCount,
    waitingReason: readyCount < 2 ? "Waiting for at least two ready scheduler worker outputs before IntegrationCheck can run." : undefined,
    sourceArtifactHashes: runtimeState.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, run.artifact, runtimeState.artifact, reservation.artifact, ...outputs.flatMap((output) => output.artifactRefs)],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeSchedulerIntegrationCandidate(memory, changePath, candidate);
  await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.integration-candidate-compiled", {
    status: runtimeState.status,
    summary: `Scheduler integration candidate ${candidate.status} with ${candidate.readyCount} ready target(s) and ${candidate.blockedCount} blocked output(s).`,
    artifactRefs: candidate.artifactRefs,
    payload: {
      schedulerIntegrationCandidateId: candidate.id,
      schedulerClaimReservationId: candidate.schedulerClaimReservationId,
      schedulerReconcileSnapshotId: candidate.schedulerReconcileSnapshotId,
      status: candidate.status,
      readyCount: candidate.readyCount,
      blockedCount: candidate.blockedCount,
      readyWorktreeIds: candidate.readyWorktreeIds,
    },
  });
  return {
    status: candidate.status,
    candidate,
    readyTargets,
    blockedOutputs: outputs.filter((output) => output.status === "blocked"),
    executionStarted: false,
  };
}

async function outputFromApprovedAudit(project: ManagedProject, memory: Awaited<ReturnType<typeof resolveProjectMemory>>, approved: ApprovedOutput): Promise<SchedulerIntegrationCandidateOutput> {
  if (approved.kind === "worker") {
    await assertWorkerAuditEvidence(memory, approved.audit);
    return outputWithApplyReadiness(project, {
      output: baseOutputFromWorkerAudit(approved.audit),
      worktreeId: approved.audit.worktreeId,
      validationRunId: approved.audit.validationRunId,
      auditRunId: approved.audit.auditRunId,
    });
  }
  await assertReworkAuditEvidence(memory, approved.audit);
  return outputWithApplyReadiness(project, {
    output: baseOutputFromReworkAudit(approved.audit),
    worktreeId: approved.audit.worktreeId,
    validationRunId: approved.audit.validationRunId,
    auditRunId: approved.audit.auditRunId,
  });
}

async function outputWithApplyReadiness(project: ManagedProject, input: { output: SchedulerIntegrationCandidateOutput; worktreeId: string; validationRunId: string; auditRunId: string }): Promise<SchedulerIntegrationCandidateOutput> {
  try {
    const preview = await previewWorktreeApply(project, input.worktreeId);
    const readiness = classifyApplyReadiness(preview.gate);
    const ready = canApplyResultFromGate(preview.gate) && readiness.kind === "ready";
    return {
      ...input.output,
      status: ready ? "ready" : "blocked",
      blockingReasons: ready ? [] : [...preview.gate.blockingIssues, readiness.message],
      readinessKind: readiness.kind,
      readinessMessage: readiness.message,
      worktreeDiffHash: preview.gate.diffHash,
      diffStat: preview.gate.diffStat,
      sourceHead: preview.gate.sourceHead,
      validationRunId: input.validationRunId,
      auditRunId: input.auditRunId,
    };
  } catch (error) {
    return {
      ...input.output,
      status: "blocked",
      blockingReasons: [`Apply readiness preview failed: ${error instanceof Error ? error.message : String(error)}`],
      validationRunId: input.validationRunId,
      auditRunId: input.auditRunId,
    };
  }
}

async function assertWorkerAuditEvidence(memory: Awaited<ReturnType<typeof resolveProjectMemory>>, audit: SchedulerRuntimeWorkerAudit): Promise<void> {
  const taskRun = await readTaskRun(memory, audit.changeId, audit.taskRunId);
  assertTaskRun(taskRun, audit, "coder");
  const lease = await readWorkerLease(memory, taskRun, audit.workerLeaseId);
  assertLease(lease, audit, "coder");
  const codeRun = await readRun(memory, audit.codeRunId);
  assertCodeRun(codeRun, audit, "scheduler-claim-reservation", audit.taskRunId, audit.worktreeId, audit.codeRunId);
  const validationRun = await readRun(memory, audit.validationRunId);
  assertRoleRun(validationRun, audit.changeId, audit.validationRunId, "validator", audit.worktreeId);
  const auditRun = await readRun(memory, audit.auditRunId);
  assertRoleRun(auditRun, audit.changeId, audit.auditRunId, "auditor", null);
  const worktree = await readWorktreeMetadata(memory, audit.worktreeId);
  assertWorktree(worktree, audit.changeId, audit.worktreeId);
}

async function assertReworkAuditEvidence(memory: Awaited<ReturnType<typeof resolveProjectMemory>>, audit: SchedulerRuntimeWorkerReworkAudit): Promise<void> {
  const taskRun = await readTaskRun(memory, audit.changeId, audit.reworkTaskRunId);
  assertTaskRun(taskRun, audit, "rework-coder");
  const lease = await readWorkerLease(memory, taskRun, audit.reworkWorkerLeaseId);
  assertLease(lease, audit, "rework-coder");
  const codeRun = await readRun(memory, audit.reworkRunId);
  assertCodeRun(codeRun, audit, "scheduler-claim-rework", audit.reworkTaskRunId, audit.worktreeId, audit.reworkRunId, audit.schedulerWorkerReworkPlanId);
  const validationRun = await readRun(memory, audit.validationRunId);
  assertRoleRun(validationRun, audit.changeId, audit.validationRunId, "validator", audit.worktreeId);
  const auditRun = await readRun(memory, audit.auditRunId);
  assertRoleRun(auditRun, audit.changeId, audit.auditRunId, "auditor", null);
  const worktree = await readWorktreeMetadata(memory, audit.worktreeId);
  assertWorktree(worktree, audit.changeId, audit.worktreeId);
}

function baseOutputFromWorkerAudit(audit: SchedulerRuntimeWorkerAudit): SchedulerIntegrationCandidateOutput {
  return {
    outputId: `worker-${audit.id}`,
    kind: "worker",
    status: "blocked",
    blockingReasons: [],
    schedulerWorkerAuditId: audit.id,
    schedulerWorkerStartId: audit.schedulerWorkerStartId,
    schedulerWorkerResultId: audit.schedulerWorkerResultId,
    schedulerWorkerValidationId: audit.schedulerWorkerValidationId,
    reservationIntentId: audit.reservationIntentId,
    claimIntentId: audit.claimIntentId,
    plannedWorkerKey: audit.plannedWorkerKey,
    nodeId: audit.nodeId,
    unitId: audit.unitId,
    waveIndex: audit.waveIndex,
    taskId: audit.taskId,
    taskRunId: audit.taskRunId,
    workerLeaseId: audit.workerLeaseId,
    worktreeId: audit.worktreeId,
    codeRunId: audit.codeRunId,
    validationRunId: audit.validationRunId,
    auditRunId: audit.auditRunId,
    artifactRefs: audit.artifactRefs,
  };
}

function baseOutputFromReworkAudit(audit: SchedulerRuntimeWorkerReworkAudit): SchedulerIntegrationCandidateOutput {
  return {
    outputId: `rework-${audit.id}`,
    kind: "rework",
    status: "blocked",
    blockingReasons: [],
    schedulerWorkerAuditId: audit.schedulerWorkerAuditId,
    schedulerWorkerReworkAuditId: audit.id,
    schedulerWorkerStartId: audit.schedulerWorkerStartId,
    schedulerWorkerResultId: audit.schedulerWorkerResultId,
    schedulerWorkerValidationId: audit.schedulerWorkerValidationId,
    schedulerWorkerReworkPlanId: audit.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: audit.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: audit.schedulerWorkerReworkResultId,
    schedulerWorkerReworkValidationId: audit.schedulerWorkerReworkValidationId,
    reservationIntentId: audit.reservationIntentId,
    claimIntentId: audit.claimIntentId,
    plannedWorkerKey: audit.plannedWorkerKey,
    nodeId: audit.nodeId,
    unitId: audit.unitId,
    waveIndex: audit.waveIndex,
    taskId: audit.taskId,
    taskRunId: audit.reworkTaskRunId,
    workerLeaseId: audit.reworkWorkerLeaseId,
    worktreeId: audit.worktreeId,
    codeRunId: audit.reworkRunId,
    validationRunId: audit.validationRunId,
    auditRunId: audit.auditRunId,
    artifactRefs: audit.artifactRefs,
  };
}

function blockedOutputFromWorkerAudit(audit: SchedulerRuntimeWorkerAudit, reasons: string[]): SchedulerIntegrationCandidateOutput {
  return { ...baseOutputFromWorkerAudit(audit), status: "blocked", blockingReasons: reasons };
}

function blockedOutputFromReworkAudit(audit: SchedulerRuntimeWorkerReworkAudit, reasons: string[]): SchedulerIntegrationCandidateOutput {
  return { ...baseOutputFromReworkAudit(audit), status: "blocked", blockingReasons: reasons };
}

function assertRuntimeState(state: SchedulerRuntimeState, changeId: string, schedulerRunId: string): void {
  if (state.changeId !== changeId || state.schedulerRunId !== schedulerRunId) {
    throw new Error("planning.scheduler.integration-candidate.compile SchedulerRuntimeState scope mismatch.");
  }
}

function assertAuditMatchesRuntime(audit: SchedulerRuntimeWorkerAudit, runtimeState: SchedulerRuntimeState): void {
  if (audit.changeId !== runtimeState.changeId || audit.schedulerRunId !== runtimeState.schedulerRunId || audit.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.integration-candidate.compile worker audit scope mismatch.");
  }
  assertHashesMatch(audit.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "worker audit");
}

function assertReworkAuditMatchesRuntime(audit: SchedulerRuntimeWorkerReworkAudit, runtimeState: SchedulerRuntimeState): void {
  if (audit.changeId !== runtimeState.changeId || audit.schedulerRunId !== runtimeState.schedulerRunId || audit.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.integration-candidate.compile rework audit scope mismatch.");
  }
  assertHashesMatch(audit.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "rework audit");
}

async function readWorkerLease(memory: Awaited<ReturnType<typeof resolveProjectMemory>>, taskRun: TaskRun, leaseId: string): Promise<WorkerLease> {
  const lease = (await listWorkerLeases(memory, taskRun.changeId)).find((item) => item.id === leaseId);
  if (!lease) throw new Error(`WorkerLease not found: ${leaseId}.`);
  return lease;
}

function assertTaskRun(taskRun: TaskRun, audit: { changeId: string; taskId: string }, roleId: string): void {
  if (taskRun.changeId !== audit.changeId || taskRun.taskId.toUpperCase() !== audit.taskId.toUpperCase() || taskRun.roleId !== roleId) {
    throw new Error("planning.scheduler.integration-candidate.compile TaskRun scope mismatch.");
  }
}

function assertLease(lease: WorkerLease, audit: { changeId: string; taskId: string }, roleId: string): void {
  if (lease.changeId !== audit.changeId || lease.taskId.toUpperCase() !== audit.taskId.toUpperCase() || lease.roleId !== roleId) {
    throw new Error("planning.scheduler.integration-candidate.compile WorkerLease scope mismatch.");
  }
}

function assertCodeRun(run: RunMetadata, audit: { changeId: string; schedulerRunId: string; schedulerClaimReservationId: string; reservationIntentId: string; claimIntentId: string; nodeId: string; unitId: string }, mode: string, taskRunId: string, worktreeId: string, runId: string, reworkPlanId?: string): void {
  if (run.changeId !== audit.changeId || run.id !== runId || run.taskRunId !== taskRunId || run.worktree?.worktreeId !== worktreeId || run.status !== "completed") {
    throw new Error("planning.scheduler.integration-candidate.compile code run scope mismatch.");
  }
  const gate = run.executionGate;
  if (!gate?.allowed || gate.mode !== mode) {
    throw new Error("planning.scheduler.integration-candidate.compile code run execution gate mismatch.");
  }
  if (
    gate.schedulerRunId !== audit.schedulerRunId
    || gate.schedulerClaimReservationId !== audit.schedulerClaimReservationId
    || gate.reservationIntentId !== audit.reservationIntentId
    || gate.claimIntentId !== audit.claimIntentId
    || gate.nodeId !== audit.nodeId
    || gate.unitId !== audit.unitId
    || gate.taskRunId !== taskRunId
    || (reworkPlanId && gate.schedulerWorkerReworkPlanId !== reworkPlanId)
  ) {
    throw new Error("planning.scheduler.integration-candidate.compile code gate target is stale.");
  }
}

function assertRoleRun(run: RunMetadata, changeId: string, runId: string, runtime: string, worktreeId: string | null): void {
  if (run.changeId !== changeId || run.id !== runId || run.runtime !== runtime) {
    throw new Error("planning.scheduler.integration-candidate.compile role run scope mismatch.");
  }
  if (worktreeId !== null && run.worktree?.worktreeId !== worktreeId) {
    throw new Error("planning.scheduler.integration-candidate.compile role run scope mismatch.");
  }
}

function assertWorktree(worktree: WorktreeMetadata, changeId: string, worktreeId: string): void {
  if (worktree.changeId !== changeId || worktree.worktreeId !== worktreeId) {
    throw new Error("planning.scheduler.integration-candidate.compile worktree scope mismatch.");
  }
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.integration-candidate.compile ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.integration-candidate.compile ${label} source artifact hash mismatch.`);
  }
}

function isApproved(status: string): boolean {
  return status === "approved" || status === "approved-with-notes";
}

function buildIntegrationCandidateId(schedulerRunId: string, claimReservationId: string): string {
  return `scheduler-integration-candidate-${shortHash(`${schedulerRunId}:${claimReservationId}`).slice(0, 12)}`;
}
