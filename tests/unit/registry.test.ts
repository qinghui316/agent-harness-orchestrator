import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectRegistryStore } from "../../src/registry/store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-registry-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("ProjectRegistryStore", () => {
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
});
