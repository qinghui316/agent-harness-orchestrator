import { createHash } from "node:crypto";
import type { HarnessExecutionMode, ProductMode, ProviderCapabilitySnapshot, RunnableProductMode } from "./types.js";

export const PROVIDER_CAPABILITY_SNAPSHOT_VERSION = 2;
export const HARNESS_EXECUTION_MODES: HarnessExecutionMode[] = ["stepwise", "scoped-auto"];
export const RUNNABLE_PRODUCT_MODES: RunnableProductMode[] = ["harness"];

export function isRunnableProductMode(mode: ProductMode): mode is RunnableProductMode {
  return mode === "harness";
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
