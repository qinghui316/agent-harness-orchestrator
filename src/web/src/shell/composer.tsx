import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AlertCircle, CheckCircle2, Gauge, ListPlus, RefreshCw, RotateCcw, Send, Square, Trash2, Undo2 } from "lucide-react";
import type { AgentTurnMode, ConversationContextSnapshot, ConversationTurnQueueSnapshot, ProductMode, ProviderModelSettingsSnapshot, SkillListItem, TopicAttachment, TopicFileReference, WorkpadRuntimeStatus } from "../types.js";
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
  turnQueue,
  queueAvailable,
  queueBusy,
  onEnqueue,
  onReclaimQueuedTurn,
  onRemoveQueuedTurn,
  onRetryQueuedTurn,
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
    providerId?: string;
    attemptId?: string;
    runId?: string;
  };
  providerOptions?: Array<{ id: string; label: string }>;
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
  conversationContext?: ConversationContextSnapshot | null;
  contextSubmitting?: boolean;
  onCompactContext?: () => void | Promise<void>;
  turnQueue?: ConversationTurnQueueSnapshot | null;
  queueAvailable?: boolean;
  queueBusy?: boolean;
  onEnqueue?: () => void | Promise<void>;
  onReclaimQueuedTurn?: (queueItemId: string) => void | Promise<void>;
  onRemoveQueuedTurn?: (queueItemId: string) => void | Promise<void>;
  onRetryQueuedTurn?: (queueItemId: string) => void | Promise<void>;
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
  const steerIdentityReady = productMode === "harness"
    || Boolean(runControlState?.providerId && runControlState.attemptId);
  const canSteerText = runningConversation
    && Boolean(value.trim())
    && Boolean(runControlState?.canSteer)
    && steerIdentityReady
    && runControlState?.steerState !== "submitting"
    && runControlState?.state !== "stopping";
  const canQueue = canSend && Boolean(turnQueue?.canEnqueue) && !queueBusy;
  const sendDisabled = Boolean(disabledReason)
    || (!runningConversation && Boolean(agentTurnModeDisabledReason))
    || (runningConversation ? (!canSteerText && !canQueue) : !canSend || Boolean(queueBusy) || queueAvailable === false);
  const buttonTitle = runningConversation
    ? runControlState?.state === "stopping"
      ? "当前执行正在停止"
      : runControlState?.steerState === "submitting"
        ? "正在发送给当前执行"
        : canSteerText
          ? "发送给当前执行"
          : "加入下一回合队列"
    : queueAvailable === false ? "正在校准会话队列"
      : turnQueue?.items?.length ? "加入下一回合队列" : "发送";
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
        <button
          className="composer-queue-button"
          type="button"
          disabled={Boolean(disabledReason) || !canQueue}
          title={turnQueue?.disabledReason ?? "加入下一回合队列"}
          aria-label="加入下一回合队列"
          onClick={() => void onEnqueue?.()}
        >
          {queueBusy ? <RefreshCw size={15} className="spin" /> : <ListPlus size={15} />}
        </button>
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
      <ConversationTurnQueue
        snapshot={turnQueue ?? null}
        busy={Boolean(queueBusy)}
        onReclaim={onReclaimQueuedTurn}
        onRemove={onRemoveQueuedTurn}
        onRetry={onRetryQueuedTurn}
      />
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

export function ConversationTurnQueue({
  snapshot,
  busy,
  onReclaim,
  onRemove,
  onRetry,
}: {
  snapshot: ConversationTurnQueueSnapshot | null;
  busy: boolean;
  onReclaim?: (queueItemId: string) => void | Promise<void>;
  onRemove?: (queueItemId: string) => void | Promise<void>;
  onRetry?: (queueItemId: string) => void | Promise<void>;
}): ReactElement | null {
  if (!snapshot?.items?.length) return null;
  return <div className="conversation-turn-queue" aria-label="下一回合队列">
    <div className="conversation-turn-queue-heading">
      <span>下一回合</span>
      <span>{snapshot.items.length}</span>
    </div>
    <ol>
      {snapshot.items.map((item, index) => {
        const needsAttention = queuedTurnNeedsAttention(item.status);
        const settlementPending = queuedTurnSettlementPending(item.status);
        return <li key={item.queueItemId} data-attention={needsAttention ? "true" : undefined}>
          <span className="conversation-turn-queue-index">{index + 1}</span>
          <span className="conversation-turn-queue-copy">
            <span>{queuePreview(item.text)}</span>
            <small>{queuedTurnStatusLabel(item.status, item.attachmentIds.length)}</small>
          </span>
          <span className="conversation-turn-queue-actions">
            {needsAttention ? <button
              type="button"
              title="重新尝试"
              aria-label="重新尝试队列项"
              disabled={busy}
              onClick={() => void onRetry?.(item.queueItemId)}
            ><RotateCcw size={14} /></button> : null}
            <button
              type="button"
              title="移回输入框"
              aria-label="移回输入框"
              disabled={busy || settlementPending}
              onClick={() => void onReclaim?.(item.queueItemId)}
            ><Undo2 size={14} /></button>
            <button
              type="button"
              title="删除队列项"
              aria-label="删除队列项"
              disabled={busy || settlementPending}
              onClick={() => void onRemove?.(item.queueItemId)}
            ><Trash2 size={14} /></button>
          </span>
        </li>;
      })}
    </ol>
  </div>;
}

function queuePreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 95)}...` : normalized;
}

function queuedTurnStatusLabel(status: string, attachmentCount: number): string {
  const statusLabel = status === "dispatching" ? "正在提交"
    : status === "blocked" ? "需要处理"
      : "等待发送";
  return attachmentCount > 0 ? `${statusLabel} · ${attachmentCount} 个附件` : statusLabel;
}

function queuedTurnNeedsAttention(status: string): boolean {
  return status === "blocked";
}

function queuedTurnSettlementPending(status: string): boolean {
  return status === "dispatching";
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
