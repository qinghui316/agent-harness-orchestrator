import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { getTemplateRoot } from "../template-source/paths.js";
import type { ResolvedMemory } from "../types/index.js";
import type { ChangeDirectoryState } from "./types.js";

export function changeDirectory(memory: ResolvedMemory, state: ChangeDirectoryState, id: string): string {
  return join(memory.changesRoot, state, id);
}

export function displayPath(memory: ResolvedMemory, absolutePath: string): string {
  return relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/");
}

export function finalPathSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

export function getChangeTemplateRoot(memory: ResolvedMemory): string {
  if (existsSync(memory.templatesRoot)) return memory.templatesRoot;
  return join(getTemplateRoot(), "harness", "templates", "change");
}

export async function getArchiveRelativePath(memory: ResolvedMemory, changeId: string): Promise<string> {
  const basePath = join(memory.changesRoot, "archive", `${localDate()}-${changeId}`);
  if (!existsSync(basePath)) return displayPath(memory, basePath);
  return displayPath(memory, `${basePath}-${localTime()}`);
}

function localDate(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function localTime(date = new Date()): string {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
