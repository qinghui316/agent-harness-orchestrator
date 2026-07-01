import {
  readLatestSchedulerRun,
  readSchedulerRun,
  schedulerRunArtifactRefs,
} from "../workflow-scheduler/repository.js";
import type { SchedulerRun } from "../workflow-scheduler/types.js";
import {
  readSchedulerRuntimeEvents,
  readSchedulerRuntimeState,
  schedulerRuntimeArtifactRefs,
} from "../scheduler-runtime/repository.js";
import type { SchedulerRuntimeEvent, SchedulerRuntimeState } from "../scheduler-runtime/types.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import {
  buildControlledSchedulerStepReplaySummary,
  type ControlledSchedulerStepReplaySummary,
} from "./controlled-scheduler-step-replay.js";
import type { MainAgentReplayEvidenceHealthStatus } from "./workflowgraph-replay.js";

export interface MainAgentControlledSchedulerStateBackflowHealth {
  source: "controlled-scheduler-state";
  status: MainAgentReplayEvidenceHealthStatus;
  count: number;
  reasons: string[];
  paths: string[];
  issues?: Array<{ status: MainAgentReplayEvidenceHealthStatus; reason: string }>;
}

export interface MainAgentControlledSchedulerStateBackflowSummary {
  version: "1.0";
  authority: "read-only-main-agent-controlled-scheduler-state-backflow";
  executionStarted: false;
  changeId: string;
  projectId: string | null;
  expectedSchedulerRunId: string | null;
  schedulerRun: {
    id: string;
    status: SchedulerRun["status"];
    schedulerMode: SchedulerRun["schedulerMode"];
    humanConfirmed: boolean;
    claimIntentCount: number;
    plannedSlotDemand: number;
    blockedCount: number;
  } | null;
  runtimeState: {
    id: string;
    status: SchedulerRuntimeState["status"];
    schedulerMode: SchedulerRuntimeState["schedulerMode"];
    plannedSlotDemand: number;
    maxPlannedWaveWidth: number;
    blockedCount: number;
    lastClaimReservationId: string | null;
  } | null;
  latestRuntimeEvent: {
    id: string;
    type: SchedulerRuntimeEvent["type"];
    status: SchedulerRuntimeEvent["status"] | null;
    summary: string | null;
    timestamp: string;
  } | null;
  controlledStep: ControlledSchedulerStepReplaySummary["latestStep"];
  health: MainAgentControlledSchedulerStateBackflowHealth;
  artifactRefs: string[];
}

export async function buildMainAgentControlledSchedulerStateBackflow(input: {
  memory: ResolvedMemory;
  project: ManagedProject;
  changeId: string;
  changePath?: string | null;
  schedulerRunId?: string | null;
}): Promise<MainAgentControlledSchedulerStateBackflowSummary> {
  const expectedSchedulerRunId = normalize(input.schedulerRunId);
  const health: MainAgentControlledSchedulerStateBackflowHealth = {
    source: "controlled-scheduler-state",
    status: "available",
    count: 0,
    reasons: [],
    paths: [],
    issues: [],
  };
  if (!input.changePath) {
    markHealth(health, "missing", "Active Change path is unavailable; controlled Scheduler state cannot be read.");
    return emptySummary(input, expectedSchedulerRunId, health);
  }

  const run = await readSchedulerRunForBackflow(input.memory, input.changePath, input.changeId, expectedSchedulerRunId, health);
  const controlledStep = await buildControlledSchedulerStepReplaySummary({
    memory: input.memory,
    changePath: input.changePath,
    changeId: input.changeId,
    expectedSchedulerRunId: run?.id ?? expectedSchedulerRunId,
  });
  for (const issue of controlledStep.health.issues ?? []) {
    markHealth(health, issue.status, issue.reason);
  }
  if (controlledStep.health.status !== "available" && !(controlledStep.health.issues?.length)) {
    for (const reason of controlledStep.health.reasons) markHealth(health, controlledStep.health.status, reason);
  }

  const runtime = run ? await readRuntimeStateForBackflow(input.memory, input.changePath, run.id, health) : null;
  const events = run && runtime ? await readRuntimeEventsForBackflow(input.memory, input.changePath, run.id, health) : [];
  const latestEvent = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;
  const artifactRefs = [
    ...(run ? Object.values(schedulerRunArtifactRefs(input.memory, input.changePath, run.id)) : []),
    ...(runtime ? Object.values(schedulerRuntimeArtifactRefs(input.memory, input.changePath, runtime.schedulerRunId)) : []),
    ...controlledStep.artifactRefs,
    ...(latestEvent?.artifactRefs ?? []),
  ].filter((item) => item.trim().length > 0);

  health.count = [run, runtime, latestEvent, controlledStep.latestStep].filter(Boolean).length;
  return {
    version: "1.0",
    authority: "read-only-main-agent-controlled-scheduler-state-backflow",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    expectedSchedulerRunId,
    schedulerRun: run ? summarizeRun(run) : null,
    runtimeState: runtime ? summarizeRuntimeState(runtime) : null,
    latestRuntimeEvent: latestEvent ? summarizeRuntimeEvent(latestEvent) : null,
    controlledStep: controlledStep.latestStep,
    health,
    artifactRefs: dedupeStrings(artifactRefs),
  };
}

