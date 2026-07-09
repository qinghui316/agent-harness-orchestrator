import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import {
  findSchedulerRuntimeWorkerAuditForValidation,
  findSchedulerRuntimeWorkerResultForStart,
  findSchedulerRuntimeWorkerReworkAuditForValidation,
  findSchedulerRuntimeWorkerReworkResultForStart,
  findSchedulerRuntimeWorkerReworkValidationForResult,
  findSchedulerRuntimeWorkerValidationForResult,
  listSchedulerRuntimeWorkerReworkStarts,
  listSchedulerRuntimeWorkerStarts,
  schedulerWorkerAuditArtifactRefs,
  schedulerWorkerReworkAuditArtifactRefs,
  schedulerWorkerReworkResultArtifactRefs,
  schedulerWorkerReworkStartArtifactRefs,
  schedulerWorkerReworkValidationArtifactRefs,
  schedulerWorkerResultArtifactRefs,
  schedulerWorkerStartArtifactRefs,
  schedulerWorkerValidationArtifactRefs,
} from "../scheduler-runtime/repository.js";
import {
  schedulerWorkerAuditsDir,
  schedulerWorkerReworkAuditsDir,
  schedulerWorkerReworkResultsDir,
  schedulerWorkerReworkStartsDir,
  schedulerWorkerReworkValidationsDir,
  schedulerWorkerResultsDir,
  schedulerWorkerStartsDir,
  schedulerWorkerValidationsDir,
} from "../scheduler-runtime/paths.js";
import type {
  SchedulerRuntimeWorkerAudit,
  SchedulerRuntimeWorkerResult,
  SchedulerRuntimeWorkerReworkAudit,
  SchedulerRuntimeWorkerReworkResult,
  SchedulerRuntimeWorkerReworkStart,
  SchedulerRuntimeWorkerReworkValidation,
  SchedulerRuntimeWorkerStart,
  SchedulerRuntimeWorkerValidation,
} from "../scheduler-runtime/types.js";
import { listWorkerLeases } from "../task-run/repository.js";
import type { ManagedProject, ResolvedMemory, WorkerLease } from "../types/index.js";
import type { MainAgentReplayEvidenceHealthStatus } from "./workflowgraph-replay.js";

export interface MainAgentControlledSchedulerWorkerBackflowHealth {
  source: "controlled-scheduler-worker";
  status: MainAgentReplayEvidenceHealthStatus;
  count: number;
  reasons: string[];
  paths: string[];
  issues?: Array<{ status: MainAgentReplayEvidenceHealthStatus; reason: string }>;
}

export type MainAgentControlledSchedulerWorkerPostureStatus =
  | "started"
  | "result-ready"
  | "validation-passed"
  | "audit-approved"
  | "blocked"
  | "failed"
  | "incomplete";

