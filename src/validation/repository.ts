import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile } from "../fs/json.js";
import type { ResolvedMemory, ValidationResult, ValidationSummary } from "../types/index.js";
import { assertValidationScope } from "./guards.js";
import { validationResultSchema } from "./schemas.js";

export interface ValidationReadOptions {
  changeId?: string;
}

export async function listValidationResults(memory: ResolvedMemory, changeId?: string): Promise<ValidationResult[]> {
  if (!existsSync(memory.runsRoot)) return [];
  const entries = await readdir(memory.runsRoot, { withFileTypes: true });
  const results: ValidationResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(memory.runsRoot, entry.name, "validation.json");
    if (!existsSync(path)) continue;
    try {
      const result = await readValidationResult(memory, entry.name, changeId ? { changeId } : {});
      results.push(result);
    } catch {
      continue;
    }
  }
  return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readValidationResult(memory: ResolvedMemory, validationId: string, options: ValidationReadOptions = {}): Promise<ValidationResult> {
  const path = join(memory.runsRoot, validationId, "validation.json");
  const result = await readRequiredJsonFile(path, validationResultSchema) as ValidationResult;
  assertValidationScope(result, { expectedId: validationId, changeId: options.changeId });
  return result;
}

export interface ValidationLookupFilter {
  worktreeId?: string;
  worktreeDiffHash?: string;
}

export async function getLatestValidationSummary(memory: ResolvedMemory, changeId: string, filter: ValidationLookupFilter = {}): Promise<ValidationSummary | null> {
  const results = (await listValidationResults(memory, changeId)).filter((item) => {
    if (filter.worktreeId && item.worktreeId !== filter.worktreeId) return false;
    if (filter.worktreeDiffHash && item.worktreeDiffHash !== filter.worktreeDiffHash) return false;
    return true;
  });
  const latest = results[0];
  return latest ? summarizeValidation(latest) : null;
}

export function summarizeValidation(result: ValidationResult): ValidationSummary {
  return {
    id: result.id,
    runId: result.runId,
    changeId: result.changeId,
    profile: result.profile,
    status: result.status,
    executionMode: result.executionMode,
    worktreeId: result.worktreeId,
    worktreeDiffHash: result.worktreeDiffHash,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    commandCount: result.commands.length,
  };
}
