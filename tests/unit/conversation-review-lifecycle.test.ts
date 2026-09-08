import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderReviewRequest, ProviderReviewResult } from "../../src/provider-runtime/index.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ManagedProject } from "../../src/types/index.js";
import { projectCanonicalTimelineEnvelope } from "../../src/workbench/canonical-timeline-projector.js";
import { reconcileStaleAgentMainAttempts } from "../../src/workbench/agent-main-attempt-recovery.js";
import { ConversationReviewLifecycleOwner, type ConversationReviewRequest } from "../../src/workbench/conversation-review-lifecycle.js";
import { createConversationExecutionRevision } from "../../src/workbench/conversation-execution-revision.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";

const execFile = promisify(execFileCallback);
const projectId = "review-project";
const conversationId = "review-conversation";
const graphScopeId = "review-graph";
const sessionId = "private-review-thread";
let root: string;
let project: ManagedProject;
let paths: ProjectRuntimePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-conversation-review-"));
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  await git(projectRoot, ["init"]);
  await git(projectRoot, ["config", "user.email", "review@example.test"]);
  await git(projectRoot, ["config", "user.name", "Review Test"]);
  await writeFile(join(projectRoot, "source.ts"), "export const value = 1;\n", "utf8");
  await git(projectRoot, ["add", "source.ts"]);
  await git(projectRoot, ["commit", "-m", "initial"]);
  await writeFile(join(projectRoot, "source.ts"), "export const value = 2;\n", "utf8");
  paths = resolveProjectRuntimePaths(projectId, join(root, "aho-home"));
  project = {
    id: projectId,
    name: "Review Project",
    path: projectRoot,
    addedAt: "2026-09-01T00:00:00.000Z",
    lastSeenAt: "2026-09-01T00:00:00.000Z",
    defaultProviderId: "codex",
  };
  await seedConversation();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe("ConversationReviewLifecycleOwner", () => {
  it("settles an inline Review without advancing normal Turn sequence and replays idempotently", async () => {
    const runReview = vi.fn(async (request: ProviderReviewRequest): Promise<ProviderReviewResult> => {
      request.onTurnStarted?.({
        projectId,
        conversationId,
        runtimeScopeId: conversationId,
        providerId: "codex",
        attemptId: request.attemptId,
        runId: request.runId,
        roleId: "main-agent",
        sessionId,
        turnId: "private-review-turn",
      });
      request.onReviewEvent?.({ phase: "started", occurredAt: "2026-09-01T00:01:00.000Z" });
      request.onReviewEvent?.({
        phase: "completed",
        reviewText: `Finding in ${join(project.path, "source.ts")}:1-1, C:\\outside\\secret.txt, and https://example.test/review`,
        occurredAt: "2026-09-01T00:02:00.000Z",
      });
      return {
        providerId: "codex",
        status: "completed",
        session: { providerId: "codex", sessionId },
        turnId: "private-review-turn",
        reviewText: "ignored duplicate transport text",
      };
    });
    const owner = createOwner(runReview);
    const request = await reviewRequest("review-completed");

    await expect(owner.start(project, request)).resolves.toMatchObject({ status: "completed", conversationId });
    await expect(owner.start(project, request)).resolves.toMatchObject({ status: "completed", conversationId });
    expect(runReview).toHaveBeenCalledOnce();
    expect(runReview.mock.calls[0]?.[0]).toMatchObject({
      existingSession: { providerId: "codex", sessionId },
      bootstrapModel: null,
      bootstrapReasoningEffort: null,
      sandboxPolicy: "read-only",
      target: { type: "uncommitted-changes" },
    });

    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      const conversation = database.conversations.readConversation(projectId, conversationId)!;
      expect(conversation.completedTurnSequence).toBe(1);
      const attempt = database.providerAttempts.listProviderAttempts(projectId, conversationId)
        .find((candidate) => candidate.operationKind === "review")!;
      expect(attempt).toMatchObject({ agentTurnMode: null, status: "completed" });
      const review = database.timeline.listConversationMessages(projectId, conversationId)
        .find((row) => row.type === "provider.review")!;
      expect(review.text).toContain("source.ts:1-1");
      expect(review.text).toContain("[path redacted]");
      expect(review.text).toContain("https://example.test/review");
      expect(JSON.stringify(review)).not.toContain(sessionId);
      expect(JSON.stringify(review)).not.toContain("private-review-turn");
      expect(projectCanonicalTimelineEnvelope(review, "agent").cells).toEqual([
        expect.objectContaining({ kind: "review-card", status: "completed", text: expect.stringContaining("source.ts:1-1") }),
      ]);
    } finally {
      database.close();
    }

    await expect(owner.start(project, { ...request, target: { type: "custom", instructions: "different" } }))
      .rejects.toMatchObject({ name: "Conflict" });
    await expect(owner.start(project, { ...request, source: "queue" }))
      .rejects.toMatchObject({ name: "Conflict" });
    expect(runReview).toHaveBeenCalledOnce();
  });

  it("does not silently replace an unavailable existing Conversation Session", async () => {
    const request = await reviewRequest("review-unavailable-binding");
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.providerAttempts.writeConversationProviderBinding({
        projectId,
        conversationId,
        providerId: "codex",
        nativeSessionId: null,
        lastDeliveredCompletedTurn: 1,
        preferredModel: null,
        lastUsedAt: "2026-09-01T00:00:01.000Z",
        bindingStatus: "unavailable",
      });
    } finally {
      database.close();
    }
    const runReview = vi.fn();
    const owner = createOwner(runReview);

    await expect(owner.start(project, request)).rejects.toMatchObject({ name: "Conflict" });
    expect(runReview).not.toHaveBeenCalled();
    const stored = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(stored.conversationReviews.read(projectId, request.clientRequestId)).toBeNull();
      expect(stored.providerAttempts.listProviderAttempts(projectId, conversationId)
        .filter((attempt) => attempt.operationKind === "review")).toEqual([]);
    } finally {
      stored.close();
    }
  });

  it("uses the persisted empty-Composer model selection only to bootstrap a new Review Session", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.drafts.upsertDraft({
        projectId,
        productMode: "agent",
        agentTurnMode: "plan",
        agentModelId: "gpt-review",
        agentReasoningEffort: "high",
        text: "/review",
        contextRefsJson: "[]",
        attachmentIdsJson: "[]",
        skillOverridesJson: "{}",
        selectedProviderId: "codex",
        updatedAt: "2026-09-01T00:03:00.000Z",
      }, null);
    } finally {
      database.close();
    }
    let captured: ProviderReviewRequest | null = null;
    const runReview = vi.fn(async (request: ProviderReviewRequest): Promise<ProviderReviewResult> => {
      captured = request;
      request.onTurnStarted?.({
        projectId,
        conversationId: request.conversationId,
        runtimeScopeId: request.runtimeScopeId,
        providerId: "codex",
        attemptId: request.attemptId,
        runId: request.runId,
        roleId: "main-agent",
        sessionId: "new-private-session",
        turnId: "new-private-turn",
      });
      request.onReviewEvent?.({ phase: "started", occurredAt: "2026-09-01T00:04:00.000Z" });
      request.onReviewEvent?.({ phase: "completed", reviewText: "No findings.", occurredAt: "2026-09-01T00:05:00.000Z" });
      return { providerId: "codex", status: "completed", session: { providerId: "codex", sessionId: "new-private-session" }, turnId: "new-private-turn", reviewText: "No findings." };
    });
    const owner = createOwner(runReview);
    const receipt = await owner.start(project, {
      productMode: "agent",
      conversationId: null,
      providerId: "codex",
      target: { type: "custom", instructions: "focus on correctness" },
      expectedTimelineRevision: null,
      expectedExecutionRevision: null,
      clientRequestId: "review-empty",
    });

    expect(captured).toMatchObject({
      existingSession: null,
      bootstrapModel: { providerId: "codex", modelId: "gpt-review" },
      bootstrapReasoningEffort: "high",
    });
    const stored = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(stored.conversations.readConversation(projectId, receipt.conversationId)).toMatchObject({
        agentTurnMode: "plan",
        agentModelId: "gpt-review",
        agentReasoningEffort: "high",
      });
      expect(stored.drafts.readDraft(projectId, "agent")?.text).toBe("/review");
    } finally {
      stored.close();
    }
  });

  it("rejects Harness, stale execution identity, and queue bypass before Provider I/O", async () => {
    const runReview = vi.fn();
    const owner = createOwner(runReview);
    const request = await reviewRequest("review-blocked");
    await expect(owner.start(project, { ...request, productMode: "harness" as never }))
      .rejects.toMatchObject({ name: "Conflict" });
    await expect(owner.start(project, { ...request, clientRequestId: "review-stale", expectedExecutionRevision: "execution:stale" }))
      .rejects.toMatchObject({ name: "Conflict" });

    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      const now = "2026-09-01T00:06:00.000Z";
      database.conversationTurnQueues.ensureQueue({ projectId, conversationId, productMode: "agent", updatedAt: now });
      database.conversationTurnQueues.insertItem({
        projectId,
        productMode: "agent",
        conversationId,
        queueItemId: "queued-turn",
        clientRequestId: "queued-turn-client",
        requestHash: "queued-turn-hash",
        position: 1,
        status: "queued",
        retryCount: 0,
        predecessorExecutionRevision: request.expectedExecutionRevision!,
        dispatchRequestId: "queued-turn-dispatch",
        itemKind: "conversation-turn",
        reviewTargetJson: null,
        text: "later",
        contextRefsJson: "[]",
        attachmentIdsJson: "[]",
        skillOverridesJson: "{}",
        providerId: "codex",
        agentTurnMode: "default",
        agentModelId: null,
        agentReasoningEffort: null,
        diagnostic: null,
        createdAt: now,
        updatedAt: now,
        dispatchedAt: null,
      });
    } finally {
      database.close();
    }
    await expect(owner.start(project, { ...request, clientRequestId: "review-queue-bypass" }))
      .rejects.toMatchObject({ name: "Conflict" });
    expect(runReview).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized direct Review targets before Provider I/O", async () => {
    const runReview = vi.fn();
    const owner = createOwner(runReview);
    const request = await reviewRequest("review-invalid-target");

    await expect(owner.start(project, {
      ...request,
      target: { type: "base-branch" } as never,
    })).rejects.toMatchObject({ name: "BadRequest" });
    await expect(owner.start(project, {
      ...request,
      clientRequestId: "review-oversized-target",
      target: { type: "custom", instructions: "x".repeat(100_001) },
    })).rejects.toMatchObject({ name: "BadRequest" });
    expect(runReview).not.toHaveBeenCalled();
  });

  it("projects stale Session recovery from the last completed normal Turn", async () => {
    const owner = createOwner(vi.fn(async (): Promise<ProviderReviewResult> => ({
      providerId: "codex",
      status: "failed",
      session: { providerId: "codex", sessionId },
      turnId: null,
      reviewText: "",
      failureKind: "stale-session",
      error: "session unavailable",
    })));
    await expect(owner.start(project, await reviewRequest("review-stale-session")))
      .resolves.toMatchObject({ status: "failed" });
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      const row = database.timeline.listConversationMessages(projectId, conversationId)
        .find((candidate) => candidate.type === "provider.review")!;
      expect(projectCanonicalTimelineEnvelope(row, "agent").cells).toEqual([
        expect.objectContaining({
          kind: "review-card",
          forkTarget: expect.objectContaining({ sourceMessageId: "assistant-1", completedTurnSequence: 1, recovery: true }),
        }),
      ]);
      expect(database.providerAttempts.readConversationProviderBinding(projectId, conversationId, "codex"))
        .toMatchObject({ bindingStatus: "stale" });
    } finally {
      database.close();
    }
  });

  it("keeps uncertain transport nonterminal and interrupts it on restart without replay", async () => {
    const uncertain = new Error("Provider Review transport outcome is uncertain.");
    uncertain.name = "ProviderReviewTransportUncertain";
    const runReview = vi.fn(async () => { throw uncertain; });
    const owner = createOwner(runReview);
    const request = await reviewRequest("review-uncertain");

    await expect(owner.start(project, request)).rejects.toMatchObject({ name: "ProviderReviewTransportUncertain" });
    await expect(owner.start(project, request)).resolves.toMatchObject({ status: "submitting" });
    expect(runReview).toHaveBeenCalledOnce();

    let database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(database.conversationReviews.read(projectId, request.clientRequestId)).toMatchObject({ status: "submitting" });
      expect(database.providerAttempts.listProviderAttempts(projectId, conversationId)
        .find((candidate) => candidate.operationKind === "review")).toMatchObject({ status: "running" });
    } finally {
      database.close();
    }

    await expect(reconcileStaleAgentMainAttempts({
      project,
      providerRegistry: { findActiveTurn: () => null } as never,
      runtimeState: { state: "onboarding", project, paths },
    })).resolves.toEqual({ failed: 0, diagnostics: [] });
    database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(database.timeline.listConversationMessages(projectId, conversationId)
        .some((item) => item.type === "assistant.message" && item.status === "failed")).toBe(false);
      expect(database.providerAttempts.listProviderAttempts(projectId, conversationId)
        .find((candidate) => candidate.operationKind === "review")).toMatchObject({ status: "running" });
    } finally {
      database.close();
    }

    const restarted = createOwner(vi.fn());
    await expect(restarted.reconcileProject(paths)).resolves.toBe(1);
    database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(database.conversationReviews.read(projectId, request.clientRequestId)).toMatchObject({ status: "interrupted" });
      expect(database.providerAttempts.listProviderAttempts(projectId, conversationId)
        .find((candidate) => candidate.operationKind === "review")).toMatchObject({ status: "interrupted" });
    } finally {
      database.close();
    }
  });

  it("repairs Timeline settlement after Provider completion without replaying Review", async () => {
    const runReview = vi.fn(async (request: ProviderReviewRequest): Promise<ProviderReviewResult> => {
      request.onTurnStarted?.({
        projectId,
        conversationId,
        runtimeScopeId: conversationId,
        providerId: "codex",
        attemptId: request.attemptId,
        runId: request.runId,
        roleId: "main-agent",
        sessionId,
        turnId: "repair-review-turn",
      });
      request.onReviewEvent?.({ phase: "started", occurredAt: "2026-09-01T00:10:00.000Z" });
      request.onReviewEvent?.({ phase: "completed", reviewText: "Repair result.", occurredAt: "2026-09-01T00:11:00.000Z" });
      return {
        providerId: "codex",
        status: "completed",
        session: { providerId: "codex", sessionId },
        turnId: "repair-review-turn",
        reviewText: "Repair result.",
      };
    });
    const owner = createOwner(runReview);
    const settlement = vi.spyOn(owner as unknown as { settle(...args: unknown[]): Promise<void> }, "settle")
      .mockRejectedValueOnce(new Error("controlled Timeline write failure"));
    const request = await reviewRequest("review-settlement-repair");

    await expect(owner.start(project, request)).rejects.toThrow("controlled Timeline write failure");
    expect(runReview).toHaveBeenCalledOnce();
    await expect(owner.start(project, request)).resolves.toMatchObject({ status: "completed" });
    expect(runReview).toHaveBeenCalledOnce();
    expect(settlement).toHaveBeenCalledTimes(2);
  });
});

