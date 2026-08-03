import type { SchedulerArtifactStore } from "./artifact-store.js";
import {
  findSchedulerRuntimeWorkerAuditForValidation,
  findSchedulerRuntimeWorkerResultForStart,
  findSchedulerRuntimeWorkerReworkAuditForValidation,
  findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence,
  findSchedulerRuntimeWorkerReworkResultForStart,
  findSchedulerRuntimeWorkerReworkStartForPlan,
  findSchedulerRuntimeWorkerReworkValidationForResult,
  findSchedulerRuntimeWorkerValidationForResult,
  listSchedulerRuntimeWorkerStarts,
} from "./repository.js";
import type {
  SchedulerRuntimeWorkerAudit,
  SchedulerRuntimeWorkerResult,
  SchedulerRuntimeWorkerReworkAudit,
  SchedulerRuntimeWorkerReworkPlan,
  SchedulerRuntimeWorkerReworkResult,
  SchedulerRuntimeWorkerReworkStart,
  SchedulerRuntimeWorkerReworkValidation,
  SchedulerRuntimeWorkerStart,
  SchedulerRuntimeWorkerValidation,
} from "./types.js";

export type SchedulerWorkerPathStatus =
  | "result-pending"
  | "start-failed"
  | "result-failed"
  | "validation-pending"
  | "validation-failed"
  | "audit-pending"
  | "audit-approved"
  | "audit-blocked"
  | "audit-failed"
  | "rework-plan-pending"
  | "rework-start-pending"
  | "rework-start-failed"
  | "rework-result-pending"
  | "rework-result-failed"
  | "rework-validation-pending"
  | "rework-validation-failed"
  | "rework-audit-pending"
  | "rework-audit-approved"
  | "rework-audit-blocked"
  | "rework-audit-failed";

export interface SchedulerWorkerPathReadModel {
  start: SchedulerRuntimeWorkerStart;
  result: SchedulerRuntimeWorkerResult | null;
  validation: SchedulerRuntimeWorkerValidation | null;
  audit: SchedulerRuntimeWorkerAudit | null;
  reworkPlan: SchedulerRuntimeWorkerReworkPlan | null;
  reworkStart: SchedulerRuntimeWorkerReworkStart | null;
  reworkResult: SchedulerRuntimeWorkerReworkResult | null;
  reworkValidation: SchedulerRuntimeWorkerReworkValidation | null;
  reworkAudit: SchedulerRuntimeWorkerReworkAudit | null;
  status: SchedulerWorkerPathStatus;
  terminal: boolean;
  pendingReason?: string;
}

export interface SchedulerWorkerPathEvidenceRef {
  kind: string;
  id: string;
  status: string;
  artifact?: string;
  summary: string;
}

export interface SchedulerWorkerPathReadOptions {
  schedulerClaimReservationId?: string;
  reservationIntentIds?: Iterable<string>;
}

export async function readSchedulerWorkerPathReadModels(
  memory: SchedulerArtifactStore,
  changePath: string,
  schedulerRunId: string,
  options: SchedulerWorkerPathReadOptions = {},
): Promise<SchedulerWorkerPathReadModel[]> {
  const starts = await listSchedulerRuntimeWorkerStarts(memory, changePath, schedulerRunId);
  const reservationIntentIds = options.reservationIntentIds ? new Set(options.reservationIntentIds) : null;
  const scopedStarts = starts.filter((start) =>
    (!reservationIntentIds || reservationIntentIds.has(start.reservationIntentId))
    && (!options.schedulerClaimReservationId || start.schedulerClaimReservationId === options.schedulerClaimReservationId)
  );
  const paths = await Promise.all(scopedStarts.map((start) => readSchedulerWorkerPathReadModel(memory, changePath, schedulerRunId, start)));
  return paths.sort((a, b) => (a.start.updatedAt ?? "").localeCompare(b.start.updatedAt ?? ""));
}

export async function readSchedulerWorkerPathReadModelsForReservation(
  memory: SchedulerArtifactStore,
  changePath: string,
  schedulerRunId: string,
  reservation: { id?: string; reservationIntents: Array<{ reservationIntentId: string }> },
): Promise<SchedulerWorkerPathReadModel[]> {
  return readSchedulerWorkerPathReadModels(memory, changePath, schedulerRunId, {
    schedulerClaimReservationId: reservation.id,
    reservationIntentIds: reservation.reservationIntents.map((intent) => intent.reservationIntentId),
  });
}

