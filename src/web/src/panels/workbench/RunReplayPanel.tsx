import type { ReactElement } from "react";
import { FileText } from "lucide-react";
import { eventLabel, formatTime, humanStatus, runtimeLabel } from "../../formatters.js";
import type { AssistantReadableEvent, RunSummary, StreamPacket } from "../../types.js";

export function RunReplay({ stream, run }: { stream: StreamPacket | null; run?: RunSummary }): ReactElement {
  if (!run) return <div className="dark-panel empty-dark">选择一个 Run 查看回放。</div>;
  const finalOutput = artifactPreview(stream, "lastMessage") ?? artifactPreview(stream, "implementation") ?? "暂无 AI 最终输出";
  const rawPreview = artifactPreview(stream, "codexEvents") ?? artifactPreview(stream, "events") ?? artifactPreview(stream, "stdout") ?? "暂无原始日志";
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
        {(stream?.artifacts ?? []).filter((item) => ["events", "stdout", "stderr", "codexEvents", "lastMessage", "appServerEvents", "appServerStderr", "appServerLastMessage", "agentSession", "diff", "implementation", "validation", "audit"].includes(item.key)).map((artifact) => (
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
  const displayEvents = dedupeAssistantEvents(events.map(mainThreadAssistantEvent).filter((event): event is AssistantReadableEvent => Boolean(event)));
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

function mainThreadAssistantEvent(event: AssistantReadableEvent): AssistantReadableEvent | null {
  if (!isMainThreadAssistantEvent(event)) return null;
  if (hasInternalRunMetadata(event.preview)) {
    return {
      ...event,
      title: event.kind === "command" ? readableEventTitle(event) : event.title,
      summary: event.summary ?? "内部执行详情已记录到 Agent Loop，可在原始日志中查看。",
      preview: undefined,
      truncated: false,
    };
  }
  return event;
}

function isMainThreadAssistantEvent(event: AssistantReadableEvent): boolean {
  if (event.kind !== "status") return true;
  const normalized = `${event.title ?? ""} ${event.summary ?? ""} ${event.phase ?? ""}`.toLowerCase();
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  if (normalized.includes("codex completed the turn")) return false;
  return event.isError === true || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

function hasInternalRunMetadata(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  const artifactSignals = ["codex-events.jsonl", "events.jsonl", "stdout.log", "stderr.log", "last-message.md"];
  const hasArtifactSignal = artifactSignals.some((signal) => normalized.includes(signal));
  const hasRunMetadataShape = normalized.includes('"runtime"') && normalized.includes('"artifacts"') && normalized.includes('"promptstack"');
  const hasCodexInvocation = normalized.includes('"command"') && normalized.includes('"codex"') && normalized.includes("--output-last-message");
  return hasRunMetadataShape || hasCodexInvocation || (hasArtifactSignal && normalized.includes('"artifacts"'));
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
  const codexPreview = artifactPreview(stream, "codexEvents");
  if (codexPreview) {
    for (const line of codexPreview.split(/\r?\n/)) {
      const parsed = parseJsonLine(line);
      if (!parsed) continue;
      const event = readableEventFromCodexArtifact(parsed, runId);
      if (event) events.push(event);
    }
  }
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

function readableEventFromCodexArtifact(raw: Record<string, unknown>, runId: string): AssistantReadableEvent | null {
  if ((raw.type === "item.started" || raw.type === "item.completed") && isRecord(raw.item)) {
    const item = raw.item;
    const itemType = normalizeCodexItemType(item.type);
    const phase = raw.type === "item.started" ? "started" : "completed";
    const itemId = typeof item.id === "string" ? item.id : undefined;
    if (itemType === "commandexecution") {
      const output = stringField(item, "aggregated_output", "aggregatedOutput", "output");
      return {
        runId,
        itemId,
        kind: "command",
        phase,
        title: phase === "started" ? "Command started" : "Command completed",
        summary: stringField(item, "command") ?? "Command execution",
        command: stringField(item, "command"),
        cwd: stringField(item, "cwd"),
        exitCode: numberField(item, "exit_code", "exitCode"),
        preview: output ? truncatePreview(output, 900) : undefined,
        truncated: output ? output.length > 900 : undefined,
        isError: numberField(item, "exit_code", "exitCode") !== undefined ? numberField(item, "exit_code", "exitCode") !== 0 : item.status === "failed",
      };
    }
    if (itemType === "reasoning") {
      const summary = stringField(item, "summary_text", "summaryText", "thinking_summary", "thinkingSummary");
      if (!summary) return null;
      return { runId, itemId, kind: "reasoning-summary", phase, title: "Reasoning summary", preview: truncatePreview(summary, 900) };
    }
    if (itemType === "filechange") {
      return { runId, itemId, kind: "file-change", phase, title: "File change", summary: stringField(item, "path", "file_path", "filePath") ?? "File changes recorded." };
    }
    if (itemType === "mcptoolcall" || itemType === "dynamictoolcall" || itemType === "collabtoolcall") {
      return { runId, itemId, kind: "mcp-tool", phase, title: stringField(item, "tool", "name") ?? "Tool call", summary: stringField(item, "server") };
    }
    if (itemType === "websearch") {
      return { runId, itemId, kind: "web-search", phase, title: "Web search", summary: stringField(item, "query") };
    }
  }
  if (raw.type === "turn.completed" && isRecord(raw.usage)) {
    return { runId, kind: "usage", phase: "completed", title: "Usage recorded", summary: formatUsage(raw.usage) };
  }
  if (raw.type === "error") {
    return { runId, kind: "error", phase: "failed", title: "Codex error", summary: stringField(raw, "message", "error"), isError: true };
  }
  return null;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCodexItemType(value: unknown): string {
  return typeof value === "string" ? value.replace(/[_\-/]/g, "").toLowerCase() : "";
}

function stringField(object: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function numberField(object: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+$/u, "")}\n[truncated; see raw log]`;
}

function formatUsage(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : typeof usage.inputTokens === "number" ? usage.inputTokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : typeof usage.outputTokens === "number" ? usage.outputTokens : undefined;
  if (input === undefined && output === undefined) return "Usage recorded";
  return `Tokens in ${input ?? "-"} / out ${output ?? "-"}`;
}

export function artifactName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
