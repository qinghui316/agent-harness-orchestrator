import { useState, type ReactElement } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  RefreshCw,
  X,
} from "lucide-react";
import {
  CodexTrustButton,
  HarnessInitButton,
  InfoRow,
  ProjectAddForm,
  ProjectCreateForm,
} from "./ProjectPanels.js";
import type { CodexDiagnostics, ProjectStatus, Snapshot, WorkpadSummary } from "../types.js";

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
          <button className="text-button" onClick={() => void onRefresh()}><RefreshCw size={15} />刷新</button>
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
  diagnostics,
  onNewConversation,
  onOpenWorkbench,
  onRefresh,
}: {
  project: ProjectStatus;
  snapshot: Snapshot;
  diagnostics: CodexDiagnostics | null;
  onNewConversation: () => Promise<void>;
  onOpenWorkbench: () => void;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const readiness = projectReadiness(project, snapshot);
  const recent = (snapshot.left.workpads ?? []).slice(0, 4);
  const memoryReady = snapshot.memory.harnessReady ?? project.memory?.harnessReady ?? project.harness.readiness === "ready";
  const hasWorkbenchTarget = recent.length > 0 || snapshot.left.topics.length > 0;

  return (
    <section className="project-readiness-home">
      <header className="project-readiness-header">
        <div>
          <p className="eyebrow">项目主页</p>
          <h1>{snapshot.project?.name ?? project.project?.name ?? "当前项目"}</h1>
          <p>{project.path}</p>
        </div>
        <div className="project-home-actions">
          <button className="primary-button" disabled={!memoryReady} onClick={() => void onNewConversation()}>新建需求</button>
          <button className="outline-button" disabled={!hasWorkbenchTarget} onClick={onOpenWorkbench}>进入 Workbench</button>
          <button className="text-button" onClick={() => void onRefresh()}><RefreshCw size={15} />刷新</button>
        </div>
      </header>

      <div className="project-readiness-grid">
        <section className="project-status-panel">
          <h2>项目状态</h2>
          <InfoRow label="Harness" value={readiness.label} />
          <InfoRow label="记忆" value={snapshot.memory.memoryMode ?? project.memory?.memoryMode ?? "未知"} />
          <InfoRow label="Git" value={projectGitLabel(project, snapshot)} />
          <InfoRow label="Codex 信任" value={project.codexTrust?.trusted ? "已信任" : "需要确认"} />
          {!memoryReady && project.project ? <HarnessInitButton projectId={project.project.id} onDone={onRefresh} /> : null}
          {!project.codexTrust?.trusted ? <CodexTrustButton project={project} onDone={() => void onRefresh()} /> : null}
        </section>

        <CodexDiagnosticsCard diagnostics={diagnostics} project={project} />

        <section className="project-status-panel recent-demand-panel">
          <h2>最近需求</h2>
          {recent.length === 0 ? <p className="muted-copy">还没有需求对话。新建需求后，计划、执行、验收和收尾会在这里恢复。</p> : null}
          {recent.map((item) => <RecentDemandRow key={item.id} item={item} />)}
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
        <p className="muted-copy">V1 只显示本地 Harness 和 Codex 诊断。Provider、Skills、主题和桌面打包设置后续单独实现。</p>
        <CodexDiagnosticsCard diagnostics={diagnostics} project={project} />
        {project ? (
          <section className="project-status-panel">
            <h2>当前项目</h2>
            <InfoRow label="路径" value={project.path} />
            <InfoRow label="Harness" value={project.harness.readiness} />
            <InfoRow label="记忆" value={project.memory?.memoryMode ?? "未知"} />
            {!project.codexTrust?.trusted ? <CodexTrustButton project={project} onDone={() => void onRefresh()} /> : null}
          </section>
        ) : (
          <section className="project-status-panel">
            <h2>当前项目</h2>
            <p className="muted-copy">还没有选择项目。</p>
          </section>
        )}
      </aside>
    </div>
  );
}

function RecentDemandRow({ item }: { item: WorkpadSummary }): ReactElement {
  return (
    <div className="recent-demand-row">
      <strong>{item.title}</strong>
      <small>{item.userStatusLabel ?? item.runtimeStatus}{item.waitingDecisionCount > 0 ? ` · ${item.waitingDecisionCount} 个待确认` : ""}</small>
    </div>
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

function projectGitLabel(project: ProjectStatus, snapshot: Snapshot): string {
  const branch = snapshot.left.repo?.branch ?? project.branch;
  const dirty = snapshot.left.repo?.dirty ?? project.dirty;
  if (!project.isGitRepo && !snapshot.left.repo?.git) return "未检测到 Git";
  return `${branch ? `${branch}` : "Git 仓库"}${dirty ? " · 有未提交改动" : " · clean"}`;
}
