import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderDescriptor } from "../../src/provider-runtime/contracts.js";
import { ProviderRegistry } from "../../src/provider-runtime/registry.js";
import type {
  ProjectRuntimeCoordinatorPort,
  ProjectRuntimeStartupResult,
  ProjectRuntimeState,
} from "../../src/project-runtime/coordinator.js";
import { initializeProjectRuntimeSidecar } from "../../src/project-runtime/lifecycle.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { startWorkbenchServer, type WorkbenchServerHandle } from "../../src/server/workbench-server.js";
import { WorkbenchProjectRemovalService } from "../../src/server/workbench/project-removal.js";
import type { ManagedProject } from "../../src/types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { defaultProjectRuntimeActivityRegistry } from "../../src/project-runtime/activity.js";
import { defaultProjectWorkbenchDatabaseLeaseRegistry } from "../../src/workbench/persistence/database-leases.js";
import { defaultProjectRemovalFence } from "../../src/project-runtime/removal.js";

const roots: string[] = [];
const handles: WorkbenchServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close().catch(() => undefined)));
  for (const projectId of ["project-one", "project-two"]) {
    defaultProjectRuntimeActivityRegistry.activateProject(projectId);
    defaultProjectWorkbenchDatabaseLeaseRegistry.activateProject(projectId);
    if (defaultProjectRemovalFence.status(projectId) === "removed") {
      defaultProjectRemovalFence.activateAfterRegistration(projectId);
    }
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Workbench project removal", () => {
  it("requires an exact confirmation token and deletes only registration plus runtime sidecar", async () => {
    const fixture = await createFixture();
    const confirmation = await postJson<RemovalConfirmation>(
      `${fixture.handle.url}/api/projects/project-one/removal-confirmation`,
      {},
    );
    expect(confirmation).toMatchObject({
      projectId: "project-one",
      projectName: "Project One",
      token: expect.any(String),
    });

    const missingToken = await fetch(`${fixture.handle.url}/api/projects/project-one/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    expect(missingToken.status).toBe(400);

    const database = await openProjectRuntimeWorkbenchDatabase(fixture.projectOne.paths);
    const removed = await postJson<{ removal: { sidecarRemoved: boolean } }>(
      `${fixture.handle.url}/api/projects/project-one/remove`,
      { confirm: true, confirmationToken: confirmation.token },
    );
    expect(removed.removal).toEqual({
      projectId: "project-one",
      sidecarRemoved: true,
    });
    expect(() => database.conversations.listConversations("project-one")).toThrow(/not open/i);
    expect(await fixture.store.resolveProject("project-one")).toBeNull();
    expect(existsSync(fixture.projectOne.paths.sidecarRoot)).toBe(false);
    expect(await readFile(fixture.projectOne.sourceFile, "utf8")).toBe("source-preserved");
    expect(await readFile(fixture.projectOne.skillFile, "utf8")).toBe("skill-preserved");
    expect(await readFile(fixture.projectOne.worktreeFile, "utf8")).toBe("worktree-preserved");
    expect(fixture.shutdownProjects).toEqual([{
      projectId: "project-one",
      projectPath: fixture.projectOne.project.path,
    }]);

    const readded = await postJson<{ project: { id: string } }>(`${fixture.handle.url}/api/projects`, {
      path: fixture.projectOne.project.path,
      confirm: true,
    });
    expect(readded.project.id).toBe("project-one");
    expect(existsSync(fixture.projectOne.paths.sidecarRoot)).toBe(true);
    const reactivated = await fetch(`${fixture.handle.url}/api/projects/project-one/providers/capabilities?productMode=harness`);
    expect(reactivated.status).toBe(200);
  });

  it("fences new work, closes project SSE, drains the handler, and leaves another project active", async () => {
    let releaseShutdown!: () => void;
    let observeShutdown!: () => void;
    const shutdownObserved = new Promise<void>((resolve) => { observeShutdown = resolve; });
    const shutdownGate = new Promise<void>((resolve) => { releaseShutdown = resolve; });
    const fixture = await createFixture({
      shutdownProject: async (project) => {
        fixture.shutdownProjects.push(project);
        observeShutdown();
        await shutdownGate;
      },
    });
    const live = await fetch(`${fixture.handle.url}/api/projects/project-one/workbench/events/live`);
    expect(live.status).toBe(200);
    expect(live.headers.get("content-type")).toContain("text/event-stream");
    const confirmation = await postJson<RemovalConfirmation>(
      `${fixture.handle.url}/api/projects/project-one/removal-confirmation`,
      {},
    );

    const removal = postJson<{ removal: { projectId: string } }>(
      `${fixture.handle.url}/api/projects/project-one/remove`,
      { confirm: true, confirmationToken: confirmation.token },
    );
    await withTimeout(shutdownObserved, "provider shutdown was not requested");

    const blocked = await withTimeout(
      fetch(`${fixture.handle.url}/api/projects/project-one/providers/capabilities?productMode=harness`),
      "fenced request did not finish",
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain("cannot accept work");
    const unaffected = await withTimeout(
      fetch(`${fixture.handle.url}/api/projects/project-two/providers/capabilities?productMode=harness`),
      "unaffected project request did not finish",
    );
    expect(unaffected.status).toBe(200);
    const concurrentRegistration = await fetch(`${fixture.handle.url}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: fixture.projectOne.project.path, confirm: true }),
    });
    expect(concurrentRegistration.status).toBe(409);
    expect(await concurrentRegistration.text()).toContain("already in progress");
    const secondRemovalService = new WorkbenchProjectRemovalService({
      store: fixture.store,
      providerRegistry: fixture.providerRegistry,
    });
    let secondServiceRegistered = false;
    await expect(secondRemovalService.runRegistration(fixture.projectOne.project.path, async () => {
      secondServiceRegistered = true;
      return { project: fixture.projectOne.project };
    })).rejects.toThrow(/already in progress/);
    expect(secondServiceRegistered).toBe(false);
    await expect(startWorkbenchServer(null, {
      port: 0,
      staticRoot: fixture.staticRoot,
      store: fixture.store,
      providerRegistry: fixture.providerRegistry,
      projectRuntimeCoordinator: fixture.projectRuntimeCoordinator,
    })).rejects.toThrow(/activation is forbidden/);

    releaseShutdown();
    await expect(withTimeout(removal, "project removal did not finish")).resolves.toMatchObject({
      removal: { projectId: "project-one" },
    });
    await expect(withTimeout(streamReachesEnd(live), "project SSE did not close")).resolves.toBe(true);
  });

  it("waits for the complete higher-level Agent operation before deleting the sidecar", async () => {
    const fixture = await createFixture();
    let releaseActivity!: () => void;
    const activityGate = new Promise<void>((resolve) => { releaseActivity = resolve; });
    const activity = defaultProjectRuntimeActivityRegistry.run("project-one", async () => activityGate);
    const confirmation = await postJson<RemovalConfirmation>(
      `${fixture.handle.url}/api/projects/project-one/removal-confirmation`,
      {},
    );
    let removalFinished = false;
    const removal = postJson<{ removal: { projectId: string } }>(
      `${fixture.handle.url}/api/projects/project-one/remove`,
      { confirm: true, confirmationToken: confirmation.token },
    ).then((result) => {
      removalFinished = true;
      return result;
    });
    await vi.waitFor(() => expect(fixture.shutdownProjects).toHaveLength(1));
    await Promise.resolve();
    expect(removalFinished).toBe(false);
    expect(existsSync(fixture.projectOne.paths.sidecarRoot)).toBe(true);

    releaseActivity();
    await Promise.all([activity, removal]);
    expect(existsSync(fixture.projectOne.paths.sidecarRoot)).toBe(false);
  });
});

