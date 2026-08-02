import { AgentSurfaceOfficeSourceAdapter } from "./agentSurfaceOfficeSourceAdapter.js";
import { parseOfficeCalibrationDocument, type OfficeCalibrationDocument } from "./officeCalibrationDocument.js";
import { OfficeCalibrationResolver } from "./officeCalibrationResolver.js";
import { loadAgentCatalogDisplayProjection } from "./agentCatalogDisplayClient.js";
import type { AgentCatalogDisplayProjection } from "../types.js";
import { OfficeExperienceComposer } from "./officeExperienceComposer.js";
import { OfficeActivityCompiler } from "./officeActivityCompiler.js";
import { OfficeBehaviorPolicy } from "./officeBehaviorPolicy.js";
import { OfficeAmbientPolicy } from "./officeAmbientPolicy.js";

export const OFFICE_CALIBRATION_URL = "/agent-office/config/office-calibration.json";

export type AgentOfficeRuntimeComposition = {
  document: Readonly<OfficeCalibrationDocument>;
  resolver: OfficeCalibrationResolver;
  sourceAdapter: AgentSurfaceOfficeSourceAdapter;
  experience: OfficeExperienceComposer;
  behavior: OfficeBehaviorPolicy;
  ambient: OfficeAmbientPolicy;
  activities: OfficeActivityCompiler;
  catalog: AgentCatalogDisplayProjection | null;
  catalogError: string | null;
};

export async function loadAgentOfficeRuntimeComposition(
  projectId: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<AgentOfficeRuntimeComposition> {
  const catalogRequest = loadAgentCatalogDisplayProjection(projectId, fetcher)
    .then((catalog) => ({ catalog, error: null }))
    .catch((cause: unknown) => ({ catalog: null, error: cause instanceof Error ? cause.message : String(cause) }));
  const response = await fetcher(OFFICE_CALIBRATION_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Office calibration request failed with HTTP ${response.status}.`);
  const document = parseOfficeCalibrationDocument(await response.json());
  const catalogResult = await catalogRequest;
  const resolver = new OfficeCalibrationResolver(document);
  return {
    document,
    resolver,
    sourceAdapter: new AgentSurfaceOfficeSourceAdapter(),
    experience: new OfficeExperienceComposer(projectId, resolver, catalogResult.catalog, undefined, catalogResult.error),
    behavior: new OfficeBehaviorPolicy(),
    ambient: new OfficeAmbientPolicy(),
    activities: new OfficeActivityCompiler(resolver),
    catalog: catalogResult.catalog,
    catalogError: catalogResult.error,
  };
}
