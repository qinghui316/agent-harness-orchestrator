// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ComposerControls } from "../../src/web/src/shell/ComposerControls.js";

afterEach(cleanup);

describe("Composer controls", () => {
  it("renders the provider descriptor without a built-in provider label", () => {
    render(<ComposerControls providerDisplayName="Claude Code" modelLabel="claude-sonnet" />);
    expect(screen.getByText("Claude Code")).toBeTruthy();
    expect(screen.getByLabelText("当前模型：claude-sonnet")).toBeTruthy();
    expect(screen.queryByText("Codex")).toBeNull();
  });

  it("keeps multi-provider selection empty until the user chooses", () => {
    render(<ComposerControls
      modelLabel="默认模型"
      providerOptions={[{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }]}
    />);
    const select = screen.getByLabelText("选择 Agent provider") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "选择 Agent" })).toBeTruthy();
  });

  it("does not render optional controls without their capabilities", () => {
    render(<ComposerControls providerDisplayName="Codex" modelLabel="default" />);
    expect(screen.queryByLabelText("选择 Agent provider")).toBeNull();
    expect(screen.queryByRole("button", { name: /模型设置/ })).toBeNull();
  });
});
