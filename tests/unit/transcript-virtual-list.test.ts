import { describe, expect, it } from "vitest";
import { calculateTranscriptVirtualRange } from "../../src/web/src/panels/workbench/TranscriptVirtualList.js";
import {
  estimateTranscriptCellHeight,
  isLongTranscriptCell,
  transcriptCellDisplayText,
} from "../../src/web/src/panels/workbench/transcriptMeasurement.js";
import type { ParentAgentTranscriptCell } from "../../src/web/src/types.js";

describe("transcript virtual list pressure guards", () => {
  it("keeps a 50k row transcript range bounded to visible rows plus overscan", () => {
    const heights = Array.from({ length: 50_000 }, (_, index) => index % 7 === 0 ? 144 : 84);

    const range = calculateTranscriptVirtualRange({
      heights,
      scrollTop: 1_250_000,
      viewportHeight: 760,
      overscan: 10,
    });

    expect(range.totalHeight).toBeGreaterThan(4_000_000);
    expect(range.start).toBeGreaterThan(0);
    expect(range.end).toBeLessThanOrEqual(50_000);
    expect(range.end - range.start).toBeLessThanOrEqual(32);
    expect(range.topSpacer).toBeGreaterThan(0);
    expect(range.bottomSpacer).toBeGreaterThan(0);
  });

  it("folds long transcript cells and keeps fallback height estimation finite", () => {
    const hiddenSentinel = "SYNTHETIC_LONG_MESSAGE_END";
    const cell: ParentAgentTranscriptCell = {
      id: "cell:assistant:long",
      kind: "assistant-message",
      source: "codex-runtime",
      text: `Visible preview\n${"long output line\n".repeat(160)}${hiddenSentinel}`,
    };

    expect(isLongTranscriptCell(cell)).toBe(true);
    const foldedText = transcriptCellDisplayText(cell, false);
    expect(foldedText).toContain("Visible preview");
    expect(foldedText).not.toContain(hiddenSentinel);
    expect(foldedText.length).toBeLessThan(cell.text.length);

    const foldedHeight = estimateTranscriptCellHeight(cell, { expanded: false, width: 720 });
    const expandedHeight = estimateTranscriptCellHeight(cell, { expanded: true, width: 720 });
    expect(Number.isFinite(foldedHeight)).toBe(true);
    expect(Number.isFinite(expandedHeight)).toBe(true);
    expect(expandedHeight).toBeGreaterThan(foldedHeight);
  });
});
