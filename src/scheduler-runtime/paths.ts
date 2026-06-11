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
