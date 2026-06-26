import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
let originalCodexHome: string | undefined;
let originalAhoHome: string | undefined;

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
    originalCodexHome = process.env.CODEX_HOME;
    originalAhoHome = process.env.AHO_HOME;
    process.env.CODEX_HOME = join(tempDir, "codex-home");
    await writeFile(join(staticRoot, "index.html"), "<div>AHO</div>", "utf8");
    await initHarness(project());
    await createChange(project(), { title: "Server Topic" });
    await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('server stream')"]);
    handle = await startWorkbenchServer({ project: project(), path: tempDir }, { port: 0, staticRoot });
  });

  afterEach(async () => {
    if (handle) await new Promise<void>((resolve) => handle?.server.close(() => resolve()));
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
    if (originalAhoHome === undefined) delete process.env.AHO_HOME;
    else process.env.AHO_HOME = originalAhoHome;
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

  it("streams live endpoint errors as SSE without changing replay endpoints", async () => {
    const live = await fetch(`${handle!.url}/api/workbench/actions/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionType: "validate.run", changeId: "server-topic", confirm: true }),
    });
    expect(live.ok).toBe(true);
    expect(live.headers.get("content-type")).toContain("text/event-stream");
    const body = await live.text();
    expect(body).toContain("event: error");
    expect(body).toContain("is not supported by the live endpoint");
    expect(body).toContain("event: done");
    const errorIndex = body.indexOf("event: error");
    const snapshotIndex = body.indexOf("event: snapshot");
    const doneIndex = body.indexOf("event: done");
    expect(errorIndex).toBeGreaterThanOrEqual(0);
    expect(snapshotIndex).toBeGreaterThan(errorIndex);
    expect(doneIndex).toBeGreaterThan(snapshotIndex);

    const snapshot = await getJson<SnapshotResponse>(`${handle!.url}/api/workbench/snapshot`);
    const replay = await fetch(`${handle!.url}/api/workbench/stream/${snapshot.center.agentLoop.runs[0].id}`);
    const replayBody = await replay.json() as { live: boolean };
    expect(replayBody.live).toBe(false);
  });

  it("forwards scoped workflow targets through the live endpoint", async () => {
    const live = await fetch(`${handle!.url}/api/workbench/actions/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionType: "post-merge.prepare",
        changeId: "server-topic",
        landingPackageId: "landing-server",
        remoteLandingResultId: "remote-landing-server",
        confirm: true,
      }),
    });
    expect(live.ok).toBe(true);
    const body = await live.text();
    expect(body).toContain("event: error");
    expect(body).not.toContain("requires landingPackageId");
    expect(body).not.toContain("requires remoteLandingResultId");
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

  it("fails closed for missing demand scope and stale workflow targets", async () => {
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "validate.run",
      confirm: true,
    })).rejects.toThrow("requires changeId");

    const missingTarget = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "validate.run",
      changeId: "server-topic",
      confirm: true,
    });
    expect(JSON.stringify(missingTarget.result)).toContain("requires worktreeId");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "landing-queue.merge-next",
      changeId: "server-topic",
      landingPackageId: "forged-landing-package",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.goal-loop.controller.refresh",
      changeId: "server-topic",
      goalLoopNextStepPacketId: "forged-packet",
      goalLoopCurrentGateActionType: "planning.scheduler.plan.prepare",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.goal-loop.gate-readiness.prepare",
      changeId: "server-topic",
      goalLoopNextStepPacketId: "forged-packet",
      goalLoopControllerPolicyId: "forged-policy",
      goalLoopCurrentGateActionType: "planning.scheduler.plan.prepare",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("serves lazy Workbench projections separately from the snapshot shell", async () => {
    const snapshot = await getJson<SnapshotResponse & { center: { agentRunGraph: { nodes: unknown[] }; agentLoop: { runs: Array<{ id: string }> } } }>(`${handle!.url}/api/workbench/snapshot?topic=server-topic`);
    expect(snapshot.center.agentRunGraph.nodes).toEqual([]);

    const transcript = await getJson<{ cells: unknown[] }>(`${handle!.url}/api/workbench/projections/transcript/server-topic`);
    expect(Array.isArray(transcript.cells)).toBe(true);

    const pagedTranscript = await getJson<{ cells: unknown[]; paging?: { limit: number; totalCount: number; hasMoreBefore: boolean } }>(`${handle!.url}/api/workbench/projections/transcript/server-topic?limit=2`);
    expect(Array.isArray(pagedTranscript.cells)).toBe(true);
    expect(pagedTranscript.paging?.limit).toBe(2);
    expect(typeof pagedTranscript.paging?.totalCount).toBe("number");

    const graph = await getJson<{ nodes: Array<{ id: string }> }>(`${handle!.url}/api/workbench/projections/run-graph/server-topic`);
    expect(graph.nodes.some((node) => node.id === "main-agent")).toBe(true);
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

      const projectTopic = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/workbench/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Project scoped topic", body: "Keep route behavior", confirm: true }),
      });
      expect(projectTopic.ok).toBe(true);

      const directTopic = await fetch(`${handle!.url}/api/workbench/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Direct topic", body: "Direct route remains unsupported", confirm: true }),
      });
      expect(directTopic.status).toBe(404);

      const projects = await getJson<{ projects: Array<{ codexTrust: { trusted: boolean; projectKey: string } }> }>(`${appHandle.url}/api/projects`);
      expect(projects.projects).toHaveLength(1);
      expect(projects.projects[0].codexTrust.trusted).toBe(false);
      expect(projects.projects[0].codexTrust.projectKey).toContain("aho-server-");

      const unconfirmedTrust = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/codex/trust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(unconfirmedTrust.status).toBe(409);

      const trusted = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/codex/trust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      expect(trusted.ok).toBe(true);
      const trustedBody = await trusted.json() as { codexTrust: { trusted: boolean; projectKey: string } };
      expect(trustedBody.codexTrust.trusted).toBe(true);
      const config = await readFile(join(tempDir, "codex-home", "config.toml"), "utf8");
      expect(config).toContain(`[projects.'${trustedBody.codexTrust.projectKey}']`);
      expect(config).toContain('trust_level = "trusted"');

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

  it("restores an unregistered direct external-local project from marker and AHO_HOME", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "aho-external-src-"));
    const ahoHome = await mkdtemp(join(tmpdir(), "aho-external-home-"));
    const store = new ProjectRegistryStore(join(registryRoot, "restore-home"));
    const directProject: ManagedProject = {
      id: "external-repo",
      name: "External Repo",
      path: sourceRoot,
      addedAt: "2026-06-25T00:00:00.000Z",
      lastSeenAt: "2026-06-25T00:00:00.000Z",
    };
    process.env.AHO_HOME = ahoHome;
    await initHarness(directProject, { memoryMode: "external-local" });
    await createChange(directProject, { title: "Restored Topic" });

    const directHandle = await startWorkbenchServer({ project: null, path: sourceRoot }, { port: 0, staticRoot, store });
    try {
      const status = await getJson<{ mode: string; directProjectId: string | null }>(`${directHandle.url}/api/app/status`);
      expect(status).toMatchObject({ mode: "project", directProjectId: "external-repo" });

      const projects = await getJson<{ projects: Array<{ project: { id: string } | null; memory: { memoryMode: string; memoryAvailable: boolean; harnessReady: boolean } }> }>(`${directHandle.url}/api/projects`);
      expect(projects.projects).toHaveLength(1);
      expect(projects.projects[0]).toMatchObject({
        project: { id: "external-repo" },
        memory: { memoryMode: "external-local", memoryAvailable: true, harnessReady: true },
      });
      expect(await store.listProjects()).toHaveLength(0);

      const snapshot = await getJson<SnapshotResponse>(`${directHandle.url}/api/projects/external-repo/workbench/snapshot`);
      expect(snapshot.left.topics[0]).toMatchObject({ id: "restored-topic" });
    } finally {
      await new Promise<void>((resolve) => directHandle.server.close(() => resolve()));
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(ahoHome, { recursive: true, force: true });
    }
  });

  it("reports missing external-local memory for a restored direct project", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "aho-external-missing-src-"));
    const ahoHome = await mkdtemp(join(tmpdir(), "aho-external-missing-home-"));
    const store = new ProjectRegistryStore(join(registryRoot, "restore-missing-home"));
    process.env.AHO_HOME = ahoHome;
    await writeMarker(sourceRoot, "missing-memory-repo", "Missing Memory Repo");

    const directHandle = await startWorkbenchServer({ project: null, path: sourceRoot }, { port: 0, staticRoot, store });
    try {
      const projects = await getJson<{ projects: Array<{ project: { id: string } | null; memory: { memoryMode: string; memoryAvailable: boolean; harnessReady: boolean; roots: { memoryRoot: string } } }> }>(`${directHandle.url}/api/projects`);
      expect(projects.projects[0]).toMatchObject({
        project: { id: "missing-memory-repo" },
        memory: { memoryMode: "external-local", memoryAvailable: false, harnessReady: false },
      });
      expect(projects.projects[0].memory.roots.memoryRoot).toContain("missing-memory-repo");

      const snapshot = await getJson<{ warnings: string[]; left: { topics: unknown[] } }>(`${directHandle.url}/api/projects/missing-memory-repo/workbench/snapshot`);
      expect(snapshot.left.topics).toHaveLength(0);
      expect(snapshot.warnings).toContain("Durable memory is unavailable. AHO will not infer project history.");
    } finally {
      await new Promise<void>((resolve) => directHandle.server.close(() => resolve()));
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(ahoHome, { recursive: true, force: true });
    }
  });

  it("fails closed when direct marker id is registered to another path", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "aho-external-src-"));
    const otherRoot = await mkdtemp(join(tmpdir(), "aho-external-other-"));
    const store = new ProjectRegistryStore(join(registryRoot, "restore-conflict-home"));
    await writeMarker(sourceRoot, "external-repo", "External Repo");
    await writeMarker(otherRoot, "external-repo", "External Repo");
    await store.addProject(otherRoot);

    await expect(startWorkbenchServer({ project: null, path: sourceRoot }, { port: 0, staticRoot, store }))
      .rejects.toThrow("Project marker id is already registered for a different path");

    await rm(sourceRoot, { recursive: true, force: true });
    await rm(otherRoot, { recursive: true, force: true });
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

async function writeMarker(projectPath: string, id: string, name: string): Promise<void> {
  await mkdir(join(projectPath, ".agent-harness"), { recursive: true });
  await writeFile(join(projectPath, ".agent-harness", "project.json"), JSON.stringify({
    version: "1.0",
    id,
    name,
    managedBy: "agent-harness-orchestrator",
    memoryMode: "external-local",
    createdAt: "2026-06-25T00:00:00.000Z",
  }, null, 2), "utf8");
}
