import {
  type ReactElement,
  type ReactNode } from "react";
import { RunReplay, artifactName } from "./RunReplayPanel.js";
import {
  agentRunStatusLabel,
  formatTime,
  humanStatus,
} from "../../formatters.js";
import { cleanTranscriptText,
  cleanTranscriptTitle } from "../../liveTranscript.js";
import type {
  CenterTab,
  DemandAgentRunGraph,
  DemandAgentRunGraphLaneId,
  DemandAgentRunGraphNode,
  LiveAssistantTurn,
  ParentAgentTranscript,
  ParentAgentTranscriptCell,
  ProjectStatus,
  RunSummary,
  Snapshot,
  StreamPacket,
  TopicDetail,
  Workpad,
} from "../../types.js";
export function MainConversationView({
  workpad,
  graph,
  transcript,
  activeTab,
  liveTurns,
  activeRun,
  stream,
  busy,
  onAction,
  onAnswerClarification,
  onSelectDecisionContext,
  onTabChange,
  selectedNode,
  onSelectNode,
  onSelectRun,
}: {
  workpad: Workpad;
  graph: DemandAgentRunGraph;
  transcript: ParentAgentTranscript;
  activeTab: CenterTab;
  liveTurns: LiveAssistantTurn[];
  activeRun?: RunSummary;
  stream: StreamPacket | null;
  busy: boolean;
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
  onTabChange: (tab: CenterTab) => void;
  selectedNode: DemandAgentRunGraphNode | null;
  onSelectNode: (nodeId: string) => void;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  return (
    <div className="main-conversation-view" data-testid="main-conversation-view">
      <div className="center-demand-tabs" role="tablist" aria-label="需求对话视图">
        <button type="button" role="tab" aria-selected={activeTab === "conversation"} className={activeTab === "conversation" ? "active" : ""} onClick={() => onTabChange("conversation")}>对话</button>
        <button type="button" role="tab" aria-selected={activeTab === "agentGraph"} className={activeTab === "agentGraph" ? "active" : ""} onClick={() => onTabChange("agentGraph")}>Agent 运行图</button>
      </div>
      {activeTab === "conversation" ? (
        <ParentAgentTranscriptView
          workpad={workpad}
          transcript={transcript}
          liveTurns={liveTurns}
          busy={busy}
          onAction={onAction}
          onAnswerClarification={onAnswerClarification}
          onSelectDecisionContext={onSelectDecisionContext}
        />
      ) : (
        <AgentRunGraphPanel
          graph={graph}
          selectedNode={selectedNode}
          activeRun={activeRun}
          stream={stream}
          onSelectNode={onSelectNode}
          onSelectRun={onSelectRun}
        />
      )}
    </div>
  );
}

function ParentAgentTranscriptView({
  workpad,
  transcript,
  liveTurns,
  busy,
  onAction,
  onAnswerClarification,
  onSelectDecisionContext,
}: {
  workpad: Workpad;
  transcript: ParentAgentTranscript;
  liveTurns: LiveAssistantTurn[];
  busy: boolean;
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  void workpad;
  void liveTurns;
  void busy;
  void onAnswerClarification;
  const cells = transcript.cells?.length ? transcript.cells.filter((cell) => cell.kind !== "detail-only") : [];
  return (
    <div className="parent-agent-transcript" data-testid="parent-agent-transcript">
      <div className="parent-agent-message-list">
        {cells.length === 0 ? <div className="empty-state">{transcript.emptyMessage ?? "暂无对话内容。"}</div> : null}
        {cells.map((cell) => <ParentAgentTranscriptCellView key={cell.id} cell={cell} />)}
      </div>
      <HiddenLegacyThreadHooks onAction={onAction} onSelectDecisionContext={onSelectDecisionContext} />
    </div>
  );
}

function ParentAgentTranscriptCellView({ cell }: { cell: ParentAgentTranscriptCell }): ReactElement {
  const isUser = cell.kind === "user-message";
  return (
    <div className={`parent-agent-message-row ${isUser ? "user" : "parent"}`} data-testid={isUser ? "parent-message-user" : "parent-message-parent-agent"}>
      <div className={`parent-agent-bubble ${isUser ? "user" : "parent"} ${cell.kind}`}>
        {cell.kind === "assistant-message" || cell.kind === "user-message"
          ? <ParentAgentTranscriptMessageCell cell={cell} />
          : <ParentAgentTranscriptProcessCell cell={cell} />}
      </div>
      {cell.timestamp ? <time>{formatTime(cell.timestamp)}</time> : null}
    </div>
  );
}

function ParentAgentTranscriptMessageCell({ cell }: { cell: ParentAgentTranscriptCell }): ReactElement {
  const title = cleanTranscriptTitle(cell.title);
  const text = normalizeCodexTranscriptText(cleanTranscriptText(cell.text));
  return (
    <div className={`parent-agent-prose ${cell.isError ? "danger" : ""}`}>
      {title ? <strong>{title}</strong> : null}
      <MarkdownLite text={text} idPrefix={cell.id} />
    </div>
  );
}

function ParentAgentTranscriptProcessCell({ cell }: { cell: ParentAgentTranscriptCell }): ReactElement {
  const evidenceRefs = dedupeParentCellEvidenceRefs(cell.evidenceRefs ?? []);
  const hasDetails = Boolean(cell.detailText?.trim()) || evidenceRefs.length > 0;
  const rawTitle = cleanTranscriptTitle(cell.title) || (cell.kind === "process-row" ? "运行" : "详情");
  const rawText = normalizeCodexTranscriptText(cleanTranscriptText(cell.text));
  const title = rawTitle === "已运行命令" && /^已运行\s+\d+\s+条命令/.test(rawText) ? rawText : rawTitle;
  const text = title === rawText ? "" : rawText;
  const detailText = normalizeCodexTranscriptText(cleanTranscriptText(cell.detailText));
  return (
    <div className={`parent-agent-tool-result compact ${cell.kind} ${cell.isError ? "danger" : ""}`}>
      <div className="tool-result-heading">
        <strong>{title}</strong>
        {cell.status && shouldShowTranscriptStatus(cell) ? <span>{humanStatus(cell.status)}</span> : null}
      </div>
      {text ? <MarkdownLite text={text} idPrefix={`${cell.id}:summary`} compact /> : null}
      {hasDetails ? (
        <details className="tool-result-details">
          <summary>查看详情</summary>
          {detailText ? <pre>{detailText}</pre> : null}
          {evidenceRefs.length ? (
            <div className="tool-result-evidence">
              {evidenceRefs.map((ref) => <span key={`${ref.kind}:${ref.ref}`}>材料：{artifactName(ref.ref)}</span>)}
            </div>
          ) : null}
        </details>
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

function MarkdownLite({ text, idPrefix, compact = false }: { text: string; idPrefix: string; compact?: boolean }): ReactElement {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split(/\n/).map((line) => line.trimEnd()).filter(Boolean);
        if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={`${idPrefix}:ul:${index}`} className={compact ? "markdown-lite-list compact" : "markdown-lite-list"}>
              {lines.map((line, lineIndex) => <li key={`${idPrefix}:li:${index}:${lineIndex}`}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""), `${idPrefix}:li:${index}:${lineIndex}`)}</li>)}
            </ul>
          );
        }
        if (lines.length > 1 && /^[^。.!?]{2,48}:$/.test(lines[0]) && lines.slice(1).every((line) => /^[-*]\s+/.test(line))) {
          return (
            <div key={`${idPrefix}:section-list:${index}`} className="markdown-lite-section-list">
              <strong className="markdown-lite-heading">{lines[0].replace(/:$/, "")}</strong>
              <ul className={compact ? "markdown-lite-list compact" : "markdown-lite-list"}>
                {lines.slice(1).map((line, lineIndex) => <li key={`${idPrefix}:section-li:${index}:${lineIndex}`}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""), `${idPrefix}:section-li:${index}:${lineIndex}`)}</li>)}
              </ul>
            </div>
          );
        }
        if (/^```/.test(block)) {
          return <pre key={`${idPrefix}:pre:${index}`} className="markdown-lite-code">{block.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "")}</pre>;
        }
        if (!compact && lines.length === 1 && /^[^。.!?]{2,32}:$/.test(lines[0])) {
          return <strong key={`${idPrefix}:heading:${index}`} className="markdown-lite-heading">{lines[0].replace(/:$/, "")}</strong>;
        }
        return <p key={`${idPrefix}:p:${index}`}>{renderInlineMarkdown(block, `${idPrefix}:p:${index}`)}</p>;
      })}
    </>
  );
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

function HiddenLegacyThreadHooks(_: {
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement | null {
  return null;
}

function AgentRunGraphPanel({
  graph,
  selectedNode,
  activeRun,
  stream,
  onSelectNode,
  onSelectRun,
}: {
  graph: DemandAgentRunGraph;
  selectedNode: DemandAgentRunGraphNode | null;
  activeRun?: RunSummary;
  stream: StreamPacket | null;
  onSelectNode: (nodeId: string) => void;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  return (
    <div className="agent-graph-panel" data-testid="agent-run-graph-panel">
      <header className="agent-graph-header">
        <div>
          <p className="eyebrow">Agent 运行图</p>
          <h2>{graph.title}</h2>
          <p>{graph.summary}</p>
        </div>
      </header>
      <div className="agent-graph-body">
        <AgentRunGraphCanvas graph={graph} selectedNodeId={selectedNode?.id ?? null} onSelectNode={onSelectNode} />
        <AgentRunNodeDetail node={selectedNode} activeRun={activeRun} stream={stream} onSelectRun={onSelectRun} />
      </div>
    </div>
  );
}

function AgentRunGraphCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  graph: DemandAgentRunGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}): ReactElement {
  const laneNodes = new Map<DemandAgentRunGraphLaneId, DemandAgentRunGraphNode[]>();
  for (const lane of graph.lanes) laneNodes.set(lane.id, []);
  for (const node of graph.nodes) {
    laneNodes.set(node.lane, [...(laneNodes.get(node.lane) ?? []), node]);
  }
  return (
    <div className="agent-graph-canvas" data-testid="agent-run-graph">
      {graph.lanes.map((lane) => {
        const nodes = laneNodes.get(lane.id) ?? [];
        if (nodes.length === 0) return null;
        return (
          <section className={`agent-graph-lane ${lane.id}`} key={lane.id}>
            <div className="agent-graph-lane-title">
              <strong>{lane.label}</strong>
              <span>{lane.description}</span>
            </div>
            <div className="agent-graph-node-list">
              {nodes.map((node) => (
                <button
                  type="button"
                  className={`agent-graph-node ${node.status} ${selectedNodeId === node.id ? "selected" : ""}`}
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  data-testid={`agent-run-node-${node.kind}`}
                >
                  <span className="node-status-dot" />
                  <strong>{node.label}</strong>
                  <small>{agentRunStatusLabel(node.status)}</small>
                  <p>{node.summary}</p>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {graph.edges.length > 0 ? (
        <div className="agent-graph-edge-summary">
          {graph.edges.slice(0, 10).map((edge) => <span key={edge.id}>{edge.label}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function AgentRunNodeDetail({
  node,
  activeRun,
  stream,
  onSelectRun,
}: {
  node: DemandAgentRunGraphNode | null;
  activeRun?: RunSummary;
  stream: StreamPacket | null;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  if (!node) {
    return (
      <aside className="agent-node-detail">
        <h3>选择一个节点</h3>
        <p>点击运行图里的主 agent、角色 agent、工具或后台维护节点查看详情。</p>
      </aside>
    );
  }
  const runId = node.target.runId;
  const showRunReplay = runId && activeRun?.id === runId;
  return (
    <aside className="agent-node-detail" data-testid="agent-run-node-detail">
      <div className="node-detail-heading">
        <span className={`node-kind ${node.status}`}>{agentRunStatusLabel(node.status)}</span>
        <h3>{node.label}</h3>
        <p>{node.reason}</p>
      </div>
      <div className="node-detail-section">
        <strong>输入摘要</strong>
        <p>{node.inputSummary ?? "输入来自当前需求对话和已确认的执行证据。"}</p>
      </div>
      <div className="node-detail-section">
        <strong>输出摘要</strong>
        <p>{node.outputSummary ?? node.summary}</p>
      </div>
      {node.attempts.length > 0 ? (
        <div className="node-detail-section">
          <strong>尝试历史</strong>
          <div className="node-attempt-list">
            {node.attempts.map((attempt) => (
              <div className="node-attempt" key={attempt.id}>
                <span>{agentRunStatusLabel(attempt.status)}</span>
                <p>{attempt.summary}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {node.evidenceRefs.length > 0 ? (
        <div className="node-detail-section">
          <strong>证据</strong>
          <div className="node-evidence-list">
            {node.evidenceRefs.map((ref) => (
              <span key={`${ref.kind}:${ref.ref}`}>{ref.label}: {artifactName(ref.ref)}</span>
            ))}
          </div>
        </div>
      ) : null}
      {node.lane === "maintenance" ? (
        <p className="panel-note">后台维护节点只生成 closeout、候选、评分和审查证据，不会自动修改 canonical docs、ECL 或项目稳定记忆。</p>
      ) : null}
      {runId ? (
        <button className="secondary-button" type="button" onClick={() => onSelectRun(runId)}>
          打开原始日志
        </button>
      ) : null}
      {showRunReplay ? (
        <div className="node-run-replay">
          <RunReplay stream={stream} run={activeRun} />
        </div>
      ) : null}
      {node.status === "needs-change" || node.status === "failed" ? (
        <p className="panel-note">如果当前结果有真实修改路径，可以在右侧确认队列或主对话中补充反馈；这里不伪装成独立子 agent 对话。</p>
      ) : null}
    </aside>
  );
}

export function BottomStatusBar({ snapshot, project, topic }: { snapshot: Snapshot; project: ProjectStatus | null; topic: TopicDetail | null }): ReactElement {
  const repoPath = snapshot.left.repo?.path ?? project?.path ?? "-";
  const issueCount = snapshot.warnings.length + (topic?.closeGate?.blockingIssues.length ?? 0);
  return (
    <footer className="bottom-status">
      <span>记忆：{snapshot.memory.memoryMode ?? (project?.project ? "unknown" : "未选择")}</span>
      <span>根目录：{repoPath}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />状态：{snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>当前需求：{topic?.title ?? "无"}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />Harness {snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>{issueCount} 个问题</span>
    </footer>
  );
}
