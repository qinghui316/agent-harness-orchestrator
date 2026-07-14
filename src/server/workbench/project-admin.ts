import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { trustCodexProject } from "../../codex/trust.js";
import { resolveExistingDirectory } from "../../fs/path.js";
import { ensureProjectRuntime, initHarness } from "../../harness/init.js";
import { getProjectStatus } from "../../project/status.js";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { CodexProjectTrustStatus } from "../../types/index.js";
import type { ManagedProject, MemoryMode } from "../../types/index.js";
import { assertConfirmed, isWithinDirectory } from "./http.js";
import type { AddExistingProjectRequest, CreateNewProjectRequest, InitProjectHarnessRequest, RemoveProjectRequest, TrustCodexProjectRequest } from "./types.js";
import { listProjectStatusesWithDirect } from "./direct-project.js";
import type { WorkbenchProjectInput } from "../../workbench/manager.js";

export async function listProjectStatuses(store: ProjectRegistryStore, directInput: WorkbenchProjectInput | null = null): Promise<unknown[]> {
  return listProjectStatusesWithDirect(store, directInput);
}

export async function addExistingProject(store: ProjectRegistryStore, body: AddExistingProjectRequest): Promise<{ project: ManagedProject; status: unknown }> {
  assertConfirmed(body.confirm);
  if (typeof body.path !== "string" || body.path.trim() === "") {
    const error = new Error("Project path is required.");
    error.name = "BadRequest";
    throw error;
  }
  const path = await resolveExistingDirectory(body.path);
  const project = await store.addProject(path, body.name);
  await ensureProjectRuntime(project);
  return { project, status: await getProjectStatus(project, project.path) };
}

export async function createNewProject(store: ProjectRegistryStore, body: CreateNewProjectRequest): Promise<{ project: ManagedProject; status: unknown; createdPath: string }> {
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
  const project = await store.addProject(projectPath, name);
  await ensureProjectRuntime(project);
  return { project, createdPath: projectPath, status: await getProjectStatus(project, project.path) };
}

export async function removeRegisteredProject(store: ProjectRegistryStore, projectId: string, body: RemoveProjectRequest): Promise<{ removed: ManagedProject }> {
  assertConfirmed(body.confirm);
  const removed = await store.removeProject(projectId);
  if (!removed) {
    const error = new Error(`Project not found: ${projectId}`);
    error.name = "NotFound";
    throw error;
  }
  return { removed };
}

export async function initProjectHarness(store: ProjectRegistryStore, projectId: string, body: InitProjectHarnessRequest): Promise<{ result: unknown; status: unknown }> {
  assertConfirmed(body.confirm);
  const project = await store.resolveProject(projectId);
  if (!project) {
    const error = new Error(`Project not found: ${projectId}`);
    error.name = "NotFound";
    throw error;
  }
  const memoryMode = parseMemoryMode(body.memoryMode);
  const result = await initHarness(project, { memoryMode });
  return { result, status: await getProjectStatus(project, project.path) };
}

export async function trustCodexProjectForWorkbench(store: ProjectRegistryStore, projectId: string, body: TrustCodexProjectRequest): Promise<{ codexTrust: CodexProjectTrustStatus; status: unknown }> {
  assertConfirmed(body.confirm);
  const project = await store.resolveProject(projectId);
  if (!project) {
    const error = new Error(`Project not found: ${projectId}`);
    error.name = "NotFound";
    throw error;
  }
  const codexTrust = await trustCodexProject(project.path);
  return { codexTrust, status: await getProjectStatus(project, project.path) };
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

function parseMemoryMode(value: unknown): Exclude<MemoryMode, "remote"> {
  if (value === undefined || value === null || value === "external-local") return "external-local";
  if (value === "repo-local") return "repo-local";
  const error = new Error("Unsupported memory mode. Use repo-local or external-local.");
  error.name = "BadRequest";
  throw error;
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
