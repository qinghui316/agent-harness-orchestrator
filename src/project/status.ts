import { existsSync } from "node:fs";
import { listProjectHarnessChanges } from "../project-harness/change.js";
import { discoverProjectHarness } from "../project-harness/discovery.js";
import { readProjectHarnessEvolutionState } from "../project-harness/evolution.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import {
  resolveProjectRuntimeState,
  type ProjectRuntimeStartupState,
} from "../project-runtime/coordinator.js";
import type { HarnessAuditResult, ManagedProject, ProjectStatus } from "../types/index.js";
import { getGitBranch, isGitDirty, isGitRepo } from "./git.js";

export async function getProjectStatus(
  project: ManagedProject | null,
  path: string,
  runtimeStateResolver?: (project: ManagedProject) => Promise<ProjectRuntimeStartupState>,
): Promise<ProjectStatus> {
  const pathExists = existsSync(path);
  if (project && !pathExists) return unavailableProjectStatus(project, path);
  const [gitRepo, branch, dirty, harness] = pathExists
    ? await Promise.all([
        isGitRepo(path),
        getGitBranch(path),
        isGitDirty(path),
        project ? registeredHarnessStatus(project, runtimeStateResolver) : unregisteredHarnessStatus(path),
      ])
    : [false, null, null, { audit: missingHarnessAudit(path), availability: { state: "onboarding" as const, summary: null, recovery: null } }];
  return {
    project,
    path,
    pathExists,
    isGitRepo: gitRepo,
    branch,
    dirty,
    managed: harness.audit.managed,
    harness: harness.audit,
    runtimeAvailability: harness.availability,
  };
}

async function registeredHarnessStatus(
  project: ManagedProject,
  runtimeStateResolver?: (project: ManagedProject) => Promise<ProjectRuntimeStartupState>,
): Promise<{ audit: HarnessAuditResult; availability: ProjectStatus["runtimeAvailability"] }> {
  let state: ProjectRuntimeStartupState;
  try {
    state = runtimeStateResolver
      ? await runtimeStateResolver(project)
      : await resolveProjectRuntimeState(project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
  } catch {
    return unavailableHarnessStatus(project.path);
  }
  if (state.state === "unavailable") {
    return {
      audit: unavailableHarnessAudit(project.path),
      availability: { state: "unavailable", summary: state.issue.summary, recovery: state.issue.recovery },
    };
  }
  if (state.state === "onboarding") {
    return {
      audit: missingHarnessAudit(project.path),
      availability: { state: "onboarding", summary: null, recovery: null },
    };
  }
  const resolution = state.resolution;
  const [changes, evolution] = await Promise.all([
    listProjectHarnessChanges(resolution.harness.skillRoot),
    readProjectHarnessEvolutionState(resolution.harness.skillRoot),
  ]);
  return {
    audit: {
      projectPath: project.path,
      managed: true,
      readiness: state.state === "ready" ? "ready" : "partial",
      activeChanges: changes.filter((change) => change.status === "active").map((change) => ({
        name: change.change_id,
        path: `state/changes/active/${change.change_id}`,
      })),
      pendingEvolution: evolution.pending,
      components: resolution.binding.providers.map((binding) => ({
        name: binding.providerId,
        path: binding.discoveryPath,
        location: "project" as const,
        exists: binding.status === "ready",
        required: binding.required,
      })),
    },
    availability: projectRuntimeAvailability(state),
  };
}

function projectRuntimeAvailability(state: Exclude<ProjectRuntimeStartupState, { state: "unavailable" }>): NonNullable<ProjectStatus["runtimeAvailability"]> {
  if (state.state === "repair-required") {
    return {
      state: "repair-required",
      summary: "这个项目的协作配置需要处理。",
      recovery: "请检查项目协作配置，然后重新启动 Beaver Code。",
    };
  }
  if (state.state !== "ready" || !state.workbenchData || state.workbenchData.state === "ready") {
    return { state: state.state, summary: null, recovery: null };
  }
  if (state.workbenchData.state === "upgrade-required") {
    return {
      state: "upgrade-required",
      summary: "这个项目的数据将在首次打开时升级。",
      recovery: null,
    };
  }
  if (state.workbenchData.state === "upgrading") {
    return {
      state: "upgrading",
      summary: "正在安全升级这个项目的数据。",
      recovery: null,
    };
  }
  return {
    state: "unavailable",
    summary: "这个项目的数据需要处理。",
    recovery: "原有数据已保留，请查看诊断信息后重试。",
  };
}

async function unregisteredHarnessStatus(path: string): Promise<{ audit: HarnessAuditResult; availability: ProjectStatus["runtimeAvailability"] }> {
  const discovery = await discoverProjectHarness(path, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  if (!discovery) return { audit: missingHarnessAudit(path), availability: { state: "onboarding", summary: null, recovery: null } };
  const changes = await listProjectHarnessChanges(discovery.handle.skillRoot);
  const evolution = await readProjectHarnessEvolutionState(discovery.handle.skillRoot);
  return { audit: {
    projectPath: path,
    managed: true,
    readiness: "ready",
    activeChanges: changes.filter((change) => change.status === "active").map((change) => ({
      name: change.change_id,
      path: `state/changes/active/${change.change_id}`,
    })),
    pendingEvolution: evolution.pending,
    components: discovery.binding.providers.map((binding) => ({
      name: binding.providerId,
      path: binding.discoveryPath,
      location: "project" as const,
      exists: binding.status === "ready",
      required: binding.required,
    })),
  }, availability: { state: "ready", summary: null, recovery: null } };
}

function missingHarnessAudit(path: string): HarnessAuditResult {
  return {
    projectPath: path,
    managed: false,
    readiness: "missing",
    activeChanges: [],
    pendingEvolution: false,
    components: [],
  };
}

function unavailableHarnessAudit(path: string): HarnessAuditResult {
  return { ...missingHarnessAudit(path), managed: true, readiness: "unavailable" };
}

function unavailableHarnessStatus(path: string): { audit: HarnessAuditResult; availability: ProjectStatus["runtimeAvailability"] } {
  return {
    audit: unavailableHarnessAudit(path),
    availability: {
      state: "unavailable",
      summary: "这个项目的协作配置无法读取。",
      recovery: "请检查项目协作配置，然后重新启动 Beaver Code。",
    },
  };
}

function unavailableProjectStatus(project: ManagedProject, path: string): ProjectStatus {
  const unavailable = unavailableHarnessStatus(path);
  return {
    project,
    path,
    pathExists: false,
    isGitRepo: false,
    branch: null,
    dirty: null,
    managed: true,
    harness: unavailable.audit,
    runtimeAvailability: unavailable.availability,
  };
}
