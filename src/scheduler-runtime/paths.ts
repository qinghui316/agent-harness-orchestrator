import { join } from "node:path";
import { schedulerRuntimeRoot, type SchedulerArtifactStore } from "./artifact-store.js";

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
  return join(schedulerReconcileSnapshotsDir(memory, changePath, schedulerRunId), `${snapshotId}.json`);
}

export function schedulerReconcileSnapshotMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, snapshotId: string): string {
  return join(schedulerReconcileSnapshotsDir(memory, changePath, schedulerRunId), `${snapshotId}.md`);
}

export function schedulerClaimReservationsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-runtime-claim-reservations");
}

export function schedulerClaimReservationPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reservationId: string): string {
  return join(schedulerClaimReservationsDir(memory, changePath, schedulerRunId), `${reservationId}.json`);
}

export function schedulerClaimReservationMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reservationId: string): string {
  return join(schedulerClaimReservationsDir(memory, changePath, schedulerRunId), `${reservationId}.md`);
}

export function schedulerWorkerStartsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-starts");
}

export function schedulerWorkerStartPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerStartId: string): string {
  return join(schedulerWorkerStartsDir(memory, changePath, schedulerRunId), `${workerStartId}.json`);
}

export function schedulerWorkerStartMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerStartId: string): string {
  return join(schedulerWorkerStartsDir(memory, changePath, schedulerRunId), `${workerStartId}.md`);
}

export function schedulerWorkerResultsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-results");
}

export function schedulerWorkerResultPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerResultId: string): string {
  return join(schedulerWorkerResultsDir(memory, changePath, schedulerRunId), `${workerResultId}.json`);
}

export function schedulerWorkerResultMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerResultId: string): string {
  return join(schedulerWorkerResultsDir(memory, changePath, schedulerRunId), `${workerResultId}.md`);
}

export function schedulerWorkerValidationsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-validations");
}

export function schedulerWorkerValidationPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerValidationId: string): string {
  return join(schedulerWorkerValidationsDir(memory, changePath, schedulerRunId), `${workerValidationId}.json`);
}

export function schedulerWorkerValidationMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerValidationId: string): string {
  return join(schedulerWorkerValidationsDir(memory, changePath, schedulerRunId), `${workerValidationId}.md`);
}

export function schedulerWorkerAuditsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-audits");
}

export function schedulerWorkerAuditPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerAuditId: string): string {
  return join(schedulerWorkerAuditsDir(memory, changePath, schedulerRunId), `${workerAuditId}.json`);
}

export function schedulerWorkerAuditMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, workerAuditId: string): string {
  return join(schedulerWorkerAuditsDir(memory, changePath, schedulerRunId), `${workerAuditId}.md`);
}

export function schedulerWorkerReworkPlansDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-plans");
}

export function schedulerWorkerReworkPlanPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkPlanId: string): string {
  return join(schedulerWorkerReworkPlansDir(memory, changePath, schedulerRunId), `${reworkPlanId}.json`);
}

export function schedulerWorkerReworkPlanMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkPlanId: string): string {
  return join(schedulerWorkerReworkPlansDir(memory, changePath, schedulerRunId), `${reworkPlanId}.md`);
}

export function schedulerWorkerReworkStartsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-starts");
}

export function schedulerWorkerReworkStartPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkStartId: string): string {
  return join(schedulerWorkerReworkStartsDir(memory, changePath, schedulerRunId), `${reworkStartId}.json`);
}

export function schedulerWorkerReworkStartMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkStartId: string): string {
  return join(schedulerWorkerReworkStartsDir(memory, changePath, schedulerRunId), `${reworkStartId}.md`);
}

export function schedulerWorkerReworkResultsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-results");
}

export function schedulerWorkerReworkResultPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkResultId: string): string {
  return join(schedulerWorkerReworkResultsDir(memory, changePath, schedulerRunId), `${reworkResultId}.json`);
}

export function schedulerWorkerReworkResultMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkResultId: string): string {
  return join(schedulerWorkerReworkResultsDir(memory, changePath, schedulerRunId), `${reworkResultId}.md`);
}

export function schedulerWorkerReworkValidationsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-validations");
}

export function schedulerWorkerReworkValidationPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkValidationId: string): string {
  return join(schedulerWorkerReworkValidationsDir(memory, changePath, schedulerRunId), `${reworkValidationId}.json`);
}

export function schedulerWorkerReworkValidationMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkValidationId: string): string {
  return join(schedulerWorkerReworkValidationsDir(memory, changePath, schedulerRunId), `${reworkValidationId}.md`);
}

export function schedulerWorkerReworkAuditsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-rework-audits");
}

export function schedulerWorkerReworkAuditPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkAuditId: string): string {
  return join(schedulerWorkerReworkAuditsDir(memory, changePath, schedulerRunId), `${reworkAuditId}.json`);
}

export function schedulerWorkerReworkAuditMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkAuditId: string): string {
  return join(schedulerWorkerReworkAuditsDir(memory, changePath, schedulerRunId), `${reworkAuditId}.md`);
}

export function schedulerIntegrationCandidatesDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-integration-candidates");
}

export function schedulerIntegrationCandidatePath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, candidateId: string): string {
  return join(schedulerIntegrationCandidatesDir(memory, changePath, schedulerRunId), `${candidateId}.json`);
}

export function schedulerIntegrationCandidateMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, candidateId: string): string {
  return join(schedulerIntegrationCandidatesDir(memory, changePath, schedulerRunId), `${candidateId}.md`);
}

export function schedulerIntegrationCheckHandoffsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-integration-check-handoffs");
}

export function schedulerIntegrationCheckHandoffPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, handoffId: string): string {
  return join(schedulerIntegrationCheckHandoffsDir(memory, changePath, schedulerRunId), `${handoffId}.json`);
}

export function schedulerIntegrationCheckHandoffMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, handoffId: string): string {
  return join(schedulerIntegrationCheckHandoffsDir(memory, changePath, schedulerRunId), `${handoffId}.md`);
}

export function schedulerIntegrationOutcomesDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-integration-outcomes");
}

export function schedulerIntegrationOutcomePath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, outcomeId: string): string {
  return join(schedulerIntegrationOutcomesDir(memory, changePath, schedulerRunId), `${outcomeId}.json`);
}

export function schedulerIntegrationOutcomeMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, outcomeId: string): string {
  return join(schedulerIntegrationOutcomesDir(memory, changePath, schedulerRunId), `${outcomeId}.md`);
}

export function schedulerRunCompletionsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-run-completions");
}

export function schedulerRunCompletionPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, completionId: string): string {
  return join(schedulerRunCompletionsDir(memory, changePath, schedulerRunId), `${completionId}.json`);
}

export function schedulerRunCompletionMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, completionId: string): string {
  return join(schedulerRunCompletionsDir(memory, changePath, schedulerRunId), `${completionId}.md`);
}

export function schedulerRunBlockedCloseoutsDir(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-run-closeouts");
}

export function schedulerRunBlockedCloseoutPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, closeoutId: string): string {
  return join(schedulerRunBlockedCloseoutsDir(memory, changePath, schedulerRunId), `${closeoutId}.json`);
}

export function schedulerRunBlockedCloseoutMarkdownPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, closeoutId: string): string {
  return join(schedulerRunBlockedCloseoutsDir(memory, changePath, schedulerRunId), `${closeoutId}.md`);
}
