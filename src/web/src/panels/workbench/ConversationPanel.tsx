import type { ReactElement, RefObject } from "react";
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
  loadingEarlierTranscript,
  onOpenAgent,
  onOpenDocument,
  documentResources,
  onEnsureDocument,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
  onOpenDocument: (document: import("../../types.js").CanonicalDocumentReference) => void;
  documentResources: Record<string, import("../../types.js").TextDocumentResource>;
  onEnsureDocument: (document: import("../../types.js").CanonicalDocumentReference) => void;
}): ReactElement {
  return (
    <div className="main-conversation-view" data-testid="main-conversation-view">
      <ParentAgentTranscriptView
        transcript={transcript}
        scrollContainerRef={scrollContainerRef}
        loadingEarlierTranscript={loadingEarlierTranscript}
        onOpenAgent={onOpenAgent}
        onOpenDocument={onOpenDocument}
        documentResources={documentResources}
        onEnsureDocument={onEnsureDocument}
      />
    </div>
  );
}

function ParentAgentTranscriptView({
  transcript,
  scrollContainerRef,
  loadingEarlierTranscript,
  onOpenAgent,
  onOpenDocument,
  documentResources,
  onEnsureDocument,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
  onOpenDocument: (document: import("../../types.js").CanonicalDocumentReference) => void;
  documentResources: Record<string, import("../../types.js").TextDocumentResource>;
  onEnsureDocument: (document: import("../../types.js").CanonicalDocumentReference) => void;
}): ReactElement {
  const cells = transcript.cells?.length ? transcript.cells.filter((cell) => cell.kind !== "detail-only") : [];

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
            documentResources={documentResources}
            onEnsureDocument={onEnsureDocument}
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
