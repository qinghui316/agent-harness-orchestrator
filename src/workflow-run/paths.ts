import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function workflowRunDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "workflows", changeId);
}

export function workflowRunPath(memory: ResolvedMemory, changeId: string, workflowRunId: string): string {
  return join(workflowRunDir(memory, changeId), `${workflowRunId}.json`);
}

export function workflowEventPath(memory: ResolvedMemory, changeId: string, workflowRunId: string): string {
  return join(memory.runsRoot, "workflow-events", changeId, `${workflowRunId}.jsonl`);
}
