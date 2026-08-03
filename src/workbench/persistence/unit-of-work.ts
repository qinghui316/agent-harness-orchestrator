import type Database from "better-sqlite3";
import type { ProviderId } from "../../provider-runtime/index.js";
import type {
  StoredConversation,
  StoredConversationProviderBinding,
  StoredProviderAttempt,
  StoredProviderResumePoint,
  StoredTopicMessage,
  StoredTopicMessageWrite,
} from "./contracts.js";
import type { ConversationRepository } from "./repositories/conversation-repository.js";
import type { InteractionRepository } from "./repositories/interaction-repository.js";
import type { ProviderAttemptRepository } from "./repositories/provider-attempt-repository.js";
import type { TimelineRepository } from "./repositories/timeline-repository.js";

export class WorkbenchUnitOfWork {
  constructor(
    private readonly db: Database.Database,
    private readonly timeline: TimelineRepository,
    private readonly conversations: ConversationRepository,
    private readonly providerAttempts: ProviderAttemptRepository,
    private readonly interactions: InteractionRepository,
  ) {}

  createConversationWithInitialMessage(
    conversation: Omit<StoredConversation, "timelinePosition" | "timelineRevision"> & Partial<Pick<StoredConversation, "timelinePosition" | "timelineRevision">>,
    message: StoredTopicMessageWrite,
  ): StoredTopicMessage {
    return this.db.transaction(() => {
      this.conversations.createConversation(conversation);
      return this.timeline.appendMessage(message);
    })();
  }

  commitProviderTurnTerminal(input: {
    projectId: string;
    conversationId: string;
    runId: string;
    mainAttemptId: string;
    mainStatus: StoredProviderAttempt["status"];
    mainNativeSessionId: string | null;
    childAttempts: Array<{
      attemptId: string;
      status: StoredProviderAttempt["status"];
      nativeSessionId: string | null;
    }>;
    expectedCompletedTurnSequence: number;
    advanceCompletedTurn: boolean;
    binding?: Omit<StoredConversationProviderBinding, "lastDeliveredCompletedTurn">;
    updatedAt: string;
    timelineMessages?: StoredTopicMessageWrite[];
  }): { timelineRows: StoredTopicMessage[]; interactionRows: StoredTopicMessage[]; completedTurnSequence: number } {
    return this.db.transaction(() => {
      const timelineMessages = input.timelineMessages ?? [];
      if (new Set(timelineMessages.map((message) => message.id)).size !== timelineMessages.length) {
        throw new Error("Provider terminal commit requires one final mutation per canonical message.");
      }
      const timelineRows = timelineMessages.map((message) =>
        this.timeline.readMessage(message.projectId, message.conversationId, message.id)
          ? this.timeline.updateMessage(message)
          : this.timeline.appendMessage(message));
      const interactionRows = this.interactions.terminalizeProviderUserInputRequests(
        input.projectId,
        input.conversationId,
        input.runId,
        input.updatedAt,
      );
      for (const child of input.childAttempts) {
        this.providerAttempts.completeProviderAttempt(
          input.projectId,
          child.attemptId,
          child.status,
          child.nativeSessionId,
          input.updatedAt,
        );
      }
      this.providerAttempts.completeProviderAttempt(
        input.projectId,
        input.mainAttemptId,
        input.mainStatus,
        input.mainNativeSessionId,
        input.updatedAt,
      );
      const completedTurnSequence = input.advanceCompletedTurn
        ? this.conversations.advanceCompletedTurnSequence(
            input.projectId,
            input.conversationId,
            input.expectedCompletedTurnSequence,
            input.updatedAt,
          )
        : input.expectedCompletedTurnSequence;
      if (input.binding) {
        this.providerAttempts.writeConversationProviderBinding({
          ...input.binding,
          lastDeliveredCompletedTurn: completedTurnSequence,
        });
      }
      return { timelineRows, interactionRows, completedTurnSequence };
    })();
  }

  deleteConversation(projectId: string, conversationId: string, deletedAt: string): void {
    this.db.transaction(() => {
      this.timeline.deleteMessages(projectId, conversationId);
      this.conversations.markConversationDeleted(projectId, conversationId, deletedAt);
    })();
  }

