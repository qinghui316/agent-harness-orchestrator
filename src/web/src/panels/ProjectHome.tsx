import { useEffect, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FolderOpen,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { fetchJson, postJson } from "../api.js";
import { ComposerControls } from "../shell/ComposerControls.js";
import { FileMentionPicker } from "../shell/FileMentionPicker.js";
import { SkillMentionPicker } from "../shell/SkillMentionPicker.js";
import type { ComposerExecutionMode } from "../shell/composer-session.js";
import { WorkspacePicker } from "./WorkspacePicker.js";
import {
  CodexTrustButton,
  InfoRow,
  ProjectAddForm,
  ProjectCreateForm,
} from "./ProjectPanels.js";
import type { CodexDiagnostics, ProjectStatus, SkillListItem, SkillRootListItem, Snapshot, TopicFileReference } from "../types.js";

export function ProjectHomeView({
  projects,
  snapshots,
  onOpenProject,
  onRefresh,
}: {
  projects: ProjectStatus[];
  snapshots: Record<string, Snapshot>;
  onOpenProject: (projectId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const [homeMode, setHomeMode] = useState<"closed" | "add" | "new">("closed");

  async function afterProjectAdded(projectId?: string): Promise<void> {
    await onRefresh();
    if (projectId) await onOpenProject(projectId);
    setHomeMode("closed");
  }

  return (
    <section className="project-home">
      <div className="project-home-hero">
        <p className="eyebrow">Harness 模式</p>
        <h1>选择项目开始</h1>
        <p>打开本地项目，确认 Harness 和 Codex 状态，然后进入专业开发闭环。</p>
        <div className="project-home-actions">
          <button className="primary-button" onClick={() => setHomeMode(homeMode === "add" ? "closed" : "add")}><FolderOpen size={15} />添加已有项目</button>
          <button className="outline-button" onClick={() => setHomeMode(homeMode === "new" ? "closed" : "new")}>新建项目</button>
        </div>
      </div>

      {homeMode === "add" ? <ProjectAddForm onDone={afterProjectAdded} /> : null}
      {homeMode === "new" ? <ProjectCreateForm onDone={afterProjectAdded} /> : null}

      <div className="project-home-list" aria-label="已注册项目">
        {projects.length === 0 ? (
          <div className="project-home-empty">还没有注册项目。先添加已有文件夹，或新建一个本地 Git 项目。</div>
        ) : projects.map((project) => {
          const projectId = project.project?.id;
          const name = project.project?.name ?? project.path;
          const snapshot = projectId ? snapshots[projectId] : undefined;
          const readiness = projectReadiness(project, snapshot);
          return (
            <button
              key={projectId ?? project.path}
              className="project-home-row"
              disabled={!projectId}
              onClick={() => projectId ? void onOpenProject(projectId) : undefined}
            >
              <span className={`project-home-status-dot ${readiness.tone}`} />
              <span className="project-home-row-main">
                <strong>{name}</strong>
                <small>{project.path}</small>
              </span>
              <span className="project-home-row-meta">{readiness.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectReadinessHome({
  project,
  snapshot,
  automationMode,
  modelLabel,
  projects,
  selectedProjectId,
  onCreateDemand,
  onAutomationModeChange,
  enabledSkillCount,
  skills,
  activeSkillIds,
  onToggleSkill,
  onOpenSkillsSettings,
  onOpenProject,
  onRefresh,
}: {
  project: ProjectStatus;
  snapshot: Snapshot;
  automationMode: ComposerExecutionMode;
  modelLabel: string;
  projects: ProjectStatus[];
  selectedProjectId: string | null;
  onCreateDemand: (body: string, fileRefs?: TopicFileReference[]) => Promise<void>;
  onAutomationModeChange: (mode: ComposerExecutionMode) => void;
  enabledSkillCount?: number;
  skills?: SkillListItem[];
  activeSkillIds?: string[];
  onToggleSkill?: (skillId: string) => void | Promise<void>;
  onOpenSkillsSettings?: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const readiness = projectReadiness(project, snapshot);
  const [draft, setDraft] = useState("");
  const [draftFileRefs, setDraftFileRefs] = useState<TopicFileReference[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const memoryReady = snapshot.memory.harnessReady ?? project.memory?.harnessReady ?? project.harness.readiness === "ready";

  async function submitDemand(): Promise<void> {
    const body = draft.trim();
    if (!body || !memoryReady) return;
    setSubmitting(true);
    try {
      await onCreateDemand(body, draftFileRefs);
      setDraft("");
      setDraftFileRefs([]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="home-chat-surface" aria-label="项目对话首页">
      <div className="home-chat-center">
        <div className="home-chat-mark" aria-label="Codex">
          <Bot size={50} />
        </div>
        <h1>创造任何东西</h1>
        <WorkspacePicker
          projects={projects}
          selectedProjectId={selectedProjectId}
          onOpenProject={onOpenProject}
          onRefresh={onRefresh}
        />

        <section className="home-demand-composer" aria-label="新建需求对话">
          <ComposerControls
            modelLabel={modelLabel}
            mode={automationMode}
            onModeChange={onAutomationModeChange}
            enabledSkillCount={enabledSkillCount}
            onOpenSkillsSettings={onOpenSkillsSettings}
          />
          <SkillMentionPicker
            value={draft}
            onChange={setDraft}
            skills={skills ?? []}
            activeSkillIds={activeSkillIds ?? []}
            onToggleSkill={onToggleSkill ?? (() => undefined)}
          />
          <FileMentionPicker
            projectId={project.project?.id ?? null}
            value={draft}
            onChange={setDraft}
            selectedRefs={draftFileRefs}
            onSelectedRefsChange={setDraftFileRefs}
          />
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitDemand();
              }
            }}
            disabled={!memoryReady || submitting}
            placeholder={memoryReady ? "描述你的需求；Enter 发送，Shift+Enter 换行" : readiness.label}
            aria-label="新建需求输入框"
          />
          <div className="home-demand-composer-footer">
            <span className="composer-footer-spacer" />
            <button
              className="composer-send"
              disabled={!memoryReady || submitting || !draft.trim()}
              onClick={() => void submitDemand()}
              title="创建需求对话"
            >
              <Send size={16} />
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

export function CodexDiagnosticsCard({ diagnostics, project }: { diagnostics: CodexDiagnostics | null; project?: ProjectStatus | null }): ReactElement {
  if (!diagnostics) {
    return (
      <section className="project-status-panel codex-diagnostics-card">
        <h2>Codex 诊断</h2>
        <p className="muted-copy">正在读取 Codex 状态。</p>
      </section>
    );
  }
  const ok = diagnostics.available && diagnostics.errors.length === 0;
  const trust = diagnostics.projectTrust ?? project?.codexTrust;
  return (
    <section className={`project-status-panel codex-diagnostics-card ${ok ? "is-ready" : "has-warning"}`}>
      <div className="panel-title-row">
        <h2>Codex 诊断</h2>
        {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </div>
      <InfoRow label="CLI" value={diagnostics.available ? "可用" : "不可用"} />
      <InfoRow label="版本" value={diagnostics.version ?? "未知"} />
      <InfoRow label="config.toml" value={diagnostics.configPath} />
      <InfoRow label="项目信任" value={trust?.trusted ? "已信任" : trust?.reason ?? "未检测"} />
      <div className="capability-row" aria-label="Codex 能力">
        <CapabilityPill ok={diagnostics.capabilities.supportsJson} label="json" />
        <CapabilityPill ok={diagnostics.capabilities.supportsSandbox} label="sandbox" />
        <CapabilityPill ok={diagnostics.capabilities.supportsCd} label="cwd" />
        <CapabilityPill ok={diagnostics.capabilities.supportsSafeResume} label="resume" />
      </div>
      {diagnostics.errors.length > 0 ? (
        <ul className="diagnostic-errors">
          {diagnostics.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : <p className="muted-copy">Codex runtime 满足当前 Harness 模式的本地执行要求。</p>}
    </section>
  );
}

export function SettingsPanel({
  open,
  project,
  diagnostics,
  onClose,
  onRefresh,
}: {
  open: boolean;
  project: ProjectStatus | null;
  diagnostics: CodexDiagnostics | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}): ReactElement | null {
  if (!open) return null;
  return (
    <div className="settings-overlay" role="dialog" aria-label="设置">
      <aside className="settings-panel">
        <header className="settings-panel-header">
          <div>
            <p className="eyebrow">设置</p>
            <h2>Harness / Codex</h2>
          </div>
          <button className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={16} /></button>
        </header>
        <p className="muted-copy">这里用于查看当前项目状态；普通需求从首页输入框开始。</p>
        {project ? (
          <section className="project-status-panel">
            <h2>当前项目</h2>
            <InfoRow label="路径" value={project.path} />
            <InfoRow label="Harness" value={project.harness.readiness} />
            <InfoRow label="记忆" value={project.memory?.memoryMode ?? "未知"} />
          </section>
        ) : (
          <section className="project-status-panel">
            <h2>当前项目</h2>
            <p className="muted-copy">还没有选择项目。</p>
          </section>
        )}
        {project?.project ? <SkillsPanel projectId={project.project.id} onRefresh={onRefresh} /> : null}
        <details className="settings-advanced">
          <summary>Codex 高级诊断</summary>
          {project && !project.codexTrust?.trusted ? <CodexTrustButton project={project} onDone={() => void onRefresh()} /> : null}
          <CodexDiagnosticsCard diagnostics={diagnostics} project={project} />
        </details>
      </aside>
    </div>
  );
}

function SkillsPanel({ projectId, onRefresh }: { projectId: string; onRefresh: () => Promise<void> }): ReactElement {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [roots, setRoots] = useState<SkillRootListItem[]>([]);
  const [rootPath, setRootPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load(): Promise<void> {
    const payload = await fetchJson<{ roots?: SkillRootListItem[]; skills?: SkillListItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/skills`);
    setRoots(Array.isArray(payload.roots) ? payload.roots : []);
    setSkills(Array.isArray(payload.skills) ? payload.skills : []);
  }

  useEffect(() => {
    load().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)));
  }, [projectId]);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const enabledCount = skills.filter((skill) => skill.enabledProject || skill.enabledTopics.length > 0).length;

  return (
    <section className="project-status-panel skills-settings-panel" aria-label="技能设置">
      <div className="panel-title-row">
        <h2>技能</h2>
        <span className="composer-pill subtle">{enabledCount} 已启用</span>
      </div>
      <p className="muted-copy">技能会同步给 Codex runtime 使用；它不是 Harness 工作流权限。</p>
      <div className="skill-root-form">
        <input
          value={rootPath}
          onChange={(event) => setRootPath(event.target.value)}
          placeholder="添加本机 Skill 根目录"
          aria-label="Skill 根目录"
        />
        <button
          className="outline-button"
          disabled={busy || !rootPath.trim()}
          onClick={() => run(async () => {
            await postJson(`/api/projects/${encodeURIComponent(projectId)}/skill-roots`, { rootPath: rootPath.trim(), sourceKind: "custom" });
            setRootPath("");
          })}
        >添加</button>
        <button className="outline-button" disabled={busy} onClick={() => run(async () => { await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills`, {}); })}>刷新</button>
        <button className="outline-button" disabled={busy} onClick={() => run(async () => { await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills/codex-bridge/sync`, {}); })}>同步 Codex</button>
      </div>
      {roots.length > 0 ? (
        <div className="skill-root-list" aria-label="已登记 Skill 根目录">
          {roots.map((root) => <span key={root.rootPath} title={root.rootPath}>{root.sourceKind}: {root.rootPath}</span>)}
        </div>
      ) : null}
      <div className="skill-list">
        {skills.length === 0 ? <p className="muted-copy">还没有扫描到 Skill。添加包含 SKILL.md 的根目录后刷新。</p> : skills.map((skill) => {
          const target = skill.runtimeTargets.find((item) => item.provider === "codex");
          return (
            <div className="skill-row" key={skill.skillId}>
              <div className="skill-row-main">
                <strong><Sparkles size={14} />{skill.name}</strong>
                <small>{skill.description || "无描述"}</small>
                <small title={skill.sourcePath}>{skill.sourceKind} · {skill.sourcePath}</small>
              </div>
              <div className="skill-row-actions">
                <span className={`skill-sync-state ${target?.status ?? "not-synced"}`}>{target?.status ?? "not-synced"}</span>
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(skill.skillId)}/enable`, { enabled: !skill.enabledProject });
                  })}
                >{skill.enabledProject ? "禁用" : "启用"}</button>
              </div>
            </div>
          );
        })}
      </div>
      {message ? <p className="diagnostic-errors">{message}</p> : null}
    </section>
  );
}

function CapabilityPill({ ok, label }: { ok: boolean; label: string }): ReactElement {
  return <span className={`capability-pill ${ok ? "ok" : "missing"}`}>{label}</span>;
}

function projectReadiness(project: ProjectStatus, snapshot?: Snapshot): { label: string; tone: "ready" | "warning" | "blocked" } {
  const pathReady = project.pathExists;
  const memoryReady = snapshot?.memory.harnessReady ?? project.memory?.harnessReady ?? project.harness.readiness === "ready";
  if (!pathReady) return { label: "路径不可用", tone: "blocked" };
  if (!project.managed || !memoryReady) return { label: "需要初始化 Harness", tone: "warning" };
  if (!project.codexTrust?.trusted) return { label: "需要确认 Codex", tone: "warning" };
  return { label: "就绪", tone: "ready" };
}
