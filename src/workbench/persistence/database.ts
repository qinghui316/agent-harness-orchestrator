import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ResolvedMemory } from "../../types/index.js";
import { acquireWorkbenchRuntimeMutationLock, type WorkbenchRuntimeMutationLock } from "../schema-rebuild-gate.js";
import { ConversationRepository } from "./repositories/conversation-repository.js";
import { DecisionRepository } from "./repositories/decision-repository.js";
import { InteractionRepository } from "./repositories/interaction-repository.js";
import { ProviderAttemptRepository } from "./repositories/provider-attempt-repository.js";
import { SkillRepository } from "./repositories/skill-repository.js";
import { TimelineRepository } from "./repositories/timeline-repository.js";
import type { WorkbenchResetGuard } from "./reset-guard.js";
import {
  assertRuntimeDatabaseResetSafe,
  beginExclusiveSchemaRebuild,
  hasWorkbenchRuntimeTables,
  migrate,
  WORKBENCH_SCHEMA_VERSION,
} from "./schema.js";
import { WorkbenchUnitOfWork } from "./unit-of-work.js";

export class WorkbenchDatabase {
  readonly timeline: TimelineRepository;
  readonly interactions: InteractionRepository;
  readonly conversations: ConversationRepository;
  readonly providerAttempts: ProviderAttemptRepository;
  readonly skills: SkillRepository;
  readonly decisions: DecisionRepository;
  readonly unitOfWork: WorkbenchUnitOfWork;

  private constructor(private readonly connection: Database.Database) {
    this.timeline = new TimelineRepository(connection);
    this.interactions = new InteractionRepository(connection, this.timeline);
    this.conversations = new ConversationRepository(connection);
    this.providerAttempts = new ProviderAttemptRepository(connection);
    this.skills = new SkillRepository(connection);
    this.decisions = new DecisionRepository(connection);
    this.unitOfWork = new WorkbenchUnitOfWork(
      connection,
      this.timeline,
      this.conversations,
      this.providerAttempts,
      this.interactions,
    );
  }

  static async open(
    memory: ResolvedMemory,
    resetGuard: WorkbenchResetGuard,
  ): Promise<WorkbenchDatabase> {
    await mkdir(dirname(memory.workbenchDbPath), { recursive: true });
    const connection = new Database(memory.workbenchDbPath);
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
    const currentVersion = Number(connection.pragma("user_version", { simple: true }) ?? 0);
    const needsRebuild = currentVersion !== WORKBENCH_SCHEMA_VERSION;
    const rebuildingExistingRuntime = needsRebuild && hasWorkbenchRuntimeTables(connection);
    let rebuildTransaction = false;
    let rebuildLock: WorkbenchRuntimeMutationLock | null = null;
    if (rebuildingExistingRuntime) {
      try {
        rebuildLock = await acquireWorkbenchRuntimeMutationLock(memory, "重建 Workbench 会话数据库");
        await resetGuard.assertSafe(connection, memory);
        beginExclusiveSchemaRebuild(connection);
        rebuildTransaction = true;
        assertRuntimeDatabaseResetSafe(connection);
      } catch (error) {
        if (rebuildTransaction) connection.exec("ROLLBACK");
        connection.close();
        await rebuildLock?.release();
        throw error;
      }
    }
    try {
      migrate(connection);
      if (rebuildTransaction) connection.exec("COMMIT");
      await rebuildLock?.release();
    } catch (error) {
      if (rebuildTransaction) connection.exec("ROLLBACK");
      connection.close();
      await rebuildLock?.release();
      throw error;
    }
    return new WorkbenchDatabase(connection);
  }

  transaction<T>(operation: () => T): T {
    return this.connection.transaction(operation)();
  }

  close(): void {
    this.connection.close();
  }
}