export interface MainAgentControlledSchedulerWorkerPostureRow {
  kind: "worker" | "rework";
  startId: string;
  resultId: string | null;
  validationId: string | null;
  auditId: string | null;
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  status: MainAgentControlledSchedulerWorkerPostureStatus;
  resultStatus: string | null;
  validationStatus: string | null;
  auditStatus: string | null;
  artifactRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MainAgentControlledSchedulerWorkerBackflowSummary {
  version: "1.0";
  authority: "read-only-main-agent-controlled-scheduler-worker-backflow";
  executionStarted: false;
  changeId: string;
  projectId: string | null;
  schedulerRunId: string | null;
  totals: {
    workerLeaseCount: number;
    workerStarts: number;
    workerResults: number;
    workerValidations: number;
    workerAudits: number;
    reworkStarts: number;
    reworkResults: number;
    reworkValidations: number;
    reworkAudits: number;
    blockedCount: number;
    failedCount: number;
    approvedCount: number;
    incompleteCount: number;
  };
  workers: MainAgentControlledSchedulerWorkerPostureRow[];
  reworks: MainAgentControlledSchedulerWorkerPostureRow[];
  health: MainAgentControlledSchedulerWorkerBackflowHealth;
  artifactRefs: string[];
}

interface ChainCount {
  workerResults: number;
  workerValidations: number;
  workerAudits: number;
  reworkResults: number;
  reworkValidations: number;
  reworkAudits: number;
}

export async function buildMainAgentControlledSchedulerWorkerBackflow(input: {
  memory: ResolvedMemory;
  project: ManagedProject;
  changeId: string;
  changePath?: string | null;
  schedulerRunId?: string | null;
}): Promise<MainAgentControlledSchedulerWorkerBackflowSummary> {
  const schedulerRunId = normalize(input.schedulerRunId);
  const health: MainAgentControlledSchedulerWorkerBackflowHealth = {
    source: "controlled-scheduler-worker",
    status: "available",
    count: 0,
    reasons: [],
    paths: [],
    issues: [],
  };
  if (!input.changePath) {
    markHealth(health, "missing", "Active Change path is unavailable; controlled Scheduler worker backflow cannot be read.");
    return emptyMainAgentControlledSchedulerWorkerBackflow(input, schedulerRunId, health);
  }
  if (!schedulerRunId) {
    markHealth(health, "missing", "SchedulerRun id is unavailable; controlled Scheduler worker backflow cannot be scoped.");
    return emptyMainAgentControlledSchedulerWorkerBackflow(input, schedulerRunId, health);
  }

  const workerLeases = await readWorkerLeasesForBackflow(input.memory, input.changeId, health);
  const starts = await readWorkerStartsForBackflow(input.memory, input.changePath, input.changeId, schedulerRunId, health);
  const reworkStarts = await readReworkStartsForBackflow(input.memory, input.changePath, input.changeId, schedulerRunId, health);
  const chainCount: ChainCount = {
    workerResults: 0,
    workerValidations: 0,
    workerAudits: 0,
    reworkResults: 0,
    reworkValidations: 0,
    reworkAudits: 0,
  };
  const workers: MainAgentControlledSchedulerWorkerPostureRow[] = [];
  const reworks: MainAgentControlledSchedulerWorkerPostureRow[] = [];
  const artifactRefs: string[] = [];

  for (const start of starts) {
    const row = await summarizeWorkerChain(input.memory, input.changePath, input.changeId, schedulerRunId, start, workerLeases, health, chainCount);
    workers.push(row);
    artifactRefs.push(...row.artifactRefs);
  }
  for (const start of reworkStarts) {
    const row = await summarizeReworkChain(input.memory, input.changePath, input.changeId, schedulerRunId, start, workerLeases, health, chainCount);
    reworks.push(row);
    artifactRefs.push(...row.artifactRefs);
  }

  await compareDirectoryCounts(input.memory, input.changePath, schedulerRunId, chainCount, starts.length, reworkStarts.length, health);
  health.count = workers.length + reworks.length;
  const rows = [...workers, ...reworks];
  return {
    version: "1.0",
    authority: "read-only-main-agent-controlled-scheduler-worker-backflow",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    schedulerRunId,
    totals: {
      workerLeaseCount: workerLeases.length,
      workerStarts: starts.length,
      workerResults: chainCount.workerResults,
      workerValidations: chainCount.workerValidations,
      workerAudits: chainCount.workerAudits,
      reworkStarts: reworkStarts.length,
      reworkResults: chainCount.reworkResults,
      reworkValidations: chainCount.reworkValidations,
      reworkAudits: chainCount.reworkAudits,
      blockedCount: rows.filter((row) => row.status === "blocked").length,
      failedCount: rows.filter((row) => row.status === "failed").length,
      approvedCount: rows.filter((row) => row.status === "audit-approved").length,
      incompleteCount: rows.filter((row) => row.status === "incomplete" || row.status === "started" || row.status === "result-ready" || row.status === "validation-passed").length,
    },
    workers,
    reworks,
    health,
    artifactRefs: dedupeStrings(artifactRefs),
  };
}

export function emptyMainAgentControlledSchedulerWorkerBackflow(
  input: { project: ManagedProject; changeId: string },
  schedulerRunId: string | null,
  health?: MainAgentControlledSchedulerWorkerBackflowHealth,
): MainAgentControlledSchedulerWorkerBackflowSummary {
  return {
    version: "1.0",
    authority: "read-only-main-agent-controlled-scheduler-worker-backflow",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    schedulerRunId,
    totals: {
      workerLeaseCount: 0,
      workerStarts: 0,
      workerResults: 0,
      workerValidations: 0,
      workerAudits: 0,
      reworkStarts: 0,
      reworkResults: 0,
      reworkValidations: 0,
      reworkAudits: 0,
      blockedCount: 0,
      failedCount: 0,
      approvedCount: 0,
      incompleteCount: 0,
    },
    workers: [],
    reworks: [],
    health: health ?? {
      source: "controlled-scheduler-worker",
      status: "missing",
      count: 0,
      reasons: ["Controlled Scheduler worker backflow was not attempted."],
      paths: [],
    },
    artifactRefs: [],
  };
}

async function readWorkerLeasesForBackflow(
  memory: ResolvedMemory,
  changeId: string,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
): Promise<WorkerLease[]> {
  try {
    return await listWorkerLeases(memory, changeId);
  } catch (error) {
    markHealth(health, classifyReadError(error), `WorkerLease evidence could not be read: ${errorMessage(error)}.`);
    return [];
  }
}

async function readWorkerStartsForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
): Promise<SchedulerRuntimeWorkerStart[]> {
  try {
    const starts = await listSchedulerRuntimeWorkerStarts(memory, changePath, schedulerRunId);
    return starts.filter((start) => isSameSchedulerScope(start, changeId, schedulerRunId, health, `Worker start ${start.id}`));
  } catch (error) {
    markHealth(health, classifyReadError(error), `Scheduler worker starts could not be read: ${errorMessage(error)}.`);
    return [];
  }
}

