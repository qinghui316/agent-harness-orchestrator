import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ResolvedMemory, ValidationResult, ValidationSummary } from "../types/index.js";

const validationCommandSchema = z.object({
  name: z.string(),
  command: z.array(z.string()),
  cwd: z.string(),
  status: z.enum(["passed", "failed"]),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string(),
  stdout: z.string(),
  stderr: z.string(),
});

export const validationResultSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  profile: z.string(),
  status: z.enum(["passed", "failed"]),
  executionMode: z.enum(["direct", "worktree"]),
  worktreeId: z.string().optional(),
  worktreeDiffHash: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  commands: z.array(validationCommandSchema),
});

export async function listValidationResults(memory: ResolvedMemory, changeId?: string): Promise<ValidationResult[]> {
  if (!existsSync(memory.runsRoot)) return [];
  const entries = await readdir(memory.runsRoot, { withFileTypes: true });
  const results: ValidationResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(memory.runsRoot, entry.name, "validation.json");
    if (!existsSync(path)) continue;
    const result = await readValidationResult(memory, entry.name);
    if (!changeId || result.changeId === changeId) results.push(result);
  }
  return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readValidationResult(memory: ResolvedMemory, validationId: string): Promise<ValidationResult> {
  const path = join(memory.runsRoot, validationId, "validation.json");
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return validationResultSchema.parse(parsed) as ValidationResult;
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
