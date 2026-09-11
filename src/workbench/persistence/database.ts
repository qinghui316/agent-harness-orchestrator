import Database from "better-sqlite3";
import { ConversationRepository } from "./repositories/conversation-repository.js";
import { DecisionRepository } from "./repositories/decision-repository.js";
import { InteractionRepository } from "./repositories/interaction-repository.js";
import { ProviderAttemptRepository } from "./repositories/provider-attempt-repository.js";
import { SkillRepository } from "./repositories/skill-repository.js";
import { TimelineRepository } from "./repositories/timeline-repository.js";
import { ComposerDraftRepository } from "./repositories/composer-draft-repository.js";
import { ConversationContextRepository } from "./repositories/conversation-context-repository.js";
import { ConversationForkRepository } from "./repositories/conversation-fork-repository.js";
import { ConversationTurnQueueRepository } from "./repositories/conversation-turn-queue-repository.js";
import { ConversationLifecycleRepository } from "./repositories/conversation-lifecycle-repository.js";
import { ConversationReviewRepository } from "./repositories/conversation-review-repository.js";
import type { WorkbenchMigrationGuard } from "./reset-guard.js";
import { openSafeWorkbenchConnection, type WorkbenchDatabaseUpgradeOptions } from "./database-upgrade.js";
import { WorkbenchUnitOfWork } from "./unit-of-work.js";

export class WorkbenchDatabase {
  readonly timeline: TimelineRepository;
  readonly interactions: InteractionRepository;
  readonly conversations: ConversationRepository;
  readonly providerAttempts: ProviderAttemptRepository;
  readonly skills: SkillRepository;
  readonly decisions: DecisionRepository;
  readonly drafts: ComposerDraftRepository;
  readonly conversationContext: ConversationContextRepository;
  readonly conversationForks: ConversationForkRepository;
  readonly conversationTurnQueues: ConversationTurnQueueRepository;
  readonly conversationLifecycle: ConversationLifecycleRepository;
  readonly conversationReviews: ConversationReviewRepository;
  readonly unitOfWork: WorkbenchUnitOfWork;

  private closed = false;

  private constructor(
    private readonly connection: Database.Database,
    private readonly onClose?: () => void,
  ) {
    this.timeline = new TimelineRepository(connection);
    this.interactions = new InteractionRepository(connection, this.timeline);
    this.conversations = new ConversationRepository(connection);
    this.providerAttempts = new ProviderAttemptRepository(connection);
    this.skills = new SkillRepository(connection);
    this.decisions = new DecisionRepository(connection);
    this.drafts = new ComposerDraftRepository(connection);
    this.conversationContext = new ConversationContextRepository(this.timeline);
    this.conversationForks = new ConversationForkRepository(connection);
    this.conversationTurnQueues = new ConversationTurnQueueRepository(connection);
    this.conversationLifecycle = new ConversationLifecycleRepository(connection);
    this.conversationReviews = new ConversationReviewRepository(connection);
    this.unitOfWork = new WorkbenchUnitOfWork(
      connection,
      this.timeline,
      this.conversations,
      this.providerAttempts,
      this.interactions,
      this.skills,
      this.drafts,
      this.conversationTurnQueues,
      this.conversationReviews,
    );
  }

  static async open(
    paths: { workbenchDbPath: string },
    migrationGuard: WorkbenchMigrationGuard,
    onClose?: () => void,
    upgradeOptions?: WorkbenchDatabaseUpgradeOptions,
  ): Promise<WorkbenchDatabase> {
    const connection = await openSafeWorkbenchConnection(paths, migrationGuard, upgradeOptions);
    return new WorkbenchDatabase(connection, onClose);
  }

  transaction<T>(operation: () => T): T {
    return this.connection.transaction(operation)();
  }

  immediateTransaction<T>(operation: () => T): T {
    return this.connection.transaction(operation).immediate();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connection.close();
    this.onClose?.();
  }
}
