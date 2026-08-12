import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderRegistry,
  type ProviderCapabilityKey,
  type ProviderCapabilitySnapshot,
  type ProviderDescriptor,
  type ProviderTurnResult,
} from "../../src/provider-runtime/index.js";
import { PROVIDER_OPERATION_CAPABILITIES } from "../../src/provider-runtime/types.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { startWorkbenchServer, type WorkbenchServerHandle } from "../../src/server/workbench-server.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createWorkbenchConversation } from "../../src/workbench/conversation-service.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";

const now = "2026-08-13T00:00:00.000Z";
let root: string;
let staticRoot: string;
let previousAhoHome: string | undefined;
let handle: WorkbenchServerHandle | null;

function project(): ManagedProject {
  return { id: "native-child-live", name: "Native Child Live", path: root, addedAt: now, lastSeenAt: now };
}

function parseSseEvents(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  return body.split(/\r?\n\r?\n/).flatMap((block) => {
    const lines = block.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
    const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
    return event && data ? [{ event, data: JSON.parse(data) as Record<string, unknown> }] : [];
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-native-child-live-"));
  staticRoot = await mkdtemp(join(tmpdir(), "aho-native-child-live-web-"));
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, "aho-home");
  await writeFile(join(staticRoot, "index.html"), "<div>AHO</div>", "utf8");
  await createReadyProjectHarnessFixture({
    projectRoot: root,
    ahoHome: process.env.AHO_HOME,
    projectId: project().id,
    projectName: project().name,
  });
});

afterEach(async () => {
  if (handle) await handle.close();
  handle = null;
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  await rm(staticRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("native child live Workbench route", () => {
  it("routes an Agent child follow-up through HTTP/SSE and rejects wrong mode or missing lineage", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Create durable Agent history.",
      productMode: "agent",
      clientRequestId: "native-child-live-route",
    }, undefined, { runMainAgent: false });
    const runtimePaths = resolveProjectRuntimePaths(project().id, process.env.AHO_HOME!);
    const store = await openProjectRuntimeWorkbenchDatabase(runtimePaths);
    try {
      const graphScopeId = store.conversations.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId;
      if (!graphScopeId) throw new Error("Agent Conversation fixture has no current graph scope.");
      seedAttempt(store, conversation.conversationId, graphScopeId, "main-attempt", "main-agent", null, "main-thread");
      seedAttempt(store, conversation.conversationId, graphScopeId, "child-attempt", "native-child-agent", "main-agent", "child-thread");
      store.providerAttempts.bindProviderAttemptThread(project().id, {
        attemptId: "main-attempt", threadId: "main-thread", parentThreadId: null, parentAgentSurfaceId: null, runId: "main-run",
      }, now);
      store.providerAttempts.bindProviderAttemptThread(project().id, {
        attemptId: "child-attempt", threadId: "child-thread", parentThreadId: "main-thread", parentAgentSurfaceId: "main-agent", runId: "child-run",
      }, now);
      store.providerAttempts.completeProviderAttempt(project().id, "main-attempt", "completed", "main-thread", now);
      store.providerAttempts.completeProviderAttempt(project().id, "child-attempt", "completed", "child-thread", now);
    } finally {
      store.close();
    }

    const continued = vi.fn();
    const registry = new ProviderRegistry();
    registry.register(fakeProvider(continued));
    handle = await startWorkbenchServer({ project: project(), path: root }, { port: 0, staticRoot, providerRegistry: registry });
    const url = `${handle.url}/api/projects/${project().id}/workbench/topics/${conversation.conversationId}/messages/live`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Continue the exact child.",
        productMode: "agent",
        agentSurfaceId: "agent:codex:thread:child-thread",
      }),
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSseEvents(await response.text());
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "snapshot", data: expect.objectContaining({ productMode: "agent" }) }),
      expect.objectContaining({ event: "done", data: expect.objectContaining({ projectId: project().id, productMode: "agent", conversationId: conversation.conversationId, status: "completed" }) }),
    ]));
    expect(events.some((event) => event.event === "error")).toBe(false);
    expect(continued).toHaveBeenCalledTimes(1);
    expect(continued).toHaveBeenCalledWith(expect.objectContaining({
      projectId: project().id,
      conversationId: conversation.conversationId,
      targetSession: { providerId: "codex", sessionId: "child-thread" },
      parentSession: { providerId: "codex", sessionId: "main-thread" },
    }));

    const persisted = await openProjectRuntimeWorkbenchDatabase(runtimePaths);
    try {
      const messages = persisted.timeline.listConversationMessages(project().id, conversation.conversationId);
      expect(messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: "Continue the exact child.", agentSurfaceId: "agent:codex:thread:child-thread" }),
        expect.objectContaining({ text: "Follow-up complete.", agentSurfaceId: "agent:codex:thread:child-thread" }),
      ]));
      expect(persisted.providerAttempts.listProviderAttempts(project().id, conversation.conversationId).at(-1))
        .toMatchObject({ roleId: "native-child-agent", productMode: "agent", status: "completed", nativeSessionId: "child-thread" });
    } finally {
      persisted.close();
    }

    for (const body of [
      { message: "Wrong mode.", productMode: "harness", agentSurfaceId: "agent:codex:thread:child-thread" },
      { message: "Missing lineage.", productMode: "agent", agentSurfaceId: "agent:codex:thread:missing" },
    ]) {
      const rejected = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const rejectedEvents = parseSseEvents(await rejected.text());
      expect(rejectedEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: "error" }),
        expect.objectContaining({ event: "done", data: expect.objectContaining({ status: "failed", productMode: body.productMode }) }),
      ]));
    }
    expect(continued).toHaveBeenCalledTimes(1);
  });
});

