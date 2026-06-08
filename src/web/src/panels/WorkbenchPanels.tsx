import {
  useState,
  type ReactElement,
  type ReactNode } from "react";
import { Check,
  FileText,
  X
} from "lucide-react";
import { workflowActionLabel } from "../action-labels.js";
import { TaskQueuePanel } from "./TaskQueuePanel.js";
import { workflowActionPayloadFromScope } from "../workflow-actions.js";
import {
  agentRunStatusLabel,
  codingPackageExecutionLabel,
  codingPackageSplitLabel,
  codingPackageStatusLabel,
  confirmationKindLabel,
  conversationLifecycleLabel,
  decisionKindLabel,
  decompositionReadinessLabel,
  decompositionRecommendationLabel,
  eventLabel,
  formatTime,
  humanStatus,
  readinessLabel,
  resultReviewStatusLabel,
  roleLabel,
  runtimeLabel,
  statusOrDash,
  sourceLabel,
  taskStatusLabel,
  userFacingText,
  userStatusLabel,
  workpadStateLabel,
  workpadStatusLabel
} from "../formatters.js";
import { cleanTranscriptText,
  cleanTranscriptTitle } from "../liveTranscript.js";
import type {
  Approval,
  AssistantReadableEvent,
  CenterTab,
  ClarificationRequest,
  ConfirmationQueue,
  ConfirmationQueueItem,
  DecisionAction,
  DecisionContext,
  DecisionInspector,
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
  WorkbenchCodingPackage,
  WorkbenchTaskNode,
  Workpad,
  WorkpadNextAction
} from "../types.js";
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

export function DecisionInspectorPane({
  inspector,
  confirmationQueue,
  confirming,
  error,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
  onSelectContext,
}: {
  inspector: DecisionInspector;
  confirmationQueue: ConfirmationQueue;
  confirming: string | null;
  error: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
  onSelectContext: (id: string | null) => void;
}): ReactElement {
  const primaryQueueItem = confirmationQueue.primary;
  return (
    <>
      <div className="approval-header">
        <h2>需要你确认</h2>
        <span>{primaryQueueItem ? 1 : 0}</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      {!primaryQueueItem ? (
        <div className="approval-empty">
          <h3>暂无需要确认</h3>
          <p>执行过程、证据和后台维护不会堆在这里；只有需要你做决定的事项会出现。</p>
        </div>
      ) : (
        <ConfirmationQueueCard
          item={primaryQueueItem}
          confirming={confirming}
          onConfirmingChange={onConfirmingChange}
          onExecuteAction={onExecuteAction}
          onFeedback={onFeedback}
        />
      )}
      {confirmationQueue.otherDemands.length > 0 ? (
        <section className="decision-related">
          <div className="approval-header compact">
            <h2>其他需求等你确认</h2>
            <span>{confirmationQueue.otherDemands.length}</span>
          </div>
          {confirmationQueue.otherDemands.map((item) => (
            <button className="decision-row" key={item.id} onClick={() => item.changeId ? onSelectContext(`confirm:${item.changeId}`) : undefined}>
              <strong>{userFacingText(item.whyNeedsConfirmation)}</strong>
              <span>{confirmationKindLabel(item.kind)} · {userFacingText(item.summary)}</span>
            </button>
          ))}
        </section>
      ) : null}
      <DecisionContextHistory contexts={inspector.history} onSelectContext={onSelectContext} />
    </>
  );
}

function ConfirmationQueueCard({
  item,
  confirming,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  item: ConfirmationQueueItem;
  confirming: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
}): ReactElement {
  const context = confirmationItemToDecisionContext(item);
  return (
    <DecisionContextCard
      context={context}
      confirming={confirming}
      onConfirmingChange={onConfirmingChange}
      onExecuteAction={onExecuteAction}
      onFeedback={onFeedback}
    />
  );
}

function confirmationItemToDecisionContext(item: ConfirmationQueueItem): DecisionContext {
  return {
    id: item.id,
    kind: item.kind,
    title: item.whyNeedsConfirmation,
    summary: item.summary,
    resultSummary: item.summary,
    recommendation: item.confirmEffect,
    explanation: item.riskSummary,
    severity: item.status === "failed" ? "blocking" : "info",
    changeId: item.changeId ?? item.conversationId,
    runId: item.runId,
    targetId: item.worktreeId ?? item.applyCheckId ?? item.resultId,
    artifact: item.evidenceRefs[0],
    actions: item.actions,
    userStatus: "waiting-confirmation",
  };
}

