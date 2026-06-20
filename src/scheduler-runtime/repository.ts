import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertChangePathScope } from "../workflow-artifacts/guards.js";
import { schedulerRunsDir } from "../workflow-scheduler/paths.js";
import type { SchedulerRun } from "../workflow-scheduler/types.js";
import {
  schedulerClaimReservationMarkdownPath,
  schedulerClaimReservationPath,
  schedulerClaimReservationsDir,
  schedulerControlledStepMarkdownPath,
  schedulerControlledStepPath,
  schedulerControlledStepsDir,
  schedulerIntegrationCandidateMarkdownPath,
  schedulerIntegrationCandidatePath,
  schedulerIntegrationCandidatesDir,
  schedulerIntegrationCheckHandoffMarkdownPath,
  schedulerIntegrationCheckHandoffPath,
  schedulerIntegrationCheckHandoffsDir,
  schedulerIntegrationOutcomeMarkdownPath,
  schedulerIntegrationOutcomePath,
  schedulerIntegrationOutcomesDir,
  schedulerRunCompletionMarkdownPath,
  schedulerRunCompletionPath,
  schedulerRunCompletionsDir,
  schedulerRunBlockedCloseoutMarkdownPath,
  schedulerRunBlockedCloseoutPath,
  schedulerRunBlockedCloseoutsDir,
  schedulerReconcileSnapshotMarkdownPath,
  schedulerReconcileSnapshotPath,
  schedulerRuntimeDir,
  schedulerRuntimeEventsPath,
  schedulerRuntimeStatePath,
  schedulerWorkerResultMarkdownPath,
  schedulerWorkerResultPath,
  schedulerWorkerResultsDir,
  schedulerWorkerAuditMarkdownPath,
  schedulerWorkerAuditPath,
  schedulerWorkerAuditsDir,
  schedulerWorkerReworkPlanMarkdownPath,
  schedulerWorkerReworkPlanPath,
  schedulerWorkerReworkPlansDir,
  schedulerWorkerReworkResultMarkdownPath,
  schedulerWorkerReworkResultPath,
  schedulerWorkerReworkResultsDir,
  schedulerWorkerReworkAuditMarkdownPath,
  schedulerWorkerReworkAuditPath,
  schedulerWorkerReworkAuditsDir,
  schedulerWorkerReworkValidationMarkdownPath,
  schedulerWorkerReworkValidationPath,
  schedulerWorkerReworkValidationsDir,
  schedulerWorkerReworkStartMarkdownPath,
  schedulerWorkerReworkStartPath,
  schedulerWorkerReworkStartsDir,
  schedulerWorkerStartMarkdownPath,
  schedulerWorkerStartPath,
  schedulerWorkerStartsDir,
  schedulerWorkerValidationMarkdownPath,
  schedulerWorkerValidationPath,
  schedulerWorkerValidationsDir,
} from "./paths.js";
import { renderSchedulerControlledStepEvidenceMarkdown, renderSchedulerIntegrationCandidateMarkdown, renderSchedulerIntegrationCheckHandoffMarkdown, renderSchedulerIntegrationOutcomeMarkdown, renderSchedulerReconcileSnapshotMarkdown, renderSchedulerRunBlockedCloseoutMarkdown, renderSchedulerRunCompletionMarkdown, renderSchedulerRuntimeClaimReservationMarkdown, renderSchedulerRuntimeStateMarkdown, renderSchedulerRuntimeWorkerAuditMarkdown, renderSchedulerRuntimeWorkerResultMarkdown, renderSchedulerRuntimeWorkerReworkAuditMarkdown, renderSchedulerRuntimeWorkerReworkPlanMarkdown, renderSchedulerRuntimeWorkerReworkResultMarkdown, renderSchedulerRuntimeWorkerReworkStartMarkdown, renderSchedulerRuntimeWorkerReworkValidationMarkdown, renderSchedulerRuntimeWorkerStartMarkdown, renderSchedulerRuntimeWorkerValidationMarkdown } from "./rendering.js";
import { schedulerControlledStepEvidenceSchema, schedulerIntegrationCandidateSchema, schedulerIntegrationCheckHandoffSchema, schedulerIntegrationOutcomeSchema, schedulerReconcileSnapshotSchema, schedulerRunBlockedCloseoutSchema, schedulerRunCompletionSchema, schedulerRuntimeClaimReservationSchema, schedulerRuntimeEventSchema, schedulerRuntimeStateSchema, schedulerRuntimeWorkerAuditSchema, schedulerRuntimeWorkerResultSchema, schedulerRuntimeWorkerReworkAuditSchema, schedulerRuntimeWorkerReworkPlanSchema, schedulerRuntimeWorkerReworkResultSchema, schedulerRuntimeWorkerReworkStartSchema, schedulerRuntimeWorkerReworkValidationSchema, schedulerRuntimeWorkerStartSchema, schedulerRuntimeWorkerValidationSchema } from "./schemas.js";
import type { SchedulerControlledStepEvidence, SchedulerIntegrationCandidate, SchedulerIntegrationCheckHandoff, SchedulerIntegrationOutcome, SchedulerReconcileSnapshot, SchedulerRunBlockedCloseout, SchedulerRunCompletion, SchedulerRuntimeClaimReservation, SchedulerRuntimeEvent, SchedulerRuntimeEventType, SchedulerRuntimeState, SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerResult, SchedulerRuntimeWorkerReworkAudit, SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkStart, SchedulerRuntimeWorkerReworkValidation, SchedulerRuntimeWorkerStart, SchedulerRuntimeWorkerValidation } from "./types.js";

export function schedulerRuntimeArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string): { artifact: string; eventsArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerRuntimeStatePath(memory, changePath, schedulerRunId)),
    eventsArtifact: displayArtifactPath(memory, schedulerRuntimeEventsPath(memory, changePath, schedulerRunId)),
  };
}

export function schedulerControlledStepArtifactRefs(memory: ResolvedMemory, changePath: string, stepId: string, schedulerRunId?: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerControlledStepPath(memory, changePath, stepId, schedulerRunId)),
    markdownArtifact: displayArtifactPath(memory, schedulerControlledStepMarkdownPath(memory, changePath, stepId, schedulerRunId)),
  };
}

export function schedulerReconcileSnapshotArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, snapshotId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerReconcileSnapshotPath(memory, changePath, schedulerRunId, snapshotId)),
    markdownArtifact: displayArtifactPath(memory, schedulerReconcileSnapshotMarkdownPath(memory, changePath, schedulerRunId, snapshotId)),
  };
}

export function schedulerClaimReservationArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerClaimReservationPath(memory, changePath, schedulerRunId, reservationId)),
    markdownArtifact: displayArtifactPath(memory, schedulerClaimReservationMarkdownPath(memory, changePath, schedulerRunId, reservationId)),
  };
}

export function schedulerWorkerStartArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerStartId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerStartPath(memory, changePath, schedulerRunId, workerStartId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerStartMarkdownPath(memory, changePath, schedulerRunId, workerStartId)),
  };
}

