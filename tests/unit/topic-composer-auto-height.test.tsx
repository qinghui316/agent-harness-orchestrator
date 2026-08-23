// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("shows per-Turn model and effort menus only for Agent mode", () => {
    const onSelectModel = vi.fn();
    const onSelectEffort = vi.fn();
    const view = render(<TopicComposer
      value="draft"
      onChange={vi.fn()}
      modelLabel="gpt-test"
      projectId="project"
      productMode="agent"
      agentTurnMode="default"
      agentModelId="gpt-test"
      agentReasoningEffort="high"
      providerModelSettings={{
        providerId: "codex",
        selectedModel: null,
        effectiveModel: { providerId: "codex", modelId: "gpt-test" },
        effectiveModelSource: "provider-default",
        candidates: [{
          providerId: "codex",
          modelId: "gpt-test",
          label: "GPT Test",
          source: "runtime",
          supportedReasoningEfforts: [{ value: "high", label: "高" }],
          defaultReasoningEffort: "high",
        }],
        available: true,
      }}
      onSelectAgentTurnMode={vi.fn()}
      onSelectAgentModel={onSelectModel}
      onSelectAgentReasoningEffort={onSelectEffort}
      onSend={async () => undefined}
      actionRunning={null}
    />);

    expect(screen.getByTestId("agent-turn-model-controls")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "本次 Turn 模型" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "本次 Turn 推理强度" }), { target: { value: "" } });
    expect(onSelectModel).toHaveBeenCalledWith(null);
    expect(onSelectEffort).toHaveBeenCalledWith(null);

    view.rerender(composer("draft"));
    expect(screen.queryByTestId("agent-turn-model-controls")).toBeNull();
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

  it("keeps Agent steer and Stop as independent running actions", () => {
    const onSend = vi.fn(async () => undefined);
    const onStop = vi.fn(async () => undefined);
    render(<TopicComposer
      value="keep this for the next turn"
      onChange={vi.fn()}
      modelLabel="gpt"
      projectId="project"
      productMode="agent"
      onSend={onSend}
      onStopAndContinue={onStop}
      actionRunning={null}
      currentWorkpadStatus="running"
      runControlState={{ state: "running", canStop: true, canSteer: true, steerState: "idle" }}
    />);

    fireEvent.click(screen.getByRole("button", { name: "发送给当前执行" }));
    expect(onSend).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "停止当前执行" }));
    expect(onStop).toHaveBeenCalledOnce();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("keep this for the next turn");
  });

  it("disables Agent steer while submitting without disabling Stop", () => {
    const onSend = vi.fn(async () => undefined);
    const onStop = vi.fn(async () => undefined);
    render(<TopicComposer
      value="keep this text"
      onChange={vi.fn()}
      modelLabel="gpt"
      projectId="project"
      productMode="agent"
      onSend={onSend}
      onStopAndContinue={onStop}
      actionRunning={null}
      currentWorkpadStatus="running"
      runControlState={{ state: "running", canStop: true, canSteer: false, steerState: "submitting" }}
    />);

    expect(screen.getByRole("button", { name: "正在发送给当前执行" }).hasAttribute("disabled")).toBe(true);
    const stop = screen.getByRole("button", { name: "停止当前执行" });
    expect(stop.hasAttribute("disabled")).toBe(false);
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
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
