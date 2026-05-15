import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Check,
  CircleCheck,
  Clock3,
  Code2,
  FileText,
  Folder,
  GitBranch,
  MemoryStick,
  MoreVertical,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";

type AppStatus = { mode: "app" | "project"; directProjectId: string | null };
type ProjectStatus = {
  project: { id: string; name: string; path: string } | null;
  path: string;
  pathExists: boolean;
  isGitRepo: boolean;
  managed: boolean;
  harness: { readiness: string };
};
type Snapshot = {
  project: { id: string; name: string; path: string } | null;
  memory: { memoryMode?: string; harnessReady?: boolean; artifactBase?: string };
  left: {
    topics: Topic[];
    repo?: { branch?: string; dirty?: boolean; path?: string };
  };
  center: {
    selectedTopic: TopicDetail | null;
    agentLoop: { runs: RunSummary[] };
    thread: { events: ThreadEvent[] };
  };
  right: { approvals: Approval[] };
  harnessGaps: Array<{ id: string; status: string; summary: string }>;
  warnings: string[];
};

type Topic = { id: string; title: string; state: string; updatedAt?: string };
type TopicDetail = Topic & {
  closeGate?: { ready: boolean; warnings: string[]; blockingIssues: string[] };
  reviewStatus?: string | null;
  acCount?: number;
  taskCount?: number;
};
type ThreadEvent = { id: string; type: string; label: string; timestamp?: string; status?: string; runId?: string };
type RunSummary = { id: string; runtime: string; status: string; startedAt?: string; finishedAt?: string };
type Approval = {
  id: string;
  kind: string;
  label: string;
  severity: string;
  changeId?: string;
  reason?: string;
  action?: { actionId: string; label: string; command: string; args: string[]; mutates: boolean; requiresConfirmation: boolean };
};
type StreamPacket = {
  run: RunSummary;
  live: false;
  events: ThreadEvent[];
  artifacts: Array<{ key: string; path: string; kind: string; exists: boolean; preview?: string; tail?: string; truncated?: boolean; diagnostic?: string }>;
  diagnostics: string[];
};
type FolderDialogResult = { path: string | null; canceled: boolean; supported: boolean; error?: string };

const emptySnapshot: Snapshot = {
  project: null,
  memory: {},
  left: { topics: [] },
  center: { selectedTopic: null, agentLoop: { runs: [] }, thread: { events: [] } },
  right: { approvals: [] },
  harnessGaps: [],
  warnings: [],
};

