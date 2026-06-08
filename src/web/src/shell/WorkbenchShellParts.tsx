import {
  useState,
  type ReactElement,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Code2,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Send,
  Settings,
  ShieldCheck,
  Search,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { workflowActionLabel } from "../action-labels.js";
import { workflowActionPayloadFromScope } from "../workflow-actions.js";
import {
  HarnessInitButton,
  ProjectAddForm,
  ProjectCreateForm,
  ProjectDetailsPanel,
} from "../panels/ProjectPanels.js";
import {
  formatTime,
  workpadStatusLabel,
  userFacingText,
  runtimeLabel,
  humanStatus,
  formatUsage,
  threadLabel,
  threadTone,
} from "../formatters.js";
import type {
  AppStatus,
  ProjectStatus,
  Snapshot,
  WorkpadRuntimeStatus,
  WorkpadSummary,
  TopicDetail,
  PlanCard,
  ThreadStreamAction,
  ThreadStreamItem,
  ThreadStreamEvidence,
  RunSummary,
  WorkbenchLiveToolEvent,
  AssistantReadableEvent,
  AssistantTurnBlock,
  LiveTurnEvent,
  LiveAssistantTurn,
  TopicMessageEntry,
} from "../types.js";

export function proseBlock(runId: string, text: string, sequence: number): AssistantTurnBlock {
  return { id: `live-prose:${runId}:${sequence}`, runId, sequence, kind: "prose", timestamp: new Date().toISOString(), source: "codex", text };
}

export function appendProseBlock(blocks: AssistantTurnBlock[], runId: string, delta: string): AssistantTurnBlock[] {
  const next = [...blocks];
  const last = next.at(-1);
  if (last?.kind === "prose" && last.source === "codex") {
    next[next.length - 1] = { ...last, text: `${last.text ?? ""}${delta}` };
    return next;
  }
  next.push(proseBlock(runId, delta, nextBlockSequence(next)));
  return next;
}

export function upsertBlock(blocks: AssistantTurnBlock[], block: AssistantTurnBlock): AssistantTurnBlock[] {
  const key = blockKey(block);
  const existingIndex = blocks.findIndex((item) => blockKey(item) === key);
  if (existingIndex === -1) return [...blocks, { ...block, sequence: block.sequence > 0 ? block.sequence : nextBlockSequence(blocks) }];
  const next = [...blocks];
  next[existingIndex] = mergeAssistantBlocks(next[existingIndex], block);
  return next;
}

function mergeAssistantBlocks(existing: AssistantTurnBlock, incoming: AssistantTurnBlock): AssistantTurnBlock {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    sequence: existing.sequence,
    timestamp: existing.timestamp,
    text: incoming.text ?? existing.text,
    preview: incoming.preview ?? existing.preview,
    title: incoming.title ?? existing.title,
    status: incoming.status ?? existing.status,
    command: incoming.command ?? existing.command,
    cwd: incoming.cwd ?? existing.cwd,
    exitCode: incoming.exitCode ?? existing.exitCode,
    artifactRef: incoming.artifactRef ?? existing.artifactRef,
    truncated: incoming.truncated ?? existing.truncated,
    isError: incoming.isError ?? existing.isError,
  };
}

export function blockFromAssistantEvent(event: AssistantReadableEvent): AssistantTurnBlock | null {
  if (!mainThreadAssistantEvent(event)) return null;
  return {
    id: `live-assistant:${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? "event"}`,
    runId: event.runId,
    sequence: 0,
    kind: assistantEventBlockKind(event.kind),
    timestamp: event.timestamp ?? new Date().toISOString(),
    source: "codex",
    status: event.phase,
    title: event.title ?? readableEventTitle(event),
    text: event.summary,
    command: event.command,
    cwd: event.cwd,
    exitCode: event.exitCode,
    preview: event.preview,
    artifactRef: event.artifactRef,
    isError: event.isError,
    truncated: event.truncated,
    itemId: event.itemId,
  };
}

export function blockFromToolEvent(event: WorkbenchLiveToolEvent): AssistantTurnBlock | null {
  if (event.phase === "stderr") return null;
  if (!event.command && event.phase === "status" && !event.isError) return null;
  return {
    id: `live-tool:${event.runId}:${event.command ?? event.name ?? event.phase}:${event.phase}`,
    runId: event.runId,
    sequence: 0,
    kind: event.command ? "command" : "status",
    timestamp: new Date().toISOString(),
    source: "codex",
    status: event.status ?? event.phase,
    title: event.command ? event.phase === "started" ? "正在运行命令" : event.isError ? "命令失败" : "命令完成" : event.name ?? "运行状态",
    text: event.name,
    command: event.command,
    exitCode: event.exitCode,
    preview: event.outputTail,
    isError: event.isError,
    itemId: event.itemId,
  };
}

