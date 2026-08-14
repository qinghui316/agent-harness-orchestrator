// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeComposerSkillIds,
  prepareComposerInput,
  useConversationComposerController,
  workbenchEventMatchesConversation,
  type ConversationComposerPorts,
  type ConversationComposerScope,
} from "../../src/web/src/controllers/useConversationComposerController.js";
import type { SkillListItem, TopicAttachment, TopicFileReference } from "../../src/web/src/types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Conversation composer controller", () => {
  it("accepts realtime callbacks only for the captured project, mode, and Conversation", () => {
    const event = {
      event: "done",
      data: { projectId: "repo", productMode: "agent", conversationId: "conversation-1", status: "completed" },
    } as const;
    expect(workbenchEventMatchesConversation(event, {
      projectId: "repo",
      productMode: "agent",
      conversationId: "conversation-1",
    })).toBe(true);
    expect(workbenchEventMatchesConversation(event, {
      projectId: "repo",
      productMode: "harness",
      conversationId: "conversation-1",
    })).toBe(false);
    expect(workbenchEventMatchesConversation({
      event: "snapshot",
      data: {
        productMode: "agent",
        center: { selectedTopic: { id: "conversation-1", productMode: "agent" } },
      },
    }, {
      projectId: "repo",
      productMode: "agent",
      conversationId: "conversation-1",
    })).toBe(true);
  });

  it("prepares provider-neutral text, Skill overrides, and canonical file references", () => {
    const ref = fileRef("src/app.ts");
    expect(prepareComposerInput({
      body: "/reviewer inspect @src/app.ts",
      selectedRefs: [ref, ref],
      skills: [skill("reviewer")],
      conversationId: null,
      draftSkillOverrides: { formatter: false },
    })).toEqual({
      text: "inspect",
      contextRefs: [ref],
      skillOverrides: { formatter: false, reviewer: true },
    });

    expect(activeComposerSkillIds([
      skill("project", { enabledProject: true }),
      skill("topic", { enabledTopics: ["conversation-1"] }),
      skill("disabled", { enabledProject: true, disabledTopics: ["conversation-1"] }),
    ], "conversation-1", {})).toEqual(["project", "topic"]);
  });

  it("owns draft state and applies the explicit transition cleanup matrix", async () => {
    const ports = composerPorts();
    ports.skills.load.mockResolvedValue([skill("reviewer")]);
    const { result } = renderHook(() => useConversationComposerController(homeScope(), ports));
    await waitFor(() => expect(result.current.skillItems).toHaveLength(1));

    act(() => {
      result.current.setComposerText("keep this draft");
      result.current.setFileRefs([fileRef("src/app.ts")]);
      result.current.setAttachments([attachment("attachment-1")]);
    });
    await act(async () => result.current.toggleSkill("reviewer"));
    expect(result.current.activeSkillIds).toEqual(["reviewer"]);

    act(() => result.current.cleanupTransition("conversation-changed"));
    expect(result.current.composerText).toBe("keep this draft");
    expect(result.current.fileRefs).toEqual([]);
    expect(result.current.attachments).toEqual([]);
    expect(result.current.draftSkillOverrides).toEqual({});

    act(() => result.current.cleanupTransition("new-conversation"));
    expect(result.current.composerText).toBe("");
  });

  it("creates a Conversation through session ports and clears only after canonical success", async () => {
    const ports = composerPorts();
    ports.skills.load.mockResolvedValue([skill("reviewer")]);
    ports.session.createConversation.mockResolvedValue({ projectId: "repo", conversationId: "conversation-new" });
    const { result } = renderHook(() => useConversationComposerController(homeScope(), ports));
    await waitFor(() => expect(result.current.skillItems).toHaveLength(1));
    act(() => {
      result.current.setComposerText("/reviewer build feature");
      result.current.setFileRefs([fileRef("src/app.ts")]);
      result.current.setAttachments([attachment("existing")]);
    });

    await act(async () => {
      await result.current.createConversation();
    });

    expect(ports.session.createConversation).toHaveBeenCalledWith({
      projectId: "repo",
      productMode: "harness",
      clientRequestId: "request-1",
      body: "build feature",
      contextRefs: [fileRef("src/app.ts")],
      attachmentIds: ["existing"],
      providerId: "codex",
      skillOverrides: [{ skillId: "reviewer", enabled: true }],
      showPendingBeforeCreate: true,
    });
    expect(ports.skills.setEnabled).not.toHaveBeenCalled();
    expect(ports.projection.refreshConversation).toHaveBeenCalledWith("repo", "conversation-new");
    expect(ports.timeline.calibrate).toHaveBeenCalledWith("repo", "conversation-new", "main-agent");
    expect(result.current.composerText).toBe("");
    expect(result.current.fileRefs).toEqual([]);
    expect(result.current.attachments).toEqual([]);
    expect(ports.operation.release).toHaveBeenCalledWith(expect.objectContaining({ key: "topic.create" }));
  });

  it("cleans transient uploads on failed creation while preserving the user's draft", async () => {
    const ports = composerPorts();
    ports.session.createConversation.mockRejectedValue(new Error("create failed"));
    ports.attachments.upload.mockResolvedValue(attachment("uploaded"));
    const { result } = renderHook(() => useConversationComposerController(homeScope(), ports));
    act(() => result.current.setComposerText("keep me"));

    await act(async () => {
      await expect(result.current.createConversation({
        attachmentFiles: [new File(["hello"], "note.txt", { type: "text/plain" })],
      })).rejects.toThrow("create failed");
    });

    expect(ports.attachments.remove).toHaveBeenCalledWith("repo", "uploaded");
    expect(result.current.composerText).toBe("keep me");
    expect(ports.onError).toHaveBeenLastCalledWith("create failed");
  });

  it("sends ordinary messages through the action port and restores failed text without overwriting newer edits", async () => {
    let rejectSend!: (cause: Error) => void;
    const ports = composerPorts();
    ports.actions.sendMessage.mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectSend = reject; }));
    const scope = conversationScope();
    const { result } = renderHook(() => useConversationComposerController(scope, ports));
    act(() => {
      result.current.setComposerText("first message");
      result.current.setFileRefs([fileRef("src/app.ts")]);
      result.current.setAttachments([attachment("attachment-1")]);
    });

    let sendPromise!: Promise<void>;
    act(() => { sendPromise = result.current.send(); });
    await waitFor(() => expect(result.current.composerText).toBe(""));
    act(() => result.current.setComposerText("newer edit"));
    await act(async () => {
      rejectSend(new Error("network failed"));
      await expect(sendPromise).rejects.toThrow("network failed");
    });

    expect(result.current.composerText).toBe("newer edit");
    expect(result.current.fileRefs).toEqual([fileRef("src/app.ts")]);
    expect(result.current.attachments).toEqual([attachment("attachment-1")]);
    expect(ports.actions.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "repo",
      conversationId: "conversation-1",
      message: "first message",
      attachmentIds: ["attachment-1"],
      providerId: "claude",
      providerSwitchIntent: "resume-workflow",
    }));
    expect(ports.timeline.calibrate).toHaveBeenCalledWith("repo", "conversation-1", "main-agent");
  });

  it("keeps a captured first send running after a mode switch without overwriting the new draft", async () => {
    let resolveRegistration!: (projectId: string) => void;
    const ports = composerPorts();
    ports.session.ensureProjectRegistered.mockImplementation(() => new Promise<string>((resolve) => {
      resolveRegistration = resolve;
    }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: homeScope({ productMode: "agent" }) } },
    );
    act(() => result.current.setComposerText("agent request"));

    let creation!: Promise<{ projectId: string; conversationId: string } | null>;
    act(() => { creation = result.current.createConversation(); });
    await waitFor(() => expect(ports.session.ensureProjectRegistered).toHaveBeenCalledWith("repo"));
    rerender({ scope: homeScope({ productMode: "harness" }) });
    act(() => result.current.setComposerText("harness draft"));
    await act(async () => { resolveRegistration("repo"); await creation; });

    expect(ports.session.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "repo",
      productMode: "agent",
      clientRequestId: "request-1",
      body: "agent request",
    }));
    expect(result.current.composerText).toBe("harness draft");
    expect(ports.projection.refreshConversation).not.toHaveBeenCalled();
    expect(ports.timeline.calibrate).not.toHaveBeenCalled();
  });

  it("captures mode for an existing send before an immediate mode switch", async () => {
    let resolveSend!: () => void;
    const ports = composerPorts();
    ports.actions.sendMessage.mockImplementation(() => new Promise<void>((resolve) => { resolveSend = resolve; }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: conversationScope({ productMode: "agent", conversation: {
        id: "agent-conversation",
        productMode: "agent",
        state: "active",
        selectedProviderId: "codex",
      } }) } },
    );
    act(() => result.current.setComposerText("captured turn"));

    let pending!: Promise<void>;
    act(() => { pending = result.current.send(); });
    await waitFor(() => expect(ports.actions.sendMessage).toHaveBeenCalledOnce());
    rerender({ scope: homeScope({ productMode: "harness", conversation: null }) });
    await act(async () => { resolveSend(); await pending; });

    expect(ports.actions.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "repo",
      productMode: "agent",
      conversationId: "agent-conversation",
      message: "captured turn",
    }));
  });

  it("uses one captured Skill identity while follow-up overrides are pending", async () => {
    const firstOverride = deferred<void>();
    const ports = composerPorts();
    ports.skills.load.mockResolvedValue([
      skill("reviewer", { enabledProject: true }),
      skill("formatter", { enabledProject: true }),
    ]);
    ports.skills.setEnabled
      .mockImplementationOnce(() => firstOverride.promise)
      .mockResolvedValueOnce(undefined);
    const initialScope = conversationScope({
      productMode: "agent",
      selectedProviderId: "codex",
      conversation: {
        id: "agent-conversation",
        productMode: "agent",
        state: "active",
        selectedProviderId: "codex",
      },
    });
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: initialScope } },
    );
    await waitFor(() => expect(result.current.skillItems).toHaveLength(2));
    act(() => result.current.setComposerText("/reviewer /formatter inspect"));

    let pending!: Promise<void>;
    act(() => { pending = result.current.send(); });
    await waitFor(() => expect(ports.skills.setEnabled).toHaveBeenCalledTimes(1));
    rerender({ scope: conversationScope({
      productMode: "harness",
      selectedProviderId: "other-provider",
      conversation: {
        id: "harness-conversation",
        productMode: "harness",
        state: "active",
        selectedProviderId: "other-provider",
      },
    }) });
    act(() => result.current.setComposerText("new scope draft"));
    await act(async () => { firstOverride.resolve(); await pending; });

    expect(ports.skills.setEnabled).toHaveBeenCalledTimes(2);
    for (const [identity] of ports.skills.setEnabled.mock.calls) {
      expect(identity).toEqual({
        projectId: "repo",
        productMode: "agent",
        conversationId: "agent-conversation",
        providerId: "codex",
      });
    }
    expect(ports.actions.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "repo",
      productMode: "agent",
      conversationId: "agent-conversation",
      providerId: "codex",
    }));
    expect(result.current.composerText).toBe("new scope draft");
    expect(ports.onError).not.toHaveBeenCalled();
  });

  it("uses the stored Conversation Provider for Skill overrides before a Provider switch", async () => {
    const ports = composerPorts();
    ports.skills.load.mockResolvedValue([skill("reviewer", { enabledProject: true })]);
    const scope = conversationScope({
      productMode: "harness",
      selectedProviderId: "other-provider",
      conversation: {
        id: "conversation-switch",
        productMode: "harness",
        state: "active",
        selectedProviderId: "codex",
      },
    });
    const { result } = renderHook(() => useConversationComposerController(scope, ports));
    await waitFor(() => expect(result.current.skillItems).toHaveLength(1));
    act(() => result.current.setComposerText("/reviewer switch and continue"));

    await act(async () => { await result.current.send(); });

    expect(ports.skills.setEnabled).toHaveBeenCalledWith({
      projectId: "repo",
      productMode: "harness",
      conversationId: "conversation-switch",
      providerId: "codex",
    }, "reviewer", true);
    expect(ports.actions.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-switch",
      providerId: "other-provider",
      providerSwitchIntent: "resume-workflow",
    }));
  });

  it("does not clear the new mode refs or attachments when an old send completes", async () => {
    let resolveSend!: () => void;
    const ports = composerPorts();
    ports.actions.sendMessage.mockImplementation(() => new Promise<void>((resolve) => { resolveSend = resolve; }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: conversationScope({ productMode: "agent", conversation: {
        id: "agent-conversation",
        productMode: "agent",
        state: "active",
        selectedProviderId: "codex",
      } }) } },
    );
    act(() => {
      result.current.setComposerText("agent turn");
      result.current.setFileRefs([fileRef("src/agent.ts")]);
      result.current.setAttachments([attachment("agent-attachment")]);
    });
    let pending!: Promise<void>;
    act(() => { pending = result.current.send(); });
    await waitFor(() => expect(ports.actions.sendMessage).toHaveBeenCalledOnce());

    rerender({ scope: conversationScope({ productMode: "harness", conversation: {
      id: "harness-conversation",
      productMode: "harness",
      state: "active",
      selectedProviderId: "codex",
    } }) });
    act(() => {
      result.current.setComposerText("harness draft");
      result.current.setFileRefs([fileRef("src/harness.ts")]);
      result.current.setAttachments([attachment("harness-attachment")]);
    });
    await act(async () => { resolveSend(); await pending; });

    expect(result.current.composerText).toBe("harness draft");
    expect(result.current.fileRefs).toEqual([fileRef("src/harness.ts")]);
    expect(result.current.attachments).toEqual([attachment("harness-attachment")]);
  });

  it("does not surface or calibrate a failed Turn after its mode becomes inactive", async () => {
    let rejectSend!: (cause: Error) => void;
    const ports = composerPorts();
    ports.actions.sendMessage.mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectSend = reject; }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: conversationScope({ productMode: "agent", conversation: {
        id: "agent-conversation",
        productMode: "agent",
        state: "active",
        selectedProviderId: "codex",
      } }) } },
    );
    act(() => result.current.setComposerText("agent turn"));

    let pending!: Promise<void>;
    act(() => { pending = result.current.send(); });
    await waitFor(() => expect(ports.actions.sendMessage).toHaveBeenCalledOnce());
    rerender({ scope: homeScope({ productMode: "harness", conversation: null }) });
    act(() => result.current.setComposerText("harness draft"));
    await act(async () => {
      rejectSend(new Error("inactive turn failed"));
      await expect(pending).rejects.toThrow("inactive turn failed");
    });

    expect(result.current.composerText).toBe("harness draft");
    expect(ports.onError).not.toHaveBeenCalledWith("inactive turn failed");
    expect(ports.timeline.calibrate).not.toHaveBeenCalled();
  });

  it("does not surface or calibrate a failed Turn after another Conversation becomes active", async () => {
    let rejectSend!: (cause: Error) => void;
    const ports = composerPorts();
    ports.actions.sendMessage.mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectSend = reject; }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: conversationScope({ conversation: {
        id: "conversation-a",
        productMode: "harness",
        state: "active",
        selectedProviderId: "codex",
      } }) } },
    );
    act(() => result.current.setComposerText("conversation A turn"));

    let pending!: Promise<void>;
    act(() => { pending = result.current.send(); });
    await waitFor(() => expect(ports.actions.sendMessage).toHaveBeenCalledOnce());
    rerender({ scope: conversationScope({ conversation: {
      id: "conversation-b",
      productMode: "harness",
      state: "active",
      selectedProviderId: "codex",
    } }) });
    act(() => result.current.setComposerText("conversation B draft"));
    await act(async () => {
      rejectSend(new Error("conversation A failed"));
      await expect(pending).rejects.toThrow("conversation A failed");
    });

    expect(result.current.composerText).toBe("conversation B draft");
    expect(ports.onError).not.toHaveBeenCalledWith("conversation A failed");
    expect(ports.timeline.calibrate).not.toHaveBeenCalled();
  });

  it("does not publish a calibration error after its Conversation scope changes", async () => {
    let rejectCalibration!: (cause: Error) => void;
    const ports = composerPorts();
    ports.timeline.calibrate.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectCalibration = reject;
    }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: conversationScope({ conversation: {
        id: "conversation-a",
        productMode: "harness",
        state: "active",
        selectedProviderId: "codex",
      } }) } },
    );
    act(() => result.current.setComposerText("complete before calibration"));

    let pending!: Promise<void>;
    act(() => { pending = result.current.send(); });
    await waitFor(() => expect(ports.timeline.calibrate).toHaveBeenCalledWith("repo", "conversation-a", "main-agent"));
    rerender({ scope: conversationScope({ conversation: {
      id: "conversation-b",
      productMode: "harness",
      state: "active",
      selectedProviderId: "codex",
    } }) });
    await act(async () => {
      rejectCalibration(new Error("stale calibration failed"));
      await pending;
    });

    expect(ports.onError).not.toHaveBeenCalledWith("stale calibration failed");
  });

  it("rejects a stale Conversation before Skill writes or message dispatch", async () => {
    const ports = composerPorts();
    const { result } = renderHook(() => useConversationComposerController(conversationScope({
      productMode: "agent",
      conversation: {
        id: "harness-conversation",
        productMode: "harness",
        state: "active",
        selectedProviderId: "codex",
      },
    }), ports));
    act(() => result.current.setComposerText("must not send"));

    await act(async () => { await result.current.send(); });

    expect(ports.skills.setEnabled).not.toHaveBeenCalled();
    expect(ports.actions.sendMessage).not.toHaveBeenCalled();
    expect(ports.onError).toHaveBeenLastCalledWith(
      "Conversation productMode does not match the selected application mode.",
    );
    expect(result.current.composerText).toBe("must not send");
  });

  it("restores an unchanged failed draft and clears message context only after success", async () => {
    const failedPorts = composerPorts();
    failedPorts.actions.sendMessage.mockRejectedValue(new Error("offline"));
    const failed = renderHook(() => useConversationComposerController(conversationScope(), failedPorts));
    act(() => failed.result.current.setComposerText("retry this"));
    await act(async () => {
      await expect(failed.result.current.send()).rejects.toThrow("offline");
    });
    expect(failed.result.current.composerText).toBe("retry this");
    failed.unmount();

    const successPorts = composerPorts();
    let resolveSend!: () => void;
    successPorts.actions.sendMessage.mockImplementation(() => new Promise<void>((resolve) => { resolveSend = resolve; }));
    const success = renderHook(() => useConversationComposerController(conversationScope(), successPorts));
    act(() => {
      success.result.current.setComposerText("ship this");
      success.result.current.setFileRefs([fileRef("src/app.ts")]);
      success.result.current.setAttachments([attachment("attachment-1")]);
    });
    let successPromise!: Promise<void>;
    act(() => { successPromise = success.result.current.send(); });
    await waitFor(() => expect(successPorts.actions.sendMessage).toHaveBeenCalledTimes(1));
    await act(async () => success.result.current.reloadSkills());
    await act(async () => {
      resolveSend();
      await successPromise;
    });
    expect(success.result.current.composerText).toBe("");
    expect(success.result.current.fileRefs).toEqual([]);
    expect(success.result.current.attachments).toEqual([]);
  });

  it("keeps a captured first send running after a Provider switch without overwriting the new draft", async () => {
    let resolveCreation!: (created: { projectId: string; conversationId: string }) => void;
    const ports = composerPorts();
    ports.session.createConversation.mockImplementation(() => new Promise((resolve) => { resolveCreation = resolve; }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: homeScope({ productMode: "agent", selectedProviderId: "codex", providerCount: 2 }) } },
    );
    act(() => result.current.setComposerText("codex request"));

    let creation!: Promise<{ projectId: string; conversationId: string } | null>;
    act(() => { creation = result.current.createConversation(); });
    await waitFor(() => expect(ports.session.createConversation).toHaveBeenCalledWith(expect.objectContaining({ providerId: "codex" })));
    rerender({ scope: homeScope({ productMode: "agent", selectedProviderId: "other-provider", providerCount: 2 }) });
    act(() => result.current.setComposerText("other provider draft"));
    await act(async () => {
      resolveCreation({ projectId: "repo", conversationId: "codex-conversation" });
      await creation;
    });

    expect(result.current.composerText).toBe("other provider draft");
    expect(ports.projection.refreshConversation).not.toHaveBeenCalled();
    expect(ports.timeline.calibrate).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "Conversation",
      initial: conversationScope({ conversation: { id: "conversation-a", productMode: "harness", state: "active", selectedProviderId: "codex" } }),
      next: conversationScope({ conversation: { id: "conversation-b", productMode: "harness", state: "active", selectedProviderId: "codex" } }),
    },
    {
      label: "Provider",
      initial: homeScope({ productMode: "agent", selectedProviderId: "codex" }),
      next: homeScope({ productMode: "agent", selectedProviderId: "other-provider" }),
    },
  ])("ignores a late Skill response after a $label switch", async ({ initial, next }) => {
    let resolveInitial!: (skills: SkillListItem[]) => void;
    const ports = composerPorts();
    ports.skills.load
      .mockImplementationOnce(() => new Promise<SkillListItem[]>((resolve) => { resolveInitial = resolve; }))
      .mockResolvedValueOnce([skill("current-skill")]);
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: initial } },
    );
    await waitFor(() => expect(ports.skills.load).toHaveBeenCalledTimes(1));

    rerender({ scope: next });
    await waitFor(() => expect(ports.skills.load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.skillItems.map((item) => item.skillId)).toEqual(["current-skill"]));
    await act(async () => { resolveInitial([skill("stale-skill")]); });

    expect(result.current.skillItems.map((item) => item.skillId)).toEqual(["current-skill"]);
    expect(ports.onError).not.toHaveBeenCalled();
  });

  it("blocks running attachments, steers text, and keeps stop separate from projection ownership", async () => {
    const ports = composerPorts();
    const runningScope = conversationScope({ running: true, selectedProviderId: "codex" });
    const { result } = renderHook(() => useConversationComposerController(runningScope, ports));
    act(() => {
      result.current.setComposerText("follow up");
      result.current.setAttachments([attachment("attachment-1")]);
    });
    await act(async () => result.current.send());
    expect(ports.actions.steer).not.toHaveBeenCalled();
    expect(ports.onError).toHaveBeenLastCalledWith("当前执行中暂不支持追加附件；请等待执行暂停后再发送。");

    act(() => result.current.setAttachments([]));
    await act(async () => result.current.send());
    expect(ports.actions.steer).toHaveBeenCalledWith({
      projectId: "repo",
      conversationId: "conversation-1",
      prompt: "follow up",
    });
    expect(result.current.composerText).toBe("");

    act(() => result.current.setComposerText("stop context"));
    await act(async () => result.current.stop());
    expect(ports.actions.stop).toHaveBeenCalledWith({
      projectId: "repo",
      conversationId: "conversation-1",
      prompt: "stop context",
    });
    expect(ports.projection.refreshConversation).not.toHaveBeenCalled();
  });

  it.each(["steer", "stop"] as const)("does not leak a late %s failure into a new mode scope", async (action) => {
    let rejectAction!: (cause: Error) => void;
    const ports = composerPorts();
    ports.actions[action].mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectAction = reject; }));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: ConversationComposerScope }) => useConversationComposerController(scope, ports),
      { initialProps: { scope: conversationScope({
        productMode: "agent",
        running: true,
        conversation: { id: "agent-conversation", productMode: "agent", state: "active", selectedProviderId: "codex" },
      }) } },
    );
    act(() => result.current.setComposerText("old action"));
    let pending!: Promise<void>;
    act(() => { pending = action === "steer" ? result.current.send() : result.current.stop(); });
    await waitFor(() => expect(ports.actions[action]).toHaveBeenCalledOnce());

    rerender({ scope: homeScope({ productMode: "harness", conversation: null }) });
    act(() => result.current.setComposerText("new mode draft"));
    await act(async () => {
      rejectAction(new Error(`late ${action} failure`));
      await expect(pending).rejects.toThrow(`late ${action} failure`);
    });

    expect(result.current.composerText).toBe("new mode draft");
    expect(ports.onError).not.toHaveBeenCalledWith(`late ${action} failure`);
    expect(ports.timeline.calibrate).not.toHaveBeenCalled();
  });
});

