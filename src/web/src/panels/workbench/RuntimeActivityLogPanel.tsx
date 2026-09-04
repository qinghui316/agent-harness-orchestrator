import { Copy, RefreshCcw } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";
import type { RuntimeActivityItem, RuntimeActivityLogSnapshot, RuntimeActivitySeverity, RuntimeActivityType } from "../../types.js";

const TYPE_OPTIONS: Array<"all" | RuntimeActivityType> = ["all", "provider", "run", "run-event", "validation", "audit", "message-context", "terminal", "action-error"];
const SEVERITY_OPTIONS: Array<"all" | RuntimeActivitySeverity> = ["all", "error", "warning", "ok", "info"];

export function RuntimeActivityLogPanel({
  snapshot,
  loading,
  onRefresh,
  variant = "full",
}: {
  snapshot: RuntimeActivityLogSnapshot | null;
  loading: boolean;
  onRefresh: () => void;
  variant?: "full" | "rail";
}): ReactElement {
  const [typeFilter, setTypeFilter] = useState<"all" | RuntimeActivityType>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | RuntimeActivitySeverity>("all");
  const items = useMemo(() => {
    return (snapshot?.items ?? []).filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      return true;
    });
  }, [snapshot?.items, typeFilter, severityFilter]);
  const copyText = snapshot ? formatRuntimeActivityForCopy(snapshot, items) : "暂无执行日志。";
  const isRail = variant === "rail";

  return (
    <section className={`runtime-activity-log ${isRail ? "runtime-activity-log-rail" : ""}`} data-testid="runtime-activity-log" data-diagnostic-raw-evidence>
      <header className="runtime-activity-log-header">
        <div>
          <p className="eyebrow">{isRail ? "只读" : "只读观察"}</p>
          <h2>执行日志</h2>
          <span>{loading ? "正在读取检查结果。" : snapshot ? `${items.length} / ${snapshot.items.length} 条记录` : "暂无检查结果。"}</span>
        </div>
        <div className="runtime-activity-log-actions">
          <button type="button" className="secondary-button" aria-label="刷新执行日志" onClick={onRefresh}>
            <RefreshCcw size={14} aria-hidden="true" />
            {!isRail ? "刷新" : null}
          </button>
          <button
            type="button"
            className="secondary-button"
            aria-label="复制执行日志摘要"
            onClick={() => {
              void navigator.clipboard?.writeText(copyText);
            }}
          >
            <Copy size={14} aria-hidden="true" />
            {!isRail ? "复制摘要" : null}
          </button>
        </div>
      </header>
      <div className="runtime-activity-filters" aria-label="执行日志筛选">
        <label>
          类型
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | RuntimeActivityType)}>
            {TYPE_OPTIONS.map((value) => <option key={value} value={value}>{typeLabel(value)}</option>)}
          </select>
        </label>
        <label>
          状态
          <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as "all" | RuntimeActivitySeverity)}>
            {SEVERITY_OPTIONS.map((value) => <option key={value} value={value}>{severityLabel(value)}</option>)}
          </select>
        </label>
      </div>
      {loading ? <div className="runtime-activity-empty">正在读取执行日志...</div> : null}
      {!loading && !snapshot ? <div className="runtime-activity-empty">暂无执行日志。</div> : null}
      {!loading && snapshot && items.length === 0 ? <div className="runtime-activity-empty">当前过滤条件下没有事件。</div> : null}
      <div className="runtime-activity-timeline">
        {items.map((item) => <RuntimeActivityRow key={item.id} item={item} variant={variant} />)}
      </div>
    </section>
  );
}

function RuntimeActivityRow({ item, variant }: { item: RuntimeActivityItem; variant: "full" | "rail" }): ReactElement {
  if (variant === "rail") {
    return (
      <article className={`runtime-activity-row runtime-activity-debug-row ${item.severity}`} data-testid="runtime-activity-rail-row">
        <div className="runtime-activity-debug-meta">
          <span>{typeLabel(item.type)}</span>
          {item.status ? <span>{item.status}</span> : null}
          <time>{formatTime(item.timestamp)}</time>
        </div>
        <div className="runtime-activity-debug-title">
          <span className={`runtime-activity-dot ${item.severity}`} aria-hidden="true" />
          <strong>{item.title}</strong>
        </div>
        <p>{item.summary}</p>
        {(item.details?.length || item.refs.length) ? (
          <details className="runtime-activity-details">
            <summary>查看检查结果</summary>
            {item.details?.length ? (
              <ul>
                {item.details.map((detail, index) => <li key={`${item.id}-detail-${index}`}>{detail}</li>)}
              </ul>
            ) : null}
            {item.refs.length ? (
              <div className="runtime-activity-refs">
                {item.refs.map((ref, index) => (
                  <span key={`${item.id}-ref-${index}`} title={ref.path ?? ref.id ?? ref.label}>
                    {ref.label}
                  </span>
                ))}
              </div>
            ) : null}
          </details>
        ) : null}
      </article>
    );
  }
  return (
    <article className={`runtime-activity-row ${item.severity}`}>
      <div className="runtime-activity-row-main">
        <span className={`runtime-activity-dot ${item.severity}`} aria-hidden="true" />
        <div>
          <div className="runtime-activity-row-title">
            <strong>{item.title}</strong>
            <span>{typeLabel(item.type)}</span>
            {item.status ? <span>{item.status}</span> : null}
          </div>
          <p>{item.summary}</p>
          <time>{formatTime(item.timestamp)}</time>
        </div>
      </div>
      {(item.details?.length || item.refs.length) ? (
        <details className="runtime-activity-details">
          <summary>查看检查结果</summary>
          {item.details?.length ? (
            <ul>
              {item.details.map((detail, index) => <li key={`${item.id}-detail-${index}`}>{detail}</li>)}
            </ul>
          ) : null}
          {item.refs.length ? (
            <div className="runtime-activity-refs">
              {item.refs.map((ref, index) => (
                <span key={`${item.id}-ref-${index}`} title={ref.path ?? ref.id ?? ref.label}>
                  {ref.label}
                </span>
              ))}
            </div>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

function formatRuntimeActivityForCopy(snapshot: RuntimeActivityLogSnapshot, items: RuntimeActivityItem[]): string {
  return [
    `执行日志 ${snapshot.generatedAt}`,
    `Project: ${snapshot.projectId}`,
    snapshot.topicId ? `Topic: ${snapshot.topicId}` : "",
    ...items.map((item) => `- [${item.severity}] ${item.title}: ${item.summary}`),
  ].filter(Boolean).join("\n");
}

function typeLabel(type: "all" | RuntimeActivityType): string {
  const labels: Record<"all" | RuntimeActivityType, string> = {
    all: "全部",
    provider: "AI 服务",
    run: "执行",
    "run-event": "执行动态",
    validation: "验证",
    audit: "审查",
    "message-context": "消息上下文",
    terminal: "Terminal",
    "action-error": "操作错误",
  };
  return labels[type];
}

function severityLabel(severity: "all" | RuntimeActivitySeverity): string {
  const labels: Record<"all" | RuntimeActivitySeverity, string> = {
    all: "全部",
    info: "信息",
    ok: "正常",
    warning: "降级",
    error: "错误",
  };
  return labels[severity];
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
