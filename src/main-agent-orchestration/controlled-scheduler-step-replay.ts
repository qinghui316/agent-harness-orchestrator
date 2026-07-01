import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { schedulerControlledStepsDir } from "../scheduler-runtime/paths.js";
import { schedulerControlledStepEvidenceSchema } from "../scheduler-runtime/schemas.js";
import type { SchedulerControlledStepEvidence } from "../scheduler-runtime/types.js";
import type { ResolvedMemory } from "../types/index.js";

export type ControlledSchedulerStepReplayHealthStatus =
  | "available"
  | "missing"
  | "malformed"
  | "old-schema"
  | "scope-mismatch"
  | "stale";

export interface ControlledSchedulerStepReplayHealth {
  source: "controlled-scheduler-step";
  status: ControlledSchedulerStepReplayHealthStatus;
  count: number;
  reasons: string[];
  paths: string[];
  issues?: Array<{ status: ControlledSchedulerStepReplayHealthStatus; reason: string }>;
}

export interface ControlledSchedulerStepReplayLatest {
  id: string;
  schedulerRunId: string | null;
  status: SchedulerControlledStepEvidence["status"];
  executedAction: string;
  routePosture: string | null;
  continuationReadinessStatus: string | null;
  postStepHandoffStatus: string | null;
  postStepStopReason: string | null;
  resultKind: string | null;
  resultStatus: string | null;
  recordedWithWarning: boolean;
  evidenceRefs: string[];
  artifactRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ControlledSchedulerStepReplaySummary {
  latestStep: ControlledSchedulerStepReplayLatest | null;
  expectedSchedulerRunId: string | null;
  artifactRefs: string[];
  health: ControlledSchedulerStepReplayHealth;
}

export async function buildControlledSchedulerStepReplaySummary(input: {
  memory: ResolvedMemory;
  changePath?: string | null;
  changeId: string;
  expectedSchedulerRunId?: string | null;
}): Promise<ControlledSchedulerStepReplaySummary> {
  const expectedSchedulerRunId = normalize(input.expectedSchedulerRunId);
  if (!input.changePath) {
    return emptyControlledSchedulerStepReplay("missing", "Active Change path is unavailable; controlled Scheduler step evidence cannot be read.", expectedSchedulerRunId);
  }

  const scoped = await readControlledStepDirectory(input.memory, input.changePath, input.changeId, expectedSchedulerRunId, expectedSchedulerRunId);
  if (expectedSchedulerRunId && scoped.health.status === "missing") {
    const unscoped = await readControlledStepDirectory(input.memory, input.changePath, input.changeId, null, expectedSchedulerRunId);
    if (unscoped.health.status !== "missing") {
      const health = mergeControlledStepHealth(scoped.health, {
        ...unscoped.health,
        status: unscoped.health.status === "available" ? "stale" : unscoped.health.status,
        reasons: [
          ...unscoped.health.reasons,
          `Controlled Scheduler step evidence is not scoped to expected SchedulerRun ${expectedSchedulerRunId}.`,
        ],
      });
      return {
        latestStep: null,
        expectedSchedulerRunId,
        artifactRefs: [],
        health,
      };
    }
  }
  return scoped;
}

async function readControlledStepDirectory(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string | null,
  expectedSchedulerRunId: string | null,
): Promise<ControlledSchedulerStepReplaySummary> {
  const dir = schedulerControlledStepsDir(memory, changePath, schedulerRunId ?? undefined);
  const health: ControlledSchedulerStepReplayHealth = {
    source: "controlled-scheduler-step",
    status: "available",
    count: 0,
    reasons: [],
    paths: [dir],
    issues: [],
  };
  if (!existsSync(dir)) {
    return emptyControlledSchedulerStepReplay("missing", "Controlled Scheduler step evidence directory is missing.", expectedSchedulerRunId, [dir]);
  }
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    return emptyControlledSchedulerStepReplay("malformed", `Controlled Scheduler step evidence directory could not be read: ${errorMessage(error)}.`, expectedSchedulerRunId, [dir]);
  }

  const steps: SchedulerControlledStepEvidence[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = `${dir}/${entry.name}`;
    health.paths = dedupeStrings([...health.paths, path]);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, "utf8"));
    } catch {
      markControlledStepHealth(health, "malformed", `Controlled Scheduler step evidence is not valid JSON: ${entry.name}.`);
      continue;
    }
    const parsed = schedulerControlledStepEvidenceSchema.safeParse(raw);
    if (!parsed.success) {
      markControlledStepHealth(health, "old-schema", `Controlled Scheduler step evidence uses an old schema: ${entry.name}.`);
      continue;
    }
    const step = parsed.data;
    const scopeIssue = validateControlledStepScope(step, changeId, schedulerRunId, expectedSchedulerRunId);
    if (scopeIssue) {
      markControlledStepHealth(health, "scope-mismatch", scopeIssue);
      continue;
    }
    if (step.status === "recorded-with-warning") {
      markControlledStepHealth(health, "stale", `Controlled Scheduler step ${step.id} was recorded with warning and must be treated as degraded evidence.`);
    }
    steps.push(step);
  }

  steps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = steps[0] ?? null;
  health.count = steps.length;
  if (!latest && health.status === "available") {
    markControlledStepHealth(health, "missing", "No valid controlled Scheduler step evidence entries were found.");
  }
  return {
    latestStep: latest ? summarizeControlledStep(latest) : null,
    expectedSchedulerRunId,
    artifactRefs: latest ? controlledStepArtifactRefs(latest) : [],
    health,
  };
}