function seedAttempt(
  store: Awaited<ReturnType<typeof openProjectRuntimeWorkbenchDatabase>>,
  conversationId: string,
  graphScopeId: string,
  attemptId: string,
  roleId: "main-agent" | "native-child-agent",
  parentAgentSurfaceId: string | null,
  nativeSessionId: string,
): void {
  store.providerAttempts.createProviderAttempt({
    projectId: project().id,
    conversationId,
    attemptId,
    productMode: "agent",
    graphScopeId,
    changeId: null,
    agentTaskId: null,
    roleId,
    parentAgentSurfaceId,
    operationProfile: "agent",
    providerId: "codex",
    nativeSessionId,
    model: null,
    capabilitySnapshot: capabilitySnapshot(),
    effectiveSkillInputs: [],
    handoffHash: `handoff-${attemptId}`,
    deliveredThroughCompletedTurn: 0,
    worktreeId: null,
    status: "running",
    createdAt: now,
    updatedAt: now,
  });
}

function fakeProvider(continued: ReturnType<typeof vi.fn>): ProviderDescriptor {
  const result = (sessionId: string): ProviderTurnResult => ({
    providerId: "codex",
    status: "completed",
    session: { providerId: "codex", sessionId },
    turnId: "follow-up-turn",
    lastMessage: "Follow-up complete.",
    childThreads: [],
    changedFiles: [],
  });
  return {
    id: "codex",
    displayName: "Codex",
    runtime: { shutdown: async () => undefined, shutdownProject: async () => undefined },
    capabilitySnapshot: async () => capabilitySnapshot(),
    runtimeSummary: async () => ({ providerId: "codex", productMode: "agent", harnessExecutionModes: ["stepwise"], snapshot: capabilitySnapshot() }),
    models: {
      read: async () => ({ providerId: "codex", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
      select: async () => ({ providerId: "codex", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
    },
    diagnostics: async () => ({
      providerId: "codex", displayName: "Codex", installation: { available: true, version: "test" }, adapter: { id: "test", version: "1" },
      capabilities: capabilitySnapshot(), models: { providerId: "codex", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true },
      sessionHealth: "ready", lastError: null, rawEvidenceRefs: [], projectActions: [],
    }),
    projectActions: { list: async () => [], execute: async () => { throw new Error("not supported"); } },
    skills: { list: async ({ projectPath }) => ({ providerId: "codex", projectPath, skills: [], errors: [] }), setEnabled: async ({ enabled }) => ({ effectiveEnabled: enabled }) },
    conversation: {
      runTurn: async (request) => result(request.existingSession?.sessionId ?? "main-thread"),
      inspectChild: async () => "available",
      continueChild: async (request) => { continued(request); return result(request.targetSession.sessionId); },
      closeChild: async (request) => result(request.targetSession.sessionId),
      getActiveTurn: () => null,
      listActiveTurns: () => [],
    },
    leafExecution: { runTurn: async () => result("leaf") },
  };
}

function capabilitySnapshot(): ProviderCapabilitySnapshot {
  const keys = new Set<ProviderCapabilityKey>(Object.values(PROVIDER_OPERATION_CAPABILITIES).flat());
  return {
    providerId: "codex", displayName: "Codex", productMode: "agent", status: "ready", runnable: true, checkedAt: now,
    snapshotHash: "native-child-live", snapshotVersion: 1, effectiveModel: null, effectiveModelSource: "provider-default", degradedReasons: [],
    capabilities: [...keys].map((key) => ({ key, label: key, spec: "supported", runtime: "ready", summary: "ready" })),
  };
}
