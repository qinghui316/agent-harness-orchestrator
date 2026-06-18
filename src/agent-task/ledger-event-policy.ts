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
