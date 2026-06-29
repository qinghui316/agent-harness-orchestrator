import { Activity, FileText, GitBranch, ListChecks, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export type RightToolRailTab = "confirm" | "files" | "git" | "diagnostics";

export function RightToolRailShell({
  collapsed,
  activeTab,
  pendingCount,
  hasPrimary,
  onExpand,
  onCollapse,
  onTabChange,
  confirmPanel,
  filesPanel,
  gitPanel,
  diagnosticsPanel,
}: {
  collapsed: boolean;
  activeTab: RightToolRailTab;
  pendingCount: number;
  hasPrimary: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onTabChange: (tab: RightToolRailTab) => void;
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
          className={`decision-pane-rail${hasPrimary ? " has-primary" : ""}`}
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

  return (
    <aside className="approval-pane approval-pane-expanded" data-testid="decision-pane-shell" aria-label="右侧工具面板">
      <div className="decision-pane-toolbar">
        <div className="right-tool-tabs" role="tablist" aria-label="右侧工具">
          <button
            type="button"
            role="tab"
            aria-label="确认"
            aria-selected={activeTab === "confirm"}
            title="确认"
            className={activeTab === "confirm" ? "active" : ""}
            data-testid="right-tool-tab-confirm"
            onClick={() => onTabChange("confirm")}
          >
            <ListChecks size={15} aria-hidden="true" />
            {pendingCount > 0 ? <span className="right-tool-tab-badge">{pendingCount}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-label="文件"
            aria-selected={activeTab === "files"}
            title="文件"
            className={activeTab === "files" ? "active" : ""}
            data-testid="right-tool-tab-files"
            onClick={() => onTabChange("files")}
          >
            <FileText size={15} aria-hidden="true" />
            <span>文件</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-label="Git"
            aria-selected={activeTab === "git"}
            title="Git"
            className={activeTab === "git" ? "active" : ""}
            data-testid="right-tool-tab-git"
            onClick={() => onTabChange("git")}
          >
            <GitBranch size={15} aria-hidden="true" />
            <span>Git</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-label="诊断"
            aria-selected={activeTab === "diagnostics"}
            title="诊断"
            className={activeTab === "diagnostics" ? "active" : ""}
            data-testid="right-tool-tab-diagnostics"
            onClick={() => onTabChange("diagnostics")}
          >
            <Activity size={15} aria-hidden="true" />
            <span>诊断</span>
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          data-testid="decision-pane-collapse"
          aria-label="折叠右侧面板"
          aria-expanded="true"
          onClick={onCollapse}
        >
          <PanelRightClose size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="decision-pane-content">
        {activeTab === "confirm" ? confirmPanel : activeTab === "files" ? filesPanel : activeTab === "git" ? gitPanel : diagnosticsPanel}
      </div>
    </aside>
  );
}
