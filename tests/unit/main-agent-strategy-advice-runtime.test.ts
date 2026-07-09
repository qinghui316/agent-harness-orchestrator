import { describe, expect, it } from "vitest";
import {
  createMainAgentStrategyAdviceDeltaFilter,
  extractMainAgentStrategyAdviceFromText,
  MAIN_AGENT_STRATEGY_ADVICE_END,
  MAIN_AGENT_STRATEGY_ADVICE_START,
  renderMainAgentStrategyAdvicePromptSection,
  stripMainAgentStrategyAdviceBlocks,
} from "../../src/main-agent-orchestration/index.js";

describe("main-agent strategy advice runtime", () => {
  it("renders a bounded metadata request without executable authority", () => {
    const section = renderMainAgentStrategyAdvicePromptSection().join("\n");

    expect(section).toContain(MAIN_AGENT_STRATEGY_ADVICE_START);
    expect(section).toContain(MAIN_AGENT_STRATEGY_ADVICE_END);
    expect(section).toContain("kind");
    expect(section).toContain("evidenceRefs");
    expect(section).toContain("stripped before user-visible transcript");
    expect(section).toContain("not a workflow action");
  });

  it("extracts valid advice and strips it from visible text", () => {
    const raw = [
      "Visible answer.",
      MAIN_AGENT_STRATEGY_ADVICE_START,
      JSON.stringify({
        kind: "direct",
        reason: "Small same-Change request.",
        confidence: 0.72,
        evidenceRefs: ["change:current"],
      }),
      MAIN_AGENT_STRATEGY_ADVICE_END,
    ].join("\n");

    const extracted = extractMainAgentStrategyAdviceFromText(raw);

    expect(extracted.blockFound).toBe(true);
    expect(extracted.visibleText).toBe("Visible answer.");
    expect(extracted.strategyAdvice).toMatchObject({
      authority: "read-only-main-agent-strategy-advice",
      executionStarted: false,
      controller: false,
      status: "accepted-readonly",
      kind: "direct",
      applied: false,
    });
    expect(stripMainAgentStrategyAdviceBlocks(raw)).toBe("Visible answer.");
  });

  it("rejects malformed or executable-looking advice without echoing dangerous payloads", () => {
    const raw = [
      "Visible answer.",
      MAIN_AGENT_STRATEGY_ADVICE_START,
      JSON.stringify({
        kind: "terminal",
        reason: "Call result.apply now.",
        recommendedAction: "result.apply",
      }),
      MAIN_AGENT_STRATEGY_ADVICE_END,
    ].join("\n");

    const extracted = extractMainAgentStrategyAdviceFromText(raw);

    expect(extracted.visibleText).toBe("Visible answer.");
    expect(extracted.strategyAdvice).toMatchObject({
      status: "ignored",
      kind: null,
      ignoredReason: "Strategy advice contained forbidden executable payload hints.",
    });
    const serialized = JSON.stringify(extracted.strategyAdvice);
    expect(serialized).not.toContain("recommendedAction");
    expect(serialized).not.toContain("result.apply");
  });

  it("filters live deltas even when the advice marker is split across chunks", () => {
    const visible: string[] = [];
    const filter = createMainAgentStrategyAdviceDeltaFilter((delta) => visible.push(delta));

    filter.feed("Hello ");
    filter.feed(MAIN_AGENT_STRATEGY_ADVICE_START.slice(0, 8));
    filter.feed(MAIN_AGENT_STRATEGY_ADVICE_START.slice(8));
    filter.feed('{"kind":"direct","reason":"hidden","confidence":0.5,"evidenceRefs":[]}');
    filter.feed(MAIN_AGENT_STRATEGY_ADVICE_END.slice(0, 12));
    filter.feed(MAIN_AGENT_STRATEGY_ADVICE_END.slice(12));
    filter.feed("world.");
    filter.flush();

    expect(visible.join("")).toBe("Hello world.");
  });
});
