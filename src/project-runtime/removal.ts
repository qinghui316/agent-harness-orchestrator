import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveWithinPhysicalRoot } from "../project-harness/path-safety.js";
import type { ProjectRuntimePaths } from "./paths.js";
import { resolveProjectRuntimePaths } from "./paths.js";

export interface ProjectRemovalConfirmation {
  token: string;
  projectId: string;
  projectPath: string;
  sidecarRoot: string;
  expiresAt: string;
}

export interface ProjectRemovalLifecyclePort {
  stopProjectActivity(projectId: string): Promise<void>;
  unsubscribeProject(projectId: string): Promise<void>;
  drainProject(projectId: string): Promise<void>;
  closeProjectDatabases(projectId: string): Promise<void>;
  removalAborted?(projectId: string): Promise<void>;
}

export interface ProjectRegistrationPort<TRegistration> {
  unregister(projectId: string): Promise<TRegistration | null>;
  restore(registration: TRegistration): Promise<void>;
}

export type ProjectRemovalStage =
  | "fenced"
  | "activity-stopped"
  | "subscriptions-closed"
  | "drained"
  | "databases-closed"
  | "sidecar-quarantined"
  | "unregistered";

export interface RemoveProjectRuntimeInput {
  projectId: string;
  projectPath: string;
  runtimePaths: ProjectRuntimePaths;
  confirmationToken: string;
  confirmed: boolean;
}

export interface ProjectRemovalResult {
  projectId: string;
  sidecarRemoved: boolean;
}

export interface ProjectRemovalCoordinatorOptions<TRegistration> {
  ahoHome: string;
  lifecycle: ProjectRemovalLifecyclePort;
  registration: ProjectRegistrationPort<TRegistration>;
  confirmationTtlMs?: number;
  now?: () => number;
  createToken?: () => string;
  failureInjection?: (stage: ProjectRemovalStage) => Promise<void> | void;
  fence?: ProjectRemovalFence;
  removeQuarantine?: (path: string) => Promise<void>;
}

interface ProjectRemovalFenceState {
  generation: number;
  status: "active" | "removing" | "removed";
}

export class ProjectRemovalFence {
  private readonly projects = new Map<string, ProjectRemovalFenceState>();

  capture(projectId: string): number {
    const state = this.projects.get(projectId) ?? { generation: 0, status: "active" as const };
    this.assertActive(projectId, state);
    return state.generation;
  }

  assertCurrent(projectId: string, generation: number): void {
    const state = this.projects.get(projectId) ?? { generation: 0, status: "active" as const };
    this.assertActive(projectId, state);
    if (state.generation !== generation) {
      throw conflict(`Project runtime callback is stale for ${projectId}.`);
    }
  }

  beginRemoval(projectId: string): number {
    const current = this.projects.get(projectId) ?? { generation: 0, status: "active" as const };
    this.assertActive(projectId, current);
    const next = { generation: current.generation + 1, status: "removing" as const };
    this.projects.set(projectId, next);
    return next.generation;
  }

  rollbackRemoval(projectId: string, generation: number): void {
    const current = this.requireGeneration(projectId, generation);
    if (current.status !== "removing") throw conflict(`Project removal is not active for ${projectId}.`);
    this.projects.set(projectId, { generation, status: "active" });
  }

  completeRemoval(projectId: string, generation: number): void {
    const current = this.requireGeneration(projectId, generation);
    if (current.status !== "removing") throw conflict(`Project removal is not active for ${projectId}.`);
    this.projects.set(projectId, { generation, status: "removed" });
  }

  activateAfterRegistration(projectId: string): number {
    const current = this.projects.get(projectId) ?? { generation: 0, status: "active" as const };
    const next = { generation: current.generation + 1, status: "active" as const };
    this.projects.set(projectId, next);
    return next.generation;
  }

  status(projectId: string): ProjectRemovalFenceState["status"] {
    return this.projects.get(projectId)?.status ?? "active";
  }

  private assertActive(projectId: string, state: ProjectRemovalFenceState): void {
    if (state.status !== "active") {
      throw conflict(`Project runtime is ${state.status} and cannot accept work: ${projectId}.`);
    }
  }

  private requireGeneration(projectId: string, generation: number): ProjectRemovalFenceState {
    const current = this.projects.get(projectId);
    if (!current || current.generation !== generation) {
      throw conflict(`Project removal generation is stale for ${projectId}.`);
    }
    return current;
  }
}

