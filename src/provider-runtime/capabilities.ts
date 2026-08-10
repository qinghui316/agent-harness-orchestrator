import { createHash } from "node:crypto";
import type { HarnessExecutionMode, ProductMode, ProviderCapabilitySnapshot } from "./types.js";

export const PROVIDER_CAPABILITY_SNAPSHOT_VERSION = 2;
export const HARNESS_EXECUTION_MODES: HarnessExecutionMode[] = ["stepwise", "scoped-auto"];
export const PRODUCT_MODES = ["agent", "harness"] as const satisfies readonly ProductMode[];

export function parseProductMode(value: unknown): ProductMode | null {
  return typeof value === "string" && PRODUCT_MODES.includes(value as ProductMode)
    ? value as ProductMode
    : null;
}

export function assertProductMode(value: unknown, label = "productMode"): ProductMode {
  const mode = parseProductMode(value);
  if (!mode) throw new Error(label + " must be agent or harness.");
  return mode;
}

export function stableCapabilitySnapshotHash(input: Omit<ProviderCapabilitySnapshot, "snapshotHash">): string {
  const stable = {
    providerId: input.providerId,
    productMode: input.productMode,
    snapshotVersion: input.snapshotVersion,
    status: input.status,
    runnable: input.runnable,
    effectiveModel: input.effectiveModel,
    effectiveModelSource: input.effectiveModelSource,
    capabilities: input.capabilities.map((item) => ({
      key: item.key,
      spec: item.spec,
      runtime: item.runtime,
      reason: item.reason ?? null,
    })),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 16);
}
