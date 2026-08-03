import type { ServerResponse } from "node:http";
import { dirname } from "node:path";
import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { ManagedProject } from "../../types/index.js";
import {
  ProjectRemovalCoordinator,
  defaultProjectLifecycleMutationGate,
  defaultProjectRemovalFence,
  type ProjectLifecycleMutationGate,
  type ProjectRemovalResult,
} from "../../project-runtime/removal.js";
import { resolveProjectRuntimePaths } from "../../project-runtime/paths.js";
import {
  defaultProjectRuntimeActivityRegistry,
  type ProjectRuntimeActivityRegistry,
} from "../../project-runtime/activity.js";
import {
  defaultProjectWorkbenchDatabaseLeaseRegistry,
  type ProjectWorkbenchDatabaseLeaseRegistry,
} from "../../workbench/persistence/database-leases.js";

export interface WorkbenchProjectRemovalConfirmation {
  token: string;
  projectId: string;
  projectName: string;
  expiresAt: string;
}

export interface WorkbenchProjectRemovalRequest {
  confirmationToken: string;
  confirmed: boolean;
}

export interface WorkbenchProjectRemovalPort {
  beginProjectRequest(projectId: string, response: ServerResponse, options: { stream: boolean }): { complete(): void };
  issueConfirmation(projectId: string): Promise<WorkbenchProjectRemovalConfirmation>;
  remove(projectId: string, request: WorkbenchProjectRemovalRequest): Promise<ProjectRemovalResult>;
  activateAfterRegistration(projectId: string): void;
  runRegistration<T extends { project: ManagedProject }>(projectPath: string, operation: () => Promise<T>): Promise<T>;
}

interface ProjectRequestRecord {
  response: ServerResponse;
  stream: boolean;
  handlerComplete: boolean;
  responseComplete: boolean;
  done: Promise<void>;
  resolveDone(): void;
}

class ProjectRequestDrain {
  private readonly requests = new Map<string, Set<ProjectRequestRecord>>();

  begin(projectId: string, response: ServerResponse, options: { stream: boolean }): { complete(): void } {
    let resolveDone!: () => void;
    const record: ProjectRequestRecord = {
      response,
      stream: options.stream,
      handlerComplete: false,
      responseComplete: response.writableFinished || response.destroyed,
      done: new Promise<void>((resolve) => { resolveDone = resolve; }),
      resolveDone,
    };
    const projectRequests = this.requests.get(projectId) ?? new Set<ProjectRequestRecord>();
    projectRequests.add(record);
    this.requests.set(projectId, projectRequests);
    const completeResponse = (): void => {
      record.responseComplete = true;
      this.tryComplete(projectId, record);
    };
    response.once("finish", completeResponse);
    response.once("close", completeResponse);
    this.tryComplete(projectId, record);
    return {
      complete: () => {
        record.handlerComplete = true;
        this.tryComplete(projectId, record);
      },
    };
  }

  closeProjectStreams(projectId: string): void {
    for (const record of this.requests.get(projectId) ?? []) {
      if (record.stream
        && !record.response.destroyed
        && !record.response.writableEnded) {
        record.response.end();
        record.responseComplete = true;
        this.tryComplete(projectId, record);
      }
    }
  }

  async drain(projectId: string): Promise<void> {
    await Promise.all([...(this.requests.get(projectId) ?? [])].map((record) => record.done));
  }

  private tryComplete(projectId: string, record: ProjectRequestRecord): void {
    if (!record.handlerComplete || !record.responseComplete) return;
    const projectRequests = this.requests.get(projectId);
    projectRequests?.delete(record);
    if (projectRequests?.size === 0) this.requests.delete(projectId);
    record.resolveDone();
  }
}

export class WorkbenchProjectRemovalService implements WorkbenchProjectRemovalPort {
  private readonly ahoHome: string;
  private readonly store: ProjectRegistryStore;
  private readonly requests = new ProjectRequestDrain();
  private readonly lifecycleMutations: ProjectLifecycleMutationGate;
  private readonly runtimeActivities: ProjectRuntimeActivityRegistry;
  private readonly databaseLeases: ProjectWorkbenchDatabaseLeaseRegistry;
  private readonly coordinator: ProjectRemovalCoordinator<ManagedProject>;

