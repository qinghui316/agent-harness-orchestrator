import { describe, expect, it } from "vitest";

import {
  agentRunSurfaceId,
  agentSurfaceId,
  agentThreadSurfaceId,
} from "../../src/provider-runtime/agent-surface-id.js";

describe("provider-neutral Agent surface identity", () => {
  it("uses one encoded provider and thread identity", () => {
    expect(agentThreadSurfaceId("provider/a", "thread:b c")).toBe(
      "agent:provider%2Fa:thread:thread%3Ab%20c",
    );
  });

  it("uses the canonical run fallback only when no thread exists", () => {
    expect(agentSurfaceId({ providerId: "codex", threadId: "child-1", runId: "run-1" }))
      .toBe("agent:codex:thread:child-1");
    expect(agentSurfaceId({ providerId: "codex", runId: "run/1" }))
      .toBe(agentRunSurfaceId("codex", "run/1"));
    expect(agentRunSurfaceId("codex", "run/1")).toBe("agent:codex:run:run%2F1");
  });

  it("rejects incomplete identity components", () => {
    expect(() => agentThreadSurfaceId(" ", "thread-1")).toThrow(/providerId/);
    expect(() => agentThreadSurfaceId("codex", " ")).toThrow(/threadId/);
    expect(() => agentRunSurfaceId("codex", " ")).toThrow(/runId/);
  });
});
