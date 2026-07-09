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
    const project = await store.addProject(projectPath, "My Project");

    expect(project.id).toBe("my-project");
    expect(project.name).toBe("My Project");
    expect(await store.listProjects()).toHaveLength(1);
    expect(await store.resolveProject("my-project")).toMatchObject({ path: projectPath });
  });

  it("does not duplicate the same path", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "repo");

    const first = await store.addProject(projectPath, "Repo");
    const second = await store.addProject(projectPath, "Repo Again");

    expect(second.id).toBe(first.id);
    expect(await store.listProjects()).toHaveLength(1);
  });

  it("adds a short hash when ids conflict", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));

    const first = await store.addProject(join(tempDir, "one"), "Repo");
    const second = await store.addProject(join(tempDir, "two"), "Repo");

    expect(first.id).toBe("repo");
    expect(second.id).toMatch(/^repo-[a-f0-9]{8}$/);
  });

  it("removes a project from the registry without deleting source files", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "repo");
    await mkdir(projectPath, { recursive: true });
    await writeFile(join(projectPath, "keep.txt"), "source stays", "utf8");
    const project = await store.addProject(projectPath, "Repo");

    const removed = await store.removeProject(project.id);

    expect(removed).toMatchObject({ id: project.id, path: projectPath });
    expect(await store.listProjects()).toHaveLength(0);
    await expect(writeFile(join(projectPath, "still-here.txt"), "ok", "utf8")).resolves.toBeUndefined();
  });

  it("keeps same-name projects registered as separate paths", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));

    const first = await store.addProject(join(tempDir, "workspace-a", "src"), "src");
    const second = await store.addProject(join(tempDir, "workspace-b", "src"), "src");

    expect(first.name).toBe("src");
    expect(second.name).toBe("src");
    expect(first.id).not.toBe(second.id);
    expect(await store.listProjects()).toHaveLength(2);
  });

  it("inherits an existing project marker id when registering a managed project", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const projectPath = join(tempDir, "repo");
    await writeMarker(projectPath, "ahoacc1", "ahoacc1");

    const project = await store.addProject(projectPath);

    expect(project.id).toBe("ahoacc1");
    expect(project.name).toBe("repo");
    expect(await store.resolveProject("ahoacc1")).toMatchObject({ path: projectPath });
  });

  it("fails closed when a managed project marker id is already registered to another path", async () => {
    const store = new ProjectRegistryStore(join(tempDir, "home"));
    const firstPath = join(tempDir, "one");
    const secondPath = join(tempDir, "two");
    await writeMarker(firstPath, "ahoacc1", "ahoacc1");
    await writeMarker(secondPath, "ahoacc1", "ahoacc1");
    await store.addProject(firstPath);

    await expect(store.addProject(secondPath)).rejects.toThrow("Project marker id is already registered");
  });
});

async function writeMarker(projectPath: string, id: string, name: string): Promise<void> {
  await mkdir(join(projectPath, ".agent-harness"), { recursive: true });
  await writeFile(join(projectPath, ".agent-harness", "project.json"), JSON.stringify({
    version: "1.0",
    id,
    name,
    managedBy: "agent-harness-orchestrator",
    memoryMode: "external-local",
    createdAt: "2026-06-22T00:00:00.000Z",
  }, null, 2), "utf8");
}
