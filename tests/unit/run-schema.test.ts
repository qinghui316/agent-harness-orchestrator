import { describe, expect, it } from "vitest";
import { integrationCheckSchema } from "../../src/integration-check/schemas.js";
import { runMetadataSchema } from "../../src/run/schemas.js";
import { classifyWorkflowResult } from "../../src/task-run/workflow-result.js";

describe("run metadata schema", () => {
  it("preserves provider interruption as resumable runtime evidence", () => {
    const run = runMetadataSchema.parse({
      version: "1.0",
      id: "run-interrupted",
      changeId: "change-interrupted",
      projectPath: "E:/repo",
      runtime: "provider-code",
      command: ["provider", "turn.start"],
      status: "interrupted",
      exitCode: 1,
      signal: null,
      startedAt: "2026-07-15T00:00:00.000Z",
      finishedAt: "2026-07-15T00:00:01.000Z",
      artifacts: { directory: "runs/run-interrupted", context: "context.md", events: "events.jsonl", stdout: "stdout.log", stderr: "stderr.log" },
    });
    expect(run.status).toBe("interrupted");
    expect(classifyWorkflowResult({ stoppedAt: "code", code: { run } })).toEqual({ status: "interrupted" });
  });
  it("accepts system AHO skill records persisted by provider runs", () => {
    const parsed = runMetadataSchema.parse({
      version: "1.0",
      id: "run-system-skill",
      changeId: "change-system-skill",
      projectPath: "E:/repo",
      runtime: "orchestrator",
      command: ["test-provider", "turn.start"],
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
        providerId: "test-provider",
        sourceKind: "system-aho",
        sourceHash: "hash-system",
        materializationMode: "aho-managed",
      }],
    });

    expect(parsed.enabledSkills?.[0]?.sourceKind).toBe("system-aho");
  });

  it("accepts provider-backed integration repairs and rejects the retired Codex mode", () => {
    const record = {
      version: "1.0",
      id: "integration-provider-repair",
      projectId: "repo",
      status: "failed",
      resultTargets: [],
      sourceHead: null,
      createdAt: "2026-07-15T00:00:00.000Z",
      summary: "Provider repair attempted.",
      riskSummary: "No source apply occurred.",
      artifactRefs: [],
      fixAttempts: [{
        id: "fix-1",
        roleId: "integration-fix-agent",
        status: "completed",
        repairMode: "provider",
        reason: "aggregate validation failed",
        inputArtifactRef: "combined.patch",
        summary: "Provider produced a candidate repair.",
        startedAt: "2026-07-15T00:00:00.000Z",
        finishedAt: "2026-07-15T00:00:01.000Z",
      }],
      blockingIssues: [],
      warnings: [],
    } as const;

    expect(integrationCheckSchema.parse(record).fixAttempts[0]?.repairMode).toBe("provider");
    expect(() => integrationCheckSchema.parse({
      ...record,
      fixAttempts: [{ ...record.fixAttempts[0], repairMode: "codex" }],
    })).toThrow();
  });
});
