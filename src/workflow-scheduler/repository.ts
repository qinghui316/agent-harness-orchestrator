import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import {
  latestSchedulerContractMarkdownPath,
  latestSchedulerContractPath,
  latestSchedulerClaimReconcilePlanMarkdownPath,
  latestSchedulerClaimReconcilePlanPath,
  latestSchedulerDispatchDryRunMarkdownPath,
  latestSchedulerDispatchDryRunPath,
  latestSchedulerLaunchPreflightMarkdownPath,
  latestSchedulerLaunchPreflightPath,
  latestSchedulerWorkerSessionPlanMarkdownPath,
  latestSchedulerWorkerSessionPlanPath,
  schedulerContractPath,
  schedulerContractsDir,
  schedulerClaimReconcilePlanPath,
  schedulerClaimReconcilePlansDir,
  schedulerDispatchDryRunPath,
  schedulerDispatchDryRunsDir,
  schedulerLaunchPreflightPath,
  schedulerLaunchPreflightsDir,
  schedulerWorkerSessionPlanPath,
  schedulerWorkerSessionPlansDir,
} from "./paths.js";
import { renderSchedulerClaimReconcilePlanMarkdown, renderSchedulerContractMarkdown, renderSchedulerDispatchDryRunMarkdown, renderSchedulerLaunchPreflightMarkdown, renderSchedulerWorkerSessionPlanMarkdown } from "./rendering.js";
import { schedulerClaimReconcilePlanSchema, schedulerContractSchema, schedulerDispatchDryRunSchema, schedulerLaunchPreflightSchema, schedulerWorkerSessionPlanSchema } from "./schemas.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerWorkerSessionPlan } from "./types.js";

export async function writeSchedulerContract(memory: ResolvedMemory, changePath: string, contract: SchedulerContract): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerContract");
  const dir = schedulerContractsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${contract.id}.json`), contract);
  await writeFile(join(dir, `${contract.id}.md`), renderSchedulerContractMarkdown(contract), "utf8");
  await writeJsonFile(latestSchedulerContractPath(memory, changePath), contract);
  await writeFile(latestSchedulerContractMarkdownPath(memory, changePath), renderSchedulerContractMarkdown(contract), "utf8");
}

export async function readLatestSchedulerContract(memory: ResolvedMemory, changePath: string): Promise<SchedulerContract> {
  const contract = await readRequiredJsonFile(latestSchedulerContractPath(memory, changePath), schedulerContractSchema);
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerContract");
  return contract;
}

export async function readSchedulerContract(memory: ResolvedMemory, changePath: string, schedulerContractId: string): Promise<SchedulerContract> {
  const contract = await readRequiredJsonFile(schedulerContractPath(memory, changePath, schedulerContractId), schedulerContractSchema);
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerContract");
  return contract;
}

export function schedulerContractArtifactRefs(memory: ResolvedMemory, changePath: string, schedulerContractId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerContractsDir(memory, changePath);
  return {
    artifact: displayArtifactPath(memory, join(dir, `${schedulerContractId}.json`)),
    markdownArtifact: displayArtifactPath(memory, join(dir, `${schedulerContractId}.md`)),
  };
}

export async function writeSchedulerDispatchDryRun(memory: ResolvedMemory, changePath: string, dryRun: SchedulerDispatchDryRun): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerDispatchDryRun");
  const dir = schedulerDispatchDryRunsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${dryRun.id}.json`), dryRun);
  await writeFile(join(dir, `${dryRun.id}.md`), renderSchedulerDispatchDryRunMarkdown(dryRun), "utf8");
  await writeJsonFile(latestSchedulerDispatchDryRunPath(memory, changePath), dryRun);
  await writeFile(latestSchedulerDispatchDryRunMarkdownPath(memory, changePath), renderSchedulerDispatchDryRunMarkdown(dryRun), "utf8");
}

export async function readLatestSchedulerDispatchDryRun(memory: ResolvedMemory, changePath: string): Promise<SchedulerDispatchDryRun> {
  const dryRun = await readRequiredJsonFile(latestSchedulerDispatchDryRunPath(memory, changePath), schedulerDispatchDryRunSchema);
  await assertWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerDispatchDryRun");
  return dryRun;
}

export async function readSchedulerDispatchDryRun(memory: ResolvedMemory, changePath: string, dryRunId: string): Promise<SchedulerDispatchDryRun> {
  const dryRun = await readRequiredJsonFile(schedulerDispatchDryRunPath(memory, changePath, dryRunId), schedulerDispatchDryRunSchema);
  await assertWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerDispatchDryRun");
  return dryRun;
}

export function schedulerDispatchDryRunArtifactRefs(memory: ResolvedMemory, changePath: string, dryRunId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerDispatchDryRunsDir(memory, changePath);
  return {
    artifact: displayArtifactPath(memory, join(dir, `${dryRunId}.json`)),
    markdownArtifact: displayArtifactPath(memory, join(dir, `${dryRunId}.md`)),
  };
}

