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
  schedulerWorkerStartMarkdownPath,
  schedulerWorkerStartPath,
  schedulerWorkerStartsDir,
  schedulerWorkerValidationMarkdownPath,
  schedulerWorkerValidationPath,
  schedulerWorkerValidationsDir,
} from "./paths.js";
import { renderSchedulerReconcileSnapshotMarkdown, renderSchedulerRuntimeClaimReservationMarkdown, renderSchedulerRuntimeStateMarkdown, renderSchedulerRuntimeWorkerAuditMarkdown, renderSchedulerRuntimeWorkerResultMarkdown, renderSchedulerRuntimeWorkerReworkPlanMarkdown, renderSchedulerRuntimeWorkerStartMarkdown, renderSchedulerRuntimeWorkerValidationMarkdown } from "./rendering.js";
import { schedulerReconcileSnapshotSchema, schedulerRuntimeClaimReservationSchema, schedulerRuntimeEventSchema, schedulerRuntimeStateSchema, schedulerRuntimeWorkerAuditSchema, schedulerRuntimeWorkerResultSchema, schedulerRuntimeWorkerReworkPlanSchema, schedulerRuntimeWorkerStartSchema, schedulerRuntimeWorkerValidationSchema } from "./schemas.js";
import type { SchedulerReconcileSnapshot, SchedulerRuntimeClaimReservation, SchedulerRuntimeEvent, SchedulerRuntimeEventType, SchedulerRuntimeState, SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerResult, SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerStart, SchedulerRuntimeWorkerValidation } from "./types.js";

export function schedulerRuntimeArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerRunId: string): { artifact: string; eventsArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, schedulerRuntimeStatePath(memory, changePath, schedulerRunId)),
    eventsArtifact: displayArtifactPath(memory, schedulerRuntimeEventsPath(memory, changePath, schedulerRunId)),
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
