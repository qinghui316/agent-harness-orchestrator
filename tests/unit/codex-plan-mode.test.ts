import { describe, expect, it, vi } from "vitest";
import { codexPlanModeAvailable } from "../../src/codex/collaboration-modes.js";
import { codexPlanCollaborationMode } from "../../src/provider-runtime/codex-adapter.js";
import type { ProviderTurnRequest } from "../../src/provider-runtime/index.js";

describe("Codex Plan mode boundary", () => {
  it("detects Plan only from the private collaborationMode/list response", async () => {
    const requestMetadata = vi.fn(async () => ({
      data: [
        { name: "Default", mode: null },
        { name: "Plan", mode: "plan", model: "gpt-test" },
      ],
    }));

    await expect(codexPlanModeAvailable("C:\\project", { requestMetadata })).resolves.toBe(true);
    expect(requestMetadata).toHaveBeenCalledWith("collaborationMode/list", {});
    await expect(codexPlanModeAvailable("C:\\project", {
      requestMetadata: async () => ({ data: [{ name: "Default", mode: null }] }),
    })).resolves.toBe(false);
  });

  it("builds the complete private payload only from the admitted effective model", () => {
    expect(codexPlanCollaborationMode({
      agentTurnMode: "plan",
      model: { providerId: "codex", modelId: "gpt-test" },
    } as ProviderTurnRequest)).toEqual({
      mode: "plan",
      settings: {
        model: "gpt-test",
        reasoning_effort: null,
        developer_instructions: null,
      },
    });
    expect(() => codexPlanCollaborationMode({ agentTurnMode: "plan", model: null } as ProviderTurnRequest))
      .toThrow("admitted effective model");
  });
});