async function readSchedulerRunForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  expectedSchedulerRunId: string | null,
  health: MainAgentControlledSchedulerStateBackflowHealth,
): Promise<SchedulerRun | null> {
  try {
    const run = expectedSchedulerRunId
      ? await readSchedulerRun(memory, changePath, expectedSchedulerRunId)
      : await readLatestSchedulerRun(memory, changePath);
    if (run.changeId !== changeId) {
      markHealth(health, "scope-mismatch", `SchedulerRun ${run.id} belongs to ${run.changeId} instead of ${changeId}.`);
      return null;
    }
    if (expectedSchedulerRunId && run.id !== expectedSchedulerRunId) {
      markHealth(health, "scope-mismatch", `SchedulerRun ${run.id} does not match expected SchedulerRun ${expectedSchedulerRunId}.`);
      return null;
    }
    return run;
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerRun could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

async function readRuntimeStateForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerStateBackflowHealth,
): Promise<SchedulerRuntimeState | null> {
  try {
    return await readSchedulerRuntimeState(memory, changePath, schedulerRunId);
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerRuntimeState could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

async function readRuntimeEventsForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerStateBackflowHealth,
): Promise<SchedulerRuntimeEvent[]> {
  try {
    return await readSchedulerRuntimeEvents(memory, changePath, schedulerRunId);
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerRuntimeEvent history could not be read: ${errorMessage(error)}.`);
    return [];
  }
}

function summarizeRun(run: SchedulerRun): MainAgentControlledSchedulerStateBackflowSummary["schedulerRun"] {
  return {
    id: run.id,
    status: run.status,
    schedulerMode: run.schedulerMode,
    humanConfirmed: run.humanConfirmed,
    claimIntentCount: run.claimIntentCount,
    plannedSlotDemand: run.plannedSlotDemand,
    blockedCount: run.blockedCount,
  };
}

function summarizeRuntimeState(state: SchedulerRuntimeState): MainAgentControlledSchedulerStateBackflowSummary["runtimeState"] {
  return {
    id: state.id,
    status: state.status,
    schedulerMode: state.schedulerMode,
    plannedSlotDemand: state.plannedSlotDemand,
    maxPlannedWaveWidth: state.maxPlannedWaveWidth,
    blockedCount: state.blockedCount,
    lastClaimReservationId: state.lastClaimReservationId ?? null,
  };
}

function summarizeRuntimeEvent(event: SchedulerRuntimeEvent): MainAgentControlledSchedulerStateBackflowSummary["latestRuntimeEvent"] {
  return {
    id: event.id,
    type: event.type,
    status: event.status ?? null,
    summary: event.summary ?? null,
    timestamp: event.timestamp,
  };
}

function emptySummary(
  input: { project: ManagedProject; changeId: string },
  expectedSchedulerRunId: string | null,
  health: MainAgentControlledSchedulerStateBackflowHealth,
): MainAgentControlledSchedulerStateBackflowSummary {
  return {
    version: "1.0",
    authority: "read-only-main-agent-controlled-scheduler-state-backflow",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    expectedSchedulerRunId,
    schedulerRun: null,
    runtimeState: null,
    latestRuntimeEvent: null,
    controlledStep: null,
    health,
    artifactRefs: [],
  };
}

function markHealth(
  health: MainAgentControlledSchedulerStateBackflowHealth,
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
