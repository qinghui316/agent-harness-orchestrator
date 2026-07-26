// @vitest-environment jsdom

import { createRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainConversationView } from "../../src/web/src/panels/workbench/ConversationPanel.js";
import type { ParentAgentTranscript, ParentAgentTranscriptCell } from "../../src/web/src/types.js";

type ResizeCallback = ResizeObserverCallback;

class ControlledResizeObserver implements ResizeObserver {
  static callbacks: ResizeCallback[] = [];

  constructor(callback: ResizeCallback) {
    ControlledResizeObserver.callbacks.push(callback);
  }

  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

beforeEach(() => {
  ControlledResizeObserver.callbacks = [];
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("main conversation virtualization", () => {
  it("keeps a sub-threshold transcript at natural grid height after repeated measurements", async () => {
    renderConversation(35);

    const list = screen.getByTestId("transcript-virtual-list");
    const rows = () => list.querySelectorAll("[data-transcript-cell-id]");
    expect(rows()).toHaveLength(35);
    expect(list.style.minHeight).toBe("");

    await publishMeasurements(rows(), 100, 72);

    expect(rows()).toHaveLength(35);
    expect(list.style.minHeight).toBe("");
  });

  it("uses bounded spacer virtualization without stretching measured rows", async () => {
    renderConversation(120);

    const list = screen.getByTestId("transcript-virtual-list");
    const rows = () => list.querySelectorAll("[data-transcript-cell-id]");
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThan(120);
    expect(list.querySelectorAll(".transcript-virtual-spacer").length).toBeGreaterThan(0);
    expect(list.style.minHeight).toBe("");

    await publishMeasurements(rows(), 1, 72);
    const settledRowCount = rows().length;
    await publishMeasurements(rows(), 100, 72);

    expect(rows()).toHaveLength(settledRowCount);
    expect(list.style.minHeight).toBe("");
  });
});

function renderConversation(cellCount: number): void {
  const scrollRef = createRef<HTMLDivElement>();
  const transcript: ParentAgentTranscript = {
    title: "Virtual transcript",
    items: [],
    cells: Array.from({ length: cellCount }, (_, index): ParentAgentTranscriptCell => ({
      id: `cell:${index}`,
      kind: "assistant-message",
      source: "provider-runtime",
      text: `message ${index}`,
      threadId: "thread-main",
      turnId: `turn-${index}`,
    })),
  };
  render(
    <div ref={scrollRef}>
      <MainConversationView
        transcript={transcript}
        scrollContainerRef={scrollRef}
        loadingEarlierTranscript={false}
        onOpenAgent={() => {}}
        canOpenAgent={() => true}
      />
    </div>,
  );
}

async function publishMeasurements(rows: NodeListOf<Element>, repetitions: number, height: number): Promise<void> {
  expect(ControlledResizeObserver.callbacks.length).toBeGreaterThan(0);
  const callback = ControlledResizeObserver.callbacks.at(-1)!;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    await act(async () => {
      callback(Array.from(rows, (target) => ({
        target,
        contentRect: { height } as DOMRectReadOnly,
      } as ResizeObserverEntry)), {} as ResizeObserver);
    });
  }
}
