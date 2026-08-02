import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertRequiredProjectHarnessBindings, discoverProjectHarness } from "../project-harness/discovery.js";
import {
  recoverProjectHarnessOnboarding,
  type ProjectHarnessOnboardingRecord,
} from "../project-harness/onboarding.js";
import { assertPhysicalDirectory } from "../project-harness/path-safety.js";
import { withProjectHarnessWriterLock } from "../project-harness/writer-lock.js";
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
import { resolveProjectRuntime } from "./resolution.js";

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
  };

export interface ProjectRuntimeStartupResult {
  states: ProjectRuntimeState[];
  migrations: ProjectIdentityMigrationResult[];
  recoveries: ProjectIdentityMigrationResult[];
  onboardingRecoveries: ProjectHarnessOnboardingRecord[];
}

export interface ProjectRuntimeCoordinatorOptions {
  store: ProjectRegistryStore;
  ahoHome?: string;
  createTransactionId?: () => string;
}

export interface ProjectRuntimeCoordinatorPort {
  reconcileStartup(): Promise<ProjectRuntimeStartupResult>;
  resolve(project: ManagedProject): Promise<ProjectRuntimeState>;
  requireReady(project: ManagedProject): Promise<ProjectRuntimeResolution>;
}

export class ProjectRuntimeCoordinator implements ProjectRuntimeCoordinatorPort {
  private readonly ahoHome: string;
  private readonly createTransactionId: () => string;

  constructor(private readonly options: ProjectRuntimeCoordinatorOptions) {
    this.ahoHome = options.ahoHome ?? dirname(options.store.registryPath);
    this.createTransactionId = options.createTransactionId ?? (() => `identity-${randomUUID().toLowerCase()}`);
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
      );
      if (recovered) onboardingRecoveries.push(recovered);
    }
    return withProjectHarnessWriterLock(projectsRoot, {
      projectId: "project-runtime-identities",
      ownerId: `workbench-startup-${process.pid}`,
      operation: "migrate",
    }, async () => {
      const recoveries = await recoverPendingProjectIdentityMigrations(
        projectsRoot,
        (journal) => buildProjectIdentityRecoveryDocuments(journal, this.options.store),
      );
      const migrations: ProjectIdentityMigrationResult[] = [];
      const states: ProjectRuntimeState[] = [];
      for (const initial of await this.options.store.listProjects()) {
        const reconciled = await this.reconcileRegisteredProject(initial);
        if (reconciled.migration) migrations.push(reconciled.migration);
        states.push(reconciled.state);
      }
      return { states, migrations, recoveries, onboardingRecoveries };
    });
  }

  async resolve(project: ManagedProject): Promise<ProjectRuntimeState> {
    const projectRoot = await assertPhysicalDirectory(project.path, "project source");
    const discovery = await discoverProjectHarness(projectRoot);
    if (!discovery) {
      const paths = resolveProjectRuntimePaths(project.id, this.ahoHome);
      await assertProjectRuntimePathSafety(paths);
      return { state: "onboarding", project, projectRoot, paths, reservedProjectId: project.id };
    }
    return { state: "ready", project, resolution: await resolveProjectRuntime(project, { ahoHome: this.ahoHome }) };
  }

  async requireReady(project: ManagedProject): Promise<ProjectRuntimeResolution> {
    const state = await this.resolve(project);
    if (state.state !== "ready") {
      throw new Error(`Project Harness onboarding is incomplete for ${project.id}.`);
    }
    return state.resolution;
  }

  private async reconcileRegisteredProject(project: ManagedProject): Promise<{
    state: ProjectRuntimeState;
    migration: ProjectIdentityMigrationResult | null;
  }> {
    const projectRoot = await assertPhysicalDirectory(project.path, "project source");
    const discovery = await discoverProjectHarness(projectRoot);
    if (!discovery) return { state: await this.resolve(project), migration: null };
    assertRequiredProjectHarnessBindings(discovery);
    if (discovery.handle.projectId === project.id) {
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
    return { state: await this.resolve(migratedProject), migration };
  }
}
