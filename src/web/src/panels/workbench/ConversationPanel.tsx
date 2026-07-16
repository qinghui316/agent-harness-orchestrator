import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject } from "react";
import { AgentOrchestrationMap } from "./AgentOrchestrationMap.js";
import { calculateTranscriptVirtualRange } from "./TranscriptVirtualList.js";
import { ParentAgentTranscriptCellView } from "./TranscriptReadingSurface.js";
import {
  estimateTranscriptCellHeight,
} from "./transcriptMeasurement.js";
import type {
  AgentRelationGraph,
  AgentRelationGraphNode,
  ParentAgentTranscript,
  ParentAgentTranscriptCell,
  ProjectStatus,
  RunSummary,
  Snapshot,
  StreamPacket,
  TopicDetail,
} from "../../types.js";

const TRANSCRIPT_VIRTUALIZATION_THRESHOLD = 80;
export function MainConversationView({
  transcript,
  scrollContainerRef,
  onLoadEarlierTranscript,
  loadingEarlierTranscript,
  onOpenAgent,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
}): ReactElement {
  return (
    <div className="main-conversation-view" data-testid="main-conversation-view">
      <ParentAgentTranscriptView
        transcript={transcript}
        scrollContainerRef={scrollContainerRef}
        onLoadEarlierTranscript={onLoadEarlierTranscript}
        loadingEarlierTranscript={loadingEarlierTranscript}
        onOpenAgent={onOpenAgent}
      />
    </div>
  );
}

function ParentAgentTranscriptView({
  transcript,
  scrollContainerRef,
  onLoadEarlierTranscript,
  loadingEarlierTranscript,
  onOpenAgent,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
}): ReactElement {
  const cells = transcript.cells?.length ? transcript.cells.filter((cell) => cell.kind !== "detail-only") : [];
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [measuredCellHeights, setMeasuredCellHeights] = useState<Record<string, number>>({});
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, viewportHeight: 720, listWidth: 760 });
  const loadingEarlierRef = useRef(false);
  const heights = useMemo(() => cells.map((cell, index) => (measuredCellHeights[cell.id] ?? (estimateTranscriptCellHeight(cell, {
    expanded: expandedCells.has(cell.id),
    width: scrollMetrics.listWidth,
  }))) + (index === 0 ? 0 : sameProviderTurn(cells[index - 1], cell) ? 8 : 20)), [cells, expandedCells, measuredCellHeights, scrollMetrics.listWidth]);
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
    const currentIds = new Set(cells.map((cell) => cell.id));
    setMeasuredCellHeights((current) => {
      const entries = Object.entries(current).filter(([id]) => currentIds.has(id));
      if (entries.length === Object.keys(current).length) return current;
      return Object.fromEntries(entries);
    });
    setExpandedCells((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [cells]);

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
  }, [scrollContainerRef, visibleCellIds]);

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
      <div className="parent-agent-message-list" data-testid="transcript-virtual-list">
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
              />
            </div>
          );
        })}
        {virtualRange.bottomSpacer > 0 ? <div className="transcript-virtual-spacer" style={{ height: virtualRange.bottomSpacer }} /> : null}
      </div>
    </div>
  );
}

export function AgentRelationGraphPanel({
  graph,
  selectedNode,
  onSelectNode,
}: {
  graph: AgentRelationGraph;
  selectedNode: AgentRelationGraphNode | null;
  activeRun?: RunSummary;
  stream: StreamPacket | null;
  onSelectNode: (nodeId: string) => void;
  onSelectRun: (runId: string) => void;
}): ReactElement {
  void selectedNode;
  return (
    <div className="agent-graph-panel" data-testid="agent-relation-graph-panel">
      <header className="agent-graph-header">
        <h2>Agent 编排图</h2>
      </header>
      <div className="agent-graph-body">
        <AgentOrchestrationMap graph={graph} selectedNodeId={selectedNode?.id ?? null} onSelectNode={onSelectNode} />
      </div>
    </div>
  );
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
