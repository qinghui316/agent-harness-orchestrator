import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AlertCircle, CheckCircle2, Gauge, RefreshCw, Send, Square } from "lucide-react";
import type { AgentTurnMode, ConversationContextSnapshot, ProductMode, ProviderModelSettingsSnapshot, SkillListItem, TopicAttachment, TopicFileReference, WorkpadRuntimeStatus } from "../types.js";
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
  agentModelId,
  agentReasoningEffort,
  providerModelSettings,
  onSelectAgentModel,
  onSelectAgentReasoningEffort,
  productMode,
  onSend,
  onStopAndContinue,
  actionRunning,
  currentWorkpadStatus,
  runControlState,
  providerOptions,
  selectedProviderId,
  onSelectProvider,
  conversationContext,
  contextSubmitting,
  onCompactContext,
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
  agentModelId?: string | null;
  agentReasoningEffort?: string | null;
  providerModelSettings?: ProviderModelSettingsSnapshot | null;
  onSelectAgentModel?: (modelId: string | null) => void | Promise<void>;
  onSelectAgentReasoningEffort?: (effort: string | null) => void | Promise<void>;
  onSend: () => Promise<void>;
  onStopAndContinue?: () => Promise<void>;
  actionRunning: string | null;
  currentWorkpadStatus?: WorkpadRuntimeStatus;
  runControlState?: {
    state?: "idle" | "running" | "stopping";
    canStop: boolean;
    canSteer?: boolean;
    steerState?: "idle" | "submitting";
  };
  providerOptions?: Array<{ id: string; label: string }>;
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
  conversationContext?: ConversationContextSnapshot | null;
  contextSubmitting?: boolean;
  onCompactContext?: () => void | Promise<void>;
}): ReactElement {
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [openContextKind, setOpenContextKind] = useState<ComposerContextKind | null>(null);
  const runningConversation = Boolean(actionRunning) || currentWorkpadStatus === "running";
  const canStop = runningConversation
    && Boolean(onStopAndContinue)
    && Boolean(runControlState?.canStop);
  const hasAttachments = (attachments?.length ?? 0) > 0;
  const contextSummary = useMemo(() => buildComposerContextSummary({
    skills,
    activeSkillIds,
    selectedFileRefs,
    attachments,
  }), [skills, activeSkillIds, selectedFileRefs, attachments]);
  const canSend = Boolean(value.trim()) || hasAttachments;
  const steeringUnavailable = runningConversation
    && (!value.trim()
      || !runControlState?.canSteer
      || runControlState.steerState === "submitting"
      || runControlState.state === "stopping");
  const sendDisabled = Boolean(disabledReason)
    || (!runningConversation && Boolean(agentTurnModeDisabledReason))
    || (runningConversation ? steeringUnavailable : !canSend);
  const buttonTitle = runningConversation
    ? runControlState?.state === "stopping"
      ? "当前执行正在停止"
      : runControlState?.steerState === "submitting"
        ? "正在发送给当前执行"
        : runControlState?.canSteer
          ? "发送给当前执行"
          : "当前执行不支持实时引导"
    : "发送";
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
    void onSend();
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
      </div>}
      toolbar={<>
        <ComposerAttachButton disabled={Boolean(disabledReason)} onAttachFiles={onAttachFiles} />
        <ConversationContextIndicator
          snapshot={conversationContext ?? null}
          submitting={Boolean(contextSubmitting)}
          onCompact={onCompactContext}
        />
        <span className="composer-spacer" />
        {canStop ? <button
          className="composer-stop"
          type="button"
          title="停止当前执行"
          aria-label="停止当前执行"
          onClick={() => void onStopAndContinue?.()}
        >
          <Square size={14} fill="currentColor" />
        </button> : null}
        <button
          className={`composer-send ${actionRunning ? "running" : ""}`}
          disabled={sendDisabled}
          title={!runningConversation && agentTurnModeDisabledReason ? agentTurnModeDisabledReason : buttonTitle}
          onClick={submit}
        >
          <Send size={16} />
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
        placeholder={disabledReason ?? (runningConversation
          ? runControlState?.canSteer ? "补充当前执行" : "当前回合运行中"
          : "输入问题或下一步需求")}
      />
    </ComposerFrame>
  );
}

