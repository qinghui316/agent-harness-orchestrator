import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AuditResult, AuditSummary, ResolvedMemory } from "../types/index.js";

const auditFindingSchema = z.object({
  severity: z.enum(["blocking", "note"]),
  area: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  text: z.string(),
});

export const auditResultSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  status: z.enum(["approved", "approved-with-notes", "blocked", "failed"]),
  worktreeId: z.string().optional(),
  validationId: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  findings: z.array(auditFindingSchema),
  artifacts: z.object({
    audit: z.string(),
    auditMarkdown: z.string(),
    lastMessage: z.string(),
    diff: z.string().optional(),
    diffStat: z.string().optional(),
  }),
});

export async function listAuditResults(memory: ResolvedMemory, changeId?: string): Promise<AuditResult[]> {
  if (!existsSync(memory.runsRoot)) return [];
  const entries = await readdir(memory.runsRoot, { withFileTypes: true });
  const results: AuditResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(memory.runsRoot, entry.name, "audit.json");
    if (!existsSync(path)) continue;
    const result = await readAuditResult(memory, entry.name);
    if (!changeId || result.changeId === changeId) results.push(result);
  }
  return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readAuditResult(memory: ResolvedMemory, auditId: string): Promise<AuditResult> {
  const path = join(memory.runsRoot, auditId, "audit.json");
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return auditResultSchema.parse(parsed) as AuditResult;
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
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    findingCount: result.findings.length,
  };
}
