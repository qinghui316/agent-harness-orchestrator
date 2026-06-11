import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import {
  latestSchedulerContractMarkdownPath,
  latestSchedulerContractPath,
  latestSchedulerDispatchDryRunMarkdownPath,
  latestSchedulerDispatchDryRunPath,
  schedulerContractPath,
  schedulerContractsDir,
  schedulerDispatchDryRunPath,
  schedulerDispatchDryRunsDir,
} from "./paths.js";
import { renderSchedulerContractMarkdown, renderSchedulerDispatchDryRunMarkdown } from "./rendering.js";
import { schedulerContractSchema, schedulerDispatchDryRunSchema } from "./schemas.js";
import type { SchedulerContract, SchedulerDispatchDryRun } from "./types.js";

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
