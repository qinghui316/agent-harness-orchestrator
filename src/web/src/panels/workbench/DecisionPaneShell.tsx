import { Activity, Bot, ChevronLeft, FileText, GitBranch, ListChecks, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export type RightToolRailTab = "agent" | "confirm" | "files" | "git" | "diagnostics";
export type RightToolRailView = "launcher" | RightToolRailTab;

const toolLabels: Record<RightToolRailTab, string> = {
  agent: "Agent",
  confirm: "确认事项",
  files: "文件",
  git: "Git",
  diagnostics: "诊断",
};

export function RightToolRailShell({
  collapsed,
  activeView,
  pendingCount,
  hasPrimary,
  onExpand,
  onCollapse,
  onToolOpen,
  onBackToLauncher,
  agentPanel,
  confirmPanel,
  filesPanel,
  gitPanel,
  diagnosticsPanel,
}: {
  collapsed: boolean;
  activeView: RightToolRailView;
  pendingCount: number;
  hasPrimary: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onToolOpen: (tab: RightToolRailTab) => void;
  onBackToLauncher: () => void;
  agentPanel: ReactNode;
  confirmPanel: ReactNode;
  filesPanel: ReactNode;
  gitPanel: ReactNode;
  diagnosticsPanel: ReactNode;
}): ReactElement {
  if (collapsed) {
    const label = pendingCount > 0 ? `展开右侧面板，${pendingCount} 个待确认` : "展开右侧面板";
    return (
      <aside className="approval-pane approval-pane-collapsed" data-testid="decision-pane-shell" aria-label="右侧工具面板">
        <button
          type="button"
          className={`top-tool-button decision-pane-rail${hasPrimary ? " has-primary" : ""}`}
          data-testid="decision-pane-toggle"
          aria-label={label}
          aria-expanded="false"
          onClick={onExpand}
        >
          <PanelRightOpen size={18} aria-hidden="true" />
          {pendingCount > 0 ? <span className="decision-pane-badge">{pendingCount}</span> : null}
        </button>
      </aside>
    );
  }

  const panelTitle = activeView === "launcher" ? "工具" : toolLabels[activeView];
  const panelContent =
    activeView === "launcher" ? (
      <RightToolLauncher pendingCount={pendingCount} hasPrimary={hasPrimary} onToolOpen={onToolOpen} />
    ) : activeView === "agent" ? (
      agentPanel
    ) : activeView === "confirm" ? (
      confirmPanel
    ) : activeView === "files" ? (
      filesPanel
    ) : activeView === "git" ? (
      gitPanel
    ) : (
      diagnosticsPanel
    );

  return (
    <aside className="approval-pane approval-pane-expanded" data-testid="decision-pane-shell" aria-label="右侧工具面板">
      <div className="decision-pane-toolbar">
        <div className="decision-pane-toolbar-left">
          {activeView !== "launcher" ? (
            <button
              type="button"
              className="top-tool-button decision-pane-back"
              data-testid="right-tool-back"
              aria-label="返回工具列表"
              onClick={onBackToLauncher}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          ) : null}
          <span className="decision-pane-title">{panelTitle}</span>
        </div>
        <button
          type="button"
          className="top-tool-button decision-pane-collapse"
          data-testid="decision-pane-collapse"
          aria-label="折叠右侧面板"
          aria-expanded="true"
          onClick={onCollapse}
        >
          <PanelRightClose size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="decision-pane-content">{panelContent}</div>
    </aside>
  );
}

function RightToolLauncher({
  pendingCount,
  hasPrimary,
  onToolOpen,
}: {
  pendingCount: number;
  hasPrimary: boolean;
  onToolOpen: (tab: RightToolRailTab) => void;
}): ReactElement {
  return (
    <div className="right-tool-launcher" data-testid="right-tool-launcher" aria-label="右侧工具入口">
      <div className="right-tool-launcher-list">
        <button
          type="button"
          className="right-tool-launcher-item"
          data-testid="right-tool-launcher-agent"
          onClick={() => onToolOpen("agent")}
        >
          <Bot size={17} aria-hidden="true" />
          <span>Agent</span>
        </button>
        <button
          type="button"
          className={`right-tool-launcher-item${hasPrimary ? " has-primary" : ""}`}
          data-testid="right-tool-launcher-confirm"
          onClick={() => onToolOpen("confirm")}
        >
          <ListChecks size={17} aria-hidden="true" />
          <span>确认</span>
          {pendingCount > 0 ? <span className="right-tool-launcher-badge">{pendingCount}</span> : null}
        </button>
        <button
          type="button"
          className="right-tool-launcher-item"
          data-testid="right-tool-launcher-files"
          onClick={() => onToolOpen("files")}
        >
          <FileText size={17} aria-hidden="true" />
          <span>文件</span>
        </button>
        <button
          type="button"
          className="right-tool-launcher-item"
          data-testid="right-tool-launcher-git"
          onClick={() => onToolOpen("git")}
        >
          <GitBranch size={17} aria-hidden="true" />
          <span>Git</span>
        </button>
        <button
          type="button"
          className="right-tool-launcher-item"
          data-testid="right-tool-launcher-diagnostics"
          onClick={() => onToolOpen("diagnostics")}
        >
          <Activity size={17} aria-hidden="true" />
          <span>诊断</span>
        </button>
      </div>
    </div>
  );
}
