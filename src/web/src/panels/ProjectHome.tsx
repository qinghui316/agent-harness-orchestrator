import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Bot,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { ComposerControls } from "../shell/ComposerControls.js";
import { AgentTurnModeControl, AgentTurnModelControls, ReviewInlineSelector } from "../shell/composer.js";
import { ComposerAttachButton, ComposerAttachmentList, filesFromDrop, hasFileDrag, imageFilesFromPaste } from "../shell/ComposerAttachments.js";
import { buildComposerContextSummary, ComposerContextSourcesPopover, type ComposerContextKind } from "../shell/ComposerContextSources.js";
import { FileMentionPicker } from "../shell/FileMentionPicker.js";
import { SkillMentionPicker } from "../shell/SkillMentionPicker.js";
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
  enabledSkillCount,
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
  const [dragOver, setDragOver] = useState(false);
  const [openContextKind, setOpenContextKind] = useState<ComposerContextKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastResetToken = useRef(resetToken);
  const canStartDemand = project.pathExists;
  const canAttach = canStartDemand;
  const contextSummary = useMemo(() => buildComposerContextSummary({
    skills,
    activeSkillIds,
    selectedFileRefs: draftFileRefs,
    attachments: draftAttachments,
  }), [skills, activeSkillIds, draftFileRefs, draftAttachments]);

  useEffect(() => {
    if (resetToken === undefined) return;
    if (lastResetToken.current === resetToken) return;
    lastResetToken.current = resetToken;
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [resetToken]);

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

  function removeAttachment(id: string): void {
    void onRemoveAttachment(id);
  }

  return (
    <section className="home-chat-surface" aria-label="项目对话首页">
      <div className="home-chat-center">
        <div className="home-chat-mark" aria-label="Agent">
          <Bot size={50} />
        </div>
        <h1>创造任何东西</h1>
        <WorkspacePicker
          projects={projects}
          selectedProjectId={selectedProjectId}
          onOpenProject={onOpenProject}
          onRefresh={onRefresh}
        />

        <section
          className={`home-demand-composer ${dragOver ? "is-drag-over" : ""}`}
          aria-label="新建需求对话"
          onDragOver={(event) => {
            if (!canAttach || !hasFileDrag(event)) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            if (!canAttach) return;
            const files = filesFromDrop(event);
            if (files.length === 0) return;
            event.preventDefault();
            setDragOver(false);
            void attachFiles(files);
          }}
        >
          <ComposerControls
            providerDisplayName={providerDisplayName}
            modelLabel={modelLabel}
            onOpenModelSettings={onOpenModelSettings}
            enabledSkillCount={enabledSkillCount}
            contextSummary={contextSummary}
            openContextKind={openContextKind}
            onToggleContextKind={(kind) => setOpenContextKind((current) => current === kind ? null : kind)}
            providerOptions={providerOptions}
            selectedProviderId={selectedProviderId}
            onSelectProvider={onSelectProvider}
          />
          <div className="agent-turn-settings-row">
            <AgentTurnModeControl
              productMode={productMode}
              value={agentTurnMode}
              onChange={onSelectAgentTurnMode}
              planDisabledReason={agentTurnModeDisabledReason}
            />
            <AgentTurnModelControls
              productMode={productMode}
              modelId={agentModelId}
              reasoningEffort={agentReasoningEffort}
              modelSettings={providerModelSettings}
              onSelectModel={onSelectAgentModel}
              onSelectReasoningEffort={onSelectAgentReasoningEffort}
            />
          </div>
          <ComposerContextSourcesPopover
            kind={openContextKind}
            skills={skills}
            activeSkillIds={activeSkillIds}
            selectedFileRefs={draftFileRefs}
            attachments={draftAttachments}
            onToggleSkill={onToggleSkill}
            onSelectedFileRefsChange={onDraftFileRefsChange}
            onRemoveAttachment={removeAttachment}
            onClose={() => setOpenContextKind(null)}
          />
          <SkillMentionPicker
            value={draft}
            onChange={onDraftChange}
            skills={skills ?? []}
            activeSkillIds={activeSkillIds ?? []}
            onToggleSkill={onToggleSkill ?? (() => undefined)}
          />
          <FileMentionPicker
            projectId={project.project?.id ?? null}
            value={draft}
            onChange={onDraftChange}
            selectedRefs={draftFileRefs}
            onSelectedRefsChange={onDraftFileRefsChange}
          />
          <ComposerAttachmentList attachments={draftAttachments} onRemove={removeAttachment} />
          {productMode === "agent" && reviewOpen ? <ReviewInlineSelector
            options={reviewOptions ?? null}
            loading={Boolean(reviewLoading)}
            submitting={Boolean(reviewSubmitting)}
            onClose={() => onCloseReview?.()}
            onStart={(target) => onStartReview?.(target)}
          /> : null}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onPaste={(event) => {
              if (!canAttach) return;
              const files = imageFilesFromPaste(event);
              if (files.length === 0) return;
              event.preventDefault();
              void attachFiles(files);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitDemand();
              }
            }}
            disabled={!canStartDemand || submitting}
            placeholder="描述你的需求；Enter 发送，Shift+Enter 换行"
            aria-label="新建需求输入框"
          />
          <div className="home-demand-composer-footer">
            <ComposerAttachButton disabled={!canAttach || submitting} onAttachFiles={attachFiles} />
            {productMode === "agent" ? <button
              className="composer-review-button"
              type="button"
              disabled={!canStartDemand || submitting || Boolean(reviewSubmitting)}
              title="代码审查"
              aria-label="代码审查"
              onClick={() => void onOpenReview?.()}
            >
              {reviewLoading || reviewSubmitting ? <RefreshCw size={15} className="spin" /> : <Search size={15} />}
            </button> : null}
            <span className="composer-footer-spacer" />
            <button
              className="composer-send"
              disabled={!canStartDemand || submitting || Boolean(agentTurnModeDisabledReason) || (!draft.trim() && draftAttachments.length === 0)}
              onClick={() => void submitDemand()}
              title={agentTurnModeDisabledReason ?? "创建需求对话"}
            >
              <Send size={16} />
            </button>
          </div>
        </section>
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