interface RemovalConfirmation {
  token: string;
  projectId: string;
  projectName: string;
}

async function createFixture(options: {
  shutdownProject?: (project: { projectId: string; projectPath: string }) => Promise<void>;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "aho-workbench-removal-"));
  roots.push(root);
  const ahoHome = join(root, "aho-home");
  const staticRoot = join(root, "web");
  await mkdir(staticRoot, { recursive: true });
  await writeFile(join(staticRoot, "index.html"), "<div>AHO</div>", "utf8");
  const store = new ProjectRegistryStore(ahoHome);
  const projectOne = await createProject(root, ahoHome, store, "project-one", "Project One");
  const projectTwo = await createProject(root, ahoHome, store, "project-two", "Project Two");
  const shutdownProjects: Array<{ projectId: string; projectPath: string }> = [];
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(fakeProvider(async (project) => {
    if (options.shutdownProject) await options.shutdownProject(project);
    else shutdownProjects.push(project);
  }));
  const projectRuntimeCoordinator = fakeProjectRuntimeCoordinator(store, ahoHome);
  const handle = await startWorkbenchServer(null, {
    port: 0,
    staticRoot,
    store,
    providerRegistry,
    projectRuntimeCoordinator,
  });
  handles.push(handle);
  return {
    handle,
    store,
    projectOne,
    projectTwo,
    shutdownProjects,
    providerRegistry,
    projectRuntimeCoordinator,
    staticRoot,
  };
}

