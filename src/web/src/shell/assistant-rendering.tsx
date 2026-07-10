import type { ReactElement } from "react";
import { Clock3, Code2 } from "lucide-react";
import {
  formatTime,
  formatUsage,
  humanStatus,
  runtimeLabel,
} from "../formatters.js";
import type {
  AssistantReadableEvent,
  AssistantTurnBlock,
  LiveAssistantTurn,
  LiveTurnEvent,
  ThreadStreamEvidence,
  WorkbenchLiveToolEvent,
} from "../types.js";
import {
  blockTitle,
  filterLegacyToolEvents,
  mainThreadAssistantEvent,
  normalizeTurnBlocks,
  readableEventTitle,
} from "./assistant-blocks.js";

export function AssistantActivity({ events }: { events: LiveTurnEvent[] }): ReactElement {
  const statusEvents = events.filter((event): event is Extract<LiveTurnEvent, { kind: "status" }> => event.kind === "status");
  const assistantEvents = events
    .filter((event): event is Extract<LiveTurnEvent, { kind: "assistant-event" }> => event.kind === "assistant-event")
    .map((event) => mainThreadAssistantEvent(event.event))
    .filter((event): event is AssistantReadableEvent => Boolean(event));
  const toolEvents = filterLegacyToolEvents(
    events.filter((event): event is Extract<LiveTurnEvent, { kind: "tool" }> => event.kind === "tool" && event.tool.phase !== "stderr"),
    assistantEvents,
  );
  const usage = assistantEvents.some((event) => event.kind === "usage") ? undefined : events.find((event): event is Extract<LiveTurnEvent, { kind: "usage" }> => event.kind === "usage");
  const errors = events.filter((event): event is Extract<LiveTurnEvent, { kind: "error" }> => event.kind === "error");
  return (
    <div className="assistant-activity">
      {statusEvents.length > 0 ? (
        <div className="activity-status-row">
          {statusEvents.slice(-4).map((event, index) => (
            <span key={`${event.label}:${index}`}>{humanStatus(event.detail ?? event.label)}</span>
          ))}
        </div>
      ) : null}
      {assistantEvents.length > 0 ? <AssistantReadableEventCards events={assistantEvents} /> : null}
      {toolEvents.length > 0 ? <ToolEventGroup events={toolEvents} /> : null}
      {usage ? <small className="usage-line">{formatUsage(usage.usage)}</small> : null}
      {errors.map((error, index) => <div className="live-error" key={`activity-error:${index}`}>{error.message}</div>)}
    </div>
  );
}

export function LiveAssistantTurnView({ turn }: { turn: LiveAssistantTurn }): ReactElement {
  const assistantEvents = turn.events
    .filter((event): event is Extract<LiveTurnEvent, { kind: "assistant-event" }> => event.kind === "assistant-event")
    .map((event) => mainThreadAssistantEvent(event.event))
    .filter((event): event is AssistantReadableEvent => Boolean(event));
  const toolEvents = filterLegacyToolEvents(
    turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "tool" }> => event.kind === "tool" && event.tool.phase !== "stderr"),
    assistantEvents,
  );
  const statusEvents = turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "status" }> => event.kind === "status");
  const usage = assistantEvents.some((event) => event.kind === "usage") ? undefined : turn.events.find((event): event is Extract<LiveTurnEvent, { kind: "usage" }> => event.kind === "usage");
  const errors = turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "error" }> => event.kind === "error");
  const latestStatus = statusEvents.at(-1);
  return (
    <div className={`timeline-item live-turn ${turn.status === "failed" ? "danger" : "success"}`}>
      <div className="timeline-icon"><Code2 size={16} /></div>
      <div>
        <strong>{runtimeLabel(turn.runtime ?? turn.actionType ?? "AI 运行")}</strong>
        <div className="live-status-pill">
          <Clock3 size={14} />
          <span>{humanStatus(latestStatus?.label ?? turn.status)}</span>
          {latestStatus?.detail ? <small>{latestStatus.detail}</small> : null}
        </div>
        {turn.blocks.length > 0 ? (
          <AssistantTurnBlocks blocks={turn.blocks} defaultOpenProcess completed={false} />
        ) : (
          <>
            {turn.text.trim() ? <p className="assistant-live-text">{turn.text}</p> : <p className="assistant-live-text muted">等待首批输出中...</p>}
            {assistantEvents.length > 0 ? <AssistantReadableEventCards events={assistantEvents} defaultOpenProcess /> : null}
            {toolEvents.length > 0 ? <ToolEventGroup events={toolEvents} /> : null}
            {usage ? <small className="usage-line">{formatUsage(usage.usage)}</small> : null}
            {errors.map((error, index) => <div className="live-error" key={`${turn.id}:error:${index}`}>{error.message}</div>)}
          </>
        )}
      </div>
      <time>{formatTime(turn.startedAt)}</time>
    </div>
  );
}

