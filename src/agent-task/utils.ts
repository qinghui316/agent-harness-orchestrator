import type { DemandMemoryCloseout } from "../types/index.js";

export function inferAffectedModules(files: string[]): string[] {
  return uniqueSorted(files.map((file) => file.replace(/\\/g, "/").split("/")[0]).filter(Boolean));
}

export function normalizeCandidateText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function estimateWordCount(text: string): number {
  const latinWords = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9FFF]/g)?.length ?? 0;
  return latinWords + Math.ceil(cjkChars / 2);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

export function closeoutReviewKey(closeout: DemandMemoryCloseout): string {
  return `${closeout.changeId}:${closeout.terminalKind}`;
}

export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "item";
}

export function contentHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
