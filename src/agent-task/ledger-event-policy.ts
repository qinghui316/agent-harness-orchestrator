import type { MaintenanceLedgerEventType } from "../types/index.js";

export function buildMaintenanceLedgerEventSummary(eventType: MaintenanceLedgerEventType, artifactSummary: string): string {
  void eventType;
  return artifactSummary;
}

export function isMaintenanceCandidateSourceEvent(eventType: MaintenanceLedgerEventType): boolean {
  return eventType !== "archive" && eventType !== "apply" && eventType !== "remote-landing" && eventType !== "failure";
}
