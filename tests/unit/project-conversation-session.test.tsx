// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyWorkbenchSnapshot,
  removalConfirmationMessage,
  useProjectConversationSession,
  type ProjectConversationSessionPorts,
  type WorkbenchRestoreParams,
} from "../../src/web/src/controllers/useProjectConversationSession.js";
import type { ProductMode, ProjectStatus, Snapshot, StreamPacket, WorkbenchLiveEvent } from "../../src/web/src/types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Project conversation session owner", () => {
  it("initializes an Agent empty Snapshot before auto-load runs", () => {
    const fixture = ownerFixture();
    const { result } = renderHook(() => useProjectConversationSession({
      ...fixture.ports,
      productMode: "agent",
      autoLoad: false,
    }));

    expect(result.current.productMode).toBe("agent");
    expect(result.current.snapshot.productMode).toBe("agent");
    expect(result.current.snapshot.center.conversationInteractions.productMode).toBe("agent");
  });

  it("keeps the default initial empty Snapshot in Harness mode", () => {
    const fixture = ownerFixture();
    const { result } = renderHook(() => useProjectConversationSession({
      ...fixture.ports,
      autoLoad: false,
    }));

    expect(result.current.productMode).toBe("harness");
    expect(result.current.snapshot.productMode).toBe("harness");
    expect(result.current.snapshot.center.conversationInteractions.productMode).toBe("harness");
  });

  it("keeps an Agent empty Snapshot when app restore finds no project", async () => {
    const fixture = ownerFixture();
    fixture.api.loadProjects.mockResolvedValue([]);
    fixture.api.loadAppStatus.mockResolvedValue({ mode: "app", directProjectId: null });
    const { result } = renderHook(() => useProjectConversationSession({
      ...fixture.ports,
      productMode: "agent",
      autoLoad: false,
    }));

    await act(async () => { await result.current.loadApp(); });

    expect(result.current.selectedProjectId).toBeNull();
    expect(result.current.selectedTopic).toBeNull();
    expect(result.current.snapshot.productMode).toBe("agent");
    expect(result.current.snapshot.center.conversationInteractions.productMode).toBe("agent");
  });

  it("restores the selected managed project, conversation, snapshot, run, and stream", async () => {
    const fixture = ownerFixture({ restore: { projectId: "repo-1", topicId: "conv-1", orchestrationOpen: true, settingsOpen: false } });
    fixture.api.loadSnapshot.mockResolvedValue(snapshot("repo-1", "conv-1", "run-1"));
    fixture.api.loadStream.mockResolvedValue(stream("run-1"));
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));

    await act(async () => { await result.current.loadApp(); });

    expect(result.current.selectedProjectId).toBe("repo-1");
    expect(result.current.selectedTopic).toBe("conv-1");
    expect(result.current.snapshot.center.selectedTopic?.id).toBe("conv-1");
    expect(result.current.selectedRun).toBe("run-1");
    expect(result.current.stream?.run.id).toBe("run-1");
    expect(result.current.expandedProjects).toEqual(new Set(["repo-1"]));
    expect(fixture.navigation.persistProjectId).toHaveBeenCalledWith("repo-1");
    expect(fixture.ui.restoreView).toHaveBeenCalledWith({ orchestrationOpen: true, settingsOpen: false });
  });

  it("preserves the project while switching modes and keeps mode caches isolated", async () => {
    const fixture = ownerFixture();
    fixture.api.loadSnapshot.mockImplementation(async (projectId: string, productMode: ProductMode) => (
      snapshot(projectId, productMode === "agent" ? "agent-conversation" : "harness-conversation", undefined, productMode)
    ));
    const { result, rerender } = renderHook(
      ({ productMode }: { productMode: ProductMode }) => useProjectConversationSession({
        ...fixture.ports,
        productMode,
        autoLoad: false,
      }),
      { initialProps: { productMode: "harness" as ProductMode } },
    );
    await act(async () => { await result.current.loadApp(); });
    expect(result.current.selectedTopic).toBe("harness-conversation");

    rerender({ productMode: "agent" });
    await waitFor(() => expect(result.current.productMode).toBe("agent"));
    await waitFor(() => expect(result.current.selectedTopic).toBe("agent-conversation"));

    expect(result.current.selectedProjectId).toBe("repo-1");
    expect(result.current.snapshot.productMode).toBe("agent");
    expect(result.current.projectSnapshots["repo-1"]?.productMode).toBe("agent");
    expect(fixture.api.loadSnapshot).toHaveBeenCalledWith("repo-1", "agent", null);
    expect(fixture.resources.cleanupTransition).toHaveBeenCalledWith("conversation-changed");
    expect(fixture.ui.transition).toHaveBeenCalledWith(expect.objectContaining({
      fromProductMode: "harness",
      toProductMode: "agent",
      toProjectId: "repo-1",
      toConversationId: null,
    }));

    rerender({ productMode: "harness" });
    await waitFor(() => expect(result.current.productMode).toBe("harness"));
    await waitFor(() => expect(result.current.projectSnapshots["repo-1"]?.productMode).toBe("harness"));
  });

  it("drops an old-mode Snapshot after a newer mode selection wins", async () => {
    let resolveHarness!: (value: Snapshot) => void;
    const harnessResponse = new Promise<Snapshot>((resolve) => { resolveHarness = resolve; });
    const fixture = ownerFixture();
    fixture.api.loadSnapshot.mockImplementation((_projectId: string, productMode: ProductMode) => (
      productMode === "harness" ? harnessResponse : Promise.resolve(snapshot("repo-1", "agent-conversation", undefined, "agent"))
    ));
    const { result, rerender } = renderHook(
      ({ productMode }: { productMode: ProductMode }) => useProjectConversationSession({
        ...fixture.ports,
        productMode,
        autoLoad: false,
      }),
      { initialProps: { productMode: "harness" as ProductMode } },
    );

    let harnessLoad!: Promise<void>;
    act(() => { harnessLoad = result.current.loadApp(); });
    await waitFor(() => expect(fixture.api.loadSnapshot).toHaveBeenCalledWith("repo-1", "harness", null));
    rerender({ productMode: "agent" });
    await waitFor(() => expect(result.current.snapshot.productMode).toBe("agent"));
    await act(async () => { resolveHarness(snapshot("repo-1", "stale-harness", undefined, "harness")); await harnessLoad; });

    expect(result.current.productMode).toBe("agent");
    expect(result.current.selectedTopic).toBe("agent-conversation");
    expect(result.current.snapshot.productMode).toBe("agent");
  });

  it("keeps the selected mode when a deep link belongs to the other mode", async () => {
    const fixture = ownerFixture({ restore: { projectId: "repo-1", topicId: "harness-link", orchestrationOpen: false, settingsOpen: false } });
    const conflict = Object.assign(new Error("Conversation productMode mismatch."), { name: "Conflict" });
    fixture.api.loadSnapshot.mockImplementation(async (projectId: string, productMode: ProductMode, conversationId: string | null) => {
      if (conversationId) throw conflict;
      return snapshot(projectId, "agent-latest", undefined, productMode);
    });
    const { result } = renderHook(() => useProjectConversationSession({
      ...fixture.ports,
      productMode: "agent",
      autoLoad: false,
    }));

    await act(async () => { await result.current.loadApp(); });

    expect(result.current.productMode).toBe("agent");
    expect(result.current.selectedTopic).toBe("agent-latest");
    expect(fixture.api.loadSnapshot).toHaveBeenNthCalledWith(1, "repo-1", "agent", "harness-link");
    expect(fixture.api.loadSnapshot).toHaveBeenNthCalledWith(2, "repo-1", "agent", null);
    expect(fixture.navigation.syncLocation).toHaveBeenLastCalledWith("repo-1", "agent-latest");
  });

  it("rejects a stale conversation response after a newer selection wins", async () => {
    let resolveOld!: (value: Snapshot) => void;
    const oldSnapshot = new Promise<Snapshot>((resolve) => { resolveOld = resolve; });
    const fixture = ownerFixture();
    fixture.api.loadSnapshot.mockImplementation((_projectId: string, _productMode: ProductMode, conversationId: string | null) => (
      conversationId === "conv-old" ? oldSnapshot : Promise.resolve(snapshot("repo-1", "conv-new"))
    ));
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    let oldRequest!: Promise<void>;
    act(() => { oldRequest = result.current.chooseConversation("repo-1", "conv-old"); });
    await act(async () => { await result.current.chooseConversation("repo-1", "conv-new"); });
    await act(async () => { resolveOld(snapshot("repo-1", "conv-old")); await oldRequest; });

    expect(result.current.selectedTopic).toBe("conv-new");
    expect(result.current.snapshot.center.selectedTopic?.id).toBe("conv-new");
  });

  it("notifies explicit cleanup owners while preserving Composer text on project and conversation switches", async () => {
    const fixture = ownerFixture();
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    await act(async () => { await result.current.chooseConversation("repo-1", "conv-2"); });
    await act(async () => { await result.current.openProject("repo-2"); });

    expect(fixture.resources.cleanupTransition).toHaveBeenNthCalledWith(1, "conversation-changed");
    expect(fixture.resources.cleanupTransition).toHaveBeenNthCalledWith(2, "project-changed");
    expect(fixture.operations.invalidate).toHaveBeenCalledTimes(2);
    expect(fixture.timeline.invalidateProjection).toHaveBeenCalledTimes(3);
    expect(fixture.ui.transition.mock.calls.map(([event]) => ({ kind: event.kind, reset: event.resetComposerText }))).toEqual([
      { kind: "conversation-changed", reset: false },
      { kind: "project-changed", reset: false },
    ]);
  });

  it("makes new Conversation the only transition that requests Composer text reset", async () => {
    const fixture = ownerFixture();
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    await act(async () => { await result.current.beginNewConversation("repo-1"); });

    expect(fixture.resources.cleanupTransition).toHaveBeenCalledWith("new-conversation");
    expect(fixture.ui.transition).toHaveBeenCalledWith(expect.objectContaining({
      kind: "new-conversation",
      resetComposerText: true,
      toProjectId: "repo-1",
      toConversationId: null,
    }));
    expect(result.current.selectedTopic).toBeNull();
    expect(result.current.snapshot.center.selectedTopic).toBeNull();
    expect(result.current.snapshot.center.agentLoop.runs).toEqual([]);
  });

  it("rekeys provisional demand metadata without creating or merging canonical transcript", async () => {
    const fixture = ownerFixture();
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    let pendingId = "";
    act(() => {
      pendingId = result.current.beginPendingDemand({
        projectId: "repo-1",
        clientRequestId: "pending-request",
        title: "需求",
        body: "实现功能",
        selectedProviderId: "codex",
        id: "pending:test",
        startedAt: "2026-07-17T00:00:00.000Z",
      }).id;
    });
    expect(pendingId).toBe("pending:test");
    expect(result.current.selectedTopic).toBe("pending:test");
    expect(fixture.navigation.syncLocation).toHaveBeenLastCalledWith("repo-1", "pending:test");

    act(() => result.current.acceptCanonicalConversation({
      projectId: "repo-1",
      productMode: "harness",
      clientRequestId: "foreign-request",
      conversationId: "conv-foreign",
      title: "错误需求",
    }));
    act(() => result.current.acceptCanonicalConversation({
      projectId: "repo-1",
      conversationId: "conv-missing-identity",
      title: "缺少身份",
    }));

    expect(result.current.selectedTopic).toBe("pending:test");

    act(() => result.current.acceptCanonicalConversation({
      projectId: "repo-1",
      productMode: "harness",
      clientRequestId: "pending-request",
      conversationId: "conv-canonical",
      title: "正式需求",
      selectedProviderId: "codex",
    }));

    expect(result.current.selectedTopic).toBe("conv-canonical");
    expect(result.current.pendingDemandConversation).toMatchObject({
      id: "conv-canonical",
      canonical: true,
      body: "实现功能",
    });
    expect(fixture.timeline.clearConversation).not.toHaveBeenCalled();
    expect(fixture.timeline.clearProject).not.toHaveBeenCalled();
  });

  it("owns pending-to-canonical creation and routes provider events without a second transcript", async () => {
    const fixture = ownerFixture();
    const routed: WorkbenchLiveEvent[] = [];
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    await act(async () => {
      await result.current.createDemandConversation({
        projectId: "repo-1",
        productMode: "harness",
        clientRequestId: "create-request-1",
        body: "Implement it",
        contextRefs: [],
        attachmentIds: [],
        providerId: "codex",
        skillOverrides: [],
        showPendingBeforeCreate: true,
      }, (_projectId, event) => routed.push(event));
    });

    expect(fixture.api.createDemandConversation).toHaveBeenCalledTimes(1);
    expect(fixture.ui.restoreView).toHaveBeenLastCalledWith({ orchestrationOpen: false, settingsOpen: false });
    expect(result.current.selectedTopic).toBe("conv-created");
    expect(result.current.pendingDemandConversation).toBeNull();
    expect(routed.map((event) => event.event)).toEqual(["topic.created"]);
  });

  it("binds topic.created only to the exact create request identity", async () => {
    const fixture = ownerFixture();
    const routed: WorkbenchLiveEvent[] = [];
    let finishStream!: () => void;
    const streamPending = new Promise<void>((resolve) => { finishStream = resolve; });
    fixture.api.createDemandConversation.mockImplementation(async (_input, onEvent) => {
      const emitCreated = (data: Record<string, unknown>) => onEvent({
        event: "topic.created",
        data: {
          projectId: "repo-1",
          productMode: "agent",
          conversationId: "conv-correct",
          clientRequestId: "request-correct",
          replayed: false,
          topic: { id: "conv-correct", conversationId: "conv-correct", title: "Correct", state: "active", productMode: "agent" },
          ...data,
        },
      } as WorkbenchLiveEvent);
      emitCreated({ clientRequestId: "foreign-request", conversationId: "conv-foreign", topic: { id: "conv-foreign", title: "Foreign", productMode: "agent" } });
      onEvent({
        event: "snapshot",
        data: snapshot("repo-1", "conv-foreign", undefined, "agent"),
      });
      emitCreated({ clientRequestId: undefined, conversationId: "conv-missing", topic: { id: "conv-missing", title: "Missing", productMode: "agent" } });
      onEvent({
        event: "run.status",
        data: { projectId: "repo-1", productMode: "agent", conversationId: "conv-missing", status: "running" },
      });
      emitCreated({ productMode: "harness", conversationId: "conv-wrong-mode", topic: { id: "conv-wrong-mode", title: "Wrong mode", productMode: "harness" } });
      emitCreated({});
      onEvent({
        event: "run.status",
        data: { projectId: "repo-1", productMode: "agent", conversationId: "conv-correct", status: "running" },
      });
      await streamPending;
    });
    const { result } = renderHook(() => useProjectConversationSession({
      ...fixture.ports,
      productMode: "agent",
      autoLoad: false,
    }));
    await act(async () => { await result.current.loadApp(); });

    let creation!: Promise<{ projectId: string; conversationId: string }>;
    act(() => {
      creation = result.current.createDemandConversation({
        projectId: "repo-1",
        productMode: "agent",
        clientRequestId: "request-correct",
        body: "Exact request",
        contextRefs: [],
        attachmentIds: [],
        skillOverrides: [],
        showPendingBeforeCreate: true,
      }, (_projectId, event) => {
        routed.push(event);
        if (event.event === "topic.created") {
          result.current.acceptCanonicalConversation({
            projectId: event.data.projectId,
            productMode: event.data.productMode,
            clientRequestId: event.data.clientRequestId,
            conversationId: event.data.conversationId,
            title: event.data.topic.title,
            selectedProviderId: event.data.topic.selectedProviderId,
          });
        }
      });
    });

    await waitFor(() => expect(result.current.selectedTopic).toBe("conv-correct"));
    expect(result.current.pendingDemandConversation).toMatchObject({
      id: "conv-correct",
      clientRequestId: "request-correct",
      canonical: true,
    });
    expect(routed.map((event) => event.event)).toEqual(["topic.created", "run.status"]);
    expect(routed[0]?.data.clientRequestId).toBe("request-correct");
    expect(fixture.navigation.syncLocation.mock.calls.filter(([, conversationId]) => conversationId === "conv-correct")).toHaveLength(1);

    act(() => result.current.acceptCanonicalConversation({
      projectId: "repo-1",
      productMode: "agent",
      clientRequestId: "request-correct",
      conversationId: "conv-same-request-wrong-conversation",
      title: "Wrong Conversation",
    }));
    expect(result.current.selectedTopic).toBe("conv-correct");
    expect(result.current.pendingDemandConversation?.id).toBe("conv-correct");
    expect(fixture.navigation.syncLocation.mock.calls.some(([, conversationId]) => (
      conversationId === "conv-same-request-wrong-conversation"
    ))).toBe(false);

    await act(async () => {
      finishStream();
      await expect(creation).resolves.toEqual({
        projectId: "repo-1",
        conversationId: "conv-correct",
      });
    });

    expect(result.current.selectedTopic).toBe("conv-correct");
    expect(result.current.pendingDemandConversation).toBeNull();
  });

  it("reconciles title updates across the selected snapshot and project cache", async () => {
    const fixture = ownerFixture();
    const initial = snapshot("repo-1", "conv-1");
    initial.left.topics = [{ id: "conv-1", title: "Old title", state: "active" }];
    initial.left.workpads = [{
      id: "conv-1",
      title: "Old title",
      state: "active",
      runtimeStatus: "active",
      selected: true,
      waitingDecisionCount: 0,
    }];
    fixture.api.loadSnapshot.mockResolvedValue(initial);
    fixture.api.updateConversationTitle.mockResolvedValue({
      conversation: {
        id: "conv-1",
        productMode: "harness",
        title: "New title",
        state: "active",
        updatedAt: "2026-07-28T00:00:00.000Z",
      },
    });
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    await act(async () => { await result.current.updateConversationTitle("repo-1", "conv-1", " New title "); });

    expect(fixture.api.updateConversationTitle).toHaveBeenCalledWith("repo-1", "conv-1", " New title ");
    expect(result.current.snapshot.left.topics[0]?.title).toBe("New title");
    expect(result.current.snapshot.left.workpads?.[0]?.title).toBe("New title");
    expect(result.current.snapshot.center.selectedTopic?.title).toBe("New title");
    expect(result.current.projectSnapshots["repo-1"]?.left.topics[0]?.title).toBe("New title");

    act(() => result.current.reconcileConversationTitle("repo-1", {
      id: "conv-1",
      productMode: "harness",
      title: "Newest title",
      state: "active",
      updatedAt: "2026-07-28T00:00:02.000Z",
    }));
    act(() => result.current.reconcileConversationTitle("repo-1", {
      id: "conv-1",
      productMode: "harness",
      title: "Stale title",
      state: "active",
      updatedAt: "2026-07-28T00:00:01.000Z",
    }));
    act(() => result.current.reconcileConversationTitle("repo-1", {
      id: "conv-1",
      productMode: "harness",
      title: "Same-version rollback",
      state: "active",
      updatedAt: "2026-07-28T00:00:02.000Z",
    }));

    expect(result.current.snapshot.left.topics[0]?.title).toBe("Newest title");
    expect(result.current.snapshot.left.workpads?.[0]?.title).toBe("Newest title");
    expect(result.current.snapshot.center.selectedTopic?.title).toBe("Newest title");
    expect(result.current.projectSnapshots["repo-1"]?.left.topics[0]?.title).toBe("Newest title");

    act(() => result.current.reconcileConversationTitle("repo-1", {
      id: "conv-1",
      productMode: "agent",
      title: "Wrong mode title",
      state: "active",
      updatedAt: "2026-07-28T00:00:03.000Z",
    }));

    expect(result.current.snapshot.left.topics[0]?.title).toBe("Newest title");
    expect(result.current.projectSnapshots["repo-1"]?.left.topics[0]?.title).toBe("Newest title");
  });

  it("lets a captured creation finish without pulling the user back after a project switch", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const fixture = ownerFixture();
    fixture.api.createDemandConversation.mockImplementation(async (_input, onEvent) => {
      await pending;
      onEvent({
        event: "topic.created",
        data: {
          projectId: "repo-1",
          productMode: "harness",
          conversationId: "conv-stale",
          clientRequestId: "stale-create-request",
          replayed: false,
          topic: { id: "conv-stale", conversationId: "conv-stale", title: "Stale", state: "active", productMode: "harness" },
        },
      } as WorkbenchLiveEvent);
    });
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    let creation!: Promise<{ projectId: string; conversationId: string }>;
    act(() => {
      creation = result.current.createDemandConversation({
        projectId: "repo-1",
        productMode: "harness",
        clientRequestId: "stale-create-request",
        body: "Old request",
        contextRefs: [],
        attachmentIds: [],
        skillOverrides: [],
        showPendingBeforeCreate: true,
      }, vi.fn());
    });
    await act(async () => { await result.current.openProject("repo-2"); });
    finish();
    await expect(creation).resolves.toEqual({ projectId: "repo-1", conversationId: "conv-stale" });

    expect(result.current.selectedProjectId).toBe("repo-2");
    expect(result.current.selectedTopic).not.toBe("conv-stale");
    expect(result.current.selectedTopic).toBeNull();
  });

  it("owns temporary project registration before first demand", async () => {
    const fixture = ownerFixture({ restore: {
      projectId: "temporary",
      topicId: null,
      orchestrationOpen: false,
      settingsOpen: false,
    } });
    fixture.api.loadProjects.mockResolvedValue([{
      project: { id: "temporary", name: "Temporary", path: "C:/temporary" },
      path: "C:/temporary",
      pathExists: true,
      isGitRepo: true,
      managed: false,
      harness: {
        projectPath: "C:/temporary",
        managed: false,
        readiness: "missing",
        activeChanges: [],
        pendingEvolution: false,
        components: [],
      },
    }]);
    fixture.api.registerProject.mockResolvedValue({
      project: { id: "registered" },
      status: managedProject("registered"),
    });
    fixture.api.createDemandConversation.mockImplementation(async (_input, onEvent) => {
      onEvent({
        event: "topic.created",
        data: {
          projectId: "registered",
          productMode: "harness",
          conversationId: "registered-conversation",
          clientRequestId: "registered-request",
          replayed: false,
          topic: {
            id: "registered-conversation",
            conversationId: "registered-conversation",
            title: "Registered demand",
            state: "active",
            productMode: "harness",
          },
        },
      } as WorkbenchLiveEvent);
    });
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    await act(async () => {
      await expect(result.current.ensureProjectRegistered("temporary")).resolves.toBe("registered");
    });
    expect(fixture.api.registerProject).toHaveBeenCalledWith("C:/temporary");
    expect(result.current.selectedProjectId).toBe("registered");
    expect(fixture.navigation.persistProjectId).toHaveBeenLastCalledWith("registered");

    await act(async () => {
      await expect(result.current.createDemandConversation({
        projectId: "registered",
        productMode: "harness",
        clientRequestId: "registered-request",
        body: "Create after registration",
        contextRefs: [],
        attachmentIds: [],
        skillOverrides: [],
        showPendingBeforeCreate: true,
      }, vi.fn())).resolves.toEqual({
        projectId: "registered",
        conversationId: "registered-conversation",
      });
    });
    expect(result.current.selectedProjectId).toBe("registered");
    expect(result.current.selectedTopic).toBe("registered-conversation");
  });

  it("keeps committed identity when the live stream fails after topic.created", async () => {
    const fixture = ownerFixture();
    fixture.api.createDemandConversation.mockImplementation(async (_input, onEvent) => {
      onEvent({
        event: "topic.created",
        data: {
          projectId: "repo-1",
          productMode: "harness",
          conversationId: "conv-committed",
          clientRequestId: "committed-request",
          replayed: false,
          topic: {
            id: "conv-committed",
            conversationId: "conv-committed",
            title: "Committed",
            state: "active",
            productMode: "harness",
          },
        },
      } as WorkbenchLiveEvent);
      throw new Error("stream disconnected");
    });
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    await act(async () => {
      await expect(result.current.createDemandConversation({
        projectId: "repo-1",
        productMode: "harness",
        clientRequestId: "committed-request",
        body: "Committed request",
        contextRefs: [],
        attachmentIds: ["attachment-1"],
        skillOverrides: [],
        showPendingBeforeCreate: true,
      }, vi.fn())).resolves.toEqual({ projectId: "repo-1", conversationId: "conv-committed" });
    });

    expect(result.current.selectedTopic).toBe("conv-committed");
    expect(fixture.ports.onError).toHaveBeenCalledWith("stream disconnected");
  });

  it("keeps the selected run and stream scoped to the latest request", async () => {
    let resolveOld!: (value: StreamPacket) => void;
    const oldStream = new Promise<StreamPacket>((resolve) => { resolveOld = resolve; });
    const fixture = ownerFixture();
    fixture.api.loadStream.mockImplementation((_projectId: string, runId: string) => (
      runId === "run-old" ? oldStream : Promise.resolve(stream(runId))
    ));
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    let oldRequest!: Promise<void>;
    act(() => { oldRequest = result.current.chooseRun("run-old"); });
    await act(async () => { await result.current.chooseRun("run-new"); });
    await act(async () => { resolveOld(stream("run-old")); await oldRequest; });

    expect(result.current.selectedRun).toBe("run-new");
    expect(result.current.stream?.run.id).toBe("run-new");
  });

  it("clears retired Timeline scopes for hide and remove without exposing compatibility state", async () => {
    const fixture = ownerFixture();
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });
    await act(async () => { await result.current.chooseConversation("repo-1", "conv-1"); });

    await act(async () => { await result.current.hideConversation("repo-1", "conv-1"); });
    expect(fixture.api.hideConversation).toHaveBeenCalledWith("repo-1", "conv-1");
    expect(fixture.timeline.clearConversation).toHaveBeenCalledWith("repo-1", "conv-1");
    expect(result.current.selectedTopic).toBeNull();

    await act(async () => { await result.current.removeProject("repo-1"); });
    expect(fixture.api.prepareProjectRemoval).toHaveBeenCalledWith("repo-1");
    expect(fixture.api.removeProject).toHaveBeenCalledWith("repo-1", "remove-token-repo-1");
    expect(fixture.timeline.clearProject).toHaveBeenCalledWith("repo-1");
    expect(result.current.selectedProjectId).toBeNull();
    expect(result.current.snapshot).toEqual(emptyWorkbenchSnapshot);
  });

  it("does not consume a prepared removal when the user declines the destructive warning", async () => {
    const fixture = ownerFixture();
    fixture.ui.confirmRemoveProject.mockReturnValue(false);
    const { result } = renderHook(() => useProjectConversationSession({ ...fixture.ports, autoLoad: false }));
    await act(async () => { await result.current.loadApp(); });

    await act(async () => { await result.current.removeProject("repo-1"); });

    expect(fixture.api.prepareProjectRemoval).toHaveBeenCalledWith("repo-1");
    expect(fixture.api.removeProject).not.toHaveBeenCalled();
    expect(result.current.projects).toHaveLength(2);
  });
});

