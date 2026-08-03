import { join } from "node:path";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";

export function workflowRunDir(memory: ProjectRunsPathPort, changeId: string): string {
  return join(memory.runsRoot, "workflows", changeId);
}

export function workflowRunPath(memory: ProjectRunsPathPort, changeId: string, workflowRunId: string): string {
  return join(workflowRunDir(memory, changeId), `${workflowRunId}.json`);
}

export function workflowEventPath(memory: ProjectRunsPathPort, changeId: string, workflowRunId: string): string {
  return join(memory.runsRoot, "workflow-events", changeId, `${workflowRunId}.jsonl`);
}
