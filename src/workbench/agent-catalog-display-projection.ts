import { readBundledAgentCatalog, hashText, type AgentCatalog } from "../agent/catalog.js";
import type { AgentCatalogDisplayProjection } from "./agent-catalog-display-contract.js";
import type { WorkbenchProjectInput } from "./read-model-types.js";

export async function getAgentCatalogDisplayProjection(input: WorkbenchProjectInput): Promise<AgentCatalogDisplayProjection> {
  if (!input.project) throw notFound("Agent Catalog is unavailable without a registered project.");
  return buildAgentCatalogDisplayProjection(readBundledAgentCatalog());
}

export function buildAgentCatalogDisplayProjection(catalog: AgentCatalog): AgentCatalogDisplayProjection {
  return {
    version: catalog.version,
    catalogHash: hashText(JSON.stringify(catalog)),
    roles: catalog.agents.map((entry) => ({
      roleId: entry.roleId,
      displayName: entry.displayName,
      description: entry.description,
      skills: [...entry.allowedSkills],
    })),
  };
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFound";
  return error;
}
