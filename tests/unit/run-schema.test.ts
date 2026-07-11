import { describe, expect, it } from "vitest";
import { runMetadataSchema } from "../../src/run/schemas.js";

describe("run metadata schema", () => {
  it("accepts system AHO skill records persisted by real Codex runs", () => {
    const parsed = runMetadataSchema.parse({
      version: "1.0",
      id: "run-system-skill",
      changeId: "change-system-skill",
      projectPath: "E:/repo",
      runtime: "orchestrator",
      command: ["codex", "exec"],
      status: "completed",
      exitCode: 0,
      signal: null,
      startedAt: "2026-07-02T00:00:00.000Z",
      finishedAt: "2026-07-02T00:00:01.000Z",
      artifacts: {
        base: "memory-root",
        directory: "runs/run-system-skill",
        context: "runs/run-system-skill/context.md",
        events: "runs/run-system-skill/events.jsonl",
        stdout: "runs/run-system-skill/stdout.log",
        stderr: "runs/run-system-skill/stderr.log",
      },
      enabledSkills: [{
        id: "aho-harness-engineering",
        runtimeTarget: "codex",
        sourceKind: "system-aho",
        sourceHash: "hash-system",
        materializationMode: "aho-managed",
      }],
    });

    expect(parsed.enabledSkills?.[0]?.sourceKind).toBe("system-aho");
  });
});
