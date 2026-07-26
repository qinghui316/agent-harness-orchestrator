import { ArrowRight, ChevronDown, UsersRound, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from "react";
import { PixiOfficeRenderer } from "../../office/PixiOfficeRenderer.js";
import { TranscriptCellVirtualList } from "./TranscriptCellVirtualList.js";
import { ParentAgentTranscriptCellView } from "./TranscriptReadingSurface.js";
import type {
  AgentSurfaceProjection,
  AgentSurfaceProjectionItem,
  AgentSurfaceStatus,
  ParentAgentTranscript,
  ProjectStatus,
  Snapshot,
  TopicDetail,
} from "../../types.js";
import { createOfficeScene } from "../../office/officeScene.js";
import { HarnessOfficeAdapter } from "../../office/harnessOfficeAdapter.js";
import { officeAvatarIdForRole } from "../../office/officePresentationRegistry.js";
import { OfficeLoadingScreen } from "../../office/OfficeLoadingScreen.js";

export function MainConversationView({
  transcript,
  scrollContainerRef,
  loadingEarlierTranscript,
  onOpenAgent,
  canOpenAgent,
  onOpenDocument,
  documentResources,
  onEnsureDocument,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
  canOpenAgent: (agentSurfaceId: string) => boolean;
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
        canOpenAgent={canOpenAgent}
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
  canOpenAgent,
  onOpenDocument,
  documentResources,
  onEnsureDocument,
}: {
  transcript: ParentAgentTranscript;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  loadingEarlierTranscript: boolean;
  onOpenAgent: (agentSurfaceId: string) => void;
  canOpenAgent: (agentSurfaceId: string) => boolean;
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
            canOpenAgent={canOpenAgent}
            onOpenDocument={onOpenDocument}
            documentResources={documentResources}
            onEnsureDocument={onEnsureDocument}
          />
        )}
      />
    </div>
  );
}

export function AgentOfficePanel({
  projectId,
  projection,
  onOpenSurface,
}: {
  projectId: string;
  projection: AgentSurfaceProjection;
  onOpenSurface: (agentSurfaceId: string) => Promise<"opened" | "stale" | "error">;
}): ReactElement {
  const adapter = useMemo(() => new HarnessOfficeAdapter(projectId), [projectId]);
  const previousProjectionRef = useRef<{ adapter: HarnessOfficeAdapter; projection: AgentSurfaceProjection } | null>(null);
  const [scene, setScene] = useState<ReturnType<typeof createOfficeScene> | null>(null);
  useLayoutEffect(() => {
    const previous = previousProjectionRef.current;
    const result = previous?.adapter === adapter
      ? adapter.reconcile(previous.projection, projection)
      : { snapshot: adapter.hydrate(projection), events: [] };
    previousProjectionRef.current = { adapter, projection };
    setScene(createOfficeScene(result.snapshot, result.events));
  }, [adapter, projection]);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const selectedAgent = projection.surfaces.find((surface) => surface.agentSurfaceId === selectedActorId) ?? null;
  const menuAgents = currentOfficeAgents(projection);
  const [cardAnchor, setCardAnchor] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const cardScopeRef = useRef(projection.graphScopeId);
  const selectActor = (actorId: string, anchor: { x: number; y: number }) => {
    const surface = projection.surfaces.find((candidate) => candidate.agentSurfaceId === actorId);
    if (surface) {
      setCardAnchor(anchor);
      setSelectedActorId(surface.agentSurfaceId);
    }
  };
  const dismissCard = () => {
    setCardAnchor(null);
    setSelectedActorId(null);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismissCard(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });
  useEffect(() => {
    if (cardScopeRef.current === projection.graphScopeId) return;
    cardScopeRef.current = projection.graphScopeId;
    setCardAnchor(null);
    setSelectedActorId(null);
    setMenuOpen(false);
  }, [projection.graphScopeId]);
  return (
    <div className="agent-office-panel" data-testid="agent-office-panel">
      <div className="agent-office-body">
        {scene ? (
          <PixiOfficeRenderer scene={scene} selectedActorId={selectedActorId} onSelectActor={selectActor} onViewportInteraction={dismissCard} />
        ) : <OfficeLoadingScreen progress={40} />}
        <div className="office-active-agent-menu" data-office-control>
          <button
            type="button"
            className="office-active-agent-trigger"
            aria-label={`Agent 列表，共 ${menuAgents.length} 个`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <UsersRound size={15} aria-hidden="true" />
            <span>Agents</span>
            <span className="office-active-agent-count">{menuAgents.length}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="office-active-agent-popover" role="menu" aria-label="当前 Agent">
              {menuAgents.length > 0 ? menuAgents.map((agent) => {
                const inScene = scene?.actors.some((actor) => actor.actorId === agent.agentSurfaceId) ?? false;
                return (
                  <button key={agent.agentSurfaceId} type="button" role="menuitem" onClick={() => void onOpenSurface(agent.agentSurfaceId)}>
                    <i className={`office-profile-status ${agent.status}`} aria-hidden="true" />
                    <span><strong>{agent.label}</strong><small>{agent.roleDisplayName}</small></span>
                    <span>{officeStatusLabel(agent.status)}{inScene ? "" : " · 场外"}</span>
                  </button>
                );
              }) : <div className="office-active-agent-empty">暂无 Agent</div>}
            </div>
          ) : null}
        </div>
        {selectedAgent && cardAnchor ? (
          <OfficeAgentProfileCard
            agent={selectedAgent}
            anchor={cardAnchor}
            onClose={dismissCard}
            onOpenSurface={onOpenSurface}
          />
        ) : null}
      </div>
    </div>
  );
}

