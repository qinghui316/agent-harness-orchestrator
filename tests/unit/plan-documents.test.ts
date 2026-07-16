import { describe, expect, it } from "vitest";
import { attachCanonicalPlanDocument, canonicalPlanDocumentText, normalizePlanDocumentText } from "../../src/workbench/plan-documents.js";

describe("canonical Plan documents", () => {
  it("attaches one immutable document to the final provider item after normalized content validation", () => {
    const planMd = "# Plan\r\n\r\nImplement the requested behavior.\r\n";
    const capture = childCapture("# Plan\n\nImplement the requested behavior.");
    const document = attachCanonicalPlanDocument({
      captures: [capture],
      proposal: proposal(planMd),
      providerId: "codex",
      attemptId: "attempt-child",
      sourceMessageIdForCapture: () => "message-plan",
    });
    const entry = { id: "message-plan", type: "assistant.message" as const, timestamp: "2026-07-16T00:00:00.000Z", changeId: "", blocks: capture.blocks, document };
    expect(document).toMatchObject({ documentId: expect.stringMatching(/^plan-document-/), sourceCanonicalItemId: capture.blocks[0]?.id });
    expect(canonicalPlanDocumentText(entry, document)).toBe(normalizePlanDocumentText(planMd));
  });

  it("fails closed when the final item text or provider-qualified identity does not match", () => {
    expect(() => attachCanonicalPlanDocument({
      captures: [childCapture("different")],
      proposal: proposal("# Plan\n\nExpected"),
      providerId: "codex",
      attemptId: "attempt-child",
      sourceMessageIdForCapture: () => "message-plan",
    })).toThrow("does not match plan.md");
    const capture = childCapture("# Plan");
    capture.blocks[0]!.itemId = undefined;
    expect(() => attachCanonicalPlanDocument({
      captures: [capture],
      proposal: proposal("# Plan"),
      providerId: "codex",
      attemptId: "attempt-child",
      sourceMessageIdForCapture: () => "message-plan",
    })).toThrow("identity is incomplete");
  });

  it("normalizes line endings and trailing blank lines without changing Markdown whitespace", () => {
    expect(normalizePlanDocumentText("  # Plan\r\nfirst line  \r\nsecond line\r\n \r\n")).toBe("  # Plan\nfirst line  \nsecond line");
    expect(normalizePlanDocumentText("# Plan\nfirst line  \nsecond line")).not.toBe(normalizePlanDocumentText("# Plan\nfirst line\nsecond line"));
  });
});

function childCapture(text: string) {
  return {
    canonicalId: "child:codex:attempt-child:thread-plan:turn-plan",
    providerId: "codex",
    attemptId: "attempt-child",
    runId: "run-plan",
    threadId: "thread-plan",
    parentThreadId: "thread-main",
    turnId: "turn-plan",
    roleId: "planning-agent",
    activity: [],
    blocks: [{
      id: "prose:codex:attempt-child:thread-plan:turn-plan:item-plan",
      providerId: "codex",
      attemptId: "attempt-child",
      runId: "run-plan",
      threadId: "thread-plan",
      turnId: "turn-plan",
      itemId: "item-plan",
      sequence: 1,
      kind: "prose" as const,
      timestamp: "2026-07-16T00:00:00.000Z",
      source: "provider" as const,
      text,
    }],
  };
}

function proposal(planMd: string) {
  return {
    version: "1.0" as const,
    id: "proposal-1",
    hash: "proposal-hash",
    projectId: "repo",
    conversationId: "conversation-1",
    runId: "run-plan",
    parentThreadId: "thread-main",
    childThreadId: "thread-plan",
    createdAt: "2026-07-16T00:00:00.000Z",
    artifact: "proposal.json",
    status: "proposed" as const,
    specMd: "# Spec",
    planMd,
    tasksMd: "# Tasks",
    openQuestions: [],
    assumptions: [],
    warnings: [],
    notesMd: "",
  };
}
