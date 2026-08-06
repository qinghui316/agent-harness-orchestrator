import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { resolveExistingDirectory } from "../../fs/path.js";
import { ProjectRuntimeCoordinator, type ProjectRuntimeCoordinatorPort } from "../../project-runtime/coordinator.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { getProjectStatus } from "../../project/status.js";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { ManagedProject } from "../../types/index.js";
import { assertConfirmed, isWithinDirectory } from "./http.js";
import type { AddExistingProjectRequest, CreateNewProjectRequest, RemoveProjectRequest } from "./types.js";
import { listProjectStatusesWithDirect } from "./direct-project.js";
import type { WorkbenchProjectInput } from "../../workbench/read-model-types.js";
import type { WorkbenchProjectRemovalConfirmation, WorkbenchProjectRemovalPort } from "./project-removal.js";

export async function listProjectStatuses(store: ProjectRegistryStore, directInput: WorkbenchProjectInput | null = null): Promise<unknown[]> {
  return listProjectStatusesWithDirect(store, directInput);
}

export async function addExistingProject(
  store: ProjectRegistryStore,
  body: AddExistingProjectRequest,
  projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "register"> = new ProjectRuntimeCoordinator({
    store,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  }),
  projectRemoval?: Pick<WorkbenchProjectRemovalPort, "runRegistration">,
): Promise<{ project: ManagedProject; status: unknown }> {
  assertConfirmed(body.confirm);
  if (typeof body.path !== "string" || body.path.trim() === "") {
    const error = new Error("Project path is required.");
    error.name = "BadRequest";
    throw error;
  }
  const path = await resolveExistingDirectory(body.path);
  const register = async (): Promise<{ project: ManagedProject; status: unknown }> => {
    const state = await projectRuntimeCoordinator.register({ path, name: body.name });
    const project = state.project;
    return { project, status: await getProjectStatus(project, project.path) };
  };
  return projectRemoval ? projectRemoval.runRegistration(path, register) : register();
}

export async function createNewProject(
  store: ProjectRegistryStore,
  body: CreateNewProjectRequest,
  projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "register"> = new ProjectRuntimeCoordinator({
    store,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  }),
  projectRemoval?: Pick<WorkbenchProjectRemovalPort, "runRegistration">,
): Promise<{ project: ManagedProject; status: unknown; createdPath: string }> {
  assertConfirmed(body.confirm);
  if (typeof body.parentPath !== "string" || body.parentPath.trim() === "") {
    const error = new Error("Parent path is required.");
    error.name = "BadRequest";
    throw error;
  }
  const name = assertSafeDirectoryName(body.name);
  const parent = await resolveExistingDirectory(body.parentPath);
  const projectPath = resolve(parent, name);
  if (!isWithinDirectory(projectPath, parent) || existsSync(projectPath)) {
    const error = new Error(`Project path already exists or is unsafe: ${projectPath}`);
    error.name = "Conflict";
    throw error;
  }
  await mkdir(projectPath, { recursive: false });
  if (body.readme !== false || body.initialCommit === true) {
    await writeFile(join(projectPath, "README.md"), `# ${name}\n`, "utf8");
  }
  if (body.git === true || body.initialCommit === true) {
    await runGit(projectPath, ["init"]);
  }
  if (body.initialCommit === true) {
    await runGit(projectPath, ["add", "."]);
    await runGit(projectPath, ["-c", "user.name=AHO", "-c", "user.email=aho@example.local", "commit", "-m", "Initial commit"]);
  }
  const register = async (): Promise<{ project: ManagedProject; status: unknown; createdPath: string }> => {
    const state = await projectRuntimeCoordinator.register({ path: projectPath, name });
    const project = state.project;
    return { project, createdPath: projectPath, status: await getProjectStatus(project, project.path) };
  };
  return projectRemoval ? projectRemoval.runRegistration(projectPath, register) : register();
}

export async function prepareRegisteredProjectRemoval(
  projectRemoval: WorkbenchProjectRemovalPort,
  projectId: string,
): Promise<WorkbenchProjectRemovalConfirmation> {
  return projectRemoval.issueConfirmation(projectId);
}

export async function removeRegisteredProject(
  projectRemoval: WorkbenchProjectRemovalPort,
  projectId: string,
  body: RemoveProjectRequest,
): Promise<{ removal: Awaited<ReturnType<WorkbenchProjectRemovalPort["remove"]>> }> {
  if (typeof body.confirmationToken !== "string" || !body.confirmationToken.trim()) {
    const error = new Error("Project removal confirmation token is required.");
    error.name = "BadRequest";
    throw error;
  }
  return {
    removal: await projectRemoval.remove(projectId, {
      confirmationToken: body.confirmationToken,
      confirmed: body.confirm === true,
    }),
  };
}

function assertSafeDirectoryName(value: unknown): string {
  if (typeof value !== "string") {
    const error = new Error("Project name is required.");
    error.name = "BadRequest";
    throw error;
  }
  const name = value.trim();
  if (!name || name === "." || name === ".." || /[<>:"/\\|?*]/.test(name) || hasControlCharacter(name)) {
    const error = new Error("Project name is not a safe local directory name.");
    error.name = "BadRequest";
    throw error;
  }
  return name;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32);
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("git", args, { cwd, stdio: "pipe" });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const error = new Error(`git ${args.join(" ")} failed with exit code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`);
      error.name = "BadRequest";
      reject(error);
    });
  });
}
