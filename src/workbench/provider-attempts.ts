import type { ProviderCapabilitySnapshot, ProviderModelRef, ProviderOperationProfile } from "../provider-runtime/index.js";
import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { type StoredProviderAttempt, type StoredProviderThreadLink } from "./persistence/contracts.js";
import { publishAgentSurfacesInvalidated } from "./project-live-events.js";

export interface StartProviderAttemptInput {
  attemptId: string;
  providerId: string;
  capabilitySnapshot: ProviderCapabilitySnapshot;
  operationProfile: ProviderOperationProfile;
  roleId: string;
  parentAgentSurfaceId?: string | null;
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
  parentAgentSurfaceId?: string | null;
  displayName?: string | null;
  runId?: string | null;
}

type ProviderAttemptStorePort = ProjectWorkbenchPathPort;

export async function bindProviderAttemptThread(memory: ProviderAttemptStorePort, input: BindProviderAttemptThreadInput): Promise<StoredProviderThreadLink | null> {
  const projectId = requireProjectId(memory);
  const store = await openProjectRuntimeWorkbenchDatabase(memory);
  try {
    const attempt = store.providerAttempts.readProviderAttempt(projectId, input.attemptId);
    if (!attempt) throw new Error(`Provider attempt not found: ${input.attemptId}`);
    if (!attempt.conversationId || !attempt.graphScopeId) return null;
    const bound = store.providerAttempts.bindProviderAttemptThread(projectId, {
      ...input,
      parentThreadId: input.parentThreadId ?? null,
    }, new Date().toISOString());
    publishAgentSurfacesInvalidated(projectId, {
      conversationId: attempt.conversationId,
      graphScopeId: attempt.graphScopeId,
      reason: "thread-bound",
    });
    return bound;
  } finally {
    store.close();
  }
}

export async function startProviderAttempt(memory: ProviderAttemptStorePort, input: StartProviderAttemptInput): Promise<StoredProviderAttempt> {
  const projectId = requireProjectId(memory);
  const store = await openProjectRuntimeWorkbenchDatabase(memory);
  try {
    const conversation = input.conversationId
      ? store.conversations.readConversation(projectId, input.conversationId)
      : input.changeId
        ? store.conversations.findConversationForChange(projectId, input.changeId)
        : null;
    const now = new Date().toISOString();
    const attempt: StoredProviderAttempt = {
      projectId,
      conversationId: conversation?.conversationId ?? input.conversationId ?? null,
      attemptId: input.attemptId,
      productMode: conversation?.productMode ?? "harness",
      graphScopeId: input.graphScopeId ?? conversation?.currentGraphScopeId ?? null,
      changeId: input.changeId ?? conversation?.boundChangeId ?? null,
      agentTaskId: input.agentTaskId ?? null,
      roleId: input.roleId,
      parentAgentSurfaceId: input.parentAgentSurfaceId ?? null,
      operationProfile: input.operationProfile,
      providerId: input.providerId,
      nativeSessionId: null,
      model: input.model ?? null,
      capabilitySnapshot: input.capabilitySnapshot,
      effectiveSkillInputs: [],
      handoffHash: input.handoffHash,
      deliveredThroughCompletedTurn: conversation?.completedTurnSequence ?? 0,
      worktreeId: input.worktreeId ?? null,
      status: "running",
      createdAt: now,
      updatedAt: now,
    };
    store.providerAttempts.createProviderAttempt(attempt);
    if (attempt.conversationId) publishAgentSurfacesInvalidated(projectId, {
      conversationId: attempt.conversationId,
      graphScopeId: attempt.graphScopeId ?? undefined,
      reason: "attempt-updated",
    });
    return attempt;
  } finally {
    store.close();
  }
}

export async function resolveCurrentMainAgentProviderThread(
  memory: ProviderAttemptStorePort,
  changeId: string,
  providerId: string,
): Promise<StoredProviderThreadLink> {
  const projectId = requireProjectId(memory);
  const store = await openProjectRuntimeWorkbenchDatabase(memory);
  try {
    const conversation = store.conversations.findConversationForChange(projectId, changeId);
    if (!conversation?.currentGraphScopeId) {
      throw new Error(`Change ${changeId} has no active Conversation graph scope.`);
    }
    const mainThreads = store.providerAttempts.listProviderThreads(projectId, conversation.conversationId)
      .filter((thread) => thread.providerId === providerId
        && thread.roleId === "main-agent"
        && thread.graphScopeId === conversation.currentGraphScopeId);
    const current = mainThreads.at(-1);
    if (!current) {
      throw new Error(`Change ${changeId} has no Main Agent provider thread in the current graph scope.`);
    }
    return current;
  } finally {
    store.close();
  }
}

export async function finishProviderAttempt(
  memory: ProviderAttemptStorePort,
  attemptId: string,
  status: "completed" | "interrupted" | "failed" | "blocked" | "terminated",
  nativeSessionId: string | null,
  thread?: { parentThreadId?: string | null; parentAgentSurfaceId?: string | null; displayName?: string | null },
): Promise<void> {
  const projectId = requireProjectId(memory);
  const store = await openProjectRuntimeWorkbenchDatabase(memory);
  try {
    const now = new Date().toISOString();
    const attempt = store.providerAttempts.readProviderAttempt(projectId, attemptId);
    if (!attempt) throw new Error(`Provider attempt not found: ${attemptId}`);
    const threadBinding = nativeSessionId && attempt.conversationId && attempt.graphScopeId
      ? {
          threadId: nativeSessionId,
          ...(thread?.parentThreadId !== undefined ? { parentThreadId: thread.parentThreadId } : {}),
          ...(thread?.parentAgentSurfaceId !== undefined
            ? { parentAgentSurfaceId: thread.parentAgentSurfaceId }
            : attempt.parentAgentSurfaceId !== null
              ? { parentAgentSurfaceId: attempt.parentAgentSurfaceId }
              : {}),
          ...(thread?.displayName !== undefined ? { displayName: thread.displayName } : {}),
        }
      : undefined;
    if (attempt.conversationId && attempt.graphScopeId) {
      store.unitOfWork.commitProviderCallback({
        projectId,
        conversationId: attempt.conversationId,
        attemptId,
        expectedGraphScopeId: attempt.graphScopeId,
        updatedAt: now,
        terminal: { status, nativeSessionId },
        ...(threadBinding ? { thread: threadBinding } : {}),
      });
    } else {
      if (attempt.conversationId || attempt.graphScopeId) {
        throw new Error(`Provider attempt ${attemptId} has incomplete Conversation graph lineage.`);
      }
      store.providerAttempts.completeProviderAttempt(projectId, attemptId, status, nativeSessionId, now);
    }
    if (attempt.conversationId) publishAgentSurfacesInvalidated(projectId, {
      conversationId: attempt.conversationId,
      graphScopeId: attempt.graphScopeId ?? undefined,
      reason: status === "interrupted" ? "provider-interrupted" : status === "terminated" ? "provider-terminated" : "attempt-updated",
    });
  } finally {
    store.close();
  }
}

export async function rollbackProviderAttempt(
  memory: ProviderAttemptStorePort,
  attemptId: string,
  expectedRoleId: string,
): Promise<void> {
  const projectId = requireProjectId(memory);
  const store = await openProjectRuntimeWorkbenchDatabase(memory);
  try {
    store.providerAttempts.deleteProviderAttempt(projectId, attemptId, expectedRoleId);
  } finally {
    store.close();
  }
}

function requireProjectId(memory: ProviderAttemptStorePort): string {
  return memory.projectId;
}
