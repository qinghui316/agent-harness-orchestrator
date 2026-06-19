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