export const defaultProjectRemovalFence = new ProjectRemovalFence();

export class ProjectLifecycleMutationGate {
  private readonly activeKeys = new Set<string>();
  private readonly removedProjectIdByPath = new Map<string, string>();

  acquire(projectId: string | null, projectPath: string): { release(): void } {
    const keys = [lifecyclePathKey(projectPath), ...(projectId ? [`id:${projectId}`] : [])];
    if (keys.some((key) => this.activeKeys.has(key))) {
      throw conflict(`Project registration or removal is already in progress for ${projectId ?? projectPath}.`);
    }
    for (const key of keys) this.activeKeys.add(key);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        for (const key of keys) this.activeKeys.delete(key);
      },
    };
  }

  markRemoved(projectId: string, projectPath: string): void {
    this.removedProjectIdByPath.set(lifecyclePathKey(projectPath), projectId);
  }

  removedProjectId(projectPath: string): string | null {
    return this.removedProjectIdByPath.get(lifecyclePathKey(projectPath)) ?? null;
  }

  markRegistered(projectPath: string): void {
    this.removedProjectIdByPath.delete(lifecyclePathKey(projectPath));
  }
}

export const defaultProjectLifecycleMutationGate = new ProjectLifecycleMutationGate();

export class ProjectRemovalCoordinator<TRegistration> {
  readonly fence: ProjectRemovalFence;
  private readonly confirmations = new Map<string, ProjectRemovalConfirmation>();
  private readonly confirmationTokenByProject = new Map<string, string>();
  private readonly now: () => number;
  private readonly createToken: () => string;
  private readonly confirmationTtlMs: number;

  constructor(private readonly options: ProjectRemovalCoordinatorOptions<TRegistration>) {
    this.fence = options.fence ?? new ProjectRemovalFence();
    this.now = options.now ?? Date.now;
    this.createToken = options.createToken ?? randomUUID;
    this.confirmationTtlMs = options.confirmationTtlMs ?? 5 * 60_000;
  }

  issueConfirmation(projectId: string, projectPath: string): ProjectRemovalConfirmation {
    const runtimePaths = resolveProjectRuntimePaths(projectId, this.options.ahoHome);
    const previousToken = this.confirmationTokenByProject.get(projectId);
    if (previousToken) this.confirmations.delete(previousToken);
    const token = this.createToken();
    if (!token.trim() || this.confirmations.has(token)) {
      throw new Error("Project removal confirmation token must be unique and non-empty.");
    }
    const confirmation: ProjectRemovalConfirmation = {
      token,
      projectId,
      projectPath: resolve(projectPath),
      sidecarRoot: resolve(runtimePaths.sidecarRoot),
      expiresAt: new Date(this.now() + this.confirmationTtlMs).toISOString(),
    };
    this.confirmations.set(token, confirmation);
    this.confirmationTokenByProject.set(projectId, token);
    return confirmation;
  }

