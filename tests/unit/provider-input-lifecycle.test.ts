import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductMode, ProviderUserInputRequest, ProviderUserInputResolution } from "../../src/provider-runtime/index.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { ProviderInputLifecycleOwner } from "../../src/workbench/provider-input-lifecycle.js";

const projectId = "provider-input-lifecycle-project";
const conversationId = "conversation-1";
const graphScopeId = "scope-1";
let root: string;
let originalAhoHome: string | undefined;
let runtime: ProjectRuntimePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-provider-input-lifecycle-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  runtime = resolveProjectRuntimePaths(projectId, process.env.AHO_HOME);
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe.each(["agent", "harness"] as const)("ProviderInputLifecycleOwner in %s mode", (productMode) => {
  it("deduplicates identical requests and converges request-before-resolution", async () => {
    await createConversation(productMode);
    const errors: Error[] = [];
    const owner = lifecycleOwner(productMode, errors);

    owner.onRequest(providerRequest());
    owner.onRequest(providerRequest());
    owner.onResolved(providerResolution());
    owner.onResolved(providerResolution());

    await expectRequestStatus("submitted");
    expect(await providerRequestRowCount()).toBe(1);
    expect(errors).toEqual([]);
    await owner.terminalize();
  });

  it("converges resolution-before-request and rejects wrong-thread resolution", async () => {
    await createConversation(productMode);
    const errors: Error[] = [];
    const owner = lifecycleOwner(productMode, errors);

    owner.onResolved(providerResolution());
    owner.onRequest(providerRequest());
    await expectRequestStatus("submitted");

    const second = providerRequest({ requestId: "request-2", itemId: "item-2" });
    owner.onRequest(second);
    await expectRequestStatus("pending", second);
    owner.onResolved(providerResolution({ requestId: "request-2", threadId: "wrong-thread" }));
    await vi.waitFor(() => expect(errors.at(-1)?.message).toContain("thread lineage"));
    await expectRequestStatus("pending", second);
    await owner.terminalize();
    await expectRequestStatus("interrupted", second);
  });
});

function lifecycleOwner(productMode: ProductMode, errors: Error[]): ProviderInputLifecycleOwner {
  return new ProviderInputLifecycleOwner({
    runtime,
    productMode,
    projectId,
    conversationId,
    graphScopeId,
    runId: "run-1",
    providerId: "codex",
    attemptId: "attempt-1",
    runtimeScopeId: conversationId,
    onError: (error) => errors.push(error),
  });
}

function providerRequest(overrides: Partial<ProviderUserInputRequest> = {}): ProviderUserInputRequest {
  return {
    providerId: "codex",
    requestId: "request-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    attemptId: "attempt-1",
    runId: "run-1",
    runtimeScopeId: conversationId,
    roleId: "main-agent",
    questions: [{
      id: "choice",
      question: "Continue?",
      inputMode: "single",
      allowCustom: false,
      options: [{ value: "yes", label: "Yes" }],
    }],
    ...overrides,
  };
}

function providerResolution(overrides: Partial<ProviderUserInputResolution> = {}): ProviderUserInputResolution {
  return {
    providerId: "codex",
    requestId: "request-1",
    runtimeScopeId: conversationId,
    runId: "run-1",
    attemptId: "attempt-1",
    threadId: "thread-1",
    ...overrides,
  };
}

async function createConversation(productMode: ProductMode): Promise<void> {
  const database = await openProjectRuntimeWorkbenchDatabase(runtime);
  const now = new Date().toISOString();
  try {
    database.conversations.createConversation({
      projectId,
      conversationId,
      productMode,
      agentTurnMode: productMode === "agent" ? "default" : null,
      title: "Provider input lifecycle",
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    database.conversations.initializeConversationGraphScope(projectId, conversationId, graphScopeId, now);
  } finally {
    database.close();
  }
}

async function expectRequestStatus(
  status: "pending" | "submitted" | "interrupted",
  request = providerRequest(),
): Promise<void> {
  await vi.waitFor(async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtime);
    try {
      const requestKey = ["run-1", request.threadId, request.turnId, request.itemId, request.requestId]
        .map((part) => encodeURIComponent(part ?? ""))
        .join(":");
      expect(database.interactions.readProviderUserInputRequest(projectId, conversationId, requestKey)?.status).toBe(status);
    } finally {
      database.close();
    }
  });
}

async function providerRequestRowCount(): Promise<number> {
  const database = await openProjectRuntimeWorkbenchDatabase(runtime);
  try {
    return database.timeline.listConversationMessages(projectId, conversationId)
      .filter((row) => row.id.startsWith("provider-user-input:"))
      .length;
  } finally {
    database.close();
  }
}
