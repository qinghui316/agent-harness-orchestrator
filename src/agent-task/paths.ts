import { join } from "node:path";

export interface AgentTaskPathPort {
  workbenchRoot: string;
}

export interface AgentTaskStorePort extends AgentTaskPathPort {
  projectId: string | null;
  workbenchDbPath: string;
}

export function agentTaskRoot(memory: AgentTaskPathPort): string {
  return join(memory.workbenchRoot, "agent-tasks");
}

export function tasksRoot(memory: AgentTaskPathPort): string {
  return join(agentTaskRoot(memory), "tasks");
}

export function taskPath(memory: AgentTaskPathPort, taskId: string): string {
  return join(tasksRoot(memory), taskId, "task.json");
}

export function taskResultPath(memory: AgentTaskPathPort, taskId: string): string {
  return join(tasksRoot(memory), taskId, "result.json");
}
