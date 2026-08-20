import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderCapabilitySnapshot } from "../../src/provider-runtime/index.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ManagedProject } from "../../src/types/index.js";
import { toCanonicalTimelineMessage } from "../../src/workbench/canonical-timeline-message.js";
import { projectCanonicalTimelineEnvelope } from "../../src/workbench/canonical-timeline-projector.js";
import type {
  ConversationTurnAdmission,
  ConversationTurnRequest,
  ConversationTurnRoutingPort,
} from "../../src/workbench/conversation-turn-contract.js";
import {
  ConversationTurnRetryOwner,
  type ConversationTurnRetryRequest,
} from "../../src/workbench/conversation-turn-retry.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { buildThreadStream } from "../../src/workbench/projections/read-model/thread-stream.js";

let root: string;
let paths: ProjectRuntimePaths;
let project: ManagedProject;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-turn-retry-"));
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  project = {
    id: "retry-project",
    name: "Retry Project",
    path: projectRoot,
    addedAt: "2026-08-20T00:00:00.000Z",
    lastSeenAt: "2026-08-20T00:00:00.000Z",
    defaultProviderId: "codex",
  };
  paths = resolveProjectRuntimePaths(project.id, join(root, "aho-home"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("ConversationTurnRetryOwner", () => {
  it("keeps the durable Retry claim out of the visible thread while projecting the failed target", async () => {
    const retryTarget = {
      failedAttemptId: "attempt-failed",
      sourceMessageId: "user-source",
      rootSourceMessageId: "user-source",
      providerId: "codex" as const,
      agentTurnMode: "default" as const,
    };
    const items = await buildThreadStream(paths, {
      id: "conversation-1",
      productMode: "agent",
      agentTurnMode: "default",
      kind: "conversation",
      name: "Retry",
      title: "Retry",
      state: "active",
      path: project.path,
    }, [], [], [], [], { includeChangeState: false, messages: [
      {
        id: "assistant-failed", type: "assistant.message", timestamp: "2026-08-20T00:00:00.000Z",
        conversationId: "conversation-1", changeId: "", text: "failed", status: "failed", retryTarget,
      },
      {
        id: "retry-claim", type: "assistant.message", timestamp: "2026-08-20T00:00:01.000Z",
        conversationId: "conversation-1", changeId: "", status: "retry-requested",
      },
    ] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "assistant-failed", retryTarget });
  });

  it("creates one new Plan Attempt over the canonical source and replays the durable request without another admission", async () => {
    const fixture = await failedTurnFixture("plan");
    const router = retryRouter();
    const owner = new ConversationTurnRetryOwner(router.port);
    const request = retryRequest(fixture);

    const prepared = await owner.prepare(project, request);
    expect(prepared).toMatchObject({
      replayed: false,
      target: {
        failedAttemptId: fixture.failedAttemptId,
        rootSourceMessageId: fixture.sourceMessageId,
        providerId: "codex",
        agentTurnMode: "plan",
      },
    });
    expect(router.admit).toHaveBeenCalledOnce();

    await expect(owner.execute(prepared)).resolves.toMatchObject({ status: "completed" });
    expect(router.route).toHaveBeenCalledOnce();
    const routed = router.route.mock.calls[0]![0] as ConversationTurnRequest;
    expect(routed.committedMessage.id).toBe(fixture.sourceMessageId);
    expect(routed.actualAgentTurnMode).toBe("plan");
    expect(routed.retryLineage).toMatchObject({ failedAttemptId: fixture.failedAttemptId });

    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(database.providerAttempts.readProviderAttempt(project.id, fixture.failedAttemptId)?.status).toBe("failed");
      expect(database.providerAttempts.readProviderAttempt(project.id, prepared.executionIdentity.attemptId)).toMatchObject({
        attemptId: prepared.executionIdentity.attemptId,
        status: "running",
        agentTurnMode: "plan",
      });
      const claim = database.timeline.readMessage(project.id, fixture.conversationId, prepared.markerId)!;
      expect(projectCanonicalTimelineEnvelope(claim, "agent").cells).toEqual([]);
    } finally {
      database.close();
    }

    const replay = await owner.prepare(project, request);
    expect(replay.replayed).toBe(true);
    await expect(owner.execute(replay)).resolves.toMatchObject({
      status: "replayed",
      attemptId: prepared.executionIdentity.attemptId,
    });
    expect(router.admit).toHaveBeenCalledOnce();
    expect(router.route).toHaveBeenCalledOnce();
  });

  it("fails stale source, Provider, latest Attempt, and Harness identities before Router admission", async () => {
    const fixture = await failedTurnFixture("default");
    const router = retryRouter();
    const owner = new ConversationTurnRetryOwner(router.port);

    await expect(owner.prepare(project, { ...retryRequest(fixture), sourceMessageId: "user:stale" }))
      .rejects.toMatchObject({ name: "Conflict" });
    await expect(owner.prepare(project, { ...retryRequest(fixture), providerId: "other" }))
      .rejects.toMatchObject({ name: "Conflict" });
    const mismatchedProvider = await failedTurnFixture("default", { attemptProviderId: "other" });
    await expect(owner.prepare(project, retryRequest(mismatchedProvider)))
      .rejects.toMatchObject({ name: "Conflict" });
    await expect(owner.prepare(project, { ...retryRequest(fixture), expectedAttemptId: "attempt:stale" }))
      .rejects.toMatchObject({ name: "Conflict" });
    await expect(owner.prepare(project, {
      ...retryRequest(fixture),
      productMode: "harness",
    } as unknown as ConversationTurnRetryRequest)).rejects.toMatchObject({ name: "Conflict" });
    expect(router.admit).not.toHaveBeenCalled();
    expect(router.route).not.toHaveBeenCalled();
  });

  it("accepts a failed attachment-or-reference-only source instead of requiring prompt text", async () => {
    await writeFile(join(project.path, "retry-context.txt"), "context", "utf8");
    const fixture = await failedTurnFixture("default", {
      text: "",
      contextRefs: [{ relativePath: "retry-context.txt", name: "retry-context.txt", kind: "file", source: "composer" }],
    });
    const router = retryRouter();
    const owner = new ConversationTurnRetryOwner(router.port);

    await expect(owner.prepare(project, retryRequest(fixture))).resolves.toMatchObject({ replayed: false });
    expect(router.admit).toHaveBeenCalledOnce();
  });

  it("rejects a different client request while the same failed Turn Retry is in progress", async () => {
    const fixture = await failedTurnFixture("default");
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const router = retryRouter(blocked);
    const owner = new ConversationTurnRetryOwner(router.port);
    const first = await owner.prepare(project, retryRequest(fixture));
    const second = await owner.prepare(project, { ...retryRequest(fixture), clientRequestId: "retry-request-2" });

    const running = owner.execute(first);
    await vi.waitFor(() => expect(router.route).toHaveBeenCalledOnce());
    expect(() => owner.execute(second)).toThrowError(expect.objectContaining({ name: "Conflict" }));
    release();
    await expect(running).resolves.toMatchObject({ status: "completed" });
  });
});

async function failedTurnFixture(
  agentTurnMode: "default" | "plan",
  source: {
    text?: string;
    contextRefs?: import("../../src/workbench/types.js").TopicFileReference[];
    attemptProviderId?: string;
  } = {},
) {
  const conversationId = `conversation:${agentTurnMode}${source.attemptProviderId ? `:${source.attemptProviderId}` : ""}`;
  const graphScopeId = `graph:${conversationId}`;
  const sourceMessageId = `user:${conversationId}:1`;
  const failedAttemptId = `attempt:${conversationId}:failed`;
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    database.conversations.createConversation({
      projectId: project.id,
      conversationId,
      productMode: "agent",
      agentTurnMode,
      title: "Retry fixture",
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      deletedAt: null,
    });
    database.conversations.initializeConversationGraphScope(project.id, conversationId, graphScopeId, "2026-08-20T00:00:00.000Z");
    database.timeline.appendMessage(toCanonicalTimelineMessage(project.id, conversationId, {
      id: sourceMessageId,
      type: "user.message",
      timestamp: "2026-08-20T00:00:00.000Z",
      conversationId,
      graphScopeId,
      changeId: "",
      text: source.text ?? "Retry this exact request",
      contextRefs: source.contextRefs,
      agentTurnMode,
      completedTurnSequence: 1,
      attachments: [],
      agentSurfaceId: "main-agent",
    }));
    database.providerAttempts.createProviderAttempt({
      projectId: project.id,
      conversationId,
      attemptId: failedAttemptId,
      productMode: "agent",
      agentTurnMode,
      graphScopeId,
      changeId: null,
      agentTaskId: null,
      roleId: "main-agent",
      parentAgentSurfaceId: null,
      operationProfile: "agent",
      providerId: source.attemptProviderId ?? "codex",
      nativeSessionId: "session-1",
      model: { providerId: "codex", modelId: "test-model" },
      capabilitySnapshot: capabilitySnapshot(),
      effectiveSkillInputs: [],
      handoffHash: "failed-handoff",
      deliveredThroughCompletedTurn: 0,
      worktreeId: null,
      status: "failed",
      createdAt: "2026-08-20T00:00:01.000Z",
      updatedAt: "2026-08-20T00:00:02.000Z",
    });
    database.timeline.appendMessage(toCanonicalTimelineMessage(project.id, conversationId, {
      id: `assistant:${conversationId}:failed`,
      type: "assistant.message",
      timestamp: "2026-08-20T00:00:02.000Z",
      conversationId,
      graphScopeId,
      changeId: "",
      text: "Provider failed",
      status: "failed",
      providerId: "codex",
      attemptId: failedAttemptId,
      agentSurfaceId: "main-agent",
      retryTarget: {
        failedAttemptId,
        sourceMessageId,
        rootSourceMessageId: sourceMessageId,
        providerId: source.attemptProviderId ?? "codex",
        agentTurnMode,
      },
    }));
  } finally {
    database.close();
  }
  return { conversationId, graphScopeId, sourceMessageId, failedAttemptId, agentTurnMode };
}

