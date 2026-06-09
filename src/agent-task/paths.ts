import { join, relative } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function displayMaintenancePath(memory: ResolvedMemory, path: string): string {
  return relative(memory.memoryRoot, path).replace(/\\/g, "/");
}

export function agentTaskRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "agent-tasks");
}

export function tasksRoot(memory: ResolvedMemory): string {
  return join(agentTaskRoot(memory), "tasks");
}

export function taskPath(memory: ResolvedMemory, taskId: string): string {
  return join(tasksRoot(memory), taskId, "task.json");
}

export function taskResultPath(memory: ResolvedMemory, taskId: string): string {
  return join(tasksRoot(memory), taskId, "result.json");
}

export function maintenanceRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "maintenance");
}

export function closeoutsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "closeouts");
}

export function warmIndexPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "generated", "warm-closeout-index.json");
}

export function coldArchiveIndexPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "generated", "cold-archive-refs.json");
}

export function watermarkPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "review-watermark.json");
}