async function readReworkStartsForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
): Promise<SchedulerRuntimeWorkerReworkStart[]> {
  try {
    const starts = await listSchedulerRuntimeWorkerReworkStarts(memory, changePath, schedulerRunId);
    return starts.filter((start) => isSameSchedulerScope(start, changeId, schedulerRunId, health, `Worker rework start ${start.id}`));
  } catch (error) {
    markHealth(health, classifyReadError(error), `Scheduler worker rework starts could not be read: ${errorMessage(error)}.`);
    return [];
  }
}

async function summarizeWorkerChain(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  start: SchedulerRuntimeWorkerStart,
  workerLeases: WorkerLease[],
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  chainCount: ChainCount,
): Promise<MainAgentControlledSchedulerWorkerPostureRow> {
  validateWorkerLease(start.workerLeaseId, start.taskRunId, start.taskId, workerLeases, health, `Worker start ${start.id}`);
  const result = await readChainEvidence(
    () => findSchedulerRuntimeWorkerResultForStart(memory, changePath, schedulerRunId, start.id),
    health,
    `Scheduler worker result for start ${start.id}`,
  );
  if (result) {
    chainCount.workerResults += 1;
    validateWorkerChainScope(result, changeId, schedulerRunId, start, health, `Worker result ${result.id}`);
  }
  const validation = result ? await readChainEvidence(
    () => findSchedulerRuntimeWorkerValidationForResult(memory, changePath, schedulerRunId, result.id),
    health,
    `Scheduler worker validation for result ${result.id}`,
  ) : null;
  if (validation) {
    chainCount.workerValidations += 1;
    validateWorkerChainScope(validation, changeId, schedulerRunId, start, health, `Worker validation ${validation.id}`);
    if (validation.schedulerWorkerResultId !== result?.id) {
      markHealth(health, "scope-mismatch", `Worker validation ${validation.id} does not belong to result ${result?.id ?? "unknown"}.`);
    }
  }
  const audit = validation ? await readChainEvidence(
    () => findSchedulerRuntimeWorkerAuditForValidation(memory, changePath, schedulerRunId, validation.id),
    health,
    `Scheduler worker audit for validation ${validation.id}`,
  ) : null;
  if (audit) {
    chainCount.workerAudits += 1;
    validateWorkerChainScope(audit, changeId, schedulerRunId, start, health, `Worker audit ${audit.id}`);
    if (audit.schedulerWorkerValidationId !== validation?.id) {
      markHealth(health, "scope-mismatch", `Worker audit ${audit.id} does not belong to validation ${validation?.id ?? "unknown"}.`);
    }
  }
  const artifactRefs = dedupeStrings([
    ...Object.values(schedulerWorkerStartArtifactRefs(memory, changePath, schedulerRunId, start.id)),
    ...(result ? Object.values(schedulerWorkerResultArtifactRefs(memory, changePath, schedulerRunId, result.id)) : []),
    ...(validation ? Object.values(schedulerWorkerValidationArtifactRefs(memory, changePath, schedulerRunId, validation.id)) : []),
    ...(audit ? Object.values(schedulerWorkerAuditArtifactRefs(memory, changePath, schedulerRunId, audit.id)) : []),
  ]);
  return {
    kind: "worker",
    startId: start.id,
    resultId: result?.id ?? null,
    validationId: validation?.id ?? null,
    auditId: audit?.id ?? null,
    taskId: start.taskId,
    taskRunId: start.taskRunId,
    workerLeaseId: start.workerLeaseId,
    status: workerPostureStatus(start, result, validation, audit),
    resultStatus: result?.status ?? null,
    validationStatus: validation?.status ?? null,
    auditStatus: audit?.status ?? null,
    artifactRefs,
    createdAt: start.createdAt,
    updatedAt: latestTimestamp(start.updatedAt, result?.updatedAt, validation?.updatedAt, audit?.updatedAt),
  };
}

