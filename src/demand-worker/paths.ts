import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function demandWorkersRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "demand-workers");
}

export function demandWorkerDir(memory: ResolvedMemory, changeId: string): string {
  return join(demandWorkersRoot(memory), changeId);
}

export function demandWorkerPath(memory: ResolvedMemory, changeId: string): string {
  return join(demandWorkerDir(memory, changeId), "worker.json");
}

export function demandWorkerAttemptsRoot(memory: ResolvedMemory, changeId: string): string {
  return join(demandWorkerDir(memory, changeId), "attempts");
}

export function mainOrchestratorDecisionLogPath(memory: ResolvedMemory): string {
  return join(demandWorkersRoot(memory), "main-orchestrator-decisions.jsonl");
}
