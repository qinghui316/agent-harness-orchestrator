import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject } from "react";
import { AgentOrchestrationMap } from "./AgentOrchestrationMap.js";
import { calculateTranscriptVirtualRange } from "./TranscriptVirtualList.js";
import { ClarificationCard } from "./workpad/TaskGraphCards.js";
import { ParentAgentTranscriptCellView } from "./TranscriptReadingSurface.js";
import { ConversationPendingActionStack } from "./ConversationPendingActionStack.js";
import {
  estimateTranscriptCellHeight,
} from "./transcriptMeasurement.js";
import type {
  DemandAgentRunGraph,
  DemandAgentRunGraphNode,
  LiveAssistantTurn,
  ParentAgentTranscript,
  ParentAgentTranscriptCell,
  PlanHandoffCandidate,
  PlanHandoffIntentKind,
  ProjectStatus,
  RunSummary,
  Snapshot,
  StreamPacket,
  TopicDetail,
  Workpad,
} from "../../types.js";

const TRANSCRIPT_VIRTUALIZATION_THRESHOLD = 80;
export function MainConversationView({
  workpad,
  transcript,
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
  onOpenAgent,
  planHandoffCandidate,
  onPlanHandoff,
  onCancelPlanHandoff,
}: {
  workpad: Workpad;
  transcript: ParentAgentTranscript;
  liveTurns: LiveAssistantTurn[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  busy: boolean;
  approvals: Snapshot["right"]["approvals"];
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onAnswerCodexUserInput: (request: import("../../types.js").CodexUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
  onOpenAgent: (agentSurfaceId: string) => void;
  planHandoffCandidate: PlanHandoffCandidate | null;
  onPlanHandoff: (candidate: PlanHandoffCandidate, kind: PlanHandoffIntentKind, feedback?: string) => Promise<void>;
  onCancelPlanHandoff: (candidate: PlanHandoffCandidate) => Promise<void>;
}): ReactElement {
  return (
    <div className="main-conversation-view" data-testid="main-conversation-view">
      <ParentAgentTranscriptView
        workpad={workpad}
        transcript={transcript}
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
        onOpenAgent={onOpenAgent}
        planHandoffCandidate={planHandoffCandidate}
        onPlanHandoff={onPlanHandoff}
        onCancelPlanHandoff={onCancelPlanHandoff}
      />
    </div>
  );
}

function ParentAgentTranscriptView({
  workpad,
  transcript,
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
  onOpenAgent,
  planHandoffCandidate,
  onPlanHandoff,
  onCancelPlanHandoff,
}: {
  workpad: Workpad;
  transcript: ParentAgentTranscript;
  liveTurns: LiveAssistantTurn[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  busy: boolean;
  approvals: Snapshot["right"]["approvals"];
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onAnswerCodexUserInput: (request: import("../../types.js").CodexUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
  onOpenAgent: (agentSurfaceId: string) => void;
  planHandoffCandidate: PlanHandoffCandidate | null;
  onPlanHandoff: (candidate: PlanHandoffCandidate, kind: PlanHandoffIntentKind, feedback?: string) => Promise<void>;
  onCancelPlanHandoff: (candidate: PlanHandoffCandidate) => Promise<void>;
}): ReactElement {
  void liveTurns;
  void busy;
  void approvals;
  void onAction;
  void onConfirmApproval;
  void onSelectDecisionContext;
  const cells = transcript.cells?.length ? transcript.cells.filter((cell) => cell.kind !== "detail-only") : [];
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [expandedPlanArtifact, setExpandedPlanArtifact] = useState<string | null>(null);
  const [measuredCellHeights, setMeasuredCellHeights] = useState<Record<string, number>>({});
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, viewportHeight: 720, listWidth: 760 });
  const loadingEarlierRef = useRef(false);
  const heights = useMemo(() => cells.map((cell, index) => (measuredCellHeights[cell.id] ?? (estimateTranscriptCellHeight(cell, {
    expanded: expandedCells.has(cell.id),
    width: scrollMetrics.listWidth,
  }) + (cellHasPlanCandidate(cell, planHandoffCandidate) ? 180 + (expandedPlanArtifact === planHandoffCandidate?.sourceArtifact ? 170 : 0) : 0)))
    + (index === 0 ? 0 : sameProviderTurn(cells[index - 1], cell) ? 8 : 20)), [cells, expandedCells, expandedPlanArtifact, measuredCellHeights, planHandoffCandidate, scrollMetrics.listWidth]);
  const virtualRange = useMemo(() => cells.length <= TRANSCRIPT_VIRTUALIZATION_THRESHOLD
    ? {
        start: 0,
        end: cells.length,
        topSpacer: 0,
        bottomSpacer: 0,
        totalHeight: heights.reduce((total, height) => total + height, 0),
      }
    : calculateTranscriptVirtualRange({
        heights,
        scrollTop: scrollMetrics.scrollTop,
        viewportHeight: scrollMetrics.viewportHeight,
        overscan: 10,
      }), [cells.length, heights, scrollMetrics.scrollTop, scrollMetrics.viewportHeight]);
  const visibleCells = cells.slice(virtualRange.start, virtualRange.end);
  const visibleCellIds = visibleCells.map((cell) => cell.id).join("|");

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setMeasuredCellHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.transcriptCellId;
          const height = Math.ceil(entry.contentRect.height);
          if (id && height > 0 && next[id] !== height) {
            next[id] = height;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });
    root.querySelectorAll<HTMLElement>("[data-transcript-cell-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [expandedPlanArtifact, scrollContainerRef, visibleCellIds]);

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
      <div className="parent-agent-message-list" data-testid="transcript-virtual-list" style={{ minHeight: virtualRange.totalHeight || undefined }}>
        {transcript.paging?.hasMoreBefore ? (
          <div className="transcript-load-earlier" data-testid="transcript-load-earlier">
            {loadingEarlierTranscript ? "正在加载更早消息..." : "向上滚动加载更早消息"}
          </div>
        ) : null}
        {cells.length === 0 ? <div className="empty-state">{transcript.emptyMessage ?? "暂无对话内容。"}</div> : null}
        {virtualRange.topSpacer > 0 ? <div className="transcript-virtual-spacer" style={{ height: virtualRange.topSpacer }} /> : null}
        {visibleCells.map((cell, visibleIndex) => {
          const cellIndex = virtualRange.start + visibleIndex;
          const previous = cellIndex > 0 ? cells[cellIndex - 1] : undefined;
          return (
            <div key={cell.id} data-transcript-cell-id={cell.id} className={sameProviderTurn(previous, cell) ? "transcript-same-turn" : "transcript-turn-boundary"}>
              <ParentAgentTranscriptCellView
                cell={cell}
                expanded={expandedCells.has(cell.id)}
                onToggleExpanded={() => {
                  setMeasuredCellHeights((current) => {
                    if (!(cell.id in current)) return current;
                    const next = { ...current };
                    delete next[cell.id];
                    return next;
                  });
                  setExpandedCells((current) => {
                    const next = new Set(current);
                    if (next.has(cell.id)) next.delete(cell.id);
                    else next.add(cell.id);
                    return next;
                  });
                }}
                onOpenAgent={onOpenAgent}
                busy={busy}
                onAnswerCodexUserInput={onAnswerCodexUserInput}
              />
              {cellHasPlanCandidate(cell, planHandoffCandidate) ? (
                <ConversationPendingActionStack
                  planHandoffCandidate={planHandoffCandidate}
                  busy={busy}
                  onPlanHandoff={onPlanHandoff}
                  onCancelPlanHandoff={onCancelPlanHandoff}
                  expanded={expandedPlanArtifact === planHandoffCandidate?.sourceArtifact}
                  onExpandedChange={(expanded) => {
                    setMeasuredCellHeights((current) => {
                      if (!(cell.id in current)) return current;
                      const next = { ...current };
                      delete next[cell.id];
                      return next;
                    });
                    setExpandedPlanArtifact(expanded ? planHandoffCandidate?.sourceArtifact ?? null : null);
                  }}
                />
              ) : null}
            </div>
          );
        })}
        {virtualRange.bottomSpacer > 0 ? <div className="transcript-virtual-spacer" style={{ height: virtualRange.bottomSpacer }} /> : null}
      </div>
    </div>
  );
}

export function AgentRunGraphPanel({
  graph,
  selectedNode,
  onSelectNode,
}: {
  graph: DemandAgentRunGraph;
  selectedNode: DemandAgentRunGraphNode | null;
  activeRun?: RunSummary;
  stream: StreamPacket | null;
  onSelectNode: (nodeId: string) => void;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  void selectedNode;
  return (
    <div className="agent-graph-panel" data-testid="agent-run-graph-panel">
      <header className="agent-graph-header">
        <h2>Agent 编排图</h2>
      </header>
      <div className="agent-graph-body">
        <AgentOrchestrationMap graph={graph} selectedNodeId={selectedNode?.id ?? null} onSelectNode={onSelectNode} />
      </div>
    </div>
  );
}

function cellHasPlanCandidate(cell: ParentAgentTranscriptCell, candidate: PlanHandoffCandidate | null): boolean {
  return Boolean(candidate && cell.evidenceRefs?.some((ref) => ref.ref === candidate.sourceArtifact));
}

function sameProviderTurn(previous: ParentAgentTranscriptCell | undefined, current: ParentAgentTranscriptCell): boolean {
  return Boolean(previous?.threadId && previous.turnId && current.threadId && current.turnId
    && previous.threadId === current.threadId
    && previous.turnId === current.turnId);
}

export function BottomStatusBar({ snapshot, project, topic }: { snapshot: Snapshot; project: ProjectStatus | null; topic: TopicDetail | null }): ReactElement {
  const repoPath = snapshot.left.repo?.path ?? project?.path ?? "-";
  const issueCount = snapshot.warnings.length + (topic?.closeGate?.blockingIssues.length ?? 0);
  const isConversation = topic?.kind === "conversation";
  return (
    <footer className="bottom-status">
      <span>项目数据：{(snapshot.memory.harnessReady ?? project?.memory?.harnessReady) ? "已准备" : project?.project ? "首次对话建立说明" : "未选择"}</span>
      <span>根目录：{repoPath}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />状态：{snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>{isConversation ? "当前对话" : "当前需求"}：{topic?.title ?? "无"}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />工作区{snapshot.memory.harnessReady ? "已准备" : "首次对话建立说明"}</span>
      <span>{issueCount} 个问题</span>
    </footer>
  );
}
