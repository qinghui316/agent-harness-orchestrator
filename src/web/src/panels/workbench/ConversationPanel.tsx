import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject } from "react";
import { RunReplay, artifactName } from "./RunReplayPanel.js";
import { AgentOrchestrationMap } from "./AgentOrchestrationMap.js";
import { calculateTranscriptVirtualRange } from "./TranscriptVirtualList.js";
import {
  agentRunStatusLabel,
} from "../../formatters.js";
import { ControlledSchedulerStepReceiptCard, ControlledSchedulerStepTraceCard, GoalLoopPrimarySummary } from "./workpad/GoalLoopCards.js";
import { ClarificationCard, CodexUserInputRequestCard } from "./workpad/TaskGraphCards.js";
import { ParentAgentTranscriptCellView } from "./TranscriptReadingSurface.js";
import {
  estimateTranscriptCellHeight,
} from "./transcriptMeasurement.js";
import type {
  DemandAgentRunGraph,
  DemandAgentRunGraphNode,
  LiveAssistantTurn,
  ParentAgentTranscript,
  ProjectStatus,
  RunSummary,
  Snapshot,
  StreamPacket,
  TopicDetail,
  Workpad,
  CodexUserInputRequest,
} from "../../types.js";
export function MainConversationView({
  workpad,
  transcript,
  codexUserInputRequests,
  liveTurns,
  scrollContainerRef,
  onLoadEarlierTranscript,
  loadingEarlierTranscript,
  busy,
  approvals,
  onAction,
  onConfirmApproval,
  onAnswerClarification,
  onAnswerCodexUserInput,
  onSelectDecisionContext,
}: {
  workpad: Workpad;
  transcript: ParentAgentTranscript;
  codexUserInputRequests: CodexUserInputRequest[];
  liveTurns: LiveAssistantTurn[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  busy: boolean;
  approvals: Snapshot["right"]["approvals"];
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onAnswerCodexUserInput: (request: CodexUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  return (
    <div className="main-conversation-view" data-testid="main-conversation-view">
      <ParentAgentTranscriptView
        workpad={workpad}
        transcript={transcript}
        codexUserInputRequests={codexUserInputRequests}
        liveTurns={liveTurns}
        scrollContainerRef={scrollContainerRef}
        onLoadEarlierTranscript={onLoadEarlierTranscript}
        loadingEarlierTranscript={loadingEarlierTranscript}
        busy={busy}
        approvals={approvals}
        onAction={onAction}
        onConfirmApproval={onConfirmApproval}
        onAnswerClarification={onAnswerClarification}
        onAnswerCodexUserInput={onAnswerCodexUserInput}
        onSelectDecisionContext={onSelectDecisionContext}
      />
    </div>
  );
}

function ParentAgentTranscriptView({
  workpad,
  transcript,
  codexUserInputRequests,
  liveTurns,
  scrollContainerRef,
  onLoadEarlierTranscript,
  loadingEarlierTranscript,
  busy,
  approvals,
  onAction,
  onConfirmApproval,
  onAnswerClarification,
  onAnswerCodexUserInput,
  onSelectDecisionContext,
}: {
  workpad: Workpad;
  transcript: ParentAgentTranscript;
  codexUserInputRequests: CodexUserInputRequest[];
  liveTurns: LiveAssistantTurn[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  busy: boolean;
  approvals: Snapshot["right"]["approvals"];
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onAnswerCodexUserInput: (request: CodexUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  void liveTurns;
  void busy;
  void approvals;
  void onAction;
  void onConfirmApproval;
  void onSelectDecisionContext;
  const cells = transcript.cells?.length ? transcript.cells.filter((cell) => cell.kind !== "detail-only") : [];
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, viewportHeight: 720, listWidth: 760 });
  const loadingEarlierRef = useRef(false);
  const heights = useMemo(() => cells.map((cell) => estimateTranscriptCellHeight(cell, {
    expanded: expandedCells.has(cell.id),
    width: scrollMetrics.listWidth,
  })), [cells, expandedCells, scrollMetrics.listWidth]);
  const virtualRange = useMemo(() => calculateTranscriptVirtualRange({
    heights,
    scrollTop: scrollMetrics.scrollTop,
    viewportHeight: scrollMetrics.viewportHeight,
    overscan: 10,
  }), [heights, scrollMetrics.scrollTop, scrollMetrics.viewportHeight]);
  const visibleCells = cells.slice(virtualRange.start, virtualRange.end);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    function updateMetrics(): void {
      if (!node) return;
      setScrollMetrics({
        scrollTop: node.scrollTop,
        viewportHeight: node.clientHeight || 720,
        listWidth: Math.max(320, node.clientWidth - 80),
      });
    }
    updateMetrics();
    node.addEventListener("scroll", updateMetrics);
    window.addEventListener("resize", updateMetrics);
    return () => {
      node.removeEventListener("scroll", updateMetrics);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node || loadingEarlierTranscript || loadingEarlierRef.current) return;
    if (!transcript.paging?.hasMoreBefore) return;
    if (scrollMetrics.scrollTop > 260) return;
    loadingEarlierRef.current = true;
    const previousScrollHeight = node.scrollHeight;
    void onLoadEarlierTranscript().finally(() => {
      requestAnimationFrame(() => {
        const current = scrollContainerRef.current;
        if (current) current.scrollTop += Math.max(0, current.scrollHeight - previousScrollHeight);
        loadingEarlierRef.current = false;
      });
    });
  }, [loadingEarlierTranscript, onLoadEarlierTranscript, scrollContainerRef, scrollMetrics.scrollTop, transcript.paging?.hasMoreBefore]);

  return (
    <div className="parent-agent-transcript" data-testid="parent-agent-transcript">
      {workpad.controlledSchedulerStepReceipt ? <ControlledSchedulerStepReceiptCard receipt={workpad.controlledSchedulerStepReceipt} /> : null}
      {workpad.controlledSchedulerStepTrace ? <ControlledSchedulerStepTraceCard trace={workpad.controlledSchedulerStepTrace} /> : null}
      {workpad.goalLoop ? (
        <GoalLoopPrimarySummary
          goalLoop={workpad.goalLoop}
          controlledSchedulerReconfirmation={workpad.controlledSchedulerReconfirmation}
        />
      ) : null}
      {workpad.intake.pendingClarifications?.length ? (
        <section className="conversation-clarification-strip" data-testid="conversation-clarification-strip" aria-label="需要确认">
          <div className="conversation-clarification-header">
            <span>需要确认</span>
            <strong>{workpad.intake.pendingClarifications.length}</strong>
          </div>
          <div className="clarification-list">
            {workpad.intake.pendingClarifications.map((clarification) => (
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
      {codexUserInputRequests.length ? (
        <section className="conversation-clarification-strip" data-testid="codex-user-input-strip" aria-label="Codex 需要确认">
          <div className="conversation-clarification-header">
            <span>Codex 需要确认</span>
            <strong>{codexUserInputRequests.length}</strong>
          </div>
          <div className="clarification-list">
            {codexUserInputRequests.map((request) => (
              <CodexUserInputRequestCard
                key={request.requestId}
                request={request}
                busy={busy}
                onAnswer={onAnswerCodexUserInput}
              />
            ))}
          </div>
        </section>
      ) : null}
      <div className="parent-agent-message-list" data-testid="transcript-virtual-list" style={{ minHeight: virtualRange.totalHeight || undefined }}>
        {transcript.paging?.hasMoreBefore ? (
          <div className="transcript-load-earlier" data-testid="transcript-load-earlier">
            {loadingEarlierTranscript ? "正在加载更早消息..." : "向上滚动加载更早消息"}
          </div>
        ) : null}
        {cells.length === 0 ? <div className="empty-state">{transcript.emptyMessage ?? "暂无对话内容。"}</div> : null}
        {virtualRange.topSpacer > 0 ? <div className="transcript-virtual-spacer" style={{ height: virtualRange.topSpacer }} /> : null}
        {visibleCells.map((cell) => (
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
          />
        ))}
        {virtualRange.bottomSpacer > 0 ? <div className="transcript-virtual-spacer" style={{ height: virtualRange.bottomSpacer }} /> : null}
      </div>
    </div>
  );
}

export function AgentRunGraphPanel({
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
          <p className="eyebrow">Agent 编排图</p>
          <h2>{graph.title}</h2>
          <p>{graph.summary}</p>
        </div>
      </header>
      <div className="agent-graph-body">
        <AgentOrchestrationMap graph={graph} selectedNodeId={selectedNode?.id ?? null} onSelectNode={onSelectNode} />
        <AgentRunNodeDetail node={selectedNode} activeRun={activeRun} stream={stream} onSelectRun={onSelectRun} />
      </div>
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
  const isConversation = topic?.kind === "conversation";
  return (
    <footer className="bottom-status">
      <span>项目数据：{(snapshot.memory.harnessReady ?? project?.memory?.harnessReady) ? "已准备" : project?.project ? "需要准备" : "未选择"}</span>
      <span>根目录：{repoPath}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />状态：{snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>{isConversation ? "当前对话" : "当前需求"}：{topic?.title ?? "无"}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />工作区{snapshot.memory.harnessReady ? "已准备" : "需要准备"}</span>
      <span>{issueCount} 个问题</span>
    </footer>
  );
}
