import type { ReactElement } from "react";
import { FileText } from "lucide-react";
import { eventLabel, formatTime, humanStatus, runtimeLabel } from "../../formatters.js";
import type { AssistantReadableEvent, RunSummary, StreamPacket } from "../../types.js";

export function RunReplay({ stream, run }: { stream: StreamPacket | null; run?: RunSummary }): ReactElement {
  if (!run) return <div className="dark-panel empty-dark">选择一个 Run 查看回放。</div>;
  const finalOutput = artifactPreview(stream, "lastMessage") ?? artifactPreview(stream, "implementation") ?? "暂无 AI 最终输出";
  const rawPreview = artifactPreview(stream, "providerEvents") ?? artifactPreview(stream, "events") ?? artifactPreview(stream, "stdout") ?? "暂无原始日志";
  const visibleEvents = (stream?.events ?? []).slice(0, 8);
  const readableEvents = readableEventsFromStream(stream, run.id);
  return (
    <div className="dark-panel">
      <div className="replay-header">
        <div><span>{runtimeLabel(run.runtime)}</span><small>{run.id}</small></div>
        <em>{humanStatus(run.status)}</em>
      </div>
      <div className="run-summary-grid">
        <div><span>状态</span><strong>{humanStatus(run.status)}</strong></div>
        <div><span>开始</span><strong>{formatTime(run.startedAt) || "-"}</strong></div>
        <div><span>结束</span><strong>{formatTime(run.finishedAt) || "-"}</strong></div>
      </div>
      <section className="run-readable-section">
        <h3>运行阶段</h3>
        <div className="phase-list">
          {visibleEvents.length === 0 ? <div className="phase-row muted-row"><span>暂无阶段</span><small>等待 run artifact</small></div> : null}
          {visibleEvents.map((event) => (
            <div className="phase-row" key={event.id}>
              <time>{formatTime(event.timestamp)}</time>
              <span>{eventLabel(event.type)}</span>
              <small>{humanStatus(event.status ?? event.label)}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="run-readable-section">
        <h3>模型事件转录</h3>
        {readableEvents.length > 0 ? <AssistantReadableEventCards events={readableEvents} /> : <div className="phase-row muted-row"><span>暂无可读转录</span><small>查看原始日志</small></div>}
      </section>
      <section className="run-readable-section">
        <h3>AI 最终输出</h3>
        <pre className="final-output">{finalOutput}</pre>
      </section>
      <details className="raw-log-details">
        <summary>查看原始日志</summary>
        <pre className="code-preview">{rawPreview}</pre>
      </details>
      <div className="artifact-grid">
        {(stream?.artifacts ?? []).filter((item) => ["events", "stdout", "stderr", "providerEvents", "lastMessage", "providerEvents", "providerStderr", "providerLastMessage", "providerSession", "diff", "implementation", "validation", "audit"].includes(item.key)).map((artifact) => (
          <div className="artifact-chip" key={artifact.key}>
            <FileText size={15} />
            <span>{artifact.path.split("/").at(-1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssistantReadableEventCards({ events, defaultOpenProcess = false }: { events: AssistantReadableEvent[]; defaultOpenProcess?: boolean }): ReactElement {
  const displayEvents = dedupeAssistantEvents(events);
  if (displayEvents.length === 0) return <></>;
  const processEvents = displayEvents.filter(isFoldableProcessEvent);
  const primaryEvents = displayEvents.filter((event) => !isFoldableProcessEvent(event));
  return (
    <div className="assistant-event-stack">
      {primaryEvents.map((event, index) => <AssistantReadableEventCard event={event} key={`${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? ""}:primary:${index}`} />)}
      {processEvents.length > 0 ? (
        <details className="assistant-process-details" open={defaultOpenProcess}>
          <summary>展开本轮全部过程（{processEvents.length} 条）</summary>
          <div className="assistant-event-stack compact">
            {processEvents.map((event, index) => <AssistantReadableEventCard event={event} key={`${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? ""}:process:${index}`} />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function isFoldableProcessEvent(event: AssistantReadableEvent): boolean {
  if (event.isError) return false;
  return event.kind === "command" || event.kind === "mcp-tool" || event.kind === "web-search" || event.kind === "tool-result" || event.kind === "plan-update";
}

function AssistantReadableEventCard({ event }: { event: AssistantReadableEvent }): ReactElement {
  const label = event.title ?? readableEventTitle(event);
  return (
    <div className={`assistant-event-card ${event.isError ? "danger" : ""}`}>
      <div className="assistant-event-header">
        <strong>{label}</strong>
        {event.phase ? <small>{humanStatus(event.phase)}</small> : null}
      </div>
      {event.summary ? <p>{event.summary}</p> : null}
      {event.command ? <code>{event.command}</code> : null}
      {event.cwd ? <small className="event-muted">cwd: {event.cwd}</small> : null}
      {typeof event.exitCode === "number" ? <small className="event-muted">exit {event.exitCode}</small> : null}
      {event.preview ? <pre className="event-preview">{event.preview}</pre> : null}
      {event.artifactRef ? <small className="artifact-link">查看证据：{artifactName(event.artifactRef)}</small> : null}
      {event.truncated ? <small className="event-muted">输出已截断，完整内容在 Agent Loop 原始日志中。</small> : null}
    </div>
  );
}

function dedupeAssistantEvents(events: AssistantReadableEvent[]): AssistantReadableEvent[] {
  const map = new Map<string, AssistantReadableEvent>();
  for (const event of events) {
    map.set(`${event.runId}:${event.itemId ?? event.title ?? event.summary ?? ""}:${event.kind}:${event.phase ?? ""}`, event);
  }
  return Array.from(map.values());
}

function readableEventTitle(event: AssistantReadableEvent): string {
  if (event.kind === "reasoning-summary") return "推理摘要";
  if (event.kind === "command") return event.isError ? "命令失败" : event.phase === "started" ? "正在运行命令" : "命令完成";
  if (event.kind === "file-change") return "文件变更";
  if (event.kind === "mcp-tool") return "MCP 工具调用";
  if (event.kind === "web-search") return "网页搜索";
  if (event.kind === "plan-update") return "计划更新";
  if (event.kind === "tool-result") return "工具返回";
  if (event.kind === "usage") return "用量";
  if (event.kind === "error") return "错误";
  return "运行状态";
}

function artifactPreview(stream: StreamPacket | null, key: string): string | null {
  const artifact = stream?.artifacts.find((item) => item.key === key);
  return artifact?.preview ?? artifact?.tail ?? null;
}

function readableEventsFromStream(stream: StreamPacket | null, runId: string): AssistantReadableEvent[] {
  const events: AssistantReadableEvent[] = [];
  for (const event of stream?.events ?? []) {
    if (event.type.startsWith("validation.")) {
      events.push({
        runId,
        itemId: event.id,
        kind: "status",
        phase: event.status ?? event.label,
        title: event.type === "validation.command.exited" ? "Validation command" : "Validation",
        summary: eventLabel(event.type),
        isError: event.status === "failed",
      });
    }
    if (event.type.startsWith("audit.")) {
      events.push({
        runId,
        itemId: event.id,
        kind: "status",
        phase: event.status ?? event.label,
        title: "Audit",
        summary: eventLabel(event.type),
        isError: event.status === "failed",
      });
    }
  }
  return dedupeAssistantEvents(events).slice(-12);
}

export function artifactName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