export function schedulerWorkerPathEvidenceRefs(path: SchedulerWorkerPathReadModel): SchedulerWorkerPathEvidenceRef[] {
  const refs: SchedulerWorkerPathEvidenceRef[] = [{
    kind: "SchedulerRuntimeWorkerStart",
    id: path.start.id,
    status: path.start.status,
    artifact: path.start.artifact,
    summary: `Worker ${path.start.claimIntentId} start evidence exists.`,
  }];
  for (const evidence of [
    ["SchedulerRuntimeWorkerResult", path.result],
    ["SchedulerRuntimeWorkerValidation", path.validation],
    ["SchedulerRuntimeWorkerAudit", path.audit],
    ["SchedulerRuntimeWorkerReworkPlan", path.reworkPlan],
    ["SchedulerRuntimeWorkerReworkStart", path.reworkStart],
    ["SchedulerRuntimeWorkerReworkResult", path.reworkResult],
    ["SchedulerRuntimeWorkerReworkValidation", path.reworkValidation],
    ["SchedulerRuntimeWorkerReworkAudit", path.reworkAudit],
  ] as const) {
    if (!evidence[1]) continue;
    refs.push({
      kind: evidence[0],
      id: evidence[1].id,
      status: evidence[1].status,
      artifact: evidence[1].artifact,
      summary: `${evidence[0]} is present for claim ${path.start.claimIntentId}.`,
    });
  }
  return refs;
}

export function hasApprovedSchedulerWorkerOutput(path: SchedulerWorkerPathReadModel): boolean {
  return path.audit?.status === "approved"
    || path.audit?.status === "approved-with-notes"
    || path.reworkAudit?.status === "approved"
    || path.reworkAudit?.status === "approved-with-notes";
}

export function isTerminalSchedulerWorkerPathStatus(status: SchedulerWorkerPathStatus): boolean {
  return [
    "start-failed",
    "result-failed",
    "audit-approved",
    "rework-start-failed",
    "rework-result-failed",
    "rework-validation-failed",
    "rework-audit-approved",
    "rework-audit-blocked",
    "rework-audit-failed",
  ].includes(status);
}

async function readSchedulerWorkerPathReadModel(
  memory: SchedulerArtifactStore,
  changePath: string,
  schedulerRunId: string,
  start: SchedulerRuntimeWorkerStart,
): Promise<SchedulerWorkerPathReadModel> {
  const result = await findSchedulerRuntimeWorkerResultForStart(memory, changePath, schedulerRunId, start.id).catch(() => null);
  const validation = result ? await findSchedulerRuntimeWorkerValidationForResult(memory, changePath, schedulerRunId, result.id).catch(() => null) : null;
  const audit = validation ? await findSchedulerRuntimeWorkerAuditForValidation(memory, changePath, schedulerRunId, validation.id).catch(() => null) : null;
  const reworkPlan = validation ? await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(memory, changePath, schedulerRunId, {
    workerValidationId: validation.id,
    ...(audit ? { workerAuditId: audit.id } : {}),
  }).catch(() => null) : null;
  const reworkStart = reworkPlan ? await findSchedulerRuntimeWorkerReworkStartForPlan(memory, changePath, schedulerRunId, reworkPlan.id).catch(() => null) : null;
  const reworkResult = reworkStart ? await findSchedulerRuntimeWorkerReworkResultForStart(memory, changePath, schedulerRunId, reworkStart.id).catch(() => null) : null;
  const reworkValidation = reworkResult ? await findSchedulerRuntimeWorkerReworkValidationForResult(memory, changePath, schedulerRunId, reworkResult.id).catch(() => null) : null;
  const reworkAudit = reworkValidation ? await findSchedulerRuntimeWorkerReworkAuditForValidation(memory, changePath, schedulerRunId, reworkValidation.id).catch(() => null) : null;
  const status = classifySchedulerWorkerPathStatus({
    start,
    result,
    validation,
    audit,
    reworkPlan,
    reworkStart,
    reworkResult,
    reworkValidation,
    reworkAudit,
  });
  return {
    start,
    result,
    validation,
    audit,
    reworkPlan,
    reworkStart,
    reworkResult,
    reworkValidation,
    reworkAudit,
    status,
    terminal: isTerminalSchedulerWorkerPathStatus(status),
    ...pendingReasonForSchedulerWorkerPath(start, status),
  };
}

