import { describe, expect, it } from "vitest";
import { validatePlanHandoffIntent } from "../../src/workbench/plan-handoff.js";
import { planDocumentContentHash } from "../../src/workbench/plan-documents.js";
import type { TopicThreadEntry } from "../../src/workbench/types.js";

describe("Plan handoff canonical identity", () => {
  it("resolves only the exact document item and proposal identity", () => {
    const source = planEntry();
    const document = source.document!;
    expect(validatePlanHandoffIntent([source], {
      kind: "execute-plan",
      sourceRunId: "run-plan",
      sourceAgentRoleId: "planning-agent",
      sourceArtifact: document.proposalArtifact,
      sourceDocumentId: document.documentId,
      sourceCanonicalItemId: document.sourceCanonicalItemId,
      sourceProposalHash: document.proposalHash,
    })).toMatchObject({
      planText: "# Plan\n\nCanonical plan.",
      sourceDocumentId: document.documentId,
      sourceArtifact: document.proposalArtifact,
    });
  });

  it("fails closed for missing, stale, or superseded document identity", () => {
    const source = planEntry();
    const base = {
      kind: "execute-plan" as const,
      sourceRunId: "run-plan",
      sourceAgentRoleId: "planning-agent" as const,
      sourceArtifact: source.document!.proposalArtifact,
      sourceDocumentId: source.document!.documentId,
      sourceCanonicalItemId: source.document!.sourceCanonicalItemId,
      sourceProposalHash: source.document!.proposalHash,
    };
    expect(() => validatePlanHandoffIntent([source], { ...base, sourceProposalHash: "stale" })).toThrow("no longer matches");
    expect(() => validatePlanHandoffIntent([{ ...source, status: "superseded" }], base)).toThrow("stale or unavailable");
    expect(() => validatePlanHandoffIntent([source], { kind: "execute-plan", sourceRunId: "run-plan", sourceAgentRoleId: "planning-agent" })).toThrow("identity is missing");
  });

  it("rejects an older Plan after a newer document is created in the same scope", () => {
    const older = planEntry();
    const newer = planEntry("2");
    const document = older.document!;
    expect(() => validatePlanHandoffIntent([older, newer], {
      kind: "execute-plan",
      sourceRunId: older.runId!,
      sourceAgentRoleId: "planning-agent",
      sourceArtifact: document.proposalArtifact,
      sourceDocumentId: document.documentId,
      sourceCanonicalItemId: document.sourceCanonicalItemId,
      sourceProposalHash: document.proposalHash,
    })).toThrow("superseded by a newer proposal");
  });
});

function planEntry(suffix = ""): TopicThreadEntry {
  const text = "# Plan\n\nCanonical plan.";
  const token = suffix ? `-${suffix}` : "";
  const sourceCanonicalItemId = `prose:codex:attempt${token}:thread${token}:turn${token}:item${token}`;
  const document = {
    documentId: `plan-document${token || "-1"}`,
    documentKind: "plan" as const,
    title: "实现计划",
    sourceMessageId: `message-plan${token}`,
    sourceCanonicalItemId,
    proposalId: `proposal${token || "-1"}`,
    proposalHash: `proposal-hash${token}`,
    proposalArtifact: `proposal${token}.json`,
    contentHash: planDocumentContentHash(text),
    agentSurfaceId: "agent:codex:thread:planner",
  };
  return {
    id: `message-plan${token}`,
    type: "assistant.message",
    timestamp: "2026-07-16T00:00:00.000Z",
    conversationId: "conversation-1",
    graphScopeId: "scope-1",
    changeId: "",
    status: "completed",
    runId: `run-plan${token}`,
    providerId: "codex",
    attemptId: `attempt${token}`,
    threadId: `thread${token}`,
    turnId: `turn${token}`,
    agentRoleId: "planning-agent",
    artifact: document.proposalArtifact,
    document,
    blocks: [{
      id: sourceCanonicalItemId,
      providerId: "codex",
      attemptId: `attempt${token}`,
      threadId: `thread${token}`,
      turnId: `turn${token}`,
      itemId: `item${token}`,
      sequence: 1,
      kind: "prose",
      timestamp: "2026-07-16T00:00:00.000Z",
      source: "provider",
      text,
      document,
    }],
  };
}
