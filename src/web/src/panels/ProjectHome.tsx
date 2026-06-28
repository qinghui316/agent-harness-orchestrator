import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FolderOpen,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { ComposerControls } from "../shell/ComposerControls.js";
import { FileMentionPicker } from "../shell/FileMentionPicker.js";
import { SkillMentionPicker } from "../shell/SkillMentionPicker.js";
import type { ComposerExecutionMode } from "../shell/composer-session.js";
import { WorkspacePicker } from "./WorkspacePicker.js";
import {
  InfoRow,
  ProjectAddForm,
  ProjectCreateForm,
} from "./ProjectPanels.js";
import type { CodexDiagnostics, CodexModelCandidate, CodexModelSettingsSnapshot, ProjectStatus, SkillListItem, Snapshot, TopicFileReference } from "../types.js";

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
        <div className="home-chat-mark compact" aria-label="Codex">
          <Bot size={46} />
        </div>
        <h1>创造任何东西</h1>
        <p>选择一个本地项目开始。</p>
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
  onOpenModelSettings,
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
  resetToken,
}: {
  project: ProjectStatus;
  snapshot: Snapshot;
  automationMode: ComposerExecutionMode;
  modelLabel: string;
  onOpenModelSettings?: () => void;
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
  resetToken?: number;
}): ReactElement {
  const readiness = projectReadiness(project, snapshot);
  const [draft, setDraft] = useState("");
  const [draftFileRefs, setDraftFileRefs] = useState<TopicFileReference[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastResetToken = useRef(resetToken);
  const memoryReady = snapshot.memory.harnessReady ?? project.memory?.harnessReady ?? project.harness.readiness === "ready";

  useEffect(() => {
    if (resetToken === undefined) return;
    if (lastResetToken.current === resetToken) return;
    lastResetToken.current = resetToken;
    setDraft("");
    setDraftFileRefs([]);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [resetToken]);

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
            onOpenModelSettings={onOpenModelSettings}
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
            ref={textareaRef}
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
      <InfoRow label="模型" value={diagnostics.effectiveModel ?? diagnostics.currentModel ?? "默认模型"} />
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

export function CodexModelPicker({
  open,
  snapshot,
  busy,
  message,
  onClose,
  onRefresh,
  onSelect,
}: {
  open: boolean;
  snapshot: CodexModelSettingsSnapshot | null;
  busy?: boolean;
  message?: string | null;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onSelect: (model: string | null) => void | Promise<void>;
}): ReactElement | null {
  if (!open) return null;
  const candidates = snapshot?.candidates ?? [];
  const selectedModel = snapshot?.selectedModel ?? null;
  const effectiveModel = snapshot?.effectiveModel ?? null;
  return (
    <div className="settings-overlay model-picker-overlay" role="dialog" aria-label="选择 Codex 模型">
      <section className="model-picker-panel">
        <header className="settings-panel-header">
          <div>
            <p className="eyebrow">Codex</p>
            <h2>选择模型</h2>
          </div>
          <button className="icon-button" aria-label="关闭模型选择" onClick={onClose}><X size={16} /></button>
        </header>
        <p className="muted-copy">这里设置 AHO 调用 Codex 时使用的模型；不会修改 Codex config.toml。</p>
        <div className="model-picker-summary">
          <InfoRow label="当前模型" value={effectiveModel ?? "Codex 默认模型"} />
          <InfoRow label="来源" value={modelSourceLabel(snapshot?.effectiveModelSource)} />
          {snapshot?.modelList.degradedReason ? <p className="muted-copy">{snapshot.modelList.degradedReason}</p> : null}
        </div>
        <div className="model-picker-actions">
          <button className="outline-button" disabled={busy} onClick={() => void onRefresh()}><RefreshCw size={14} />刷新</button>
          <button className="outline-button" disabled={busy || !selectedModel} onClick={() => void onSelect(null)}>使用 Codex 配置</button>
        </div>
        <div className="model-candidate-list" aria-label="Codex 模型候选">
          {candidates.length === 0 ? <p className="muted-copy">没有读取到模型列表。将继续使用 Codex 配置或默认模型。</p> : candidates.map((candidate) => (
            <div className="model-candidate-row" key={`${candidate.source}:${candidate.id}`}>
              <div>
                <strong>{candidate.label ?? candidate.id}</strong>
                <small>{candidate.id} · {modelCandidateSourceLabel(candidate)}</small>
              </div>
              <div className="model-candidate-actions">
                {(candidate.model ?? candidate.id) === effectiveModel ? <span className="composer-pill subtle">当前</span> : null}
                <button className="primary-button" disabled={busy || (candidate.model ?? candidate.id) === selectedModel} onClick={() => void onSelect(candidate.id)}>选择</button>
              </div>
            </div>
          ))}
        </div>
        {message ? <p className="diagnostic-errors">{message}</p> : null}
      </section>
    </div>
  );
}

function CapabilityPill({ ok, label }: { ok: boolean; label: string }): ReactElement {
  return <span className={`capability-pill ${ok ? "ok" : "missing"}`}>{label}</span>;
}

function modelSourceLabel(source: CodexModelSettingsSnapshot["effectiveModelSource"] | undefined): string {
  if (source === "selected") return "用户选择";
  if (source === "config") return "Codex 配置";
  if (source === "codex-default") return "Codex 默认";
  return "未知";
}

function modelCandidateSourceLabel(candidate: CodexModelCandidate): string {
  if (candidate.source === "runtime") return candidate.isDefault ? "runtime 默认" : "runtime";
  if (candidate.source === "config") return "Codex 配置";
  return candidate.source;
}

function projectReadiness(project: ProjectStatus, snapshot?: Snapshot): { label: string; tone: "ready" | "warning" | "blocked" } {
  const pathReady = project.pathExists;
  const memoryReady = snapshot?.memory.harnessReady ?? project.memory?.harnessReady ?? project.harness.readiness === "ready";
  if (!pathReady) return { label: "路径不可用", tone: "blocked" };
  if (!project.managed || !memoryReady) return { label: "需要初始化 Harness", tone: "warning" };
  if (!project.codexTrust?.trusted) return { label: "需要确认 Codex", tone: "warning" };
  return { label: "就绪", tone: "ready" };
}
