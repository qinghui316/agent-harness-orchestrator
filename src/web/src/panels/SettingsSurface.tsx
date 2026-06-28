import { useState, type ReactElement } from "react";
import { Bot, Folder, Settings, Shield, Sparkles, Wrench, X } from "lucide-react";
import { CodexTrustButton, HarnessInitButton, InfoRow } from "./ProjectPanels.js";
import { CodexDiagnosticsCard } from "./ProjectHome.js";
import { SkillsSettingsView } from "./SkillsSettingsView.js";
import type { CodexDiagnostics, CodexModelSettingsSnapshot, ProjectStatus } from "../types.js";

export type SettingsSection = "basic" | "project" | "codex" | "skills" | "advanced";

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: "basic", label: "基础", icon: Settings },
  { id: "project", label: "项目", icon: Folder },
  { id: "codex", label: "Codex", icon: Bot },
  { id: "skills", label: "技能", icon: Sparkles },
  { id: "advanced", label: "高级诊断", icon: Wrench },
];

export function SettingsSurface({
  section,
  onSectionChange,
  project,
  diagnostics,
  modelSettings,
  modelSettingsBusy,
  modelSettingsMessage,
  onOpenModelSettings,
  onClose,
  onRefresh,
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  project: ProjectStatus | null;
  diagnostics: CodexDiagnostics | null;
  modelSettings: CodexModelSettingsSnapshot | null;
  modelSettingsBusy?: boolean;
  modelSettingsMessage?: string | null;
  onOpenModelSettings?: () => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const selectedProjectId = project?.project?.id ?? null;

  async function refresh(): Promise<void> {
    setMessage(null);
    try {
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="settings-surface" aria-label="设置">
      <aside className="settings-surface-sidebar" aria-label="设置分类">
        <header>
          <p className="eyebrow">设置</p>
          <h2>偏好与能力</h2>
        </header>
        <nav>
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "selected" : ""}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon size={16} />{item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="settings-surface-content">
        <header className="settings-surface-header">
          <div>
            <h1>{sections.find((item) => item.id === section)?.label ?? "设置"}</h1>
            <p>{settingsDescription(section)}</p>
          </div>
          <button className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={16} /></button>
        </header>

        {section === "basic" ? (
          <section className="settings-content-card">
            <h3>当前环境</h3>
            <p className="muted-copy">当前只显示已实现的 Harness 模式入口能力。普通 Agent 模式、浏览器、终端、附件和 marketplace 还没有放到 UI。</p>
            <div className="settings-info-grid">
              <Info label="当前模式" value="Harness 模式" />
              <Info label="执行引擎" value="Codex" />
              <Info label="右侧工具" value="确认 / 文件 / Git" />
            </div>
          </section>
        ) : null}

        {section === "project" ? (
          <section className="settings-content-card">
            <h3>项目</h3>
            {project?.project ? (
              <>
                <div className="settings-info-grid">
                  <Info label="名称" value={project.project.name} />
                  <Info label="路径" value={project.path} />
                  <Info label="Harness" value={project.harness.readiness} />
                  <Info label="Git" value={project.isGitRepo ? "Git 仓库" : "非 Git 仓库"} />
                </div>
                <div className="settings-inline-actions">
                  {project.managed && project.codexTrust && !project.codexTrust.trusted ? <CodexTrustButton project={project} onDone={refresh} /> : null}
                  {!project.managed || project.harness.readiness !== "ready" ? <HarnessInitButton projectId={project.project.id} onDone={refresh} /> : null}
                </div>
              </>
            ) : <p className="muted-copy">还没有选择项目。</p>}
          </section>
        ) : null}

        {section === "codex" ? (
          <section className="settings-content-card">
            <h3>Codex</h3>
            <div className="settings-info-grid">
              <Info label="当前模型" value={modelSettings?.effectiveModel ?? diagnostics?.effectiveModel ?? diagnostics?.currentModel ?? "Codex 默认模型"} />
              <Info label="来源" value={modelSourceLabel(modelSettings?.effectiveModelSource ?? diagnostics?.effectiveModelSource)} />
              <Info label="CLI" value={diagnostics?.available ? "可用" : "未确认"} />
            </div>
            <div className="settings-inline-actions">
              <button className="outline-button" onClick={onOpenModelSettings} disabled={!onOpenModelSettings || modelSettingsBusy}>选择模型</button>
              <button className="outline-button" onClick={() => void refresh()}>刷新状态</button>
            </div>
            {modelSettingsMessage ? <p className="diagnostic-errors">{modelSettingsMessage}</p> : null}
          </section>
        ) : null}

        {section === "skills" ? <SkillsSettingsView projectId={selectedProjectId} onRefresh={onRefresh} /> : null}

        {section === "advanced" ? (
          <section className="settings-content-card advanced-diagnostics-card">
            <div className="settings-section-header">
              <div>
                <h3><Shield size={16} />高级诊断</h3>
                <p>这里保留普通用户不需要每天看的 runtime 细节。</p>
              </div>
              <button className="outline-button" onClick={() => void refresh()}>刷新</button>
            </div>
            {project ? (
              <div className="settings-info-grid">
                <Info label="Memory mode" value={project.memory?.memoryMode ?? "未知"} />
                <Info label="Memory root" value={project.memory?.roots?.memoryRoot ?? "未记录"} />
                <Info label="Artifact base" value={project.memory?.artifactBase ?? "未记录"} />
                <Info label="Codex config" value={diagnostics?.configPath ?? project.codexTrust?.configPath ?? "未读取"} />
              </div>
            ) : null}
            <CodexDiagnosticsCard diagnostics={diagnostics} project={project} />
          </section>
        ) : null}

        {message ? <p className="diagnostic-errors">{message}</p> : null}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }): ReactElement {
  return <InfoRow label={label} value={value} />;
}

function settingsDescription(section: SettingsSection): string {
  if (section === "basic") return "只保留当前可用的产品选项。";
  if (section === "project") return "查看当前项目状态和必要的显式操作。";
  if (section === "codex") return "查看 Codex 状态和真实模型选择。";
  if (section === "skills") return "管理 Codex runtime 可用的 Skills。";
  return "调试信息只放在这里，不进入普通工作流。";
}

function modelSourceLabel(source: CodexModelSettingsSnapshot["effectiveModelSource"] | CodexDiagnostics["effectiveModelSource"] | undefined): string {
  if (source === "selected") return "用户选择";
  if (source === "config") return "Codex 配置";
  if (source === "codex-default") return "Codex 默认";
  return "未知";
}
