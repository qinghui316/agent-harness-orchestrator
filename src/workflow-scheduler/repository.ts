import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { latestSchedulerContractMarkdownPath, latestSchedulerContractPath, schedulerContractPath, schedulerContractsDir } from "./paths.js";
import { renderSchedulerContractMarkdown } from "./rendering.js";
import { schedulerContractSchema } from "./schemas.js";
import type { SchedulerContract } from "./types.js";

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
