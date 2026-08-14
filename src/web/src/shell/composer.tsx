import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Send, X } from "lucide-react";
import type { AgentTurnMode, ProductMode, SkillListItem, TopicAttachment, TopicFileReference, WorkpadRuntimeStatus } from "../types.js";
import { ComposerAttachButton, ComposerAttachmentList, filesFromDrop, hasFileDrag, imageFilesFromPaste } from "./ComposerAttachments.js";
import { ComposerControls } from "./ComposerControls.js";
import { buildComposerContextSummary, ComposerContextSourcesPopover, type ComposerContextKind } from "./ComposerContextSources.js";
import { FileMentionPicker } from "./FileMentionPicker.js";
import { SkillMentionPicker } from "./SkillMentionPicker.js";
import { ComposerFrame } from "./ComposerFrame.js";

export function TopicComposer({
  value,
  onChange,
  providerDisplayName,
  modelLabel,
  onOpenModelSettings,
  enabledSkillCount,
  projectId,
  skills,
  activeSkillIds,
  selectedFileRefs,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  onToggleSkill,
  onSelectedFileRefsChange,
  disabledReason,
  agentTurnMode,
  onSelectAgentTurnMode,
  agentTurnModeDisabledReason,
  productMode,
  onSend,
  onStopAndContinue,
  actionRunning,
  currentWorkpadStatus,
  providerOptions,
  selectedProviderId,
  onSelectProvider,
}: {
  value: string;
  onChange: (value: string) => void;
  providerDisplayName?: string;
  modelLabel: string;
  onOpenModelSettings?: () => void;
  enabledSkillCount?: number;
  projectId: string | null;
  skills?: SkillListItem[];
  activeSkillIds?: string[];
  selectedFileRefs?: TopicFileReference[];
  attachments?: TopicAttachment[];
  onAttachFiles?: (files: File[]) => void | Promise<void>;
  onRemoveAttachment?: (id: string) => void | Promise<void>;
  onToggleSkill?: (skillId: string) => void | Promise<void>;
  onSelectedFileRefsChange?: (refs: TopicFileReference[]) => void;
  disabledReason?: string;
  productMode?: ProductMode;
  agentTurnMode?: AgentTurnMode;
  onSelectAgentTurnMode?: (mode: AgentTurnMode) => void | Promise<void>;
  agentTurnModeDisabledReason?: string | null;
  onSend: () => Promise<void>;
  onStopAndContinue?: () => Promise<void>;
  actionRunning: string | null;
  currentWorkpadStatus?: WorkpadRuntimeStatus;
  providerOptions?: Array<{ id: string; label: string }>;
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
}): ReactElement {
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [openContextKind, setOpenContextKind] = useState<ComposerContextKind | null>(null);
  const runningConversation = Boolean(actionRunning) || currentWorkpadStatus === "running";
  const canStop = runningConversation && Boolean(onStopAndContinue) && !value.trim();
  const hasAttachments = (attachments?.length ?? 0) > 0;
  const contextSummary = useMemo(() => buildComposerContextSummary({
    skills,
    activeSkillIds,
    selectedFileRefs,
    attachments,
  }), [skills, activeSkillIds, selectedFileRefs, attachments]);
  const canSend = Boolean(value.trim()) || hasAttachments;
  const sendDisabled = Boolean(disabledReason) || Boolean(agentTurnModeDisabledReason) || (!canSend && !canStop);
  const buttonTitle = canStop ? "停止当前执行" : runningConversation ? "发送给当前执行" : "发送";
  const buttonIcon = canStop ? <X size={16} /> : <Send size={16} />;
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resizeComposerTextarea(textarea);
  }, [value]);
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    let observedWidth = textarea.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? textarea.getBoundingClientRect().width;
      if (nextWidth === observedWidth) return;
      observedWidth = nextWidth;
      resizeComposerTextarea(textarea);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);
  function submit(): void {
    if (canStop) void onStopAndContinue?.();
    else void onSend();
  }
  return (
    <ComposerFrame
      className={dragOver ? "is-drag-over" : ""}
      aria-label="需求对话输入框"
      onDragOver={(event) => {
        if (disabledReason || !hasFileDrag(event)) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        if (disabledReason) return;
        const files = filesFromDrop(event);
        if (files.length === 0) return;
        event.preventDefault();
        setDragOver(false);
        void onAttachFiles?.(files);
      }}
      controls={<div className="composer-control-stack">
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
        <AgentTurnModeControl
          productMode={productMode}
          value={agentTurnMode}
          onChange={onSelectAgentTurnMode}
          planDisabledReason={agentTurnModeDisabledReason}
        />
      </div>}
      toolbar={<>
        <ComposerAttachButton disabled={Boolean(disabledReason)} onAttachFiles={onAttachFiles} />
        <span className="composer-spacer" />
        <button
          className={`composer-send ${actionRunning ? "running" : ""}`}
          disabled={sendDisabled}
          title={agentTurnModeDisabledReason ?? buttonTitle}
          onClick={submit}
        >
          {buttonIcon}
        </button>
      </>}
    >
      <ComposerContextSourcesPopover
        kind={openContextKind}
        skills={skills}
        activeSkillIds={activeSkillIds}
        selectedFileRefs={selectedFileRefs}
        attachments={attachments}
        onToggleSkill={onToggleSkill}
        onSelectedFileRefsChange={onSelectedFileRefsChange}
        onRemoveAttachment={onRemoveAttachment}
        onClose={() => setOpenContextKind(null)}
      />
      <SkillMentionPicker
        value={value}
        onChange={onChange}
        skills={skills ?? []}
        activeSkillIds={activeSkillIds ?? []}
        onToggleSkill={onToggleSkill ?? (() => undefined)}
      />
      <FileMentionPicker
        projectId={projectId}
        value={value}
        onChange={onChange}
        selectedRefs={selectedFileRefs ?? []}
        onSelectedRefsChange={onSelectedFileRefsChange ?? (() => undefined)}
      />
      <ComposerAttachmentList attachments={attachments ?? []} onRemove={onRemoveAttachment ?? (() => undefined)} />
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={(event) => {
          const files = imageFilesFromPaste(event);
          if (files.length === 0) return;
          event.preventDefault();
          void onAttachFiles?.(files);
        }}
        disabled={Boolean(disabledReason)}
        placeholder={disabledReason ?? (runningConversation ? "补充要求；支持实时引导时会发送给当前执行" : "输入问题或下一步需求")}
      />
    </ComposerFrame>
  );
}

export function AgentTurnModeControl({
  productMode,
  value,
  onChange,
  planDisabledReason,
}: {
  productMode?: ProductMode;
  value?: AgentTurnMode;
  onChange?: (mode: AgentTurnMode) => void | Promise<void>;
  planDisabledReason?: string | null;
}): ReactElement | null {
  if (productMode !== "agent" || !value || !onChange) return null;
  return (
    <div className="agent-turn-mode-segment" role="group" aria-label="Agent 执行模式" data-testid="agent-turn-mode-control">
      <button type="button" className={value === "default" ? "active" : ""} aria-pressed={value === "default"} onClick={() => void onChange("default")}>Default</button>
      <button
        type="button"
        className={value === "plan" ? "active" : ""}
        aria-pressed={value === "plan"}
        disabled={Boolean(planDisabledReason) && value !== "plan"}
        title={planDisabledReason ?? "Plan"}
        onClick={() => void onChange("plan")}
      >Plan</button>
    </div>
  );
}

function resizeComposerTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  const contentHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.min(160, Math.max(44, contentHeight))}px`;
  textarea.style.overflowY = contentHeight > 160 ? "auto" : "hidden";
}
