import type { AgentCatalog, AgentCatalogEntry } from "../agent/catalog.js";
import type { ProviderOperationProfile } from "../provider-runtime/index.js";

const OPERATION_PROFILE_BY_ROLE: Readonly<Record<string, ProviderOperationProfile>> = {
  "planning-agent": "planning",
  "coder-agent": "coder",
  "auditor-agent": "auditor",
  "rework-coder": "coder",
  "spec-test-proposer": "auditor",
  "spec-test-generator": "coder",
  "harness-evolution-agent": "evolution",
};

export interface RegisteredAgentExecutionProfile {
  catalogEntry: AgentCatalogEntry;
  operationProfile: ProviderOperationProfile;
}

export function resolveRegisteredAgentExecutionProfile(
  catalog: AgentCatalog,
  roleId: string | null | undefined,
): RegisteredAgentExecutionProfile | null {
  if (!roleId) return null;
  const operationProfile = OPERATION_PROFILE_BY_ROLE[roleId];
  if (!operationProfile) return null;
  const catalogEntry = catalog.agents.find((entry) => entry.roleId === roleId);
  return catalogEntry ? { catalogEntry, operationProfile } : null;
}

export function registeredAgentOperationProfile(
  catalog: AgentCatalog,
  roleId: string | null | undefined,
): ProviderOperationProfile | null {
  return resolveRegisteredAgentExecutionProfile(catalog, roleId)?.operationProfile ?? null;
}
