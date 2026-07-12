import { describe, expect, it } from "vitest";
import { createCanonicalMaintenanceTarget } from "../../src/agent-task/maintenance-target.js";

describe("canonical maintenance assignment descriptor", () => {
  it("points execution at canonical roots without materializing an isolated workspace", async () => {
    const descriptor = await createCanonicalMaintenanceTarget({
      assignmentId: "assignment-1", memoryMode: "external-local",
      memoryRoot: "C:/memory", namespaces: ["docs"],
      additionalSources: [{ key: "project", root: "C:/project", namespaces: ["AGENTS.md"] }],
    });
    expect(descriptor).toMatchObject({
      mode: "canonical-direct", baseRoot: expect.stringMatching(/memory$/i), namespaces: ["docs"],
      additionalSources: [{ key: "project", root: expect.stringMatching(/project$/i), namespaces: ["AGENTS.md"] }],
    });
  });

  it("rejects unsafe namespaces and assignment ids", async () => {
    await expect(createCanonicalMaintenanceTarget({
      assignmentId: "bad/id", memoryMode: "external-local", memoryRoot: "C:/memory",
      namespaces: ["docs"],
    })).rejects.toThrow("unsafe characters");
    await expect(createCanonicalMaintenanceTarget({
      assignmentId: "safe", memoryMode: "external-local", memoryRoot: "C:/memory",
      namespaces: ["../docs"],
    })).rejects.toThrow("Invalid maintenance namespace");
  });
});
