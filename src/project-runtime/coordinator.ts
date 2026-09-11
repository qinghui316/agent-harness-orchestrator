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
    workbenchData?: ProjectWorkbenchDataState;
  }
  | {
    state: "repair-required";
    project: ManagedProject;
    resolution: ProjectRuntimeResolution;
    doctor: Awaited<ReturnType<typeof doctorProjectHarness>>;
    audit: Awaited<ReturnType<typeof auditProjectHarness>>;
  };

export interface ProjectRuntimeStartupIssue {
  code:
    | "harness-missing"
    | "harness-unreadable"
    | "harness-invalid"
    | "project-recovery-failed"
    | "workbench-data-unsupported"
    | "workbench-data-newer"
    | "workbench-data-corrupt"
    | "workbench-data-recovery-required";
  summary: string;
  recovery: string;
}

export type ProjectWorkbenchDataState =
  | { state: "ready"; schemaVersion: number }
  | { state: "upgrade-required"; schemaVersion: number | null }
  | { state: "upgrading"; schemaVersion: number | null }
  | { state: "recovery-required"; schemaVersion: number | null }
  | { state: "newer-version"; schemaVersion: number | null }
  | { state: "unsupported-legacy"; schemaVersion: number | null };

export interface ProjectRuntimeUnavailable {
  state: "unavailable";
  project: ManagedProject;
  issue: ProjectRuntimeStartupIssue;
}

export type ProjectRuntimeStartupState = ProjectRuntimeState | ProjectRuntimeUnavailable;

export class ProjectRuntimeUnavailableError extends Error {
  readonly name = "Conflict";

  constructor(readonly unavailable: ProjectRuntimeUnavailable) {
    super("这个项目需要处理后才能继续使用。");
  }
}

export interface ProjectRuntimeStartupResult {
  states: ProjectRuntimeStartupState[];
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
  inspectWorkbenchData?: (paths: ProjectRuntimePaths) => Promise<Exclude<ProjectWorkbenchDataState, { state: "upgrading" }>>;
}

export interface ProjectRuntimeCoordinatorPort {
  reconcileStartup(): Promise<ProjectRuntimeStartupResult>;
  register(input: { path: string; name?: string }): Promise<ProjectRuntimeState>;
  resolve(project: ManagedProject): Promise<ProjectRuntimeState>;
  startupState(project: ManagedProject): Promise<ProjectRuntimeStartupState>;
  markUnavailable(project: ManagedProject, issue: ProjectRuntimeStartupIssue): ProjectRuntimeUnavailable;
  markWorkbenchDataState?(project: ManagedProject, state: ProjectWorkbenchDataState): void;
  requireReady(project: ManagedProject): Promise<ProjectRuntimeResolution>;
  runtimePaths(projectId: string): ProjectRuntimePaths;
}

export class ProjectRuntimeCoordinator implements ProjectRuntimeCoordinatorPort {
  private readonly ahoHome: string;
  private readonly createTransactionId: () => string;
  private readonly initializeSidecar: typeof initializeProjectRuntimeSidecar;
  private readonly discoveryPolicy: ProjectHarnessDiscoveryPolicy;
  private readonly startupStates = new Map<string, ProjectRuntimeStartupState>();

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
    const unavailable = new Map<string, ProjectRuntimeUnavailable>();
    for (const project of await this.options.store.listProjects()) {
      if (!existsSync(project.path)) {
        unavailable.set(project.id, this.createUnavailable(project, {
          code: "harness-unreadable",
          summary: "这个项目的协作配置无法读取。",
          recovery: "请检查项目位置和访问权限，然后重新启动 Beaver Code。",
        }));
        continue;
      }
      const paths = resolveProjectRuntimePaths(project.id, this.ahoHome);
      if (!existsSync(join(paths.sidecarRoot, "onboarding", "transaction.json"))) continue;
      try {
        const recovered = await recoverProjectHarnessOnboarding(
          project.id,
          project.path,
          paths.sidecarRoot,
          this.discoveryPolicy,
        );
        if (recovered) onboardingRecoveries.push(recovered);
      } catch (cause) {
        unavailable.set(project.id, this.createUnavailable(project, projectRuntimeStartupIssue(cause, "project-recovery-failed")));
      }
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
      const states: ProjectRuntimeStartupState[] = [];
      for (const initial of await this.options.store.listProjects()) {
        const unavailableState = unavailable.get(initial.id);
        if (unavailableState) {
          states.push(unavailableState);
          continue;
        }
        try {
          const reconciled = await this.reconcileRegisteredProject(initial, lock);
          if (reconciled.migration) migrations.push(reconciled.migration);
          states.push(await this.attachWorkbenchDataState(reconciled.state));
        } catch (cause) {
          states.push(this.createUnavailable(initial, projectRuntimeStartupIssue(cause)));
        }
      }
      this.startupStates.clear();
      for (const state of states) this.startupStates.set(state.project.id, state);
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
      this.startupStates.delete(registration.project.id);
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
    const startupState = this.startupStates.get(project.id);
    if (startupState?.state === "unavailable") throw new ProjectRuntimeUnavailableError(startupState);
    if (startupState) return startupState;
    return resolveProjectRuntimeState(project, {
      ahoHome: this.ahoHome,
      discoveryPolicy: this.discoveryPolicy,
    });
  }