export function schedulerWorkerResultArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerResultId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerResultPath(memory, changePath, schedulerRunId, workerResultId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerResultMarkdownPath(memory, changePath, schedulerRunId, workerResultId)),
  };
}

export function schedulerWorkerValidationArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerValidationId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerValidationPath(memory, changePath, schedulerRunId, workerValidationId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerValidationMarkdownPath(memory, changePath, schedulerRunId, workerValidationId)),
  };
}

export function schedulerWorkerAuditArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerAuditId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerAuditPath(memory, changePath, schedulerRunId, workerAuditId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerAuditMarkdownPath(memory, changePath, schedulerRunId, workerAuditId)),
  };
}

export function schedulerWorkerReworkPlanArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkPlanId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerReworkPlanPath(memory, changePath, schedulerRunId, reworkPlanId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerReworkPlanMarkdownPath(memory, changePath, schedulerRunId, reworkPlanId)),
  };
}

export function schedulerWorkerReworkStartArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkStartId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerReworkStartPath(memory, changePath, schedulerRunId, reworkStartId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerReworkStartMarkdownPath(memory, changePath, schedulerRunId, reworkStartId)),
  };
}

export function schedulerWorkerReworkResultArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkResultId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerReworkResultPath(memory, changePath, schedulerRunId, reworkResultId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerReworkResultMarkdownPath(memory, changePath, schedulerRunId, reworkResultId)),
  };
}

export function schedulerWorkerReworkValidationArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkValidationId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerReworkValidationPath(memory, changePath, schedulerRunId, reworkValidationId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerReworkValidationMarkdownPath(memory, changePath, schedulerRunId, reworkValidationId)),
  };
}

export function schedulerWorkerReworkAuditArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkAuditId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerWorkerReworkAuditPath(memory, changePath, schedulerRunId, reworkAuditId)),
    markdownArtifact: displayArtifactPath(memory, schedulerWorkerReworkAuditMarkdownPath(memory, changePath, schedulerRunId, reworkAuditId)),
  };
}

export function schedulerIntegrationCandidateArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, candidateId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerIntegrationCandidatePath(memory, changePath, schedulerRunId, candidateId)),
    markdownArtifact: displayArtifactPath(memory, schedulerIntegrationCandidateMarkdownPath(memory, changePath, schedulerRunId, candidateId)),
  };
}

export function schedulerIntegrationCheckHandoffArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, handoffId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerIntegrationCheckHandoffPath(memory, changePath, schedulerRunId, handoffId)),
    markdownArtifact: displayArtifactPath(memory, schedulerIntegrationCheckHandoffMarkdownPath(memory, changePath, schedulerRunId, handoffId)),
  };
}

export function schedulerIntegrationOutcomeArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, outcomeId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerIntegrationOutcomePath(memory, changePath, schedulerRunId, outcomeId)),
    markdownArtifact: displayArtifactPath(memory, schedulerIntegrationOutcomeMarkdownPath(memory, changePath, schedulerRunId, outcomeId)),
  };
}

export function schedulerRunCompletionArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, completionId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerRunCompletionPath(memory, changePath, schedulerRunId, completionId)),
    markdownArtifact: displayArtifactPath(memory, schedulerRunCompletionMarkdownPath(memory, changePath, schedulerRunId, completionId)),
  };
}

export function schedulerRunBlockedCloseoutArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string, closeoutId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerRunBlockedCloseoutPath(memory, changePath, schedulerRunId, closeoutId)),
    markdownArtifact: displayArtifactPath(memory, schedulerRunBlockedCloseoutMarkdownPath(memory, changePath, schedulerRunId, closeoutId)),
  };
}

