import { useState, type ReactElement } from "react";
import {
  ArrowUp,
  Bot,
  RefreshCw,
  X,
} from "lucide-react";
import { ConversationComposerSurface } from "../shell/composer.js";
import { WorkspacePicker } from "./WorkspacePicker.js";
import { InfoRow } from "./ProjectPanels.js";
import { parseReviewCommand } from "../reviewCommand.js";
import type { AgentTurnMode, ProductMode, ProjectGitReviewOptions, ProviderModelCandidate, ProviderModelSettingsSnapshot, ProviderReviewTarget, ProjectStatus, SkillListItem, TopicAttachment, TopicFileReference } from "../types.js";

export function ProjectHomeView({
  projects,
  onOpenProject,
  onRefresh,
}: {
  projects: ProjectStatus[];
  onOpenProject: (projectId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement {
  return (
    <section className="home-chat-surface" aria-label="项目首页">
      <div className="home-chat-center">
        <div className="home-chat-mark" aria-label="Agent">
          <Bot size={50} />
        </div>
        <h1>创造任何东西</h1>
        <WorkspacePicker
          projects={projects}
          selectedProjectId={null}
          onOpenProject={onOpenProject}
          onRefresh={onRefresh}
        />
      </div>
    </section>
  );
}

export function ProjectReadinessHome({
  project,
  providerDisplayName,
  modelLabel,
  onOpenModelSettings,
  projects,
  selectedProjectId,
  onCreateDemand,
  draft,
  onDraftChange,
  draftFileRefs,
  onDraftFileRefsChange,
  draftAttachments,
  onAttachFiles,
  onRemoveAttachment,
  skills,
  activeSkillIds,
  onToggleSkill,
  onOpenProject,
  onRefresh,
  resetToken,
  providerOptions,
  selectedProviderId,
  onSelectProvider,
  productMode,
  agentTurnMode,
  onSelectAgentTurnMode,
  agentTurnModeDisabledReason,
  agentModelId,
  agentReasoningEffort,
  providerModelSettings,
  onSelectAgentModel,
  onSelectAgentReasoningEffort,
  reviewOpen,
  reviewOptions,
  reviewLoading,
  reviewSubmitting,
  onOpenReview,
  onCloseReview,
  onStartReview,
  onStartReviewCommand,
  onReviewCommandError,
}: {
  project: ProjectStatus;
  providerDisplayName?: string;
  modelLabel: string;
  onOpenModelSettings?: () => void;
  projects: ProjectStatus[];
  selectedProjectId: string | null;
  onCreateDemand: (body: string, fileRefs?: TopicFileReference[], attachmentIds?: string[], attachmentFiles?: File[]) => Promise<void>;
  draft: string;
  onDraftChange: (value: string) => void;
  draftFileRefs: TopicFileReference[];
  onDraftFileRefsChange: (refs: TopicFileReference[]) => void;
  draftAttachments: TopicAttachment[];
  onAttachFiles: (files: File[]) => Promise<TopicAttachment[]>;
  onRemoveAttachment: (attachmentId: string) => Promise<void>;
  enabledSkillCount?: number;
  skills?: SkillListItem[];
  activeSkillIds?: string[];
  onToggleSkill?: (skillId: string) => void | Promise<void>;
  onOpenProject: (projectId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  resetToken?: number;
  providerOptions?: Array<{ id: string; label: string }>;
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
  productMode: ProductMode;
  agentTurnMode: AgentTurnMode;
  onSelectAgentTurnMode: (mode: AgentTurnMode) => void | Promise<void>;
  agentTurnModeDisabledReason?: string | null;
  agentModelId: string | null;
  agentReasoningEffort: string | null;
  providerModelSettings: ProviderModelSettingsSnapshot | null;
  onSelectAgentModel: (modelId: string | null) => void | Promise<void>;
  onSelectAgentReasoningEffort: (effort: string | null) => void | Promise<void>;
  reviewOpen?: boolean;
  reviewOptions?: ProjectGitReviewOptions | null;
  reviewLoading?: boolean;
  reviewSubmitting?: boolean;
  onOpenReview?: (capturedCommand?: string) => void | Promise<void>;
  onCloseReview?: () => void;
  onStartReview?: (target: ProviderReviewTarget) => void | Promise<void>;
  onStartReviewCommand?: (target: ProviderReviewTarget, capturedCommand: string) => void | Promise<void>;
  onReviewCommandError?: (message: string) => void;
}): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const canStartDemand = project.pathExists;
  const canAttach = canStartDemand;

  async function submitDemand(): Promise<void> {
    if (productMode === "agent") {
      const command = parseReviewCommand(draft);
      if (command.kind === "open-selector") {
        await onOpenReview?.(draft);
        return;
      }
      if (command.kind === "target") {
        await onStartReviewCommand?.(command.target, draft);
        return;
      }
      if (command.kind === "invalid") {
        onReviewCommandError?.(command.message);
        return;
      }
    }
    const body = draft.trim();
    if ((!body && draftAttachments.length === 0) || !canStartDemand) return;
    setSubmitting(true);
    try {
      await onCreateDemand(body, draftFileRefs, draftAttachments.map((attachment) => attachment.id));
    } catch {
      // The App shell owns the user-facing error message; keep the draft intact.
    } finally {
      setSubmitting(false);
    }
  }

  async function attachFiles(files: File[]): Promise<void> {
    if (!canAttach || files.length === 0) return;
    await onAttachFiles(files);
  }

  return (
    <section className="home-chat-surface" aria-label="项目对话首页">
      <div className="home-chat-center">
        <div className="home-chat-mark" aria-label={productMode === "agent" ? "Agent" : "AHO"}>
          <Bot size={50} />
        </div>
        <h1>创造任何东西</h1>
        <WorkspacePicker
          projects={projects}
          selectedProjectId={selectedProjectId}
          onOpenProject={onOpenProject}
          onRefresh={onRefresh}
        />

        <ConversationComposerSurface
          ariaLabel="新建需求对话"
          inputAriaLabel="新建需求输入框"
          className="home-demand-composer"
          value={draft}
          onChange={onDraftChange}
          disabledReason={!canStartDemand ? "项目目录不可用" : submitting ? "正在创建会话" : undefined}
          placeholder="描述你的需求"
          projectId={project.project?.id ?? null}
          skills={skills}
          activeSkillIds={activeSkillIds}
          selectedFileRefs={draftFileRefs}
          attachments={draftAttachments}
          onAttachFiles={attachFiles}
          onRemoveAttachment={onRemoveAttachment}
          onToggleSkill={onToggleSkill}
          onSelectedFileRefsChange={onDraftFileRefsChange}
          productMode={productMode}
          agentTurnMode={agentTurnMode}
          onSelectAgentTurnMode={onSelectAgentTurnMode}
          agentTurnModeDisabledReason={agentTurnModeDisabledReason}
          providerDisplayName={providerDisplayName}
          modelLabel={modelLabel}
          onOpenModelSettings={onOpenModelSettings}
          providerOptions={providerOptions}
          selectedProviderId={selectedProviderId}
          onSelectProvider={onSelectProvider}
          agentModelId={agentModelId}
          agentReasoningEffort={agentReasoningEffort}
          providerModelSettings={providerModelSettings}
          onSelectAgentModel={onSelectAgentModel}
          onSelectAgentReasoningEffort={onSelectAgentReasoningEffort}
          reviewOpen={reviewOpen}
          reviewOptions={reviewOptions}
          reviewLoading={reviewLoading}
          reviewSubmitting={reviewSubmitting}
          onOpenReview={onOpenReview}
          onCloseReview={onCloseReview}
          onStartReview={onStartReview}
          onSubmit={submitDemand}
          focusToken={resetToken}
          trailingControls={<button
            className="composer-send"
            type="button"
            disabled={!canStartDemand || submitting || Boolean(agentTurnModeDisabledReason) || (!draft.trim() && draftAttachments.length === 0)}
            onClick={() => void submitDemand()}
            title={agentTurnModeDisabledReason ?? "创建需求对话"}
            aria-label="创建需求对话"
          >
            {submitting ? <RefreshCw size={16} className="spin" /> : <ArrowUp size={17} />}
          </button>}
        />
      </div>
    </section>
  );
}

export function ProviderModelPicker({
  open,
  snapshot,
  busy,
  message,
  onClose,
  onRefresh,
  onSelect,
}: {
  open: boolean;
  snapshot: ProviderModelSettingsSnapshot | null;
  busy?: boolean;
  message?: string | null;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onSelect: (model: string | null) => void | Promise<void>;
}): ReactElement | null {
  if (!open) return null;
  const candidates = snapshot?.candidates ?? [];
  const selectedModel = snapshot?.selectedModel?.modelId ?? null;
  const effectiveModel = snapshot?.effectiveModel?.modelId ?? null;
  return (
    <div className="settings-overlay model-picker-overlay" role="dialog" aria-label="选择 Agent 模型">
      <section className="model-picker-panel">
        <header className="settings-panel-header">
          <div>
            <p className="eyebrow">AI 服务</p>
            <h2>选择模型</h2>
          </div>
          <button className="icon-button" aria-label="关闭模型选择" onClick={onClose}><X size={16} /></button>
        </header>
        <p className="muted-copy">设置当前 AI 服务使用的模型。</p>
        <div className="model-picker-summary">
          <InfoRow label="当前模型" value={effectiveModel ?? "默认模型"} />
          <InfoRow label="来源" value={modelSourceLabel(snapshot?.effectiveModelSource)} />
          {snapshot?.degradedReason ? <p className="muted-copy">{snapshot.degradedReason}</p> : null}
        </div>
        <div className="model-picker-actions">
          <button className="outline-button" disabled={busy} onClick={() => void onRefresh()}><RefreshCw size={14} />刷新</button>
          <button className="outline-button" disabled={busy || !selectedModel} onClick={() => void onSelect(null)}>使用服务配置</button>
        </div>
        <div className="model-candidate-list" aria-label="可选模型">
          {candidates.length === 0 ? <p className="muted-copy">没有读取到模型列表。将继续使用服务配置或默认模型。</p> : candidates.map((candidate) => (
            <div className="model-candidate-row" key={`${candidate.source}:${candidate.modelId}`}>
              <div>
                <strong>{candidate.label}</strong>
                <small>{candidate.modelId} · {modelCandidateSourceLabel(candidate)}</small>
              </div>
              <div className="model-candidate-actions">
                {candidate.modelId === effectiveModel ? <span className="composer-pill subtle">当前</span> : null}
                <button className="primary-button" disabled={busy || candidate.modelId === selectedModel} onClick={() => void onSelect(candidate.modelId)}>选择</button>
              </div>
            </div>
          ))}
        </div>
        {message ? <p className="diagnostic-errors">{message}</p> : null}
      </section>
    </div>
  );
}

function modelSourceLabel(source: ProviderModelSettingsSnapshot["effectiveModelSource"] | undefined): string {
  if (source === "selected") return "用户选择";
  if (source === "config") return "服务配置";
  if (source === "provider-default") return "服务默认";
  return "未知";
}

function modelCandidateSourceLabel(candidate: ProviderModelCandidate): string {
  if (candidate.source === "runtime") return candidate.isDefault ? "服务默认" : "服务发现";
  if (candidate.source === "config") return "服务配置";
  return candidate.source;
}
