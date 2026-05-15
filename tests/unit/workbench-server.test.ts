import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { startLocalCommandRun } from "../../src/run/manager.js";
import { buildNativeFolderDialogCommand, executeWorkbenchAction, startWorkbenchServer, type WorkbenchServerHandle } from "../../src/server/workbench-server.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;
let staticRoot: string;
let registryRoot: string;
let handle: WorkbenchServerHandle | null = null;

interface SnapshotResponse {
  left: { topics: Array<{ id: string }> };
  center: { agentLoop: { runs: Array<{ id: string }> } };
}

function project(): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path: tempDir,
    addedAt: "2026-05-15T00:00:00.000Z",
    lastSeenAt: "2026-05-15T00:00:00.000Z",
  };
}

describe("workbench server", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-server-"));
    staticRoot = await mkdtemp(join(tmpdir(), "aho-web-"));
    registryRoot = await mkdtemp(join(tmpdir(), "aho-registry-"));
    await writeFile(join(staticRoot, "index.html"), "<div>AHO</div>", "utf8");
    await initHarness(project());
    await createChange(project(), { title: "Server Topic" });
    await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('server stream')"]);
    handle = await startWorkbenchServer({ project: project(), path: tempDir }, { port: 0, staticRoot });
  });

  afterEach(async () => {
    if (handle) await new Promise<void>((resolve) => handle?.server.close(() => resolve()));
    await rm(tempDir, { recursive: true, force: true });
    await rm(staticRoot, { recursive: true, force: true });
    await rm(registryRoot, { recursive: true, force: true });
  });

  it("serves workbench JSON routes and static index", async () => {
    const snapshot = await getJson<SnapshotResponse>(`${handle!.url}/api/workbench/snapshot`);
    expect(snapshot.left.topics[0]).toMatchObject({ id: "server-topic" });

    const topics = await getJson<unknown[]>(`${handle!.url}/api/workbench/topics`);
    expect(topics).toHaveLength(1);

    const stream = await getJson<{ events: Array<{ type: string }> }>(`${handle!.url}/api/workbench/stream/${snapshot.center.agentLoop.runs[0].id}`);
    expect(stream.events.some((event: { type: string }) => event.type === "run.completed")).toBe(true);

    const page = await fetch(`${handle!.url}/`);
    expect(await page.text()).toContain("AHO");
  });

  it("returns HTTP diagnostics for unsupported API and action requests", async () => {
    const missing = await fetch(`${handle!.url}/api/not-found`);
    expect(missing.status).toBe(404);

    const unconfirmed = await fetch(`${handle!.url}/api/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: { actionId: "change.close", label: "Close", command: "change", args: ["close", "repo"], mutates: true, requiresConfirmation: true },
      }),
    });
    expect(unconfirmed.status).toBe(409);

    const unknown = await fetch(`${handle!.url}/api/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: { actionId: "unknown", label: "Unknown", command: "bad", args: [], mutates: true, requiresConfirmation: true },
        confirm: true,
      }),
    });
    expect(unknown.status).toBe(400);

    const invalidJson = await fetch(`${handle!.url}/api/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(invalidJson.status).toBe(400);
  });

  it("rejects unknown and unconfirmed actions", async () => {
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      action: { actionId: "unknown", label: "Unknown", command: "bad", args: [], mutates: true, requiresConfirmation: true },
      confirm: true,
    })).rejects.toThrow("Unknown");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      action: { actionId: "change.close", label: "Close", command: "change", args: ["close", "repo"], mutates: true, requiresConfirmation: true },
    })).rejects.toThrow("confirm");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "validate.run",
      changeId: "server-topic",
    })).rejects.toThrow("confirm");
  });

  it("serves app-level project onboarding routes", async () => {
    const store = new ProjectRegistryStore(registryRoot);
    const appHandle = await startWorkbenchServer(null, { port: 0, staticRoot, store });
    try {
      const status = await getJson<{ mode: string }>(`${appHandle.url}/api/app/status`);
      expect(status.mode).toBe("app");

      const unconfirmed = await fetch(`${appHandle.url}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: tempDir }),
      });
      expect(unconfirmed.status).toBe(409);

      const added = await fetch(`${appHandle.url}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: tempDir, name: "Server Repo", confirm: true }),
      });
      expect(added.ok).toBe(true);
      const addedBody = await added.json() as { project: { id: string } };

      const projects = await getJson<{ projects: unknown[] }>(`${appHandle.url}/api/projects`);
      expect(projects.projects).toHaveLength(1);

      const init = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/harness/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryMode: "external-local" }),
      });
      expect(init.status).toBe(409);

      const created = await fetch(`${appHandle.url}/api/projects/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath: registryRoot, name: "created-repo", git: false, readme: true, initialCommit: false, confirm: true }),
      });
      expect(created.ok).toBe(true);
      const createdBody = await created.json() as { createdPath: string };
      expect(createdBody.createdPath).toContain("created-repo");

      const dialog = await fetch(`${appHandle.url}/api/dialog/open-folder`, {
        method: "POST",
        headers: { Origin: "https://example.com" },
      });
      expect(dialog.status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => appHandle.server.close(() => resolve()));
    }
  });

  it("builds native folder dialog commands with fixed argv", () => {
    const windows = buildNativeFolderDialogCommand("win32");
    expect(windows?.command).toBe("powershell.exe");
    expect(windows?.args).toContain("-Sta");
    expect(windows?.args.join(" ")).toContain("FolderBrowserDialog");

    const mac = buildNativeFolderDialogCommand("darwin");
    expect(mac).toMatchObject({ command: "osascript" });

    const linux = buildNativeFolderDialogCommand("linux");
    expect(linux).toMatchObject({ command: "zenity" });

    expect(buildNativeFolderDialogCommand("freebsd")).toBeNull();
  });
});

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.json() as Promise<T>;
}
