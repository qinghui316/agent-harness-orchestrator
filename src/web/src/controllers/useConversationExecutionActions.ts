import { useCallback, useRef, type MutableRefObject } from "react";
import type { ComposerDraftSnapshot, SkillListItem } from "../types.js";
import type {
  ComposerDraftContent,
  ComposerDraftSettlementOptions,
  ComposerDraftSyncOwner,
} from "./ComposerDraftSyncOwner.js";
import type { ConversationDraftController } from "./ConversationDraftController.js";
import {
  composerActionOwnsCurrentScope,
  composerDraftContent,
  composerErrorMessage,
  composerProductMode,
  composerStopIdentity,
  defaultAttachmentPrompt,
  defaultComposerIds,
  effectiveComposerProviderId,
  prepareComposerInput,
  resolveAgentTurnModeDisabledReason,
  resolveAgentTurnModelDisabledReason,
  resolveAttachmentCapabilityDisabledReason,
  resolveDraftProviderDisabledReason,
  type ComposerTransition,
  type ConversationComposerScope,
  type ConversationExecutionActionPorts,
  type CurrentValueRef,
} from "./conversation-composer-contract.js";

interface ConversationExecutionDraftPort {
  controller: Pick<ConversationDraftController, "read" | "clearAcceptedSnapshot">;
  syncOwner: Pick<ComposerDraftSyncOwner, "load">;
  flushDraft(): Promise<string | null>;
  settleAcceptedDraft(accepted: ComposerDraftContent, options?: ComposerDraftSettlementOptions): Promise<void>;
  applyRestoredSnapshot(snapshot: ComposerDraftSnapshot): void;
  setComposerText(next: string | ((current: string) => string)): void;
  cleanupTransition(transition: ComposerTransition): void;
}

interface ConversationExecutionResourcePort {
  skillItems: SkillListItem[];
  invalidateRequests(): void;
}

interface ConversationSubmissionPort {
  submitMessage(): Promise<void>;
}

export interface ConversationExecutionActions {
  send(): Promise<void>;
  enqueue(): Promise<void>;
  reclaimQueuedTurn(queueItemId: string): Promise<void>;
  stop(): Promise<void>;
  cleanupTransition(transition: ComposerTransition): void;
}

