import type { ReactElement } from "react";
import { Code2 } from "lucide-react";
import { humanStatus, runtimeLabel } from "../formatters.js";
import type { RunSummary } from "../types.js";

export function RunList({ runs, selectedRun, onSelect }: { runs: RunSummary[]; selectedRun?: string; onSelect: (runId: string) => Promise<void> }): ReactElement {
  if (runs.length === 0) return <div className="empty-state">暂无运行记录。</div>;
  return (
    <div className="run-list">
      {runs.map((run) => (
        <button className={`run-row ${run.id === selectedRun ? "selected" : ""}`} key={run.id} onClick={() => void onSelect(run.id)}>
          <Code2 size={16} />
          <span>{runtimeLabel(run.runtime)}</span>
          <small>{humanStatus(run.status)}</small>
        </button>
      ))}
    </div>
  );
}