function ownerFixture(options: { restore?: WorkbenchRestoreParams } = {}) {
  const projects = [managedProject("repo-1"), managedProject("repo-2")];
  const api = {
    loadAppStatus: vi.fn(async () => ({ mode: "app" as const, directProjectId: "repo-1" })),
    loadProjects: vi.fn(async () => projects),
    loadSnapshot: vi.fn(async (projectId: string, productMode: ProductMode, conversationId: string | null) => (
      snapshot(projectId, conversationId, undefined, productMode)
    )),
    loadStream: vi.fn(async (_projectId: string, runId: string) => stream(runId)),
    prepareProjectRemoval: vi.fn(async (projectId: string) => ({
      token: `remove-token-${projectId}`,
      projectId,
      projectName: projectId,
      expiresAt: "2026-08-03T12:00:00.000Z",
    })),
    removeProject: vi.fn(async () => undefined),
    hideConversation: vi.fn(async () => undefined),
    updateConversationTitle: vi.fn(async (_projectId: string, conversationId: string, title: string) => ({
      conversation: { id: conversationId, productMode: "harness" as const, title, state: "active" },
    })),
    registerProject: vi.fn(async () => ({ project: { id: "repo-1" }, status: managedProject("repo-1") })),
    createDemandConversation: vi.fn(async (input, onEvent: (event: WorkbenchLiveEvent) => void) => {
      onEvent({
        event: "topic.created",
        data: {
          projectId: "repo-1",
          productMode: "harness",
          conversationId: "conv-created",
          clientRequestId: input.clientRequestId,
          replayed: false,
          topic: { id: "conv-created", conversationId: "conv-created", title: "New demand", state: "active", productMode: "harness" },
        },
      } as WorkbenchLiveEvent);
    }),
  };
  const navigation = {
    readRestoreParams: vi.fn(() => options.restore ?? { projectId: null, topicId: null, orchestrationOpen: false, settingsOpen: false }),
    readPersistedProjectId: vi.fn(() => null),
    persistProjectId: vi.fn(),
    clearPersistedProjectId: vi.fn(),
    syncLocation: vi.fn(),
  };
  const timeline = { invalidateProjection: vi.fn(), clearProject: vi.fn(), clearConversation: vi.fn() };
  const resources = { cleanupTransition: vi.fn() };
  const operations = { invalidate: vi.fn() };
  const ui = { transition: vi.fn(), restoreView: vi.fn(), confirmRemoveProject: vi.fn(() => true) };
  const ports: ProjectConversationSessionPorts = { api, navigation, timeline, resources, operations, ui, onError: vi.fn() };
  return { api, navigation, timeline, resources, operations, ui, ports };
}

