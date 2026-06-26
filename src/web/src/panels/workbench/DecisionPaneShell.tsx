import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export function DecisionPaneShell({
  collapsed,
  pendingCount,
  hasPrimary,
  onExpand,
  onCollapse,
  children,
}: {
  collapsed: boolean;
  pendingCount: number;
  hasPrimary: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  children: ReactNode;
}): ReactElement {
  if (collapsed) {
    const label = pendingCount > 0 ? `展开确认面板，${pendingCount} 个待确认` : "展开确认面板";
    return (
      <aside className="approval-pane approval-pane-collapsed" data-testid="decision-pane-shell" aria-label="确认面板">
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
    <aside className="approval-pane approval-pane-expanded" data-testid="decision-pane-shell" aria-label="确认面板">
      <div className="decision-pane-toolbar">
        <button
          type="button"
          className="icon-button"
          data-testid="decision-pane-collapse"
          aria-label="折叠确认面板"
          aria-expanded="true"
          onClick={onCollapse}
        >
          <PanelRightClose size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="decision-pane-content">{children}</div>
    </aside>
  );
}
