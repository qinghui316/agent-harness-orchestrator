import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, postJson } from "../api.js";
import type { ProductMode, ProjectGitReviewOptions, ProviderReviewTarget } from "../types.js";
import type { ConversationTurnQueueEnqueueInput } from "./useConversationTurnQueueController.js";

type ConversationReviewReceipt = {
  projectId: string;
  conversationId: string;
};

type QueuePort = {
  snapshot: { items: unknown[]; canDispatch: boolean; executionRevision: string | null } | null;
  loading: boolean;
  enqueue(input: ConversationTurnQueueEnqueueInput): Promise<unknown>;
};

export function useConversationReviewController(input: {
  projectId: string | null;
  productMode: ProductMode;
  conversationId: string | null;
  providerId: string | null;
  expectedTimelineRevision: number | null;
  running: boolean;
  queue: QueuePort;
  flushDraft(): Promise<string | null>;
  clearAcceptedCommand(capturedText: string, expectedDraftUpdatedAt: string | null): Promise<void>;
  navigateConversation(projectId: string, conversationId: string): Promise<void>;
  onError(message: string | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ProjectGitReviewOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(input);
  const identity = [input.projectId ?? "", input.productMode, input.conversationId ?? "", input.providerId ?? ""].join("\0");
  const identityRef = useRef(identity);
  const generationRef = useRef(0);
  const submittingRef = useRef(false);
  const selectorCommandRef = useRef<string | undefined>(undefined);
  inputRef.current = input;
  identityRef.current = identity;

  useEffect(() => {
    generationRef.current += 1;
    setOpen(false);
    setOptions(null);
    setLoading(false);
    setSubmitting(false);
    submittingRef.current = false;
    selectorCommandRef.current = undefined;
  }, [identity]);

  const openSelector = useCallback(async (capturedCommand?: string): Promise<void> => {
    const current = inputRef.current;
    if (!current.projectId || current.productMode !== "agent") return;
    const requestIdentity = identityRef.current;
    const generation = ++generationRef.current;
    selectorCommandRef.current = capturedCommand;
    setOpen(true);
    setLoading(true);
    try {
      const next = await fetchJson<ProjectGitReviewOptions>(
        `/api/projects/${encodeURIComponent(current.projectId)}/git/review-options`,
      );
      if (requestIdentity === identityRef.current && generation === generationRef.current) setOptions(next);
    } catch (cause) {
      if (requestIdentity === identityRef.current && generation === generationRef.current) current.onError(errorMessage(cause));
    } finally {
      if (requestIdentity === identityRef.current && generation === generationRef.current) setLoading(false);
    }
  }, []);

  const closeSelector = useCallback(() => {
    generationRef.current += 1;
    selectorCommandRef.current = undefined;
    setOpen(false);
  }, []);

  const start = useCallback(async (target: ProviderReviewTarget, capturedCommand?: string): Promise<void> => {
    const current = inputRef.current;
    if (submittingRef.current) return;
    if (!current.projectId || current.productMode !== "agent" || !current.providerId) {
      current.onError("代码审查需要已选择的 Agent 项目和 Provider。");
      return;
    }
    const requestIdentity = identityRef.current;
    const generation = ++generationRef.current;
    submittingRef.current = true;
    setSubmitting(true);
    let draftToken: string | null = null;
    let createdConversation: ConversationReviewReceipt | null = null;
    try {
      draftToken = await current.flushDraft();
      const shouldQueue = Boolean(current.conversationId
        && (current.running || current.queue.snapshot?.items.length || current.queue.snapshot?.canDispatch === false));
      if (shouldQueue) {
        if (current.queue.loading || !current.queue.snapshot) throw new Error("正在校准当前会话队列，请稍后重试。");
        await current.queue.enqueue({
          itemKind: "review",
          reviewTarget: target,
          text: "",
          contextRefs: [],
          attachmentIds: [],
          skillOverrides: {},
          providerId: current.providerId,
          agentTurnMode: null,
          modelId: null,
          reasoningEffort: null,
          expectedDraftUpdatedAt: draftToken,
        });
      } else {
        const receipt = await postJson<ConversationReviewReceipt>(`/api/projects/${encodeURIComponent(current.projectId)}/workbench/reviews`, {
          productMode: "agent",
          conversationId: current.conversationId,
          providerId: current.providerId,
          target,
          expectedTimelineRevision: current.conversationId ? current.expectedTimelineRevision : null,
          expectedExecutionRevision: current.conversationId ? current.queue.snapshot?.executionRevision ?? null : null,
          clientRequestId: createRequestId("conversation-review"),
        });
        if (!current.conversationId) {
          if (receipt.projectId !== current.projectId || !receipt.conversationId) {
            throw new Error("代码审查返回的会话身份与当前项目不一致。");
          }
          createdConversation = receipt;
        }
      }
      if (createdConversation
        && requestIdentity === identityRef.current
        && generation === generationRef.current) {
        await current.navigateConversation(createdConversation.projectId, createdConversation.conversationId);
      }
      if (capturedCommand) await current.clearAcceptedCommand(capturedCommand, draftToken);
      if (requestIdentity === identityRef.current && generation === generationRef.current) {
        setOpen(false);
        selectorCommandRef.current = undefined;
        current.onError(null);
      }
    } catch (cause) {
      if (requestIdentity === identityRef.current && generation === generationRef.current) current.onError(errorMessage(cause));
    } finally {
      if (requestIdentity === identityRef.current && generation === generationRef.current) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }, []);

  const startSelected = useCallback(async (target: ProviderReviewTarget): Promise<void> => {
    await start(target, selectorCommandRef.current);
  }, [start]);

  return { open, options, loading, submitting, openSelector, closeSelector, start, startSelected };
}

function createRequestId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
