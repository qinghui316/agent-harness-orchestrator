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

export function schedulerDispatchDryRunsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-dispatch-dry-runs");
}

export function schedulerDispatchDryRunPath(memory: ResolvedMemory, changePath: string, dryRunId: string): string {
  return join(schedulerDispatchDryRunsDir(memory, changePath), `${dryRunId}.json`);
}

export function latestSchedulerDispatchDryRunPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-dispatch-dry-run.json");
}

export function latestSchedulerDispatchDryRunMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-dispatch-dry-run.md");
}