export function usageBlock(runId: string, usage: Record<string, unknown>): AssistantTurnBlock {
  return { id: `live-usage:${runId}`, runId, sequence: 0, kind: "usage", timestamp: new Date().toISOString(), source: "codex", title: "用量", text: formatUsage(usage) };
}

function assistantEventBlockKind(kind: AssistantReadableEvent["kind"]): AssistantTurnBlock["kind"] {
  if (kind === "reasoning-summary") return "reasoning-summary";
  if (kind === "command") return "command";
  if (kind === "file-change") return "file-change";
  if (kind === "usage") return "usage";
  if (kind === "error") return "error";
  if (kind === "status") return "status";
  return "tool-result";
}

function nextBlockSequence(blocks: AssistantTurnBlock[]): number {
  return Math.max(0, ...blocks.map((block) => block.sequence)) + 1;
}

function blockKey(block: AssistantTurnBlock): string {
  const runId = block.runId ?? "";
  if (block.kind === "usage") return `usage:${runId}`;
  if (block.kind === "error") return `error:${runId}:${normalizeBlockText(block.text ?? block.preview ?? block.title)}`;
  if (block.kind === "workflow-evidence") return `workflow-evidence:${runId}:${block.artifactRef ?? block.title ?? block.status ?? block.id}`;
  if (block.kind === "command") {
    if (block.itemId) return `command:${runId}:item:${block.itemId}`;
    return `command:${runId}:command:${normalizeCommandKey(block.command)}`;
  }
  return block.itemId ? `${block.kind}:${runId}:item:${block.itemId}` : `${block.id}:${block.kind}`;
}

