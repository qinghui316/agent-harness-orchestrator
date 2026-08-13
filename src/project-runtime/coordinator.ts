import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAhoHome } from "../fs/path.js";
import type { ProjectHarnessDiscoveryPolicy } from "../project-harness/contracts.js";
import { assertRequiredProjectHarnessBindings, discoverProjectHarness } from "../project-harness/discovery.js";
import { auditProjectHarness, doctorProjectHarness } from "../project-harness/diagnostics.js";
import {
  recoverProjectHarnessOnboarding,
  type ProjectHarnessOnboardingRecord,
} from "../project-harness/onboarding.js";
import { assertPhysicalDirectory } from "../project-harness/path-safety.js";
import { withProjectHarnessWriterLock, type WriterLockScope } from "../project-harness/writer-lock.js";
import type { ProjectRegistryStore } from "../registry/store.js";
import type { ManagedProject } from "../types/index.js";
import {
  buildProjectIdentityMigrationOptions,
  buildProjectIdentityRecoveryDocuments,
} from "./identity-migration-descriptors.js";
import {
  migrateProjectIdentity,
  recoverPendingProjectIdentityMigrations,
  type ProjectIdentityMigrationResult,
} from "./identity-migration.js";
import type { ProjectRuntimeResolution } from "./context.js";
import { assertProjectRuntimePathSafety, resolveProjectRuntimePaths, type ProjectRuntimePaths } from "./paths.js";
import { initializeProjectRuntimeSidecar } from "./lifecycle.js";
import { resolveProjectRuntime } from "./resolution.js";
import { recoverPendingProjectHarnessChangeAbandonmentsUnderWriterLock } from "./change-abandonment.js";

export type ProjectRuntimeState =
  | {
    state: "onboarding";
    project: ManagedProject;
    projectRoot: string;
    paths: ProjectRuntimePaths;
    reservedProjectId: string;
  }
  | {
    state: "ready";
    project: ManagedProject;
    resolution: ProjectRuntimeResolution;
  }
  | {
    state: "repair-required";
    project: ManagedProject;
    resolution: ProjectRuntimeResolution;
    doctor: Awaited<ReturnType<typeof doctorProjectHarness>>;
    audit: Awaited<ReturnType<typeof auditProjectHarness>>;
  };

export interface ProjectRuntimeStartupResult {
  states: ProjectRuntimeState[];
  migrations: ProjectIdentityMigrationResult[];
  recoveries: ProjectIdentityMigrationResult[];
  onboardingRecoveries: ProjectHarnessOnboardingRecord[];
}

export interface ProjectRuntimeCoordinatorOptions {
  store: ProjectRegistryStore;
  discoveryPolicy: ProjectHarnessDiscoveryPolicy;
  ahoHome?: string;
  createTransactionId?: () => string;
  initializeSidecar?: typeof initializeProjectRuntimeSidecar;
}

export interface ProjectRuntimeCoordinatorPort {
  reconcileStartup(): Promise<ProjectRuntimeStartupResult>;
  register(input: { path: string; name?: string }): Promise<ProjectRuntimeState>;
  resolve(project: ManagedProject): Promise<ProjectRuntimeState>;
  requireReady(project: ManagedProject): Promise<ProjectRuntimeResolution>;
  runtimePaths(projectId: string): ProjectRuntimePaths;
}

export class ProjectRuntimeCoordinator implements ProjectRuntimeCoordinatorPort {
  private readonly ahoHome: string;
  private readonly createTransactionId: () => string;
  private readonly initializeSidecar: typeof initializeProjectRuntimeSidecar;
  private readonly discoveryPolicy: ProjectHarnessDiscoveryPolicy;

  constructor(private readonly options: ProjectRuntimeCoordinatorOptions) {
    this.ahoHome = options.ahoHome ?? dirname(options.store.registryPath);
    this.discoveryPolicy = options.discoveryPolicy;
    this.createTransactionId = options.createTransactionId ?? (() => `identity-${randomUUID().toLowerCase()}`);
    this.initializeSidecar = options.initializeSidecar ?? initializeProjectRuntimeSidecar;
  }

  async reconcileStartup(): Promise<ProjectRuntimeStartupResult> {
    const projectsRoot = join(this.ahoHome, "projects");
    await assertProjectRuntimePathSafety(resolveProjectRuntimePaths("project-runtime-identities", this.ahoHome));
    const onboardingRecoveries: ProjectHarnessOnboardingRecord[] = [];
    for (const project of await this.options.store.listProjects()) {
      const paths = resolveProjectRuntimePaths(project.id, this.ahoHome);
      if (!existsSync(join(paths.sidecarRoot, "onboarding", "transaction.json"))) continue;
      const recovered = await recoverProjectHarnessOnboarding(
        project.id,
        project.path,
        paths.sidecarRoot,
        this.discoveryPolicy,
      );
      if (recovered) onboardingRecoveries.push(recovered);
    }
    return withProjectHarnessWriterLock(projectsRoot, {
      projectId: "project-runtime-identities",
      ownerId: `workbench-startup-${process.pid}`,
      operation: "migrate",
    }, async (lock) => {
      const recoveries = await recoverPendingProjectIdentityMigrations(
        projectsRoot,
        (journal) => buildProjectIdentityRecoveryDocuments(journal, this.options.store, this.discoveryPolicy),
      );
      const migrations: ProjectIdentityMigrationResult[] = [];
      const states: ProjectRuntimeState[] = [];
      for (const initial of await this.options.store.listProjects()) {
        const reconciled = await this.reconcileRegisteredProject(initial, lock);
        if (reconciled.migration) migrations.push(reconciled.migration);
        states.push(reconciled.state);
      }
      return { states, migrations, recoveries, onboardingRecoveries };
    });
  }

