import { ArrowLeft, Copy, RefreshCcw } from "lucide-react";
import { useState, type ReactElement } from "react";
import type { RuntimeActivityItem, RuntimeActivityLogSnapshot, RuntimeDiagnosticItem, RuntimeDiagnosticsSnapshot, Workpad } from "../../types.js";
import { RuntimeActivityLogPanel } from "./RuntimeActivityLogPanel.js";

export function RuntimeDiagnosticsRailPanel({
  snapshot,
  loading,
  onRefresh,
  runtimeLog,
  runtimeLogLoading,
  onRefreshRuntimeLog,
  workspace,
  workpad,
}: {
  snapshot: RuntimeDiagnosticsSnapshot | null;
  loading: boolean;
  onRefresh: () => void;
  runtimeLog: RuntimeActivityLogSnapshot | null;
  runtimeLogLoading: boolean;
  onRefreshRuntimeLog: () => void;
  workspace: {
    projectPath: string;
    ready: boolean;
    currentTitle: string;
    currentKind: string;
    issueCount: number;
  };
  workpad: Workpad;
}): ReactElement {
  const [view, setView] = useState<"summary" | "log">("summary");
  const copyText = snapshot ? formatDiagnosticsForCopy(snapshot) : "暂无诊断数据。";
  if (view === "log") {
    return (
      <div className="runtime-diagnostics-rail runtime-diagnostics-rail-log" data-testid="runtime-diagnostics-rail-panel">
        <header className="runtime-diagnostics-rail-header">
          <div>
            <button type="button" className="icon-button" aria-label="返回诊断摘要" onClick={() => setView("summary")}>
              <ArrowLeft size={14} aria-hidden="true" />
            </button>
            <strong>运行日志</strong>
          </div>
          <div className="runtime-diagnostics-rail-actions">
            <button type="button" className="icon-button" aria-label="刷新运行日志" onClick={onRefreshRuntimeLog}>
              <RefreshCcw size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
        <RuntimeActivityLogPanel
          snapshot={runtimeLog}
          loading={runtimeLogLoading}
          onRefresh={onRefreshRuntimeLog}
          variant="rail"
        />
      </div>
    );
  }
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
      <section className="runtime-diagnostics-context" aria-label="工作区信息">
        <dl>
          <div><dt>项目根目录</dt><dd>{workspace.projectPath}</dd></div>
          <div><dt>工作区状态</dt><dd>{workspace.ready ? "已准备" : "未准备"}</dd></div>
          <div><dt>{workspace.currentKind}</dt><dd>{workspace.currentTitle}</dd></div>
          <div><dt>待处理问题</dt><dd>{workspace.issueCount}</dd></div>
        </dl>
      </section>
      <div className="runtime-diagnostics-rail-list" data-testid="runtime-diagnostics-health-list" data-diagnostic-raw-evidence>
        {loading ? <div className="runtime-diagnostics-empty">正在读取运行状态...</div> : null}
        {!loading && !snapshot ? <div className="runtime-diagnostics-empty">暂无诊断数据。</div> : null}
        {snapshot?.items.map((item) => <RuntimeDiagnosticRow key={item.id} item={item} />)}
      </div>
      <details className="runtime-diagnostics-raw" data-diagnostic-raw-evidence>
        <summary>原始需求运行数据</summary>
        <pre>{JSON.stringify(workpad, null, 2)}</pre>
      </details>
      <RecentRuntimeEvents
        snapshot={runtimeLog}
        elevated={Boolean(snapshot && snapshot.summary.status !== "ok")}
        loading={runtimeLogLoading}
        onOpenLog={() => setView("log")}
      />
    </div>
  );
}

function RuntimeDiagnosticRow({ item }: { item: RuntimeDiagnosticItem }): ReactElement {
  return (
    <article className={`runtime-diagnostic-row ${item.status}`} data-testid="runtime-diagnostic-health-row" data-diagnostic-raw-evidence>
      <span className={`runtime-diagnostics-status-dot ${item.status}`} aria-hidden="true" />
      <div className="runtime-diagnostic-row-main">
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

function RecentRuntimeEvents({
  snapshot,
  elevated,
  loading,
  onOpenLog,
}: {
  snapshot: RuntimeActivityLogSnapshot | null;
  elevated: boolean;
  loading: boolean;
  onOpenLog: () => void;
}): ReactElement {
  const events = (snapshot?.items ?? []).slice(0, 2);
  return (
    <section className="runtime-diagnostics-recent" data-testid="runtime-diagnostics-recent-events" data-diagnostic-raw-evidence>
      <header>
        <div>
          <strong>最近问题</strong>
          <span>{loading ? "正在读取" : snapshot ? `${snapshot.items.length} 条` : "暂无"}</span>
        </div>
        <button type="button" className="runtime-diagnostics-open-log" data-testid="runtime-diagnostics-open-log" onClick={onOpenLog}>
          查看日志
        </button>
      </header>
      {loading ? <div className="runtime-diagnostics-empty compact">正在读取运行日志...</div> : null}
      {!loading && events.length === 0 ? <div className="runtime-diagnostics-empty compact">暂无运行事件。</div> : null}
      {events.map((item) => <RecentRuntimeEventRow key={item.id} item={item} elevated={elevated} />)}
    </section>
  );
}

function RecentRuntimeEventRow({ item, elevated }: { item: RuntimeActivityItem; elevated: boolean }): ReactElement {
  const visualSeverity = elevated ? item.severity : "history";
  return (
    <article className={`runtime-diagnostics-recent-row ${visualSeverity}`} data-diagnostic-raw-evidence>
      <span className={`runtime-activity-dot ${elevated ? item.severity : "info"}`} aria-hidden="true" />
      <div>
        <strong>{item.title}</strong>
        <span>{item.status ? `${typeLabel(item.type)} · ${item.status}` : typeLabel(item.type)}</span>
      </div>
    </article>
  );
}

function typeLabel(type: RuntimeActivityItem["type"]): string {
  const labels: Record<RuntimeActivityItem["type"], string> = {
    provider: "Provider",
    run: "运行",
    "run-event": "运行事件",
    validation: "验证",
    audit: "审查",
    "message-context": "消息上下文",
    terminal: "终端",
    "action-error": "操作错误",
  };
  return labels[type];
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