export async function writeSchedulerRuntimeState(memory: ResolvedMemory, changePath: string, state: SchedulerRuntimeState): Promise<void> {
  await assertChangePathScope(memory, changePath, state.changeId, `SchedulerRuntimeState ${state.id}`);
  await mkdir(schedulerRuntimeDir(memory, changePath, state.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerRuntimeStatePath(memory, changePath, state.schedulerRunId), state);
  await writeFile(join(schedulerRuntimeDir(memory, changePath, state.schedulerRunId), "scheduler-runtime-state.md"), renderSchedulerRuntimeStateMarkdown(state), "utf8");
}

export async function readSchedulerRuntimeState(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeState> {
  const state = await readRequiredJsonFile(schedulerRuntimeStatePath(memory, changePath, schedulerRunId), schedulerRuntimeStateSchema);
  await assertChangePathScope(memory, changePath, state.changeId, `SchedulerRuntimeState ${state.id}`);
  if (state.schedulerRunId !== schedulerRunId) throw new Error("SchedulerRuntimeState schedulerRunId mismatch.");
  return state;
}

export async function readSchedulerRuntimeStateProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeState | null> {
  try {
    return await readSchedulerRuntimeState(memory, changePath, schedulerRunId);
  } catch {
    return null;
  }
}

export async function appendSchedulerRuntimeEvent(
  memory: ResolvedMemory,
  changePath: string,
  run: SchedulerRun,
  type: SchedulerRuntimeEventType,
  input: Partial<SchedulerRuntimeEvent> = {},
): Promise<SchedulerRuntimeEvent> {
  await assertChangePathScope(memory, changePath, run.changeId, `SchedulerRuntimeEvent ${run.id}`);
  const now = new Date().toISOString();
  const event: SchedulerRuntimeEvent = {
    version: "1.0",
    id: `scheduler-runtime-event-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${type}:${now}:${Math.random()}`).slice(0, 8)}`,
    schedulerRunId: run.id,
    changeId: run.changeId,
    type,
    timestamp: now,
    status: input.status,
    summary: input.summary,
    artifactRefs: input.artifactRefs,
    payload: input.payload,
  };
  schedulerRuntimeEventSchema.parse(event);
  await mkdir(schedulerRuntimeDir(memory, changePath, run.id), { recursive: true });
  await appendFile(schedulerRuntimeEventsPath(memory, changePath, run.id), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readSchedulerRuntimeEvents(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeEvent[]> {
  const state = await readSchedulerRuntimeState(memory, changePath, schedulerRunId);
  const path = schedulerRuntimeEventsPath(memory, changePath, state.schedulerRunId);
  if (!existsSync(path)) return [];
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const event = schedulerRuntimeEventSchema.parse(JSON.parse(line));
    if (event.changeId !== state.changeId || event.schedulerRunId !== state.schedulerRunId) {
      throw new Error("SchedulerRuntimeEvent scope mismatch.");
    }
    return event;
  });
}

export async function writeSchedulerControlledStepEvidence(memory: ResolvedMemory, changePath: string, step: SchedulerControlledStepEvidence): Promise<void> {
  await assertChangePathScope(memory, changePath, step.changeId, `SchedulerControlledStepEvidence ${step.id}`);
  if (step.schedulerRunId && step.targetScope.schedulerRunId !== step.schedulerRunId) {
    throw new Error("SchedulerControlledStepEvidence schedulerRunId scope mismatch.");
  }
  await mkdir(schedulerControlledStepsDir(memory, changePath, step.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerControlledStepPath(memory, changePath, step.id, step.schedulerRunId), step);
  await writeFile(schedulerControlledStepMarkdownPath(memory, changePath, step.id, step.schedulerRunId), renderSchedulerControlledStepEvidenceMarkdown(step), "utf8");
}

export async function readSchedulerControlledStepEvidence(memory: ResolvedMemory, changePath: string, stepId: string, schedulerRunId?: string): Promise<SchedulerControlledStepEvidence> {
  const step = await readRequiredJsonFile(schedulerControlledStepPath(memory, changePath, stepId, schedulerRunId), schedulerControlledStepEvidenceSchema);
  await assertChangePathScope(memory, changePath, step.changeId, `SchedulerControlledStepEvidence ${step.id}`);
  if (step.id !== stepId) throw new Error("SchedulerControlledStepEvidence id mismatch.");
  if ((step.schedulerRunId ?? undefined) !== (schedulerRunId ?? undefined)) throw new Error("SchedulerControlledStepEvidence schedulerRunId scope mismatch.");
  if (step.targetScope.changeId !== step.changeId) throw new Error("SchedulerControlledStepEvidence change target mismatch.");
  if (step.schedulerRunId && step.targetScope.schedulerRunId !== step.schedulerRunId) throw new Error("SchedulerControlledStepEvidence scheduler target mismatch.");
  return step;
}

export async function readSchedulerControlledStepEvidenceProjection(memory: ResolvedMemory, changePath: string, stepId: string, schedulerRunId?: string): Promise<SchedulerControlledStepEvidence | null> {
  try {
    return await readSchedulerControlledStepEvidence(memory, changePath, stepId, schedulerRunId);
  } catch {
    return null;
  }
}

export async function listSchedulerControlledStepEvidence(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<SchedulerControlledStepEvidence[]> {
  const dir = schedulerControlledStepsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const steps: SchedulerControlledStepEvidence[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const step = await readSchedulerControlledStepEvidenceProjection(memory, changePath, entry.name.replace(/\.json$/, ""), schedulerRunId);
    if (step) steps.push(step);
  }
  return steps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSchedulerControlledStepEvidenceStrict(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<SchedulerControlledStepEvidence[]> {
  const dir = schedulerControlledStepsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const steps: SchedulerControlledStepEvidence[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    steps.push(await readSchedulerControlledStepEvidence(memory, changePath, entry.name.replace(/\.json$/, ""), schedulerRunId));
  }
  return steps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readLatestSchedulerControlledStepEvidenceProjection(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<SchedulerControlledStepEvidence | null> {
  return (await listSchedulerControlledStepEvidence(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function readLatestSchedulerControlledStepEvidenceStrict(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<SchedulerControlledStepEvidence | null> {
  return (await listSchedulerControlledStepEvidenceStrict(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function writeSchedulerReconcileSnapshot(memory: ResolvedMemory, changePath: string, snapshot: SchedulerReconcileSnapshot): Promise<void> {
  await assertChangePathScope(memory, changePath, snapshot.changeId, `SchedulerReconcileSnapshot ${snapshot.id}`);
  await mkdir(schedulerRuntimeDir(memory, changePath, snapshot.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerReconcileSnapshotPath(memory, changePath, snapshot.schedulerRunId, snapshot.id), snapshot);
  await writeFile(schedulerReconcileSnapshotMarkdownPath(memory, changePath, snapshot.schedulerRunId, snapshot.id), renderSchedulerReconcileSnapshotMarkdown(snapshot), "utf8");
}

export async function readSchedulerReconcileSnapshot(memory: ResolvedMemory, changePath: string, schedulerRunId: string, snapshotId: string): Promise<SchedulerReconcileSnapshot> {
  const snapshot = await readRequiredJsonFile(schedulerReconcileSnapshotPath(memory, changePath, schedulerRunId, snapshotId), schedulerReconcileSnapshotSchema);
  await assertChangePathScope(memory, changePath, snapshot.changeId, `SchedulerReconcileSnapshot ${snapshot.id}`);
  if (snapshot.schedulerRunId !== schedulerRunId || snapshot.id !== snapshotId) throw new Error("SchedulerReconcileSnapshot scope mismatch.");
  return snapshot;
}

export async function readSchedulerReconcileSnapshotProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, snapshotId: string): Promise<SchedulerReconcileSnapshot | null> {
  try {
    return await readSchedulerReconcileSnapshot(memory, changePath, schedulerRunId, snapshotId);
  } catch {
    return null;
  }
}

export async function readSchedulerReconcileSnapshotByIdProjection(memory: ResolvedMemory, changePath: string, snapshotId: string): Promise<SchedulerReconcileSnapshot | null> {
  const runsDir = schedulerRunsDir(memory, changePath);
  if (!existsSync(runsDir)) return null;
  const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const snapshot = await readSchedulerReconcileSnapshotProjection(memory, changePath, entry.name, snapshotId);
    if (snapshot) return snapshot;
  }
  return null;
}

export async function writeSchedulerRuntimeClaimReservation(memory: ResolvedMemory, changePath: string, reservation: SchedulerRuntimeClaimReservation): Promise<void> {
  await assertChangePathScope(memory, changePath, reservation.changeId, `SchedulerRuntimeClaimReservation ${reservation.id}`);
  await mkdir(schedulerClaimReservationsDir(memory, changePath, reservation.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerClaimReservationPath(memory, changePath, reservation.schedulerRunId, reservation.id), reservation);
  await writeFile(schedulerClaimReservationMarkdownPath(memory, changePath, reservation.schedulerRunId, reservation.id), renderSchedulerRuntimeClaimReservationMarkdown(reservation), "utf8");
}

export async function readSchedulerRuntimeClaimReservation(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): Promise<SchedulerRuntimeClaimReservation> {
  const reservation = await readRequiredJsonFile(schedulerClaimReservationPath(memory, changePath, schedulerRunId, reservationId), schedulerRuntimeClaimReservationSchema);
  await assertChangePathScope(memory, changePath, reservation.changeId, `SchedulerRuntimeClaimReservation ${reservation.id}`);
  if (reservation.schedulerRunId !== schedulerRunId || reservation.id !== reservationId) throw new Error("SchedulerRuntimeClaimReservation scope mismatch.");
  return reservation;
}

export async function readSchedulerRuntimeClaimReservationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): Promise<SchedulerRuntimeClaimReservation | null> {
  try {
    return await readSchedulerRuntimeClaimReservation(memory, changePath, schedulerRunId, reservationId);
  } catch {
    return null;
  }
}

export async function findSchedulerClaimReservationForSnapshot(memory: ResolvedMemory, changePath: string, schedulerRunId: string, snapshotId: string): Promise<SchedulerRuntimeClaimReservation | null> {
  const dir = schedulerClaimReservationsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const reservationId = entry.name.replace(/\.json$/, "");
    const reservation = await readSchedulerRuntimeClaimReservationProjection(memory, changePath, schedulerRunId, reservationId);
    if (reservation?.schedulerReconcileSnapshotId === snapshotId) return reservation;
  }
  return null;
}

export async function writeSchedulerRuntimeWorkerStart(memory: ResolvedMemory, changePath: string, workerStart: SchedulerRuntimeWorkerStart): Promise<void> {
  await assertChangePathScope(memory, changePath, workerStart.changeId, `SchedulerRuntimeWorkerStart ${workerStart.id}`);
  await mkdir(schedulerWorkerStartsDir(memory, changePath, workerStart.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerStartPath(memory, changePath, workerStart.schedulerRunId, workerStart.id), workerStart);
  await writeFile(schedulerWorkerStartMarkdownPath(memory, changePath, workerStart.schedulerRunId, workerStart.id), renderSchedulerRuntimeWorkerStartMarkdown(workerStart), "utf8");
}

export async function readSchedulerRuntimeWorkerStart(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerStartId: string): Promise<SchedulerRuntimeWorkerStart> {
  const workerStart = await readRequiredJsonFile(schedulerWorkerStartPath(memory, changePath, schedulerRunId, workerStartId), schedulerRuntimeWorkerStartSchema);
  await assertChangePathScope(memory, changePath, workerStart.changeId, `SchedulerRuntimeWorkerStart ${workerStart.id}`);
  if (workerStart.schedulerRunId !== schedulerRunId || workerStart.id !== workerStartId) throw new Error("SchedulerRuntimeWorkerStart scope mismatch.");
  return workerStart;
}

export async function readSchedulerRuntimeWorkerStartProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerStartId: string): Promise<SchedulerRuntimeWorkerStart | null> {
  try {
    return await readSchedulerRuntimeWorkerStart(memory, changePath, schedulerRunId, workerStartId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerStartForReservationIntent(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationIntentId: string): Promise<SchedulerRuntimeWorkerStart | null> {
  const dir = schedulerWorkerStartsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const workerStartId = entry.name.replace(/\.json$/, "");
    const workerStart = await readSchedulerRuntimeWorkerStartProjection(memory, changePath, schedulerRunId, workerStartId);
    if (workerStart?.reservationIntentId === reservationIntentId) return workerStart;
  }
  return null;
}

export async function listSchedulerRuntimeWorkerStarts(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeWorkerStart[]> {
  const dir = schedulerWorkerStartsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const starts: SchedulerRuntimeWorkerStart[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const workerStart = await readSchedulerRuntimeWorkerStartProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (workerStart) starts.push(workerStart);
  }
  return starts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeSchedulerRuntimeWorkerResult(memory: ResolvedMemory, changePath: string, result: SchedulerRuntimeWorkerResult): Promise<void> {
  await assertChangePathScope(memory, changePath, result.changeId, `SchedulerRuntimeWorkerResult ${result.id}`);
  await mkdir(schedulerWorkerResultsDir(memory, changePath, result.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerResultPath(memory, changePath, result.schedulerRunId, result.id), result);
  await writeFile(schedulerWorkerResultMarkdownPath(memory, changePath, result.schedulerRunId, result.id), renderSchedulerRuntimeWorkerResultMarkdown(result), "utf8");
}

export async function readSchedulerRuntimeWorkerResult(memory: ResolvedMemory, changePath: string, schedulerRunId: string, resultId: string): Promise<SchedulerRuntimeWorkerResult> {
  const result = await readRequiredJsonFile(schedulerWorkerResultPath(memory, changePath, schedulerRunId, resultId), schedulerRuntimeWorkerResultSchema);
  await assertChangePathScope(memory, changePath, result.changeId, `SchedulerRuntimeWorkerResult ${result.id}`);
  if (result.schedulerRunId !== schedulerRunId || result.id !== resultId) throw new Error("SchedulerRuntimeWorkerResult scope mismatch.");
  return result;
}

export async function readSchedulerRuntimeWorkerResultProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, resultId: string): Promise<SchedulerRuntimeWorkerResult | null> {
  try {
    return await readSchedulerRuntimeWorkerResult(memory, changePath, schedulerRunId, resultId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerResultForStart(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerStartId: string): Promise<SchedulerRuntimeWorkerResult | null> {
  const dir = schedulerWorkerResultsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const result = await readSchedulerRuntimeWorkerResultProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (result?.schedulerWorkerStartId === workerStartId) return result;
  }
  return null;
}

export async function writeSchedulerRuntimeWorkerValidation(memory: ResolvedMemory, changePath: string, validation: SchedulerRuntimeWorkerValidation): Promise<void> {
  await assertChangePathScope(memory, changePath, validation.changeId, `SchedulerRuntimeWorkerValidation ${validation.id}`);
  await mkdir(schedulerWorkerValidationsDir(memory, changePath, validation.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerValidationPath(memory, changePath, validation.schedulerRunId, validation.id), validation);
  await writeFile(schedulerWorkerValidationMarkdownPath(memory, changePath, validation.schedulerRunId, validation.id), renderSchedulerRuntimeWorkerValidationMarkdown(validation), "utf8");
}

export async function readSchedulerRuntimeWorkerValidation(memory: ResolvedMemory, changePath: string, schedulerRunId: string, validationId: string): Promise<SchedulerRuntimeWorkerValidation> {
  const validation = await readRequiredJsonFile(schedulerWorkerValidationPath(memory, changePath, schedulerRunId, validationId), schedulerRuntimeWorkerValidationSchema);
  await assertChangePathScope(memory, changePath, validation.changeId, `SchedulerRuntimeWorkerValidation ${validation.id}`);
  if (validation.schedulerRunId !== schedulerRunId || validation.id !== validationId) throw new Error("SchedulerRuntimeWorkerValidation scope mismatch.");
  return validation;
}

export async function readSchedulerRuntimeWorkerValidationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, validationId: string): Promise<SchedulerRuntimeWorkerValidation | null> {
  try {
    return await readSchedulerRuntimeWorkerValidation(memory, changePath, schedulerRunId, validationId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerValidationForResult(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerResultId: string): Promise<SchedulerRuntimeWorkerValidation | null> {
  const dir = schedulerWorkerValidationsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const validation = await readSchedulerRuntimeWorkerValidationProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (validation?.schedulerWorkerResultId === workerResultId) return validation;
  }
  return null;
}

export async function writeSchedulerRuntimeWorkerAudit(memory: ResolvedMemory, changePath: string, audit: SchedulerRuntimeWorkerAudit): Promise<void> {
  await assertChangePathScope(memory, changePath, audit.changeId, `SchedulerRuntimeWorkerAudit ${audit.id}`);
  await mkdir(schedulerWorkerAuditsDir(memory, changePath, audit.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerAuditPath(memory, changePath, audit.schedulerRunId, audit.id), audit);
  await writeFile(schedulerWorkerAuditMarkdownPath(memory, changePath, audit.schedulerRunId, audit.id), renderSchedulerRuntimeWorkerAuditMarkdown(audit), "utf8");
}

export async function readSchedulerRuntimeWorkerAudit(memory: ResolvedMemory, changePath: string, schedulerRunId: string, auditId: string): Promise<SchedulerRuntimeWorkerAudit> {
  const audit = await readRequiredJsonFile(schedulerWorkerAuditPath(memory, changePath, schedulerRunId, auditId), schedulerRuntimeWorkerAuditSchema);
  await assertChangePathScope(memory, changePath, audit.changeId, `SchedulerRuntimeWorkerAudit ${audit.id}`);
  if (audit.schedulerRunId !== schedulerRunId || audit.id !== auditId) throw new Error("SchedulerRuntimeWorkerAudit scope mismatch.");
  return audit;
}

export async function readSchedulerRuntimeWorkerAuditProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, auditId: string): Promise<SchedulerRuntimeWorkerAudit | null> {
  try {
    return await readSchedulerRuntimeWorkerAudit(memory, changePath, schedulerRunId, auditId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerAuditForValidation(memory: ResolvedMemory, changePath: string, schedulerRunId: string, workerValidationId: string): Promise<SchedulerRuntimeWorkerAudit | null> {
  const dir = schedulerWorkerAuditsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const audit = await readSchedulerRuntimeWorkerAuditProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (audit?.schedulerWorkerValidationId === workerValidationId) return audit;
  }
  return null;
}

export async function listSchedulerRuntimeWorkerAudits(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeWorkerAudit[]> {
  const dir = schedulerWorkerAuditsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const audits: SchedulerRuntimeWorkerAudit[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const audit = await readSchedulerRuntimeWorkerAuditProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (audit) audits.push(audit);
  }
  return audits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeSchedulerRuntimeWorkerReworkPlan(memory: ResolvedMemory, changePath: string, plan: SchedulerRuntimeWorkerReworkPlan): Promise<void> {
  await assertChangePathScope(memory, changePath, plan.changeId, `SchedulerRuntimeWorkerReworkPlan ${plan.id}`);
  await mkdir(schedulerWorkerReworkPlansDir(memory, changePath, plan.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerReworkPlanPath(memory, changePath, plan.schedulerRunId, plan.id), plan);
  await writeFile(schedulerWorkerReworkPlanMarkdownPath(memory, changePath, plan.schedulerRunId, plan.id), renderSchedulerRuntimeWorkerReworkPlanMarkdown(plan), "utf8");
}

export async function readSchedulerRuntimeWorkerReworkPlan(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkPlanId: string): Promise<SchedulerRuntimeWorkerReworkPlan> {
  const plan = await readRequiredJsonFile(schedulerWorkerReworkPlanPath(memory, changePath, schedulerRunId, reworkPlanId), schedulerRuntimeWorkerReworkPlanSchema);
  await assertChangePathScope(memory, changePath, plan.changeId, `SchedulerRuntimeWorkerReworkPlan ${plan.id}`);
  if (plan.schedulerRunId !== schedulerRunId || plan.id !== reworkPlanId) throw new Error("SchedulerRuntimeWorkerReworkPlan scope mismatch.");
  return plan;
}

export async function readSchedulerRuntimeWorkerReworkPlanProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkPlanId: string): Promise<SchedulerRuntimeWorkerReworkPlan | null> {
  try {
    return await readSchedulerRuntimeWorkerReworkPlan(memory, changePath, schedulerRunId, reworkPlanId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId: string,
  input: { workerValidationId: string; workerAuditId?: string },
): Promise<SchedulerRuntimeWorkerReworkPlan | null> {
  const dir = schedulerWorkerReworkPlansDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const plan = await readSchedulerRuntimeWorkerReworkPlanProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (!plan) continue;
    if (plan.schedulerWorkerValidationId !== input.workerValidationId) continue;
    if ((plan.schedulerWorkerAuditId ?? undefined) !== (input.workerAuditId ?? undefined)) continue;
    return plan;
  }
  return null;
}

export async function writeSchedulerRuntimeWorkerReworkStart(memory: ResolvedMemory, changePath: string, start: SchedulerRuntimeWorkerReworkStart): Promise<void> {
  await assertChangePathScope(memory, changePath, start.changeId, `SchedulerRuntimeWorkerReworkStart ${start.id}`);
  await mkdir(schedulerWorkerReworkStartsDir(memory, changePath, start.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerReworkStartPath(memory, changePath, start.schedulerRunId, start.id), start);
  await writeFile(schedulerWorkerReworkStartMarkdownPath(memory, changePath, start.schedulerRunId, start.id), renderSchedulerRuntimeWorkerReworkStartMarkdown(start), "utf8");
}

export async function readSchedulerRuntimeWorkerReworkStart(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkStartId: string): Promise<SchedulerRuntimeWorkerReworkStart> {
  const start = await readRequiredJsonFile(schedulerWorkerReworkStartPath(memory, changePath, schedulerRunId, reworkStartId), schedulerRuntimeWorkerReworkStartSchema);
  await assertChangePathScope(memory, changePath, start.changeId, `SchedulerRuntimeWorkerReworkStart ${start.id}`);
  if (start.schedulerRunId !== schedulerRunId || start.id !== reworkStartId) throw new Error("SchedulerRuntimeWorkerReworkStart scope mismatch.");
  return start;
}

export async function readSchedulerRuntimeWorkerReworkStartProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkStartId: string): Promise<SchedulerRuntimeWorkerReworkStart | null> {
  try {
    return await readSchedulerRuntimeWorkerReworkStart(memory, changePath, schedulerRunId, reworkStartId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerReworkStartForPlan(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkPlanId: string): Promise<SchedulerRuntimeWorkerReworkStart | null> {
  const dir = schedulerWorkerReworkStartsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const start = await readSchedulerRuntimeWorkerReworkStartProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (start?.schedulerWorkerReworkPlanId === reworkPlanId) return start;
  }
  return null;
}

export async function listSchedulerRuntimeWorkerReworkStarts(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeWorkerReworkStart[]> {
  const dir = schedulerWorkerReworkStartsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const starts: SchedulerRuntimeWorkerReworkStart[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const start = await readSchedulerRuntimeWorkerReworkStartProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (start) starts.push(start);
  }
  return starts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeSchedulerRuntimeWorkerReworkResult(memory: ResolvedMemory, changePath: string, result: SchedulerRuntimeWorkerReworkResult): Promise<void> {
  await assertChangePathScope(memory, changePath, result.changeId, `SchedulerRuntimeWorkerReworkResult ${result.id}`);
  await mkdir(schedulerWorkerReworkResultsDir(memory, changePath, result.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerReworkResultPath(memory, changePath, result.schedulerRunId, result.id), result);
  await writeFile(schedulerWorkerReworkResultMarkdownPath(memory, changePath, result.schedulerRunId, result.id), renderSchedulerRuntimeWorkerReworkResultMarkdown(result), "utf8");
}

export async function readSchedulerRuntimeWorkerReworkResult(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkResultId: string): Promise<SchedulerRuntimeWorkerReworkResult> {
  const result = await readRequiredJsonFile(schedulerWorkerReworkResultPath(memory, changePath, schedulerRunId, reworkResultId), schedulerRuntimeWorkerReworkResultSchema);
  await assertChangePathScope(memory, changePath, result.changeId, `SchedulerRuntimeWorkerReworkResult ${result.id}`);
  if (result.schedulerRunId !== schedulerRunId || result.id !== reworkResultId) throw new Error("SchedulerRuntimeWorkerReworkResult scope mismatch.");
  return result;
}

export async function readSchedulerRuntimeWorkerReworkResultProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkResultId: string): Promise<SchedulerRuntimeWorkerReworkResult | null> {
  try {
    return await readSchedulerRuntimeWorkerReworkResult(memory, changePath, schedulerRunId, reworkResultId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerReworkResultForStart(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkStartId: string): Promise<SchedulerRuntimeWorkerReworkResult | null> {
  const dir = schedulerWorkerReworkResultsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const result = await readSchedulerRuntimeWorkerReworkResultProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (result?.schedulerWorkerReworkStartId === reworkStartId) return result;
  }
  return null;
}

export async function writeSchedulerRuntimeWorkerReworkValidation(memory: ResolvedMemory, changePath: string, validation: SchedulerRuntimeWorkerReworkValidation): Promise<void> {
  await assertChangePathScope(memory, changePath, validation.changeId, `SchedulerRuntimeWorkerReworkValidation ${validation.id}`);
  await mkdir(schedulerWorkerReworkValidationsDir(memory, changePath, validation.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerReworkValidationPath(memory, changePath, validation.schedulerRunId, validation.id), validation);
  await writeFile(schedulerWorkerReworkValidationMarkdownPath(memory, changePath, validation.schedulerRunId, validation.id), renderSchedulerRuntimeWorkerReworkValidationMarkdown(validation), "utf8");
}

export async function readSchedulerRuntimeWorkerReworkValidation(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkValidationId: string): Promise<SchedulerRuntimeWorkerReworkValidation> {
  const validation = await readRequiredJsonFile(schedulerWorkerReworkValidationPath(memory, changePath, schedulerRunId, reworkValidationId), schedulerRuntimeWorkerReworkValidationSchema);
  await assertChangePathScope(memory, changePath, validation.changeId, `SchedulerRuntimeWorkerReworkValidation ${validation.id}`);
  if (validation.schedulerRunId !== schedulerRunId || validation.id !== reworkValidationId) throw new Error("SchedulerRuntimeWorkerReworkValidation scope mismatch.");
  return validation;
}

export async function readSchedulerRuntimeWorkerReworkValidationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkValidationId: string): Promise<SchedulerRuntimeWorkerReworkValidation | null> {
  try {
    return await readSchedulerRuntimeWorkerReworkValidation(memory, changePath, schedulerRunId, reworkValidationId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerReworkValidationForResult(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkResultId: string): Promise<SchedulerRuntimeWorkerReworkValidation | null> {
  const dir = schedulerWorkerReworkValidationsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const validation = await readSchedulerRuntimeWorkerReworkValidationProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (validation?.schedulerWorkerReworkResultId === reworkResultId) return validation;
  }
  return null;
}

export async function writeSchedulerRuntimeWorkerReworkAudit(memory: ResolvedMemory, changePath: string, audit: SchedulerRuntimeWorkerReworkAudit): Promise<void> {
  await assertChangePathScope(memory, changePath, audit.changeId, `SchedulerRuntimeWorkerReworkAudit ${audit.id}`);
  await mkdir(schedulerWorkerReworkAuditsDir(memory, changePath, audit.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerWorkerReworkAuditPath(memory, changePath, audit.schedulerRunId, audit.id), audit);
  await writeFile(schedulerWorkerReworkAuditMarkdownPath(memory, changePath, audit.schedulerRunId, audit.id), renderSchedulerRuntimeWorkerReworkAuditMarkdown(audit), "utf8");
}

export async function readSchedulerRuntimeWorkerReworkAudit(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkAuditId: string): Promise<SchedulerRuntimeWorkerReworkAudit> {
  const audit = await readRequiredJsonFile(schedulerWorkerReworkAuditPath(memory, changePath, schedulerRunId, reworkAuditId), schedulerRuntimeWorkerReworkAuditSchema);
  await assertChangePathScope(memory, changePath, audit.changeId, `SchedulerRuntimeWorkerReworkAudit ${audit.id}`);
  if (audit.schedulerRunId !== schedulerRunId || audit.id !== reworkAuditId) throw new Error("SchedulerRuntimeWorkerReworkAudit scope mismatch.");
  return audit;
}

export async function readSchedulerRuntimeWorkerReworkAuditProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkAuditId: string): Promise<SchedulerRuntimeWorkerReworkAudit | null> {
  try {
    return await readSchedulerRuntimeWorkerReworkAudit(memory, changePath, schedulerRunId, reworkAuditId);
  } catch {
    return null;
  }
}

export async function findSchedulerRuntimeWorkerReworkAuditForValidation(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkValidationId: string): Promise<SchedulerRuntimeWorkerReworkAudit | null> {
  const dir = schedulerWorkerReworkAuditsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const audit = await readSchedulerRuntimeWorkerReworkAuditProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (audit?.schedulerWorkerReworkValidationId === reworkValidationId) return audit;
  }
  return null;
}

export async function listSchedulerRuntimeWorkerReworkAudits(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeWorkerReworkAudit[]> {
  const dir = schedulerWorkerReworkAuditsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const audits: SchedulerRuntimeWorkerReworkAudit[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const audit = await readSchedulerRuntimeWorkerReworkAuditProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (audit) audits.push(audit);
  }
  return audits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeSchedulerIntegrationCandidate(memory: ResolvedMemory, changePath: string, candidate: SchedulerIntegrationCandidate): Promise<void> {
  await assertChangePathScope(memory, changePath, candidate.changeId, `SchedulerIntegrationCandidate ${candidate.id}`);
  await mkdir(schedulerIntegrationCandidatesDir(memory, changePath, candidate.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerIntegrationCandidatePath(memory, changePath, candidate.schedulerRunId, candidate.id), candidate);
  await writeFile(schedulerIntegrationCandidateMarkdownPath(memory, changePath, candidate.schedulerRunId, candidate.id), renderSchedulerIntegrationCandidateMarkdown(candidate), "utf8");
}

export async function readSchedulerIntegrationCandidate(memory: ResolvedMemory, changePath: string, schedulerRunId: string, candidateId: string): Promise<SchedulerIntegrationCandidate> {
  const candidate = await readRequiredJsonFile(schedulerIntegrationCandidatePath(memory, changePath, schedulerRunId, candidateId), schedulerIntegrationCandidateSchema);
  await assertChangePathScope(memory, changePath, candidate.changeId, `SchedulerIntegrationCandidate ${candidate.id}`);
  if (candidate.schedulerRunId !== schedulerRunId || candidate.id !== candidateId) throw new Error("SchedulerIntegrationCandidate scope mismatch.");
  return candidate;
}

export async function readSchedulerIntegrationCandidateProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, candidateId: string): Promise<SchedulerIntegrationCandidate | null> {
  try {
    return await readSchedulerIntegrationCandidate(memory, changePath, schedulerRunId, candidateId);
  } catch {
    return null;
  }
}

export async function listSchedulerIntegrationCandidates(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCandidate[]> {
  const dir = schedulerIntegrationCandidatesDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const candidates: SchedulerIntegrationCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const candidate = await readSchedulerIntegrationCandidateProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSchedulerIntegrationCandidatesStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCandidate[]> {
  const dir = schedulerIntegrationCandidatesDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const candidates: SchedulerIntegrationCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    candidates.push(await readSchedulerIntegrationCandidate(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, "")));
  }
  return candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readLatestSchedulerIntegrationCandidateProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCandidate | null> {
  return (await listSchedulerIntegrationCandidates(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function readLatestSchedulerIntegrationCandidateStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCandidate | null> {
  return (await listSchedulerIntegrationCandidatesStrict(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function writeSchedulerIntegrationCheckHandoff(memory: ResolvedMemory, changePath: string, handoff: SchedulerIntegrationCheckHandoff): Promise<void> {
  await assertChangePathScope(memory, changePath, handoff.changeId, `SchedulerIntegrationCheckHandoff ${handoff.id}`);
  await mkdir(schedulerIntegrationCheckHandoffsDir(memory, changePath, handoff.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerIntegrationCheckHandoffPath(memory, changePath, handoff.schedulerRunId, handoff.id), handoff);
  await writeFile(schedulerIntegrationCheckHandoffMarkdownPath(memory, changePath, handoff.schedulerRunId, handoff.id), renderSchedulerIntegrationCheckHandoffMarkdown(handoff), "utf8");
}

export async function readSchedulerIntegrationCheckHandoff(memory: ResolvedMemory, changePath: string, schedulerRunId: string, handoffId: string): Promise<SchedulerIntegrationCheckHandoff> {
  const handoff = await readRequiredJsonFile(schedulerIntegrationCheckHandoffPath(memory, changePath, schedulerRunId, handoffId), schedulerIntegrationCheckHandoffSchema);
  await assertChangePathScope(memory, changePath, handoff.changeId, `SchedulerIntegrationCheckHandoff ${handoff.id}`);
  if (handoff.schedulerRunId !== schedulerRunId || handoff.id !== handoffId) throw new Error("SchedulerIntegrationCheckHandoff scope mismatch.");
  return handoff;
}

export async function readSchedulerIntegrationCheckHandoffProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, handoffId: string): Promise<SchedulerIntegrationCheckHandoff | null> {
  try {
    return await readSchedulerIntegrationCheckHandoff(memory, changePath, schedulerRunId, handoffId);
  } catch {
    return null;
  }
}

export async function listSchedulerIntegrationCheckHandoffs(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCheckHandoff[]> {
  const dir = schedulerIntegrationCheckHandoffsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const handoffs: SchedulerIntegrationCheckHandoff[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const handoff = await readSchedulerIntegrationCheckHandoffProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (handoff) handoffs.push(handoff);
  }
  return handoffs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSchedulerIntegrationCheckHandoffsStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCheckHandoff[]> {
  const dir = schedulerIntegrationCheckHandoffsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const handoffs: SchedulerIntegrationCheckHandoff[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    handoffs.push(await readSchedulerIntegrationCheckHandoff(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, "")));
  }
  return handoffs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readLatestSchedulerIntegrationCheckHandoffProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCheckHandoff | null> {
  return (await listSchedulerIntegrationCheckHandoffs(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function readLatestSchedulerIntegrationCheckHandoffStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationCheckHandoff | null> {
  return (await listSchedulerIntegrationCheckHandoffsStrict(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function findSchedulerIntegrationCheckHandoffForCandidate(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId: string,
  candidateId: string,
  readyWorktreeIds: string[],
): Promise<SchedulerIntegrationCheckHandoff | null> {
  const expected = normalizeWorktreeIds(readyWorktreeIds);
  for (const handoff of await listSchedulerIntegrationCheckHandoffs(memory, changePath, schedulerRunId)) {
    if (handoff.schedulerIntegrationCandidateId !== candidateId) continue;
    if (sameWorktreeSet(handoff.readyWorktreeIds, expected)) return handoff;
  }
  return null;
}

export async function writeSchedulerIntegrationOutcome(memory: ResolvedMemory, changePath: string, outcome: SchedulerIntegrationOutcome): Promise<void> {
  await assertChangePathScope(memory, changePath, outcome.changeId, `SchedulerIntegrationOutcome ${outcome.id}`);
  await mkdir(schedulerIntegrationOutcomesDir(memory, changePath, outcome.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerIntegrationOutcomePath(memory, changePath, outcome.schedulerRunId, outcome.id), outcome);
  await writeFile(schedulerIntegrationOutcomeMarkdownPath(memory, changePath, outcome.schedulerRunId, outcome.id), renderSchedulerIntegrationOutcomeMarkdown(outcome), "utf8");
}

export async function readSchedulerIntegrationOutcome(memory: ResolvedMemory, changePath: string, schedulerRunId: string, outcomeId: string): Promise<SchedulerIntegrationOutcome> {
  const outcome = await readRequiredJsonFile(schedulerIntegrationOutcomePath(memory, changePath, schedulerRunId, outcomeId), schedulerIntegrationOutcomeSchema);
  await assertChangePathScope(memory, changePath, outcome.changeId, `SchedulerIntegrationOutcome ${outcome.id}`);
  if (outcome.schedulerRunId !== schedulerRunId || outcome.id !== outcomeId) throw new Error("SchedulerIntegrationOutcome scope mismatch.");
  return outcome;
}

export async function readSchedulerIntegrationOutcomeProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, outcomeId: string): Promise<SchedulerIntegrationOutcome | null> {
  try {
    return await readSchedulerIntegrationOutcome(memory, changePath, schedulerRunId, outcomeId);
  } catch {
    return null;
  }
}

export async function listSchedulerIntegrationOutcomes(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationOutcome[]> {
  const dir = schedulerIntegrationOutcomesDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const outcomes: SchedulerIntegrationOutcome[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const outcome = await readSchedulerIntegrationOutcomeProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (outcome) outcomes.push(outcome);
  }
  return outcomes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSchedulerIntegrationOutcomesStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationOutcome[]> {
  const dir = schedulerIntegrationOutcomesDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const outcomes: SchedulerIntegrationOutcome[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    outcomes.push(await readSchedulerIntegrationOutcome(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, "")));
  }
  return outcomes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readLatestSchedulerIntegrationOutcomeProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationOutcome | null> {
  return (await listSchedulerIntegrationOutcomes(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function readLatestSchedulerIntegrationOutcomeStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerIntegrationOutcome | null> {
  return (await listSchedulerIntegrationOutcomesStrict(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function findSchedulerIntegrationOutcomeForHandoff(memory: ResolvedMemory, changePath: string, schedulerRunId: string, handoffId: string): Promise<SchedulerIntegrationOutcome | null> {
  for (const outcome of await listSchedulerIntegrationOutcomes(memory, changePath, schedulerRunId)) {
    if (outcome.schedulerIntegrationCheckHandoffId === handoffId) return outcome;
  }
  return null;
}

export async function writeSchedulerRunCompletion(memory: ResolvedMemory, changePath: string, completion: SchedulerRunCompletion): Promise<void> {
  await assertChangePathScope(memory, changePath, completion.changeId, `SchedulerRunCompletion ${completion.id}`);
  await mkdir(schedulerRunCompletionsDir(memory, changePath, completion.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerRunCompletionPath(memory, changePath, completion.schedulerRunId, completion.id), completion);
  await writeFile(schedulerRunCompletionMarkdownPath(memory, changePath, completion.schedulerRunId, completion.id), renderSchedulerRunCompletionMarkdown(completion), "utf8");
}

export async function readSchedulerRunCompletion(memory: ResolvedMemory, changePath: string, schedulerRunId: string, completionId: string): Promise<SchedulerRunCompletion> {
  const completion = await readRequiredJsonFile(schedulerRunCompletionPath(memory, changePath, schedulerRunId, completionId), schedulerRunCompletionSchema);
  await assertChangePathScope(memory, changePath, completion.changeId, `SchedulerRunCompletion ${completion.id}`);
  if (completion.schedulerRunId !== schedulerRunId || completion.id !== completionId) throw new Error("SchedulerRunCompletion scope mismatch.");
  return completion;
}

export async function readSchedulerRunCompletionProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, completionId: string): Promise<SchedulerRunCompletion | null> {
  try {
    return await readSchedulerRunCompletion(memory, changePath, schedulerRunId, completionId);
  } catch {
    return null;
  }
}

export async function listSchedulerRunCompletions(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunCompletion[]> {
  const dir = schedulerRunCompletionsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const completions: SchedulerRunCompletion[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const completion = await readSchedulerRunCompletionProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (completion) completions.push(completion);
  }
  return completions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSchedulerRunCompletionsStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunCompletion[]> {
  const dir = schedulerRunCompletionsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const completions: SchedulerRunCompletion[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    completions.push(await readSchedulerRunCompletion(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, "")));
  }
  return completions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readLatestSchedulerRunCompletionProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunCompletion | null> {
  return (await listSchedulerRunCompletions(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function readLatestSchedulerRunCompletionStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunCompletion | null> {
  return (await listSchedulerRunCompletionsStrict(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function findSchedulerRunCompletionForOutcome(memory: ResolvedMemory, changePath: string, schedulerRunId: string, outcomeId: string): Promise<SchedulerRunCompletion | null> {
  for (const completion of await listSchedulerRunCompletions(memory, changePath, schedulerRunId)) {
    if (completion.schedulerIntegrationOutcomeId === outcomeId) return completion;
  }
  return null;
}

export async function writeSchedulerRunBlockedCloseout(memory: ResolvedMemory, changePath: string, closeout: SchedulerRunBlockedCloseout): Promise<void> {
  await assertChangePathScope(memory, changePath, closeout.changeId, `SchedulerRunBlockedCloseout ${closeout.id}`);
  await mkdir(schedulerRunBlockedCloseoutsDir(memory, changePath, closeout.schedulerRunId), { recursive: true });
  await writeJsonFile(schedulerRunBlockedCloseoutPath(memory, changePath, closeout.schedulerRunId, closeout.id), closeout);
  await writeFile(schedulerRunBlockedCloseoutMarkdownPath(memory, changePath, closeout.schedulerRunId, closeout.id), renderSchedulerRunBlockedCloseoutMarkdown(closeout), "utf8");
}

export async function readSchedulerRunBlockedCloseout(memory: ResolvedMemory, changePath: string, schedulerRunId: string, closeoutId: string): Promise<SchedulerRunBlockedCloseout> {
  const closeout = await readRequiredJsonFile(schedulerRunBlockedCloseoutPath(memory, changePath, schedulerRunId, closeoutId), schedulerRunBlockedCloseoutSchema);
  await assertChangePathScope(memory, changePath, closeout.changeId, `SchedulerRunBlockedCloseout ${closeout.id}`);
  if (closeout.schedulerRunId !== schedulerRunId || closeout.id !== closeoutId) throw new Error("SchedulerRunBlockedCloseout scope mismatch.");
  return closeout;
}

export async function readSchedulerRunBlockedCloseoutProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, closeoutId: string): Promise<SchedulerRunBlockedCloseout | null> {
  try {
    return await readSchedulerRunBlockedCloseout(memory, changePath, schedulerRunId, closeoutId);
  } catch {
    return null;
  }
}

export async function listSchedulerRunBlockedCloseouts(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunBlockedCloseout[]> {
  const dir = schedulerRunBlockedCloseoutsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const closeouts: SchedulerRunBlockedCloseout[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const closeout = await readSchedulerRunBlockedCloseoutProjection(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, ""));
    if (closeout) closeouts.push(closeout);
  }
  return closeouts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSchedulerRunBlockedCloseoutsStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunBlockedCloseout[]> {
  const dir = schedulerRunBlockedCloseoutsDir(memory, changePath, schedulerRunId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const closeouts: SchedulerRunBlockedCloseout[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    closeouts.push(await readSchedulerRunBlockedCloseout(memory, changePath, schedulerRunId, entry.name.replace(/\.json$/, "")));
  }
  return closeouts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readLatestSchedulerRunBlockedCloseoutProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunBlockedCloseout | null> {
  return (await listSchedulerRunBlockedCloseouts(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function readLatestSchedulerRunBlockedCloseoutStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRunBlockedCloseout | null> {
  return (await listSchedulerRunBlockedCloseoutsStrict(memory, changePath, schedulerRunId))[0] ?? null;
}

export async function findSchedulerRunBlockedCloseoutForCandidate(memory: ResolvedMemory, changePath: string, schedulerRunId: string, candidateId: string): Promise<SchedulerRunBlockedCloseout | null> {
  for (const closeout of await listSchedulerRunBlockedCloseouts(memory, changePath, schedulerRunId)) {
    if (closeout.schedulerIntegrationCandidateId === candidateId) return closeout;
  }
  return null;
}

export async function findSchedulerRunBlockedCloseoutForCandidateStrict(memory: ResolvedMemory, changePath: string, schedulerRunId: string, candidateId: string): Promise<SchedulerRunBlockedCloseout | null> {
  for (const closeout of await listSchedulerRunBlockedCloseoutsStrict(memory, changePath, schedulerRunId)) {
    if (closeout.schedulerIntegrationCandidateId === candidateId) return closeout;
  }
  return null;
}

function normalizeWorktreeIds(worktreeIds: string[]): string[] {
  return [...worktreeIds].sort((a, b) => a.localeCompare(b));
}

function sameWorktreeSet(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeWorktreeIds(left);
  const normalizedRight = normalizeWorktreeIds(right);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((item, index) => item === normalizedRight[index]);
}
