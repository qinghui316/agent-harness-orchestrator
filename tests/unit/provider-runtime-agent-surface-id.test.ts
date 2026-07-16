import { describe, expect, it } from "vitest";

import { agentThreadSurfaceId } from "../../src/provider-runtime/agent-surface-id.js";

describe("provider-neutral Agent surface identity", () => {
  it("uses one encoded provider and thread identity", () => {
    expect(agentThreadSurfaceId("provider/a", "thread:b c")).toBe(
      "agent:provider%2Fa:thread:thread%3Ab%20c",
    );
  });

  it("rejects incomplete identity components", () => {
    expect(() => agentThreadSurfaceId(" ", "thread-1")).toThrow(/providerId/);
    expect(() => agentThreadSurfaceId("codex", " ")).toThrow(/threadId/);
  });
});
