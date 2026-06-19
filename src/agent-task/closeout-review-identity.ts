import type { DemandMemoryCloseout, MaintenanceLedgerEntry } from "../types/index.js";

type CloseoutReviewIdentity = Pick<DemandMemoryCloseout, "changeId" | "terminalKind">;
type CloseoutLedgerIdentity = Pick<MaintenanceLedgerEntry, "eventType" | "changeId" | "summary">;

const CLOSEOUT_SUMMARY_PREFIXES: Array<{
  terminalKind: DemandMemoryCloseout["terminalKind"];
  pattern: RegExp;
}> = [
  { terminalKind: "archived", pattern: /^archived closeout recorded:/i },
  { terminalKind: "applied", pattern: /^applied closeout recorded:/i },
  { terminalKind: "remote-handoff", pattern: /^remote-handoff closeout recorded:/i },
  { terminalKind: "merged", pattern: /^merged closeout recorded:/i },
];

export function closeoutReviewKey(closeout: CloseoutReviewIdentity): string {
  return `${closeout.changeId}:${closeout.terminalKind}`;
}

export function closeoutReviewKeyForLedgerEntry(entry: CloseoutLedgerIdentity): string | null {
  if (entry.eventType !== "change-closeout" || !entry.changeId) return null;
  const terminalKind = inferCloseoutTerminalKindFromSummary(entry.summary);
  if (!terminalKind) return null;
  return closeoutReviewKey({ changeId: entry.changeId, terminalKind });
}

function inferCloseoutTerminalKindFromSummary(summary: string): DemandMemoryCloseout["terminalKind"] | null {
  return CLOSEOUT_SUMMARY_PREFIXES.find((item) => item.pattern.test(summary))?.terminalKind ?? null;
}