function DecisionContextCard({
  context,
  confirming,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  context: DecisionContext;
  confirming: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
}): ReactElement {
  const [feedbackActionId, setFeedbackActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const feedbackAction = context.actions.find((action) => action.id === feedbackActionId);
  async function submitFeedback(): Promise<void> {
    if (!feedbackAction || !feedback.trim()) return;
    await onFeedback(context, feedbackAction, feedback);
    setFeedback("");
    setFeedbackActionId(null);
  }
  return (
    <article className={`approval-card decision-primary ${context.severity}`} data-testid="decision-inspector-primary">
      <div className="approval-meta">
        <span>当前需要你决定</span>
        <small>{context.userStatus ? userStatusLabel(context.userStatus) : decisionKindLabel(context.kind)}</small>
      </div>
      <h3>{userFacingText(context.title)}</h3>
      <div className="decision-explainer">
        <strong>结果摘要</strong>
        <p>{userFacingText(context.resultSummary ?? context.summary)}</p>
      </div>
      <div className="decision-explainer">
        <strong>推荐动作</strong>
        <p>{userFacingText(context.recommendation ?? "查看证据后选择同意、要求修改或放弃。")}</p>
      </div>
      <div className="decision-explainer muted">
        <strong>说明</strong>
        <p>{userFacingText(context.explanation ?? "内部运行状态只作为证据和恢复信息，不是用户主决策语言。")}</p>
      </div>
      <dl className="approval-fields">
        <div><dt>变更</dt><dd>{context.changeId ?? "-"}</dd></div>
        {context.taskId ? <div><dt>任务</dt><dd>{context.taskId}</dd></div> : null}
        {context.queueRunId ? <div><dt>队列</dt><dd>{context.queueRunId}</dd></div> : null}
        {context.taskRunId ? <div><dt>执行尝试</dt><dd>{context.taskRunId}</dd></div> : null}
        {context.runId ? <div><dt>运行证据</dt><dd>{context.runId}</dd></div> : null}
      </dl>
      <div className="approval-actions">
        {context.actions.map((action) => {
          if (action.kind === "feedback") {
            return <button key={action.id} className="outline-button" disabled={!action.enabled} title={action.disabledReason} onClick={() => setFeedbackActionId(action.id)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind === "evidence") {
            return <button key={action.id} className="outline-button" disabled={!action.enabled} onClick={() => void onExecuteAction(action, context)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind !== "approval" && action.kind !== "workflow-action" && action.kind !== "abandon") return null;
          return confirming === action.id ? (
            <span className="confirm-inline" key={action.id}>
              <button className="primary-button" onClick={() => void onExecuteAction(action, context)}><Check size={15} />确认</button>
              <button className="outline-button" onClick={() => onConfirmingChange(null)}><X size={15} />取消</button>
            </span>
          ) : (
            <button key={action.id} className="primary-button" disabled={!action.enabled} title={action.disabledReason} onClick={() => action.requiresConfirmation ? onConfirmingChange(action.id) : void onExecuteAction(action, context)}><Check size={15} />{userFacingText(action.label)}</button>
          );
        })}
      </div>
      {feedbackAction ? (
        <div className="decision-feedback" data-testid="decision-feedback-editor">
          <label>
            <span>{userFacingText(context.rework?.label ?? feedbackAction.label)}</span>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={context.rework?.placeholder ?? "写下需要修改的地方"}
              rows={4}
            />
          </label>
          <div className="approval-actions">
            <button className="primary-button" disabled={!feedback.trim()} onClick={() => void submitFeedback()}>提交反馈</button>
            <button className="outline-button" onClick={() => { setFeedback(""); setFeedbackActionId(null); }}>取消</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DecisionContextHistory({ contexts, onSelectContext }: { contexts: DecisionContext[]; onSelectContext: (id: string) => void }): ReactElement {
  return (
    <section className="decision-history">
      <div className="approval-header compact">
        <h2>历史</h2>
        <span>{contexts.length}</span>
      </div>
      {contexts.length === 0 ? <div className="approval-empty"><h3>暂无历史决策</h3><p>接受、要求修改或完成的动作会保留在这里。</p></div> : null}
      <details className="decision-history-details" open={false}>
        <summary>查看历史决策</summary>
        {contexts.map((context) => (
          <button className="decision-row" key={context.id} onClick={() => onSelectContext(context.id)}>
            <strong>{userFacingText(context.title)}</strong>
            <span>{decisionKindLabel(context.kind)} · {context.timestamp ? formatTime(context.timestamp) : userFacingText(context.severity)}</span>
          </button>
        ))}
      </details>
    </section>
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

export function WorkpadView(props: {
  workpad: Workpad;
  approvals: Approval[];
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const { workpad, approvals, busy, onWorkflowAction, onConfirmApproval } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const approval = workpad.nextAction.approvalId ? approvals.find((item) => item.id === workpad.nextAction.approvalId) : undefined;
  const maintenanceNotice = workpad.maintenance?.status && workpad.maintenance.status !== "idle" ? workpad.maintenance : null;
  return (
    <div className="parent-conversation" data-testid="workpad-view">
      <section className="parent-agent-card">
        <div>
          <span className={`workpad-state user-state ${workpad.userStatus ?? "later"}`}>{workpad.userStatusLabel ?? userStatusLabel(workpad.userStatus)}</span>
          <h2>{workpad.title}</h2>
          <p>{parentAgentNarrative(workpad)}</p>
        </div>
        <WorkpadActionButton
          action={workpad.nextAction}
          approval={approval}
          busy={busy}
          sanitizeInternal
          onWorkflowAction={onWorkflowAction}
          onConfirmApproval={onConfirmApproval}
        />
      </section>

      {workpad.pendingFeedback?.length ? (
        <section className="parent-agent-section">
          <h3>已记录的补充</h3>
          {workpad.pendingFeedback.slice(-3).map((feedback) => (
            <p key={feedback.id}>{feedback.text} <span className="muted-inline">本轮完成后会用于下一次调整。</span></p>
          ))}
        </section>
      ) : null}

      {workpad.planningArtifactBundle ? <PlanningNarrativeCard bundle={workpad.planningArtifactBundle} /> : null}
      {workpad.rolePipeline ? <RoleToolResultRows pipeline={workpad.rolePipeline} /> : null}
      {workpad.resultReview ? <ResultReviewNarrative review={workpad.resultReview} /> : null}

      <section className="parent-agent-section">
        <h3>当前理解</h3>
        <p className="parent-agent-lead">{workpad.intake.goal}</p>
        <p>{workpad.intake.currentUnderstanding}</p>
        {workpad.intake.confirmedConstraints?.length ? (
          <div className="parent-chip-list">
            {workpad.intake.confirmedConstraints.slice(0, 4).map((constraint) => <span key={constraint}>{constraint}</span>)}
          </div>
        ) : null}
      </section>

      {workpad.intake.pendingClarifications?.length ? (
        <section className="parent-agent-section">
          <div className="parent-section-header">
            <h3>需要确认</h3>
            <span>{workpad.intake.pendingClarifications.length}</span>
          </div>
          <div className="clarification-list">
            {workpad.intake.pendingClarifications.map((clarification) => (
              <ClarificationCard
                key={clarification.id}
                clarification={clarification}
                busy={busy}
                onAnswer={props.onAnswerClarification}
              />
            ))}
          </div>
        </section>
      ) : null}

      {maintenanceNotice ? (
        <section className="parent-agent-section maintenance-nudge">
          <h3>后台维护</h3>
          <p>{userFacingText(maintenanceNotice.note)}</p>
        </section>
      ) : null}

      <details className="parent-details" open={detailsOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setDetailsOpen((open) => !open);
          }}
        >
          查看详情与证据
        </summary>
        {detailsOpen ? <WorkpadDiagnosticDetails {...props} /> : null}
      </details>
    </div>
  );
}

function PlanningNarrativeCard({ bundle }: { bundle: NonNullable<Workpad["planningArtifactBundle"]> }): ReactElement {
  const criteria = bundle.acceptanceCriteria.filter((item) => !/^\s*(AC-\d+|TBD)\s*$/i.test(item)).slice(0, 4);
  const tasks = bundle.tasks.filter((task) => task.title && !/^\s*TBD\s*$/i.test(task.title)).slice(0, 3);
  return (
    <section className="parent-agent-section" data-testid="planning-draft-card">
      <div className="parent-section-header">
        <h3>{bundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
        <span>{bundle.status === "confirmed" ? "准备执行" : "等待确认"}</span>
      </div>
      <p className="parent-agent-lead">我理解你要做的是：{parentSurfaceText(bundle.goal)}</p>
      {bundle.design ? <p>实现上，我会按现有代码结构处理：{userFacingText(stripInternalPlanningText(bundle.design))}</p> : null}
      {criteria.length > 0 ? (
        <div className="parent-chip-list">
          {criteria.map((item) => <span key={item}>{userFacingText(stripInternalPlanningText(item))}</span>)}
        </div>
      ) : null}
      {tasks.length > 0 ? (
        <div className="role-result-list">
          {tasks.map((task) => (
            <div className="role-result-row" key={task.id}>
              <strong>会处理</strong>
              <span>{userFacingText(stripInternalPlanningText(task.title))}</span>
            </div>
          ))}
        </div>
      ) : null}
      {bundle.openQuestions.length > 0 ? (
        <p className="parent-agent-note">还有 {bundle.openQuestions.length} 个点需要确认后再执行。</p>
      ) : null}
    </section>
  );
}

function RoleToolResultRows({ pipeline }: { pipeline: NonNullable<Workpad["rolePipeline"]> }): ReactElement {
  const rows = [
    ...pipeline.runs.map((run) => ({ id: `${run.roleId}:${run.runId ?? run.artifact ?? run.status}`, roleId: run.roleId, status: run.status, summary: run.summary, artifact: run.artifact })),
    ...pipeline.agentTasks.slice(-6).map((task) => ({ id: task.id, roleId: task.roleId, status: task.status, summary: task.resultSummary ?? task.summary, artifact: task.evidenceRefs[0] })),
  ];
  if (rows.length === 0) return <></>;
  return (
    <section className="parent-agent-section" data-testid="role-pipeline-summary">
      <div className="parent-section-header">
        <h3>执行过程</h3>
        <span>{humanStatus(pipeline.status)}</span>
      </div>
      <div className="role-result-list">
        {rows.map((row) => (
          <div className="role-result-row" key={row.id}>
            <strong>{roleLabel(row.roleId)}</strong>
            <span>{parentSurfaceText(row.summary)}</span>
            <small>{humanStatus(row.status)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultReviewNarrative({ review }: { review: NonNullable<Workpad["resultReview"]> }): ReactElement {
  return (
    <section className={`parent-agent-section result-review ${review.status}`} data-testid="result-review-card">
      <div className="parent-section-header">
        <h3>结果</h3>
        <span>{resultReviewStatusLabel(review.status)}</span>
      </div>
      <p className="parent-agent-lead">{userFacingText(review.title)}</p>
      <p>{userFacingText(review.summary)}</p>
      {review.changedFiles.length > 0 ? (
        <div className="parent-chip-list">
          {review.changedFiles.slice(0, 6).map((file) => <span key={file}>{file}</span>)}
        </div>
      ) : null}
      <div className="role-result-list">
        <div className="role-result-row"><strong>验证</strong><span>{review.validation ? humanStatus(review.validation.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>审查</strong><span>{review.audit ? humanStatus(review.audit.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>下一步</strong><span>{userFacingText(review.applyReadiness.message ?? review.applyReadiness.label)}</span></div>
      </div>
      {review.audit?.notes.length ? <p className="parent-agent-note">注意事项：{userFacingText(review.audit.notes[0])}</p> : null}
    </section>
  );
}

function parentAgentNarrative(workpad: Workpad): string {
  if (workpad.resultReview) return "我已经整理了本轮实现结果、验证与审查证据。你可以查看摘要后决定是否应用到项目，或继续要求修改。";
  if (workpad.rolePipeline) return "我正在把这次需求交给内部角色执行，并会把实现、验证和审查结果汇总回这个对话。";
  if (workpad.planningArtifactBundle) return workpad.planningArtifactBundle.status === "confirmed"
    ? "方案已经确认，接下来会进入实现、验证和审查。"
    : "我先把需求整理成可执行方案。你可以继续补充要求，或确认后开始执行。";
  if (workpad.intake.currentUnderstanding) return "我会基于当前需求对话继续分析目标、约束和下一步。";
  return "描述你的需求后，我会先整理方案，再进入实现和验证。";
}

function stripInternalPlanningText(value: string): string {
  return value
    .replace(/\bT-\d+\s*[:：]?\s*/g, "")
    .replace(/\bAC-\d+\s*[:：]?\s*/g, "")
    .replace(/\blatest-bundle\.md\b/gi, "")
    .replace(/\bplanning-agent\b/gi, "主 agent")
    .replace(/\bAgentTask\b/gi, "执行记录")
    .replace(/\bTaskRepository\b/gi, "后台任务")
    .replace(/\bTBD\b/gi, "待确认")
    .replace(/^\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parentSurfaceText(value: string): string {
  return userFacingText(stripInternalPlanningText(value));
}

function WorkpadDiagnosticDetails({
  workpad,
  approvals,
  busy,
  onWorkflowAction,
  onConfirmApproval,
  onAnswerClarification,
  onSelectDecisionContext,
}: {
  workpad: Workpad;
  approvals: Approval[];
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const approval = workpad.nextAction.approvalId ? approvals.find((item) => item.id === workpad.nextAction.approvalId) : undefined;
  const confirmedConstraints = workpad.intake.confirmedConstraints ?? [];
  const openQuestions = workpad.intake.openQuestions ?? [];
  const assumptions = workpad.intake.assumptions ?? [];
  const pendingClarifications = workpad.intake.pendingClarifications ?? [];
  return (
    <div className="workpad" data-testid="workpad-view">
      <section className="workpad-hero">
        <div>
          <span className={`workpad-state ${workpad.state}`}>{workpadStateLabel(workpad.state)}</span>
          <span className={`workpad-state user-state ${workpad.userStatus ?? "later"}`}>{workpad.userStatusLabel ?? userStatusLabel(workpad.userStatus)}</span>
          <h2>{workpad.title}</h2>
          <p>{workpad.subtitle}</p>
          {workpad.background && (workpad.background.runningCount + workpad.background.queuedCount + workpad.background.blockedCount + workpad.background.waitingDecisionCount) > 0 ? (
            <p className="workpad-background-summary" data-testid="workpad-background-summary">
              后台需求：{workpad.background.runningCount} 个处理中，{workpad.background.queuedCount} 个稍后处理，{workpad.background.blockedCount} 个需要修改或补证据，{workpad.background.waitingDecisionCount} 个等你确认
            </p>
          ) : null}
        </div>
        <WorkpadActionButton
          action={workpad.nextAction}
          approval={approval}
          busy={busy}
          onWorkflowAction={onWorkflowAction}
          onConfirmApproval={onConfirmApproval}
        />
      </section>

      {(workpad.pendingFeedback?.length || workpad.coderSelfTestSummary || workpad.postArchiveEvolutionCandidate) ? (
        <section className="workpad-section compact-section" data-testid="conversation-lifecycle">
          <div className="workpad-section-header">
            <h3>对话状态</h3>
            <span>{conversationLifecycleLabel(workpad.conversationLifecycle)}</span>
          </div>
          {workpad.pendingFeedback?.length ? (
            <div className="workpad-evidence-list">
              {workpad.pendingFeedback.map((feedback) => (
                <div className="workpad-evidence" key={feedback.id}>
                  <strong>已记录，将在下一轮生效</strong>
                  <span>{feedback.text}</span>
                </div>
              ))}
            </div>
          ) : null}
          {workpad.coderSelfTestSummary ? <p>{workpad.coderSelfTestSummary}</p> : null}
          {workpad.postArchiveEvolutionCandidate ? (
            <p>{workpad.postArchiveEvolutionCandidate.summary}</p>
          ) : null}
        </section>
      ) : null}

      {workpad.planningArtifactBundle ? (
        <section className="workpad-section" data-testid="planning-draft-card">
          <div className="workpad-section-header">
            <h3>{workpad.planningArtifactBundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
            <span>planning-agent</span>
          </div>
          <p className="workpad-goal">{workpad.planningArtifactBundle.goal}</p>
          <div className="workpad-chip-list">
            {workpad.planningArtifactBundle.acceptanceCriteria.slice(0, 5).map((item) => <span key={item}>{userFacingText(item)}</span>)}
          </div>
          <p>{workpad.planningArtifactBundle.design}</p>
          <div className="workpad-evidence-list">
            {workpad.planningArtifactBundle.tasks.map((task) => (
              <div className="workpad-evidence" key={task.id}>
                <strong>{task.id} {task.title}</strong>
                <span>{task.acIds.join(" · ")}</span>
              </div>
            ))}
          </div>
          {workpad.planningArtifactBundle.openQuestions.length > 0 ? (
            <ul className="workpad-issue-list">
              {workpad.planningArtifactBundle.openQuestions.map((item) => <li key={item}>{userFacingText(item)}</li>)}
            </ul>
          ) : null}
          {workpad.planningArtifactBundle.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.planningArtifactBundle.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.decompositionPlan ? (
        <section className="workpad-section" data-testid="decomposition-plan-card">
          <div className="workpad-section-header">
            <h3>拆分评估</h3>
            <span>{humanStatus(workpad.decompositionPlan.status)}</span>
          </div>
          <p className="workpad-goal">{decompositionRecommendationLabel(workpad.decompositionPlan.recommendation)}</p>
          <p>{userFacingText(workpad.decompositionPlan.rationale)}</p>
          <div className="workpad-chip-list">
            <span>{workpad.decompositionPlan.unitCount} 个候选单元</span>
            <span>{workpad.decompositionPlan.dependencyCount} 个依赖</span>
            <span>{workpad.decompositionPlan.openQuestionCount} 个待确认点</span>
          </div>
          <p>{userFacingText(workpad.decompositionPlan.riskSummary)}</p>
          {workpad.decompositionPlan.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.decompositionPlan.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.decompositionReadiness ? (
        <section className="workpad-section" data-testid="decomposition-readiness-card">
          <div className="workpad-section-header">
            <h3>执行边界</h3>
            <span>{humanStatus(workpad.decompositionReadiness.guardrailStatus)}</span>
          </div>
          <p className="workpad-goal">{decompositionReadinessLabel(workpad.decompositionReadiness.status)}</p>
          <div className="workpad-chip-list">
            <span>{workpad.decompositionReadiness.unitCount} 个单元</span>
            <span>{workpad.decompositionReadiness.schedulerEligible ? "可进入后续 proposal" : "不可直接调度"}</span>
            <span>{workflowActionLabel(workpad.decompositionReadiness.nextAllowedAction)}</span>
          </div>
          {workpad.decompositionReadiness.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.decompositionReadiness.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.taskQueueProposal ? (
        <section className="workpad-section" data-testid="taskqueue-proposal-card">
          <div className="workpad-section-header">
            <h3>TaskQueue 提案</h3>
            <span>{humanStatus(workpad.taskQueueProposal.status)}</span>
          </div>
          <p className="workpad-goal">{workpad.taskQueueProposal.queueMode === "sequential" ? "顺序执行候选" : workpad.taskQueueProposal.queueMode}</p>
          <div className="workpad-chip-list">
            <span>{workpad.taskQueueProposal.itemCount} 个任务</span>
            <span>{workpad.taskQueueProposal.dependencyCount} 个依赖</span>
            <span>{workpad.taskQueueProposal.conflictScopeCount} 个冲突范围</span>
          </div>
          {workpad.taskQueueProposal.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.taskQueueProposal.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.workflowGraphPlan ? (
        <section className="workpad-section" data-testid="workflow-graph-plan-card">
          <div className="workpad-section-header">
            <h3>执行图</h3>
            <span>{humanStatus(workpad.workflowGraphPlan.status)}</span>
          </div>
          <p className="workpad-goal">{workpad.workflowGraphPlan.graphMode === "sequential-v1" ? "顺序执行图 v1" : workpad.workflowGraphPlan.graphMode}</p>
          <div className="workpad-chip-list">
            <span>{workpad.workflowGraphPlan.nodeCount} 个节点</span>
            <span>{workpad.workflowGraphPlan.edgeCount} 条边</span>
            <span>{workpad.workflowGraphPlan.stageCount} 个阶段</span>
          </div>
          {workpad.workflowGraphPlan.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.workflowGraphPlan.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.rolePipeline ? (
        <section className="workpad-section" data-testid="role-pipeline-summary">
          <div className="workpad-section-header">
            <h3>角色流水线</h3>
            <span>{humanStatus(workpad.rolePipeline.status)}</span>
          </div>
          <div className="workpad-evidence-list">
            {workpad.rolePipeline.runs.map((run) => (
              <div className="workpad-evidence" key={`${run.roleId}:${run.runId ?? run.artifact ?? run.status}`}>
                <strong>{roleLabel(run.roleId)} · {humanStatus(run.status)}</strong>
                <span>{userFacingText(run.summary)}</span>
                {run.artifact ? <small className="artifact-link">查看证据：{artifactName(run.artifact)}</small> : null}
              </div>
            ))}
            {workpad.rolePipeline.agentTasks.slice(-6).map((task) => (
              <div className="workpad-evidence" key={task.id}>
                <strong>{roleLabel(task.roleId)} 任务 · {humanStatus(task.status)}</strong>
                <span>{userFacingText(task.resultSummary ?? task.summary)}</span>
                {task.evidenceRefs[0] ? <small className="artifact-link">查看证据：{artifactName(task.evidenceRefs[0])}</small> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {workpad.resultReview ? (
        <section className={`workpad-section result-review ${workpad.resultReview.status}`} data-testid="workpad-result-review-card">
          <div className="workpad-section-header">
            <h3>结果</h3>
            <span>{resultReviewStatusLabel(workpad.resultReview.status)}</span>
          </div>
          <p className="workpad-goal">{userFacingText(workpad.resultReview.title)}</p>
          <p>{userFacingText(workpad.resultReview.summary)}</p>
          {workpad.resultReview.changedFiles.length > 0 ? (
            <div className="workpad-chip-list" aria-label="Changed files">
              {workpad.resultReview.changedFiles.map((file) => <span key={file}>{file}</span>)}
            </div>
          ) : null}
          <div className="workpad-progress-grid">
            <WorkpadMetric label="验证" value={workpad.resultReview.validation ? humanStatus(workpad.resultReview.validation.status) : "未完成"} />
            <WorkpadMetric label="审查" value={workpad.resultReview.audit ? humanStatus(workpad.resultReview.audit.status) : "未完成"} />
            <WorkpadMetric label="应用状态" value={userFacingText(workpad.resultReview.applyReadiness.message ?? workpad.resultReview.applyReadiness.label)} />
          </div>
          {workpad.resultReview.audit?.notes.length ? (
            <ul className="workpad-issue-list">
              {workpad.resultReview.audit.notes.slice(0, 3).map((note) => <li key={note}>注意事项：{userFacingText(note)}</li>)}
            </ul>
          ) : null}
          {workpad.resultReview.applyReadiness.blockingIssues.length > 0 ? (
            <ul className="workpad-issue-list">
              {workpad.resultReview.applyReadiness.blockingIssues.slice(0, 3).map((issue) => <li key={issue}>{userFacingText(issue)}</li>)}
            </ul>
          ) : null}
          {workpad.resultReview.diffStat ? <pre className="result-diff-stat">{workpad.resultReview.diffStat}</pre> : null}
        </section>
      ) : null}

      {workpad.background?.items.length ? (
        <section className="workpad-section compact-section" data-testid="background-workpads">
          <div className="workpad-section-header">
            <h3>后台需求</h3>
            <span>{workpad.background.items.length}</span>
          </div>
          <div className="workpad-chip-list">
            {workpad.background.items.map((item) => (
              <span key={item.id}>{userFacingText(item.title)} · {item.userStatusLabel ?? workpadStatusLabel(item.runtimeStatus)}</span>
            ))}
          </div>
        </section>
      ) : null}

      {workpad.maintenance ? (
        <section className="workpad-section compact-section" data-testid="maintenance-summary">
          <div className="workpad-section-header">
            <h3>后台维护</h3>
            <span>{workpad.maintenance.closeoutCount ?? workpad.maintenance.ledgerCount}</span>
          </div>
          <p>{userFacingText(workpad.maintenance.note)}</p>
          <p className="panel-note">终态需求：{workpad.maintenance.closeoutCount ?? 0} · 待维护审查：{workpad.maintenance.unreviewedTerminalCount ?? 0}</p>
          {workpad.maintenance.latest ? (
            <div className="workpad-evidence">
              <strong>{userFacingText(workpad.maintenance.latest.eventType)}</strong>
              <span>{userFacingText(workpad.maintenance.latest.summary)}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>目标与当前理解</h3>
          <span>{sourceLabel(workpad.intake.source)}</span>
        </div>
        <p className="workpad-goal">{workpad.intake.goal}</p>
        <p>{workpad.intake.currentUnderstanding}</p>
        {confirmedConstraints.length > 0 ? (
          <div className="workpad-chip-list" aria-label="Confirmed constraints">
            {confirmedConstraints.map((constraint) => <span key={constraint}>{constraint}</span>)}
          </div>
        ) : null}
        {workpad.intake.relatedArtifacts.length > 0 ? (
          <div className="workpad-links">
            {workpad.intake.relatedArtifacts.map((artifact) => <span className="artifact-link" key={artifact}>查看证据：{artifactName(artifact)}</span>)}
          </div>
        ) : null}
      </section>

      {pendingClarifications.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>需要确认</h3>
            <span>{pendingClarifications.length}</span>
          </div>
          <div className="clarification-list">
            {pendingClarifications.map((clarification) => (
              <ClarificationCard
                key={clarification.id}
                clarification={clarification}
                busy={busy}
                onAnswer={onAnswerClarification}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="workpad-progress-grid" aria-label="需求进度">
        <WorkpadMetric label="需求说明" value={readinessLabel(workpad.progress.spec)} />
        <WorkpadMetric label="执行方案" value={readinessLabel(workpad.progress.plan)} />
        <WorkpadMetric label="任务" value={readinessLabel(workpad.progress.tasks)} />
        <WorkpadMetric label="验收 / 任务" value={`${workpad.progress.acCount} / ${workpad.progress.taskCount}`} />
        <WorkpadMetric label="执行" value={`${workpad.progress.runCount}${workpad.progress.latestRunStatus ? ` · ${humanStatus(workpad.progress.latestRunStatus)}` : ""}`} />
        <WorkpadMetric label="验证 / 审查" value={`${statusOrDash(workpad.progress.validationStatus)} / ${statusOrDash(workpad.progress.auditStatus)}`} />
      </section>

      {workpad.codingPackages.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>执行范围</h3>
            <span>{workpad.codingPackages.length} 个推荐执行单元</span>
          </div>
          <div className="coding-package-list">
            {workpad.codingPackages.map((item) => <CodingPackageCard key={item.id} item={item} />)}
          </div>
        </section>
      ) : null}

      {workpad.taskGraph.nodes.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>任务清单</h3>
            <span>{workpad.taskGraph.nodes.length} 个任务 · 来自已确认方案</span>
          </div>
          {workpad.taskQueue ? (
            <TaskQueuePanel
              queue={workpad.taskQueue}
              busy={busy}
              onWorkflowAction={onWorkflowAction}
              onSelectDecisionContext={onSelectDecisionContext}
              humanStatus={humanStatus}
              userFacingText={userFacingText}
            />
          ) : null}
          <div className="workpad-task-list">
            {workpad.taskGraph.nodes.map((task) => (
              <TaskGraphCard
                key={task.taskId}
                task={task}
                busy={busy}
                onWorkflowAction={onWorkflowAction}
                onSelectDecisionContext={onSelectDecisionContext}
              />
            ))}
          </div>
          {workpad.taskGraph.changeLevelEvidence.length > 0 ? (
            <div className="workpad-task-change-evidence">
              <strong>需求级证据</strong>
              {workpad.taskGraph.changeLevelEvidence.slice(0, 4).map((item) => (
                <span key={item.id}>{userFacingText(item.label)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>证据与决策</h3>
          <span>{workpad.evidence.length}</span>
        </div>
        {workpad.evidence.length === 0 ? <p className="panel-note">暂无执行、验证、审查或决策证据。</p> : null}
        <div className="workpad-evidence-list">
          {workpad.evidence.map((item) => (
            <div className="workpad-evidence" key={item.id}>
              <strong>{userFacingText(item.label)}</strong>
              <span>{sourceLabel(item.source)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
              {item.artifact ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
            </div>
          ))}
        </div>
      </section>

      {workpad.memoryIsolation ? (
        <section className="workpad-section" data-testid="memory-isolation">
          <div className="workpad-section-header">
            <h3>记忆边界</h3>
            <span>{workpad.memoryIsolation.currentChangeNamespace ?? "project"}</span>
          </div>
          <p>项目稳定记忆：{workpad.memoryIsolation.projectStableNamespace}</p>
          {workpad.memoryIsolation.runNamespaces.length > 0 ? <p>本需求运行证据：{workpad.memoryIsolation.runNamespaces.slice(0, 3).join("，")}</p> : null}
          {workpad.memoryIsolation.relatedWorkpads.length > 0 ? (
            <div className="workpad-links">
              {workpad.memoryIsolation.relatedWorkpads.map((item) => (
                <span className="artifact-link" key={item.changeId}>{userFacingText(item.title)} · {workpadStatusLabel(item.status)} · {item.factBoundary === "local-evidence-only" ? "局部证据" : "摘要可读"}</span>
              ))}
            </div>
          ) : null}
          <ul className="workpad-issue-list">
            {workpad.memoryIsolation.warnings.slice(0, 3).map((warning) => <li key={warning}>{userFacingText(warning)}</li>)}
          </ul>
        </section>
      ) : null}

      {(workpad.blockers.length > 0 || workpad.warnings.length > 0 || workpad.intake.missingInfo.length > 0 || openQuestions.length > 0 || assumptions.length > 0) ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>需要处理的问题</h3>
            <span>{workpad.blockers.length + workpad.warnings.length + workpad.intake.missingInfo.length + openQuestions.length + assumptions.length}</span>
          </div>
          <ul className="workpad-issue-list">
            {[...workpad.blockers, ...workpad.warnings, ...workpad.intake.missingInfo, ...openQuestions.map((item) => `待确认：${item}`), ...assumptions.map((item) => `假设：${item}`)].map((item, index) => <li key={`${item}:${index}`}>{userFacingText(item)}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CodingPackageCard({ item }: { item: WorkbenchCodingPackage }): ReactElement {
  const pendingText = item.taskIds.length > 0 ? item.taskIds.join(", ") : "无待执行任务";
  const completedText = item.completedTaskIds.length > 0 ? item.completedTaskIds.join(", ") : "无已完成任务上下文";
  return (
    <article className={`coding-package-card ${item.status}`} data-testid="coding-package-card">
      <div className="coding-package-header">
        <div>
          <strong>{item.title}</strong>
          <span>{item.summary}</span>
        </div>
        <span className={`task-status ${item.status}`}>{codingPackageStatusLabel(item.status)}</span>
      </div>
      <div className="coding-package-meta">
        <span>推荐角色：{item.recommendedRoleId}</span>
        <span>执行粒度：{codingPackageExecutionLabel(item.executionUnit)}</span>
        <span>分拆判断：{codingPackageSplitLabel(item.splitReadiness)}</span>
      </div>
      <div className="coding-package-grid">
        <div>
          <strong>待执行任务</strong>
          <p>{pendingText}</p>
        </div>
        <div>
          <strong>已完成上下文</strong>
          <p>{completedText}</p>
        </div>
      </div>
      <div className="coding-package-chips" aria-label="Coding package AC coverage">
        {item.acIds.map((acId) => (
          <span key={acId} className={item.missingEvidenceAcIds.includes(acId) ? "missing" : "covered"}>
            {acId}{item.missingEvidenceAcIds.includes(acId) ? " · 缺 evidence" : " · covered"}
          </span>
        ))}
      </div>
      <p className="panel-note">{item.splitRationale}</p>
      <p className="panel-note">{item.mergeRisk}</p>
      <p className="panel-note">5Y 只提供推荐执行单元；现有运行仍通过单任务或本地顺序执行入口触发，不提供执行单元级运行按钮。</p>
    </article>
  );
}

function TaskGraphCard({
  task,
  busy,
  onWorkflowAction,
  onSelectDecisionContext,
}: {
  task: WorkbenchTaskNode;
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const action = task.nextAction;
  const disabled = busy || !action.enabled || !action.actionType;
  const blockerContextId = task.status === "blocked" ? `task:${task.taskId}:blocked` : null;
  function runTask(): void {
    if (!action.actionType || disabled) return;
    void onWorkflowAction(action.actionType, { taskIds: action.taskIds ?? [task.taskId], taskRunId: action.taskRunId });
  }
  return (
    <article className={`workpad-task ${task.status}`} data-testid={`taskgraph-node-${task.taskId}`}>
      <div className="workpad-task-header">
        <div>
          <strong>{task.taskId}</strong>
          <span>{userFacingText(task.title)}</span>
        </div>
        <span className={`task-status ${task.status}`}>{taskStatusLabel(task.status)}</span>
      </div>
      <small>{task.checked ? "已勾选" : "未勾选"} · {task.acIds.join(", ") || "未映射 AC"}</small>
      {task.taskRun ? (
        <div className="task-run-summary">
          <span>执行尝试 #{task.taskRun.attempt}</span>
          <strong>{humanStatus(task.taskRun.status)}</strong>
          <small>{task.taskRun.id}</small>
          {task.workerLease ? <small>执行会话 {humanStatus(task.workerLease.status)} · {task.workerLease.workerId}</small> : null}
        </div>
      ) : null}
      {task.latestEvidence.length > 0 ? (
        <div className="task-evidence-list">
          {task.latestEvidence.map((item) => (
            <span key={item.id}>{userFacingText(item.label)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
          ))}
        </div>
      ) : <small className="panel-note">暂无任务级 evidence。</small>}
      {task.blockers.length > 0 ? (
        <ul className="task-blockers">
          {task.blockers.map((blocker) => <li key={blocker}>{userFacingText(blocker)}</li>)}
        </ul>
      ) : null}
      {blockerContextId ? (
        <button className="context-link" type="button" onClick={() => onSelectDecisionContext(blockerContextId)}>
          查看当前决策
        </button>
      ) : null}
      <button
        className="secondary-button"
        type="button"
        disabled={disabled}
        title={action.disabledReason}
        onClick={runTask}
      >
        {userFacingText(action.label)}
      </button>
    </article>
  );
}

function ClarificationCard({
  clarification,
  busy,
  onAnswer,
}: {
  clarification: ClarificationRequest;
  busy: boolean;
  onAnswer: (clarificationId: string, answer: string) => Promise<void>;
}): ReactElement {
  const [answer, setAnswer] = useState("");
  const firstQuestion = clarification.questions[0];
  const canSubmit = !busy && answer.trim().length > 0;
  async function submit(): Promise<void> {
    if (!canSubmit) return;
    await onAnswer(clarification.id, answer);
    setAnswer("");
  }
  return (
    <article className="clarification-card" data-testid="clarification-card">
      <div className="clarification-questions">
        {clarification.questions.map((question) => (
          <div key={question.id}>
            <strong>{question.header ?? "请确认"}</strong>
            <p>{question.question}</p>
            {question.options && question.options.length > 0 ? (
              <div className="clarification-options">
                {question.options.map((option) => (
                  <button
                    className="outline-button"
                    key={option.label}
                    type="button"
                    onClick={() => setAnswer(option.description ? `${option.label}：${option.description}` : option.label)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <label>
        <span>回答</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={firstQuestion?.allowFreeform === false ? "选择一个选项后提交" : "补充你的约束或答案"}
          rows={3}
        />
      </label>
      <button className="primary-button" type="button" disabled={!canSubmit} onClick={() => void submit()}>
        提交回答
      </button>
    </article>
  );
}

function WorkpadActionButton({
  action,
  approval,
  busy,
  sanitizeInternal = false,
  onWorkflowAction,
  onConfirmApproval,
}: {
  action: WorkpadNextAction;
  approval?: Approval;
  busy: boolean;
  sanitizeInternal?: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
}): ReactElement {
  const disabled = busy || !action.enabled || action.kind === "none" || action.kind === "read-only";
  const format = sanitizeInternal ? parentSurfaceText : userFacingText;
  function run(): void {
    if (action.kind === "approval" && action.approvalId) {
      onConfirmApproval(action.approvalId);
      return;
    }
    if (action.kind === "workflow-action" && action.actionType) void onWorkflowAction(action.actionType, workflowActionPayloadFromScope(action));
  }
  return (
    <div className="workpad-next-action">
      <span>下一步</span>
      <strong>{format(approval?.action?.label ?? action.label)}</strong>
      <p>{format(action.description)}</p>
      <button className="primary-button" disabled={disabled} title={action.disabledReason} onClick={run}>
        {action.enabled ? "执行" : "不可执行"}
      </button>
    </div>
  );
}

function WorkpadMetric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="workpad-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RunReplay({ stream, run }: { stream: StreamPacket | null; run?: RunSummary }): ReactElement {
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

function AssistantReadableEventCards({ events, defaultOpenProcess = false }: { events: AssistantReadableEvent[]; defaultOpenProcess?: boolean }): ReactElement {
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

function artifactName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

