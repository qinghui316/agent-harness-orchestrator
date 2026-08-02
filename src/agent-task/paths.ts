import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

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
