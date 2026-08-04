import type Database from "better-sqlite3";
import type { WorkbenchProviderUserInputRequest } from "../../types.js";
import type { StoredTopicMessage } from "../contracts.js";
import type { TimelineRepository } from "./timeline-repository.js";

export class InteractionRepository {
  constructor(private readonly db: Database.Database, private readonly timeline: TimelineRepository) {}

  supersedeGraphScope(
    projectId: string,
    conversationId: string,
    graphScopeId: string,
    updatedAt: string,
  ): StoredTopicMessage[] {
    const updated: StoredTopicMessage[] = [];
    for (const row of this.timeline.listConversationMessages(projectId, conversationId)) {
      let raw: Record<string, unknown> & {
        graphScopeId?: string;
        agentRoleId?: string;
        artifact?: string;
        status?: string;
        providerUserInput?: WorkbenchProviderUserInputRequest;
        clarification?: { status?: string };
      };
      try {
        raw = JSON.parse(row.rawJson) as typeof raw;
      } catch {
        continue;
      }
      if (raw.graphScopeId !== graphScopeId) continue;
      let nextStatus: string | undefined;
      if (raw.providerUserInput && (raw.providerUserInput.status === "pending" || raw.providerUserInput.status === "submitting")) {
        raw.providerUserInput = { ...raw.providerUserInput, status: "superseded" };
        nextStatus = "superseded";
      } else if (raw.clarification?.status === "pending") {
        raw.clarification = { ...raw.clarification, status: "expired" };
        nextStatus = "expired";
      } else if (raw.agentRoleId === "planning-agent"
        && raw.artifact
        && !["accepted", "revision-requested", "skipped", "superseded", "planner-proposal-invalid"].includes(raw.status ?? "")) {
        nextStatus = "superseded";
      }
      if (!nextStatus) continue;
      updated.push(this.timeline.updateMessage({
        ...row,
        timestamp: updatedAt,
        status: nextStatus,
        rawJson: JSON.stringify({ ...raw, timestamp: updatedAt, status: nextStatus }),
      }));
    }
    return updated;
  }

transitionProviderUserInputRequest(
    projectId: string,
    conversationId: string,
    expectedGraphScopeId: string,
    requestKey: string,
    expectedStatus: WorkbenchProviderUserInputRequest["status"],
    nextStatus: WorkbenchProviderUserInputRequest["status"],
    settlement: {
      publicAnswers?: Record<string, string | string[]>;
      skippedQuestionIds?: string[];
      disposition?: "answered" | "skipped";
    } | undefined,
    updatedAt: string,
  ): { request: WorkbenchProviderUserInputRequest; row: StoredTopicMessage } {
    return this.db.transaction(() => {
      const activeScope = this.db.prepare(`
        SELECT 1
        FROM conversations c
        INNER JOIN conversation_graph_scopes g
          ON g.project_id = c.project_id
          AND g.conversation_id = c.conversation_id
          AND g.graph_scope_id = c.current_graph_scope_id
        WHERE c.project_id = ? AND c.conversation_id = ?
          AND c.state = 'active' AND c.deleted_at IS NULL
          AND c.current_graph_scope_id = ? AND g.status = 'active'
      `).get(projectId, conversationId, expectedGraphScopeId);
      if (!activeScope) {
        throw new Error("Provider user input settlement no longer owns the current active conversation graph.");
      }
      const row = this.timeline.listConversationMessages(projectId, conversationId)
        .reverse()
        .find((message) => {
          try {
            const raw = JSON.parse(message.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest };
            return raw.providerUserInput?.requestKey === requestKey;
          } catch {
            return false;
          }
        });
      if (!row) throw new Error(`Provider user input request was not persisted: ${requestKey}.`);
      const raw = JSON.parse(row.rawJson) as Record<string, unknown> & { providerUserInput: WorkbenchProviderUserInputRequest };
      if (raw.providerUserInput.graphScopeId !== expectedGraphScopeId) {
        throw new Error("Provider user input request no longer matches the current conversation graph.");
      }
      if (raw.providerUserInput.status !== expectedStatus) {
        throw new Error(`Provider user input request ${requestKey} is ${raw.providerUserInput.status}, not ${expectedStatus}.`);
      }
      const nextRequest: WorkbenchProviderUserInputRequest = {
        ...raw.providerUserInput,
        status: nextStatus,
        ...(settlement?.publicAnswers ? { publicAnswers: settlement.publicAnswers } : {}),
        ...(settlement?.skippedQuestionIds ? { skippedQuestionIds: settlement.skippedQuestionIds } : {}),
        ...(settlement?.disposition ? { disposition: settlement.disposition } : {}),
        ...(nextStatus === "submitted" ? { submittedAt: updatedAt } : {}),
      };
      const updatedRow = this.timeline.updateMessage({
        ...row,
        timestamp: updatedAt,
        status: nextStatus,
        rawJson: JSON.stringify({ ...raw, timestamp: updatedAt, status: nextStatus, providerUserInput: nextRequest }),
      });
      return { request: nextRequest, row: updatedRow };
    })();
  }

readProviderUserInputRequest(
    projectId: string,
    conversationId: string,
    requestKey: string,
  ): WorkbenchProviderUserInputRequest | null {
    const row = this.timeline.listConversationMessages(projectId, conversationId)
      .reverse()
      .find((message) => {
        try {
          const raw = JSON.parse(message.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest };
          return raw.providerUserInput?.requestKey === requestKey;
        } catch {
          return false;
        }
      });
    if (!row) return null;
    const raw = JSON.parse(row.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest };
    return raw.providerUserInput ?? null;
  }

terminalizeProviderUserInputRequests(
    projectId: string,
    conversationId: string,
    runId: string,
    updatedAt: string,
  ): StoredTopicMessage[] {
    return this.db.transaction(() => {
      const updated: StoredTopicMessage[] = [];
      for (const row of this.timeline.listConversationMessages(projectId, conversationId)) {
        let raw: Record<string, unknown> & { providerUserInput?: WorkbenchProviderUserInputRequest };
        try {
          raw = JSON.parse(row.rawJson) as typeof raw;
        } catch {
          continue;
        }
        const request = raw.providerUserInput;
        if (!request || request.runId !== runId || (request.status !== "pending" && request.status !== "submitting")) continue;
        const nextRequest = { ...request, status: "interrupted" as const };
        const nextRow = {
          ...row,
          timestamp: updatedAt,
          status: "interrupted",
          rawJson: JSON.stringify({ ...raw, timestamp: updatedAt, status: "interrupted", providerUserInput: nextRequest }),
        };
        updated.push(this.timeline.updateMessage(nextRow));
      }
      return updated;
    })();
  }

updatePlanningMessageStatus(projectId: string, conversationId: string, artifact: string, status: string): StoredTopicMessage {
    const row = this.timeline.listConversationMessages(projectId, conversationId)
      .find((message) => message.artifact === artifact && message.type === "assistant.message");
    if (!row) throw new Error(`Planning proposal message not found: ${artifact}.`);
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(row.rawJson) as Record<string, unknown>;
    } catch {
      // Keep the durable row usable even if an old diagnostic payload was malformed.
    }
    return this.timeline.updateMessage({
      ...row,
      status,
      rawJson: JSON.stringify({ ...raw, status }),
    });
  }
}
