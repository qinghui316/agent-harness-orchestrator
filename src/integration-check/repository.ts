import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { integrationCheckSchema } from "./schemas.js";
import { integrationCheckRoot } from "./paths.js";
import type { IntegrationCheckRecord } from "./types.js";

export async function listIntegrationChecks(memory: ResolvedMemory): Promise<IntegrationCheckRecord[]> {
  const root = integrationCheckRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const checks: IntegrationCheckRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "integration-check.json");
    if (!existsSync(file)) continue;
    checks.push(await readRequiredJsonFile<IntegrationCheckRecord>(file, integrationCheckSchema));
  }
  return checks.sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));
}

export async function readIntegrationCheck(memory: ResolvedMemory, id: string): Promise<IntegrationCheckRecord> {
  return readRequiredJsonFile<IntegrationCheckRecord>(join(integrationCheckRoot(memory), id, "integration-check.json"), integrationCheckSchema);
}

export async function writeCheckArtifacts(memory: ResolvedMemory, directory: string, check: IntegrationCheckRecord): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeJsonFile(join(directory, "integration-check.json"), check);
  await writeFile(join(directory, "summary.md"), renderCheckSummary(check), "utf8");
}

export async function appendIntegrationEvent(directory: string, checkId: string, type: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(directory, { recursive: true });
  const line = JSON.stringify({ timestamp: new Date().toISOString(), type, checkId, data });
  await writeFile(join(directory, "events.jsonl"), `${line}\n`, { encoding: "utf8", flag: "a" });
}

function renderCheckSummary(check: IntegrationCheckRecord): string {
  return [
    `# Integration Check ${check.id}`,
    "",
    `- Status: ${check.status}`,
    `- Summary: ${check.summary}`,
    `- Risk: ${check.riskSummary}`,
    `- Source HEAD: ${check.sourceHead ?? "-"}`,
    `- Latest artifact: ${check.latestArtifactRef ?? "-"} ${check.latestArtifactHash ? `(${check.latestArtifactHash.slice(0, 12)})` : ""}`.trimEnd(),
    "",
    "## Targets",
    ...check.resultTargets.map((target) => `- ${target.changeId} / ${target.worktreeId} / ${target.diffHash.slice(0, 12)}`),
    "",
    "## Aggregate Evidence",
    `- Validation: ${check.aggregateValidation?.status ?? "-"}`,
    `- Audit: ${check.aggregateAudit?.status ?? "-"}`,
    "",
    check.fixAttempts.length ? "## IntegrationFix Attempts" : "",
    ...check.fixAttempts.map((attempt) => `- ${attempt.id}: ${attempt.status} - ${attempt.summary}`),
    "",
    check.blockingIssues.length ? "## Blocking Issues" : "",
    ...check.blockingIssues.map((issue) => `- ${issue}`),
    "",
  ].filter((line, index, list) => line !== "" || list[index - 1] !== "").join("\n");
}
