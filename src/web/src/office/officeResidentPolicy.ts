import type { AgentCatalogDisplayProjection, AgentCatalogDisplayRole } from "../types.js";

export const OFFICE_RESIDENT_ROLE_IDS = ["memory-maintenance-agent", "harness-evolution-agent"] as const;

export function officeResidentId(roleId: string): string {
  return `resident:${roleId}`;
}

export function officeResidentRoles(catalog: AgentCatalogDisplayProjection | null): AgentCatalogDisplayRole[] {
  if (!catalog) return [];
  const byId = new Map(catalog.roles.map((role) => [role.roleId, role] as const));
  return OFFICE_RESIDENT_ROLE_IDS.flatMap((roleId) => {
    const role = byId.get(roleId);
    return role ? [role] : [];
  });
}

export function officeResidentRoleForId(
  catalog: AgentCatalogDisplayProjection | null,
  residentId: string | null,
): AgentCatalogDisplayRole | null {
  if (!residentId) return null;
  return officeResidentRoles(catalog).find((role) => officeResidentId(role.roleId) === residentId) ?? null;
}