export function ConversationContextIndicator({
  snapshot,
  submitting,
  onCompact,
}: {
  snapshot: ConversationContextSnapshot | null;
  submitting: boolean;
  onCompact?: () => void | Promise<void>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const lifecycle = submitting ? "submitting" : snapshot?.lifecycle ?? "idle";
  const busy = lifecycle === "submitting" || lifecycle === "compacting";
  const failed = lifecycle === "failed" || lifecycle === "interrupted";
  const title = failed
    ? lifecycle === "failed" ? "上下文压缩失败" : "上下文压缩已中断"
    : busy
      ? "正在压缩上下文"
      : snapshot?.usedPercent !== null && snapshot?.usedPercent !== undefined
        ? `上下文已使用 ${snapshot.usedPercent}%`
        : "上下文用量";
  return <div className="conversation-context-control">
    <button
      type="button"
      className={`conversation-context-indicator ${busy ? "is-busy" : ""} ${failed ? "is-error" : ""}`}
      aria-label={title}
      title={title}
      onClick={() => setOpen((value) => !value)}
    >
      {busy ? <RefreshCw size={15} /> : failed ? <AlertCircle size={15} /> : lifecycle === "completed" ? <CheckCircle2 size={15} /> : <Gauge size={15} />}
      {snapshot?.usedPercent !== null && snapshot?.usedPercent !== undefined ? <span>{snapshot.usedPercent}%</span> : null}
    </button>
    {open ? <div className="conversation-context-popover" role="dialog" aria-label="会话上下文">
      <div className="conversation-context-popover-header">
        <strong>会话上下文</strong>
        <span>{contextUsageLabel(snapshot)}</span>
      </div>
      <dl>
        <div><dt>已用</dt><dd>{formatTokens(snapshot?.usage?.contextUsedTokens)}</dd></div>
        <div><dt>剩余</dt><dd>{snapshot?.remainingPercent === null || snapshot?.remainingPercent === undefined ? "未知" : `${snapshot.remainingPercent}%`}</dd></div>
        <div><dt>窗口</dt><dd>{formatTokens(snapshot?.usage?.modelContextWindow)}</dd></div>
        <div><dt>最近一轮输入</dt><dd>{formatTokens(snapshot?.usage?.last.inputTokens)}</dd></div>
        <div><dt>缓存输入</dt><dd>{formatTokens(snapshot?.usage?.last.cachedInputTokens)}</dd></div>
        <div><dt>最近压缩</dt><dd>{formatContextTime(snapshot?.lastCompactedAt)}</dd></div>
      </dl>
      <button
        type="button"
        className="conversation-context-compact"
        disabled={!snapshot?.canCompact || busy || !onCompact}
        title={snapshot?.disabledReason ?? "压缩当前会话上下文"}
        onClick={() => void onCompact?.()}
      >
        <RefreshCw size={14} />
        <span>压缩上下文</span>
      </button>
      {snapshot?.disabledReason ? <p>{snapshot.disabledReason}</p> : null}
    </div> : null}
  </div>;
}

function contextUsageLabel(snapshot: ConversationContextSnapshot | null): string {
  if (!snapshot?.usage) return "暂无可靠用量";
  return snapshot.usedPercent === null ? formatTokens(snapshot.usage.contextUsedTokens) : `${snapshot.usedPercent}% 已用`;
}

function formatTokens(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "未知";
}

function formatContextTime(value: string | null | undefined): string {
  if (!value) return "尚未压缩";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString();
}

export function AgentTurnModelControls({
  productMode,
  modelId,
  reasoningEffort,
  modelSettings,
  onSelectModel,
  onSelectReasoningEffort,
}: {
  productMode?: ProductMode;
  modelId?: string | null;
  reasoningEffort?: string | null;
  modelSettings?: ProviderModelSettingsSnapshot | null;
  onSelectModel?: (modelId: string | null) => void | Promise<void>;
  onSelectReasoningEffort?: (effort: string | null) => void | Promise<void>;
}): ReactElement | null {
  if (productMode !== "agent" || !onSelectModel || !onSelectReasoningEffort) return null;
  const candidates = modelSettings?.candidates ?? [];
  const resolvedModelId = modelId ?? modelSettings?.effectiveModel?.modelId ?? null;
  const candidate = resolvedModelId
    ? candidates.find((item) => item.modelId.toLowerCase() === resolvedModelId.toLowerCase()) ?? null
    : null;
  const efforts = candidate?.supportedReasoningEfforts ?? [];
  const modelIsUnavailable = Boolean(modelId && !candidates.some((item) => item.modelId.toLowerCase() === modelId.toLowerCase()));
  const effortIsUnavailable = Boolean(reasoningEffort && !efforts.some((option) => option.value === reasoningEffort));
  return (
    <div className="agent-turn-model-controls" data-testid="agent-turn-model-controls">
      <label>
        <span className="sr-only">本次 Turn 模型</span>
        <select
          aria-label="本次 Turn 模型"
          value={modelId ?? ""}
          onChange={(event) => void onSelectModel(event.target.value || null)}
        >
          <option value="">跟随 Provider 配置</option>
          {modelIsUnavailable ? <option value={modelId!}>不可用：{modelId}</option> : null}
          {candidates.map((item) => <option key={`${item.source}:${item.modelId}`} value={item.modelId}>{item.label}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">本次 Turn 推理强度</span>
        <select
          aria-label="本次 Turn 推理强度"
          value={reasoningEffort ?? ""}
          onChange={(event) => void onSelectReasoningEffort(event.target.value || null)}
        >
          <option value="">使用模型默认值</option>
          {effortIsUnavailable ? <option value={reasoningEffort!}>不可用：{reasoningEffort}</option> : null}
          {efforts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
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
