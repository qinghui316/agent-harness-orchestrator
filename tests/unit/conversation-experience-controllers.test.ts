// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  ConversationDraftController,
  type ConversationDraftViewModel,
} from "../../src/web/src/controllers/ConversationDraftController.js";
import { ConversationTurnSubmissionController } from "../../src/web/src/controllers/ConversationTurnSubmissionController.js";
import { createDraftSubmissionSnapshot } from "../../src/web/src/controllers/conversation-submission-contract.js";
import type { TopicAttachment, TopicFileReference } from "../../src/web/src/types.js";

describe("Conversation experience application owners", () => {
  it("reads an immutable draft snapshot and clears only values still matching the accepted draft", () => {
    const harness = draftHarness(draft({
      text: "first",
      contextRefs: [fileRef("src/first.ts")],
      attachments: [attachment("first")],
      skillOverrides: { reviewer: true },
    }));
    const owner = new ConversationDraftController(harness.port);
    const accepted = owner.read();

    accepted.contextRefs[0]!.relativePath = "mutated.ts";
    expect(harness.state.contextRefs[0]?.relativePath).toBe("src/first.ts");

    const realAccepted = owner.read();
    harness.state.text = "newer edit";
    harness.state.attachments = [attachment("newer")];
    owner.clearAcceptedSnapshot(realAccepted);

    expect(harness.state).toMatchObject({
      text: "newer edit",
      contextRefs: [],
      attachments: [expect.objectContaining({ id: "newer" })],
      skillOverrides: {},
    });
    expect(harness.dirtyCount).toBe(0);
  });

  it("merges restored content without overwriting current work and restores Agent-only configuration only into an empty draft", () => {
    const harness = draftHarness(draft({
      text: "current",
      contextRefs: [fileRef("src/current.ts")],
      attachments: [attachment("current")],
      skillOverrides: { current: true },
      agentTurnMode: "default",
      modelId: "current-model",
      reasoningEffort: "low",
    }));
    const owner = new ConversationDraftController(harness.port);
    owner.restore(submissionSnapshot({ productMode: "agent" }), [attachment("restored")], {
      restoreConfiguration: true,
      restoreSkillOverrides: true,
    });

    expect(harness.state.text).toBe("current\n\nrestored");
    expect(harness.state.contextRefs.map((item) => item.relativePath)).toEqual(["src/current.ts", "src/restored.ts"]);
    expect(harness.state.attachments.map((item) => item.id)).toEqual(["current", "restored"]);
    expect(harness.state.skillOverrides).toEqual({ restored: true, current: true });
    expect(harness.state).toMatchObject({ agentTurnMode: "default", modelId: "current-model", reasoningEffort: "low" });
    expect(harness.dirtyCount).toBe(1);

    const emptyHarness = draftHarness(draft());
    const emptyOwner = new ConversationDraftController(emptyHarness.port);
    emptyOwner.restore(submissionSnapshot({ productMode: "agent" }), [], { restoreConfiguration: true });
    expect(emptyHarness.state).toMatchObject({ agentTurnMode: "plan", modelId: "gpt-next", reasoningEffort: "high" });

    const ahoHarness = draftHarness(draft());
    new ConversationDraftController(ahoHarness.port).restore(
      submissionSnapshot({ productMode: "harness", agentTurnMode: "plan", modelId: "must-not-cross", reasoningEffort: "high" }),
      [],
      { restoreConfiguration: true },
    );
    expect(ahoHarness.state).toMatchObject({ agentTurnMode: "default", modelId: null, reasoningEffort: null });
  });

  it("deep-clones submissions, retries only proven failures with a new request id, and retains original files", () => {
    const owner = new ConversationTurnSubmissionController();
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const snapshot = submissionSnapshot();
    const begun = owner.begin({
      kind: "create",
      snapshot,
      attachments: [attachment("existing")],
      attachmentFiles: [file],
    });
    begun.snapshot.contextRefs[0]!.relativePath = "mutated.ts";
    begun.attachments[0]!.fileName = "mutated.txt";

    const failed = owner.fail(snapshot.clientRequestId, "failed");
    expect(failed?.snapshot.contextRefs[0]?.relativePath).toBe("src/restored.ts");
    expect(failed?.attachments[0]?.fileName).toBe("existing.txt");
    const retry = owner.retry(snapshot.clientRequestId, "request-retry");
    expect(retry).toMatchObject({
      state: "sending",
      snapshot: { clientRequestId: "request-retry" },
      attachmentFiles: [file],
    });

    owner.fail("request-retry", "uncertain");
    expect(owner.retry("request-retry", "request-must-not-run")).toBeNull();
    expect(owner.restore("request-retry")?.attachmentFiles).toEqual([file]);
  });
});

function draft(overrides: Partial<ConversationDraftViewModel> = {}): ConversationDraftViewModel {
  return {
    text: "",
    contextRefs: [],
    attachments: [],
    skillOverrides: {},
    agentTurnMode: "default",
    modelId: null,
    reasoningEffort: null,
    ...overrides,
  };
}

function submissionSnapshot(overrides: Partial<Parameters<typeof createDraftSubmissionSnapshot>[0]> = {}) {
  return createDraftSubmissionSnapshot({
    projectId: "repo",
    productMode: "agent",
    conversationId: null,
    clientRequestId: "request-original",
    draftRevision: "draft-1",
    text: "restored",
    contextRefs: [fileRef("src/restored.ts")],
    attachments: [attachment("existing")],
    skillOverrides: { restored: true },
    providerId: "codex",
    agentTurnMode: "plan",
    modelId: "gpt-next",
    reasoningEffort: "high",
    ...overrides,
  });
}

function draftHarness(initial: ConversationDraftViewModel) {
  const harness = {
    state: initial,
    dirtyCount: 0,
    port: undefined as never,
  };
  harness.port = {
    read: () => harness.state,
    setText: (update: (current: string) => string) => { harness.state.text = update(harness.state.text); },
    setContextRefs: (update: (current: TopicFileReference[]) => TopicFileReference[]) => {
      harness.state.contextRefs = update(harness.state.contextRefs);
    },
    setAttachments: (update: (current: TopicAttachment[]) => TopicAttachment[]) => {
      harness.state.attachments = update(harness.state.attachments);
    },
    setSkillOverrides: (update: (current: Record<string, boolean>) => Record<string, boolean>) => {
      harness.state.skillOverrides = update(harness.state.skillOverrides);
    },
    setAgentTurnMode: (value: ConversationDraftViewModel["agentTurnMode"]) => { harness.state.agentTurnMode = value; },
    setModelId: (value: string | null) => { harness.state.modelId = value; },
    setReasoningEffort: (value: string | null) => { harness.state.reasoningEffort = value; },
    markDirty: () => { harness.dirtyCount += 1; },
  };
  return harness;
}

function fileRef(relativePath: string): TopicFileReference {
  return { relativePath, name: relativePath.split("/").at(-1)!, kind: "file", source: "composer" };
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
    createdAt: "2026-09-08T00:00:00.000Z",
    storagePath: `attachments/${id}/content.txt`,
    runtimeMode: "bounded-text-preview",
  };
}
