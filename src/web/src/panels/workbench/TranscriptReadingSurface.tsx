import type { ReactElement, ReactNode } from "react";
import { artifactName } from "./RunReplayPanel.js";
import { formatTime, humanStatus } from "../../formatters.js";
import { cleanTranscriptText, cleanTranscriptTitle } from "../../liveTranscript.js";
import {
  isLongTranscriptCell,
  transcriptCellDisplayText,
} from "./transcriptMeasurement.js";
import type { ParentAgentTranscriptCell } from "../../types.js";

export function ParentAgentTranscriptCellView({ cell, expanded, onToggleExpanded }: {
  cell: ParentAgentTranscriptCell;
  expanded: boolean;
  onToggleExpanded: () => void;
}): ReactElement {
  const isUser = cell.kind === "user-message";
  const rowKind = isUser ? "user" : "parent";
  return (
    <div
      className={`parent-agent-message-row transcript-cell-row ${rowKind} ${cell.kind}`}
      data-testid={isUser ? "parent-message-user" : "parent-message-parent-agent"}
    >
      <div className={`parent-agent-bubble transcript-cell-surface ${rowKind} ${cell.kind}`}>
        {cell.kind === "user-message" ? (
          <TranscriptUserMessage cell={cell} expanded={expanded} onToggleExpanded={onToggleExpanded} />
        ) : cell.kind === "assistant-message" ? (
          <TranscriptAssistantMessage cell={cell} expanded={expanded} onToggleExpanded={onToggleExpanded} />
        ) : (
          <TranscriptActivityRow cell={cell} expanded={expanded} onToggleExpanded={onToggleExpanded} />
        )}
      </div>
      {cell.timestamp ? <time>{formatTime(cell.timestamp)}</time> : null}
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
  const text = normalizeCodexTranscriptText(cleanTranscriptText(transcriptCellDisplayText(cell, expanded)));
  return (
    <div className={`parent-agent-prose transcript-message-prose ${className} ${cell.isError ? "danger" : ""}`}>
      {title ? <strong className="transcript-message-title">{title}</strong> : null}
      <TranscriptMarkdownLite text={text} idPrefix={cell.id} />
      {isLongTranscriptCell(cell) ? (
        <button type="button" className="transcript-expand-button" onClick={onToggleExpanded}>
          {folded ? "展开完整内容" : "收起"}
        </button>
      ) : null}
    </div>
  );
}

export function TranscriptActivityRow({ cell, expanded, onToggleExpanded }: {
  cell: ParentAgentTranscriptCell;
  expanded: boolean;
  onToggleExpanded: () => void;
}): ReactElement {
  const evidenceRefs = dedupeParentCellEvidenceRefs(cell.evidenceRefs ?? []);
  const hasDetails = Boolean(cell.detailText?.trim()) || evidenceRefs.length > 0;
  const rawTitle = cleanTranscriptTitle(cell.title) || (cell.kind === "process-row" ? "运行" : "材料");
  const rawText = normalizeCodexTranscriptText(cleanTranscriptText(cell.text));
  const title = rawTitle === "已运行命令" && /^已运行\s+\d+\s+条命令/.test(rawText) ? rawText : rawTitle;
  const text = title === rawText ? "" : rawText;
  const detailText = normalizeCodexTranscriptText(cleanTranscriptText(cell.detailText));
  const status = cell.status && shouldShowTranscriptStatus(cell) ? humanStatus(cell.status) : null;
  const detailsId = `${cell.id}:details`;
  return (
    <div className={`parent-agent-tool-result transcript-activity-row compact ${cell.kind} ${cell.isError ? "danger" : ""}`}>
      <button
        type="button"
        className="transcript-activity-summary"
        onClick={hasDetails ? onToggleExpanded : undefined}
        aria-expanded={hasDetails ? expanded : undefined}
        aria-controls={hasDetails ? detailsId : undefined}
      >
        <span className="transcript-activity-dot" aria-hidden="true" />
        <span className="tool-result-heading transcript-activity-heading">
          <strong>{title}</strong>
          {status ? <span>{status}</span> : null}
        </span>
      </button>
      {text ? <TranscriptMarkdownLite text={text} idPrefix={`${cell.id}:summary`} compact /> : null}
      {hasDetails && expanded ? (
        <div className="tool-result-details transcript-activity-details" id={detailsId}>
          {detailText ? <pre>{detailText}</pre> : null}
          {evidenceRefs.length ? (
            <div className="tool-result-evidence">
              {evidenceRefs.map((ref) => <span key={`${ref.kind}:${ref.ref}`}>材料：{artifactName(ref.ref)}</span>)}
            </div>
          ) : null}
        </div>
      ) : null}
      {hasDetails ? (
        <button type="button" className="transcript-activity-toggle" onClick={onToggleExpanded}>
          {expanded ? "收起详情" : "查看详情"}
        </button>
      ) : null}
    </div>
  );
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
  if (cell.isError) return true;
  return ["running", "queued", "waiting-user", "needs-user-input", "failed"].includes(cell.status);
}

function normalizeCodexTranscriptText(value: string): string {
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
