import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";

export const PROJECT_HARNESS_CHANGE_EVIDENCE_FILES = [
  "summary.md",
  "spec.md",
  "plan.md",
  "tasks.md",
  "reviews/review.md",
] as const;

export interface ProjectHarnessChangeEvidenceValidation {
  valid: boolean;
  issues: string[];
}

const TASK = /^- \[(?<done>[ xX])]\s+(?<task>T-?\d{3,})\b(?<body>.*)$/;
const ACCEPTANCE = /\bAC-\d{3,}\b/gi;
const ACCEPTANCE_DEFINITION = /^\s*[-*]\s*(?<id>AC-\d{3,})\s*:\s*(?<value>.*)$/gim;

export async function validateProjectHarnessChangeEvidence(
  evidenceRoot: string,
): Promise<ProjectHarnessChangeEvidenceValidation> {
  const root = await assertPhysicalDirectory(evidenceRoot, "Change evidence");
  const resolved = new Map<string, string>();
  const issues: string[] = [];
  for (const path of PROJECT_HARNESS_CHANGE_EVIDENCE_FILES) {
    const absolute = await resolveWithinPhysicalRoot(root, path, "Change evidence document");
    if (existsSync(absolute)) resolved.set(path, absolute);
    else issues.push(`missing ${path}`);
  }
  if (issues.length > 0) return { valid: false, issues };
  const texts = Object.fromEntries(await Promise.all(PROJECT_HARNESS_CHANGE_EVIDENCE_FILES.map(async (path) =>
    [path, await readFile(resolved.get(path)!, "utf8")] as const)));
  if (/\[NEEDS CLARIFICATION\s*:/i.test(texts["spec.md"])) {
    issues.push("spec.md contains unresolved high-impact clarification");
  }
  if (!/^\s*[-*]\s*(?:Status:\s*approved|Approved:\s*yes)\s*$/im.test(texts["plan.md"])) {
    issues.push("plan.md does not record an approved plan review");
  }
  if (!/^\s*[-*]\s*Approved:\s*yes\s*$/im.test(texts["reviews/review.md"])) {
    issues.push("reviews/review.md does not approve the plan");
  }

  const acceptanceIds = new Set<string>();
  for (const match of texts["spec.md"].matchAll(ACCEPTANCE_DEFINITION)) {
    const id = match.groups?.id.toUpperCase();
    const value = match.groups?.value.trim();
    if (!id) continue;
    acceptanceIds.add(id);
    if (!value || /\bTBD\b/i.test(value)) issues.push(`acceptance criterion ${id} has no completed value`);
  }
  if (acceptanceIds.size === 0) issues.push("spec.md contains no acceptance criterion");

  const tasks: Array<{ id: string; done: boolean; lines: string[] }> = [];
  for (const line of texts["tasks.md"].split(/\r?\n/)) {
    const match = line.trim().match(TASK);
    if (match?.groups) {
      tasks.push({ id: match.groups.task, done: match.groups.done.toLowerCase() === "x", lines: [match.groups.body] });
    } else if (tasks.length > 0) {
      tasks[tasks.length - 1].lines.push(line);
    }
  }
  if (tasks.length === 0) issues.push("tasks.md contains no structured tasks");
  const mappedAcceptance = new Set<string>();
  for (const task of tasks) {
    const block = task.lines.join("\n");
    if (!task.done) issues.push(`unfinished task ${task.id}`);
    for (const match of block.matchAll(ACCEPTANCE)) mappedAcceptance.add(match[0].toUpperCase());
    const ownerPath = taskField(block, "owner/path");
    const owner = taskField(block, "owner");
    const path = taskField(block, "path");
    if (!ownerPath && !(owner && path)) issues.push(`task ${task.id} has no valid owner/path mapping`);
    if (!taskField(block, "validation")) issues.push(`task ${task.id} has no valid validation mapping`);
  }
  for (const id of [...acceptanceIds].sort()) {
    if (!mappedAcceptance.has(id)) issues.push(`acceptance criterion ${id} has no task mapping`);
  }
  return { valid: issues.length === 0, issues };
}

function taskField(block: string, field: string): string | null {
  const match = block.match(new RegExp(`(?:^|[;\\n])\\s*(?:[-*]\\s*)?${escapeRegex(field)}\\s*:\\s*([^;\\n]+)`, "i"));
  const value = match?.[1].trim();
  return value && !/\bTBD\b/i.test(value) ? value : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