  constructor(options: {
    store: ProjectRegistryStore;
    providerRegistry: ProviderRegistry;
    ahoHome?: string;
    databaseLeases?: ProjectWorkbenchDatabaseLeaseRegistry;
    lifecycleMutations?: ProjectLifecycleMutationGate;
    runtimeActivities?: ProjectRuntimeActivityRegistry;
  }) {
    this.store = options.store;
    this.ahoHome = options.ahoHome ?? dirname(options.store.registryPath);
    this.databaseLeases = options.databaseLeases ?? defaultProjectWorkbenchDatabaseLeaseRegistry;
    this.lifecycleMutations = options.lifecycleMutations ?? defaultProjectLifecycleMutationGate;
    this.runtimeActivities = options.runtimeActivities ?? defaultProjectRuntimeActivityRegistry;
    this.coordinator = new ProjectRemovalCoordinator({
      ahoHome: this.ahoHome,
      fence: defaultProjectRemovalFence,
      lifecycle: {
        stopProjectActivity: async (projectId) => {
          this.runtimeActivities.blockProject(projectId);
          this.databaseLeases.blockProject(projectId);
          const project = await requireRegisteredProject(options.store, projectId);
          await options.providerRegistry.shutdownProject(
            project.id,
            project.path,
            `Project ${project.id} is being removed from AHO.`,
          );
          await this.runtimeActivities.drainProject(projectId);
        },
        unsubscribeProject: async (projectId) => {
          this.requests.closeProjectStreams(projectId);
        },
        drainProject: async (projectId) => {
          await this.requests.drain(projectId);
        },
        closeProjectDatabases: async (projectId) => {
          await this.databaseLeases.closeProject(projectId);
        },
        removalAborted: async (projectId) => {
          this.runtimeActivities.activateProject(projectId);
          this.databaseLeases.activateProject(projectId);
        },
      },
      registration: {
        unregister: (projectId) => options.store.removeProject(projectId),
        restore: (registration) => options.store.restoreProject(registration),
      },
    });
  }

  beginProjectRequest(
    projectId: string,
    response: ServerResponse,
    options: { stream: boolean },
  ): { complete(): void } {
    this.coordinator.fence.capture(projectId);
    return this.requests.begin(projectId, response, options);
  }

  async issueConfirmation(projectId: string): Promise<WorkbenchProjectRemovalConfirmation> {
    const project = await requireRegisteredProject(this.store, projectId);
    this.coordinator.fence.capture(project.id);
    const confirmation = this.coordinator.issueConfirmation(project.id, project.path);
    return {
      token: confirmation.token,
      projectId: project.id,
      projectName: project.name,
      expiresAt: confirmation.expiresAt,
    };
  }

  async remove(projectId: string, request: WorkbenchProjectRemovalRequest): Promise<ProjectRemovalResult> {
    const project = await requireRegisteredProject(this.store, projectId);
    const lifecycleLease = this.lifecycleMutations.acquire(project.id, project.path);
    try {
      const result = await this.coordinator.remove({
        projectId: project.id,
        projectPath: project.path,
        runtimePaths: resolveProjectRuntimePaths(project.id, this.ahoHome),
        confirmationToken: request.confirmationToken,
        confirmed: request.confirmed,
      });
      this.lifecycleMutations.markRemoved(project.id, project.path);
      return result;
    } finally {
      lifecycleLease.release();
    }
  }

  activateAfterRegistration(projectId: string): void {
    const status = this.coordinator.fence.status(projectId);
    if (status === "removing") {
      const error = new Error(`Project removal is in progress and runtime activation is forbidden: ${projectId}.`);
      error.name = "Conflict";
      throw error;
    }
    if (status === "removed") {
      this.coordinator.fence.activateAfterRegistration(projectId);
    }
    this.runtimeActivities.activateProject(projectId);
    this.databaseLeases.activateProject(projectId);
  }

  async runRegistration<T extends { project: ManagedProject }>(
    projectPath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lifecycleLease = this.lifecycleMutations.acquire(null, projectPath);
    const removedProjectId = this.lifecycleMutations.removedProjectId(projectPath);
    if (removedProjectId) {
      this.runtimeActivities.activateProject(removedProjectId);
      this.databaseLeases.activateProject(removedProjectId);
    }
    try {
      const result = await operation();
      this.activateAfterRegistration(result.project.id);
      this.lifecycleMutations.markRegistered(projectPath);
      return result;
    } catch (error) {
      if (removedProjectId) {
        this.runtimeActivities.blockProject(removedProjectId);
        this.databaseLeases.blockProject(removedProjectId);
      }
      throw error;
    } finally {
      lifecycleLease.release();
    }
  }
}

async function requireRegisteredProject(store: ProjectRegistryStore, projectId: string): Promise<ManagedProject> {
  const project = await store.resolveProject(projectId);
  if (project?.id === projectId) return project;
  const error = new Error(`Project not found: ${projectId}`);
  error.name = "NotFound";
  throw error;
}
