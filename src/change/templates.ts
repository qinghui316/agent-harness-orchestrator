import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getChangeTemplateRoot } from "./paths.js";
import type { ResolvedMemory } from "../types/index.js";

export async function renderTemplate(memory: ResolvedMemory, file: string, title: string): Promise<string> {
  const path = join(getChangeTemplateRoot(memory), file);
  if (!existsSync(path)) {
    throw new Error(`Missing change template file: ${path}.`);
  }
  const raw = await readFile(path, "utf8");
  return raw.replaceAll("{title}", title);
}

export function normalizeInitialContent(file: string, content: string, body: string | undefined): string {
  if (file === "summary.md") return appendRawRequest(content, body);
  if (file === "spec.md") return ensureSpecHasAc(content);
  if (file === "tasks.md") return ensureTasksHaveDefault(content);
  return content.endsWith("\n") ? content : `${content}\n`;
}

function appendRawRequest(content: string, body: string | undefined): string {
  const base = content.endsWith("\n") ? content : `${content}\n`;
  const request = body?.trim() ? body.trim() : "Not provided.";
  if (/^## Raw Request\s*$/im.test(base)) {
    return base.replace(/(^## Raw Request\s*$)([\s\S]*?)(?=^## |\s*$)/im, `$1\n\n${request}\n\n`);
  }
  return `${base}\n## Raw Request\n\n${request}\n`;
}

function ensureSpecHasAc(content: string): string {
  if (/\bAC-\d{3,}\b/i.test(content)) return content.endsWith("\n") ? content : `${content}\n`;
  const replaced = content.replace(/(\n## Acceptance Criteria\s*\n\s*)[-*]\s*TBD\s*/i, "$1- AC-001: TBD\n");
  if (replaced !== content) return replaced.endsWith("\n") ? replaced : `${replaced}\n`;
  return `${content.trimEnd()}\n\n## Acceptance Criteria\n\n- AC-001: TBD\n`;
}

function ensureTasksHaveDefault(content: string): string {
  if (/\bT-\d{3,}\b/i.test(content)) return content.endsWith("\n") ? content : `${content}\n`;
  const task = "- [ ] T-001: TBD\n  - Covers: AC-001";
  const replaced = content.replace(/^\s*[-*]\s*(?:\[\s\]\s*)?TBD\s*$/im, task);
  if (replaced !== content) return replaced.endsWith("\n") ? replaced : `${replaced}\n`;
  return `${content.trimEnd()}\n\n${task}\n`;
}
