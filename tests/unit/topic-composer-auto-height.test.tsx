// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopicComposer } from "../../src/web/src/shell/composer.js";

afterEach(cleanup);

describe("Topic Composer height", () => {
  it("shows the turn-mode control only for Agent and keeps unsupported Plan selected", () => {
    const onSelect = vi.fn();
    const view = render(<TopicComposer
      value="draft"
      onChange={vi.fn()}
      modelLabel="gpt"
      projectId="project"
      productMode="agent"
      agentTurnMode="plan"
      onSelectAgentTurnMode={onSelect}
      agentTurnModeDisabledReason="当前 Agent 不支持 Plan 模式。"
      onSend={async () => undefined}
      actionRunning={null}
    />);
    expect(screen.getByTestId("agent-turn-mode-control")).toBeTruthy();
    const planButton = screen.getByRole("button", { name: "Plan" });
    expect(planButton.getAttribute("aria-pressed")).toBe("true");
    expect(planButton.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "当前 Agent 不支持 Plan 模式。" }).hasAttribute("disabled")).toBe(true);

    view.rerender(composer("draft"));
    expect(screen.queryByTestId("agent-turn-mode-control")).toBeNull();
  });

  it("keeps a compact input and caps content growth at 160px", () => {
    let measuredHeight = 44;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get: () => measuredHeight });
    const view = renderComposer("");
    const textarea = screen.getByRole("textbox");
    expect(textarea.style.height).toBe("44px");
    expect(textarea.style.overflowY).toBe("hidden");

    measuredHeight = 240;
    view.rerender(composer("line\n".repeat(30)));
    expect(textarea.style.height).toBe("160px");
    expect(textarea.style.overflowY).toBe("auto");
    if (descriptor) Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", descriptor);
    else delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
  });

  it("remeasures unchanged text when the composer width changes", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const resizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    vi.stubGlobal("ResizeObserver", resizeObserver);
    let measuredHeight = 44;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get: () => measuredHeight });
    renderComposer("unchanged text that wraps when the rail opens");
    const textarea = screen.getByRole("textbox");

    measuredHeight = 112;
    resizeCallback?.([{ contentRect: { width: 360 } } as ResizeObserverEntry], {} as ResizeObserver);
    expect(textarea.style.height).toBe("112px");
    expect(textarea.style.overflowY).toBe("hidden");
    if (descriptor) Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", descriptor);
    else delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
  });
});

function renderComposer(value: string) { return render(composer(value)); }

function composer(value: string) {
  return <TopicComposer
    value={value}
    onChange={vi.fn()}
    providerDisplayName="Codex"
    modelLabel="gpt"
    projectId="project"
    onSend={async () => undefined}
    actionRunning={null}
  />;
}
