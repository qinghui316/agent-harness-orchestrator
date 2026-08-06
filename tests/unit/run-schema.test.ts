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
      artifacts: { owner: "runtime-sidecar", directory: "runs/run-interrupted", context: "runs/run-interrupted/context.md", events: "runs/run-interrupted/events.jsonl", stdout: "runs/run-interrupted/stdout.log", stderr: "runs/run-interrupted/stderr.log" },
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
        owner: "runtime-sidecar",
        directory: "runs/run-system-skill",
        context: "runs/run-system-skill/context.md",
        events: "runs/run-system-skill/events.jsonl",
        stdout: "runs/run-system-skill/stdout.log",
        stderr: "runs/run-system-skill/stderr.log",
        providerStderr: "runs/run-system-skill/provider-stderr.log",
        providerLastMessage: "runs/run-system-skill/provider-last-message.md",
      },
      enabledSkills: [{
        id: "aho-harness-engineering",
        providerId: "test-provider",
        source: "aho-system",
        path: "E:/aho/system-skills/aho-harness-engineering/SKILL.md",
        contentHash: "hash-system",
        required: true,
      }],
    });

    expect(parsed.enabledSkills?.[0]?.source).toBe("aho-system");
    expect(parsed.artifacts.providerStderr).toBe("runs/run-system-skill/provider-stderr.log");
    expect(parsed.artifacts.providerLastMessage).toBe("runs/run-system-skill/provider-last-message.md");
  });

  it("rejects retired Agent and context packet compatibility records", () => {
    const current = {
      version: "1.0",
      id: "run-historical-context",
      changeId: "change-historical-context",
      projectPath: "E:/repo",
      runtime: "validator",
      command: ["validator", "default"],
      status: "completed",
      exitCode: 0,
      signal: null,
      startedAt: "2026-07-02T00:00:00.000Z",
      finishedAt: "2026-07-02T00:00:01.000Z",
      artifacts: {
        owner: "runtime-sidecar",
        directory: "runs/run-historical-context",
        context: "runs/run-historical-context/context.md",
        contextPacket: "runs/run-historical-context/context-packet.json",
        events: "runs/run-historical-context/events.jsonl",
        stdout: "runs/run-historical-context/stdout.log",
        stderr: "runs/run-historical-context/stderr.log",
      },
      contextPacket: {
        ref: "runs/run-historical-context/context-packet.json",
        hash: "a".repeat(64),
        format: "role-context-packet@2.0",
      },
      agent: {
        roleId: "coder-agent",
        source: "bundled",
        sourcePath: "templates/agent-profiles/coder-agent.md",
        sourceHash: "b".repeat(64),
        catalogVersion: "1.0",
        catalogHash: "c".repeat(64),
      },
    } as const;

    expect(runMetadataSchema.parse(current).contextPacket?.format).toBe("role-context-packet@2.0");
    expect(() => runMetadataSchema.parse({
      ...current,
      contextPacket: { ...current.contextPacket, format: "role-context-packet@1.0" },
    })).toThrow();
    expect(() => runMetadataSchema.parse({
      ...current,
      agent: { ...current.agent, source: "memory" },
    })).toThrow();
  });

  it("requires explicit current artifact ownership", () => {
    const base = {
      version: "1.0",
      id: "run-owner-required",
      changeId: "change-owner-required",
      projectPath: "E:/repo",
      runtime: "validator",
      command: ["validator", "default"],
      status: "completed",
      exitCode: 0,
      signal: null,
      startedAt: "2026-07-02T00:00:00.000Z",
      finishedAt: "2026-07-02T00:00:01.000Z",
      artifacts: {
        directory: "runs/run-owner-required",
        context: "runs/run-owner-required/context.md",
        events: "runs/run-owner-required/events.jsonl",
        stdout: "runs/run-owner-required/stdout.log",
        stderr: "runs/run-owner-required/stderr.log",
      },
    };

    expect(() => runMetadataSchema.parse(base)).toThrow();
    expect(() => runMetadataSchema.parse({
      ...base,
      artifacts: { ...base.artifacts, owner: "memory-root" },
    })).toThrow();
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
