import { HarnessOfficeAdapter } from "./harnessOfficeAdapter.js";
import { parseOfficeCalibrationDocument, type OfficeCalibrationDocument } from "./officeCalibrationDocument.js";
import { OfficeCalibrationResolver } from "./officeCalibrationResolver.js";

export const OFFICE_CALIBRATION_URL = "/agent-office/config/office-calibration.json";

export type AgentOfficeRuntimeComposition = {
  document: Readonly<OfficeCalibrationDocument>;
  resolver: OfficeCalibrationResolver;
  adapter: HarnessOfficeAdapter;
};

export async function loadAgentOfficeRuntimeComposition(
  projectId: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<AgentOfficeRuntimeComposition> {
  const response = await fetcher(OFFICE_CALIBRATION_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Office calibration request failed with HTTP ${response.status}.`);
  const document = parseOfficeCalibrationDocument(await response.json());
  const resolver = new OfficeCalibrationResolver(document);
  return {
    document,
    resolver,
    adapter: new HarnessOfficeAdapter(projectId, resolver),
  };
}
