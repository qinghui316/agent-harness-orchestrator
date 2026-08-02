import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeProjectRuntimeSidecar } from "../../src/project-runtime/lifecycle.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { addExistingProject, createNewProject } from "../../src/server/workbench/project-admin.js";
import { ProjectRuntimeCoordinator } from "../../src/project-runtime/coordinator.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project runtime sidecar lifecycle", () => {
  it("initializes the complete operational sidecar and Workbench database", async () => {
    const root = await temporaryRoot();
    const paths = resolveProjectRuntimePaths("project-a1", root);

    await initializeProjectRuntimeSidecar(paths);

    expect(existsSync(paths.workbenchDbPath)).toBe(true);
    for (const path of [
      paths.runsRoot,
      paths.logsRoot,
      paths.transcriptsRoot,
      paths.worktreeMetadataRoot,
      paths.cacheRoot,
      paths.transactionStagingRoot,
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
  });

  it("registers existing and new projects without creating legacy Harness state", async () => {
    const root = await temporaryRoot();
    const ahoHome = join(root, "aho-home");
    const existingRoot = join(root, "existing");
    await mkdir(existingRoot, { recursive: true });
    const store = new ProjectRegistryStore(ahoHome);
    const coordinator = new ProjectRuntimeCoordinator({ store, ahoHome });

    const existing = await addExistingProject(store, {
      path: existingRoot,
      name: "Existing",
      confirm: true,
    }, coordinator);
    const created = await createNewProject(store, {
      parentPath: root,
      name: "created",
      readme: true,
      confirm: true,
    }, coordinator);

    for (const project of [existing.project, created.project]) {
      const paths = resolveProjectRuntimePaths(project.id, ahoHome);
      expect(existsSync(paths.workbenchDbPath)).toBe(true);
      expect(existsSync(join(project.path, ".agent-harness", "project.json"))).toBe(false);
      expect(existsSync(join(project.path, "harness"))).toBe(false);
    }
  });

  it("rolls back only a newly added Registry entry when sidecar initialization fails", async () => {
    const root = await temporaryRoot();
    const projectRoot = join(root, "project");
    await mkdir(projectRoot);
    const ahoHome = join(root, "aho-home");
    const store = new ProjectRegistryStore(ahoHome);
    const failing = new ProjectRuntimeCoordinator({
      store,
      ahoHome,
      async initializeSidecar() {
        throw new Error("sidecar failed");
      },
    });

    await expect(addExistingProject(store, {
      path: projectRoot,
      name: "Project",
      confirm: true,
    }, failing)).rejects.toThrow("sidecar failed");
    expect(await store.listProjects()).toEqual([]);

    const registered = (await store.registerProject({ path: projectRoot, name: "Project" })).project;
    await expect(addExistingProject(store, {
      path: projectRoot,
      name: "Project",
      confirm: true,
    }, failing)).rejects.toThrow("sidecar failed");
    expect(await store.resolveProject(registered.id)).toMatchObject({ id: registered.id, path: projectRoot });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aho-project-runtime-lifecycle-"));
  cleanup.push(root);
  return root;
}
