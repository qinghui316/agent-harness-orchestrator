import { createHash } from "node:crypto";
import type { CodexCapabilities } from "../codex/capabilities.js";
import type { CodexEffectiveModelSource } from "../codex/model-settings.js";
import { PROVIDER_CAPABILITY_SNAPSHOT_VERSION } from "./codex.js";

export interface CodexProviderRunMetadataInput {
  model: string | null;
  modelSource: CodexEffectiveModelSource;
  capabilities?: Pick<CodexCapabilities, "available" | "supportsJson" | "supportsSandbox" | "supportsCd" | "supportsSafeResume">;
  adapter?: string;
}

export function codexProviderRunMetadata(input: CodexProviderRunMetadataInput): Record<string, unknown> {
  const adapter = input.adapter ?? "codex-exec";
  const capabilityIdentity = {
    providerId: "codex",
    productMode: "harness",
    snapshotVersion: PROVIDER_CAPABILITY_SNAPSHOT_VERSION,
    adapter,
    model: input.model,
    modelSource: input.modelSource,
    capabilities: input.capabilities
      ? {
          available: input.capabilities.available,
          json: input.capabilities.supportsJson,
          sandbox: input.capabilities.supportsSandbox,
          cwd: input.capabilities.supportsCd,
          safeResume: input.capabilities.supportsSafeResume,
        }
      : null,
  };
  return {
    providerId: "codex",
    productMode: "harness",
    adapter,
    model: input.model,
    modelSource: input.modelSource,
    capabilitySnapshotVersion: PROVIDER_CAPABILITY_SNAPSHOT_VERSION,
    capabilitySnapshotHash: createHash("sha256").update(JSON.stringify(capabilityIdentity)).digest("hex").slice(0, 16),
  };
}
