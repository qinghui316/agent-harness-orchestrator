import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAhoHome } from "../../src/fs/path.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-registry-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("ProjectRegistryStore", () => {
  it("uses the user home .agent-harness directory as the default app data home", () => {
    const previous = process.env.AHO_HOME;
    try {
      delete process.env.AHO_HOME;
      expect(getAhoHome()).toBe(resolve(homedir(), ".agent-harness"));
      expect(new ProjectRegistryStore().registryPath).toBe(join(resolve(homedir(), ".agent-harness"), "registry.json"));
    } finally {
      if (previous === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = previous;
    }
  });

  it("creates and reads registered projects", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "my-project");
    const { project } = await store.registerProject({ path: projectPath, name: "My Project" });

    expect(project.id).toBe("my-project");
    expect(project.name).toBe("My Project");
    expect(await store.listProjects()).toHaveLength(1);
    expect(await store.resolveProject("my-project")).toMatchObject({ path: projectPath });
  });

  it("does not duplicate the same path", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "repo");

    const first = (await store.registerProject({ path: projectPath, name: "Repo" })).project;
    const second = (await store.registerProject({ path: projectPath, name: "Repo Again" })).project;

    expect(second.id).toBe(first.id);
    expect(await store.listProjects()).toHaveLength(1);
  });

  it("adds a short hash when ids conflict", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));

    const first = (await store.registerProject({ path: join(tempDir, "one"), name: "Repo" })).project;
    const second = (await store.registerProject({ path: join(tempDir, "two"), name: "Repo" })).project;

    expect(first.id).toBe("repo");
    expect(second.id).toMatch(/^repo-[a-f0-9]{8}$/);
  });

  it("removes a project from the registry without deleting source files", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "repo");
    await mkdir(projectPath, { recursive: true });
    await writeFile(join(projectPath, "keep.txt"), "source stays", "utf8");
    const { project } = await store.registerProject({ path: projectPath, name: "Repo" });

    const removed = await store.removeProject(project.id);

    expect(removed).toMatchObject({ id: project.id, path: projectPath });
    expect(await store.listProjects()).toHaveLength(0);
    await expect(writeFile(join(projectPath, "still-here.txt"), "ok", "utf8")).resolves.toBeUndefined();
  });

  it("restores the exact registration during a removal rollback", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "repo");
    const project = await store.registerProject({
      path: projectPath,
      name: "Repo",
      projectId: "canonical-project",
    });
    await store.removeProject(project.project.id);

    await store.restoreProject(project.project);

    expect(await store.resolveProject("canonical-project")).toEqual(project.project);
  });

  it("keeps same-name projects registered as separate paths", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));

    const first = (await store.registerProject({ path: join(tempDir, "workspace-a", "src"), name: "src" })).project;
    const second = (await store.registerProject({ path: join(tempDir, "workspace-b", "src"), name: "src" })).project;

    expect(first.name).toBe("src");
    expect(second.name).toBe("src");
    expect(first.id).not.toBe(second.id);
    expect(await store.listProjects()).toHaveLength(2);
  });

  it("registers an explicitly discovered canonical project id", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "repo");

    const { project } = await store.registerProject({
      path: projectPath,
      name: "repo",
      projectId: "ahoacc1",
    });

    expect(project.id).toBe("ahoacc1");
    expect(project.name).toBe("repo");
    expect(await store.resolveProject("ahoacc1")).toMatchObject({ path: projectPath });
  });

  it("fails closed when a canonical project id is already registered to another path", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const firstPath = join(tempDir, "one");
    const secondPath = join(tempDir, "two");
    await store.registerProject({ path: firstPath, name: "one", projectId: "ahoacc1" });

    await expect(store.registerProject({ path: secondPath, name: "two", projectId: "ahoacc1" }))
      .rejects.toThrow("Project id is already registered");
  });
});