function composerPorts(): ConversationComposerPorts & {
  session: { ensureProjectRegistered: ReturnType<typeof vi.fn>; createConversation: ReturnType<typeof vi.fn> };
  actions: { sendMessage: ReturnType<typeof vi.fn>; steer: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  projection: { refreshConversation: ReturnType<typeof vi.fn> };
  timeline: { calibrate: ReturnType<typeof vi.fn> };
  skills: { load: ReturnType<typeof vi.fn>; setEnabled: ReturnType<typeof vi.fn> };
  attachments: { upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  operation: { begin: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  ids: { createClientRequestId: ReturnType<typeof vi.fn> };
  onError: ReturnType<typeof vi.fn>;
} {
  let operationId = 0;
  return {
    operation: {
      begin: vi.fn((key: string) => ({ id: ++operationId, key })),
      release: vi.fn(),
    },
    session: {
      ensureProjectRegistered: vi.fn(async (projectId: string) => projectId),
      createConversation: vi.fn(async () => ({ projectId: "repo", conversationId: "conversation-new" })),
    },
    actions: {
      sendMessage: vi.fn(async () => undefined),
      steer: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    },
    projection: { refreshConversation: vi.fn(async () => undefined) },
    timeline: { calibrate: vi.fn(async () => undefined) },
    skills: {
      load: vi.fn(async () => []),
      setEnabled: vi.fn(async () => undefined),
    },
    attachments: {
      upload: vi.fn(async () => attachment("uploaded")),
      remove: vi.fn(async () => undefined),
    },
    ids: { createClientRequestId: vi.fn(() => "request-1") },
    onError: vi.fn(),
  };
}

function homeScope(overrides: Partial<ConversationComposerScope> = {}): ConversationComposerScope {
  return {
    projectId: "repo",
    conversation: null,
    managed: true,
    running: false,
    selectedProviderId: "codex",
    providerCount: 1,
    ...overrides,
  };
}

function conversationScope(overrides: Partial<ConversationComposerScope> = {}): ConversationComposerScope {
  return homeScope({
    conversation: { id: "conversation-1", state: "active", selectedProviderId: "codex" },
    selectedProviderId: "claude",
    providerCount: 2,
    ...overrides,
  });
}

function skill(skillId: string, overrides: Partial<SkillListItem> = {}): SkillListItem {
  return {
    skillId,
    name: skillId,
    description: `${skillId} description`,
    sourcePath: `skills/${skillId}`,
    sourceKind: "custom",
    scope: "user",
    contentHash: `hash-${skillId}`,
    compatibility: { requiredCapabilities: [] },
    providerBindings: [],
    providerEnabled: true,
    required: false,
    runtimeAssigned: false,
    enabledProject: false,
    enabledTopics: [],
    disabledTopics: [],
    ...overrides,
  };
}

function fileRef(relativePath: string): TopicFileReference {
  return {
    relativePath,
    name: relativePath.split("/").at(-1)!,
    kind: "file",
    source: "composer",
  };
}

function attachment(id: string): TopicAttachment {
  return {
    id,
    fileName: `${id}.txt`,
    mediaType: "text/plain",
    kind: "text",
    size: 5,
    hash: `hash-${id}`,
    source: "composer",
    createdAt: "2026-07-17T00:00:00.000Z",
    storagePath: `attachments/${id}/content.txt`,
    runtimeMode: "bounded-text-preview",
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
