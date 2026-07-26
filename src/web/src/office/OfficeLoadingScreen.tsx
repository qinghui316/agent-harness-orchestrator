import type { ReactElement } from "react";

export function OfficeLoadingScreen({ progress, complete = false }: { progress: number; complete?: boolean }): ReactElement {
  const normalized = Math.max(0, Math.min(100, progress));
  return (
    <div className={`office-loading${complete ? " complete" : ""}`} role="status" aria-label="正在准备 Agent 办公室">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet="/agent-office/ui/walk-vertical-loader-still.webp" />
        <img src="/agent-office/ui/walk-vertical-loader.webp" alt="" width="320" height="320" />
      </picture>
      <progress max="100" value={normalized} aria-label="办公室加载进度" />
      <span className="sr-only">正在准备 Agent 办公室，{Math.round(normalized)}%</span>
    </div>
  );
}
