import { describe, expect, it } from "vitest";
import { workspaceResourceModeHandoff } from "../../src/web/src/controllers/workspaceResourceModeHandoff.js";

describe("workspace resource mode convergence handoff", () => {
  it("carries the captured snapshot productMode into the controller argument", () => {
    const snapshot = { productMode: "agent" as const };
    const options = { projectId: "project-1", conversationId: "conversation-1" };

    expect(workspaceResourceModeHandoff(snapshot, options)).toEqual({
      ...options,
      productMode: snapshot.productMode,
    });
  });
});
