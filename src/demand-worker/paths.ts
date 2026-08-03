import { join } from "node:path";

export interface DemandWorkerPathPort {
  workbenchRoot: string;
}

export interface DemandWorkerStorePort extends DemandWorkerPathPort {
  projectId: string | null;
}

export function demandWorkersRoot(memory: DemandWorkerPathPort): string {
  return join(memory.workbenchRoot, "demand-workers");
}

export function demandWorkerDir(memory: DemandWorkerPathPort, changeId: string): string {
  return join(demandWorkersRoot(memory), changeId);
}

export function demandWorkerPath(memory: DemandWorkerPathPort, changeId: string): string {
  return join(demandWorkerDir(memory, changeId), "worker.json");
}

export function demandWorkerAttemptsRoot(memory: DemandWorkerPathPort, changeId: string): string {
  return join(demandWorkerDir(memory, changeId), "attempts");
}

export function mainOrchestratorDecisionLogPath(memory: DemandWorkerPathPort): string {
  return join(demandWorkersRoot(memory), "main-orchestrator-decisions.jsonl");
}
