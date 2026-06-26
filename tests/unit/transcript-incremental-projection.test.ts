import { describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { getWorkbenchProjection } from "../../src/server/workbench/projections.js";
import { appendTopicThreadEntry, createWorkbenchTopic } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, getWorkbenchTranscriptProjection } from "../../src/workbench/manager.js";
import { decodeTopicThreadCursor, encodeTopicThreadCursor, readTopicThreadLogPage } from "../../src/workbench/thread-log.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { getTempDir, project } from "./workbench/fixtures.js";
import type { ParentAgentTranscript } from "../../src/workbench/parent-agent-transcript.js";

describe("incremental Workbench transcript projection", () => {
  it("returns latest and earlier transcript pages from the SQLite message store", async () => {
    const repo = project(getTempDir());
    await initHarness(repo);
    const topic = await createWorkbenchTopic(repo, { title: "Long transcript", body: "message 0" });
    await appendMessages(repo, topic.changeId, 1, 10);

    const memory = await resolveProjectMemory(repo);
    const latestLogPage = await readTopicThreadLogPage(memory, `harness/changes/active/${topic.changeId}`, { limit: 4 });
    expect(latestLogPage.entries.map((entry) => entry.text)).toEqual(["message 7", "message 8", "message 9", "message 10"]);
    expect(latestLogPage.totalCount).toBe(11);
    expect(latestLogPage.hasMoreBefore).toBe(true);
    expect(latestLogPage.nextBeforeCursor).toBeTruthy();

    const earlierLogPage = await readTopicThreadLogPage(memory, `harness/changes/active/${topic.changeId}`, {
      limit: 4,
      beforeCursor: latestLogPage.nextBeforeCursor,
    });
    expect(earlierLogPage.entries.map((entry) => entry.text)).toEqual(["message 3", "message 4", "message 5", "message 6"]);

    const latestProjection = await getWorkbenchProjection(
      { project: repo, path: repo.path },
      `transcript/${encodeURIComponent(topic.changeId)}`,
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
      `transcript/${encodeURIComponent(topic.changeId)}`,
      new URLSearchParams(`limit=4&beforeCursor=${encodeURIComponent(latestProjection.paging?.nextBeforeCursor ?? "")}`),
    ) as ParentAgentTranscript;
    expect(earlierProjection.cells.map((cell) => cell.text)).toEqual(["message 3", "message 4", "message 5", "message 6"]);
  });

  it("fails closed for invalid transcript cursors", async () => {
    const repo = project(getTempDir());
    await initHarness(repo);
    const topic = await createWorkbenchTopic(repo, { title: "Long transcript", body: "message 0" });

    expect(() => decodeTopicThreadCursor("cell:user:legacy")).toThrow("Invalid transcript cursor.");
    await expect(getWorkbenchProjection(
      { project: repo, path: repo.path },
      `transcript/${encodeURIComponent(topic.changeId)}`,
      new URLSearchParams("limit=4&beforeCursor=cell%3Auser%3Alegacy"),
    )).rejects.toMatchObject({ name: "BadRequest" });
    await expect(getWorkbenchProjection(
      { project: repo, path: repo.path },
      `transcript/${encodeURIComponent(topic.changeId)}`,
      new URLSearchParams(`limit=4&beforeCursor=${encodeURIComponent(encodeTopicThreadCursor(999))}`),
    )).rejects.toMatchObject({ name: "BadRequest" });
  });

  it("keeps full transcript compatibility while the snapshot returns a transcript shell", async () => {
    const repo = project(getTempDir());
    await initHarness(repo);
    const topic = await createWorkbenchTopic(repo, { title: "Long transcript", body: "message 0" });
    await appendMessages(repo, topic.changeId, 1, 6);

    const full = await getWorkbenchTranscriptProjection({ project: repo, path: repo.path }, topic.changeId);
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

    const snapshot = await getWorkbenchSnapshot({ project: repo, path: repo.path }, { topicId: topic.changeId });
    expect(snapshot.center.parentAgentTranscript.cells).toEqual([]);
    expect(snapshot.center.parentAgentTranscript.emptyMessage).toBeTruthy();
  });
});

async function appendMessages(repo: ReturnType<typeof project>, changeId: string, start: number, endInclusive: number): Promise<void> {
  for (let index = start; index <= endInclusive; index += 1) {
    await appendTopicThreadEntry(repo, changeId, {
      type: "user.message",
      text: `message ${index}`,
    });
  }
}