function classifySchedulerWorkerPathStatus(path: {
  start: SchedulerRuntimeWorkerStart;
  result: SchedulerRuntimeWorkerResult | null;
  validation: SchedulerRuntimeWorkerValidation | null;
  audit: SchedulerRuntimeWorkerAudit | null;
  reworkPlan: SchedulerRuntimeWorkerReworkPlan | null;
  reworkStart: SchedulerRuntimeWorkerReworkStart | null;
  reworkResult: SchedulerRuntimeWorkerReworkResult | null;
  reworkValidation: SchedulerRuntimeWorkerReworkValidation | null;
  reworkAudit: SchedulerRuntimeWorkerReworkAudit | null;
}): SchedulerWorkerPathStatus {
  if (path.start.status === "failed") return "start-failed";
  if (!path.result) return "result-pending";
  if (path.result.status === "failed") return "result-failed";
  if (!path.validation) return "validation-pending";
  if (path.validation.status === "failed") {
    if (!path.reworkPlan) return "rework-plan-pending";
    return classifySchedulerWorkerReworkPathStatus(path);
  }
  if (!path.audit) return "audit-pending";
  if (path.audit.status === "approved" || path.audit.status === "approved-with-notes") return "audit-approved";
  if (path.audit.status === "blocked" || path.audit.status === "failed") {
    if (!path.reworkPlan) return path.audit.status === "blocked" ? "audit-blocked" : "audit-failed";
    return classifySchedulerWorkerReworkPathStatus(path);
  }
  return "audit-failed";
}

function classifySchedulerWorkerReworkPathStatus(path: {
  reworkPlan: SchedulerRuntimeWorkerReworkPlan | null;
  reworkStart: SchedulerRuntimeWorkerReworkStart | null;
  reworkResult: SchedulerRuntimeWorkerReworkResult | null;
  reworkValidation: SchedulerRuntimeWorkerReworkValidation | null;
  reworkAudit: SchedulerRuntimeWorkerReworkAudit | null;
}): SchedulerWorkerPathStatus {
  if (!path.reworkPlan) return "rework-plan-pending";
  if (!path.reworkStart) return "rework-start-pending";
  if (path.reworkStart.status === "failed") return "rework-start-failed";
  if (!path.reworkResult) return "rework-result-pending";
  if (path.reworkResult.status === "failed") return "rework-result-failed";
  if (!path.reworkValidation) return "rework-validation-pending";
  if (path.reworkValidation.status === "failed") return "rework-validation-failed";
  if (!path.reworkAudit) return "rework-audit-pending";
  if (path.reworkAudit.status === "approved" || path.reworkAudit.status === "approved-with-notes") return "rework-audit-approved";
  return path.reworkAudit.status === "blocked" ? "rework-audit-blocked" : "rework-audit-failed";
}

function pendingReasonForSchedulerWorkerPath(start: SchedulerRuntimeWorkerStart, status: SchedulerWorkerPathStatus): { pendingReason?: string } {
  const pendingReason = (() => {
    switch (status) {
      case "result-pending":
        return `worker result is pending for ${start.id}`;
      case "validation-pending":
        return `worker validation is pending for ${start.id}`;
      case "audit-pending":
        return `worker audit is pending for ${start.id}`;
      case "rework-plan-pending":
        return `worker quality evidence is blocked without rework plan for ${start.id}`;
      case "rework-start-pending":
        return `worker rework is not started for ${start.id}`;
      case "rework-result-pending":
        return `worker rework result is pending for ${start.id}`;
      case "rework-validation-pending":
        return `worker rework validation is pending for ${start.id}`;
      case "rework-audit-pending":
        return `worker rework audit is pending for ${start.id}`;
      default:
        return undefined;
    }
  })();
  return pendingReason ? { pendingReason } : {};
}
