export class ProjectRuntimeActivityRegistry {
  private readonly blockedProjects = new Set<string>();
  private readonly activeCountByProject = new Map<string, number>();
  private readonly drainWaiters = new Map<string, Set<() => void>>();

  async run<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    this.assertActive(projectId);
    this.activeCountByProject.set(projectId, (this.activeCountByProject.get(projectId) ?? 0) + 1);
    try {
      return await operation();
    } finally {
      this.release(projectId);
    }
  }

  blockProject(projectId: string): void {
    this.blockedProjects.add(projectId);
  }

  async drainProject(projectId: string): Promise<void> {
    if (!this.activeCountByProject.has(projectId)) return;
    await new Promise<void>((resolvePromise) => {
      const waiters = this.drainWaiters.get(projectId) ?? new Set<() => void>();
      waiters.add(resolvePromise);
      this.drainWaiters.set(projectId, waiters);
    });
  }

  activateProject(projectId: string): void {
    this.blockedProjects.delete(projectId);
  }

  activeCount(projectId: string): number {
    return this.activeCountByProject.get(projectId) ?? 0;
  }

  private release(projectId: string): void {
    const next = Math.max(0, (this.activeCountByProject.get(projectId) ?? 1) - 1);
    if (next > 0) {
      this.activeCountByProject.set(projectId, next);
      return;
    }
    this.activeCountByProject.delete(projectId);
    for (const resolvePromise of this.drainWaiters.get(projectId) ?? []) resolvePromise();
    this.drainWaiters.delete(projectId);
  }

  private assertActive(projectId: string): void {
    if (!this.blockedProjects.has(projectId)) return;
    const error = new Error(`Project runtime is removing and cannot start activity: ${projectId}.`);
    error.name = "Conflict";
    throw error;
  }
}

export const defaultProjectRuntimeActivityRegistry = new ProjectRuntimeActivityRegistry();
