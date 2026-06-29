import { Copy, RefreshCcw } from "lucide-react";
import type { ReactElement } from "react";
import type { RuntimeDiagnosticItem, RuntimeDiagnosticsSnapshot } from "../../types.js";

export function RuntimeDiagnosticsRailPanel({
  snapshot,
  loading,
  onRefresh,
  onOpenRuntimeLog,
}: {
  snapshot: RuntimeDiagnosticsSnapshot | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenRuntimeLog: () => void;
}): ReactElement {
  const copyText = snapshot ? formatDiagnosticsForCopy(snapshot) : "暂无诊断数据。";
  return (
    <div className="runtime-diagnostics-rail" data-testid="runtime-diagnostics-rail-panel">
      <header className="runtime-diagnostics-rail-header">
        <div>
          <span className={`runtime-diagnostics-status-dot ${snapshot?.summary.status ?? "unknown"}`} aria-hidden="true" />
          <strong>运行诊断</strong>
        </div>
        <div className="runtime-diagnostics-rail-actions">
          <button type="button" className="icon-button" aria-label="刷新诊断" onClick={onRefresh}>
            <RefreshCcw size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="复制诊断摘要"
            onClick={() => {
              void navigator.clipboard?.writeText(copyText);
            }}
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        </div>
      </header>
      <p className="runtime-diagnostics-summary">{loading ? "正在读取运行状态。" : diagnosticsStatusText(snapshot)}</p>
      <button type="button" className="runtime-diagnostics-open-log" data-testid="open-runtime-activity-log" onClick={onOpenRuntimeLog}>
        打开运行日志
      </button>
      <div className="runtime-diagnostics-rail-list">
        {loading ? <div className="runtime-diagnostics-empty">正在读取运行状态...</div> : null}
        {!loading && !snapshot ? <div className="runtime-diagnostics-empty">暂无诊断数据。</div> : null}
        {snapshot?.items.map((item) => <RuntimeDiagnosticRow key={item.id} item={item} />)}
      </div>
    </div>
  );
}

function RuntimeDiagnosticRow({ item }: { item: RuntimeDiagnosticItem }): ReactElement {
  return (
    <article className={`runtime-diagnostic-row ${item.status}`}>
      <div>
        <strong>{item.title}</strong>
        <span>{item.summary}</span>
      </div>
      {item.detail ? (
        <details>
          <summary>高级详情</summary>
          <pre>{item.detail}</pre>
        </details>
      ) : null}
    </article>
  );
}

function diagnosticsStatusText(snapshot: RuntimeDiagnosticsSnapshot | null): string {
  if (!snapshot) return "暂无诊断数据。";
  if (snapshot.summary.status === "ok") return "运行状态正常。";
  if (snapshot.summary.status === "error") return `${snapshot.summary.issueCount} 个错误需要查看。`;
  return `${snapshot.summary.degradedCount} 个项目处于降级状态。`;
}

function formatDiagnosticsForCopy(snapshot: RuntimeDiagnosticsSnapshot): string {
  return [
    `运行诊断 ${snapshot.generatedAt}`,
    `状态: ${snapshot.summary.status}`,
    ...snapshot.items.map((item) => `- [${item.status}] ${item.title}: ${item.summary}${item.detail ? `\n  ${item.detail}` : ""}`),
  ].join("\n");
}
