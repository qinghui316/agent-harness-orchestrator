import { Activity, Copy, RefreshCcw, X } from "lucide-react";
import type { ReactElement } from "react";
import type { RuntimeDiagnosticItem, RuntimeDiagnosticsSnapshot } from "../../types.js";

export function RuntimeDiagnosticsRailPanel({
  snapshot,
  loading,
  onOpen,
  onRefresh,
}: {
  snapshot: RuntimeDiagnosticsSnapshot | null;
  loading: boolean;
  onOpen: () => void;
  onRefresh: () => void;
}): ReactElement {
  const statusText = diagnosticsStatusText(snapshot);
  return (
    <div className="right-tool-empty" data-testid="runtime-diagnostics-rail-panel">
      <Activity size={18} aria-hidden="true" />
      <strong>诊断</strong>
      <p>{loading ? "正在读取运行状态。" : statusText}</p>
      <div className="tool-panel-actions">
        <button type="button" className="primary-button" onClick={onOpen}>
          打开诊断面板
        </button>
        <button type="button" className="secondary-button" onClick={onRefresh}>
          刷新
        </button>
      </div>
    </div>
  );
}

export function RuntimeDiagnosticsDock({
  open,
  height,
  snapshot,
  loading,
  onClose,
  onRefresh,
  onHeightChange,
}: {
  open: boolean;
  height: number;
  snapshot: RuntimeDiagnosticsSnapshot | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onHeightChange: (height: number) => void;
}): ReactElement | null {
  if (!open) return null;
  const copyText = snapshot ? formatDiagnosticsForCopy(snapshot) : "暂无诊断数据。";
  return (
    <section className="runtime-diagnostics-dock" style={{ height }} data-testid="runtime-diagnostics-dock" aria-label="运行诊断">
      <div
        className="runtime-diagnostics-dock-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整诊断面板高度"
        onMouseDown={(event) => {
          event.preventDefault();
          const handleMove = (moveEvent: MouseEvent): void => {
            onHeightChange(Math.max(180, Math.min(520, window.innerHeight - moveEvent.clientY)));
          };
          const handleUp = (): void => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
          };
          window.addEventListener("mousemove", handleMove);
          window.addEventListener("mouseup", handleUp);
        }}
      />
      <header className="runtime-diagnostics-header">
        <div className="runtime-diagnostics-title">
          <Activity size={15} aria-hidden="true" />
          <strong>运行诊断</strong>
          <span>{diagnosticsStatusText(snapshot)}</span>
        </div>
        <div className="runtime-diagnostics-actions">
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
          <button type="button" className="icon-button" aria-label="关闭诊断面板" onClick={onClose}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="runtime-diagnostics-body">
        {loading ? <div className="runtime-diagnostics-empty">正在读取运行状态...</div> : null}
        {!loading && !snapshot ? <div className="runtime-diagnostics-empty">暂无诊断数据。</div> : null}
        {snapshot?.items.map((item) => <RuntimeDiagnosticRow key={item.id} item={item} />)}
      </div>
    </section>
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
