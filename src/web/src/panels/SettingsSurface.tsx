import { useState, type ReactElement } from "react";
import { ArrowLeft, Bot, Folder, Settings, Shield, Sparkles, Wrench } from "lucide-react";
import { InfoRow } from "./ProjectPanels.js";
import { ProviderDiagnosticsCard } from "./ProjectHome.js";
import { SkillsSettingsView } from "./SkillsSettingsView.js";
import { projectDisplayName } from "../formatters.js";
import type { ProviderDiagnostics, ProviderModelSettingsSnapshot, ProjectStatus, ProviderCapabilityItem, ProviderCapabilitySnapshot } from "../types.js";

export type SettingsSection = "basic" | "project" | "provider" | "skills" | "advanced";

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: "basic", label: "基础", icon: Settings },
  { id: "project", label: "项目", icon: Folder },
  { id: "provider", label: "Agent Provider", icon: Bot },
  { id: "skills", label: "技能", icon: Sparkles },
  { id: "advanced", label: "高级诊断", icon: Wrench },
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
  const providerLabel = diagnostics?.displayName ?? "Agent Provider";

  async function executeProviderAction(actionId: string): Promise<void> {
    if (!selectedProjectId || !diagnostics) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/providers/${encodeURIComponent(diagnostics.providerId)}/actions/${encodeURIComponent(actionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) throw new Error(await response.text());
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }

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
            <p className="muted-copy">当前只显示已实现的专业开发模式入口能力。普通 Agent 模式、浏览器、终端、附件和 marketplace 还没有放到 UI。</p>
            <div className="settings-info-grid">
              <Info label="当前模式" value="专业开发模式" />
              <Info label="执行引擎" value={providerLabel} />
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
                  <Info label="项目状态" value={project.memory?.memoryAvailable === false ? "项目历史不可用" : project.harness.readiness === "ready" ? "已准备" : "首次需求时自动建立说明"} />
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
                <Info label="Internal project id" value={project.project?.id ?? "未记录"} />
                <Info label="Registry name" value={project.project?.name ?? "未记录"} />
                <Info label="Memory mode" value={project.memory?.memoryMode ?? "未知"} />
                <Info label="Memory root" value={project.memory?.roots?.memoryRoot ?? "未记录"} />
                <Info label="Artifact base" value={project.memory?.artifactBase ?? "未记录"} />
                <Info label="Provider adapter" value={diagnostics?.adapter.id ?? "未读取"} />
              </div>
            ) : null}
            <ProviderDiagnosticsCard diagnostics={diagnostics} project={project} onAction={executeProviderAction} />
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
  if (section === "provider") return "查看 Agent Provider 状态和真实模型选择。";
  if (section === "skills") return "管理当前 Agent Provider 可用的 Skills。";
  return "调试信息只放在这里，不进入普通工作流。";
}

function modelSourceLabel(source: ProviderModelSettingsSnapshot["effectiveModelSource"] | undefined): string {
  if (source === "selected") return "用户选择";
  if (source === "config") return "Provider 配置";
  if (source === "provider-default") return "Provider 默认";
  return "未知";
}

function ProviderCapabilityMatrix({ snapshot }: { snapshot: ProviderCapabilitySnapshot | null }): ReactElement {
  if (!snapshot) {
    return (
      <section className="provider-capability-matrix" aria-label="Provider 能力矩阵">
        <div className="settings-section-header">
          <div>
            <h3>能力矩阵</h3>
            <p>正在读取 Provider 运行能力。</p>
          </div>
        </div>
      </section>
    );
  }
  const capabilities = Array.isArray(snapshot.capabilities) ? snapshot.capabilities : [];
  const degradedReasons = Array.isArray(snapshot.degradedReasons) ? snapshot.degradedReasons : [];
  return (
    <section className="provider-capability-matrix" aria-label="Provider 能力矩阵">
      <div className="settings-section-header">
        <div>
          <h3>能力矩阵</h3>
          <p>{providerStatusText(snapshot)}</p>
        </div>
        <span className={`provider-status-pill ${snapshot.status}`}>{providerStatusLabel(snapshot.status)}</span>
      </div>
      <div className="settings-info-grid">
        <Info label="Provider" value={snapshot.displayName} />
        <Info label="Product mode" value="Harness" />
        <Info label="模型" value={snapshot.effectiveModel ?? "Provider 默认模型"} />
        <Info label="Snapshot" value={snapshot.snapshotHash} />
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
  if (snapshot.status === "ready") return `${snapshot.displayName} 已满足当前 Harness 模式需要的运行能力。`;
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