async function summarizeReworkChain(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  start: SchedulerRuntimeWorkerReworkStart,
  workerLeases: WorkerLease[],
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  chainCount: ChainCount,
): Promise<MainAgentControlledSchedulerWorkerPostureRow> {
  validateWorkerLease(start.originalWorkerLeaseId, start.originalTaskRunId, start.taskId, workerLeases, health, `Worker rework start ${start.id} original`);
  validateWorkerLease(start.reworkWorkerLeaseId, start.reworkTaskRunId, start.taskId, workerLeases, health, `Worker rework start ${start.id} rework`);
  const result = await readChainEvidence(
    () => findSchedulerRuntimeWorkerReworkResultForStart(memory, changePath, schedulerRunId, start.id),
    health,
    `Scheduler worker rework result for start ${start.id}`,
  );
  if (result) {
    chainCount.reworkResults += 1;
    validateReworkChainScope(result, changeId, schedulerRunId, start, health, `Worker rework result ${result.id}`);
  }
  const validation = result ? await readChainEvidence(
    () => findSchedulerRuntimeWorkerReworkValidationForResult(memory, changePath, schedulerRunId, result.id),
    health,
    `Scheduler worker rework validation for result ${result.id}`,
  ) : null;
  if (validation) {
    chainCount.reworkValidations += 1;
    validateReworkChainScope(validation, changeId, schedulerRunId, start, health, `Worker rework validation ${validation.id}`);
    if (validation.schedulerWorkerReworkResultId !== result?.id) {
      markHealth(health, "scope-mismatch", `Worker rework validation ${validation.id} does not belong to result ${result?.id ?? "unknown"}.`);
    }
  }
  const audit = validation ? await readChainEvidence(
    () => findSchedulerRuntimeWorkerReworkAuditForValidation(memory, changePath, schedulerRunId, validation.id),
    health,
    `Scheduler worker rework audit for validation ${validation.id}`,
  ) : null;
  if (audit) {
    chainCount.reworkAudits += 1;
    validateReworkChainScope(audit, changeId, schedulerRunId, start, health, `Worker rework audit ${audit.id}`);
    if (audit.schedulerWorkerReworkValidationId !== validation?.id) {
      markHealth(health, "scope-mismatch", `Worker rework audit ${audit.id} does not belong to validation ${validation?.id ?? "unknown"}.`);
    }
  }
  const artifactRefs = dedupeStrings([
    ...Object.values(schedulerWorkerReworkStartArtifactRefs(memory, changePath, schedulerRunId, start.id)),
    ...(result ? Object.values(schedulerWorkerReworkResultArtifactRefs(memory, changePath, schedulerRunId, result.id)) : []),
    ...(validation ? Object.values(schedulerWorkerReworkValidationArtifactRefs(memory, changePath, schedulerRunId, validation.id)) : []),
    ...(audit ? Object.values(schedulerWorkerReworkAuditArtifactRefs(memory, changePath, schedulerRunId, audit.id)) : []),
  ]);
  return {
    kind: "rework",
    startId: start.id,
    resultId: result?.id ?? null,
    validationId: validation?.id ?? null,
    auditId: audit?.id ?? null,
    taskId: start.taskId,
    taskRunId: start.reworkTaskRunId,
    workerLeaseId: start.reworkWorkerLeaseId,
    status: reworkPostureStatus(start, result, validation, audit),
    resultStatus: result?.status ?? null,
    validationStatus: validation?.status ?? null,
    auditStatus: audit?.status ?? null,
    artifactRefs,
    createdAt: start.createdAt,
    updatedAt: latestTimestamp(start.updatedAt, result?.updatedAt, validation?.updatedAt, audit?.updatedAt),
  };
}