export function AssistantTurnBlocks({
  blocks,
  defaultOpenProcess = false,
  completed = true,
}: {
  blocks: AssistantTurnBlock[];
  defaultOpenProcess?: boolean;
  completed?: boolean;
}): ReactElement {
  const displayBlocks = normalizeTurnBlocks(blocks);
  if (displayBlocks.length === 0) return <></>;
  return (
    <div className="assistant-block-stack">
      {displayBlocks.map((block) => {
        if (block.kind === "command-group") {
          const children = block.children ?? [];
          const open = defaultOpenProcess || !completed || children.some((child) => child.isError);
          return (
            <details className="assistant-command-group" open={open} key={block.id} data-testid="assistant-block-command-group">
              <summary>{block.title ?? `已运行 ${children.length} 条命令`}</summary>
              <div className="assistant-block-stack compact">
                {children.map((child) => <AssistantBlockView block={child} key={child.id} />)}
              </div>
            </details>
          );
        }
        return <AssistantBlockView block={block} key={block.id} />;
      })}
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

export function AssistantEvidenceBlocks({ evidence }: { evidence: ThreadStreamEvidence[] }): ReactElement {
  const visible = dedupeEvidence(evidence);
  if (visible.length === 0) return <></>;
  return (
    <div className="assistant-evidence-stack">
      {visible.map((item) => (
        <div className={`assistant-evidence-row ${item.status === "failed" || item.status === "blocked" ? "danger" : ""}`} key={item.id}>
          <div>
            <strong>{evidenceLabel(item)}</strong>
            {item.body ? <p>{item.body}</p> : null}
          </div>
          <span>{humanStatus(item.status ?? item.source)}</span>
          {item.artifact ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
        </div>
      ))}
    </div>
  );
}

export function artifactName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function AssistantBlockView({ block }: { block: AssistantTurnBlock }): ReactElement {
  if (block.kind === "prose") return <p className="assistant-prose-block" data-testid="assistant-block-prose">{block.text}</p>;
  if (block.kind === "usage") return <small className="usage-line" data-testid="assistant-block-usage">{block.text ?? block.preview ?? "用量已记录"}</small>;
  const className = `assistant-block-card ${block.isError || block.kind === "error" ? "danger" : ""}`;
  return (
    <div className={className} data-testid={`assistant-block-${block.kind}`}>
      <div className="assistant-event-header">
        <strong>{block.title ?? blockTitle(block)}</strong>
        {block.status ? <small>{humanStatus(block.status)}</small> : null}
      </div>
      {block.text ? <p>{block.text}</p> : null}
      {block.command ? <code>{block.command}</code> : null}
      {block.cwd ? <small className="event-muted">cwd: {block.cwd}</small> : null}
      {typeof block.exitCode === "number" ? <small className="event-muted">exit {block.exitCode}</small> : null}
      {block.preview ? <pre className="event-preview">{block.preview}</pre> : null}
      {block.artifactRef ? <small className="artifact-link">查看证据：{artifactName(block.artifactRef)}</small> : null}
      {block.truncated ? <small className="event-muted">输出已截断，完整内容在 Agent Loop 原始日志中。</small> : null}
    </div>
  );
}

function isFoldableProcessEvent(event: AssistantReadableEvent): boolean {
  if (event.isError) return false;
  return event.kind === "command" || event.kind === "mcp-tool" || event.kind === "web-search" || event.kind === "tool-result" || event.kind === "plan-update";
}

function dedupeEvidence(evidence: ThreadStreamEvidence[]): ThreadStreamEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function evidenceLabel(item: ThreadStreamEvidence): string {
  if (item.source === "validation") return `验证：${humanStatus(item.status ?? item.label)}`;
  if (item.source === "audit") return `审查：${humanStatus(item.status ?? item.label)}`;
  if (item.source === "workflow") return "执行结果";
  if (item.source === "decision") return "决策";
  return item.label;
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

function ToolEventGroup({ events }: { events: Array<Extract<LiveTurnEvent, { kind: "tool" }>> }): ReactElement {
  const commandEvents = events.filter((event) => event.tool.command);
  const phaseEvents = events.filter((event) => !event.tool.command);
  return (
    <div className="tool-event-stack">
      {commandEvents.length > 1 ? (
        <details className="tool-event-details">
          <summary>已运行 {commandEvents.length} 条命令</summary>
          {commandEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:${index}`} />)}
        </details>
      ) : commandEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:${index}`} />)}
      {phaseEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:phase:${index}`} />)}
    </div>
  );
}

function ToolEventCard({ event }: { event: WorkbenchLiveToolEvent }): ReactElement {
  const label = event.command
    ? event.phase === "started" ? "正在运行命令" : event.isError ? "命令失败" : "命令完成"
    : event.name ? `${event.name} ${humanStatus(event.status ?? event.phase)}` : humanStatus(event.phase);
  return (
    <div className={`tool-event-card ${event.isError ? "danger" : ""}`}>
      <strong>{label}</strong>
      {event.command ? <code>{event.command}</code> : null}
      {typeof event.exitCode === "number" ? <small>exit {event.exitCode}</small> : null}
      {event.outputTail ? <pre className="event-preview">{event.outputTail}</pre> : null}
    </div>
  );
}