export function useConversationExecutionActions(
  portsRef: CurrentValueRef<ConversationExecutionActionPorts>,
  scopeRef: MutableRefObject<ConversationComposerScope>,
  scopeGenerationRef: MutableRefObject<number>,
  draft: ConversationExecutionDraftPort,
  resources: ConversationExecutionResourcePort,
  submission: ConversationSubmissionPort,
): ConversationExecutionActions {
  const steerRetryRef = useRef<{ key: string; clientRequestId: string } | null>(null);

  const enqueue = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    const queue = portsRef.current.queue;
    const generation = scopeGenerationRef.current;
    const captured = draft.controller.read();
    const productMode = composerProductMode(currentScope);
    if (!currentScope.projectId || !currentScope.conversation || !queue) return;
    if (queue.loading || !queue.snapshot) {
      portsRef.current.onError("正在读取当前会话队列，请稍后重试。");
      return;
    }
    if (currentScope.conversation.state !== "active") {
      portsRef.current.onError("已完成或稍后处理的需求对话为只读，不能加入队列。");
      return;
    }
    const attachmentIds = captured.attachments.map((attachment) => attachment.id);
    if (!captured.text.trim() && attachmentIds.length === 0) return;
    const prepared = prepareComposerInput({
      body: captured.text,
      selectedRefs: captured.contextRefs,
      skills: resources.skillItems,
      conversationId: currentScope.conversation.id,
      draftSkillOverrides: captured.skillOverrides,
    });
    const providerId = effectiveComposerProviderId(currentScope);
    const selectionError = resolveAgentTurnModeDisabledReason(currentScope, captured.agentTurnMode)
      ?? resolveAgentTurnModelDisabledReason(currentScope, captured.agentTurnMode, captured.modelId, captured.reasoningEffort)
      ?? resolveDraftProviderDisabledReason(currentScope)
      ?? resolveAttachmentCapabilityDisabledReason(currentScope, captured.attachments);
    if (selectionError) {
      portsRef.current.onError(selectionError);
      return;
    }
    if (!providerId) {
      portsRef.current.onError("请先选择本次对话使用的 Agent。");
      return;
    }
    try {
      const expectedDraftUpdatedAt = await draft.flushDraft();
      const queued = await queue.enqueue({
        text: prepared.text || defaultAttachmentPrompt(attachmentIds.length),
        contextRefs: prepared.contextRefs,
        attachmentIds,
        skillOverrides: prepared.skillOverrides,
        providerId,
        agentTurnMode: productMode === "agent" ? captured.agentTurnMode : null,
        modelId: productMode === "agent" ? captured.modelId : null,
        reasoningEffort: productMode === "agent" ? captured.reasoningEffort : null,
        expectedDraftUpdatedAt,
      });
      if (!queued) {
        if (ownsAction(generation, currentScope)) portsRef.current.onError("当前会话队列已变化，请等待校准后重试。");
        return;
      }
      await draft.syncOwner.load(currentScope.projectId, productMode);
      if (!ownsAction(generation, currentScope)) return;
      draft.controller.clearAcceptedSnapshot(captured, {
        text: true,
        contextRefs: true,
        attachments: true,
        skillOverrides: true,
      });
      portsRef.current.onError(null);
    } catch (cause) {
      if (ownsAction(generation, currentScope)) portsRef.current.onError(composerErrorMessage(cause));
      throw cause;
    }
  }, [draft, resources]);

  const reclaimQueuedTurn = useCallback(async (queueItemId: string): Promise<void> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const queue = portsRef.current.queue;
    const captured = draft.controller.read();
    if (!currentScope.projectId || !queue || captured.text.trim() || captured.contextRefs.length
      || captured.attachments.length || Object.keys(captured.skillOverrides).length) {
      portsRef.current.onError("请先清空当前输入，再把队列项移回输入框。");
      return;
    }
    const productMode = composerProductMode(currentScope);
    const expectedDraftUpdatedAt = await draft.flushDraft();
    const reclaimed = await queue.reclaim(queueItemId, expectedDraftUpdatedAt);
    if (!reclaimed) {
      if (ownsAction(generation, currentScope)) portsRef.current.onError("当前会话队列已变化，请等待校准后重试。");
      return;
    }
    const restored = await draft.syncOwner.load(currentScope.projectId, productMode);
    if (!restored || !ownsAction(generation, currentScope)) return;
    draft.applyRestoredSnapshot(restored);
  }, [draft]);

  const send = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const captured = draft.controller.read();
    if (!currentScope.running) {
      if (portsRef.current.queue?.snapshot?.items?.length) return enqueue();
      if (portsRef.current.queue && !portsRef.current.queue.snapshot) {
        portsRef.current.onError("当前会话队列状态不可用，校准完成前不能发送新的回合。");
        return;
      }
      return submission.submitMessage();
    }
    if (!currentScope.projectId || !currentScope.conversation) return;
    const prepared = prepareComposerInput({
      body: captured.text,
      selectedRefs: captured.contextRefs,
      skills: resources.skillItems,
      conversationId: currentScope.conversation.id,
      draftSkillOverrides: captured.skillOverrides,
    });
    const productMode = composerProductMode(currentScope);
    const steerIdentityReady = productMode === "harness"
      || Boolean(currentScope.runControlState?.providerId && currentScope.runControlState.attemptId);
    const canSteer = Boolean(prepared.text
      && currentScope.runControlState?.canSteer
      && steerIdentityReady
      && currentScope.runControlState.state !== "stopping"
      && currentScope.runControlState.steerState !== "submitting");
    if (!canSteer) return enqueue();
    const stopIdentity = composerStopIdentity(currentScope);
    const retryKey = `${stopIdentity}\0${prepared.text}`;
    const clientRequestId = steerRetryRef.current?.key === retryKey
      ? steerRetryRef.current.clientRequestId
      : (portsRef.current.ids ?? defaultComposerIds).createClientRequestId();
    steerRetryRef.current = { key: retryKey, clientRequestId };
    const accepted = composerDraftContent({
      projectId: currentScope.projectId,
      productMode,
      agentTurnMode: captured.agentTurnMode,
      agentModelId: captured.modelId,
      agentReasoningEffort: captured.reasoningEffort,
      text: captured.text,
      contextRefs: captured.contextRefs,
      attachments: captured.attachments,
      skillOverrides: captured.skillOverrides,
      selectedProviderId: effectiveComposerProviderId(currentScope),
    });
    try {
      await draft.flushDraft();
    } catch (cause) {
      portsRef.current.onError(composerErrorMessage(cause));
      return;
    }
    const outcome = await runAction(
      "conversation.steer",
      () => portsRef.current.actions.steer({
        projectId: currentScope.projectId!,
        conversationId: currentScope.conversation!.id,
        productMode,
        providerId: currentScope.runControlState?.providerId,
        expectedAttemptId: currentScope.runControlState?.attemptId,
        clientRequestId,
        prompt: prepared.text,
      }),
      currentScope,
      captured.text,
      true,
      (actionGeneration, actionScope) => ownsAction(actionGeneration, actionScope)
        && composerStopIdentity(scopeRef.current) === stopIdentity,
      (result) => result.status !== "already-terminal",
    );
    if (outcome.status !== "already-terminal") await draft.settleAcceptedDraft(accepted, { text: true });
    if (outcome.status === "already-terminal"
      && ownsAction(generation, currentScope)
      && composerStopIdentity(scopeRef.current) === stopIdentity) {
      portsRef.current.onError("当前执行已结束，这条文本已保留，可作为下一回合发送。");
    }
    if (steerRetryRef.current?.key === retryKey) steerRetryRef.current = null;
  }, [draft, enqueue, resources, submission]);

  const stop = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    if (!currentScope.projectId || !currentScope.conversation) return;
    const submittedText = draft.controller.read().text;
    const productMode = composerProductMode(currentScope);
    if (productMode === "agent"
      && (!currentScope.runControlState?.canStop
        || !currentScope.runControlState.providerId
        || !currentScope.runControlState.attemptId)) {
      portsRef.current.onError("当前 Agent 回合没有可验证的停止身份，请刷新后重试。");
      return;
    }
    const stopIdentity = composerStopIdentity(currentScope);
    await runAction(
      "conversation.interrupt",
      () => portsRef.current.actions.stop({
        projectId: currentScope.projectId!,
        conversationId: currentScope.conversation!.id,
        productMode,
        ...(productMode === "agent" ? {
          providerId: currentScope.runControlState!.providerId,
          expectedAttemptId: currentScope.runControlState!.attemptId,
        } : { prompt: submittedText.trim() || undefined }),
      }),
      currentScope,
      submittedText,
      productMode !== "agent",
      (actionGeneration, actionScope) => ownsAction(actionGeneration, actionScope)
        && composerStopIdentity(scopeRef.current) === stopIdentity,
    );
  }, [draft]);

  const cleanupTransition = useCallback((transition: ComposerTransition): void => {
    resources.invalidateRequests();
    draft.cleanupTransition(transition);
  }, [draft, resources]);

  function ownsAction(generation: number, actionScope: ConversationComposerScope): boolean {
    return composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef);
  }

  async function calibrateTimeline(projectId: string, conversationId: string, canPublishError: () => boolean): Promise<void> {
    try {
      await portsRef.current.timeline.calibrate(projectId, conversationId, "main-agent");
    } catch (cause) {
      if (canPublishError()) portsRef.current.onError(composerErrorMessage(cause));
    }
  }

  async function runAction<TResult>(
    key: string,
    action: () => Promise<TResult>,
    actionScope: ConversationComposerScope,
    submittedText: string,
    clearSubmittedText: boolean,
    ownsCurrentScope: (generation: number, actionScope: ConversationComposerScope) => boolean = ownsAction,
    shouldClearSubmittedText: (result: TResult) => boolean = () => true,
  ): Promise<TResult> {
    const token = portsRef.current.operation.begin(key);
    const generation = scopeGenerationRef.current;
    if (ownsCurrentScope(generation, actionScope)) portsRef.current.onError(null);
    try {
      const result = await action();
      if (clearSubmittedText && shouldClearSubmittedText(result) && ownsCurrentScope(generation, actionScope)) {
        draft.setComposerText((current) => current === submittedText ? "" : current);
      }
      return result;
    } catch (cause) {
      if (ownsCurrentScope(generation, actionScope)) portsRef.current.onError(composerErrorMessage(cause));
      throw cause;
    } finally {
      if (actionScope.projectId && actionScope.conversation && ownsCurrentScope(generation, actionScope)) {
        await calibrateTimeline(
          actionScope.projectId,
          actionScope.conversation.id,
          () => ownsCurrentScope(generation, actionScope),
        );
      }
      portsRef.current.operation.release(token);
    }
  }

  return { send, enqueue, reclaimQueuedTurn, stop, cleanupTransition };
}
