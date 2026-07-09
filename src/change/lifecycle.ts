import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeChangeIndex } from "../ecl/index.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory } from "../memory/resolver.js";
import type { ChangeMetadata, ChangeStatus, ManagedProject } from "../types/index.js";
import { assertClosableChangeStatus } from "./guards.js";
import { getArchiveRelativePath } from "./paths.js";
import { getChangeStatus, getChangeStatusForChange } from "./status.js";
import { resolveChangeMemory } from "./utils.js";
import type { ChangeAbandonResult, ChangeCloseResult } from "./types.js";
import type { ResolvedMemory } from "../types/index.js";

export async function closeChange(project: ManagedProject | string): Promise<ChangeCloseResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change close");
  const status = await getChangeStatus(memory);
  return closeChangeFromStatus(memory, status, "legacy");
}

export async function closeChangeForChange(project: ManagedProject | string, changeId: string): Promise<ChangeCloseResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change close");
  const status = await getChangeStatusForChange(memory, changeId);
  return closeChangeFromStatus(memory, status, "scoped");
}

async function closeChangeFromStatus(memory: ResolvedMemory, status: ChangeStatus, mode: "legacy" | "scoped"): Promise<ChangeCloseResult> {
  if (!status.closeGate.ready) {
    throw new Error(`Cannot close change:\n${status.closeGate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  assertClosableChangeStatus(status, mode, "close");
  const active = status.activeChanges[0];
  const change = status.change;
  const activePath = join(memory.memoryRoot, active.path);
  const archiveRelativePath = await getArchiveRelativePath(memory, change.id);
  const archivePath = join(memory.memoryRoot, archiveRelativePath);
  const updated = archivedMetadata(change, archiveRelativePath);

  await writeJsonFile(join(activePath, "change.json"), updated);
  await mkdir(dirname(archivePath), { recursive: true });
  await rename(activePath, archivePath);
  const index = await writeChangeIndex(memory);
  return { archivePath: archiveRelativePath, change: updated, index };
}

export async function abandonChange(project: ManagedProject | string, reason?: string): Promise<ChangeAbandonResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change abandon");
  const status = await getChangeStatus(memory);
  return abandonChangeFromStatus(memory, status, reason, "legacy");
}

export async function abandonChangeForChange(project: ManagedProject | string, changeId: string, reason?: string): Promise<ChangeAbandonResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change abandon");
  const status = await getChangeStatusForChange(memory, changeId);
  return abandonChangeFromStatus(memory, status, reason, "scoped");
}

async function abandonChangeFromStatus(memory: ResolvedMemory, status: ChangeStatus, reason: string | undefined, mode: "legacy" | "scoped"): Promise<ChangeAbandonResult> {
  assertClosableChangeStatus(status, mode, "abandon");
  const active = status.activeChanges[0];
  const change = status.change;
  const activePath = join(memory.memoryRoot, active.path);
  const archiveRelativePath = await getArchiveRelativePath(memory, change.id);
  const archivePath = join(memory.memoryRoot, archiveRelativePath);
  const updated = archivedMetadata(change, archiveRelativePath);

  await writeJsonFile(join(activePath, "change.json"), updated);
  await mkdir(dirname(archivePath), { recursive: true });
  await rename(activePath, archivePath);
  const index = await writeChangeIndex(memory);
  return { archivePath: archiveRelativePath, change: updated, index, reason };
}

function archivedMetadata(change: ChangeMetadata, archivePath: string): ChangeMetadata {
  const now = new Date().toISOString();
  return {
    ...change,
    state: "archived",
    updatedAt: now,
    closedAt: now,
    archivePath,
  };
}
