import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("cross-spawn", () => ({ default: spawnMock }));

import { getActiveCodexAppServerTurn, runCodexAppServerChildClose, runCodexAppServerChildTurn, runCodexAppServerTurn } from "../../src/codex/app-server.js";
import { CodexAppServerHost, CodexAppServerHostRegistry, defaultCodexAppServerHostRegistry } from "../../src/codex/app-server-host.js";
import { listCodexRuntimeModels } from "../../src/codex/model-settings.js";
import { defaultProjectRemovalFence } from "../../src/project-runtime/removal.js";
import { runCodexTurn } from "../../src/provider-runtime/codex-adapter.js";

const tempDirs: string[] = [];

beforeEach(() => spawnMock.mockReset());
afterEach(async () => {
  defaultCodexAppServerHostRegistry.disposeAll("persistent Host test cleanup");
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Codex persistent app-server Host", () => {
  it("maps managed images and files to private LocalImage and Mention inputs", async () => {
    const cwd = await tempDir();
    const managedFile = join(cwd, "managed", "marker.txt");
    const server = new PersistentCollaborationServer(4051, false, managedFile);
    spawnMock.mockReturnValue(server as unknown as ChildProcess);
    const options = await turnOptions(cwd, "attachment-run", null);
    const realtimeEvents: string[] = [];
    const alternateManagedPath = managedFile.replace(/\\/g, "/").toUpperCase();

    await runCodexAppServerTurn({
      ...options,
      imageInputs: [{ path: join(cwd, "managed", "pixel.png"), fileName: "pixel.png" }],
      fileInputs: [{ name: "marker.txt", path: managedFile }],
      onRealtimeEvent: (event) => realtimeEvents.push(JSON.stringify(event)),
    });

    expect(server.turnInputs[0]).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "mention", name: "marker.txt", path: join(cwd, "managed", "marker.txt") },
      { type: "localImage", path: join(cwd, "managed", "pixel.png") },
    ]);
    const events = await readFile(options.paths.events, "utf8");
    expect(events).not.toContain(join(cwd, "managed"));
    expect(events).not.toContain(alternateManagedPath);
    expect(events).not.toContain("AHO_ATTACHMENT_PRIVATE_TEXT");
    expect(events).not.toContain("storagePath");
    expect(realtimeEvents.join("\n")).not.toContain(join(cwd, "managed"));
    expect(realtimeEvents.join("\n")).not.toContain(alternateManagedPath);
    expect(realtimeEvents.join("\n")).not.toContain("AHO_ATTACHMENT_PRIVATE_TEXT");
    expect(realtimeEvents.join("\n")).not.toContain("storagePath");
    expect(realtimeEvents.join("\n")).toContain("[managed-attachment]");
  });

  it("initializes one process and continues the exact native Child on the same generation", async () => {
    const cwd = await tempDir();
    const server = new PersistentCollaborationServer(4101, true);
    spawnMock.mockReturnValue(server as unknown as ChildProcess);
    let resolveInitialChild!: () => void;
    const initialChild = new Promise<void>((resolve) => { resolveInitialChild = resolve; });
    const mainEvents: string[] = [];
    let mainText = "";
    const firstPromise = runCodexAppServerTurn({
      ...await turnOptions(cwd, "main-run", null),
      onRealtimeEvent: (event) => mainEvents.push(`${event.threadId}:${event.turnId}`),
      onTextDelta: (text) => { mainText += text; },
      onChildThreadResult: (child) => { if (child.threadId === "thread-hume" && child.finalText) resolveInitialChild(); },
    });
    await initialChild;
    const mainEventCountBeforeFollowup = mainEvents.length;
    const mainTextBeforeFollowup = mainText;
    expect(defaultCodexAppServerHostRegistry.snapshots()).toEqual([
      expect.objectContaining({ state: "busy", generation: 1, pid: 4101 }),
    ]);

    const childEvents: string[] = [];
    const second = await runCodexAppServerChildTurn({
      ...await turnOptions(cwd, "feedback-run", "thread-main"),
      parentThreadId: "thread-main",
      targetThreadId: "thread-hume",
      targetDisplayName: "Hume",
      prompt: "Read line three.",
      onRealtimeEvent: (event) => childEvents.push(event.threadId),
    });

    expect(second.status).toBe("completed");
    expect(second.host).toEqual(expect.objectContaining({ generation: 1, pid: 4101 }));
    expect(second.childThreads).toEqual(expect.arrayContaining([
      expect.objectContaining({ threadId: "thread-hume", finalText: "Follow-up complete." }),
    ]));
    expect(new Set(childEvents)).toContain("thread-hume");
    expect(mainEvents).toHaveLength(mainEventCountBeforeFollowup + 1);
    expect(mainText).toBe(mainTextBeforeFollowup);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(server.methods.filter((method) => method === "initialize")).toHaveLength(1);
    expect(server.followupPrompts).toEqual([expect.stringContaining("Read line three.")]);
    const first = await firstPromise;
    expect(first.status).toBe("completed");
    expect(first.host).toEqual(second.host);
    const activeClose = await runCodexAppServerChildClose({
      ...await turnOptions(cwd, "active-close-run", "thread-main"),
      parentThreadId: "thread-main",
      targetThreadId: "thread-hume",
      targetDisplayName: "Hume",
    });
    expect(activeClose.status).toBe("completed");
    expect(activeClose.host).toEqual(second.host);
  });

  it("continues the exact native Child after the parent Turn is already idle", async () => {
    const cwd = await tempDir();
    const server = new PersistentCollaborationServer(4151);
    spawnMock.mockReturnValue(server as unknown as ChildProcess);

    const first = await runCodexAppServerTurn(await turnOptions(cwd, "idle-main-run", null));
    expect(first.status).toBe("completed");

    const followup = await runCodexAppServerChildTurn({
      ...await turnOptions(cwd, "idle-feedback-run", "thread-main"),
      parentThreadId: "thread-main",
      targetThreadId: "thread-hume",
      targetDisplayName: "Hume",
      prompt: "Continue after Main is idle.",
    });

    expect(followup.error).toBeUndefined();
    expect(followup.status).toBe("completed");
    expect(followup.host).toEqual(first.host);
    expect(followup.childThreads).toEqual(expect.arrayContaining([
      expect.objectContaining({ threadId: "thread-hume", finalText: "Follow-up complete." }),
    ]));
    expect(JSON.parse(await readFile(join(cwd, "idle-feedback-run", "session.json"), "utf8"))).toEqual(
      expect.objectContaining({ host: expect.objectContaining({ generation: 1, pid: 4151 }) }),
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(server.methods.filter((method) => method === "initialize")).toHaveLength(1);
  });

  it("rejects concurrent leases and invalidates Child bindings after a crashed generation", async () => {
    const cwd = await tempDir();
    const firstServer = new PersistentCollaborationServer(4201);
    const secondServer = new PersistentCollaborationServer(4202);
    spawnMock.mockReturnValueOnce(firstServer as unknown as ChildProcess).mockReturnValueOnce(secondServer as unknown as ChildProcess);
    const host = new CodexAppServerHost(cwd);
    const exits: string[] = [];
    const auxiliaryExits: string[] = [];
    const lease = await host.acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: (error) => exits.push(error.message) });
    lease.bindChild("thread-main", "thread-hume");
    lease.bindChild("thread-main", "thread-darwin");
    lease.setActiveTurn("thread-main", "turn-main-active");
    host.acquireActiveChildControl("thread-main", "thread-hume", { onLine: () => undefined, onStderr: () => undefined, onExit: (error) => auxiliaryExits.push(error.message) });
    expect(() => host.acquireActiveChildControl("thread-main", "thread-darwin", { onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined }))
      .toThrow("already controlling a Child Agent");
    await expect(host.acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined }))
      .rejects.toThrow("already executing a Turn");
    firstServer.crash();
    await vi.waitFor(() => expect(exits).toEqual([expect.stringContaining("exited with 17")]));
    expect(auxiliaryExits).toEqual([expect.stringContaining("exited with 17")]);

    const restarted = await host.acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined });
    expect(restarted.generation).toBe(2);
    expect(restarted.pid).toBe(4202);
    expect(() => restarted.assertChild("thread-main", "thread-hume")).toThrow("not available");
    restarted.release();
    host.dispose("test cleanup");
  });

  it("closes the exact native Child and rejects later continuation without another process", async () => {
    const cwd = await tempDir();
    const server = new PersistentCollaborationServer(4301);
    spawnMock.mockReturnValue(server as unknown as ChildProcess);
    expect((await runCodexAppServerTurn(await turnOptions(cwd, "main-run", null))).status).toBe("completed");

    const closed = await runCodexAppServerChildClose({
      ...await turnOptions(cwd, "close-run", "thread-main"),
      parentThreadId: "thread-main",
      targetThreadId: "thread-hume",
      targetDisplayName: "Hume",
    });
    expect(closed.status).toBe("completed");
    expect(closed.host).toEqual(expect.objectContaining({ generation: 1, pid: 4301 }));
    expect(defaultCodexAppServerHostRegistry.snapshots()[0]).toMatchObject({ childBindingCount: 0 });

    const lifecycleKinds: string[] = [];
    const repeated = await runCodexAppServerChildClose({
      ...await turnOptions(cwd, "close-repeat-run", "thread-main"),
      parentThreadId: "thread-main",
      targetThreadId: "thread-hume",
      targetDisplayName: "Hume",
      onChildLifecycleEvent: (event) => lifecycleKinds.push(event.kind),
    });
    expect(repeated.status).toBe("completed");
    expect(repeated.host).toEqual(closed.host);
    expect(lifecycleKinds).toEqual(["closed"]);

    const conflictingParent = await runCodexAppServerChildClose({
      ...await turnOptions(cwd, "close-conflict-run", "thread-other-parent"),
      parentThreadId: "thread-other-parent",
      targetThreadId: "thread-hume",
      targetDisplayName: "Hume",
    });
    expect(conflictingParent.status).toBe("failed");
    expect(conflictingParent.error).toContain("conflicting parent lineage");

    const rejected = await runCodexAppServerChildTurn({
      ...await turnOptions(cwd, "rejected-run", "thread-main"),
      parentThreadId: "thread-main",
      targetThreadId: "thread-hume",
      prompt: "This must not run.",
    });
    expect(rejected.status).toBe("failed");
    expect(rejected.error).toContain("not available");
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(server.closePrompts).toHaveLength(1);
  });

  it("isolates different project directories in independent Host generations", async () => {
    const firstCwd = await tempDir();
    const secondCwd = await tempDir();
    const firstServer = new PersistentCollaborationServer(4401);
    const secondServer = new PersistentCollaborationServer(4402);
    spawnMock.mockReturnValueOnce(firstServer as unknown as ChildProcess).mockReturnValueOnce(secondServer as unknown as ChildProcess);
    const registry = new CodexAppServerHostRegistry();
    const [first, second] = await Promise.all([
      registry.hostFor(firstCwd).acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined }),
      registry.hostFor(secondCwd).acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined }),
    ]);
    expect(first).toMatchObject({ generation: 1, pid: 4401 });
    expect(second).toMatchObject({ generation: 1, pid: 4402 });
    expect(first.hostId).not.toBe(second.hostId);
    first.release();
    second.release();
    registry.disposeAll("test cleanup");
  });

  it("stops and drains every canonical and worktree Host owned by one project", async () => {
    const canonicalCwd = await tempDir();
    const firstWorktree = await tempDir();
    const otherProjectCwd = await tempDir();
    const canonicalServer = new PersistentCollaborationServer(4451);
    const worktreeServer = new PersistentCollaborationServer(4452);
    const otherServer = new PersistentCollaborationServer(4453);
    spawnMock
      .mockReturnValueOnce(canonicalServer as unknown as ChildProcess)
      .mockReturnValueOnce(worktreeServer as unknown as ChildProcess)
      .mockReturnValueOnce(otherServer as unknown as ChildProcess);
    const registry = new CodexAppServerHostRegistry();
    const canonicalLease = await registry.hostForProject("project-one", canonicalCwd)
      .acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined });
    const worktreeLease = await registry.hostForProject("project-one", firstWorktree)
      .acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined });
    const otherLease = await registry.hostForProject("project-two", otherProjectCwd)
      .acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined });

    let drained = false;
    const shutdown = registry.disposeProject("project-one", "project removed").then(() => { drained = true; });
    await Promise.resolve();
    expect(canonicalServer.killCount).toBe(1);
    expect(worktreeServer.killCount).toBe(1);
    expect(otherServer.killCount).toBe(0);
    expect(drained).toBe(false);

    canonicalLease.release();
    expect(drained).toBe(false);
    worktreeLease.release();
    await shutdown;
    expect(drained).toBe(true);
    expect(registry.snapshots()).toEqual([expect.objectContaining({ cwd: otherProjectCwd })]);

    otherLease.release();
    registry.disposeAll("test cleanup");
  });

  it("runs model discovery without taking or disposing the active Turn lease", async () => {
    const cwd = await tempDir();
    const server = new PersistentCollaborationServer(4501);
    spawnMock.mockReturnValue(server as unknown as ChildProcess);
    const host = defaultCodexAppServerHostRegistry.hostFor(cwd);
    const lease = await host.acquire({ onLine: () => undefined, onStderr: () => undefined, onExit: () => undefined });

    await expect(listCodexRuntimeModels(cwd)).resolves.toMatchObject({ available: true, degraded: false });
    expect(host.snapshot()).toMatchObject({ state: "busy", generation: 1, pid: 4501 });
    expect(server.killCount).toBe(0);
    lease.release();
  });

  it("drops provider callbacks from a generation invalidated by project removal", async () => {
    const cwd = await tempDir();
    const server = new PersistentCollaborationServer(4551, true);
    spawnMock.mockReturnValue(server as unknown as ChildProcess);
    const realtimeEvents: string[] = [];
    const base = await turnOptions(cwd, "generation-guard-run", null);
    const turn = runCodexTurn({
      ...base,
      providerId: "codex",
      operationProfile: "main",
      attemptId: "attempt-generation-guard",
      onRealtimeEvent: (event) => realtimeEvents.push(`${event.threadId}:${event.turnId}`),
    });
    await vi.waitFor(() => expect(realtimeEvents.length).toBeGreaterThan(0));
    const eventCountBeforeRemoval = realtimeEvents.length;

    const removalGeneration = defaultProjectRemovalFence.beginRemoval(base.projectId);
    try {
      server.completeParent();
      await expect(turn).resolves.toMatchObject({ status: "completed" });
      expect(realtimeEvents).toHaveLength(eventCountBeforeRemoval);
    } finally {
      defaultProjectRemovalFence.completeRemoval(base.projectId, removalGeneration);
      defaultProjectRemovalFence.activateAfterRegistration(base.projectId);
    }
  });

  it("publishes one started identity and sends an exact turn interrupt wire request", async () => {
    const cwd = await tempDir();
    const server = new PersistentCollaborationServer(4561, true);
    spawnMock.mockReturnValue(server as unknown as ChildProcess);
    const options = await turnOptions(cwd, "interrupt-wire-run", null);
    const started: Array<{ threadId: string; turnId: string }> = [];
    const turn = runCodexAppServerTurn({
      ...options,
      onTurnStarted: (identity) => started.push(identity),
    });
    await vi.waitFor(() => expect(started).toEqual([{ threadId: "thread-main", turnId: "turn-main-1" }]));
    const active = getActiveCodexAppServerTurn(options.runtimeScopeId);
    expect(active).not.toBeNull();

    await active!.interrupt("user stop");
    await expect(turn).resolves.toMatchObject({ status: "interrupted", threadId: "thread-main", turnId: "turn-main-1" });
    expect(server.interruptParams).toEqual([{ threadId: "thread-main", turnId: "turn-main-1" }]);
    expect(started).toHaveLength(1);
  });
});

