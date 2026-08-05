import { join } from "node:path";
import { assertPortableProjectId } from "../project-harness/project-id.js";
import { schedulerRuntimeRoot, type SchedulerArtifactStore } from "./artifact-store.js";

function schedulerArtifactFileName(id: string, label: string, extension: "json" | "md"): string {
  return `${assertPortableProjectId(id, label)}.${extension}`;
}

export function schedulerRuntimeDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return schedulerRuntimeRoot(memory, changePath, schedulerRunId);
}

export function schedulerRuntimeStatePath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-runtime-state.json");
}

export function schedulerRuntimeEventsPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-runtime-events.jsonl");
}

export function schedulerReconcileSnapshotsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-reconcile-snapshots");
}

export function schedulerReconcileSnapshotPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, snapshotId: string): string {
  return join(schedulerReconcileSnapshotsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(snapshotId, "Scheduler reconcile snapshot id", "json"));
}

export function schedulerReconcileSnapshotMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, snapshotId: string): string {
  return join(schedulerReconcileSnapshotsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(snapshotId, "Scheduler reconcile snapshot id", "md"));
}

export function schedulerClaimReservationsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-runtime-claim-reservations");
}

export function schedulerClaimReservationPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reservationId: string): string {
  return join(schedulerClaimReservationsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reservationId, "Scheduler claim reservation id", "json"));
}

export function schedulerClaimReservationMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reservationId: string): string {
  return join(schedulerClaimReservationsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reservationId, "Scheduler claim reservation id", "md"));
}

export function schedulerWorkerStartsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-starts");
}

export function schedulerWorkerStartPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerStartId: string): string {
  return join(schedulerWorkerStartsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerStartId, "Scheduler worker start id", "json"));
}

export function schedulerWorkerStartMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerStartId: string): string {
  return join(schedulerWorkerStartsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerStartId, "Scheduler worker start id", "md"));
}

export function schedulerWorkerResultsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-results");
}

export function schedulerWorkerResultPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerResultId: string): string {
  return join(schedulerWorkerResultsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerResultId, "Scheduler worker result id", "json"));
}

export function schedulerWorkerResultMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerResultId: string): string {
  return join(schedulerWorkerResultsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerResultId, "Scheduler worker result id", "md"));
}

export function schedulerWorkerValidationsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-validations");
}

export function schedulerWorkerValidationPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerValidationId: string): string {
  return join(schedulerWorkerValidationsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerValidationId, "Scheduler worker validation id", "json"));
}

export function schedulerWorkerValidationMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerValidationId: string): string {
  return join(schedulerWorkerValidationsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerValidationId, "Scheduler worker validation id", "md"));
}

export function schedulerWorkerAuditsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-audits");
}

export function schedulerWorkerAuditPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerAuditId: string): string {
  return join(schedulerWorkerAuditsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerAuditId, "Scheduler worker audit id", "json"));
}

export function schedulerWorkerAuditMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerAuditId: string): string {
  return join(schedulerWorkerAuditsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(workerAuditId, "Scheduler worker audit id", "md"));
}

export function schedulerWorkerReworkPlansDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-plans");
}

export function schedulerWorkerReworkPlanPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkPlanId: string): string {
  return join(schedulerWorkerReworkPlansDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkPlanId, "Scheduler worker rework plan id", "json"));
}

export function schedulerWorkerReworkPlanMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkPlanId: string): string {
  return join(schedulerWorkerReworkPlansDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkPlanId, "Scheduler worker rework plan id", "md"));
}

export function schedulerWorkerReworkStartsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-starts");
}

export function schedulerWorkerReworkStartPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkStartId: string): string {
  return join(schedulerWorkerReworkStartsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkStartId, "Scheduler worker rework start id", "json"));
}

export function schedulerWorkerReworkStartMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkStartId: string): string {
  return join(schedulerWorkerReworkStartsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkStartId, "Scheduler worker rework start id", "md"));
}

export function schedulerWorkerReworkResultsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-results");
}

export function schedulerWorkerReworkResultPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkResultId: string): string {
  return join(schedulerWorkerReworkResultsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkResultId, "Scheduler worker rework result id", "json"));
}

export function schedulerWorkerReworkResultMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkResultId: string): string {
  return join(schedulerWorkerReworkResultsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkResultId, "Scheduler worker rework result id", "md"));
}

export function schedulerWorkerReworkValidationsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-validations");
}

export function schedulerWorkerReworkValidationPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkValidationId: string): string {
  return join(schedulerWorkerReworkValidationsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkValidationId, "Scheduler worker rework validation id", "json"));
}

export function schedulerWorkerReworkValidationMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkValidationId: string): string {
  return join(schedulerWorkerReworkValidationsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkValidationId, "Scheduler worker rework validation id", "md"));
}

export function schedulerWorkerReworkAuditsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-audits");
}

export function schedulerWorkerReworkAuditPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkAuditId: string): string {
  return join(schedulerWorkerReworkAuditsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkAuditId, "Scheduler worker rework audit id", "json"));
}

export function schedulerWorkerReworkAuditMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkAuditId: string): string {
  return join(schedulerWorkerReworkAuditsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(reworkAuditId, "Scheduler worker rework audit id", "md"));
}

export function schedulerIntegrationCandidatesDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-integration-candidates");
}

export function schedulerIntegrationCandidatePath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, candidateId: string): string {
  return join(schedulerIntegrationCandidatesDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(candidateId, "Scheduler integration candidate id", "json"));
}

export function schedulerIntegrationCandidateMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, candidateId: string): string {
  return join(schedulerIntegrationCandidatesDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(candidateId, "Scheduler integration candidate id", "md"));
}

export function schedulerIntegrationCheckHandoffsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-integration-check-handoffs");
}

export function schedulerIntegrationCheckHandoffPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, handoffId: string): string {
  return join(schedulerIntegrationCheckHandoffsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(handoffId, "Scheduler integration handoff id", "json"));
}

export function schedulerIntegrationCheckHandoffMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, handoffId: string): string {
  return join(schedulerIntegrationCheckHandoffsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(handoffId, "Scheduler integration handoff id", "md"));
}

export function schedulerIntegrationOutcomesDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-integration-outcomes");
}

export function schedulerIntegrationOutcomePath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, outcomeId: string): string {
  return join(schedulerIntegrationOutcomesDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(outcomeId, "Scheduler integration outcome id", "json"));
}

export function schedulerIntegrationOutcomeMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, outcomeId: string): string {
  return join(schedulerIntegrationOutcomesDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(outcomeId, "Scheduler integration outcome id", "md"));
}

export function schedulerRunCompletionsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-run-completions");
}

export function schedulerRunCompletionPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, completionId: string): string {
  return join(schedulerRunCompletionsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(completionId, "Scheduler run completion id", "json"));
}

export function schedulerRunCompletionMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, completionId: string): string {
  return join(schedulerRunCompletionsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(completionId, "Scheduler run completion id", "md"));
}

export function schedulerRunBlockedCloseoutsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-run-closeouts");
}

export function schedulerRunBlockedCloseoutPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, closeoutId: string): string {
  return join(schedulerRunBlockedCloseoutsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(closeoutId, "Scheduler run closeout id", "json"));
}

export function schedulerRunBlockedCloseoutMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, closeoutId: string): string {
  return join(schedulerRunBlockedCloseoutsDir(memory, changePath, schedulerRunId), schedulerArtifactFileName(closeoutId, "Scheduler run closeout id", "md"));
}
