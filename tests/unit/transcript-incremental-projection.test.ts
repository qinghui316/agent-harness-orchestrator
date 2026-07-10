import { describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { getWorkbenchProjection } from "../../src/server/workbench/projections.js";
import { appendConversationThreadEntry } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, getWorkbenchTranscriptProjection } from "../../src/workbench/manager.js";
import { decodeTopicThreadCursor, encodeTopicThreadCursor } from "../../src/workbench/conversation-thread-log.js";
import { getTempDir, project } from "./workbench/fixtures.js";
import type { ParentAgentTranscript } from "../../src/workbench/parent-agent-transcript.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";

describe("incremental Workbench transcript projection", () => {
  it("returns latest and earlier transcript pages from the SQLite message store", async () => {
    const repo = project(getTempDir());
    await initHarness(repo);
    const topic = await createConversationChangeFixture(repo, { title: "Long transcript", body: "message 0" });
    await appendMessages(repo, topic.changeId, 1, 10);

    const latestProjection = await getWorkbenchProjection(
      { project: repo, path: repo.path },
      `transcript/${encodeURIComponent(topic.conversationId)}`,
      new URLSearchParams("limit=4"),
    ) as ParentAgentTranscript;
    expect(latestProjection.cells.map((cell) => cell.text)).toEqual(["message 7", "message 8", "message 9", "message 10"]);
    expect(latestProjection.paging).toMatchObject({
      limit: 4,
      totalCount: 11,
      hasMoreBefore: true,
    });

    const earlierProjection = await getWorkbenchProjection(
      { project: repo, path: repo.path },
      `transcript/${encodeURIComponent(topic.conversationId)}`,
      new URLSearchParams(`limit=4&beforeCursor=${encodeURIComponent(latestProjection.paging?.nextBeforeCursor ?? "")}`),
    ) as ParentAgentTranscript;
    expect(earlierProjection.cells.map((cell) => cell.text)).toEqual(["message 3", "message 4", "message 5", "message 6"]);
  });

  it("fails closed for invalid transcript cursors", async () => {
    const repo = project(getTempDir());
    await initHarness(repo);
    const topic = await createConversationChangeFixture(repo, { title: "Long transcript", body: "message 0" });

    expect(() => decodeTopicThreadCursor("cell:user:legacy")).toThrow("Invalid transcript cursor.");
    await expect(getWorkbenchProjection(
      { project: repo, path: repo.path },
      `transcript/${encodeURIComponent(topic.conversationId)}`,
      new URLSearchParams("limit=4&beforeCursor=cell%3Auser%3Alegacy"),
    )).rejects.toMatchObject({ name: "BadRequest" });
    await expect(getWorkbenchProjection(
      { project: repo, path: repo.path },
      `transcript/${encodeURIComponent(topic.conversationId)}`,
      new URLSearchParams(`limit=4&beforeCursor=${encodeURIComponent(encodeTopicThreadCursor(999))}`),
    )).rejects.toMatchObject({ name: "BadRequest" });
  });

  it("keeps full transcript compatibility while the snapshot returns a transcript shell", async () => {
    const repo = project(getTempDir());
    await initHarness(repo);
    const topic = await createConversationChangeFixture(repo, { title: "Long transcript", body: "message 0" });
    await appendMessages(repo, topic.changeId, 1, 6);

    const full = await getWorkbenchTranscriptProjection({ project: repo, path: repo.path }, topic.conversationId);
    expect(full.cells.map((cell) => cell.text)).toEqual([
      "message 0",
      "message 1",
      "message 2",
      "message 3",
      "message 4",
      "message 5",
      "message 6",
    ]);
    expect(full.paging).toBeUndefined();

    const snapshot = await getWorkbenchSnapshot({ project: repo, path: repo.path }, { topicId: topic.conversationId });
    expect(snapshot.center.parentAgentTranscript.cells).toEqual([]);
    expect(snapshot.center.parentAgentTranscript.emptyMessage).toBeTruthy();
  });
});

async function appendMessages(repo: ReturnType<typeof project>, changeId: string, start: number, endInclusive: number): Promise<void> {
  for (let index = start; index <= endInclusive; index += 1) {
    await appendConversationThreadEntry(repo, changeId, {
      type: "user.message",
      text: `message ${index}`,
    });
  }
}