async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "aho-codex-host-"));
  tempDirs.push(path);
  return path;
}

async function turnOptions(cwd: string, runId: string, existingThreadId: string | null) {
  const runDir = join(cwd, runId);
  return {
    projectId: "project-host",
    conversationId: "conversation-host",
    runtimeScopeId: `${runId}:scope`,
    roleId: "main-agent",
    runId,
    cwd,
    prompt: "Create Hume once.",
    sandboxPolicy: "read-only" as const,
    paths: {
      events: join(runDir, "events.jsonl"),
      stderr: join(runDir, "stderr.log"),
      lastMessage: join(runDir, "last-message.md"),
      session: join(runDir, "session.json"),
    },
    existingThreadId,
    timeoutMs: 10_000,
  };
}

class PersistentCollaborationServer extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin: Writable;
  readonly methods: string[] = [];
  readonly followupPrompts: string[] = [];
  readonly closePrompts: string[] = [];
  readonly turnInputs: unknown[][] = [];
  readonly interruptParams: Array<{ threadId: string; turnId: string }> = [];
  readonly pid: number;
  killCount = 0;
  private input = "";
  private turnCount = 0;

  constructor(
    pid: number,
    private readonly holdFirstParent = false,
    private readonly managedPathLeak?: string,
  ) {
    super();
    this.pid = pid;
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        this.input += chunk.toString();
        this.drain();
        callback();
      },
    });
  }

  kill(): boolean {
    this.killCount += 1;
    this.stdout.end();
    this.stderr.end();
    return true;
  }

  crash(): void {
    this.emit("close", 17);
  }

  completeParent(): void {
    this.notify("turn/completed", { threadId: "thread-main", turn: { id: "turn-main-1", status: "completed" } });
  }

  private drain(): void {
    for (;;) {
      const newline = this.input.indexOf("\n");
      if (newline < 0) return;
      const line = this.input.slice(0, newline).trim();
      this.input = this.input.slice(newline + 1);
      if (line) this.handle(JSON.parse(line) as Record<string, unknown>);
    }
  }

  private handle(message: Record<string, unknown>): void {
    if (typeof message.method !== "string" || typeof message.id !== "number") return;
    const id = message.id;
    const params = (message.params ?? {}) as Record<string, unknown>;
    this.methods.push(message.method);
    switch (message.method) {
      case "initialize":
        this.respond(id, {});
        return;
      case "model/list":
        this.respond(id, { data: [{ id: "gpt-test", displayName: "GPT Test" }] });
        return;
      case "thread/start":
      case "thread/resume":
        this.respond(id, { thread: { id: "thread-main" } });
        return;
      case "turn/start": {
        this.turnCount += 1;
        const turnId = `turn-main-${this.turnCount}`;
        const turnInput = Array.isArray(params.input) ? params.input : [];
        this.turnInputs.push(turnInput);
        const prompt = JSON.stringify(turnInput);
        this.respond(id, { turn: { id: turnId } });
        this.notify("turn/started", { threadId: "thread-main", turn: { id: turnId } });
        if (this.managedPathLeak) {
          const alternateManagedPath = this.managedPathLeak.replace(/\\/g, "/").toUpperCase();
          this.notify("item/completed", {
            threadId: "thread-main",
            turnId,
            item: {
              id: "managed-path-command",
              type: "commandExecution",
              command: `Get-Content ${alternateManagedPath}`,
              cwd: dirname(this.managedPathLeak).replace(/\\/g, "/").toUpperCase(),
              aggregatedOutput: `storagePath=${alternateManagedPath}\nAHO_ATTACHMENT_PRIVATE_TEXT`,
              raw: { error: `failed to read ${alternateManagedPath}` },
              exitCode: 0,
            },
          });
        }
        if (this.turnCount === 1) {
          this.notify("item/completed", {
            threadId: "thread-main",
            turnId,
            item: { id: "spawn-hume", type: "subAgentActivity", kind: "started", agentThreadId: "thread-hume", agentPath: "/root/hume" },
          });
        } else {
          this.followupPrompts.push(prompt);
          this.notify("item/completed", {
            threadId: "thread-main",
            turnId,
            item: { id: `interacted-${this.turnCount}`, type: "subAgentActivity", kind: "interacted", agentThreadId: "thread-hume", agentPath: "/root/hume" },
          });
        }
        this.notify("turn/completed", { threadId: "thread-hume", turn: { id: `turn-hume-${this.turnCount}`, status: "completed" } });
        if (!this.holdFirstParent || this.turnCount > 1) {
          this.notify("turn/completed", { threadId: "thread-main", turn: { id: turnId, status: "completed" } });
        }
        return;
      }
      case "turn/steer": {
        const prompt = JSON.stringify(params.input ?? []);
        this.respond(id, {});
        this.followupPrompts.push(prompt);
        this.notify("item/completed", {
          threadId: "thread-main",
          turnId: "turn-main-1",
          item: { id: "interacted-other", type: "subAgentActivity", kind: "interacted", agentThreadId: "thread-other", agentPath: "/root/other" },
        });
        this.notify("item/completed", {
          threadId: "thread-main",
          turnId: "turn-main-1",
          item: { id: "interacted-hume", type: "subAgentActivity", kind: "interacted", agentThreadId: "thread-hume", agentPath: "/root/hume" },
        });
        this.notify("turn/completed", { threadId: "thread-hume", turn: { id: "turn-hume-followup", status: "completed" } });
        this.notify("item/completed", {
          threadId: "thread-main",
          turnId: "turn-main-1",
          item: { id: "parent-marker", type: "agentMessage", text: "AHO_CHILD_FOLLOWUP_COMPLETE", phase: "final_answer" },
        });
        this.notify("turn/completed", { threadId: "thread-main", turn: { id: "turn-main-1", status: "completed" } });
        return;
      }
      case "turn/interrupt":
        this.interruptParams.push({ threadId: String(params.threadId), turnId: String(params.turnId) });
        this.respond(id, {});
        this.notify("turn/completed", { threadId: String(params.threadId), turn: { id: String(params.turnId), status: "interrupted" } });
        return;
      case "thread/archive":
        this.closePrompts.push(JSON.stringify(params));
        this.respond(id, {});
        this.notify("thread/archived", { threadId: String(params.threadId) });
        return;
      case "thread/read":
        this.respond(id, { thread: {
          id: "thread-hume",
          agentNickname: "Hume",
          turns: [
            { id: "turn-delegation", items: [{ id: "input-hume", type: "userMessage", content: [{ type: "input_text", text: "Initial task." }] }] },
            { id: this.followupPrompts.length ? "turn-hume-followup" : `turn-hume-${this.turnCount}`, items: [{ id: `output-hume-${this.turnCount}`, type: "agentMessage", content: [{ type: "output_text", text: this.followupPrompts.length ? "Follow-up complete." : "Initial Hume response." }] }] },
          ],
        } });
        return;
      default:
        throw new Error(`Unexpected Host test method: ${message.method}`);
    }
  }

  private respond(id: number, result: Record<string, unknown>): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ id, result })}\n`));
  }

  private notify(method: string, params: Record<string, unknown>): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ method, params })}\n`));
  }
}