async function createProject(
  root: string,
  ahoHome: string,
  store: ProjectRegistryStore,
  projectId: string,
  name: string,
) {
  const projectRoot = join(root, `${projectId}-source`);
  const worktreeRoot = join(root, `${projectId}-worktree`);
  const skillRoot = join(projectRoot, ".agents", "skills", `${projectId}-harness`);
  await mkdir(skillRoot, { recursive: true });
  await mkdir(worktreeRoot, { recursive: true });
  const sourceFile = join(projectRoot, "source.txt");
  const skillFile = join(skillRoot, "SKILL.md");
  const worktreeFile = join(worktreeRoot, "worktree.txt");
  await writeFile(sourceFile, "source-preserved", "utf8");
  await writeFile(skillFile, "skill-preserved", "utf8");
  await writeFile(worktreeFile, "worktree-preserved", "utf8");
  const registration = await store.registerProject({ path: projectRoot, name, projectId });
  const paths = resolveProjectRuntimePaths(projectId, ahoHome);
  await initializeProjectRuntimeSidecar(paths);
  await writeFile(join(paths.logsRoot, "runtime.log"), "runtime", "utf8");
  return { project: registration.project, paths, sourceFile, skillFile, worktreeFile };
}

function fakeProjectRuntimeCoordinator(
  store: ProjectRegistryStore,
  ahoHome: string,
): ProjectRuntimeCoordinatorPort {
  const state = (project: ManagedProject): ProjectRuntimeState => ({
    state: "onboarding",
    project,
    projectRoot: project.path,
    paths: resolveProjectRuntimePaths(project.id, ahoHome),
    reservedProjectId: project.id,
  });
  return {
    async reconcileStartup(): Promise<ProjectRuntimeStartupResult> {
      return { states: [], migrations: [], recoveries: [], onboardingRecoveries: [] };
    },
    async register(input) {
      const projectId = input.path.endsWith("project-one-source") ? "project-one" : "project-two";
      const registration = await store.registerProject({ ...input, projectId });
      await initializeProjectRuntimeSidecar(resolveProjectRuntimePaths(projectId, ahoHome));
      return state(registration.project);
    },
    async resolve(project) {
      return state(project);
    },
    async requireReady() {
      throw new Error("Project Harness readiness is not used by the removal API test.");
    },
  };
}

function fakeProvider(
  shutdownProject: (project: { projectId: string; projectPath: string }) => Promise<void>,
): ProviderDescriptor {
  const snapshot = {
    providerId: "test-provider",
    runnable: true,
    capabilities: [],
  } as never;
  return {
    id: "test-provider",
    displayName: "Test Provider",
    runtime: {
      shutdown: async () => undefined,
      shutdownProject,
    },
    capabilitySnapshot: async () => snapshot,
    runtimeSummary: async () => ({
      providerId: "test-provider",
      productMode: "harness",
      harnessExecutionModes: ["stepwise"],
      snapshot,
    }),
    models: {
      read: async () => ({ providerId: "test-provider", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
      select: async () => ({ providerId: "test-provider", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
    },
    diagnostics: async () => ({
      providerId: "test-provider",
      displayName: "Test Provider",
      installation: { available: true },
      adapter: { id: "test", version: "1" },
      capabilities: snapshot,
      models: { providerId: "test-provider", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true },
      sessionHealth: "ready",
      lastError: null,
      rawEvidenceRefs: [],
      projectActions: [],
    }),
    projectActions: { list: async () => [], execute: async () => { throw new Error("not supported"); } },
    skills: {
      list: async ({ projectPath }) => ({ providerId: "test-provider", projectPath, skills: [], errors: [] }),
      setEnabled: async ({ enabled }) => ({ effectiveEnabled: enabled }),
    },
    conversation: {
      runTurn: async () => { throw new Error("not used"); },
      inspectChild: async () => "stale",
      continueChild: async () => { throw new Error("not used"); },
      closeChild: async () => { throw new Error("not used"); },
      getActiveTurn: () => null,
      listActiveTurns: () => [],
    },
    leafExecution: { runTurn: async () => { throw new Error("not used"); } },
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function streamReachesEnd(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return true;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return true;
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 2_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
