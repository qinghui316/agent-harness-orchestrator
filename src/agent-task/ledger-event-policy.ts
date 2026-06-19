import type { MaintenanceLedgerEventType } from "../types/index.js";

const maintenanceCanonicalEvidenceEvents = [
  "canonical-update-proposal",
  "canonical-update-decision",
  "canonical-patch-proposal",
  "canonical-patch-application-gate",
  "canonical-patch-application-manifest",
  "canonical-patch-application-result",
  "canonical-patch-application-report",
] as const satisfies readonly MaintenanceLedgerEventType[];

const maintenanceCanonicalEvidenceEventSet: ReadonlySet<MaintenanceLedgerEventType> = new Set(maintenanceCanonicalEvidenceEvents);

export function isMaintenanceCanonicalEvidenceEvent(eventType: MaintenanceLedgerEventType): boolean {
  return maintenanceCanonicalEvidenceEventSet.has(eventType);
}

const maintenanceCanonicalEvidenceLedgerSummarySuffixes: Partial<Record<MaintenanceLedgerEventType, string>> = {
  "canonical-update-proposal": "This ledger entry is evidence only and does not authorize canonical rewrites.",
  "canonical-update-decision": "This ledger entry is evidence only and does not authorize canonical rewrites.",
  "canonical-patch-proposal": "This ledger entry is evidence only and does not authorize canonical application.",
  "canonical-patch-application-gate": "This ledger entry is evidence only and does not authorize canonical mutation.",
  "canonical-patch-application-manifest": "This ledger entry is evidence only and does not authorize canonical mutation.",
  "canonical-patch-application-result": "This ledger entry records a human-gated canonical patch application result and must not feed new maintenance candidates.",
  "canonical-patch-application-report": "This ledger entry records read-only observation evidence and must not feed new maintenance candidates or rewrite triggers.",
} as const;

export function buildMaintenanceLedgerEventSummary(eventType: MaintenanceLedgerEventType, artifactSummary: string): string {
  const suffix = maintenanceCanonicalEvidenceLedgerSummarySuffixes[eventType];
  if (!suffix) return artifactSummary;
  return artifactSummary.trimEnd().endsWith(suffix) ? artifactSummary : `${artifactSummary} ${suffix}`;
}

const maintenanceDerivedSummaryEvents = [
  "maintenance-review",
] as const satisfies readonly MaintenanceLedgerEventType[];

const maintenanceDerivedSummaryEventSet: ReadonlySet<MaintenanceLedgerEventType> = new Set(maintenanceDerivedSummaryEvents);

export function isMaintenanceDerivedSummaryEvent(eventType: MaintenanceLedgerEventType): boolean {
  return maintenanceDerivedSummaryEventSet.has(eventType);
}

export function isMaintenanceCandidateSourceEvent(eventType: MaintenanceLedgerEventType): boolean {
  return !isMaintenanceCanonicalEvidenceEvent(eventType) && !isMaintenanceDerivedSummaryEvent(eventType);
}
