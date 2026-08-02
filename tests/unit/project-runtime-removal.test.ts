import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProjectRemovalCoordinator,
  ProjectRemovalFence,
  type ProjectRemovalLifecyclePort,
} from "../../src/project-runtime/removal.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectRemovalFence", () => {
  it("invalidates old callbacks across removal and re-registration", () => {
    const fence = new ProjectRemovalFence();
    const initial = fence.capture("project-one");
    const removalGeneration = fence.beginRemoval("project-one");
    expect(() => fence.assertCurrent("project-one", initial)).toThrow(/removing/);
    fence.completeRemoval("project-one", removalGeneration);
    expect(() => fence.capture("project-one")).toThrow(/removed/);
    const readded = fence.activateAfterRegistration("project-one");
    expect(readded).toBeGreaterThan(removalGeneration);
    expect(() => fence.assertCurrent("project-one", initial)).toThrow(/stale/);
    expect(fence.capture("project-one")).toBe(readded);
  });
});

describe("ProjectRemovalCoordinator", () => {
  it("orders shutdown, removes only the canonical sidecar, and unregisters once", async () => {
    const setup = await createSetup();
    const confirmation = setup.coordinator.issueConfirmation(setup.projectId, setup.projectPath);
    const result = await setup.coordinator.remove({
      projectId: setup.projectId,
      projectPath: setup.projectPath,
      runtimePaths: setup.paths,
      confirmationToken: confirmation.token,
      confirmed: true,
    });

    expect(result).toEqual({ projectId: setup.projectId, sidecarRemoved: true, cleanupPending: false });
    expect(setup.events).toEqual(["stop", "unsubscribe", "drain", "close", "unregister"]);
    expect(existsSync(setup.paths.sidecarRoot)).toBe(false);
    expect(await readFile(join(setup.projectPath, "source.txt"), "utf8")).toBe("preserved");
    expect(await readFile(setup.skillFile, "utf8")).toBe("preserved");
    expect(setup.coordinator.fence.status(setup.projectId)).toBe("removed");
  });

  it("requires a live one-time confirmation bound to exact project paths", async () => {
    const setup = await createSetup();
    const confirmation = setup.coordinator.issueConfirmation(setup.projectId, setup.projectPath);
    await expect(setup.coordinator.remove({
      projectId: setup.projectId,
      projectPath: setup.projectPath,
      runtimePaths: setup.paths,
      confirmationToken: confirmation.token,
      confirmed: false,
    })).rejects.toThrow(/explicit confirmation/);
    await expect(setup.coordinator.remove({
      projectId: setup.projectId,
      projectPath: setup.projectPath,
      runtimePaths: setup.paths,
      confirmationToken: confirmation.token,
      confirmed: true,
    })).rejects.toThrow(/missing, stale, or already used/);
  });

  it("restores the sidecar and registration when unregister fails", async () => {
    const setup = await createSetup({ unregisterError: new Error("registry unavailable") });
    const confirmation = setup.coordinator.issueConfirmation(setup.projectId, setup.projectPath);
    await expect(setup.coordinator.remove({
      projectId: setup.projectId,
      projectPath: setup.projectPath,
      runtimePaths: setup.paths,
      confirmationToken: confirmation.token,
      confirmed: true,
    })).rejects.toThrow("registry unavailable");

    expect(existsSync(setup.paths.sidecarRoot)).toBe(true);
    expect(await readFile(join(setup.paths.sidecarRoot, "state.json"), "utf8")).toBe("state");
    expect(setup.events).toEqual(["stop", "unsubscribe", "drain", "close", "unregister", "aborted"]);
    expect(setup.coordinator.fence.status(setup.projectId)).toBe("active");
  });

  it("restores the exact registration and sidecar after a pre-commit failure", async () => {
    const setup = await createSetup({ failureStage: "unregistered" });
    const confirmation = setup.coordinator.issueConfirmation(setup.projectId, setup.projectPath);
    await expect(setup.coordinator.remove({
      projectId: setup.projectId,
      projectPath: setup.projectPath,
      runtimePaths: setup.paths,
      confirmationToken: confirmation.token,
      confirmed: true,
    })).rejects.toThrow("injected unregistered");

    expect(setup.restored).toEqual([{ id: setup.projectId, path: setup.projectPath }]);
    expect(existsSync(setup.paths.sidecarRoot)).toBe(true);
    expect(setup.coordinator.fence.status(setup.projectId)).toBe("active");
  });

  it("rejects a sidecar link without touching its target or registration", async () => {
    if (process.platform !== "win32") return;
    const setup = await createSetup({ createSidecar: false });
    const target = join(setup.root, "link-target");
    await mkdir(target);
    await writeFile(join(target, "state.json"), "target", "utf8");
    const { symlink } = await import("node:fs/promises");
    await symlink(target, setup.paths.sidecarRoot, "junction");
    const confirmation = setup.coordinator.issueConfirmation(setup.projectId, setup.projectPath);
    await expect(setup.coordinator.remove({
      projectId: setup.projectId,
      projectPath: setup.projectPath,
      runtimePaths: setup.paths,
      confirmationToken: confirmation.token,
      confirmed: true,
    })).rejects.toThrow(/link or Junction/);
    expect(await readFile(join(target, "state.json"), "utf8")).toBe("target");
    expect(setup.events).not.toContain("unregister");
  });
});

async function createSetup(options: {
  unregisterError?: Error;
  failureStage?: string;
  createSidecar?: boolean;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "aho-project-removal-"));
  roots.push(root);
  const ahoHome = join(root, "home");
  const projectId = "project-one";
  const projectPath = join(root, "repository");
  const skillRoot = join(root, "physical-skill");
  const skillFile = join(skillRoot, "SKILL.md");
  const paths = resolveProjectRuntimePaths(projectId, ahoHome);
  await mkdir(projectPath, { recursive: true });
  await mkdir(skillRoot, { recursive: true });
  await writeFile(join(projectPath, "source.txt"), "preserved", "utf8");
  await writeFile(skillFile, "preserved", "utf8");
  if (options.createSidecar !== false) {
    await mkdir(paths.sidecarRoot, { recursive: true });
    await writeFile(join(paths.sidecarRoot, "state.json"), "state", "utf8");
  } else {
    await mkdir(join(ahoHome, "projects"), { recursive: true });
  }
  const events: string[] = [];
  const restored: Array<{ id: string; path: string }> = [];
  const lifecycle: ProjectRemovalLifecyclePort = {
    async stopProjectActivity() { events.push("stop"); },
    async unsubscribeProject() { events.push("unsubscribe"); },
    async drainProject() { events.push("drain"); },
    async closeProjectDatabases() { events.push("close"); },
    async removalAborted() { events.push("aborted"); },
  };
  const coordinator = new ProjectRemovalCoordinator({
    ahoHome,
    lifecycle,
    registration: {
      async unregister() {
        events.push("unregister");
        if (options.unregisterError) throw options.unregisterError;
        return { id: projectId, path: projectPath };
      },
      async restore(registration) {
        restored.push(registration);
      },
    },
    createToken: () => "token-one",
    ...(options.failureStage
      ? { failureInjection: (stage: string) => {
        if (stage === options.failureStage) throw new Error(`injected ${stage}`);
      } }
      : {}),
  });
  return { root, projectId, projectPath, skillFile, paths, coordinator, events, restored };
}
