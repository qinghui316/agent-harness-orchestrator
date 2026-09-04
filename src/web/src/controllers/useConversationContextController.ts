import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "../api.js";
import { userFacingErrorMessage } from "../presentation/user-facing-language.js";
import type { ConversationContextSnapshot, ProductMode } from "../types.js";

export function useConversationContextController(input: {
  projectId: string | null;
  productMode: ProductMode;
  conversationId: string | null;
  snapshot: ConversationContextSnapshot | null;
  refreshConversation(projectId: string, conversationId: string): Promise<void>;
  onError(message: string): void;
}): {
  snapshot: ConversationContextSnapshot | null;
  submitting: boolean;
  compact(): Promise<void>;
} {
  const [submitting, setSubmitting] = useState(false);
  const identity = contextIdentity(input);
  const identityRef = useRef(identity);
  const inputRef = useRef(input);
  identityRef.current = identity;
  inputRef.current = input;

  useEffect(() => setSubmitting(false), [identity]);

  const compact = useCallback(async () => {
    const current = inputRef.current;
    const snapshot = current.snapshot;
    if (!current.projectId || !current.conversationId || !snapshot?.canCompact || submitting) return;
    const requestIdentity = contextIdentity(current);
    setSubmitting(true);
    try {
      await postJson(
        `/api/projects/${encodeURIComponent(current.projectId)}/workbench/conversations/${encodeURIComponent(current.conversationId)}/context/compact`,
        {
          productMode: current.productMode,
          providerId: snapshot.providerId,
          contextRevision: snapshot.contextRevision,
          clientRequestId: globalThis.crypto?.randomUUID?.() ?? `context-compact-${Date.now().toString(36)}`,
        },
      );
      if (identityRef.current === requestIdentity) await current.refreshConversation(current.projectId, current.conversationId);
    } catch (error) {
      if (identityRef.current === requestIdentity) current.onError(userFacingErrorMessage(error, "conversation"));
    } finally {
      if (identityRef.current === requestIdentity) setSubmitting(false);
    }
  }, [submitting]);

  return { snapshot: input.snapshot, submitting, compact };
}

function contextIdentity(input: {
  projectId: string | null;
  productMode: ProductMode;
  conversationId: string | null;
  snapshot: ConversationContextSnapshot | null;
}): string {
  return [input.projectId ?? "", input.productMode, input.conversationId ?? "", input.snapshot?.providerId ?? "", input.snapshot?.contextRevision ?? ""].join("\0");
}
