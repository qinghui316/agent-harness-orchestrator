// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  providerCapabilitiesPath,
  selectEffectiveProviderId,
  useProviderConfigurationController,
} from "../../src/web/src/controllers/useProviderConfigurationController.js";
import type { ProductMode, ProviderCapabilitySnapshot } from "../../src/web/src/types.js";

const provider = (providerId: string, productMode: ProductMode = "harness"): ProviderCapabilitySnapshot => ({
  providerId,
  displayName: providerId,
  productMode,
  status: "ready",
  runnable: true,
  capabilities: [],
  snapshotHash: `hash-${providerId}`,
  snapshotVersion: 1,
  capturedAt: "2026-07-17T00:00:00.000Z",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it("builds explicit global and project mode capability paths", () => {
    expect(providerCapabilitiesPath(null, "agent")).toBe("/api/providers/capabilities?productMode=agent");
    expect(providerCapabilitiesPath("repo", "harness")).toBe("/api/projects/repo/providers/capabilities?productMode=harness");
  });

  it("does not apply a late capability response from the previous mode", async () => {
    let resolveAgent!: (response: Response) => void;
    const agentResponse = new Promise<Response>((resolve) => { resolveAgent = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("capabilities?productMode=agent")) return agentResponse;
      if (url.includes("capabilities?productMode=harness")) return json({ providers: [provider("harness-provider", "harness")] });
      if (url.endsWith("/diagnostics")) return json({
        providerId: "harness-provider",
        displayName: "Harness provider",
        installation: {},
        models: {},
      });
      if (url.endsWith("/models")) return json({
        providerId: "harness-provider",
        effectiveModel: null,
        effectiveModelSource: "provider-default",
        candidates: [],
        available: true,
      });
      return json({});
    }));
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ productMode }: { productMode: ProductMode }) => useProviderConfigurationController({
        projectId: "repo",
        productMode,
        projectDefaultProviderId: null,
        conversationProviderId: null,
        onError,
      }),
      { initialProps: { productMode: "agent" as ProductMode } },
    );

    rerender({ productMode: "harness" });
    await waitFor(() => expect(result.current.capabilities[0]?.providerId).toBe("harness-provider"));
    resolveAgent(json({ providers: [provider("stale-agent", "agent")] }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.capabilities.map((item) => item.providerId)).toEqual(["harness-provider"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not surface a late capability failure from the previous mode", async () => {
    let rejectAgent!: (cause: Error) => void;
    const agentResponse = new Promise<Response>((_resolve, reject) => { rejectAgent = reject; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("capabilities?productMode=agent")) return agentResponse;
      if (url.includes("capabilities?productMode=harness")) return json({ providers: [] });
      return json({});
    }));
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ productMode }: { productMode: ProductMode }) => useProviderConfigurationController({
        projectId: "repo",
        productMode,
        projectDefaultProviderId: null,
        conversationProviderId: null,
        onError,
      }),
      { initialProps: { productMode: "agent" as ProductMode } },
    );

    rerender({ productMode: "harness" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/projects/repo/providers/capabilities?productMode=harness",
    ));
    rejectAgent(new Error("stale agent failure"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).not.toHaveBeenCalled();
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
