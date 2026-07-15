import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Bot, Brain, CheckCircle2, FilePenLine, LoaderCircle, Search, Terminal, Wrench } from "lucide-react";
import { artifactName } from "./RunReplayPanel.js";
import { formatTime, humanStatus } from "../../formatters.js";
import { cleanTranscriptText, cleanTranscriptTitle } from "../../liveTranscript.js";
import { SentMessageContextSummary, type ComposerContextAttachment } from "../../shell/ComposerContextSources.js";
import { ProviderUserInputRequestCard } from "./workpad/TaskGraphCards.js";
import {
  isLongTranscriptCell,
  transcriptCellDisplayText,
} from "./transcriptMeasurement.js";
import type { ProviderUserInputRequest, ParentAgentTranscriptCell } from "../../types.js";

export function AgentTranscriptPane({ cells, emptyMessage = "暂无 Agent 消息。", testId = "agent-transcript-pane", busy = false, onAnswerProviderUserInput }: {
  cells: ParentAgentTranscriptCell[];
  emptyMessage?: string;
  testId?: string;
  busy?: boolean;
  onAnswerProviderUserInput?: (request: ProviderUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
}): ReactElement {
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  return (
    <div className="agent-transcript-pane" data-testid={testId}>
      {cells.length === 0 ? <div className="empty-state">{emptyMessage}</div> : null}
      {cells.map((cell) => (
        <ParentAgentTranscriptCellView
          key={cell.id}
          cell={cell}
          expanded={expandedCells.has(cell.id)}
          onToggleExpanded={() => {
            setExpandedCells((current) => {
              const next = new Set(current);
              if (next.has(cell.id)) next.delete(cell.id);
              else next.add(cell.id);
              return next;
            });
          }}
          busy={busy}
          onAnswerProviderUserInput={onAnswerProviderUserInput}
        />
      ))}
    </div>
  );
}

export function ParentAgentTranscriptCellView({ cell, expanded, onToggleExpanded, onOpenAgent, busy = false, onAnswerProviderUserInput }: {
  cell: ParentAgentTranscriptCell;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenAgent?: (agentSurfaceId: string) => void;
  busy?: boolean;
  onAnswerProviderUserInput?: (request: ProviderUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
}): ReactElement {
  const isUser = cell.kind === "user-message";
  const rowKind = isUser ? "user" : "parent";
  return (
    <div
      className={`parent-agent-message-row transcript-cell-row ${rowKind} ${cell.kind}`}
      data-testid={isUser ? "parent-message-user" : "parent-message-parent-agent"}
      data-cell-id={cell.id}
      data-run-id={cell.runId}
      data-thread-id={cell.threadId}
      data-turn-id={cell.turnId}
      data-realtime={cell.realtime ? "true" : undefined}
    >
      <div className={`parent-agent-bubble transcript-cell-surface ${rowKind} ${cell.kind}`}>
        {cell.kind === "user-message" ? (
          <TranscriptUserMessage cell={cell} expanded={expanded} onToggleExpanded={onToggleExpanded} />
        ) : cell.kind === "assistant-message" ? (
          <TranscriptAssistantMessage cell={cell} expanded={expanded} onToggleExpanded={onToggleExpanded} />
        ) : cell.kind === "user-input" && cell.providerUserInput ? (
          <ProviderUserInputRequestCard
            request={cell.providerUserInput}
            busy={busy}
            onAnswer={onAnswerProviderUserInput ?? (async () => undefined)}
          />
        ) : (
          <TranscriptActivityRow cell={cell} expanded={expanded} onToggleExpanded={onToggleExpanded} onOpenAgent={onOpenAgent} />
        )}
      </div>
      {cell.timestamp && (cell.kind === "user-message" || cell.kind === "assistant-message") ? <time>{formatTime(cell.timestamp)}</time> : null}
    </div>
  );
}

export function TranscriptUserMessage({ cell, expanded, onToggleExpanded }: {
  cell: ParentAgentTranscriptCell;
  expanded: boolean;
  onToggleExpanded: () => void;
}): ReactElement {
  return (
    <TranscriptMessageProse
      cell={cell}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      className="transcript-user-message"
    />
  );
}

export function TranscriptAssistantMessage({ cell, expanded, onToggleExpanded }: {
  cell: ParentAgentTranscriptCell;
  expanded: boolean;
  onToggleExpanded: () => void;
}): ReactElement {
  return (
    <TranscriptMessageProse
      cell={cell}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      className="transcript-assistant-message"
    />
  );
}

function TranscriptMessageProse({ cell, expanded, onToggleExpanded, className }: {
  cell: ParentAgentTranscriptCell;
  expanded: boolean;
  onToggleExpanded: () => void;
  className: string;
}): ReactElement {
  const title = cleanTranscriptTitle(cell.title);
  const folded = isLongTranscriptCell(cell) && !expanded;
  const text = normalizeProviderTranscriptText(cleanTranscriptText(transcriptCellDisplayText(cell, expanded)));
  return (
    <div className={`parent-agent-prose transcript-message-prose ${className} ${cell.isError ? "danger" : ""}`}>
      {title ? <strong className="transcript-message-title">{title}</strong> : null}
      <TranscriptMarkdownLite text={text} idPrefix={cell.id} />
      {cell.kind === "user-message" ? (
        <SentMessageContextSummary
          contextRefs={cell.contextRefs}
          attachments={cell.attachments as ComposerContextAttachment[] | undefined}
        />
      ) : null}
      {isLongTranscriptCell(cell) ? (
        <button type="button" className="transcript-expand-button" onClick={onToggleExpanded}>
          {folded ? "展开完整内容" : "收起"}
        </button>
      ) : null}
    </div>
  );
}

export function TranscriptActivityRow({ cell, expanded, onToggleExpanded, onOpenAgent }: {
  cell: ParentAgentTranscriptCell;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenAgent?: (agentSurfaceId: string) => void;
}): ReactElement {
  const elapsed = useElapsedSeconds(cell.realtime ? cell.timestamp : undefined);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const detailsPinnedRef = useRef(true);
  const evidenceRefs = dedupeParentCellEvidenceRefs(cell.evidenceRefs ?? []);
  const hasDetails = Boolean(cell.detailText?.trim()) || evidenceRefs.length > 0;
  const rawTitle = cleanTranscriptTitle(cell.title) || (cell.kind === "process-row" ? "运行" : "材料");
  const rawText = normalizeProviderTranscriptText(cleanTranscriptText(cell.text));
  const title = rawTitle === "已运行命令" && /^已运行\s+\d+\s+条命令/.test(rawText) ? rawText : rawTitle;
  const statusLabel = cell.status ? humanStatus(cell.status) : "";
  const text = isDuplicativeActivitySummary(rawText, title, statusLabel) ? "" : rawText;
  const detailText = normalizeProviderTranscriptText(cleanTranscriptText(cell.detailText));
  const status = cell.status && shouldShowTranscriptStatus(cell) ? humanStatus(cell.status) : null;
  const detailsId = `${cell.id}:details`;
  const tone = transcriptActivityTone(cell);
  useEffect(() => {
    const node = detailsRef.current;
    if (expanded && node && detailsPinnedRef.current) node.scrollTop = node.scrollHeight;
  }, [detailText, expanded]);
  return (
    <div className={`parent-agent-tool-result transcript-activity-row compact ${cell.kind} tone-${tone} ${cell.realtime ? "realtime" : ""} ${expanded ? "expanded" : ""} ${hasDetails ? "has-details" : ""} ${cell.isError ? "danger" : ""}`}>
      <button
        type="button"
        className="transcript-activity-summary"
        onClick={cell.targetAgentSurfaceId && onOpenAgent ? () => onOpenAgent(cell.targetAgentSurfaceId!) : hasDetails ? onToggleExpanded : undefined}
        aria-expanded={hasDetails ? expanded : undefined}
        aria-controls={hasDetails ? detailsId : undefined}
      >
        <ActivityGlyph cell={cell} />
        <span className="tool-result-heading transcript-activity-heading">
          <strong>{title}{cell.realtime && elapsed !== null ? ` · ${elapsed} 秒` : ""}</strong>
          {status ? <span>{status}</span> : null}
        </span>
        {cell.targetAgentSurfaceId ? <span className="transcript-activity-disclosure" aria-hidden="true">打开</span> : hasDetails ? <span className="transcript-activity-disclosure" aria-hidden="true">{expanded ? "收起" : "详情"}</span> : null}
      </button>
      {text ? <TranscriptMarkdownLite text={text} idPrefix={`${cell.id}:summary`} compact /> : null}
      {hasDetails && expanded ? (
        <div
          ref={detailsRef}
          className="tool-result-details transcript-activity-details"
          id={detailsId}
          onScroll={(event) => {
            const node = event.currentTarget;
            detailsPinnedRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
          }}
        >
          {detailText ? <pre>{detailText}</pre> : null}
          {evidenceRefs.length ? (
            <div className="tool-result-evidence">
              {evidenceRefs.map((ref) => <span key={`${ref.kind}:${ref.ref}`}>材料：{artifactName(ref.ref)}</span>)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActivityGlyph({ cell }: { cell: ParentAgentTranscriptCell }): ReactElement {
  const size = 14;
  const icon = cell.activityKind === "command"
    ? <Terminal size={size} />
    : cell.activityKind === "file"
      ? <FilePenLine size={size} />
      : cell.activityKind === "search"
        ? <Search size={size} />
        : cell.activityKind === "agent"
          ? <Bot size={size} />
          : cell.activityKind === "reasoning"
            ? <Brain size={size} />
            : cell.activityKind === "turn"
              ? cell.realtime ? <LoaderCircle className="transcript-activity-spinner" size={size} /> : <CheckCircle2 size={size} />
              : <Wrench size={size} />;
  return <span className="transcript-activity-icon" aria-hidden="true">{icon}</span>;
}

function useElapsedSeconds(startedAt?: string): number | null {
  const [elapsed, setElapsed] = useState<number | null>(() => elapsedSeconds(startedAt));
  useEffect(() => {
    setElapsed(elapsedSeconds(startedAt));
    if (!startedAt) return;
    const timer = window.setInterval(() => setElapsed(elapsedSeconds(startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return elapsed;
}

function elapsedSeconds(startedAt?: string): number | null {
  if (!startedAt) return null;
  const time = Date.parse(startedAt);
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 1000)) : null;
}

function dedupeParentCellEvidenceRefs(refs: NonNullable<ParentAgentTranscriptCell["evidenceRefs"]>): NonNullable<ParentAgentTranscriptCell["evidenceRefs"]> {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldShowTranscriptStatus(cell: ParentAgentTranscriptCell): boolean {
  if (!cell.status) return false;
  if (cell.activityKind === "command") return false;
  if (cell.isError) return true;
  return ["running", "queued", "waiting-user", "needs-user-input", "failed"].includes(cell.status);
}

function transcriptActivityTone(cell: ParentAgentTranscriptCell): "subtle" | "active" | "attention" | "danger" {
  if (cell.isError || cell.status === "failed") return "danger";
  if (["blocked", "waiting-user", "needs-user-input", "waiting-decision"].includes(cell.status ?? "")) return "attention";
  if (["running", "queued", "streaming", "preparing", "started"].includes(cell.status ?? "")) return "active";
  return "subtle";
}

function isDuplicativeActivitySummary(summary: string, title: string, statusLabel: string): boolean {
  const normalizedSummary = normalizeActivityCopy(summary);
  if (!normalizedSummary) return true;
  const normalizedTitle = normalizeActivityCopy(title);
  const normalizedStatus = normalizeActivityCopy(statusLabel);
  const candidates = [
    normalizedTitle,
    normalizedStatus ? `${normalizedTitle} ${normalizedStatus}` : "",
    normalizedStatus ? `${normalizedTitle}${normalizedStatus}` : "",
    normalizedStatus ? `${normalizedStatus} ${normalizedTitle}` : "",
  ].filter(Boolean);
  return candidates.includes(normalizedSummary);
}

function normalizeActivityCopy(value: string): string {
  return value.replace(/[·:：.。]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeProviderTranscriptText(value: string): string {
  return value.trim();
}

export function TranscriptMarkdownLite({ text, idPrefix, compact = false }: { text: string; idPrefix: string; compact?: boolean }): ReactElement {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => renderMarkdownBlock(block, `${idPrefix}:block:${index}`, compact))}
    </>
  );
}

function renderMarkdownBlock(block: string, keyPrefix: string, compact: boolean): ReactElement {
  const lines = block.split(/\n/).map((line) => line.trimEnd()).filter(Boolean);
  const firstLine = lines[0] ?? "";
  const heading = /^(#{1,3})\s+(.+)$/.exec(firstLine);
  if (!compact && heading && lines.length === 1) {
    const level = heading[1]?.length ?? 1;
    return <strong key={keyPrefix} className={`markdown-lite-heading level-${level}`}>{heading[2]}</strong>;
  }
  if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
    return (
      <ul key={keyPrefix} className={compact ? "markdown-lite-list compact" : "markdown-lite-list"}>
        {lines.map((line, lineIndex) => <li key={`${keyPrefix}:li:${lineIndex}`}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""), `${keyPrefix}:li:${lineIndex}`)}</li>)}
      </ul>
    );
  }
  if (lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/.test(line))) {
    return (
      <ol key={keyPrefix} className={compact ? "markdown-lite-list markdown-lite-ordered compact" : "markdown-lite-list markdown-lite-ordered"}>
        {lines.map((line, lineIndex) => <li key={`${keyPrefix}:oli:${lineIndex}`}>{renderInlineMarkdown(line.replace(/^\d+[.)]\s+/, ""), `${keyPrefix}:oli:${lineIndex}`)}</li>)}
      </ol>
    );
  }
  if (lines.length > 0 && lines.every((line) => /^>\s?/.test(line))) {
    return (
      <blockquote key={keyPrefix} className="markdown-lite-quote">
        {lines.map((line, lineIndex) => <p key={`${keyPrefix}:quote:${lineIndex}`}>{renderInlineMarkdown(line.replace(/^>\s?/, ""), `${keyPrefix}:quote:${lineIndex}`)}</p>)}
      </blockquote>
    );
  }
  if (lines.length > 1 && /^[^。.!?]{2,48}:$/.test(lines[0] ?? "") && lines.slice(1).every((line) => /^[-*]\s+/.test(line))) {
    return (
      <div key={keyPrefix} className="markdown-lite-section-list">
        <strong className="markdown-lite-heading">{(lines[0] ?? "").replace(/:$/, "")}</strong>
        <ul className={compact ? "markdown-lite-list compact" : "markdown-lite-list"}>
          {lines.slice(1).map((line, lineIndex) => <li key={`${keyPrefix}:section-li:${lineIndex}`}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""), `${keyPrefix}:section-li:${lineIndex}`)}</li>)}
        </ul>
      </div>
    );
  }
  if (/^```/.test(block)) {
    const fence = /^```([^\n`]*)\n?([\s\S]*?)\n?```$/.exec(block);
    const language = fence?.[1]?.trim();
    const code = fence?.[2] ?? block.replace(/^```[^\n`]*\n?/i, "").replace(/\n?```$/, "");
    return (
      <div key={keyPrefix} className="markdown-lite-code-block">
        {language ? <span className="markdown-lite-code-label">{language}</span> : null}
        <pre className="markdown-lite-code">{code}</pre>
      </div>
    );
  }
  if (!compact && lines.length === 1 && /^[^。.!?]{2,32}:$/.test(lines[0] ?? "")) {
    return <strong key={keyPrefix} className="markdown-lite-heading">{(lines[0] ?? "").replace(/:$/, "")}</strong>;
  }
  return <p key={keyPrefix}>{renderInlineMarkdown(block, keyPrefix)}</p>;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1]) {
      nodes.push(<code key={`${keyPrefix}:code:${match.index}`}>{match[1]}</code>);
    } else if (match[2]) {
      nodes.push(<span key={`${keyPrefix}:link:${match.index}`} className="markdown-lite-link">{match[2]}</span>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