export async function writeSchedulerWorkerSessionPlan(memory: ResolvedMemory, changePath: string, plan: SchedulerWorkerSessionPlan): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, plan, "SchedulerWorkerSessionPlan");
  const dir = schedulerWorkerSessionPlansDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${plan.id}.json`), plan);
  await writeFile(join(dir, `${plan.id}.md`), renderSchedulerWorkerSessionPlanMarkdown(plan), "utf8");
  await writeJsonFile(latestSchedulerWorkerSessionPlanPath(memory, changePath), plan);
  await writeFile(latestSchedulerWorkerSessionPlanMarkdownPath(memory, changePath), renderSchedulerWorkerSessionPlanMarkdown(plan), "utf8");
}

export async function readLatestSchedulerWorkerSessionPlan(memory: ResolvedMemory, changePath: string): Promise<SchedulerWorkerSessionPlan> {
  const plan = await readRequiredJsonFile(latestSchedulerWorkerSessionPlanPath(memory, changePath), schedulerWorkerSessionPlanSchema);
  await assertWorkflowArtifactScope(memory, changePath, plan, "SchedulerWorkerSessionPlan");
  return plan;
}

export async function readSchedulerWorkerSessionPlan(memory: ResolvedMemory, changePath: string, workerPlanId: string): Promise<SchedulerWorkerSessionPlan> {
  const plan = await readRequiredJsonFile(schedulerWorkerSessionPlanPath(memory, changePath, workerPlanId), schedulerWorkerSessionPlanSchema);
  await assertWorkflowArtifactScope(memory, changePath, plan, "SchedulerWorkerSessionPlan");
  return plan;
}

export function schedulerWorkerSessionPlanArtifactRefs(memory: ResolvedMemory, changePath: string, workerPlanId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerWorkerSessionPlansDir(memory, changePath);
  return {
    artifact: displayArtifactPath(memory, join(dir, `${workerPlanId}.json`)),
    markdownArtifact: displayArtifactPath(memory, join(dir, `${workerPlanId}.md`)),
  };
}

export async function writeSchedulerClaimReconcilePlan(memory: ResolvedMemory, changePath: string, plan: SchedulerClaimReconcilePlan): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, plan, "SchedulerClaimReconcilePlan");
  const dir = schedulerClaimReconcilePlansDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${plan.id}.json`), plan);
  await writeFile(join(dir, `${plan.id}.md`), renderSchedulerClaimReconcilePlanMarkdown(plan), "utf8");
  await writeJsonFile(latestSchedulerClaimReconcilePlanPath(memory, changePath), plan);
  await writeFile(latestSchedulerClaimReconcilePlanMarkdownPath(memory, changePath), renderSchedulerClaimReconcilePlanMarkdown(plan), "utf8");
}

export async function readLatestSchedulerClaimReconcilePlan(memory: ResolvedMemory, changePath: string): Promise<SchedulerClaimReconcilePlan> {
  const plan = await readRequiredJsonFile(latestSchedulerClaimReconcilePlanPath(memory, changePath), schedulerClaimReconcilePlanSchema);
  await assertWorkflowArtifactScope(memory, changePath, plan, "SchedulerClaimReconcilePlan");
  return plan;
}

export async function readSchedulerClaimReconcilePlan(memory: ResolvedMemory, changePath: string, claimReconcilePlanId: string): Promise<SchedulerClaimReconcilePlan> {
  const plan = await readRequiredJsonFile(schedulerClaimReconcilePlanPath(memory, changePath, claimReconcilePlanId), schedulerClaimReconcilePlanSchema);
  await assertWorkflowArtifactScope(memory, changePath, plan, "SchedulerClaimReconcilePlan");
  return plan;
}

export function schedulerClaimReconcilePlanArtifactRefs(memory: ResolvedMemory, changePath: string, claimReconcilePlanId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerClaimReconcilePlansDir(memory, changePath);
  return {
    artifact: displayArtifactPath(memory, join(dir, `${claimReconcilePlanId}.json`)),
    markdownArtifact: displayArtifactPath(memory, join(dir, `${claimReconcilePlanId}.md`)),
  };
}

export async function writeSchedulerLaunchPreflight(memory: ResolvedMemory, changePath: string, preflight: SchedulerLaunchPreflight): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, preflight, "SchedulerLaunchPreflight");
  const dir = schedulerLaunchPreflightsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${preflight.id}.json`), preflight);
  await writeFile(join(dir, `${preflight.id}.md`), renderSchedulerLaunchPreflightMarkdown(preflight), "utf8");
  await writeJsonFile(latestSchedulerLaunchPreflightPath(memory, changePath), preflight);
  await writeFile(latestSchedulerLaunchPreflightMarkdownPath(memory, changePath), renderSchedulerLaunchPreflightMarkdown(preflight), "utf8");
}

export async function readLatestSchedulerLaunchPreflight(memory: ResolvedMemory, changePath: string): Promise<SchedulerLaunchPreflight> {
  const preflight = await readRequiredJsonFile(latestSchedulerLaunchPreflightPath(memory, changePath), schedulerLaunchPreflightSchema);
  await assertWorkflowArtifactScope(memory, changePath, preflight, "SchedulerLaunchPreflight");
  return preflight;
}

export async function readSchedulerLaunchPreflight(memory: ResolvedMemory, changePath: string, preflightId: string): Promise<SchedulerLaunchPreflight> {
  const preflight = await readRequiredJsonFile(schedulerLaunchPreflightPath(memory, changePath, preflightId), schedulerLaunchPreflightSchema);
  await assertWorkflowArtifactScope(memory, changePath, preflight, "SchedulerLaunchPreflight");
  return preflight;
}

export function schedulerLaunchPreflightArtifactRefs(memory: ResolvedMemory, changePath: string, preflightId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerLaunchPreflightsDir(memory, changePath);
  return {
    artifact: displayArtifactPath(memory, join(dir, `${preflightId}.json`)),
    markdownArtifact: displayArtifactPath(memory, join(dir, `${preflightId}.md`)),
  };
}