describe("Project removal confirmation", () => {
  it("states the destructive runtime boundary and preserved source owners", () => {
    const message = removalConfirmationMessage("Example");
    expect(message).toContain("永久删除 AHO 中的对话、运行记录、日志和运行 sidecar");
    expect(message).toContain("项目源码、物理项目 Harness Skill、Git worktree 和 Git 历史会保留");
    expect(message).not.toContain("只会从 App 项目列表移出");
  });
});

function managedProject(id: string): ProjectStatus {
  return {
    project: { id, name: id, path: `C:/${id}` },
    path: `C:/${id}`,
    pathExists: true,
    isGitRepo: true,
    managed: true,
    harness: { readiness: "ready" },
  };
}

function snapshot(
  projectId: string,
  conversationId: string | null,
  runId?: string,
  productMode: ProductMode = "harness",
): Snapshot {
  return {
    ...emptyWorkbenchSnapshot,
    productMode,
    project: { id: projectId, name: projectId, path: `C:/${projectId}` },
    center: {
      ...emptyWorkbenchSnapshot.center,
      selectedTopic: conversationId ? { id: conversationId, productMode, title: conversationId, state: "active", selectedProviderId: "codex", demandId: conversationId, graphScopeId: "scope-1" } : null,
      conversationInteractions: { productMode, conversationId: conversationId ?? undefined, items: [] },
      agentLoop: { runs: runId ? [{ id: runId, status: "running", startedAt: "2026-07-17T00:00:00.000Z", stages: [], targets: [], evidenceRefs: [], actionRefs: [] }] : [] },
    },
  };
}

function stream(runId: string): StreamPacket {
  return {
    run: { id: runId, status: "running", startedAt: "2026-07-17T00:00:00.000Z", stages: [], targets: [], evidenceRefs: [], actionRefs: [] },
    live: true,
    events: [],
    artifacts: [],
    diagnostics: [],
  };
}
