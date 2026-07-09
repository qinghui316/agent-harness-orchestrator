import type { ChangeIndexItem, CloseGateResult } from "../types/index.js";

export function evaluateActiveCount(activeChanges: ChangeIndexItem[]): CloseGateResult {
  if (activeChanges.length === 0) {
    return { ready: false, warnings: [], blockingIssues: ["No active change found."] };
  }
  if (activeChanges.length > 1) {
    return { ready: false, warnings: [], blockingIssues: [`Expected exactly one active change; found ${activeChanges.length}.`] };
  }
  return { ready: true, warnings: [], blockingIssues: [] };
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