function retryRequest(fixture: Awaited<ReturnType<typeof failedTurnFixture>>): ConversationTurnRetryRequest {
  return {
    conversationId: fixture.conversationId,
    productMode: "agent",
    providerId: "codex",
    expectedAttemptId: fixture.failedAttemptId,
    sourceMessageId: fixture.sourceMessageId,
    clientRequestId: "retry-request-1",
  };
}

function retryRouter(beforeRouteReturn?: Promise<void>) {
  const admit = vi.fn(async (request): Promise<ConversationTurnAdmission> => ({
    projectId: project.id,
    productMode: "agent",
    conversationId: request.conversationId,
    providerId: request.providerId,
    agentTurnMode: request.agentTurnMode ?? "default",
    capabilitySnapshot: capabilitySnapshot(),
    model: { providerId: "codex", modelId: "test-model" },
    sandboxPolicy: request.agentTurnMode === "plan" ? "read-only" : "workspace-write",
    writableRoots: request.agentTurnMode === "plan" ? [] : [project.path],
    runtimeState: { state: "onboarding", project, paths },
    attachmentResolution: {
      attachmentIds: [], imageInputs: [], fileInputs: [], runtimeReadRoots: [], evidence: [], diagnostics: [], handoffHash: "empty",
    },
  }));
  const route = vi.fn(async (request: ConversationTurnRequest) => {
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.providerAttempts.createProviderAttempt({
        projectId: project.id,
        conversationId: request.conversation.conversationId,
        attemptId: request.executionIdentity!.attemptId,
        productMode: "agent",
        agentTurnMode: request.actualAgentTurnMode ?? "default",
        graphScopeId: request.conversation.currentGraphScopeId,
        changeId: null,
        agentTaskId: null,
        roleId: "main-agent",
        parentAgentSurfaceId: null,
        operationProfile: "agent",
        providerId: request.providerId,
        nativeSessionId: "session-1",
        model: { providerId: "codex", modelId: "test-model" },
        capabilitySnapshot: capabilitySnapshot(),
        effectiveSkillInputs: [],
        handoffHash: "retry-handoff",
        deliveredThroughCompletedTurn: request.conversation.completedTurnSequence,
        worktreeId: null,
        status: "running",
        createdAt: "2026-08-20T00:00:03.000Z",
        updatedAt: "2026-08-20T00:00:03.000Z",
      });
    } finally {
      database.close();
    }
    await beforeRouteReturn;
    return { user: { id: "user", type: "user.message", timestamp: "", conversationId: request.conversation.conversationId, changeId: "" }, assistant: null, run: null, mode: "chat" as const, assistantMessage: "" };
  });
  const port = {
    resolveRuntimeState: async () => ({ state: "onboarding" as const, project, paths }),
    resolveAttachments: async () => [],
    resolveTurnSkills: async () => ({ skillInputs: [], diagnostics: [] }),
    admit,
    route,
  } as unknown as ConversationTurnRoutingPort;
  return { port, admit, route };
}

function capabilitySnapshot(): ProviderCapabilitySnapshot {
  return {
    providerId: "codex",
    displayName: "Codex",
    productMode: "agent",
    status: "ready",
    runnable: true,
    checkedAt: "2026-08-20T00:00:00.000Z",
    snapshotHash: "snapshot",
    snapshotVersion: 1,
    effectiveModel: "test-model",
    effectiveModelSource: "provider-default",
    degradedReasons: [],
    capabilities: [],
  };
}
