import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function schedulerContractsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-contracts");
}

export function schedulerContractPath(memory: ResolvedMemory, changePath: string, schedulerContractId: string): string {
  return join(schedulerContractsDir(memory, changePath), `${schedulerContractId}.json`);
}

export function latestSchedulerContractPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-contract.json");
}

export function latestSchedulerContractMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-contract.md");
}
