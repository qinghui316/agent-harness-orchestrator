import { GitBranch, PanelRightOpen, SquareTerminal } from "lucide-react";
import type { ReactElement } from "react";

export function WorkspaceDockToggleBar({
  orchestrationActive,
  orchestrationNeedsAttention,
  orchestrationDisabled,
  onToggleOrchestration,
  terminalActive,
  terminalDisabled,
  onToggleTerminal,
  rightRailOpen,
  rightRailPendingCount,
  onToggleRightRail,
}: {
  orchestrationActive: boolean;
  orchestrationNeedsAttention?: boolean;
  orchestrationDisabled: boolean;
  onToggleOrchestration: () => void;
  terminalActive: boolean;
  terminalDisabled: boolean;
  onToggleTerminal: () => void;
  rightRailOpen: boolean;
  rightRailPendingCount: number;
  onToggleRightRail: () => void;
}): ReactElement {
  return (
    <div className="workspace-dock-toggle-bar" aria-label="工作区工具">
      <button
        type="button"
        className={`top-tool-button workspace-orchestration-toggle${orchestrationActive ? " active" : ""}${orchestrationNeedsAttention ? " attention" : ""}`}
        data-testid="orchestration-overlay-toggle"
        disabled={orchestrationDisabled}
        aria-pressed={orchestrationActive}
        aria-label={orchestrationNeedsAttention ? "Agent 编排图，需要你回答" : orchestrationActive ? "关闭 Agent 编排图" : "打开 Agent 编排图"}
        title={orchestrationNeedsAttention ? "Agent 需要你回答" : orchestrationActive ? "关闭 Agent 编排图" : "打开 Agent 编排图"}
        onClick={onToggleOrchestration}
      >
        <GitBranch size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`top-tool-button workspace-dock-toggle${terminalActive ? " active" : ""}`}
        data-testid="terminal-dock-toggle"
        disabled={terminalDisabled}
        aria-pressed={terminalActive}
        aria-label={terminalActive ? "收起终端" : "打开终端"}
        title={terminalActive ? "收起终端" : "打开终端"}
        onClick={onToggleTerminal}
      >
        <SquareTerminal size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`top-tool-button workspace-right-rail-toggle${rightRailOpen ? " active" : ""}`}
        data-testid="right-tool-rail-toggle"
        aria-expanded={rightRailOpen}
        aria-label={rightRailOpen
          ? "关闭右侧工具"
          : rightRailPendingCount > 0
            ? `打开右侧工具，${rightRailPendingCount} 个待确认`
            : "打开右侧工具"}
        title={rightRailOpen ? "关闭右侧工具" : "打开右侧工具"}
        onClick={onToggleRightRail}
      >
        <PanelRightOpen size={16} aria-hidden="true" />
        {rightRailPendingCount > 0 ? <span className="decision-pane-badge">{rightRailPendingCount}</span> : null}
      </button>
    </div>
  );
}
