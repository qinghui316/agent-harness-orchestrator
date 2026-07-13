import type { RoleScopedContextProjection } from "../types/index.js";
import { uniqueSorted } from "./utils.js";

export function buildRoleScopedContextProjection(input: {
  roleId: string;
  currentDemandRefs?: string[];
  stableMemoryRefs?: string[];
  roleEvidenceRefs?: string[];
  selectedHistoryRefs?: string[];
}): RoleScopedContextProjection {
  const maintenanceRole = /documentation|architecture|evolution|memory-maintenance|maintenance/i.test(input.roleId);
  const included = uniqueSorted([
    ...(input.currentDemandRefs ?? []),
    ...(input.stableMemoryRefs ?? []),
    ...(input.roleEvidenceRefs ?? []),
    ...(maintenanceRole ? (input.selectedHistoryRefs ?? []) : (input.selectedHistoryRefs ?? []).slice(0, 3)),
  ]);
  return {
    version: "1.0",
    roleId: input.roleId,
    allowedMemoryTier: maintenanceRole ? "maintenance-hot-warm-cold" : "compact-stable",
    includesMaintenanceWindow: maintenanceRole,
    includedSources: included,
    excludedSources: maintenanceRole
      ? ["unassigned project history", "Runtime state not supplied as task evidence"]
      : ["hot/warm/cold maintenance window", "raw stdout/stderr/jsonl", "all archive history"],
    createdAt: new Date().toISOString(),
  };
}
