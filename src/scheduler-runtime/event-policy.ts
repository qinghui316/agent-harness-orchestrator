import type {
  SchedulerRuntimeEventType,
  SchedulerRuntimeWorkerAuditStatus,
  SchedulerRuntimeWorkerResultStatus,
  SchedulerRuntimeWorkerReworkAuditStatus,
  SchedulerRuntimeWorkerReworkResultStatus,
  SchedulerRuntimeWorkerReworkValidationStatus,
  SchedulerRuntimeWorkerValidationStatus,
} from "./types.js";

export function schedulerWorkerResultEventType(status: SchedulerRuntimeWorkerResultStatus): SchedulerRuntimeEventType {
  return status === "evidence-ready" ? "scheduler-runtime.worker-result-ready" : "scheduler-runtime.worker-result-failed";
}

export function schedulerWorkerReworkResultEventType(status: SchedulerRuntimeWorkerReworkResultStatus): SchedulerRuntimeEventType {
  return status === "evidence-ready" ? "scheduler-runtime.worker-rework-result-ready" : "scheduler-runtime.worker-rework-result-failed";
}

export function schedulerWorkerValidationEventType(status: SchedulerRuntimeWorkerValidationStatus): SchedulerRuntimeEventType {
  return status === "passed" ? "scheduler-runtime.worker-validation-passed" : "scheduler-runtime.worker-validation-failed";
}

export function schedulerWorkerReworkValidationEventType(status: SchedulerRuntimeWorkerReworkValidationStatus): SchedulerRuntimeEventType {
  return status === "passed" ? "scheduler-runtime.worker-rework-validation-passed" : "scheduler-runtime.worker-rework-validation-failed";
}

export function schedulerWorkerAuditEventType(status: SchedulerRuntimeWorkerAuditStatus): SchedulerRuntimeEventType {
  if (status === "approved" || status === "approved-with-notes") return "scheduler-runtime.worker-audit-approved";
  if (status === "blocked") return "scheduler-runtime.worker-audit-blocked";
  return "scheduler-runtime.worker-audit-failed";
}

export function schedulerWorkerReworkAuditEventType(status: SchedulerRuntimeWorkerReworkAuditStatus): SchedulerRuntimeEventType {
  if (status === "approved" || status === "approved-with-notes") return "scheduler-runtime.worker-rework-audit-approved";
  if (status === "blocked") return "scheduler-runtime.worker-rework-audit-blocked";
  return "scheduler-runtime.worker-rework-audit-failed";
}
