// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightToolRailShell, type RightToolRailView } from "../../src/web/src/panels/workbench/DecisionPaneShell.js";

afterEach(cleanup);

describe("Right tool rail shell", () => {
  it("shows one collapsed attention control", () => {
    const onExpand = vi.fn();
    renderShell({ collapsed: true, pendingCount: 2, hasPrimary: true, onExpand });
    const toggle = screen.getByLabelText("展开右侧面板，2 个待确认");
    fireEvent.click(toggle);
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("right-tool-launcher")).toBeNull();
  });

  it("routes launcher tools without mounting their panels twice", () => {
    const onToolOpen = vi.fn();
    const onCollapse = vi.fn();
    renderShell({ activeView: "launcher", onToolOpen, onCollapse });
    expect(screen.getByTestId("right-tool-launcher-agent")).toBeTruthy();
    expect(screen.getByTestId("right-tool-launcher-confirm")).toBeTruthy();
    expect(screen.getByTestId("right-tool-launcher-files")).toBeTruthy();
    expect(screen.getByTestId("right-tool-launcher-git")).toBeTruthy();
    expect(screen.getByTestId("right-tool-launcher-diagnostics")).toBeTruthy();
    fireEvent.click(screen.getByTestId("right-tool-launcher-agent"));
    fireEvent.click(screen.getByTestId("decision-pane-collapse"));
    expect(onToolOpen).toHaveBeenCalledWith("agent");
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders the Agent resource panel as the sole agent view", () => {
    renderShell({ activeView: "agent" });
    expect(screen.getByTestId("agent-owner-panel")).toBeTruthy();
    expect(screen.queryByTestId("right-tool-launcher")).toBeNull();
    expect(screen.queryByTestId("decision-pane-collapse")).toBeNull();
    expect(screen.getByTestId("decision-pane-shell").className).toContain("agent-view");
  });
});

function renderShell(overrides: Partial<{
  collapsed: boolean;
  activeView: RightToolRailView;
  pendingCount: number;
  hasPrimary: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onToolOpen: (view: Exclude<RightToolRailView, "launcher">) => void;
}> = {}) {
  return render(<RightToolRailShell
    collapsed={overrides.collapsed ?? false}
    activeView={overrides.activeView ?? "launcher"}
    pendingCount={overrides.pendingCount ?? 1}
    hasPrimary={overrides.hasPrimary ?? false}
    onExpand={overrides.onExpand ?? vi.fn()}
    onCollapse={overrides.onCollapse ?? vi.fn()}
    onToolOpen={overrides.onToolOpen ?? vi.fn()}
    onBackToLauncher={vi.fn()}
    agentPanel={<div data-testid="agent-owner-panel" />}
    confirmPanel={<div data-testid="confirm-owner-panel" />}
    filesPanel={<div data-testid="files-owner-panel" />}
    gitPanel={<div data-testid="git-owner-panel" />}
    diagnosticsPanel={<div data-testid="diagnostics-owner-panel" />}
  />);
}