async function readChainEvidence<T>(
  reader: () => Promise<T | null>,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  label: string,
): Promise<T | null> {
  try {
    return await reader();
  } catch (error) {
    markHealth(health, classifyReadError(error), `${label} could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

function validateWorkerLease(
  leaseId: string,
  taskRunId: string,
  taskId: string,
  workerLeases: WorkerLease[],
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  label: string,
): void {
  const lease = workerLeases.find((item) => item.id === leaseId);
  if (!lease) {
    markHealth(health, "missing", `${label} references WorkerLease ${leaseId}, but the lease evidence is missing.`);
    return;
  }
  if (lease.taskRunId !== taskRunId || lease.taskId !== taskId) {
    markHealth(health, "scope-mismatch", `${label} WorkerLease ${lease.id} scope does not match task ${taskId} / TaskRun ${taskRunId}.`);
  }
}

function validateWorkerChainScope(
  item: SchedulerRuntimeWorkerResult | SchedulerRuntimeWorkerValidation | SchedulerRuntimeWorkerAudit,
  changeId: string,
  schedulerRunId: string,
  start: SchedulerRuntimeWorkerStart,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  label: string,
): void {
  if (!isSameSchedulerScope(item, changeId, schedulerRunId, health, label)) return;
  if (item.schedulerWorkerStartId !== start.id || item.taskId !== start.taskId || item.taskRunId !== start.taskRunId || item.workerLeaseId !== start.workerLeaseId) {
    markHealth(health, "scope-mismatch", `${label} does not match worker start ${start.id} scope.`);
  }
}

function validateReworkChainScope(
  item: SchedulerRuntimeWorkerReworkResult | SchedulerRuntimeWorkerReworkValidation | SchedulerRuntimeWorkerReworkAudit,
  changeId: string,
  schedulerRunId: string,
  start: SchedulerRuntimeWorkerReworkStart,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  label: string,
): void {
  if (!isSameSchedulerScope(item, changeId, schedulerRunId, health, label)) return;
  if (
    item.schedulerWorkerReworkStartId !== start.id
    || item.taskId !== start.taskId
    || item.originalTaskRunId !== start.originalTaskRunId
    || item.originalWorkerLeaseId !== start.originalWorkerLeaseId
    || item.reworkTaskRunId !== start.reworkTaskRunId
    || item.reworkWorkerLeaseId !== start.reworkWorkerLeaseId
  ) {
    markHealth(health, "scope-mismatch", `${label} does not match worker rework start ${start.id} scope.`);
  }
}

function isSameSchedulerScope(
  item: { id: string; changeId: string; schedulerRunId: string },
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  label: string,
): boolean {
  if (item.changeId !== changeId) {
    markHealth(health, "scope-mismatch", `${label} belongs to Change ${item.changeId} instead of ${changeId}.`);
    return false;
  }
  if (item.schedulerRunId !== schedulerRunId) {
    markHealth(health, "scope-mismatch", `${label} belongs to SchedulerRun ${item.schedulerRunId} instead of ${schedulerRunId}.`);
    return false;
  }
  return true;
}

function workerPostureStatus(
  start: SchedulerRuntimeWorkerStart,
  result: SchedulerRuntimeWorkerResult | null,
  validation: SchedulerRuntimeWorkerValidation | null,
  audit: SchedulerRuntimeWorkerAudit | null,
): MainAgentControlledSchedulerWorkerPostureStatus {
  if (start.status === "failed" || result?.status === "failed" || validation?.status === "failed" || audit?.status === "failed") return "failed";
  if (audit?.status === "blocked") return "blocked";
  if (audit?.status === "approved" || audit?.status === "approved-with-notes") return "audit-approved";
  if (validation?.status === "passed") return "validation-passed";
  if (result?.status === "evidence-ready") return "result-ready";
  return "started";
}

function reworkPostureStatus(
  start: SchedulerRuntimeWorkerReworkStart,
  result: SchedulerRuntimeWorkerReworkResult | null,
  validation: SchedulerRuntimeWorkerReworkValidation | null,
  audit: SchedulerRuntimeWorkerReworkAudit | null,
): MainAgentControlledSchedulerWorkerPostureStatus {
  if (start.status === "failed" || result?.status === "failed" || validation?.status === "failed" || audit?.status === "failed") return "failed";
  if (audit?.status === "blocked") return "blocked";
  if (audit?.status === "approved" || audit?.status === "approved-with-notes") return "audit-approved";
  if (validation?.status === "passed") return "validation-passed";
  if (result?.status === "evidence-ready") return "result-ready";
  return "started";
}

async function compareDirectoryCounts(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId: string,
  chainCount: ChainCount,
  workerStartCount: number,
  reworkStartCount: number,
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
): Promise<void> {
  const checks: Array<{ label: string; dir: string; parsedCount: number }> = [
    { label: "worker starts", dir: schedulerWorkerStartsDir(memory, changePath, schedulerRunId), parsedCount: workerStartCount },
    { label: "worker results", dir: schedulerWorkerResultsDir(memory, changePath, schedulerRunId), parsedCount: chainCount.workerResults },
    { label: "worker validations", dir: schedulerWorkerValidationsDir(memory, changePath, schedulerRunId), parsedCount: chainCount.workerValidations },
    { label: "worker audits", dir: schedulerWorkerAuditsDir(memory, changePath, schedulerRunId), parsedCount: chainCount.workerAudits },
    { label: "worker rework starts", dir: schedulerWorkerReworkStartsDir(memory, changePath, schedulerRunId), parsedCount: reworkStartCount },
    { label: "worker rework results", dir: schedulerWorkerReworkResultsDir(memory, changePath, schedulerRunId), parsedCount: chainCount.reworkResults },
    { label: "worker rework validations", dir: schedulerWorkerReworkValidationsDir(memory, changePath, schedulerRunId), parsedCount: chainCount.reworkValidations },
    { label: "worker rework audits", dir: schedulerWorkerReworkAuditsDir(memory, changePath, schedulerRunId), parsedCount: chainCount.reworkAudits },
  ];
  for (const check of checks) {
    const count = await countJsonFiles(check.dir);
    if (count === null) continue;
    health.paths = dedupeStrings([...health.paths, check.dir]);
    if (count > check.parsedCount) {
      markHealth(health, "malformed", `Scheduler ${check.label} directory contains unreadable, old-schema, orphaned, or scope-mismatched evidence.`);
    }
  }
}

async function countJsonFiles(dir: string): Promise<number | null> {
  if (!existsSync(dir)) return null;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length;
  } catch {
    return null;
  }
}

function markHealth(
  health: MainAgentControlledSchedulerWorkerBackflowHealth,
  status: MainAgentReplayEvidenceHealthStatus,
  reason: string,
): void {
  if (healthPriority(status) > healthPriority(health.status)) health.status = status;
  health.reasons = dedupeStrings([...health.reasons, reason]);
  health.issues = [...(health.issues ?? []), { status, reason }];
}

function classifyReadError(error: unknown): MainAgentReplayEvidenceHealthStatus {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("enoent") || message.includes("no such file") || message.includes("cannot find")) return "missing";
  if (message.includes("scope") || message.includes("mismatch")) return "scope-mismatch";
  if (message.includes("schema") || message.includes("expected") || message.includes("invalid")) return "old-schema";
  return "malformed";
}

function healthPriority(status: MainAgentReplayEvidenceHealthStatus): number {
  switch (status) {
    case "malformed": return 6;
    case "scope-mismatch": return 5;
    case "old-schema": return 4;
    case "stale": return 3;
    case "missing": return 2;
    case "available": return 1;
  }
}

function latestTimestamp(...values: Array<string | null | undefined>): string {
  return dedupeStrings(values).sort((a, b) => b.localeCompare(a))[0] ?? "";
}

function normalize(value: string | null | undefined): string | null {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown error";
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