  async startupState(project: ManagedProject): Promise<ProjectRuntimeStartupState> {
    const startupState = this.startupStates.get(project.id);
    return startupState?.state === "unavailable" ? startupState : this.resolve(project);
  }

  markUnavailable(project: ManagedProject, issue: ProjectRuntimeStartupIssue): ProjectRuntimeUnavailable {
    const state = this.createUnavailable(project, issue);
    this.startupStates.set(project.id, state);
    return state;
  }

  markWorkbenchDataState(project: ManagedProject, state: ProjectWorkbenchDataState): void {
    const current = this.startupStates.get(project.id);
    if (current?.state === "ready") this.startupStates.set(project.id, { ...current, workbenchData: state });
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

  private async attachWorkbenchDataState(state: ProjectRuntimeState): Promise<ProjectRuntimeStartupState> {
    if (state.state !== "ready" || !this.options.inspectWorkbenchData) return state;
    const workbenchData = await this.options.inspectWorkbenchData(state.resolution.paths);
    if (workbenchData.state === "newer-version") {
      return this.createUnavailable(state.project, {
        code: "workbench-data-newer",
        summary: "这个项目的数据由更新版本的 Beaver Code 创建。",
        recovery: "请使用创建这些数据的版本打开项目。",
      });
    }
    if (workbenchData.state === "unsupported-legacy") {
      return this.createUnavailable(state.project, {
        code: "workbench-data-unsupported",
        summary: "这个项目的数据版本过旧，无法自动升级。",
        recovery: "原有数据保持不变，请使用兼容版本进行恢复。",
      });
    }
    if (workbenchData.state === "recovery-required") {
      return this.createUnavailable(state.project, {
        code: "workbench-data-recovery-required",
        summary: "这个项目的数据需要恢复。",
        recovery: "原有数据已保留，请查看诊断信息后重试。",
      });
    }
    return { ...state, workbenchData };
  }

  private async recoverChangeAbandonments(project: ManagedProject, lock: WriterLockScope): Promise<void> {
    const resolution = await resolveProjectRuntime(project, {
      ahoHome: this.ahoHome,
      discoveryPolicy: this.discoveryPolicy,
    });
    await recoverPendingProjectHarnessChangeAbandonmentsUnderWriterLock(resolution, lock);
  }

  private createUnavailable(project: ManagedProject, issue: ProjectRuntimeStartupIssue): ProjectRuntimeUnavailable {
    return { state: "unavailable", project, issue };
  }
}

function projectRuntimeStartupIssue(
  cause: unknown,
  fallback: ProjectRuntimeStartupIssue["code"] = "harness-invalid",
): ProjectRuntimeStartupIssue {
  const message = cause instanceof Error ? cause.message : String(cause);
  const unreadable = /ENOENT|EACCES|EPERM|not exist|cannot read|unreadable/i.test(message);
  const missing = /SKILL\.md.*(?:missing|required)|Harness.*not found/i.test(message);
  const code = missing ? "harness-missing" : unreadable ? "harness-unreadable" : fallback;
  return {
    code,
    summary: code === "harness-unreadable"
      ? "这个项目的协作配置无法读取。"
      : "这个项目的协作配置需要处理。",
    recovery: "请检查项目协作配置，然后重新启动 Beaver Code。",
  };
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
