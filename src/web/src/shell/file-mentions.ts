import type { TopicFileReference } from "../types.js";

export type FileMentionResult = {
  cleanedText: string;
  refs: TopicFileReference[];
};

export type FileMentionTrigger = {
  query: string;
  start: number;
  end: number;
};

export function findFileMentionTrigger(text: string): FileMentionTrigger | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text);
  if (!match) return null;
  const prefixLength = match[1]?.length ?? 0;
  const triggerIndex = match.index + prefixLength;
  return {
    query: match[2] ?? "",
    start: triggerIndex,
    end: text.length,
  };
}

export function replaceFileMentionTrigger(text: string, trigger: FileMentionTrigger, ref: TopicFileReference): string {
  const token = `@${quotePathIfNeeded(ref.relativePath)}`;
  const before = text.slice(0, trigger.start);
  const after = text.slice(trigger.end);
  const separator = after.length === 0 || !/^\s/.test(after) ? " " : "";
  return `${before}${token}${separator}${after}`;
}

export function extractInlineFileMentions(text: string, selectedRefs: TopicFileReference[]): FileMentionResult {
  if (selectedRefs.length === 0 || !/@\S/.test(text)) return { cleanedText: text, refs: selectedRefs };
  const refs: TopicFileReference[] = [];
  const seen = new Set<string>();
  let cleaned = text;
  for (const ref of selectedRefs) {
    if (seen.has(ref.relativePath)) continue;
    seen.add(ref.relativePath);
    refs.push(ref);
    cleaned = removeKnownToken(cleaned, ref.relativePath);
  }
  return {
    cleanedText: cleaned.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim(),
    refs,
  };
}

export function mergeFileRefs(current: TopicFileReference[], next: TopicFileReference): TopicFileReference[] {
  if (current.some((ref) => ref.relativePath === next.relativePath)) return current;
  return [...current, next];
}

export function removeFileRef(current: TopicFileReference[], relativePath: string): TopicFileReference[] {
  return current.filter((ref) => ref.relativePath !== relativePath);
}

function removeKnownToken(text: string, relativePath: string): string {
  const quoted = quotePathIfNeeded(relativePath);
  const patterns = [
    `@${escapeRegExp(relativePath)}`,
    `@${escapeRegExp(quoted)}`,
  ];
  let next = text;
  for (const pattern of patterns) {
    next = next.replace(new RegExp(`(^|\\s)${pattern}(?=\\s|$)`, "g"), "$1");
  }
  return next;
}

function quotePathIfNeeded(path: string): string {
  return /\s/.test(path) ? `\`${path}\`` : path;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
