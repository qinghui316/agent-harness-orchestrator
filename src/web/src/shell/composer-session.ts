export type ComposerExecutionMode = "request-approval" | "full-access";

const STORAGE_PREFIX = "aho.workbench.composerMode";
const DEFAULT_MODE: ComposerExecutionMode = "request-approval";

export function normalizeComposerExecutionMode(value: unknown): ComposerExecutionMode {
  return value === "full-access" ? "full-access" : "request-approval";
}

export function composerExecutionModeLabel(mode: ComposerExecutionMode): string {
  return mode === "full-access" ? "自动推进" : "逐步确认";
}

export function readComposerExecutionMode(projectId: string | null, topicId: string | null): ComposerExecutionMode {
  const storage = getComposerModeStorage();
  if (!projectId || !storage) return DEFAULT_MODE;
  const stored = storage.getItem(composerExecutionModeStorageKey(projectId, topicId));
  return normalizeComposerExecutionMode(stored);
}

export function writeComposerExecutionMode(projectId: string | null, topicId: string | null, mode: ComposerExecutionMode): void {
  const storage = getComposerModeStorage();
  if (!projectId || !storage) return;
  storage.setItem(composerExecutionModeStorageKey(projectId, topicId), normalizeComposerExecutionMode(mode));
}

export function migrateDraftComposerExecutionMode(projectId: string | null, topicId: string, mode: ComposerExecutionMode): ComposerExecutionMode {
  if (!projectId || !getComposerModeStorage()) return normalizeComposerExecutionMode(mode);
  const draftMode = readComposerExecutionMode(projectId, null);
  const resolved = normalizeComposerExecutionMode(draftMode ?? mode);
  writeComposerExecutionMode(projectId, topicId, resolved);
  return resolved;
}

function composerExecutionModeStorageKey(projectId: string, topicId: string | null): string {
  return `${STORAGE_PREFIX}:${projectId}:${topicId ?? "__draft__"}`;
}

function getComposerModeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    return null;
  }
  return storage;
}