function normalizeCommandKey(command: string | undefined): string {
  return (command ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function ProjectConversationSidebar({
  appStatus,
  projects,
  selectedProjectId,
  selectedTopicId,
  snapshots,
  snapshot,
  search,
  onSearch,
  expandedProjects,
  projectMenuMode,
  projectDetailsId,
  onProjectMenuMode,
  onProjectDetails,
  onNewConversation,
  onOpenProject,
  onToggleProject,
  onChooseConversation,
  onRefresh,
}: {
  appStatus: AppStatus | null;
  projects: ProjectStatus[];
  selectedProjectId: string | null;
  selectedTopicId: string | null;
  snapshots: Record<string, Snapshot>;
  snapshot: Snapshot;
  search: string;
  onSearch: (value: string) => void;
  expandedProjects: Set<string>;
  projectMenuMode: "closed" | "add" | "new";
  projectDetailsId: string | null;
  onProjectMenuMode: (mode: "closed" | "add" | "new") => void;
  onProjectDetails: (projectId: string | null) => void;
  onNewConversation: (projectId?: string) => Promise<void>;
  onOpenProject: (projectId: string) => Promise<void>;
  onToggleProject: (projectId: string) => Promise<void>;
  onChooseConversation: (projectId: string, conversationId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const visibleProjects = appStatus?.mode === "project" && appStatus.directProjectId
    ? projects.filter((item) => item.project?.id === appStatus.directProjectId)
    : projects;
  const normalizedSearch = search.trim().toLowerCase();
  async function afterProjectAdded(projectId?: string): Promise<void> {
    await onRefresh();
    if (projectId) await onOpenProject(projectId);
    onProjectMenuMode("closed");
  }
  return (
    <div className="codex-sidebar">
      <nav className="global-nav" aria-label="全局入口">
        <label className="sidebar-search">
          <Search size={15} />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索" aria-label="搜索已加载对话" />
        </label>
      </nav>

      <section className="project-tree" aria-label="项目">
        <div className="project-tree-header">
          <span className="section-label">项目</span>
          <button className="icon-button compact-icon" aria-label="项目菜单" onClick={() => onProjectMenuMode(projectMenuMode === "closed" ? "add" : "closed")}><FolderPlus size={15} /></button>
        </div>
        {projectMenuMode !== "closed" ? (
          <div className="project-menu-popover">
            <button className={`project-menu-item ${projectMenuMode === "new" ? "selected" : ""}`} onClick={() => onProjectMenuMode("new")}><FolderPlus size={15} />新建空项目</button>
            <button className={`project-menu-item ${projectMenuMode === "add" ? "selected" : ""}`} onClick={() => onProjectMenuMode("add")}><Folder size={15} />使用现有文件夹</button>
            {projectMenuMode === "add" ? <ProjectAddForm onDone={afterProjectAdded} /> : null}
            {projectMenuMode === "new" ? <ProjectCreateForm onDone={afterProjectAdded} /> : null}
          </div>
        ) : null}

        <div className="project-folder-list">
          {visibleProjects.length === 0 ? <div className="empty-state sidebar-empty">还没有注册项目。</div> : null}
          {visibleProjects.map((item) => {
            const projectId = item.project?.id ?? item.path;
            const projectName = item.project?.name ?? item.path;
            const selected = item.project?.id === selectedProjectId;
            const expanded = selected || expandedProjects.has(projectId);
            const projectSnapshot = item.project?.id === selectedProjectId ? snapshot : item.project?.id ? snapshots[item.project.id] : undefined;
            const conversations = conversationsForSidebar(projectSnapshot, selectedTopicId);
            const filteredConversations = normalizedSearch
              ? conversations.filter((conversation) => conversation.title.toLowerCase().includes(normalizedSearch) || conversation.status.toLowerCase().includes(normalizedSearch))
              : conversations;
            const showProject = !normalizedSearch || projectName.toLowerCase().includes(normalizedSearch) || filteredConversations.length > 0;
            if (!showProject) return null;
            return (
              <div className="project-folder" key={projectId}>
                <div className={`project-folder-row ${selected ? "selected" : ""}`}>
                  <button className="project-folder-toggle" aria-label={expanded ? "收起项目" : "展开项目"} onClick={() => item.project ? void onToggleProject(item.project.id) : undefined}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button className="project-folder-main" onClick={() => item.project ? void onOpenProject(item.project.id) : undefined}>
                    <Folder size={16} />
                    <span>{projectName}</span>
                    {item.managed ? null : <small>未初始化</small>}
                  </button>
                  {item.project && item.managed ? (
                    <button
                      className="project-folder-new"
                      aria-label={`在 ${projectName} 中开始新对话`}
                      title={`在 ${projectName} 中开始新对话`}
                      onClick={() => void onNewConversation(item.project?.id)}
                    >
                      <FileText size={15} />
                    </button>
                  ) : null}
                  <button className="project-folder-more" aria-label="项目详情" onClick={() => onProjectDetails(projectDetailsId === projectId ? null : projectId)}>
                    <MoreHorizontal size={15} />
                  </button>
                </div>
                {projectDetailsId === projectId ? (
                  <ProjectDetailsPanel
                    project={item}
                    snapshot={projectSnapshot}
                    selected={selected}
                    onOpen={() => item.project ? void onOpenProject(item.project.id) : undefined}
                    onRefresh={() => void onRefresh()}
                  />
                ) : null}
                {expanded ? (
                  <div className="conversation-list">
                    {item.managed && !projectSnapshot ? <div className="conversation-placeholder">展开后加载对话。</div> : null}
                    {!item.managed ? <div className="conversation-placeholder">选择项目后初始化 Harness。</div> : null}
                    {filteredConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        className={`conversation-row ${conversation.selected ? "selected" : ""}`}
                        onClick={() => item.project ? void onChooseConversation(item.project.id, conversation.id) : undefined}
                      >
                        <span>{userFacingText(conversation.title)}</span>
                        <small>{conversation.status}{conversation.waitingDecisionCount > 0 ? ` · ${conversation.waitingDecisionCount} 个待确认` : ""}</small>
                        {conversation.blocker ? <em>{userFacingText(conversation.blocker)}</em> : null}
                      </button>
                    ))}
                    {item.managed && projectSnapshot && filteredConversations.length === 0 ? <div className="conversation-placeholder">暂无已加载对话。</div> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="sidebar-settings">
        <button className="global-nav-item settings-entry"><Settings size={16} />设置</button>
      </div>
    </div>
  );
}

type SidebarConversation = {
  id: string;
  title: string;
  status: string;
  selected: boolean;
  waitingDecisionCount: number;
  blocker?: string;
};

function conversationsForSidebar(snapshot: Snapshot | undefined, selectedTopicId: string | null): SidebarConversation[] {
  if (!snapshot) return [];
  return (snapshot.left.workpads ?? snapshot.left.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    state: topic.state,
    runtimeStatus: topic.state === "archive" ? "archived" : "active",
    userStatus: topic.state === "archive" ? "completed" : "waiting-confirmation",
    userStatusLabel: topic.state === "archive" ? "已完成" : "等你确认",
    selected: selectedTopicId === topic.id,
    waitingDecisionCount: 0,
    blocker: undefined,
  } satisfies WorkpadSummary))).map((workpad) => ({
    id: workpad.id,
    title: workpad.title,
    status: workpad.userStatusLabel ?? workpadStatusLabel(workpad.runtimeStatus),
    selected: selectedTopicId === workpad.id || workpad.selected,
    waitingDecisionCount: workpad.waitingDecisionCount,
    blocker: workpad.blocker,
  }));
}

export function currentWorkpadSummary(snapshot: Snapshot, topic: TopicDetail | null): WorkpadSummary | undefined {
  if (!topic) return undefined;
  return snapshot.left.workpads?.find((item) => item.id === topic.id);
}

export function UnmanagedProjectView({ project, onDone }: { project: ProjectStatus | null; onDone: () => Promise<void> }): ReactElement {
  if (!project?.project) return <EmptyWorkbench title="项目不可用" description="请选择左侧项目或重新刷新项目列表。" />;
  return (
    <section className="empty-workbench">
      <p className="eyebrow">项目已添加</p>
      <h1>{project.project.name}</h1>
      <p>{project.path}</p>
      <p>这个项目还没有初始化 Harness。初始化后会创建项目入口地图和 external-local 记忆。</p>
      <HarnessInitButton projectId={project.project.id} onDone={onDone} />
    </section>
  );
}

export function TopicEmptyView({
  snapshot,
  composerText,
  setComposerText,
  onCreate,
  busy,
}: {
  snapshot: Snapshot;
  composerText: string;
  setComposerText: (value: string) => void;
  onCreate: () => Promise<void>;
  busy: boolean;
}): ReactElement {
  return (
    <section className="topic-empty-view">
      <div className="breadcrumb">{snapshot.project?.name ?? "project"} / 需求对话</div>
      <div className="topic-empty-content">
        <p className="eyebrow">本地工作台</p>
        <h1>暂无需求对话</h1>
        <p>输入一个需求或问题来创建第一个需求对话。AHO 会先生成方案草案，而不是直接写代码。</p>
        <div className="empty-composer">
          <textarea value={composerText} onChange={(event) => setComposerText(event.target.value)} placeholder="例如：帮我新增会员满 100 元 9 折，并补测试。" />
          <button className="primary-button" disabled={busy || !composerText.trim()} onClick={() => void onCreate()}>创建需求对话</button>
        </div>
      </div>
    </section>
  );
}

export function EmptyWorkbench({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <section className="empty-workbench">
      <p className="eyebrow">本地工作台</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

export function ThreadStreamView({
  items,
  liveTurns,
  busy,
  onAction,
  onSelectDecisionContext,
}: {
  items: ThreadStreamItem[];
  liveTurns: LiveAssistantTurn[];
  busy: boolean;
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  if (items.length === 0 && liveTurns.length === 0) return <div className="empty-state">暂无对话内容。</div>;
  return (
    <div className="timeline">
      {items.map((item) => (
        <div className={`timeline-item ${threadTone(item)}`} key={item.id}>
          <div className="timeline-icon">{threadIcon(item)}</div>
          <div>
            <strong>{threadLabel(item)}</strong>
            {item.blocks && item.blocks.length > 0 ? (
              <AssistantTurnBlocks blocks={item.blocks} actions={item.actions ?? []} busy={busy} onAction={onAction} completed={item.status !== "running"} />
            ) : (
              <>
                <p>{item.body ?? item.label} {item.status ? `· ${item.status}` : ""}</p>
                {item.activity && item.activity.length > 0 ? <AssistantActivity events={item.activity} /> : null}
                {item.evidence && item.evidence.length > 0 ? <AssistantEvidenceBlocks evidence={item.evidence} /> : null}
                {item.planCard ? <PlanCardView planCard={item.planCard} actions={item.actions ?? []} busy={busy} onAction={onAction} /> : null}
              </>
            )}
            {item.artifact && !(item.blocks && item.blocks.some((block) => block.artifactRef === item.artifact)) ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
            {item.kind === "decision" ? (
              <button className="context-link" type="button" onClick={() => onSelectDecisionContext(`decision:${item.id}`)}>
                在右侧查看决策
              </button>
            ) : null}
          </div>
          <time>{formatTime(item.timestamp)}</time>
        </div>
      ))}
      {liveTurns.map((turn) => <LiveAssistantTurnView key={turn.id} turn={turn} />)}
    </div>
  );
}

function AssistantActivity({ events }: { events: LiveTurnEvent[] }): ReactElement {
  const statusEvents = events.filter((event): event is Extract<LiveTurnEvent, { kind: "status" }> => event.kind === "status");
  const assistantEvents = events
    .filter((event): event is Extract<LiveTurnEvent, { kind: "assistant-event" }> => event.kind === "assistant-event")
    .map((event) => mainThreadAssistantEvent(event.event))
    .filter((event): event is AssistantReadableEvent => Boolean(event));
  const toolEvents = filterLegacyToolEvents(
    events.filter((event): event is Extract<LiveTurnEvent, { kind: "tool" }> => event.kind === "tool" && event.tool.phase !== "stderr"),
    assistantEvents,
  );
  const usage = assistantEvents.some((event) => event.kind === "usage") ? undefined : events.find((event): event is Extract<LiveTurnEvent, { kind: "usage" }> => event.kind === "usage");
  const errors = events.filter((event): event is Extract<LiveTurnEvent, { kind: "error" }> => event.kind === "error");
  return (
    <div className="assistant-activity">
      {statusEvents.length > 0 ? (
        <div className="activity-status-row">
          {statusEvents.slice(-4).map((event, index) => (
            <span key={`${event.label}:${index}`}>{humanStatus(event.detail ?? event.label)}</span>
          ))}
        </div>
      ) : null}
      {assistantEvents.length > 0 ? <AssistantReadableEventCards events={assistantEvents} /> : null}
      {toolEvents.length > 0 ? <ToolEventGroup events={toolEvents} /> : null}
      {usage ? <small className="usage-line">{formatUsage(usage.usage)}</small> : null}
      {errors.map((error, index) => <div className="live-error" key={`activity-error:${index}`}>{error.message}</div>)}
    </div>
  );
}

function LiveAssistantTurnView({ turn }: { turn: LiveAssistantTurn }): ReactElement {
  const assistantEvents = turn.events
    .filter((event): event is Extract<LiveTurnEvent, { kind: "assistant-event" }> => event.kind === "assistant-event")
    .map((event) => mainThreadAssistantEvent(event.event))
    .filter((event): event is AssistantReadableEvent => Boolean(event));
  const toolEvents = filterLegacyToolEvents(
    turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "tool" }> => event.kind === "tool" && event.tool.phase !== "stderr"),
    assistantEvents,
  );
  const statusEvents = turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "status" }> => event.kind === "status");
  const usage = assistantEvents.some((event) => event.kind === "usage") ? undefined : turn.events.find((event): event is Extract<LiveTurnEvent, { kind: "usage" }> => event.kind === "usage");
  const errors = turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "error" }> => event.kind === "error");
  const latestStatus = statusEvents.at(-1);
  return (
    <div className={`timeline-item live-turn ${turn.status === "failed" ? "danger" : "success"}`}>
      <div className="timeline-icon"><Code2 size={16} /></div>
      <div>
        <strong>{runtimeLabel(turn.runtime ?? turn.actionType ?? "AI 运行")}</strong>
        <div className="live-status-pill">
          <Clock3 size={14} />
          <span>{humanStatus(latestStatus?.label ?? turn.status)}</span>
          {latestStatus?.detail ? <small>{latestStatus.detail}</small> : null}
        </div>
        {turn.blocks.length > 0 ? (
          <AssistantTurnBlocks blocks={turn.blocks} defaultOpenProcess completed={false} />
        ) : (
          <>
            {turn.text.trim() ? <p className="assistant-live-text">{turn.text}</p> : <p className="assistant-live-text muted">等待首批输出中...</p>}
            {assistantEvents.length > 0 ? <AssistantReadableEventCards events={assistantEvents} defaultOpenProcess /> : null}
            {toolEvents.length > 0 ? <ToolEventGroup events={toolEvents} /> : null}
            {usage ? <small className="usage-line">{formatUsage(usage.usage)}</small> : null}
            {errors.map((error, index) => <div className="live-error" key={`${turn.id}:error:${index}`}>{error.message}</div>)}
          </>
        )}
      </div>
      <time>{formatTime(turn.startedAt)}</time>
    </div>
  );
}

function AssistantTurnBlocks({
  blocks,
  actions = [],
  busy = false,
  onAction = async () => undefined,
  defaultOpenProcess = false,
  completed = true,
}: {
  blocks: AssistantTurnBlock[];
  actions?: ThreadStreamAction[];
  busy?: boolean;
  onAction?: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  defaultOpenProcess?: boolean;
  completed?: boolean;
}): ReactElement {
  const displayBlocks = normalizeTurnBlocks(blocks);
  if (displayBlocks.length === 0) return <></>;
  return (
    <div className="assistant-block-stack">
      {displayBlocks.map((block) => {
        if (block.kind === "command-group") {
          const children = block.children ?? [];
          const open = defaultOpenProcess || !completed || children.some((child) => child.isError);
          return (
            <details className="assistant-command-group" open={open} key={block.id} data-testid="assistant-block-command-group">
              <summary>{block.title ?? `已运行 ${children.length} 条命令`}</summary>
              <div className="assistant-block-stack compact">
                {children.map((child) => <AssistantBlockView block={child} key={child.id} />)}
              </div>
            </details>
          );
        }
        if (block.kind === "plan-card" && block.planCard) {
          return <div data-testid="assistant-block-plan-card" key={block.id}><PlanCardView planCard={block.planCard} actions={actions} busy={busy} onAction={onAction} /></div>;
        }
        return <AssistantBlockView block={block} key={block.id} />;
      })}
    </div>
  );
}

function AssistantBlockView({ block }: { block: AssistantTurnBlock }): ReactElement {
  if (block.kind === "prose") return <p className="assistant-prose-block" data-testid="assistant-block-prose">{block.text}</p>;
  if (block.kind === "usage") return <small className="usage-line" data-testid="assistant-block-usage">{block.text ?? block.preview ?? "用量已记录"}</small>;
  const className = `assistant-block-card ${block.isError || block.kind === "error" ? "danger" : ""}`;
  return (
    <div className={className} data-testid={`assistant-block-${block.kind}`}>
      <div className="assistant-event-header">
        <strong>{block.title ?? blockTitle(block)}</strong>
        {block.status ? <small>{humanStatus(block.status)}</small> : null}
      </div>
      {block.text ? <p>{block.text}</p> : null}
      {block.command ? <code>{block.command}</code> : null}
      {block.cwd ? <small className="event-muted">cwd: {block.cwd}</small> : null}
      {typeof block.exitCode === "number" ? <small className="event-muted">exit {block.exitCode}</small> : null}
      {block.preview ? <pre className="event-preview">{block.preview}</pre> : null}
      {block.artifactRef ? <small className="artifact-link">查看证据：{artifactName(block.artifactRef)}</small> : null}
      {block.truncated ? <small className="event-muted">输出已截断，完整内容在 Agent Loop 原始日志中。</small> : null}
    </div>
  );
}

function normalizeTurnBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const ordered = dedupeBlocks(blocks)
    .filter((block) => isMainThreadBlock(block))
    .map((block) => hasInternalRunMetadata(block.preview) ? { ...block, preview: undefined, truncated: false } : block)
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const result: AssistantTurnBlock[] = [];
  let group: AssistantTurnBlock[] = [];
  function flushGroup(): void {
    if (group.length === 0) return;
    if (group.length === 1 && group[0].isError) result.push(group[0]);
    else {
      result.push({
        id: `command-group:${group[0].id}:${group.length}`,
        runId: group[0].runId,
        sequence: group[0].sequence,
        kind: "command-group",
        timestamp: group[0].timestamp,
        source: "codex",
        title: `已运行 ${group.length} 条命令`,
        children: group,
      });
    }
    group = [];
  }
  for (const block of ordered) {
    if (block.kind === "command" && !block.isError) {
      group.push(block);
      continue;
    }
    flushGroup();
    result.push(block);
  }
  flushGroup();
  return result;
}

function dedupeBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const byKey = new Map<string, AssistantTurnBlock>();
  for (const block of blocks) {
    const key = blockKey(block);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeAssistantBlocks(existing, block) : block);
  }
  return [...byKey.values()];
}

function isMainThreadBlock(block: AssistantTurnBlock): boolean {
  if (block.kind !== "status") return true;
  const normalized = `${block.title ?? ""} ${block.text ?? ""} ${block.status ?? ""}`.toLowerCase();
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  return Boolean(block.isError) || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

function blockTitle(block: AssistantTurnBlock): string {
  if (block.kind === "reasoning-summary") return "工作摘要";
  if (block.kind === "command") return block.isError ? "命令失败" : block.status === "started" ? "正在运行命令" : "命令完成";
  if (block.kind === "file-change") return "文件变更";
  if (block.kind === "tool-result") return "工具返回";
  if (block.kind === "workflow-evidence") return "工作流证据";
  if (block.kind === "error") return "错误";
  if (block.kind === "status") return "运行状态";
  return "本轮过程";
}

function filterLegacyToolEvents(events: Array<Extract<LiveTurnEvent, { kind: "tool" }>>, assistantEvents: AssistantReadableEvent[]): Array<Extract<LiveTurnEvent, { kind: "tool" }>> {
  const commandKeys = new Set(assistantEvents.filter((event) => event.kind === "command" && event.command).map((event) => `${event.command}:${event.phase ?? ""}:${event.exitCode ?? ""}`));
  return events.filter((event) => !event.tool.command || !commandKeys.has(`${event.tool.command}:${event.tool.phase ?? ""}:${event.tool.exitCode ?? ""}`));
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

function AssistantEvidenceBlocks({ evidence }: { evidence: ThreadStreamEvidence[] }): ReactElement {
  const visible = dedupeEvidence(evidence);
  if (visible.length === 0) return <></>;
  return (
    <div className="assistant-evidence-stack">
      {visible.map((item) => (
        <div className={`assistant-evidence-row ${item.status === "failed" || item.status === "blocked" ? "danger" : ""}`} key={item.id}>
          <div>
            <strong>{evidenceLabel(item)}</strong>
            {item.body ? <p>{item.body}</p> : null}
          </div>
          <span>{humanStatus(item.status ?? item.source)}</span>
          {item.artifact ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
        </div>
      ))}
    </div>
  );
}

function dedupeEvidence(evidence: ThreadStreamEvidence[]): ThreadStreamEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function evidenceLabel(item: ThreadStreamEvidence): string {
  if (item.source === "validation") return `验证：${humanStatus(item.status ?? item.label)}`;
  if (item.source === "audit") return `审查：${humanStatus(item.status ?? item.label)}`;
  if (item.source === "workflow") return "执行结果";
  if (item.source === "decision") return "决策";
  return item.label;
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

function ToolEventGroup({ events }: { events: Array<Extract<LiveTurnEvent, { kind: "tool" }>> }): ReactElement {
  const commandEvents = events.filter((event) => event.tool.command);
  const phaseEvents = events.filter((event) => !event.tool.command);
  return (
    <div className="tool-event-stack">
      {commandEvents.length > 1 ? (
        <details className="tool-event-details">
          <summary>已运行 {commandEvents.length} 条命令</summary>
          {commandEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:${index}`} />)}
        </details>
      ) : commandEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:${index}`} />)}
      {phaseEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:phase:${index}`} />)}
    </div>
  );
}

function ToolEventCard({ event }: { event: WorkbenchLiveToolEvent }): ReactElement {
  const label = event.command
    ? event.phase === "started" ? "正在运行命令" : event.isError ? "命令失败" : "命令完成"
    : event.name ? `${event.name} ${humanStatus(event.status ?? event.phase)}` : humanStatus(event.phase);
  return (
    <div className={`tool-event-card ${event.isError ? "danger" : ""}`}>
      <strong>{label}</strong>
      {event.command ? <code>{event.command}</code> : null}
      {typeof event.exitCode === "number" ? <small>exit {event.exitCode}</small> : null}
      {event.outputTail ? <pre className="event-preview">{event.outputTail}</pre> : null}
    </div>
  );
}

function PlanCardView({ planCard, actions, busy, onAction }: { planCard: PlanCard; actions: ThreadStreamAction[]; busy: boolean; onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void> }): ReactElement {
  const [confirmingAction, setConfirmingAction] = useState<ThreadStreamAction | null>(null);
  const visibleActions = actions.filter((action) => action.actionType !== "code.run");
  return (
    <div className="plan-card">
      <h3>{planCard.title}</h3>
      <p>{userFacingText(planCard.summary)}</p>
      <ol>
        {planCard.steps.map((step, index) => <li key={`${step.label}-${index}`}><strong>{userFacingText(step.label)}</strong><span>{userFacingText(step.description)}</span></li>)}
      </ol>
      {planCard.warnings.length > 0 ? <div className="plan-warnings">{planCard.warnings.map(userFacingText).join(" · ")}</div> : null}
      {visibleActions.length > 0 ? (
        <div className="plan-actions">
          {confirmingAction ? (
            <div className="inline-confirm">
              <span>确认执行 {userFacingText(confirmingAction.label)}</span>
              <button className="primary-button" disabled={busy} onClick={() => { setConfirmingAction(null); void onAction(confirmingAction.actionType, workflowActionPayloadFromScope(confirmingAction)); }}>确认执行</button>
              <button className="outline-button" disabled={busy} onClick={() => setConfirmingAction(null)}>取消</button>
            </div>
          ) : null}
          {visibleActions.map((action) => (
            <button
              className={action.enabled ? "outline-button" : "outline-button disabled"}
              disabled={busy || !action.enabled}
              key={`${action.actionType}-${action.label}`}
              title={action.disabledReason}
              onClick={() => action.requiresConfirmation ? setConfirmingAction(action) : void onAction(action.actionType, workflowActionPayloadFromScope(action))}
            >
              {userFacingText(action.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TopicComposer({
  value,
  onChange,
  mode: _mode,
  onModeChange: _onModeChange,
  busy: _busy,
  disabledReason,
  onSend,
  onStopAndContinue,
  onNewWorkpad: _onNewWorkpad,
  onRunCode: _onRunCode,
  actionRunning,
  canRunCode: _canRunCode,
  currentWorkpadStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: "chat" | "plan";
  onModeChange: (mode: "chat" | "plan") => void;
  busy: boolean;
  disabledReason?: string;
  onSend: () => Promise<void>;
  onStopAndContinue?: () => Promise<void>;
  onNewWorkpad?: () => Promise<void>;
  onRunCode?: () => Promise<void>;
  actionRunning: string | null;
  canRunCode: boolean;
  currentWorkpadStatus?: WorkpadRuntimeStatus;
}): ReactElement {
  const runningConversation = Boolean(actionRunning) || currentWorkpadStatus === "running";
  const canStop = runningConversation && Boolean(onStopAndContinue) && !value.trim();
  const canSend = Boolean(value.trim());
  const sendDisabled = Boolean(disabledReason) || (!canSend && !canStop);
  const buttonTitle = canStop ? "停止当前执行" : runningConversation ? "发送给当前执行" : "发送";
  const buttonIcon = canStop ? <X size={16} /> : <Send size={16} />;
  function submit(): void {
    if (canStop) void onStopAndContinue?.();
    else void onSend();
  }
  return (
    <div className="topic-composer" aria-label="需求对话输入框">
        <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={Boolean(disabledReason)}
        placeholder={disabledReason ?? (runningConversation ? "补充要求；支持实时引导时会发送给当前执行" : "输入问题或下一步需求")}
      />
      <div className="composer-toolbar">
        {disabledReason ? <span className="composer-pill">只读</span> : null}
        {runningConversation ? <span className="composer-pill subtle">{value.trim() ? "会发送给当前执行" : "可停止当前执行"}</span> : null}
        <span className="composer-spacer" />
        {actionRunning ? <span className="composer-pill subtle">正在运行：{workflowActionLabel(actionRunning)}</span> : null}
        <button
          className={`composer-send ${actionRunning ? "running" : ""}`}
          disabled={sendDisabled}
          title={buttonTitle}
          onClick={submit}
        >
          {buttonIcon}
        </button>
      </div>
    </div>
  );
}

export function RunList({ runs, selectedRun, onSelect }: { runs: RunSummary[]; selectedRun?: string; onSelect: (runId: string) => Promise<void> }): ReactElement {
  if (runs.length === 0) return <div className="empty-state">暂无运行记录。</div>;
  return (
    <div className="run-list">
      {runs.map((run) => (
        <button className={`run-row ${run.id === selectedRun ? "selected" : ""}`} key={run.id} onClick={() => void onSelect(run.id)}>
          <Code2 size={16} />
          <span>{runtimeLabel(run.runtime)}</span>
          <small>{humanStatus(run.status)}</small>
        </button>
      ))}
    </div>
  );
}

export function threadItemFromTopicEntry(entry: TopicMessageEntry): ThreadStreamItem | null {
  if (entry.type === "user.message") {
    return { id: `live:${entry.id}`, kind: "user-message", label: "User", timestamp: entry.timestamp, body: entry.text, source: "chat" };
  }
  if (entry.type === "assistant.message") {
    return { id: `live:${entry.id}`, kind: "assistant-turn", label: "AI", timestamp: entry.timestamp, body: entry.text, source: "chat", artifact: entry.artifact, runId: entry.runId, activity: entry.activity, blocks: entry.blocks };
  }
  if (entry.type === "orchestrator.plan") {
    return { id: `live:${entry.id}`, kind: "assistant-turn", label: "Orchestrator plan", timestamp: entry.timestamp, body: entry.text, source: "chat", artifact: entry.artifact, runId: entry.runId, planCard: entry.planCard, activity: entry.activity, blocks: entry.blocks };
  }
  if (entry.type === "workflow.started" || entry.type === "workflow.completed" || entry.type === "workflow.failed") {
    return null;
  }
  if (entry.type === "intake.scan" || entry.type === "intake.iteration") {
    return { id: `live:${entry.id}`, kind: "intake-summary", label: entry.type === "intake.scan" ? "需求分析" : "当前需求理解", timestamp: entry.timestamp, body: entry.text, source: "intake", artifact: entry.artifact, runId: entry.runId, intake: entry.intake };
  }
  if (entry.type === "clarification.request" || entry.type === "clarification.answer" || entry.type === "clarification.skip") {
    return { id: `live:${entry.id}`, kind: "clarification", label: entry.type === "clarification.request" ? "需要确认" : "需求确认", timestamp: entry.timestamp, body: entry.text, source: "intake", runId: entry.runId, status: entry.clarification?.status, clarification: entry.clarification };
  }
  return null;
}

function artifactName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function threadIcon(item: ThreadStreamItem): ReactElement {
  if (item.kind === "user-message" || item.kind === "change-state") return <UserRound size={16} />;
  if (item.kind === "assistant-turn" || item.kind === "assistant-message" || item.kind === "plan-card") return <FileText size={16} />;
  if (item.source === "workflow") return <Code2 size={16} />;
  if (item.source === "decision") return <Upload size={16} />;
  if (item.source === "audit") return <ShieldCheck size={16} />;
  return <CircleCheck size={16} />;
}
