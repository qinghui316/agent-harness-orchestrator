import { existsSync } from "node:fs";
import { listProjectHarnessChanges } from "../project-harness/change.js";
import { discoverProjectHarness } from "../project-harness/discovery.js";
import { readProjectHarnessEvolutionState } from "../project-harness/evolution.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { HarnessAuditResult, ManagedProject, ProjectStatus } from "../types/index.js";
import { getGitBranch, isGitDirty, isGitRepo } from "./git.js";

export async function getProjectStatus(project: ManagedProject | null, path: string): Promise<ProjectStatus> {
  const pathExists = existsSync(path);
  const [gitRepo, branch, dirty, harness] = pathExists
    ? await Promise.all([
        isGitRepo(path),
        getGitBranch(path),
        isGitDirty(path),
        project ? registeredHarnessStatus(project) : unregisteredHarnessStatus(path),
      ])
    : [false, null, null, missingHarnessStatus(path)];
  return {
    project,
    path,
    pathExists,
    isGitRepo: gitRepo,
    branch,
    dirty,
    managed: harness.managed,
    harness,
  };
}

async function registeredHarnessStatus(project: ManagedProject): Promise<HarnessAuditResult> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state === "onboarding") {
    return {
      projectPath: project.path,
      managed: false,
      readiness: "missing",
      activeChanges: [],
      pendingEvolution: false,
      components: [],
    };
  }
  const resolution = state.resolution;
  const [changes, evolution] = await Promise.all([
    listProjectHarnessChanges(resolution.harness.skillRoot),
    readProjectHarnessEvolutionState(resolution.harness.skillRoot),
  ]);
  return {
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
  };
}

async function unregisteredHarnessStatus(path: string): Promise<HarnessAuditResult> {
  const discovery = await discoverProjectHarness(path, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  if (!discovery) return missingHarnessStatus(path);
  const changes = await listProjectHarnessChanges(discovery.handle.skillRoot);
  const evolution = await readProjectHarnessEvolutionState(discovery.handle.skillRoot);
  return {
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
  };
}

function missingHarnessStatus(path: string): HarnessAuditResult {
  return {
    projectPath: path,
    managed: false,
    readiness: "missing",
    activeChanges: [],
    pendingEvolution: false,
    components: [],
  };
}
