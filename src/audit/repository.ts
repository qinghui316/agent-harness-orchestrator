import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile } from "../fs/json.js";
import type { AuditResult, AuditSummary, ResolvedMemory } from "../types/index.js";
import { assertAuditScope } from "./guards.js";
import { auditResultSchema } from "./schemas.js";

export interface AuditReadOptions {
  changeId?: string;
}

export async function listAuditResults(memory: ResolvedMemory, changeId?: string): Promise<AuditResult[]> {
  if (!existsSync(memory.runsRoot)) return [];
  const entries = await readdir(memory.runsRoot, { withFileTypes: true });
  const results: AuditResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(memory.runsRoot, entry.name, "audit.json");
    if (!existsSync(path)) continue;
    try {
      const result = await readAuditResult(memory, entry.name, changeId ? { changeId } : {});
      results.push(result);
    } catch {
      continue;
    }
  }
  return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readAuditResult(memory: ResolvedMemory, auditId: string, options: AuditReadOptions = {}): Promise<AuditResult> {
  const path = join(memory.runsRoot, auditId, "audit.json");
  const result = await readRequiredJsonFile(path, auditResultSchema) as AuditResult;
  assertAuditScope(result, { expectedId: auditId, changeId: options.changeId });
  return result;
}

export async function getLatestAuditSummary(memory: ResolvedMemory, changeId: string): Promise<AuditSummary | null> {
  const results = await listAuditResults(memory, changeId);
  const latest = results[0];
  return latest ? summarizeAudit(latest) : null;
}

export function summarizeAudit(result: AuditResult): AuditSummary {
  return {
    id: result.id,
    runId: result.runId,
    changeId: result.changeId,
    status: result.status,
    worktreeId: result.worktreeId,
    validationId: result.validationId,
    worktreeDiffHash: result.worktreeDiffHash,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    findingCount: result.findings.length,
  };
}
