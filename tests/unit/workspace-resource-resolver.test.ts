import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "../../src/project/git.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createHarnessWorkbenchConversation as createWorkbenchConversation } from "../helpers/conversation-change-fixture.js";
import { planDocumentContentHash } from "../../src/workbench/plan-documents.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { resolveWorkspaceResource } from "../../src/workbench/workspace-resources.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";

let root: string;
let originalAhoHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-workspace-resource-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "aho-test@example.invalid"]);
  await git(root, ["config", "user.name", "AHO Test"]);
  await writeFile(join(root, "package.json"), "{}\n", "utf8");
  await writeFile(join(root, "notes.md"), "# Notes\n\nProject document.\n", "utf8");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture"]);
  await createReadyProjectHarnessFixture({
    projectRoot: root,
    ahoHome: process.env.AHO_HOME!,
    projectId: project().id,
    projectName: project().name,
  });
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("workspace resource resolver", () => {
  it("resolves the exact canonical Plan item and stable project-file resource revisions", async () => {
    const conversation = await createWorkbenchConversation(project(), { body: "Plan it." }, undefined, { runMainAgent: false });
    const runtimePaths = resolveProjectRuntimePaths(project().id, process.env.AHO_HOME!);
    const store = await openProjectRuntimeWorkbenchDatabase(runtimePaths);
    const text = "# Plan\n\nUse the canonical item.";
    const sourceMessageId = "message-plan";
    const sourceCanonicalItemId = "prose:codex:attempt:thread:turn:item";
    const document = {
      documentId: "plan-document-1",
      documentKind: "plan" as const,
      title: "实现计划",
      sourceMessageId,
      sourceCanonicalItemId,
      proposalId: "proposal-1",
      proposalHash: "proposal-hash",
      proposalArtifact: "proposal.json",
      contentHash: planDocumentContentHash(text),
      agentSurfaceId: "agent:codex:thread:planner",
    };
    try {
      store.timeline.appendMessage({
        id: sourceMessageId,
        projectId: project().id,
        conversationId: conversation.conversationId,
        agentSurfaceId: document.agentSurfaceId,
        changeId: "",
        type: "assistant.message",
        timestamp: "2026-07-16T00:00:00.000Z",
        text: null,
        actionRunId: null,
        actionType: null,
        status: "completed",
        runId: "run-plan",
        providerId: "codex",
        threadId: "thread-plan",
        turnId: "turn-plan",
        itemId: null,
        artifact: "proposal.json",
        error: null,
        rawJson: JSON.stringify({
          id: sourceMessageId,
          type: "assistant.message",
          timestamp: "2026-07-16T00:00:00.000Z",
          conversationId: conversation.conversationId,
          graphScopeId: store.conversations.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId,
          changeId: "",
          runId: "run-plan",
          agentRoleId: "planning-agent",
          artifact: "proposal.json",
          document,
          blocks: [{
            id: sourceCanonicalItemId,
            providerId: "codex",
            attemptId: "attempt",
            threadId: "thread-plan",
            turnId: "turn-plan",
            itemId: "item",
            sequence: 1,
            kind: "prose",
            timestamp: "2026-07-16T00:00:00.000Z",
            source: "provider",
            text,
            document,
          }],
        }),
      });
    } finally {
      store.close();
    }

    const plan = await resolveWorkspaceResource({ project: project(), path: root }, { kind: "document", conversationId: conversation.conversationId, documentId: document.documentId });
    expect(plan).toMatchObject({ resourceId: document.documentId, kind: "plan", content: text, revision: document.contentHash, readOnly: true });

    const file = await resolveWorkspaceResource({ project: project(), path: root }, { kind: "project-file", relativePath: "notes.md" });
    expect(file).toMatchObject({ resourceId: "project-file:notes.md", kind: "markdown-file", content: "# Notes\n\nProject document.\n", readOnly: true });
  });
});

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-16T00:00:00.000Z", lastSeenAt: "2026-07-16T00:00:00.000Z" };
}
