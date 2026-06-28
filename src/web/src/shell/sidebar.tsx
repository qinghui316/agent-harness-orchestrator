import type { ReactElement } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import {
  CodexTrustButton,
  ProjectPrepareButton,
  ProjectAddForm,
  ProjectCreateForm,
} from "../panels/ProjectPanels.js";
import { userFacingText, workpadStatusLabel } from "../formatters.js";
import { postJson } from "../api.js";
import type {
  ProjectStatus,
  Snapshot,
  TopicDetail,
  WorkpadSummary,
} from "../types.js";

export function ProjectConversationSidebar({
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
  onOpenSettings,
  onOpenProjectSettings,
}: {
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
  onOpenSettings: () => void;
  onOpenProjectSettings: (projectId: string) => void;
}): ReactElement {
  const visibleProjects = projects;
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
            <button className={`project-menu-item ${projectMenuMode === "add" ? "selected" : ""}`} onClick={() => onProjectMenuMode("add")}><Folder size={15} />打开文件夹</button>
            <button className={`project-menu-item ${projectMenuMode === "new" ? "selected" : ""}`} onClick={() => onProjectMenuMode("new")}><FolderPlus size={15} />新建项目</button>
            {projectMenuMode === "add" ? <ProjectAddForm onDone={afterProjectAdded} /> : null}
            {projectMenuMode === "new" ? <ProjectCreateForm onDone={afterProjectAdded} /> : null}
          </div>
        ) : null}

        <div className="project-folder-list">
          {visibleProjects.length === 0 ? <div className="empty-state sidebar-empty">还没有项目。</div> : null}
          {visibleProjects.map((item) => {
            const projectId = item.project?.id ?? item.path;
            const concreteProjectId = item.project?.id ?? null;
            const projectName = item.project?.name ?? item.path;
            const selected = item.project?.id === selectedProjectId;
            const expanded = selected || expandedProjects.has(projectId);
            const projectSnapshot = item.project?.id === selectedProjectId ? snapshot : item.project?.id ? snapshots[item.project.id] : undefined;
            const memoryReady = projectSnapshot?.memory.harnessReady ?? item.memory?.harnessReady ?? item.harness.readiness === "ready";
            const memoryIssue = memoryStatusIssue(item, projectSnapshot);
            const canStartConversation = Boolean(item.project && item.pathExists && memoryIssue?.kind !== "missing-external-memory");
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
                    {memoryReady ? null : <small>{memoryIssue?.short ?? "未初始化"}</small>}
                  </button>
                  {canStartConversation ? (
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
                  <div className="project-row-menu-popover" role="menu" aria-label={`${projectName} 项目菜单`}>
                    <button className="project-menu-item" role="menuitem" onClick={() => {
                      onProjectDetails(null);
                      if (item.project) void onOpenProject(item.project.id);
                    }}><Folder size={15} />打开项目首页</button>
                    {canStartConversation ? (
                      <button className="project-menu-item" role="menuitem" onClick={() => {
                        onProjectDetails(null);
                        void onNewConversation(item.project?.id);
                      }}><FileText size={15} />新建对话</button>
                    ) : null}
                    <button className="project-menu-item" role="menuitem" onClick={() => {
                      onProjectDetails(null);
                      void onRefresh();
                    }}><RefreshCw size={15} />刷新会话</button>
                    {item.project && !memoryReady && memoryIssue?.kind !== "missing-external-memory" ? (
                      <ProjectPrepareButton projectId={item.project.id} onDone={async () => { onProjectDetails(null); await onRefresh(); }} />
                    ) : null}
                    {item.project && item.codexTrust && !item.codexTrust.trusted ? (
                      <CodexTrustButton project={item} onDone={async () => { onProjectDetails(null); await onRefresh(); }} />
                    ) : null}
                    {concreteProjectId ? (
                      <button className="project-menu-item" role="menuitem" onClick={() => {
                        onProjectDetails(null);
                        onOpenProjectSettings(concreteProjectId);
                      }}><Settings size={15} />项目详情</button>
                    ) : null}
                  </div>
                ) : null}
                {expanded ? (
                  <div className="conversation-list">
                    {memoryReady && !projectSnapshot ? <div className="conversation-placeholder">正在加载对话。</div> : null}
                    {!memoryReady ? <div className="conversation-placeholder">{memoryIssue?.detail ?? "项目需要准备。"}</div> : null}
                    {filteredConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        className={`conversation-row ${conversation.selected ? "selected" : ""}`}
                        onClick={() => item.project ? void onChooseConversation(item.project.id, conversation.id) : undefined}
                      >
                        <span>{userFacingText(conversation.title)}</span>
                        <small>{conversation.status}</small>
                        {conversation.waitingDecisionCount > 0 ? <b aria-label={`${conversation.waitingDecisionCount} 个待确认`}>{conversation.waitingDecisionCount}</b> : null}
                      </button>
                    ))}
                    {memoryReady && projectSnapshot && filteredConversations.length === 0 ? <div className="conversation-placeholder">暂无对话。</div> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="sidebar-settings">
        <button className="global-nav-item settings-entry" onClick={onOpenSettings}><Settings size={16} />设置</button>
      </div>
    </div>
  );
}

export function currentWorkpadSummary(snapshot: Snapshot, topic: TopicDetail | null): WorkpadSummary | undefined {
  if (!topic) return undefined;
  return snapshot.left.workpads?.find((item) => item.id === topic.id);
}

export function UnmanagedProjectView({ project, onDone }: { project: ProjectStatus | null; onDone: () => Promise<void> }): ReactElement {
  if (!project?.project) return <EmptyWorkbench title="项目不可用" description="请选择左侧项目或重新刷新项目列表。" />;
  const issue = memoryStatusIssue(project);
  const temporaryDirect = !project.memory?.registered;
  return (
    <section className="empty-workbench">
      <p className="eyebrow">{temporaryDirect ? "临时打开" : "项目已添加"}</p>
      <h1>{project.project.name}</h1>
      <p>{project.path}</p>
      {temporaryDirect ? (
        <button
          className="outline-button"
          onClick={() => void postJson("/api/projects", { path: project.path, name: project.project?.name, confirm: true }).then(() => onDone())}
        >
          保存到项目列表
        </button>
      ) : null}
      <p>{issue?.detail ?? "这个项目需要准备后才能开始需求对话。"}</p>
      {issue?.kind === "missing-external-memory" ? null : <ProjectPrepareButton projectId={project.project.id} onDone={onDone} />}
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

type SidebarConversation = {
  id: string;
  title: string;
  status: string;
  selected: boolean;
  waitingDecisionCount: number;
  blocker?: string;
};

function memoryStatusIssue(project: ProjectStatus, snapshot?: Snapshot): { kind: "missing-external-memory" | "uninitialized"; short: string; detail: string } | null {
  const memoryMode = snapshot?.memory.memoryMode ?? project.memory?.memoryMode;
  const available = project.memory?.memoryAvailable ?? true;
  const harnessReady = snapshot?.memory.harnessReady ?? project.memory?.harnessReady ?? project.harness.readiness === "ready";
  if (harnessReady) return null;
  if (project.managed && memoryMode === "external-local" && !available) {
    return {
      kind: "missing-external-memory",
      short: "历史不可用",
      detail: "项目历史不可用，请在项目设置的高级诊断中确认应用数据目录。",
    };
  }
  return {
    kind: "uninitialized",
    short: "需要准备",
    detail: "项目需要准备。",
  };
}

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