export function App(): ReactElement {
  const [, setAppStatus] = useState<AppStatus | null>(null);
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamPacket | null>(null);
  const [tab, setTab] = useState<"thread" | "loop">("thread");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [actionRunning, setActionRunning] = useState<string | null>(null);

  async function loadApp(): Promise<void> {
    const status = await fetchJson<AppStatus>("/api/app/status");
    setAppStatus(status);
    const list = await fetchJson<{ projects: ProjectStatus[] }>("/api/projects");
    setProjects(list.projects);
    const directProject = status.directProjectId;
    if (directProject) {
      setSelectedProjectId(directProject);
      const directStatus = list.projects.find((item) => item.project?.id === directProject);
      if (directStatus?.managed) await refresh(directProject, null);
      else setSnapshot(snapshotForProject(directStatus));
    }
  }

  async function refresh(projectId = selectedProjectId, topic = selectedTopic): Promise<void> {
    if (!projectId) {
      const list = await fetchJson<{ projects: ProjectStatus[] }>("/api/projects");
      setProjects(list.projects);
      return;
    }
    const list = await fetchJson<{ projects: ProjectStatus[] }>("/api/projects");
    setProjects(list.projects);
    const status = list.projects.find((item) => item.project?.id === projectId);
    if (!status?.managed) {
      setSnapshot(snapshotForProject(status));
      setStream(null);
      return;
    }
    const query = topic ? `?topic=${encodeURIComponent(topic)}` : "";
    const next = await fetchJson<Snapshot>(`/api/projects/${encodeURIComponent(projectId)}/workbench/snapshot${query}`);
    setSnapshot(next);
    const runId = selectedRun ?? next.center.agentLoop.runs[0]?.id ?? null;
    setSelectedRun(runId);
    if (runId) setStream(await fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(projectId)}/workbench/stream/${encodeURIComponent(runId)}`));
  }

  useEffect(() => {
    loadApp().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  async function openProject(projectId: string): Promise<void> {
    setSelectedProjectId(projectId);
    setSelectedTopic(null);
    setSelectedRun(null);
    setStream(null);
    await refresh(projectId, null);
  }

  async function chooseTopic(topicId: string): Promise<void> {
    setSelectedTopic(topicId);
    await refresh(selectedProjectId, topicId);
  }

  async function chooseRun(runId: string): Promise<void> {
    if (!selectedProjectId) return;
    setSelectedRun(runId);
    setStream(await fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/stream/${encodeURIComponent(runId)}`));
  }

  async function executeApproval(approval: Approval): Promise<void> {
    if (!approval.action || !selectedProjectId) return;
    const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: approval.action, confirm: true }),
    });
    if (!result.ok) throw new Error(await result.text());
    setConfirming(null);
    await refresh();
  }

  async function createTopicFromComposer(): Promise<void> {
    if (!selectedProjectId || !composerText.trim()) return;
    setActionRunning("topic.create");
    try {
      const title = composerText.trim().split(/\r?\n/)[0].slice(0, 60);
      const result = await postJson<{ topic: { changeId: string } }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/topics`, {
        title,
        body: composerText.trim(),
        confirm: true,
      });
      setComposerText("");
      setSelectedTopic(result.topic.changeId);
      await refresh(selectedProjectId, result.topic.changeId);
    } finally {
      setActionRunning(null);
    }
  }

  async function sendTopicMessage(): Promise<void> {
    if (!selectedProjectId || !activeTopic || !composerText.trim()) return;
    setActionRunning("chat.ask");
    try {
      await postJson(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/topics/${encodeURIComponent(activeTopic.id)}/messages`, { text: composerText.trim() });
      setComposerText("");
      await refresh(selectedProjectId, activeTopic.id);
    } finally {
      setActionRunning(null);
    }
  }

  async function runWorkflowAction(actionType: string, options: Record<string, unknown> = {}): Promise<void> {
    if (!selectedProjectId || !activeTopic) return;
    setActionRunning(actionType);
    try {
      await postJson(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
        actionType,
        changeId: activeTopic.id,
        confirm: true,
        prompt: composerText.trim() || undefined,
        ...options,
      });
      if (composerText.trim()) setComposerText("");
      await refresh(selectedProjectId, activeTopic.id);
    } finally {
      setActionRunning(null);
    }
  }

  const activeTopic = snapshot.center.selectedTopic;
  const activeRun = useMemo(() => snapshot.center.agentLoop.runs.find((run) => run.id === selectedRun) ?? snapshot.center.agentLoop.runs[0], [snapshot, selectedRun]);
  const selectedProjectStatus = useMemo(() => projects.find((item) => item.project?.id === selectedProjectId) ?? null, [projects, selectedProjectId]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">Agent Harness<br />Orchestrator</div>
          <button className="icon-button" aria-label="刷新项目" onClick={() => void loadApp()}><RefreshCw size={14} /></button>
        </div>
        <section className="nav-section">
          <div className="section-label">项目</div>
          <div className="project-select"><Folder size={16} />{selectedProjectStatus?.project?.name ?? "未选择项目"}</div>
          <ProjectSidebar projects={projects} selectedProjectId={selectedProjectId} onOpen={openProject} onRefresh={loadApp} />
        </section>
        <nav className="nav-list">
          <button className="nav-item active"><FileText size={17} />主题</button>
          <button className="nav-item"><GitBranch size={17} />仓库</button>
          <button className="nav-item"><MemoryStick size={17} />记忆</button>
          <button className="nav-item"><Settings size={17} />设置</button>
        </nav>
        <section className="topic-list">
          <div className="section-label">主题</div>
          {!selectedProjectId ? <div className="empty-state sidebar-empty">先在项目区添加或选择项目。</div> : null}
          {selectedProjectId && !selectedProjectStatus?.managed ? <div className="empty-state sidebar-empty">初始化 Harness 后显示主题。</div> : null}
          {snapshot.left.topics.map((topic) => (
            <button key={topic.id} className={`topic-row ${activeTopic?.id === topic.id ? "selected" : ""}`} onClick={() => void chooseTopic(topic.id)}>
              <span>{topic.title}</span>
              <small>{stateLabel(topic.state)}</small>
            </button>
          ))}
        </section>
      </aside>

      <main className="workspace">
        {!selectedProjectId ? (
          <EmptyWorkbench title="选择一个项目开始" description="从左侧添加已有项目或新建空仓库。AHO 会把项目、记忆、主题和确认动作组织在这个工作台里。" />
        ) : !selectedProjectStatus?.managed ? (
          <UnmanagedProjectView project={selectedProjectStatus} onDone={() => loadApp().then(() => selectedProjectId ? refresh(selectedProjectId, null) : undefined)} />
        ) : !activeTopic ? (
          <TopicEmptyView
            snapshot={snapshot}
            composerText={composerText}
            setComposerText={setComposerText}
            onCreate={createTopicFromComposer}
            busy={actionRunning !== null}
          />
        ) : (
          <>
            <header className="topic-header">
              <div className="breadcrumb">{snapshot.project?.name ?? "project"} / 主题 / {activeTopic.title}</div>
              <div className="title-row">
                <div>
                  <h1>{activeTopic.title}</h1>
                  <p>变更 ID：{activeTopic.id} · AC {activeTopic.acCount ?? 0} · Tasks {activeTopic.taskCount ?? 0}</p>
                </div>
                <div className="topic-actions">
                  <button className="secondary-button" onClick={() => void refresh()}><Settings size={15} />状态</button>
                  <button className="secondary-button"><MoreVertical size={15} />更多</button>
                </div>
              </div>
            </header>

            <div className="tabs">
              <button className={tab === "thread" ? "active" : ""} onClick={() => setTab("thread")}>线程</button>
              <button className={tab === "loop" ? "active" : ""} onClick={() => setTab("loop")}>Agent 循环</button>
            </div>

            <section className="center-grid">
              <div className="timeline-panel">
                {tab === "thread" ? (
                  <>
                    <ThreadView events={snapshot.center.thread.events} />
                    <TopicComposer
                      value={composerText}
                      onChange={setComposerText}
                      busy={actionRunning !== null}
                      onSend={sendTopicMessage}
                      onPlan={() => runWorkflowAction("change.spec.propose")}
                      onPlanNext={() => runWorkflowAction("change.plan.propose")}
                      onCode={() => runWorkflowAction("code.run")}
                      onValidate={() => runWorkflowAction("validate.run")}
                      onAudit={() => runWorkflowAction("audit.run")}
                    />
                  </>
                ) : (
                  <RunList runs={snapshot.center.agentLoop.runs} selectedRun={activeRun?.id} onSelect={chooseRun} />
                )}
              </div>
              <div className="replay-panel">
                <RunReplay stream={stream} run={activeRun} />
              </div>
            </section>
          </>
        )}
      </main>

      <aside className="approval-pane">
        <div className="approval-header">
          <h2>确认队列</h2>
          <span>{snapshot.right.approvals.length}</span>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <div className="approval-list">
          {snapshot.right.approvals.length === 0 ? (
            <div className="approval-empty">
              <h3>暂无待确认动作</h3>
              <p>当审查、Worktree 应用或关闭变更需要你确认时，会显示在这里。</p>
            </div>
          ) : null}
          {snapshot.right.approvals.map((approval) => (
            <article key={approval.id} className="approval-card">
              <div className="approval-meta">
                <span>{approvalKind(approval.kind)}</span>
                <small>{approval.severity}</small>
              </div>
              <h3>{approval.label}</h3>
              <p>{approval.reason ?? "等待你确认后推进下一步。"}</p>
              <dl className="approval-fields">
                <div><dt>动作</dt><dd>{approval.action?.actionId ?? approval.kind}</dd></div>
                <div><dt>变更</dt><dd>{approval.changeId ?? activeTopic?.title ?? "-"}</dd></div>
                <div><dt>状态</dt><dd>{approval.severity}</dd></div>
              </dl>
              <div className="approval-actions">
                {confirming === approval.id ? (
                  <>
                    <button className="primary-button" onClick={() => void executeApproval(approval)}><Check size={15} />确认执行</button>
                    <button className="outline-button" onClick={() => setConfirming(null)}><X size={15} />取消</button>
                  </>
                ) : (
                  <>
                    <button className="primary-button" onClick={() => setConfirming(approval.id)}><Check size={15} />确认</button>
                    <button className="outline-button"><X size={15} />拒绝</button>
                    <button className="outline-button"><Clock3 size={15} />稍后</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </aside>

      <BottomStatusBar snapshot={snapshot} project={selectedProjectStatus} topic={activeTopic} />
    </div>
  );
}

function ProjectSidebar({ projects, selectedProjectId, onRefresh, onOpen }: { projects: ProjectStatus[]; selectedProjectId: string | null; onRefresh: () => Promise<void>; onOpen: (projectId: string) => Promise<void> }): ReactElement {
  const [mode, setMode] = useState<"list" | "add" | "new">("list");
  async function afterProjectAdded(projectId?: string): Promise<void> {
    await onRefresh();
    if (projectId) await onOpen(projectId);
    setMode("list");
  }
  return (
    <div className="project-sidebar">
      <div className="project-actions">
        <button className="small-action primary" onClick={() => setMode(mode === "add" ? "list" : "add")}><Plus size={14} />添加</button>
        <button className="small-action" onClick={() => setMode(mode === "new" ? "list" : "new")}>新建</button>
      </div>
      {mode === "add" ? <div className="project-inline-panel"><ProjectAddForm onDone={afterProjectAdded} /></div> : null}
      {mode === "new" ? <div className="project-inline-panel"><ProjectCreateForm onDone={afterProjectAdded} /></div> : null}
      <div className="project-rows">
        {projects.length === 0 ? <div className="empty-state sidebar-empty">还没有注册项目。</div> : null}
        {projects.map((item) => (
          <button key={item.project?.id ?? item.path} className={`project-row ${item.project?.id === selectedProjectId ? "selected" : ""}`} onClick={() => item.project ? void onOpen(item.project.id) : undefined}>
            <span>{item.project?.name ?? item.path}</span>
            <small>{item.managed ? "Harness 就绪" : "未初始化"}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectAddForm({ onDone }: { onDone: (projectId?: string) => Promise<void> }): ReactElement {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [manual, setManual] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(selectedPath = path): Promise<void> {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedPath, name: name || undefined, confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { project: { id: string } };
    setMessage("项目已添加。");
    await onDone(result.project.id);
  }
  async function chooseFolder(): Promise<void> {
    setMessage(null);
    const result = await postJson<FolderDialogResult>("/api/dialog/open-folder", {});
    if (result.path) {
      setPath(result.path);
      await submit(result.path);
      return;
    }
    if (result.supported === false) {
      setManual(true);
      setMessage("当前系统无法打开文件夹选择器，请手动输入路径。");
      return;
    }
    if (result.canceled) {
      setMessage("已取消选择。");
      return;
    }
    setManual(true);
    setMessage(result.error ?? "无法打开文件夹选择器，请手动输入路径。");
  }
  return (
    <form className="project-form" onSubmit={(event) => { event.preventDefault(); void submit().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause))); }}>
      <button type="button" className="primary-button" onClick={() => void chooseFolder().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}><Folder size={15} />选择文件夹添加</button>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="显示名称，可选" />
      <button type="button" className="text-button" onClick={() => setManual(!manual)}>{manual ? "收起手动路径" : "手动输入路径"}</button>
      {manual ? (
        <>
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="本地项目路径，例如 E:\\work\\my-app" />
          <button className="outline-button"><Plus size={15} />添加这个路径</button>
        </>
      ) : null}
      {message ? <small>{message}</small> : null}
    </form>
  );
}

function ProjectCreateForm({ onDone }: { onDone: (projectId?: string) => Promise<void> }): ReactElement {
  const [parentPath, setParentPath] = useState("");
  const [name, setName] = useState("");
  const [git, setGit] = useState(true);
  const [readme, setReadme] = useState(true);
  const [initialCommit, setInitialCommit] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(): Promise<void> {
    const response = await fetch("/api/projects/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentPath, name, git, readme, initialCommit, confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { project: { id: string } };
    setMessage("新项目已创建并注册。");
    await onDone(result.project.id);
  }
  async function chooseParent(): Promise<void> {
    setMessage(null);
    const result = await postJson<FolderDialogResult>("/api/dialog/open-folder", {});
    if (result.path) {
      setParentPath(result.path);
      return;
    }
    if (result.supported === false) {
      setMessage("当前系统无法打开文件夹选择器，请手动输入父目录。");
      return;
    }
    if (result.canceled) {
      setMessage("已取消选择。");
      return;
    }
    setMessage(result.error ?? "无法打开文件夹选择器，请手动输入父目录。");
  }
  return (
    <form className="project-form" onSubmit={(event) => { event.preventDefault(); void submit().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause))); }}>
      <button type="button" className="outline-button" onClick={() => void chooseParent().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}><Folder size={15} />选择父目录</button>
      <input value={parentPath} onChange={(event) => setParentPath(event.target.value)} placeholder="父目录路径，例如 E:\\work" />
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="项目目录名" />
      <label><input type="checkbox" checked={git} onChange={(event) => setGit(event.target.checked)} /> 初始化 Git</label>
      <label><input type="checkbox" checked={readme} onChange={(event) => setReadme(event.target.checked)} /> 创建 README</label>
      <label><input type="checkbox" checked={initialCommit} onChange={(event) => setInitialCommit(event.target.checked)} /> 创建初始提交</label>
      <button className="primary-button"><Plus size={15} />新建项目</button>
      {message ? <small>{message}</small> : null}
    </form>
  );
}

function UnmanagedProjectView({ project, onDone }: { project: ProjectStatus | null; onDone: () => Promise<void> }): ReactElement {
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

function TopicEmptyView({
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
      <div className="breadcrumb">{snapshot.project?.name ?? "project"} / 主题</div>
      <div className="topic-empty-content">
        <p className="eyebrow">本地工作台</p>
        <h1>暂无主题</h1>
        <p>输入一个需求或问题来创建第一个 Topic。AHO 会先进入计划模式，而不是直接写代码。</p>
        <div className="empty-composer">
          <textarea value={composerText} onChange={(event) => setComposerText(event.target.value)} placeholder="例如：帮我新增会员满 100 元 9 折，并补测试。" />
          <button className="primary-button" disabled={busy || !composerText.trim()} onClick={() => void onCreate()}>创建 Topic</button>
        </div>
      </div>
    </section>
  );
}

function EmptyWorkbench({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <section className="empty-workbench">
      <p className="eyebrow">本地工作台</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function BottomStatusBar({ snapshot, project, topic }: { snapshot: Snapshot; project: ProjectStatus | null; topic: TopicDetail | null }): ReactElement {
  const repoPath = snapshot.left.repo?.path ?? project?.path ?? "-";
  const issueCount = snapshot.warnings.length + (topic?.closeGate?.blockingIssues.length ?? 0);
  return (
    <footer className="bottom-status">
      <span>记忆：{snapshot.memory.memoryMode ?? (project?.project ? "unknown" : "未选择")}</span>
      <span>根目录：{repoPath}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />状态：{snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>当前变更：{topic?.title ?? "无"}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />Harness {snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>{issueCount} 个问题</span>
    </footer>
  );
}

function HarnessInitButton({ projectId, onDone }: { projectId: string; onDone: () => Promise<void> }): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  async function init(): Promise<void> {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/harness/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryMode: "external-local", confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    setMessage("Harness 已初始化。");
    await onDone();
  }
  return (
    <>
      <button className="secondary-button" onClick={() => void init().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}>初始化 Harness</button>
      {message ? <small>{message}</small> : null}
    </>
  );
}

function ThreadView({ events }: { events: ThreadEvent[] }): ReactElement {
  if (events.length === 0) return <div className="empty-state">暂无线程事件。</div>;
  return (
    <div className="timeline">
      {events.slice(0, 10).map((event) => (
        <div className={`timeline-item ${eventTone(event)}`} key={event.id}>
          <div className="timeline-icon">{eventIcon(event)}</div>
          <div>
            <strong>{eventLabel(event)}</strong>
            <p>{event.label} {event.status ? `· ${event.status}` : ""}</p>
          </div>
          <time>{formatTime(event.timestamp)}</time>
        </div>
      ))}
    </div>
  );
}

function TopicComposer({
  value,
  onChange,
  busy,
  onSend,
  onPlan,
  onPlanNext,
  onCode,
  onValidate,
  onAudit,
}: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  onSend: () => Promise<void>;
  onPlan: () => void;
  onPlanNext: () => void;
  onCode: () => void;
  onValidate: () => void;
  onAudit: () => void;
}): ReactElement {
  return (
    <div className="topic-composer">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="继续提问、补充需求，或让 AI 整理成 Spec / Plan。普通对话默认只读。"
      />
      <div className="composer-actions">
        <button className="primary-button" disabled={busy || !value.trim()} onClick={() => void onSend()}>发送对话</button>
        <button className="outline-button" disabled={busy} onClick={onPlan}>生成 Spec</button>
        <button className="outline-button" disabled={busy} onClick={onPlanNext}>生成计划</button>
        <button className="outline-button" disabled={busy} onClick={onCode}>运行 Coder</button>
        <button className="outline-button" disabled={busy} onClick={onValidate}>验证</button>
        <button className="outline-button" disabled={busy} onClick={onAudit}>审查</button>
      </div>
    </div>
  );
}

function RunList({ runs, selectedRun, onSelect }: { runs: RunSummary[]; selectedRun?: string; onSelect: (runId: string) => Promise<void> }): ReactElement {
  if (runs.length === 0) return <div className="empty-state">暂无运行记录。</div>;
  return (
    <div className="run-list">
      {runs.map((run) => (
        <button className={`run-row ${run.id === selectedRun ? "selected" : ""}`} key={run.id} onClick={() => void onSelect(run.id)}>
          <Code2 size={16} />
          <span>{run.runtime}</span>
          <small>{run.status}</small>
        </button>
      ))}
    </div>
  );
}

function RunReplay({ stream, run }: { stream: StreamPacket | null; run?: RunSummary }): ReactElement {
  if (!run) return <div className="dark-panel empty-dark">选择一个 Run 查看回放。</div>;
  return (
    <div className="dark-panel">
      <div className="replay-header">
        <div><span>运行回放</span><small>{run.id}</small></div>
        <em>{run.status}</em>
      </div>
      <div className="event-table">
        {(stream?.events ?? []).length === 0 ? <div className="event-row muted-row"><span>-</span><span>暂无事件</span><small>等待 run artifact</small></div> : null}
        {(stream?.events ?? []).slice(0, 9).map((event) => (
          <div className="event-row" key={event.id}>
            <time>{formatTime(event.timestamp)}</time>
            <span>{event.type}</span>
            <small>{event.label}</small>
          </div>
        ))}
      </div>
      <pre className="code-preview">{artifactPreview(stream, "diff") ?? artifactPreview(stream, "stdout") ?? "暂无 artifact preview"}</pre>
      <div className="artifact-grid">
        {(stream?.artifacts ?? []).filter((item) => ["events", "stdout", "lastMessage", "diff"].includes(item.key)).map((artifact) => (
          <div className="artifact-chip" key={artifact.key}>
            <FileText size={15} />
            <span>{artifact.path.split("/").at(-1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function snapshotForProject(project: ProjectStatus | null | undefined): Snapshot {
  if (!project?.project) return emptySnapshot;
  return {
    ...emptySnapshot,
    project: project.project,
    memory: { harnessReady: project.managed },
    warnings: project.managed ? [] : ["Project is not managed by Harness yet."],
  };
}

function formatTime(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function stateLabel(state: string): string {
  if (state === "active") return "进行中";
  if (state === "archive") return "已归档";
  if (state === "parking") return "暂停";
  return state;
}

function eventLabel(event: ThreadEvent): string {
  if (event.type === "user.message") return "用户消息";
  if (event.type === "assistant.message") return "AI 回复";
  if (event.type === "workflow.started") return "动作开始";
  if (event.type === "workflow.completed") return "动作完成";
  if (event.type === "workflow.failed") return "动作失败";
  if (event.type.includes("spec-test") || event.type.includes("drift")) return "Spec-Test 漂移正常";
  if (event.type.includes("validation")) return "验证通过";
  if (event.type.includes("audit")) return "审查通过";
  if (event.type.includes("worktree") || event.type.includes("apply")) return "Worktree 准备应用";
  if (event.type.includes("plan")) return "计划已确认";
  if (event.type.includes("spec")) return "Spec 已确认";
  if (event.type.includes("context")) return "准备上下文";
  if (event.type.includes("process.started")) return "命令启动";
  if (event.type.includes("process.exited")) return "命令退出";
  if (event.type.includes("run.completed")) return "运行完成";
  if (event.type.includes("run.failed")) return "运行失败";
  if (event.type.includes("run")) return "Coder 运行";
  if (event.type.includes("change")) return "需求意图";
  return event.label;
}

function eventTone(event: ThreadEvent): string {
  if (event.status === "failed" || event.type.includes("failed") || event.type.includes("blocked")) return "danger";
  if (event.type.includes("apply") || event.type.includes("worktree")) return "action";
  if (event.type.includes("plan") || event.type.includes("spec")) return "coral";
  return "success";
}

function eventIcon(event: ThreadEvent): ReactElement {
  if (event.type.includes("change")) return <UserRound size={16} />;
  if (event.type.includes("context")) return <FileText size={16} />;
  if (event.type.includes("process")) return <Code2 size={16} />;
  if (event.type.includes("plan") || event.type.includes("spec")) return <FileText size={16} />;
  if (event.type.includes("run")) return <Code2 size={16} />;
  if (event.type.includes("apply") || event.type.includes("worktree")) return <Upload size={16} />;
  if (event.type.includes("audit")) return <ShieldCheck size={16} />;
  return <CircleCheck size={16} />;
}

function approvalKind(kind: string): string {
  if (kind.includes("audit")) return "审查";
  if (kind.includes("apply")) return "应用";
  if (kind.includes("close")) return "关闭";
  if (kind.includes("spec")) return "Spec";
  if (kind.includes("plan")) return "计划";
  return "确认";
}

function artifactPreview(stream: StreamPacket | null, key: string): string | null {
  const artifact = stream?.artifacts.find((item) => item.key === key);
  return artifact?.preview ?? artifact?.tail ?? null;
}