function validateControlledStepScope(
  step: SchedulerControlledStepEvidence,
  changeId: string,
  schedulerRunId: string | null,
  expectedSchedulerRunId: string | null,
): string | null {
  if (step.changeId !== changeId) {
    return `Controlled Scheduler step ${step.id} belongs to ${step.changeId} instead of ${changeId}.`;
  }
  if (!scopeContains(step.targetScope.changeId, changeId)) {
    return `Controlled Scheduler step ${step.id} target scope does not match Change ${changeId}.`;
  }
  if (schedulerRunId && step.schedulerRunId !== schedulerRunId) {
    return `Controlled Scheduler step ${step.id} is not stored under SchedulerRun ${schedulerRunId}.`;
  }
  if (step.schedulerRunId && !scopeContains(step.targetScope.schedulerRunId, step.schedulerRunId)) {
    return `Controlled Scheduler step ${step.id} target scope does not match SchedulerRun ${step.schedulerRunId}.`;
  }
  if (expectedSchedulerRunId && step.schedulerRunId !== expectedSchedulerRunId) {
    return `Controlled Scheduler step ${step.id} does not match expected SchedulerRun ${expectedSchedulerRunId}.`;
  }
  return null;
}

function summarizeControlledStep(step: SchedulerControlledStepEvidence): ControlledSchedulerStepReplayLatest {
  return {
    id: step.id,
    schedulerRunId: step.schedulerRunId ?? null,
    status: step.status,
    executedAction: step.executedActionType,
    routePosture: step.controlledLoopPostStepRoutingDecision?.routeFamily
      ?? step.controlledLoopContinuationReadiness?.routePosture
      ?? step.controlledLoopTurnRouteSummary?.routePosture
      ?? step.controlledLoopStopSummary?.routePosture
      ?? null,
    continuationReadinessStatus: step.controlledLoopPostStepRoutingDecision?.continuationReadinessStatus
      ?? step.controlledLoopContinuationReadiness?.status
      ?? step.controlledLoopIteration?.continuationReadinessStatus
      ?? step.controlledLoopStopSummary?.continuationReadinessStatus
      ?? null,
    postStepHandoffStatus: step.postStepHandoff.status ?? null,
    postStepStopReason: step.postStepHandoff.stopReason ?? null,
    resultKind: step.controlledLoopPostStepRoutingDecision?.resultKind
      ?? step.controlledLoopContinuationReadiness?.resultKind
      ?? step.controlledLoopTurnRouteSummary?.resultKind
      ?? step.controlledLoopIteration?.resultKind
      ?? step.controlledLoopStopSummary?.resultKind
      ?? null,
    resultStatus: step.controlledLoopPostStepRoutingDecision?.resultStatus
      ?? step.controlledLoopContinuationReadiness?.resultStatus
      ?? step.controlledLoopTurnRouteSummary?.resultStatus
      ?? step.controlledLoopIteration?.resultStatus
      ?? step.controlledLoopStopSummary?.resultStatus
      ?? null,
    recordedWithWarning: step.status === "recorded-with-warning",
    evidenceRefs: dedupeStrings([
      ...(step.controlledLoopPostStepRoutingDecision?.evidenceRefs ?? []),
      ...(step.controlledLoopContinuationReadiness?.evidenceRefs ?? []),
      ...(step.controlledLoopIteration?.evidenceRefs ?? []),
      ...(step.controlledLoopPreDispatchDecision?.evidenceRefs ?? []),
    ]),
    artifactRefs: controlledStepArtifactRefs(step),
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
  };
}

function controlledStepArtifactRefs(step: SchedulerControlledStepEvidence): string[] {
  return dedupeStrings([
    ...step.artifactRefs,
    step.artifact,
    step.markdownArtifact,
    step.controlledLoopTurnRouteSummary?.resultArtifact,
  ]);
}

function emptyControlledSchedulerStepReplay(
  status: ControlledSchedulerStepReplayHealthStatus,
  reason: string,
  expectedSchedulerRunId: string | null,
  paths: string[] = [],
): ControlledSchedulerStepReplaySummary {
  return {
    latestStep: null,
    expectedSchedulerRunId,
    artifactRefs: [],
    health: {
      source: "controlled-scheduler-step",
      status,
      count: 0,
      reasons: [reason],
    paths,
    issues: reason ? [{ status, reason }] : [],
    },
  };
}

function mergeControlledStepHealth(
  first: ControlledSchedulerStepReplayHealth,
  second: ControlledSchedulerStepReplayHealth,
): ControlledSchedulerStepReplayHealth {
  const health: ControlledSchedulerStepReplayHealth = {
    source: "controlled-scheduler-step",
    status: first.status,
    count: first.count + second.count,
    reasons: dedupeStrings([...first.reasons, ...second.reasons]),
    paths: dedupeStrings([...first.paths, ...second.paths]),
    issues: [...(first.issues ?? []), ...(second.issues ?? [])],
  };
  markControlledStepHealth(health, second.status);
  return health;
}

function markControlledStepHealth(
  health: ControlledSchedulerStepReplayHealth,
  status: ControlledSchedulerStepReplayHealthStatus,
  ...reasons: string[]
): void {
  if (healthPriority(status) > healthPriority(health.status)) health.status = status;
  health.reasons = dedupeStrings([...health.reasons, ...reasons]);
  const issues = health.issues ?? [];
  for (const reason of reasons) {
    issues.push({ status, reason });
  }
  health.issues = issues;
}

function healthPriority(status: ControlledSchedulerStepReplayHealthStatus): number {
  switch (status) {
    case "malformed": return 6;
    case "scope-mismatch": return 5;
    case "old-schema": return 4;
    case "stale": return 3;
    case "missing": return 2;
    case "available": return 1;
  }
}

function scopeContains(value: string | string[] | undefined, expected: string): boolean {
  if (Array.isArray(value)) return value.includes(expected);
  return value === expected;
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
