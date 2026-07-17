import { describe, expect, it } from "vitest";
import { selectEffectiveProviderId } from "../../src/web/src/controllers/useProviderConfigurationController.js";
import type { ProviderCapabilitySnapshot } from "../../src/web/src/types.js";

const provider = (providerId: string): ProviderCapabilitySnapshot => ({
  providerId,
  displayName: providerId,
  productMode: "harness",
  status: "ready",
  runnable: true,
  capabilities: [],
  snapshotHash: `hash-${providerId}`,
  snapshotVersion: 1,
  capturedAt: "2026-07-17T00:00:00.000Z",
});

describe("provider configuration controller", () => {
  it("keeps the conversation provider ahead of local and project defaults", () => {
    expect(selectEffectiveProviderId({
      conversationProviderId: "claude",
      selectedProviderId: "codex",
      projectDefaultProviderId: "codex",
      capabilities: [provider("codex"), provider("claude")],
    })).toBe("claude");
  });

  it("does not invent a selection when multiple providers have no explicit owner", () => {
    expect(selectEffectiveProviderId({
      conversationProviderId: null,
      selectedProviderId: null,
      projectDefaultProviderId: null,
      capabilities: [provider("codex"), provider("claude")],
    })).toBeNull();
  });
});
