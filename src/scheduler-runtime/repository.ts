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
import { schedulerReconcileSnapshotMarkdownPath, schedulerReconcileSnapshotPath, schedulerRuntimeDir, schedulerRuntimeEventsPath, schedulerRuntimeStatePath } from "./paths.js";
import { renderSchedulerReconcileSnapshotMarkdown, renderSchedulerRuntimeStateMarkdown } from "./rendering.js";
import { schedulerReconcileSnapshotSchema, schedulerRuntimeEventSchema, schedulerRuntimeStateSchema } from "./schemas.js";
import type { SchedulerReconcileSnapshot, SchedulerRuntimeEvent, SchedulerRuntimeEventType, SchedulerRuntimeState } from "./types.js";

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
