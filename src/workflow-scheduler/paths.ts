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

export function schedulerWorkerSessionPlansDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-worker-session-plans");
}

export function schedulerWorkerSessionPlanPath(memory: ResolvedMemory, changePath: string, workerPlanId: string): string {
  return join(schedulerWorkerSessionPlansDir(memory, changePath), `${workerPlanId}.json`);
}

export function latestSchedulerWorkerSessionPlanPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-worker-session-plan.json");
}

export function latestSchedulerWorkerSessionPlanMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-worker-session-plan.md");
}

export function schedulerClaimReconcilePlansDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-claim-reconcile-plans");
}

export function schedulerClaimReconcilePlanPath(memory: ResolvedMemory, changePath: string, claimReconcilePlanId: string): string {
  return join(schedulerClaimReconcilePlansDir(memory, changePath), `${claimReconcilePlanId}.json`);
}

export function latestSchedulerClaimReconcilePlanPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-claim-reconcile-plan.json");
}

export function latestSchedulerClaimReconcilePlanMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-claim-reconcile-plan.md");
}

export function schedulerLaunchPreflightsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-launch-preflights");
}

export function schedulerLaunchPreflightPath(memory: ResolvedMemory, changePath: string, preflightId: string): string {
  return join(schedulerLaunchPreflightsDir(memory, changePath), `${preflightId}.json`);
}

export function latestSchedulerLaunchPreflightPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-launch-preflight.json");
}

export function latestSchedulerLaunchPreflightMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "scheduler-launch-preflight.md");
}
