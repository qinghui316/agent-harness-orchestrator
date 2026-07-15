import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { ComposerControls } from "../shell/ComposerControls.js";
import { ComposerAttachButton, ComposerAttachmentList, filesFromDrop, hasFileDrag, imageFilesFromPaste, type ComposerAttachmentListItem } from "../shell/ComposerAttachments.js";
import { buildComposerContextSummary, ComposerContextSourcesPopover, type ComposerContextKind } from "../shell/ComposerContextSources.js";
import { FileMentionPicker } from "../shell/FileMentionPicker.js";
import { SkillMentionPicker } from "../shell/SkillMentionPicker.js";
import { WorkspacePicker } from "./WorkspacePicker.js";
import { InfoRow } from "./ProjectPanels.js";
import type { ProviderDiagnostics, ProviderModelCandidate, ProviderModelSettingsSnapshot, ProjectStatus, SkillListItem, TopicFileReference } from "../types.js";

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
}: {
  project: ProjectStatus;
  providerDisplayName?: string;
  modelLabel: string;
  onOpenModelSettings?: () => void;
  projects: ProjectStatus[];
  selectedProjectId: string | null;
  onCreateDemand: (body: string, fileRefs?: TopicFileReference[], attachmentIds?: string[], attachmentFiles?: File[]) => Promise<void>;
  enabledSkillCount?: number;
  skills?: SkillListItem[];
  activeSkillIds?: string[];
  onToggleSkill?: (skillId: string) => void | Promise<void>;
  onOpenSkillsSettings?: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  resetToken?: number;
  providerOptions?: Array<{ id: string; label: string }>;
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState("");
  const [draftFileRefs, setDraftFileRefs] = useState<TopicFileReference[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [openContextKind, setOpenContextKind] = useState<ComposerContextKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastResetToken = useRef(resetToken);
  const historyUnavailable = project.managed && project.memory?.memoryAvailable === false;
  const canStartDemand = project.pathExists && !historyUnavailable;
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
    setDraft("");
    setDraftFileRefs([]);
    setDraftAttachments([]);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [resetToken]);

  async function submitDemand(): Promise<void> {
    const body = draft.trim();
    if ((!body && draftAttachments.length === 0) || !canStartDemand) return;
    setSubmitting(true);
    try {
      await onCreateDemand(body, draftFileRefs, [], draftAttachments.map((attachment) => attachment.file));
      setDraft("");
      setDraftFileRefs([]);
      setDraftAttachments([]);
    } catch {
      // The App shell owns the user-facing error message; keep the draft intact.
    } finally {
      setSubmitting(false);
    }
  }

  async function attachFiles(files: File[]): Promise<void> {
    if (!canAttach || files.length === 0) return;
    const next = await draftAttachmentsFromFiles(files);
    setDraftAttachments((current) => mergeAttachments(current, next));
  }

  function removeAttachment(id: string): void {
    setDraftAttachments((current) => current.filter((attachment) => attachment.id !== id));
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
          <ComposerContextSourcesPopover
            kind={openContextKind}
            skills={skills}
            activeSkillIds={activeSkillIds}
            selectedFileRefs={draftFileRefs}
            attachments={draftAttachments}
            onToggleSkill={onToggleSkill}
            onSelectedFileRefsChange={setDraftFileRefs}
            onRemoveAttachment={removeAttachment}
            onClose={() => setOpenContextKind(null)}
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
          <ComposerAttachmentList attachments={draftAttachments} onRemove={removeAttachment} />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
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
            <span className="composer-footer-spacer" />
            <button
              className="composer-send"
              disabled={!canStartDemand || submitting || (!draft.trim() && draftAttachments.length === 0)}
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

type DraftAttachment = ComposerAttachmentListItem & {
  file: File;
};

async function draftAttachmentsFromFiles(files: File[]): Promise<DraftAttachment[]> {
  const result: DraftAttachment[] = [];
  for (const file of files) {
    result.push({
      id: `draft-${Date.now()}-${result.length}-${Math.random().toString(16).slice(2)}`,
      fileName: file.name || "attachment",
      kind: file.type.startsWith("image/") ? "image" : "text",
      size: file.size,
      previewUrl: file.type.startsWith("image/") ? await readFileAsDataUrl(file).catch(() => undefined) : undefined,
      file,
    });
  }
  return result;
}

function mergeAttachments(current: DraftAttachment[], next: DraftAttachment[]): DraftAttachment[] {
  const result = [...current];
  const seen = new Set(current.map((attachment) => `${attachment.file.name}:${attachment.file.size}:${attachment.file.lastModified}`));
  for (const attachment of next) {
    const key = `${attachment.file.name}:${attachment.file.size}:${attachment.file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(attachment);
  }
  return result;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export function ProviderDiagnosticsCard({ diagnostics, onAction }: { diagnostics: ProviderDiagnostics | null; project?: ProjectStatus | null; onAction?: (actionId: string) => void | Promise<void> }): ReactElement {
  if (!diagnostics) {
    return (
      <section className="project-status-panel provider-diagnostics-card">
        <h2>Agent Provider 诊断</h2>
        <p className="muted-copy">正在读取 Provider 状态。</p>
      </section>
    );
  }
  const ok = diagnostics.installation.available && diagnostics.sessionHealth === "ready";
  return (
    <section className={`project-status-panel provider-diagnostics-card ${ok ? "is-ready" : "has-warning"}`}>
      <div className="panel-title-row">
        <h2>{diagnostics.displayName} 诊断</h2>
        {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </div>
      <InfoRow label="安装" value={diagnostics.installation.available ? "可用" : "不可用"} />
      <InfoRow label="版本" value={diagnostics.installation.version ?? "未知"} />
      <InfoRow label="模型" value={diagnostics.models.effectiveModel?.modelId ?? "默认模型"} />
      <InfoRow label="Adapter" value={diagnostics.adapter.id} />
      {(diagnostics.projectActions ?? []).map((action) => (
        <div className="project-trust-action" key={action.id}>
          <button
            className="project-detail-action"
            disabled={action.status !== "available" || !onAction}
            onClick={() => void onAction?.(action.id)}
          >
            {action.label}
          </button>
          {action.reason ? <small>{action.reason}</small> : null}
        </div>
      ))}
      {diagnostics.lastError ? <p className="diagnostic-errors">{diagnostics.lastError}</p> : <p className="muted-copy">当前 {diagnostics.displayName} 已满足本地执行要求。</p>}
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
            <p className="eyebrow">Agent Provider</p>
            <h2>选择模型</h2>
          </div>
          <button className="icon-button" aria-label="关闭模型选择" onClick={onClose}><X size={16} /></button>
        </header>
        <p className="muted-copy">这里设置当前 Provider 使用的模型。</p>
        <div className="model-picker-summary">
          <InfoRow label="当前模型" value={effectiveModel ?? "Provider 默认模型"} />
          <InfoRow label="来源" value={modelSourceLabel(snapshot?.effectiveModelSource)} />
          {snapshot?.degradedReason ? <p className="muted-copy">{snapshot.degradedReason}</p> : null}
        </div>
        <div className="model-picker-actions">
          <button className="outline-button" disabled={busy} onClick={() => void onRefresh()}><RefreshCw size={14} />刷新</button>
          <button className="outline-button" disabled={busy || !selectedModel} onClick={() => void onSelect(null)}>使用 Provider 配置</button>
        </div>
        <div className="model-candidate-list" aria-label="Provider 模型候选">
          {candidates.length === 0 ? <p className="muted-copy">没有读取到模型列表。将继续使用 Provider 配置或默认模型。</p> : candidates.map((candidate) => (
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
  if (source === "config") return "Provider 配置";
  if (source === "provider-default") return "Provider 默认";
  return "未知";
}

function modelCandidateSourceLabel(candidate: ProviderModelCandidate): string {
  if (candidate.source === "runtime") return candidate.isDefault ? "runtime 默认" : "runtime";
  if (candidate.source === "config") return "Provider 配置";
  return candidate.source;
}
