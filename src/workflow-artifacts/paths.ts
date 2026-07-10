import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function planningDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning");
}

export function workflowGraphsDir(memory: ResolvedMemory, changePath: string): string {
  return join(planningDir(memory, changePath), "workflow-graphs");
}

export function latestWorkflowGraphPlanPath(memory: ResolvedMemory, changePath: string): string {
  return join(planningDir(memory, changePath), "workflow-graph-plan.json");
}

export function workflowGraphPlanPath(memory: ResolvedMemory, changePath: string, workflowGraphPlanId: string): string {
  return join(workflowGraphsDir(memory, changePath), `${workflowGraphPlanId}.json`);
}
