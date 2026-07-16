import type { ProviderCapabilitySnapshot, ProviderModelRef, ProviderOperationProfile } from "../provider-runtime/index.js";
import type { ResolvedMemory } from "../types/index.js";
import { WorkbenchStore, type StoredProviderAttempt, type StoredProviderThreadLink } from "./store.js";

export interface StartProviderAttemptInput {
  attemptId: string;
  providerId: string;
  capabilitySnapshot: ProviderCapabilitySnapshot;
  operationProfile: ProviderOperationProfile;
  roleId: string;
  handoffHash: string;
  conversationId?: string | null;
  graphScopeId?: string | null;
  changeId?: string | null;
  agentTaskId?: string | null;
  worktreeId?: string | null;
  model?: ProviderModelRef | null;
}

export interface BindProviderAttemptThreadInput {
  attemptId: string;
  threadId: string;
  parentThreadId?: string | null;
  displayName?: string | null;
}

export async function bindProviderAttemptThread(memory: ResolvedMemory, input: BindProviderAttemptThreadInput): Promise<StoredProviderThreadLink | null> {
  if (!memory.projectId) throw new Error("Project id is required to bind a provider attempt thread.");
  const store = await WorkbenchStore.open(memory);
  try {
    const attempt = store.readProviderAttempt(memory.projectId, input.attemptId);
    if (!attempt) throw new Error(`Provider attempt not found: ${input.attemptId}`);
    if (!attempt.conversationId || !attempt.graphScopeId) return null;
    return store.bindProviderAttemptThread(memory.projectId, {
      ...input,
      parentThreadId: input.parentThreadId ?? null,
    }, new Date().toISOString());
  } finally {
    store.close();
  }
}

export async function startProviderAttempt(memory: ResolvedMemory, input: StartProviderAttemptInput): Promise<StoredProviderAttempt> {
  if (!memory.projectId) throw new Error("Project id is required to record a provider attempt.");
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = input.conversationId
      ? store.readConversation(memory.projectId, input.conversationId)
      : input.changeId
        ? store.findConversationForChange(memory.projectId, input.changeId)
        : null;
    const now = new Date().toISOString();
    const attempt: StoredProviderAttempt = {
      projectId: memory.projectId,
      conversationId: conversation?.conversationId ?? input.conversationId ?? null,
      attemptId: input.attemptId,
      graphScopeId: input.graphScopeId ?? conversation?.currentGraphScopeId ?? null,
      changeId: input.changeId ?? conversation?.boundChangeId ?? null,
      agentTaskId: input.agentTaskId ?? null,
      roleId: input.roleId,
      operationProfile: input.operationProfile,
      providerId: input.providerId,
      nativeSessionId: null,
      model: input.model ?? null,
      capabilitySnapshot: input.capabilitySnapshot,
      handoffHash: input.handoffHash,
      deliveredThroughCompletedTurn: conversation?.completedTurnSequence ?? 0,
      worktreeId: input.worktreeId ?? null,
      status: "running",
      createdAt: now,
      updatedAt: now,
    };
    store.createProviderAttempt(attempt);
    return attempt;
  } finally {
    store.close();
  }
}

export async function finishProviderAttempt(
  memory: ResolvedMemory,
  attemptId: string,
  status: "completed" | "interrupted" | "failed" | "blocked",
  nativeSessionId: string | null,
  thread?: { parentThreadId?: string | null; displayName?: string | null },
): Promise<void> {
  if (!memory.projectId) throw new Error("Project id is required to finish a provider attempt.");
  const store = await WorkbenchStore.open(memory);
  try {
    const now = new Date().toISOString();
    const attempt = store.readProviderAttempt(memory.projectId, attemptId);
    if (!attempt) throw new Error(`Provider attempt not found: ${attemptId}`);
    if (nativeSessionId && attempt.conversationId) {
      store.bindProviderAttemptThread(memory.projectId, {
        attemptId,
        threadId: nativeSessionId,
        parentThreadId: thread?.parentThreadId,
        displayName: thread?.displayName,
      }, now);
    }
    store.completeProviderAttempt(memory.projectId, attemptId, status, nativeSessionId, now);
  } finally {
    store.close();
  }
}