export function OfficeAgentProfileCard({
  agent,
  anchor,
  onClose,
  onOpenSurface,
}: {
  agent: AgentSurfaceProjectionItem;
  anchor: { x: number; y: number };
  onClose: () => void;
  onOpenSurface: (agentSurfaceId: string) => Promise<"opened" | "stale" | "error">;
}): ReactElement {
  const cardRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState(() => ({ left: anchor.x + 18, top: anchor.y }));
  const [openState, setOpenState] = useState<"idle" | "opening" | "stale" | "error">("idle");
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setPosition(clampProfileCardPosition(anchor, { width: rect.width || 264, height: rect.height || 280 }, {
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
    }));
  }, [agent.agentSurfaceId, anchor]);
  const open = async () => {
    if (openState === "opening") return;
    setOpenState("opening");
    const result = await onOpenSurface(agent.agentSurfaceId);
    if (result === "opened") onClose();
    else setOpenState(result);
  };
  return (
    <aside
      ref={cardRef}
      className="office-agent-profile-card"
      style={{ left: position.left, top: position.top }}
      aria-label={`${agent.label} 名片`}
      data-testid="office-agent-profile-card"
    >
      <button type="button" className="office-agent-profile-close" aria-label="关闭名片" onClick={onClose}><X size={15} /></button>
      <div className="office-agent-profile-heading">
        <img src={`/agent-office/avatars/${officeAvatarIdForRole(agent.roleId)}.webp`} alt="" width="96" height="96" />
        <div>
          <strong>{agent.label}</strong>
          <span>{agent.roleDisplayName}</span>
          <small><i className={`office-profile-status ${agent.status}`} aria-hidden="true" />{officeStatusLabel(agent.status)}</small>
        </div>
      </div>
      {agent.description ? <p>{agent.description}</p> : null}
      {agent.skills.length > 0 ? <div className="office-agent-profile-skills">{agent.skills.map((skill) => <span key={skill}>{skill}</span>)}</div> : null}
      <button type="button" className="office-agent-profile-open" disabled={openState === "opening"} onClick={() => void open()}>
        <span>{openState === "opening" ? "正在同步..." : agent.kind === "main-agent" ? "返回主对话" : "打开 Agent 对话"}</span>
        <ArrowRight size={15} />
      </button>
      {openState === "stale" ? <p className="office-agent-profile-error" role="alert">Agent 尚未同步到当前场景，请稍后重试。</p> : null}
      {openState === "error" ? <p className="office-agent-profile-error" role="alert">Agent 工作区同步失败，请重试。</p> : null}
    </aside>
  );
}

export function clampProfileCardPosition(
  anchor: { x: number; y: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const margin = 12;
  const gap = 18;
  const opensLeft = anchor.x > viewport.width / 2;
  const preferredLeft = opensLeft ? anchor.x - card.width - gap : anchor.x + gap;
  return {
    left: Math.min(Math.max(margin, preferredLeft), Math.max(margin, viewport.width - card.width - margin)),
    top: Math.min(Math.max(margin, anchor.y - card.height / 2), Math.max(margin, viewport.height - card.height - margin)),
  };
}

function officeStatusLabel(status: AgentSurfaceStatus): string {
  const labels: Record<AgentSurfaceStatus, string> = {
    idle: "空闲", queued: "排队中", running: "工作中", completed: "已完成",
    "needs-change": "需要修改", failed: "失败", "waiting-user": "等待确认", interrupted: "已中断", terminated: "已终止",
  };
  return labels[status];
}

export function currentOfficeAgents(projection: AgentSurfaceProjection): AgentSurfaceProjectionItem[] {
  return projection.surfaces.filter((surface) => (
    surface.kind === "agent"
    && surface.graphScopeId === projection.graphScopeId
    && surface.scopeRange === "current"
    && surface.status !== "terminated"
  ));
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