function createOwner(runReview: (request: ProviderReviewRequest) => Promise<ProviderReviewResult>): ConversationReviewLifecycleOwner {
  return new ConversationReviewLifecycleOwner({
    providerRegistry: {
      get: () => ({
        capabilitySnapshot: async () => capabilitySnapshot(),
        models: { read: async () => modelSnapshot() },
        conversation: { runReview },
      }),
      findActiveTurn: () => null,
    } as never,
    projectRuntimeCoordinator: { resolve: async () => ({ state: "onboarding", paths }) } as never,
  });
}

async function seedConversation(): Promise<void> {
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const now = "2026-09-01T00:00:00.000Z";
    database.conversations.createConversation({
      projectId,
      conversationId,
      productMode: "agent",
      agentTurnMode: "default",
      agentModelId: "gpt-existing",
      agentReasoningEffort: "medium",
      title: "Review source",
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId: "codex",
      completedTurnSequence: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    database.conversations.initializeConversationGraphScope(projectId, conversationId, graphScopeId, now);
    database.timeline.appendMessage({
      id: "assistant-1",
      projectId,
      conversationId,
      changeId: "",
      agentSurfaceId: "main-agent",
      type: "assistant.message",
      timestamp: now,
      text: "Previous answer",
      actionRunId: null,
      actionType: null,
      status: "completed",
      runId: "prior-run",
      providerId: "codex",
      threadId: sessionId,
      turnId: "prior-turn",
      itemId: null,
      artifact: null,
      error: null,
      rawJson: JSON.stringify({ graphScopeId, completedTurnSequence: 1 }),
    });
    database.providerAttempts.writeConversationProviderBinding({
      projectId,
      conversationId,
      providerId: "codex",
      nativeSessionId: sessionId,
      lastDeliveredCompletedTurn: 1,
      preferredModel: { providerId: "codex", modelId: "gpt-existing" },
      lastUsedAt: now,
      bindingStatus: "ready",
    });
  } finally {
    database.close();
  }
}

async function reviewRequest(clientRequestId: string): Promise<ConversationReviewRequest> {
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const conversation = database.conversations.readConversation(projectId, conversationId)!;
    return {
      productMode: "agent",
      conversationId,
      providerId: "codex",
      target: { type: "uncommitted-changes" },
      expectedTimelineRevision: conversation.timelineRevision,
      expectedExecutionRevision: createConversationExecutionRevision(graphScopeId, conversation.completedTurnSequence, []),
      clientRequestId,
    };
  } finally {
    database.close();
  }
}

function capabilitySnapshot() {
  return {
    providerId: "codex",
    displayName: "Codex",
    productMode: "agent" as const,
    status: "ready" as const,
    runnable: true,
    checkedAt: "2026-09-01T00:00:00.000Z",
    snapshotHash: "review-capability",
    snapshotVersion: 1,
    effectiveModel: "gpt-review",
    effectiveModelSource: "provider-default" as const,
    degradedReasons: [],
    capabilities: [{ key: "turn.review" as const, label: "Review", spec: "supported" as const, runtime: "ready" as const, summary: "ready" }],
  };
}

function modelSnapshot() {
  return {
    providerId: "codex",
    selectedModel: null,
    effectiveModel: { providerId: "codex", modelId: "gpt-review" },
    effectiveModelSource: "provider-default" as const,
    available: true,
    candidates: [{
      providerId: "codex",
      modelId: "gpt-review",
      label: "GPT Review",
      source: "runtime" as const,
      isDefault: true,
      supportedReasoningEfforts: [{ value: "high", label: "High" }],
      defaultReasoningEffort: "high",
    }],
    diagnostics: [],
  };
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFile("git", args, { cwd, windowsHide: true });
}
