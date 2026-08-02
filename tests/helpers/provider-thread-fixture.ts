import type { ProviderCapabilitySnapshot, ProviderOperationProfile } from "../../src/provider-runtime/index.js";
import type { WorkbenchDatabase } from "../../src/workbench/persistence/database.js";
import { type StoredProviderThreadLink } from "../../src/workbench/persistence/contracts.js";

type ProviderThreadFixture = Omit<StoredProviderThreadLink, "attemptId" | "runId" | "parentAgentSurfaceId"> & {
  attemptId?: string;
  runId?: string | null;
  parentAgentSurfaceId?: string | null;
};

let fixtureAttemptSequence = 0;

export function bindProviderThreadFixture(store: WorkbenchDatabase, link: ProviderThreadFixture): StoredProviderThreadLink {
  const baseAttemptId = link.attemptId ?? link.runId ?? `fixture:${link.providerId}:${link.providerThreadId}`;
  const attemptId = store.providerAttempts.readProviderAttempt(link.projectId, baseAttemptId)
    ? `${baseAttemptId}:resume:${++fixtureAttemptSequence}`
    : baseAttemptId;
  const now = link.updatedAt;
  const conversation = store.conversations.readConversation(link.projectId, link.conversationId);
  store.providerAttempts.createProviderAttempt({
    projectId: link.projectId,
    conversationId: link.conversationId,
    attemptId,
    graphScopeId: link.graphScopeId ?? conversation?.currentGraphScopeId ?? null,
    changeId: link.changeId ?? conversation?.boundChangeId ?? null,
    agentTaskId: null,
    roleId: link.roleId,
    operationProfile: operationProfile(link.roleId),
    providerId: link.providerId,
    nativeSessionId: null,
    model: null,
    capabilitySnapshot: { providerId: link.providerId, effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
    handoffHash: "fixture-handoff",
    deliveredThroughCompletedTurn: 0,
    worktreeId: null,
    status: "running",
    createdAt: now,
    updatedAt: now,
  });
  const bound = store.providerAttempts.bindProviderAttemptThread(link.projectId, {
    attemptId,
    threadId: link.providerThreadId,
    parentThreadId: link.parentThreadId,
    parentAgentSurfaceId: link.parentAgentSurfaceId
      ?? (link.parentThreadId ? undefined : link.roleId === "main-agent" ? null : "main-agent"),
    displayName: link.displayName,
  }, now);
  store.providerAttempts.completeProviderAttempt(link.projectId, attemptId, "completed", link.providerThreadId, now);
  return bound;
}

function operationProfile(roleId: string): ProviderOperationProfile {
  if (roleId === "planning-agent") return "planning";
  if (roleId === "coder-agent" || roleId === "rework-coder" || roleId === "integration-fix-agent" || roleId === "spec-test-generator") return "coder";
  if (roleId === "auditor-agent" || roleId === "spec-test-proposer") return "auditor";
  if (roleId === "harness-evolution-agent") return "evolution";
  if (roleId === "evolution-scorer") return "evolution-scorer";
  return "main";
}
