import type { WorkbenchDatabase } from "./database.js";

export class ProjectWorkbenchDatabaseLeaseRegistry {
  private readonly blockedProjects = new Set<string>();
  private readonly databasesByProject = new Map<string, Set<WorkbenchDatabase>>();
  private readonly openingCountByProject = new Map<string, number>();
  private readonly openingDrainWaiters = new Map<string, Set<() => void>>();

  async open(
    projectId: string,
    factory: (onClose: () => void) => Promise<WorkbenchDatabase>,
  ): Promise<WorkbenchDatabase> {
    this.assertActive(projectId);
    this.markOpening(projectId);
    let database: WorkbenchDatabase | null = null;
    try {
      database = await factory(() => {
        if (database) this.release(projectId, database);
      });
      this.assertActive(projectId);
    } catch (error) {
      database?.close();
      throw error;
    } finally {
      this.markOpeningComplete(projectId);
    }
    const leases = this.databasesByProject.get(projectId) ?? new Set<WorkbenchDatabase>();
    leases.add(database);
    this.databasesByProject.set(projectId, leases);
    return database;
  }

  blockProject(projectId: string): void {
    this.blockedProjects.add(projectId);
  }

  async closeProject(projectId: string): Promise<void> {
    await this.waitForOpenings(projectId);
    const databases = [...(this.databasesByProject.get(projectId) ?? [])];
    for (const database of databases) database.close();
    this.databasesByProject.delete(projectId);
  }

  activateProject(projectId: string): void {
    this.blockedProjects.delete(projectId);
  }

  activeLeaseCount(projectId: string): number {
    return this.databasesByProject.get(projectId)?.size ?? 0;
  }

  private release(projectId: string, database: WorkbenchDatabase): void {
    const leases = this.databasesByProject.get(projectId);
    leases?.delete(database);
    if (leases?.size === 0) this.databasesByProject.delete(projectId);
  }

  private markOpening(projectId: string): void {
    this.openingCountByProject.set(projectId, (this.openingCountByProject.get(projectId) ?? 0) + 1);
  }

  private markOpeningComplete(projectId: string): void {
    const next = Math.max(0, (this.openingCountByProject.get(projectId) ?? 1) - 1);
    if (next > 0) {
      this.openingCountByProject.set(projectId, next);
      return;
    }
    this.openingCountByProject.delete(projectId);
    for (const resolvePromise of this.openingDrainWaiters.get(projectId) ?? []) resolvePromise();
    this.openingDrainWaiters.delete(projectId);
  }

  private waitForOpenings(projectId: string): Promise<void> {
    if (!this.openingCountByProject.has(projectId)) return Promise.resolve();
    return new Promise<void>((resolvePromise) => {
      const waiters = this.openingDrainWaiters.get(projectId) ?? new Set<() => void>();
      waiters.add(resolvePromise);
      this.openingDrainWaiters.set(projectId, waiters);
    });
  }

  private assertActive(projectId: string): void {
    if (!this.blockedProjects.has(projectId)) return;
    const error = new Error(`Project runtime database is unavailable while project ${projectId} is being removed.`);
    error.name = "Conflict";
    throw error;
  }
}

export const defaultProjectWorkbenchDatabaseLeaseRegistry = new ProjectWorkbenchDatabaseLeaseRegistry();
