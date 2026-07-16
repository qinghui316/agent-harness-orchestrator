// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationInteractionDock } from "../../src/web/src/panels/workbench/ConversationInteractionDock.js";
import type { ConversationInteraction } from "../../src/workbench/conversation-interaction-contract.js";

afterEach(cleanup);

const baseInteraction: ConversationInteraction = {
  interactionId: "interaction:questions",
  conversationId: "conversation-1",
  graphScopeId: "scope-1",
  canonicalSequence: 1,
  status: "pending",
  kind: "provider-input",
  title: "Agent 需要你回答",
  canSkip: true,
  questions: [
    {
      questionId: "framework",
      title: "选择框架",
      inputMode: "single",
      options: [
        { value: "react", label: "React" },
        { value: "vue", label: "Vue" },
      ],
      allowCustom: false,
    },
    {
      questionId: "features",
      title: "选择功能",
      inputMode: "multiple",
      options: [
        { value: "search", label: "搜索" },
        { value: "export", label: "导出" },
      ],
      allowCustom: false,
    },
  ],
};

describe("ConversationInteractionDock", () => {
  it("advances a single choice and submits all answers from the final question", async () => {
    const onSettle = vi.fn(async () => undefined);
    render(<ConversationInteractionDock interaction={baseInteraction} busy={false} onSettle={onSettle} onStop={vi.fn()} />);

    expect(screen.getByText("1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "React" }));
    expect(screen.getByText("2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(onSettle).toHaveBeenCalledWith("interaction:questions", {
      action: "answer",
      answers: { framework: "react", features: ["search", "export"] },
      skippedQuestionIds: [],
    });
  });

  it("keeps per-question skips in the draft until the final unified submission", () => {
    const onSettle = vi.fn(async () => undefined);
    render(<ConversationInteractionDock interaction={baseInteraction} busy={false} onSettle={onSettle} onStop={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(onSettle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(onSettle).toHaveBeenCalledWith("interaction:questions", {
      action: "answer",
      answers: { features: ["search"] },
      skippedQuestionIds: ["framework"],
    });
  });

  it("keeps secret input local to the mounted dock and out of restorable drafts", async () => {
    const customInteraction: ConversationInteraction = {
      ...baseInteraction,
      interactionId: "interaction:custom",
      questions: [{
        questionId: "token",
        title: "提供访问令牌",
        inputMode: "secret",
        options: [],
        allowCustom: true,
      }],
    };
    let draft: import("../../src/web/src/panels/workbench/ConversationInteractionDock.js").ConversationInteractionDraft | undefined;
    const first = render(<ConversationInteractionDock
      interaction={customInteraction}
      busy={false}
      onDraftChange={(_, nextDraft) => { draft = nextDraft; }}
      onSettle={vi.fn()}
      onStop={vi.fn()}
    />);

    const input = screen.getByLabelText("敏感回答") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: "显示敏感回答" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("secret-value");
    await waitFor(() => expect(draft?.answers).toEqual({}));

    first.unmount();
    render(<ConversationInteractionDock
      interaction={customInteraction}
      initialDraft={draft}
      busy={false}
      onSettle={vi.fn()}
      onStop={vi.fn()}
    />);
    expect((screen.getByLabelText("敏感回答") as HTMLInputElement).value).toBe("");
    expect(document.body.textContent).not.toContain("secret-value");
  });

  it("keeps the option question custom answer as an always-available blank input row", () => {
    const customInteraction: ConversationInteraction = {
      ...baseInteraction,
      interactionId: "interaction:custom-option",
      questions: [{
        questionId: "framework",
        title: "选择框架",
        inputMode: "single",
        options: [{ value: "react", label: "React" }],
        allowCustom: true,
      }],
    };
    const onSettle = vi.fn(async () => undefined);
    render(<ConversationInteractionDock interaction={customInteraction} busy={false} onSettle={onSettle} onStop={vi.fn()} />);

    const customInput = screen.getByLabelText("自定义回答") as HTMLInputElement;
    expect(customInput.placeholder).toBe("");
    expect(screen.queryByRole("button", { name: "自定义回答" })).toBeNull();
    fireEvent.change(customInput, { target: { value: "Solid" } });
    fireEvent.keyDown(customInput, { key: "Enter" });

    expect(onSettle).toHaveBeenCalledWith("interaction:custom-option", {
      action: "answer",
      answers: { framework: "Solid" },
      skippedQuestionIds: [],
    });
  });

  it("keeps close, Escape, and explicit stop as separate actions", () => {
    const onSettle = vi.fn(async () => undefined);
    const onStop = vi.fn(async () => undefined);
    const { unmount } = render(<ConversationInteractionDock interaction={baseInteraction} busy={false} canStop onSettle={onSettle} onStop={onStop} />);

    fireEvent.click(screen.getByRole("button", { name: "停止当前执行" }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSettle).not.toHaveBeenCalled();
    unmount();

    render(<ConversationInteractionDock interaction={baseInteraction} busy={false} onSettle={onSettle} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭并跳过" }));
    expect(onSettle).toHaveBeenLastCalledWith("interaction:questions", { action: "skip" });
    cleanup();

    render(<ConversationInteractionDock interaction={baseInteraction} busy={false} onSettle={onSettle} onStop={onStop} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSettle).toHaveBeenLastCalledWith("interaction:questions", { action: "skip" });
  });

  it("restores an interaction-scoped draft after the dock remounts", () => {
    let draft: import("../../src/web/src/panels/workbench/ConversationInteractionDock.js").ConversationInteractionDraft | undefined;
    const onDraftChange = vi.fn((_: string, nextDraft: NonNullable<typeof draft>) => {
      draft = nextDraft;
    });
    const first = render(
      <ConversationInteractionDock
        interaction={baseInteraction}
        busy={false}
        onDraftChange={onDraftChange}
        onSettle={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(screen.getByText("2 of 2")).toBeTruthy();
    first.unmount();

    render(
      <ConversationInteractionDock
        interaction={baseInteraction}
        initialDraft={draft}
        busy={false}
        onSettle={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText("2 of 2")).toBeTruthy();
  });

  it("does not allow an uncertain submitting interaction to be replayed", () => {
    render(
      <ConversationInteractionDock
        interaction={{ ...baseInteraction, status: "submitting" }}
        busy={false}
        onSettle={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect((screen.getByRole("button", { name: "React" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "关闭并跳过" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("settles plan execution directly or expands revision feedback", () => {
    const plan: ConversationInteraction = {
      ...baseInteraction,
      interactionId: "interaction:plan",
      kind: "plan",
      title: "实施此计划？",
      questions: [{
        questionId: "plan-decision",
        title: "实施此计划？",
        inputMode: "single",
        options: [{ value: "execute", label: "是，实施此计划" }],
        allowCustom: true,
      }],
    };
    const onSettle = vi.fn(async () => undefined);
    const { unmount } = render(<ConversationInteractionDock interaction={plan} busy={false} onSettle={onSettle} onStop={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "是，实施此计划" }));
    expect(onSettle).toHaveBeenLastCalledWith("interaction:plan", { action: "execute-plan" });
    unmount();

    render(<ConversationInteractionDock interaction={plan} busy={false} onSettle={onSettle} onStop={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "否，并告诉 Agent 应该如何做得不同" }));
    fireEvent.change(screen.getByLabelText("修改意见"), { target: { value: "补充回滚验证" } });
    fireEvent.click(screen.getByRole("button", { name: "提交修改意见" }));
    expect(onSettle).toHaveBeenLastCalledWith("interaction:plan", {
      action: "revise-plan",
      feedback: "补充回滚验证",
    });
  });
});
