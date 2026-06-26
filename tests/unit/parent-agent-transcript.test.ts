import { describe, expect, it } from "vitest";
import { buildParentAgentTranscript, pageParentAgentTranscript } from "../../src/workbench/parent-agent-transcript.js";

describe("parent agent transcript paging", () => {
  it("keeps the full transcript compatible and returns the latest page by default", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Long demand" },
      threadItems: Array.from({ length: 8 }, (_, index) => ({
        id: `msg-${index}`,
        kind: "user-message",
        label: `message ${index}`,
        body: `message ${index}`,
      })),
    });

    expect(transcript.cells).toHaveLength(8);
    expect(transcript.paging).toBeUndefined();

    const page = pageParentAgentTranscript(transcript, { limit: 3 });
    expect(page.cells.map((cell) => cell.text)).toEqual(["message 5", "message 6", "message 7"]);
    expect(page.items).toHaveLength(3);
    expect(page.paging).toEqual({
      limit: 3,
      totalCount: 8,
      hasMoreBefore: true,
      nextBeforeCursor: "cell:user:msg-5",
    });
  });

  it("returns earlier cells before the cursor without changing cell ids or order", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Long demand" },
      threadItems: Array.from({ length: 6 }, (_, index) => ({
        id: `msg-${index}`,
        kind: "user-message",
        label: `message ${index}`,
        body: `message ${index}`,
      })),
    });

    const page = pageParentAgentTranscript(transcript, { limit: 2, beforeCursor: "cell:user:msg-4" });
    expect(page.cells.map((cell) => cell.id)).toEqual(["cell:user:msg-2", "cell:user:msg-3"]);
    expect(page.paging?.hasMoreBefore).toBe(true);
    expect(page.paging?.nextBeforeCursor).toBe("cell:user:msg-2");
  });

  it("keeps synthetic large transcript paging bounded without durable pressure fixtures", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Synthetic pressure" },
      threadItems: syntheticThreadItems(10_000),
    });

    expect(transcript.cells).toHaveLength(10_000);
    const latest = pageParentAgentTranscript(transcript, { limit: 100 });
    expect(latest.cells).toHaveLength(100);
    expect(latest.cells[0]?.id).toBe("cell:user:msg-9900");
    expect(latest.cells.at(-1)?.id).toBe("cell:assistant:block-9999");
    expect(latest.paging).toEqual({
      limit: 100,
      totalCount: 10_000,
      hasMoreBefore: true,
      nextBeforeCursor: "cell:user:msg-9900",
    });

    const earlier = pageParentAgentTranscript(transcript, { limit: 100, beforeCursor: latest.paging?.nextBeforeCursor });
    expect(earlier.cells).toHaveLength(100);
    expect(earlier.cells[0]?.id).toBe("cell:user:msg-9800");
    expect(earlier.cells.at(-1)?.id).toBe("cell:assistant:block-9899");
  });
});

function syntheticThreadItems(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(Date.UTC(2026, 5, 26, 0, 0, index % 60)).toISOString();
    if (index % 2 === 0) {
      return {
        id: `msg-${index}`,
        kind: "user-message",
        label: `Scoped user request ${index}`,
        body: `Please update bounded transcript fixture ${index}.`,
        timestamp,
      };
    }
    return {
      id: `msg-${index}`,
      kind: "assistant-turn",
      label: `assistant ${index}`,
      timestamp,
      blocks: [{
        id: `block-${index}`,
        sequence: index,
        kind: "prose" as const,
        timestamp,
        source: "codex" as const,
        title: `Codex response ${index}`,
        text: `Synthetic assistant transcript body ${index}. ${"detail ".repeat(index % 8)}`,
      }],
    };
  });
}
