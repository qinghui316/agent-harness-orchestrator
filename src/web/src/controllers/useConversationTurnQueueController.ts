import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, postJson } from "../api.js";
import type {
  ConversationQueuedTurnInput,
  ConversationTurnQueueSnapshot,
  ProductMode,
  WorkbenchLiveEvent,
} from "../types.js";

export interface ConversationTurnQueueEnqueueInput extends ConversationQueuedTurnInput {
  expectedDraftUpdatedAt: string | null;
}

export function useConversationTurnQueueController(input: {
  projectId: string | null;
  productMode: ProductMode;
  conversationId: string | null;
  executionKey?: string | null;
  onError(message: string): void;
}) {
  const [snapshot, setSnapshot] = useState<ConversationTurnQueueSnapshot | null>(null);
  const [snapshotCalibrationKey, setSnapshotCalibrationKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const identity = queueIdentity(input);
  const identityRef = useRef(identity);
  const inputRef = useRef(input);
  const snapshotRef = useRef(snapshot);
  const snapshotCalibrationKeyRef = useRef<string | null>(null);
  const responseGenerationRef = useRef(0);
  const dispatchRevisionRef = useRef<string | null>(null);
  const enqueueRetryRef = useRef<{ key: string; clientRequestId: string } | null>(null);
  const invalidationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executionKeyRef = useRef(input.executionKey ?? "");
  identityRef.current = identity;
  inputRef.current = input;
  snapshotRef.current = snapshot;

  const load = useCallback(async (): Promise<ConversationTurnQueueSnapshot | null> => {
    const current = inputRef.current;
    if (!current.projectId || !current.conversationId) {
      setSnapshot(null);
      return null;
    }
    const requestIdentity = queueIdentity(current);
    const requestCalibrationKey = queueCalibrationKey(current);
    const generation = ++responseGenerationRef.current;
    setLoading(true);
    try {
      const result = await fetchJson<ConversationTurnQueueSnapshot>(queueReadUrl(current));
      if (identityRef.current === requestIdentity && generation === responseGenerationRef.current) {
        setSnapshot(result);
        snapshotRef.current = result;
        setSnapshotCalibrationKey(requestCalibrationKey);
        snapshotCalibrationKeyRef.current = requestCalibrationKey;
      }
      return result;
    } catch (cause) {
      if (identityRef.current === requestIdentity && generation === responseGenerationRef.current) {
        current.onError(errorMessage(cause));
      }
      return null;
    } finally {
      if (identityRef.current === requestIdentity && generation === responseGenerationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    dispatchRevisionRef.current = null;
    enqueueRetryRef.current = null;
    setSnapshot(null);
    setSnapshotCalibrationKey(null);
    snapshotCalibrationKeyRef.current = null;
    void load();
  }, [identity, load]);

  useEffect(() => {
    const nextExecutionKey = input.executionKey ?? "";
    if (executionKeyRef.current === nextExecutionKey) return;
    executionKeyRef.current = nextExecutionKey;
    void load();
  }, [input.executionKey, load]);

  useEffect(() => () => {
    if (invalidationTimerRef.current) clearTimeout(invalidationTimerRef.current);
  }, []);

  const applyMutation = useCallback(async (
    action: (current: typeof input, snapshot: ConversationTurnQueueSnapshot) => Promise<ConversationTurnQueueSnapshot>,
  ): Promise<ConversationTurnQueueSnapshot | null> => {
    const current = inputRef.current;
    const currentSnapshot = snapshotRef.current;
    if (!current.projectId || !current.conversationId || !currentSnapshot
      || snapshotCalibrationKeyRef.current !== queueCalibrationKey(current)) return null;
    const requestIdentity = queueIdentity(current);
    const responseGeneration = ++responseGenerationRef.current;
    setMutating(true);
    try {
      const result = await action(current, currentSnapshot);
      if (identityRef.current === requestIdentity && responseGeneration === responseGenerationRef.current) {
        setSnapshot(result);
        snapshotRef.current = result;
        const calibrationKey = queueCalibrationKey(current);
        setSnapshotCalibrationKey(calibrationKey);
        snapshotCalibrationKeyRef.current = calibrationKey;
      }
      return result;
    } catch (cause) {
      if (identityRef.current === requestIdentity && responseGeneration === responseGenerationRef.current) {
        current.onError(errorMessage(cause));
        await load();
      }
      throw cause;
    } finally {
      if (identityRef.current === requestIdentity) setMutating(false);
    }
  }, [load]);

  const enqueue = useCallback(async (queuedInput: ConversationTurnQueueEnqueueInput) => {
    const key = JSON.stringify(queuedInput);
    const clientRequestId = enqueueRetryRef.current?.key === key
      ? enqueueRetryRef.current.clientRequestId
      : createRequestId("turn-queue");
    enqueueRetryRef.current = { key, clientRequestId };
    const result = await applyMutation((current, currentSnapshot) => {
      if (!currentSnapshot.executionRevision) throw new Error("Conversation execution identity is unavailable.");
      return postJson<ConversationTurnQueueSnapshot>(baseQueueUrl(current), {
        ...queuedInput,
        productMode: current.productMode,
        clientRequestId,
        expectedRevision: currentSnapshot.revision,
        expectedExecutionRevision: currentSnapshot.executionRevision,
      });
    });
    if (result) enqueueRetryRef.current = null;
    return result;
  }, [applyMutation]);

  const remove = useCallback((queueItemId: string) => applyMutation(async (current, currentSnapshot) => {
    const response = await fetch(`${baseQueueUrl(current)}/${encodeURIComponent(queueItemId)}?${new URLSearchParams({
      productMode: current.productMode,
      expectedRevision: currentSnapshot.revision,
    }).toString()}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<ConversationTurnQueueSnapshot>;
  }), [applyMutation]);

  const reclaim = useCallback((queueItemId: string, expectedDraftUpdatedAt: string | null) => applyMutation(
    (current, currentSnapshot) => postJson<ConversationTurnQueueSnapshot>(
      `${baseQueueUrl(current)}/${encodeURIComponent(queueItemId)}/reclaim`,
      { productMode: current.productMode, expectedRevision: currentSnapshot.revision, expectedDraftUpdatedAt },
    ),
  ), [applyMutation]);

  const retry = useCallback((queueItemId: string) => applyMutation(
    (current, currentSnapshot) => postJson<ConversationTurnQueueSnapshot>(
      `${baseQueueUrl(current)}/${encodeURIComponent(queueItemId)}/retry`,
      { productMode: current.productMode, expectedRevision: currentSnapshot.revision },
    ),
  ), [applyMutation]);

  const dispatchNext = useCallback(async (): Promise<ConversationTurnQueueSnapshot | null> => {
    const current = inputRef.current;
    const currentSnapshot = snapshotRef.current;
    if (!current.projectId || !current.conversationId || !currentSnapshot) return null;
    const requestIdentity = queueIdentity(current);
    try {
      const result = await postJson<ConversationTurnQueueSnapshot>(
        `${baseQueueUrl(current)}/dispatch-next`,
        { productMode: current.productMode, expectedRevision: currentSnapshot.revision },
      );
      if (identityRef.current === requestIdentity) {
        dispatchRevisionRef.current = null;
        await load();
      }
      return result;
    } catch (cause) {
      if (identityRef.current === requestIdentity) {
        dispatchRevisionRef.current = null;
        current.onError(errorMessage(cause));
        await load();
      }
      throw cause;
    }
  }, [load]);

  const currentCalibrationKey = queueCalibrationKey(input);
  const currentSnapshot = snapshotCalibrationKey === currentCalibrationKey ? snapshot : null;

  useEffect(() => {
    if (!currentSnapshot?.canDispatch) {
      dispatchRevisionRef.current = null;
      return;
    }
    if (mutating || dispatchRevisionRef.current === currentSnapshot.revision) return;
    dispatchRevisionRef.current = currentSnapshot.revision;
    void dispatchNext().catch(() => undefined);
  }, [currentSnapshot?.canDispatch, currentSnapshot?.revision, dispatchNext, mutating, snapshotCalibrationKey]);

  const handleEvent = useCallback((projectId: string, event: WorkbenchLiveEvent): void => {
    const current = inputRef.current;
    if (projectId !== current.projectId || !current.conversationId
      || !eventInvalidatesSelectedConversation(event, current.conversationId)) return;
    if (invalidationTimerRef.current) clearTimeout(invalidationTimerRef.current);
    invalidationTimerRef.current = setTimeout(() => {
      invalidationTimerRef.current = null;
      void load();
    }, 80);
  }, [load]);

  const calibrating = Boolean(input.projectId && input.conversationId)
    && snapshotCalibrationKey !== currentCalibrationKey;
  return {
    snapshot: currentSnapshot,
    loading: loading || calibrating,
    mutating,
    load,
    enqueue,
    remove,
    reclaim,
    retry,
    dispatchNext,
    handleEvent,
  };
}

function eventInvalidatesSelectedConversation(event: WorkbenchLiveEvent, conversationId: string): boolean {
  switch (event.event) {
    case "snapshot":
      return true;
    case "topic.created":
      return event.data.conversationId === conversationId;
    case "topic.updated":
      return event.data.conversation.id === conversationId;
    case "conversation.interactions.updated":
    case "agent-surfaces.invalidated":
    case "conversation.turn-control.invalidated":
    case "conversation.context.invalidated":
    case "conversation.turn-queue.invalidated":
    case "run.started":
    case "run.status":
    case "assistant.delta":
    case "usage":
    case "error":
    case "done":
      return event.data.conversationId === conversationId;
    case "conversation.fork.completed":
      return event.data.sourceConversationId === conversationId || event.data.targetConversationId === conversationId;
    case "assistant.event":
    case "tool.event":
      return event.data.conversationId === conversationId;
    default:
      return false;
  }
}

function queueIdentity(input: { projectId: string | null; productMode: ProductMode; conversationId: string | null }): string {
  return [input.projectId ?? "", input.productMode, input.conversationId ?? ""].join("\0");
}

function queueCalibrationKey(input: {
  projectId: string | null;
  productMode: ProductMode;
  conversationId: string | null;
  executionKey?: string | null;
}): string {
  return [queueIdentity(input), input.executionKey ?? ""].join("\0");
}

function baseQueueUrl(input: { projectId: string | null; conversationId: string | null }): string {
  return `/api/projects/${encodeURIComponent(input.projectId!)}/workbench/conversations/${encodeURIComponent(input.conversationId!)}/turn-queue`;
}

function queueReadUrl(input: { projectId: string | null; productMode: ProductMode; conversationId: string | null }): string {
  return `${baseQueueUrl(input)}?productMode=${encodeURIComponent(input.productMode)}`;
}

function createRequestId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
