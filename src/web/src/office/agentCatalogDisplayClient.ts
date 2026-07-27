import type { AgentCatalogDisplayProjection, AgentCatalogDisplayRole } from "../types.js";

export async function loadAgentCatalogDisplayProjection(
  projectId: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<AgentCatalogDisplayProjection> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/workbench/projections/agent-catalog`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Agent Catalog request failed with HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (!isAgentCatalogDisplayProjection(value)) throw new Error("Agent Catalog response is invalid.");
  return value;
}

export function isAgentCatalogDisplayProjection(value: unknown): value is AgentCatalogDisplayProjection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentCatalogDisplayProjection>;
  return typeof candidate.version === "string"
    && typeof candidate.catalogHash === "string"
    && Array.isArray(candidate.roles)
    && candidate.roles.every(isDisplayRole);
}

function isDisplayRole(value: unknown): value is AgentCatalogDisplayRole {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentCatalogDisplayRole>;
  return typeof candidate.roleId === "string"
    && typeof candidate.displayName === "string"
    && typeof candidate.description === "string"
    && Array.isArray(candidate.skills)
    && candidate.skills.every((skill) => typeof skill === "string");
}