  async remove(input: RemoveProjectRuntimeInput): Promise<ProjectRemovalResult> {
    const confirmation = this.consumeConfirmation(input);
    const generation = this.fence.beginRemoval(input.projectId);
    let quarantineRoot: string | null = null;
    let sidecarQuarantined = false;
    let sidecarRemoved = false;
    let unregistered: TRegistration | null = null;
    let committed = false;
    try {
      await this.inject("fenced");
      await this.options.lifecycle.stopProjectActivity(input.projectId);
      await this.inject("activity-stopped");
      await this.options.lifecycle.unsubscribeProject(input.projectId);
      await this.inject("subscriptions-closed");
      await this.options.lifecycle.drainProject(input.projectId);
      await this.inject("drained");
      await this.options.lifecycle.closeProjectDatabases(input.projectId);
      await this.inject("databases-closed");

      const quarantine = await quarantineRuntimeSidecar(
        this.options.ahoHome,
        input.runtimePaths,
        confirmation.token,
      );
      quarantineRoot = quarantine.path;
      sidecarQuarantined = quarantine.moved;
      await this.inject("sidecar-quarantined");

      unregistered = await this.options.registration.unregister(input.projectId);
      if (!unregistered) throw new Error(`Project is not registered: ${input.projectId}.`);
      await this.inject("unregistered");

      if (sidecarQuarantined && quarantineRoot) {
        await (this.options.removeQuarantine ?? removeRuntimeQuarantine)(quarantineRoot);
        sidecarQuarantined = false;
        sidecarRemoved = true;
      }
      this.fence.completeRemoval(input.projectId, generation);
      committed = true;
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      if (unregistered) {
        try {
          await this.options.registration.restore(unregistered);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (sidecarQuarantined && quarantineRoot) {
        try {
          await restoreRuntimeSidecar(input.runtimePaths.sidecarRoot, quarantineRoot);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      try {
        this.fence.rollbackRemoval(input.projectId, generation);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      try {
        await this.options.lifecycle.removalAborted?.(input.projectId);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], "Project removal failed and rollback was incomplete.");
      }
      throw error;
    }

    if (!committed) throw new Error("Project removal did not reach its commit point.");
    return {
      projectId: input.projectId,
      sidecarRemoved,
    };
  }

  private consumeConfirmation(input: RemoveProjectRuntimeInput): ProjectRemovalConfirmation {
    const confirmation = this.confirmations.get(input.confirmationToken);
    this.confirmations.delete(input.confirmationToken);
    if (confirmation && this.confirmationTokenByProject.get(confirmation.projectId) === input.confirmationToken) {
      this.confirmationTokenByProject.delete(confirmation.projectId);
    }
    if (input.confirmed !== true) throw new Error("Project removal requires explicit confirmation.");
    if (!confirmation) throw new Error("Project removal confirmation is missing, stale, or already used.");
    if (Date.parse(confirmation.expiresAt) <= this.now()) {
      throw new Error("Project removal confirmation has expired.");
    }
    const expectedPaths = resolveProjectRuntimePaths(input.projectId, this.options.ahoHome);
    if (confirmation.projectId !== input.projectId
      || confirmation.projectPath !== resolve(input.projectPath)
      || confirmation.sidecarRoot !== resolve(input.runtimePaths.sidecarRoot)
      || resolve(input.runtimePaths.sidecarRoot) !== resolve(expectedPaths.sidecarRoot)) {
      throw new Error("Project removal confirmation does not match the selected project and sidecar.");
    }
    return confirmation;
  }

  private async inject(stage: ProjectRemovalStage): Promise<void> {
    await this.options.failureInjection?.(stage);
  }
}

async function removeRuntimeQuarantine(path: string): Promise<void> {
  await rm(path, { recursive: true, force: false, maxRetries: 20, retryDelay: 100 });
}

async function quarantineRuntimeSidecar(
  ahoHome: string,
  paths: ProjectRuntimePaths,
  token: string,
): Promise<{ path: string; moved: boolean }> {
  const projectsRoot = join(resolve(ahoHome), "projects");
  const expected = resolveProjectRuntimePaths(paths.projectId, ahoHome);
  if (resolve(paths.sidecarRoot) !== resolve(expected.sidecarRoot)) {
    throw new Error("Project runtime sidecar does not match its canonical project id.");
  }
  if (!existsSync(paths.sidecarRoot)) {
    return { path: join(projectsRoot, `.removed-${paths.projectId}-${token}`), moved: false };
  }
  await mkdir(projectsRoot, { recursive: true });
  const sidecarRoot = await resolveWithinPhysicalRoot(projectsRoot, paths.projectId, "project runtime sidecar");
  const quarantineName = `.removed-${paths.projectId}-${token}`;
  const quarantineRoot = await resolveWithinPhysicalRoot(projectsRoot, quarantineName, "project runtime quarantine");
  if (existsSync(quarantineRoot)) throw new Error(`Project runtime quarantine already exists: ${quarantineRoot}`);
  await rename(sidecarRoot, quarantineRoot);
  return { path: quarantineRoot, moved: true };
}

async function restoreRuntimeSidecar(sidecarRoot: string, quarantineRoot: string): Promise<void> {
  if (!existsSync(quarantineRoot)) {
    throw new Error("Project runtime sidecar quarantine is missing during rollback.");
  }
  if (existsSync(sidecarRoot)) {
    throw new Error("Project runtime sidecar path is occupied during rollback.");
  }
  await mkdir(dirname(sidecarRoot), { recursive: true });
  await rename(quarantineRoot, sidecarRoot);
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}

function lifecyclePathKey(projectPath: string): string {
  const normalized = resolve(projectPath);
  return `path:${process.platform === "win32" ? normalized.toLowerCase() : normalized}`;
}
