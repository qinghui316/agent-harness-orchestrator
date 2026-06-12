import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function schedulerRuntimeDir(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-runs", schedulerRunId);
}

export function schedulerRuntimeStatePath(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-runtime-state.json");
}

export function schedulerRuntimeEventsPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-runtime-events.jsonl");
}

export function schedulerReconcileSnapshotsDir(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-reconcile-snapshots");
}

export function schedulerReconcileSnapshotPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, snapshotId: string): string {
  return join(schedulerReconcileSnapshotsDir(memory, changePath, schedulerRunId), `${snapshotId}.json`);
}

export function schedulerReconcileSnapshotMarkdownPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, snapshotId: string): string {
  return join(schedulerReconcileSnapshotsDir(memory, changePath, schedulerRunId), `${snapshotId}.md`);
}

export function schedulerClaimReservationsDir(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-runtime-claim-reservations");
}

export function schedulerClaimReservationPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): string {
  return join(schedulerClaimReservationsDir(memory, changePath, schedulerRunId), `${reservationId}.json`);
}

export function schedulerClaimReservationMarkdownPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): string {
  return join(schedulerClaimReservationsDir(memory, changePath, schedulerRunId), `${reservationId}.md`);
}

export function schedulerWorkerStartsDir(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-starts");
}

export function schedulerWorkerStartPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerStartId: string): string {
  return join(schedulerWorkerStartsDir(memory, changePath, schedulerRunId), `${workerStartId}.json`);
}

export function schedulerWorkerStartMarkdownPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerStartId: string): string {
  return join(schedulerWorkerStartsDir(memory, changePath, schedulerRunId), `${workerStartId}.md`);
}

export function schedulerWorkerResultsDir(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-results");
}

export function schedulerWorkerResultPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerResultId: string): string {
  return join(schedulerWorkerResultsDir(memory, changePath, schedulerRunId), `${workerResultId}.json`);
}

export function schedulerWorkerResultMarkdownPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerResultId: string): string {
  return join(schedulerWorkerResultsDir(memory, changePath, schedulerRunId), `${workerResultId}.md`);
}

export function schedulerWorkerValidationsDir(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-validations");
}

export function schedulerWorkerValidationPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerValidationId: string): string {
  return join(schedulerWorkerValidationsDir(memory, changePath, schedulerRunId), `${workerValidationId}.json`);
}

export function schedulerWorkerValidationMarkdownPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerValidationId: string): string {
  return join(schedulerWorkerValidationsDir(memory, changePath, schedulerRunId), `${workerValidationId}.md`);
}

export function schedulerWorkerAuditsDir(memory: ResolvedMemory, changePath: string, schedulerRunId: string): string {
  return join(schedulerRuntimeDir(memory, changePath, schedulerRunId), "scheduler-worker-audits");
}

export function schedulerWorkerAuditPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerAuditId: string): string {
  return join(schedulerWorkerAuditsDir(memory, changePath, schedulerRunId), `${workerAuditId}.json`);
}

export function schedulerWorkerAuditMarkdownPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerAuditId: string): string {
  return join(schedulerWorkerAuditsDir(memory, changePath, schedulerRunId), `${workerAuditId}.md`);
}