  acceptConversationChangeBinding(
    projectId: string,
    conversationId: string,
    changeId: string,
    linkedAt: string,
    acceptanceId?: string,
    proposalHash?: string,
    scopeTransition?: { graphScopeId: string; runId?: string; plannerThreadId?: string },
    expectedCurrentGraphScopeId?: string,
  ): StoredTopicMessage[] {
    return this.db.transaction(() => {
      const currentGraphScopeId = this.conversations.readConversation(projectId, conversationId)?.currentGraphScopeId;
      if (expectedCurrentGraphScopeId !== undefined && currentGraphScopeId !== expectedCurrentGraphScopeId) {
        throw new Error("Planning acceptance no longer matches the current conversation graph scope.");
      }
      let timelineRows: StoredTopicMessage[] = [];
      if (scopeTransition) {
        if (!scopeTransition.runId || !scopeTransition.plannerThreadId) {
          throw new Error("A superseding planning acceptance requires durable provider lineage.");
        }
        timelineRows = this.moveConversationRunToGraphScope(
          projectId,
          conversationId,
          scopeTransition.runId,
          scopeTransition.plannerThreadId,
          scopeTransition.graphScopeId,
          linkedAt,
        );
      }
      const graphScopeId = this.conversations.readConversation(projectId, conversationId)?.currentGraphScopeId;
      if (!graphScopeId) throw new Error("Planning acceptance requires the current graph scope.");
      this.conversations.linkConversationChange(projectId, conversationId, changeId, linkedAt);
      this.providerAttempts.attachChangeToGraphScope(
        projectId,
        conversationId,
        graphScopeId,
        changeId,
        linkedAt,
      );
      if (acceptanceId && proposalHash) {
        this.conversations.recordPlanningAcceptance(
          acceptanceId,
          projectId,
          conversationId,
          changeId,
          graphScopeId,
          proposalHash,
          linkedAt,
        );
      }
      return timelineRows;
    })();
  }

  startConversationGraphScope(projectId: string, conversationId: string, graphScopeId: string, updatedAt: string): StoredTopicMessage[] {
    return this.db.transaction(() => {
      let rows: StoredTopicMessage[] = [];
      const currentScopeId = this.conversations.readConversation(projectId, conversationId)?.currentGraphScopeId;
      if (currentScopeId && currentScopeId !== graphScopeId) {
        rows = this.interactions.supersedeGraphScope(projectId, conversationId, currentScopeId, updatedAt);
      }
      this.conversations.activateGraphScope(projectId, conversationId, graphScopeId, updatedAt);
      return rows;
    })();
  }

  terminalizeConversationGraphScope(
    projectId: string,
    conversationId: string,
    graphScopeId: string,
    updatedAt: string,
  ): StoredTopicMessage[] {
    return this.db.transaction(() => {
      const rows = this.interactions.supersedeGraphScope(projectId, conversationId, graphScopeId, updatedAt);
      this.conversations.markConversationGraphScopeTerminal(projectId, conversationId, graphScopeId, updatedAt);
      return rows;
    })();
  }

  moveConversationRunToGraphScope(
    projectId: string,
    conversationId: string,
    runId: string,
    plannerThreadId: string,
    graphScopeId: string,
    updatedAt: string,
  ): StoredTopicMessage[] {
    return this.db.transaction(() => {
      const rows = this.startConversationGraphScope(projectId, conversationId, graphScopeId, updatedAt);
      this.providerAttempts.moveConversationThreadsToGraphScope(
        projectId,
        conversationId,
        plannerThreadId,
        graphScopeId,
        updatedAt,
      );
      return [...rows, ...this.timeline.moveRunToGraphScope(projectId, conversationId, runId, graphScopeId)];
    })();
  }

  commitConversationProviderSwitch(
    point: StoredProviderResumePoint,
    binding: StoredConversationProviderBinding,
    expectedProviderId: ProviderId,
    resumeAttempt: StoredProviderAttempt,
  ): void {
    this.db.transaction(() => {
      this.conversations.switchSelectedProvider(
        point.projectId,
        point.conversationId,
        expectedProviderId,
        point.targetProviderId,
        point.createdAt,
      );
      this.providerAttempts.writeProviderResumePoint(point);
      this.providerAttempts.writeConversationProviderBinding(binding);
      this.providerAttempts.createProviderAttempt(resumeAttempt);
    })();
  }
}
