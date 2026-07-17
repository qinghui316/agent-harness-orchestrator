import { useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { AgentOrchestrationMap } from "./AgentOrchestrationMap.js";
import { TranscriptCellVirtualList } from "./TranscriptCellVirtualList.js";
import { ParentAgentTranscriptCellView } from "./TranscriptReadingSurface.js";
import type {
  AgentRelationGraph,
  AgentRelationGraphNode,
  ParentAgentTranscript,
  ProjectStatus,
  RunSummary,
  Snapshot,
  StreamPacket,
  TopicDetail,
} from "../../types.js";

export function MainConversationView({
  transcript,
  scrollContainerRef,
  onLoadEarlierTranscript,
  loadingEarlierTranscript,
  onOpenAgent,
  onOpenDocument,
  projectId,
  conversationId,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
  onOpenDocument: (document: import("../../types.js").CanonicalDocumentReference) => void;
  projectId: string | null;
  conversationId: string | null;
}): ReactElement {
  return (
    <div className="main-conversation-view" data-testid="main-conversation-view">
      <ParentAgentTranscriptView
        transcript={transcript}
        scrollContainerRef={scrollContainerRef}
        onLoadEarlierTranscript={onLoadEarlierTranscript}
        loadingEarlierTranscript={loadingEarlierTranscript}
        onOpenAgent={onOpenAgent}
        onOpenDocument={onOpenDocument}
        projectId={projectId}
        conversationId={conversationId}
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
  onOpenDocument,
  projectId,
  conversationId,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLoadEarlierTranscript: () => Promise<void>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
  onOpenDocument: (document: import("../../types.js").CanonicalDocumentReference) => void;
  projectId: string | null;
  conversationId: string | null;
}): ReactElement {
  const cells = transcript.cells?.length ? transcript.cells.filter((cell) => cell.kind !== "detail-only") : [];
  const loadingEarlierRef = useRef(false);
  const [scrollTop] = useStateFromScrollContainer(scrollContainerRef);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node || loadingEarlierTranscript || loadingEarlierRef.current) return;
    if (!transcript.paging?.hasMoreBefore) return;
    if (scrollTop > 260) return;
    loadingEarlierRef.current = true;
    const previousScrollHeight = node.scrollHeight;
    void onLoadEarlierTranscript().finally(() => {
      requestAnimationFrame(() => {
        const current = scrollContainerRef.current;
        if (current) current.scrollTop += Math.max(0, current.scrollHeight - previousScrollHeight);
        loadingEarlierRef.current = false;
      });
    });
  }, [loadingEarlierTranscript, onLoadEarlierTranscript, scrollContainerRef, scrollTop, transcript.paging?.hasMoreBefore]);

  return (
    <div className="parent-agent-transcript" data-testid="parent-agent-transcript">
      {transcript.paging?.hasMoreBefore ? (
        <div className="transcript-load-earlier" data-testid="transcript-load-earlier">
          {loadingEarlierTranscript ? "正在加载更早消息..." : "向上滚动加载更早消息"}
        </div>
      ) : null}
      <TranscriptCellVirtualList
        cells={cells}
        scrollContainerRef={scrollContainerRef}
        className="parent-agent-message-list"
        testId="transcript-virtual-list"
        emptyMessage={transcript.emptyMessage ?? "暂无对话内容。"}
        groupedByTurn
        renderCell={(cell, expanded, onToggleExpanded) => (
          <ParentAgentTranscriptCellView
            cell={cell}
            expanded={expanded}
            onToggleExpanded={onToggleExpanded}
            onOpenAgent={onOpenAgent}
            onOpenDocument={onOpenDocument}
            projectId={projectId}
            conversationId={conversationId}
          />
        )}
      />
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

function useStateFromScrollContainer(scrollContainerRef: RefObject<HTMLDivElement | null>): [number] {
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    const update = () => setScrollTop(node.scrollTop);
    update();
    node.addEventListener("scroll", update);
    return () => node.removeEventListener("scroll", update);
  }, [scrollContainerRef]);
  return [scrollTop];
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
