import { useState, type ReactElement } from "react";
import { ArrowLeft, Bot, Folder, Settings, Sparkles } from "lucide-react";
import { InfoRow } from "./ProjectPanels.js";
import { SkillsSettingsView } from "./SkillsSettingsView.js";
import { projectDisplayName } from "../formatters.js";
import type { ProviderDiagnostics, ProviderModelSettingsSnapshot, ProjectStatus, ProviderCapabilityItem, ProviderCapabilitySnapshot } from "../types.js";

export type SettingsSection = "basic" | "project" | "provider" | "skills";

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: "basic", label: "基础", icon: Settings },
  { id: "project", label: "项目", icon: Folder },
  { id: "provider", label: "AI 服务", icon: Bot },
  { id: "skills", label: "技能", icon: Sparkles },
];

export function SettingsSurface({
  section,
  onSectionChange,
  project,
  diagnostics,
  modelSettings,
  providerCapabilities,
  modelSettingsBusy,
  modelSettingsMessage,
  onOpenModelSettings,
  onClose,
  onRefresh,
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  project: ProjectStatus | null;
  diagnostics: ProviderDiagnostics | null;
  modelSettings: ProviderModelSettingsSnapshot | null;
  providerCapabilities?: ProviderCapabilitySnapshot[];
  modelSettingsBusy?: boolean;
  modelSettingsMessage?: string | null;
  onOpenModelSettings?: () => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const selectedProjectId = project?.project?.id ?? null;
  const providerLabel = diagnostics?.displayName ?? "AI 服务";

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
                <Icon size={16} />{item.id === "provider" ? providerLabel : item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="settings-surface-content">
        <header className="settings-surface-header">
          <div>
            <h1>{section === "provider" ? providerLabel : sections.find((item) => item.id === section)?.label ?? "设置"}</h1>
            <p>{settingsDescription(section)}</p>
          </div>
          <button className="outline-button settings-back-button" aria-label="返回工作区" onClick={onClose}><ArrowLeft size={16} />返回工作区</button>
        </header>

        {section === "basic" ? (
          <section className="settings-content-card">
            <h3>当前环境</h3>
            <p className="muted-copy">管理当前项目使用的 AI 服务、模型和常用能力。</p>
            <div className="settings-info-grid">
              <Info label="AI 服务" value={providerLabel} />
              <Info label="模型" value={modelSettings?.effectiveModel?.modelId ?? diagnostics?.models.effectiveModel?.modelId ?? "默认模型"} />
              <Info label="右侧工具" value="确认 / 文件 / Git / 诊断" />
            </div>
          </section>
        ) : null}

        {section === "project" ? (
          <section className="settings-content-card">
            <h3>项目</h3>
            {project?.project ? (
              <>
                <div className="settings-info-grid">
                  <Info label="名称" value={projectDisplayName(project.project)} />
                  <Info label="路径" value={project.path} />
                  <Info label="项目状态" value={project.harness.readiness === "ready" ? "已准备" : project.harness.readiness === "partial" ? "需要修复项目 Harness" : "首次需求时自动建立说明"} />
                  <Info label="Git" value={project.isGitRepo ? "Git 仓库" : "非 Git 仓库"} />
                </div>
              </>
            ) : <p className="muted-copy">还没有选择项目。</p>}
          </section>
        ) : null}

        {section === "provider" ? (
          <section className="settings-content-card">
            <h3>{providerLabel}</h3>
            <div className="settings-info-grid">
              <Info label="当前模型" value={modelSettings?.effectiveModel?.modelId ?? diagnostics?.models.effectiveModel?.modelId ?? `${providerLabel} 默认模型`} />
              <Info label="来源" value={modelSourceLabel(modelSettings?.effectiveModelSource ?? diagnostics?.models.effectiveModelSource)} />
              <Info label="运行状态" value={diagnostics?.installation.available ? "可用" : "未确认"} />
            </div>
            <div className="settings-inline-actions">
              <button className="outline-button" onClick={onOpenModelSettings} disabled={!onOpenModelSettings || modelSettingsBusy}>选择模型</button>
              <button className="outline-button" onClick={() => void refresh()}>刷新状态</button>
            </div>
            {modelSettingsMessage ? <p className="diagnostic-errors">{modelSettingsMessage}</p> : null}
            <ProviderCapabilityMatrix snapshot={providerCapabilities?.find((item) => item.providerId === diagnostics?.providerId) ?? null} />
          </section>
        ) : null}

        {section === "skills" ? <SkillsSettingsView projectId={selectedProjectId} onRefresh={onRefresh} /> : null}

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
  if (section === "provider") return "查看 AI 服务状态并选择模型。";
  return "管理当前 AI 服务可用的技能。";
}

function modelSourceLabel(source: ProviderModelSettingsSnapshot["effectiveModelSource"] | undefined): string {
  if (source === "selected") return "用户选择";
  if (source === "config") return "服务配置";
  if (source === "provider-default") return "服务默认";
  return "未知";
}

function ProviderCapabilityMatrix({ snapshot }: { snapshot: ProviderCapabilitySnapshot | null }): ReactElement {
  if (!snapshot) {
    return (
      <section className="provider-capability-matrix" aria-label="AI 服务能力">
        <div className="settings-section-header">
          <div>
            <h3>能力矩阵</h3>
            <p>正在读取 AI 服务能力。</p>
          </div>
        </div>
      </section>
    );
  }
  const capabilities = Array.isArray(snapshot.capabilities) ? snapshot.capabilities : [];
  const degradedReasons = Array.isArray(snapshot.degradedReasons) ? snapshot.degradedReasons : [];
  return (
    <section className="provider-capability-matrix" aria-label="AI 服务能力">
      <div className="settings-section-header">
        <div>
          <h3>能力矩阵</h3>
          <p>{providerStatusText(snapshot)}</p>
        </div>
        <span className={`provider-status-pill ${snapshot.status}`}>{providerStatusLabel(snapshot.status)}</span>
      </div>
      <div className="settings-info-grid">
        <Info label="AI 服务" value={snapshot.displayName} />
        <Info label="模型" value={snapshot.effectiveModel ?? "默认模型"} />
      </div>
      <div className="provider-capability-list">
        {capabilities.map((item) => <ProviderCapabilityRow item={item} key={item.key} />)}
      </div>
      {degradedReasons.length > 0 ? (
        <details className="provider-degraded-details">
          <summary>降级原因</summary>
          <ul>
            {degradedReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function ProviderCapabilityRow({ item }: { item: ProviderCapabilityItem }): ReactElement {
  return (
    <div className="provider-capability-row">
      <div>
        <strong>{item.label}</strong>
        <small>{item.summary}</small>
        {item.reason ? <small className="provider-capability-reason">{item.reason}</small> : null}
      </div>
      <div className="provider-capability-states">
        <span className={`provider-state-pill spec ${item.spec}`}>{specStateLabel(item.spec)}</span>
        <span className={`provider-state-pill runtime ${item.runtime}`}>{runtimeStateLabel(item.runtime)}</span>
      </div>
    </div>
  );
}

function providerStatusText(snapshot: ProviderCapabilitySnapshot): string {
  if (snapshot.status === "ready") return `${snapshot.displayName} 已满足当前项目需要。`;
  if (snapshot.status === "degraded") return `${snapshot.displayName} 可用，但部分能力正在降级。`;
  return `${snapshot.displayName} 当前不可运行，请查看诊断。`;
}

function providerStatusLabel(status: ProviderCapabilitySnapshot["status"]): string {
  if (status === "ready") return "可用";
  if (status === "degraded") return "降级";
  return "不可用";
}

function specStateLabel(state: ProviderCapabilityItem["spec"]): string {
  if (state === "supported") return "支持";
  if (state === "compat-input") return "兼容";
  if (state === "unsupported") return "不支持";
  return "未知";
}

function runtimeStateLabel(state: ProviderCapabilityItem["runtime"]): string {
  if (state === "ready") return "当前可用";
  if (state === "degraded") return "降级";
  return "不可用";
}
