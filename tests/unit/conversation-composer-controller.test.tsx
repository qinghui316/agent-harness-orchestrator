// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeComposerSkillIds,
  prepareComposerInput,
  useConversationComposerController,
  type ConversationComposerPorts,
  type ConversationComposerScope,
} from "../../src/web/src/controllers/useConversationComposerController.js";
import type { SkillListItem, TopicAttachment, TopicFileReference } from "../../src/web/src/types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Conversation composer controller", () => {
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
      body: "build feature",
      contextRefs: [fileRef("src/app.ts")],
      attachmentIds: ["existing"],
      providerId: "codex",
      showPendingBeforeCreate: true,
    });
    expect(ports.skills.setEnabled).toHaveBeenCalledWith("repo", "reviewer", true, "conversation-new");
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
});

function composerPorts(): ConversationComposerPorts & {
  session: { ensureProjectRegistered: ReturnType<typeof vi.fn>; createConversation: ReturnType<typeof vi.fn> };
  actions: { sendMessage: ReturnType<typeof vi.fn>; steer: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  projection: { refreshConversation: ReturnType<typeof vi.fn> };
  timeline: { calibrate: ReturnType<typeof vi.fn> };
  skills: { load: ReturnType<typeof vi.fn>; setEnabled: ReturnType<typeof vi.fn> };
  attachments: { upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  operation: { begin: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
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
