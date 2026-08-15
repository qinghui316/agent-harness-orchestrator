import { createHash } from "node:crypto";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import type { ProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ManagedProject } from "../types/index.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";

export async function reconcileStaleAgentMainAttempts(input: {
  project: ManagedProject;
  providerRegistry: ProviderRegistry;
  runtimeState: ProjectRuntimeState;
}): Promise<{ failed: number; diagnostics: string[] }> {
  const runtime = input.runtimeState;
  const paths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
  const database = await openProjectRuntimeWorkbenchDatabase(paths, { providerRegistry: input.providerRegistry });
  let failed = 0;
  const diagnostics: string[] = [];
  try {
    for (const conversation of database.conversations.listConversations(paths.projectId, "agent", { includeDeleted: true })) {
      const links = database.providerAttempts.listProviderThreads(paths.projectId, conversation.conversationId);
      for (const attempt of database.providerAttempts.listProviderAttempts(paths.projectId, conversation.conversationId)) {
        if (attempt.productMode !== "agent"
          || attempt.roleId !== "main-agent"
          || attempt.operationProfile !== "agent"
          || (attempt.status !== "queued" && attempt.status !== "running")) continue;
        const active = input.providerRegistry.findActiveTurn(conversation.conversationId);
        const link = links.find((candidate) => candidate.attemptId === attempt.attemptId && candidate.roleId === "main-agent");
        const activeProof = active?.providerId === attempt.providerId
          && active.attemptId === attempt.attemptId
          && active.runtimeScopeId === conversation.conversationId
          && active.roleId === "main-agent"
          && (!link?.runId || active.runId === link.runId)
          && (!attempt.nativeSessionId || active.session.sessionId === attempt.nativeSessionId);
        if (activeProof) continue;
        const updatedAt = new Date().toISOString();
        const runId = link?.runId ?? `restart-${stableId(attempt.attemptId)}`;
        const message = toCanonicalTimelineMessage(paths.projectId, conversation.conversationId, {
          id: `status:${conversation.conversationId}:${attempt.providerId}:${stableId(attempt.attemptId)}:restart-main-stale`,
          type: "assistant.message",
          timestamp: updatedAt,
          conversationId: conversation.conversationId,
          ...(attempt.graphScopeId ? { graphScopeId: attempt.graphScopeId } : {}),
          changeId: "",
          text: "The Agent turn was marked failed after Workbench restart because no exact active Provider turn proof was available.",
          status: "failed",
          runId,
          providerId: attempt.providerId,
          attemptId: attempt.attemptId,
          ...(attempt.nativeSessionId ? { threadId: attempt.nativeSessionId } : {}),
          agentRoleId: "main-agent",
          agentSurfaceId: "main-agent",
          error: "restart-active-turn-unavailable",
        });
        try {
          database.unitOfWork.commitAgentMainAttemptRecovery({
            projectId: paths.projectId,
            conversationId: conversation.conversationId,
            attemptId: attempt.attemptId,
            providerId: attempt.providerId,
            graphScopeId: attempt.graphScopeId,
            nativeSessionId: attempt.nativeSessionId,
            updatedAt,
            timelineMessage: message,
          });
          failed += 1;
        } catch (error) {
          diagnostics.push(`${attempt.attemptId}: ${boundedError(error)}`);
        }
      }
    }
  } finally {
    database.close();
  }
  return { failed, diagnostics };
}

function stableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function boundedError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/[\r\n]+/g, " ").slice(0, 240);
}