  async register(input: { path: string; name?: string }): Promise<ProjectRuntimeState> {
    const projectRoot = await assertPhysicalDirectory(input.path, "project source");
    const discovery = await discoverProjectHarness(projectRoot, this.discoveryPolicy);
    if (discovery) assertRequiredProjectHarnessBindings(discovery, this.discoveryPolicy);
    const registration = await this.options.store.registerProject({
      path: projectRoot,
      name: input.name,
      projectId: discovery?.handle.projectId,
    });
    try {
      const state = await this.resolve(registration.project);
      const paths = state.state === "onboarding" ? state.paths : state.resolution.paths;
      await this.initializeSidecar(paths);
      return state;
    } catch (error) {
      if (registration.created) await this.options.store.removeProject(registration.project.id).catch(() => undefined);
      throw error;
    }
  }

  async resolve(project: ManagedProject): Promise<ProjectRuntimeState> {
    return resolveProjectRuntimeState(project, {
      ahoHome: this.ahoHome,
      discoveryPolicy: this.discoveryPolicy,
    });
  }

  runtimePaths(projectId: string): ProjectRuntimePaths {
    return resolveProjectRuntimePaths(projectId, this.ahoHome);
  }

  async requireReady(project: ManagedProject): Promise<ProjectRuntimeResolution> {
    const state = await this.resolve(project);
    if (state.state !== "ready") {
      throw new Error(`Project Harness onboarding is incomplete for ${project.id}.`);
    }
    return state.resolution;
  }

  private async reconcileRegisteredProject(project: ManagedProject, lock: WriterLockScope): Promise<{
    state: ProjectRuntimeState;
    migration: ProjectIdentityMigrationResult | null;
  }> {
    const projectRoot = await assertPhysicalDirectory(project.path, "project source");
    const discovery = await discoverProjectHarness(projectRoot, this.discoveryPolicy);
    if (!discovery) return { state: await this.resolve(project), migration: null };
    assertRequiredProjectHarnessBindings(discovery, this.discoveryPolicy);
    if (discovery.handle.projectId === project.id) {
      await this.recoverChangeAbandonments(project, lock);
      return { state: await this.resolve(project), migration: null };
    }
    const sourcePaths = resolveProjectRuntimePaths(project.id, this.ahoHome);
    const targetPaths = resolveProjectRuntimePaths(discovery.handle.projectId, this.ahoHome);
    await assertProjectRuntimePathSafety(sourcePaths);
    await assertProjectRuntimePathSafety(targetPaths);
    const options = await buildProjectIdentityMigrationOptions({
      project,
      discovery,
      store: this.options.store,
      sourcePaths,
      targetPaths,
      transactionId: this.createTransactionId(),
    });
    const migration = await migrateProjectIdentity(options);
    const migratedProject = await this.options.store.resolveProject(discovery.handle.projectId);
    if (!migratedProject || migratedProject.path !== project.path) {
      throw new Error("Identity migration committed but the canonical Registry project cannot be resolved.");
    }
    await this.recoverChangeAbandonments(migratedProject, lock);
    return { state: await this.resolve(migratedProject), migration };
  }

  private async recoverChangeAbandonments(project: ManagedProject, lock: WriterLockScope): Promise<void> {
    const resolution = await resolveProjectRuntime(project, {
      ahoHome: this.ahoHome,
      discoveryPolicy: this.discoveryPolicy,
    });
    await recoverPendingProjectHarnessChangeAbandonmentsUnderWriterLock(resolution, lock);
  }
}

export async function resolveProjectRuntimeState(
  project: ManagedProject,
  options: { ahoHome?: string; discoveryPolicy: ProjectHarnessDiscoveryPolicy },
): Promise<ProjectRuntimeState> {
  const ahoHome = options.ahoHome ?? getAhoHome();
  const projectRoot = await assertPhysicalDirectory(project.path, "project source");
  const discovery = await discoverProjectHarness(projectRoot, options.discoveryPolicy);
  if (!discovery) {
    const paths = resolveProjectRuntimePaths(project.id, ahoHome);
    await assertProjectRuntimePathSafety(paths);
    return { state: "onboarding", project, projectRoot, paths, reservedProjectId: project.id };
  }
  const resolution = await resolveProjectRuntime(project, {
    ahoHome,
    discoveryPolicy: options.discoveryPolicy,
  });
  const [doctor, audit] = await Promise.all([
    doctorProjectHarness({
      skillRoot: resolution.harness.skillRoot,
      projectRoot,
      expectedProjectId: resolution.harness.projectId,
      discoveryPolicy: options.discoveryPolicy,
    }),
    auditProjectHarness({
      skillRoot: resolution.harness.skillRoot,
      projectRoot,
      expectedProjectId: resolution.harness.projectId,
      discoveryPolicy: options.discoveryPolicy,
    }),
  ]);
  if (!doctor.healthy || !audit.healthy) {
    return { state: "repair-required", project, resolution, doctor, audit };
  }
  return { state: "ready", project, resolution };
}
