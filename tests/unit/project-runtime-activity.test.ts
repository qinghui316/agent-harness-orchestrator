import { describe, expect, it, vi } from "vitest";
import { ProjectRuntimeActivityRegistry } from "../../src/project-runtime/activity.js";
import { ProjectWorkbenchDatabaseLeaseRegistry } from "../../src/workbench/persistence/database-leases.js";
import type { WorkbenchDatabase } from "../../src/workbench/persistence/database.js";

describe("project runtime activity coordination", () => {
  it("blocks new activity and drains the complete higher-level project operation", async () => {
    const registry = new ProjectRuntimeActivityRegistry();
    let releaseActivity!: () => void;
    const activityGate = new Promise<void>((resolve) => { releaseActivity = resolve; });
    const activity = registry.run("project-one", async () => activityGate);
    expect(registry.activeCount("project-one")).toBe(1);

    registry.blockProject("project-one");
    await expect(registry.run("project-one", async () => undefined)).rejects.toThrow(/cannot start activity/);
    await expect(registry.run("project-two", async () => "ok")).resolves.toBe("ok");
    let drained = false;
    const drain = registry.drainProject("project-one").then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);

    releaseActivity();
    await Promise.all([activity, drain]);
    expect(drained).toBe(true);
    registry.activateProject("project-one");
    await expect(registry.run("project-one", async () => "reactivated")).resolves.toBe("reactivated");
  });

  it("waits for an in-flight database factory and closes its connection before removal continues", async () => {
    const registry = new ProjectWorkbenchDatabaseLeaseRegistry();
    let releaseFactory!: () => void;
    const factoryGate = new Promise<void>((resolve) => { releaseFactory = resolve; });
    const close = vi.fn();
    const database = { close } as unknown as WorkbenchDatabase;
    const opening = registry.open("project-one", async () => {
      await factoryGate;
      return database;
    });

    registry.blockProject("project-one");
    let drained = false;
    const closeProject = registry.closeProject("project-one").then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);

    releaseFactory();
    await expect(opening).rejects.toThrow(/being removed/);
    await closeProject;
    expect(drained).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
