import { join } from "node:path";
import { schedulerPlanningRoot, type SchedulerArtifactStore } from "../scheduler-runtime/artifact-store.js";

export function schedulerContractsDir(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-contracts");
}

export function schedulerContractPath(memory: SchedulerArtifactStore, changePath: string, schedulerContractId: string): string {
  return join(schedulerContractsDir(memory, changePath), `${schedulerContractId}.json`);
}

export function latestSchedulerContractPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-contract.json");
}

export function latestSchedulerContractMarkdownPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-contract.md");
}

export function schedulerDispatchDryRunsDir(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-dispatch-dry-runs");
}

export function schedulerDispatchDryRunPath(memory: SchedulerArtifactStore, changePath: string, dryRunId: string): string {
  return join(schedulerDispatchDryRunsDir(memory, changePath), `${dryRunId}.json`);
}

export function latestSchedulerDispatchDryRunPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-dispatch-dry-run.json");
}

export function latestSchedulerDispatchDryRunMarkdownPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-dispatch-dry-run.md");
}

export function schedulerWorkerSessionPlansDir(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-worker-session-plans");
}

export function schedulerWorkerSessionPlanPath(memory: SchedulerArtifactStore, changePath: string, workerPlanId: string): string {
  return join(schedulerWorkerSessionPlansDir(memory, changePath), `${workerPlanId}.json`);
}

export function latestSchedulerWorkerSessionPlanPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-worker-session-plan.json");
}

export function latestSchedulerWorkerSessionPlanMarkdownPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-worker-session-plan.md");
}

export function schedulerClaimReconcilePlansDir(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-claim-reconcile-plans");
}

export function schedulerClaimReconcilePlanPath(memory: SchedulerArtifactStore, changePath: string, claimReconcilePlanId: string): string {
  return join(schedulerClaimReconcilePlansDir(memory, changePath), `${claimReconcilePlanId}.json`);
}

export function latestSchedulerClaimReconcilePlanPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-claim-reconcile-plan.json");
}

export function latestSchedulerClaimReconcilePlanMarkdownPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-claim-reconcile-plan.md");
}

export function schedulerLaunchPreflightsDir(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-launch-preflights");
}

export function schedulerLaunchPreflightPath(memory: SchedulerArtifactStore, changePath: string, preflightId: string): string {
  return join(schedulerLaunchPreflightsDir(memory, changePath), `${preflightId}.json`);
}

export function latestSchedulerLaunchPreflightPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-launch-preflight.json");
}

export function latestSchedulerLaunchPreflightMarkdownPath(memory: SchedulerArtifactStore, changePath: string): string {
  return join(schedulerPlanningRoot(memory, changePath), "scheduler-launch-preflight.md");
}

export function schedulerRunsDir(memory: SchedulerArtifactStore, _changePath: string): string {
  return memory.runArtifacts.root;
}

export function schedulerRunPath(memory: SchedulerArtifactStore, _changePath: string, schedulerRunId: string): string {
  return memory.runArtifacts.runPath(schedulerRunId);
}

export function schedulerRunJournalPath(memory: SchedulerArtifactStore, _changePath: string, schedulerRunId: string): string {
  return memory.runArtifacts.journalPath(schedulerRunId);
}

export function latestSchedulerRunPath(memory: SchedulerArtifactStore, _changePath: string): string {
  return memory.runArtifacts.latestRunPath();
}

export function latestSchedulerRunMarkdownPath(memory: SchedulerArtifactStore, _changePath: string): string {
  return memory.runArtifacts.latestRunMarkdownPath();
}
