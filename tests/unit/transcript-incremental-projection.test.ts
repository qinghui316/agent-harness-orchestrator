import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { appendCanonicalTimelineEntry } from "../../src/workbench/canonical-timeline-command.js";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import { getCanonicalTimelinePage } from "../../src/workbench/canonical-timeline-query.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";
import { getTempDir, project } from "./workbench/fixtures.js";

let originalAhoHome: string | undefined;

beforeEach(async () => {
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
  const repo = project(getTempDir());
  await createReadyProjectHarnessFixture({
    projectRoot: repo.path,
    ahoHome: process.env.AHO_HOME,
    projectId: repo.id,
    projectName: repo.name,
  });
});

afterEach(() => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
});

describe("incremental canonical Timeline delivery", () => {
  it("returns latest and earlier Timeline pages from the SQLite message store", async () => {
    const repo = project(getTempDir());
    const topic = await createConversationChangeFixture(repo, { title: "Long transcript", body: "message 0" });
    await appendMessages(repo, topic.changeId, 1, 10);

    const latestPage = await getCanonicalTimelinePage({ project: repo, path: repo.path }, topic.conversationId, "main-agent", { limit: 4 });
    expect(texts(latestPage)).toEqual(["message 7", "message 8", "message 9", "message 10"]);
    expect(latestPage.paging).toMatchObject({ limit: 4, totalCount: 11, hasMoreBefore: true });

    const earlierPage = await getCanonicalTimelinePage({ project: repo, path: repo.path }, topic.conversationId, "main-agent", {
      limit: 4,
      beforeCursor: latestPage.paging.nextBeforeCursor,
    });
    expect(texts(earlierPage)).toEqual(["message 3", "message 4", "message 5", "message 6"]);
  });

  it("fails closed for invalid Timeline cursors", async () => {
    const repo = project(getTempDir());
    const topic = await createConversationChangeFixture(repo, { title: "Long transcript", body: "message 0" });

    await expect(getCanonicalTimelinePage({ project: repo, path: repo.path }, topic.conversationId, "main-agent", {
      limit: 4,
      beforeCursor: "cell:user:legacy",
    })).rejects.toMatchObject({ name: "BadRequest" });
  });

  it("keeps the snapshot transcript-free while Timeline restores the full surface", async () => {
    const repo = project(getTempDir());
    const topic = await createConversationChangeFixture(repo, { title: "Long transcript", body: "message 0" });
    await appendMessages(repo, topic.changeId, 1, 6);

    const full = await getCanonicalTimelinePage({ project: repo, path: repo.path }, topic.conversationId, "main-agent");
    expect(texts(full)).toEqual(["message 0", "message 1", "message 2", "message 3", "message 4", "message 5", "message 6"]);

    const snapshot = await getWorkbenchSnapshot({ project: repo, path: repo.path }, { topicId: topic.conversationId });
    expect(snapshot.center).not.toHaveProperty("parentAgentTranscript");
  });
});

async function appendMessages(repo: ReturnType<typeof project>, changeId: string, start: number, endInclusive: number): Promise<void> {
  for (let index = start; index <= endInclusive; index += 1) {
    await appendCanonicalTimelineEntry(repo, changeId, { type: "user.message", text: `message ${index}` });
  }
}

function texts(page: Awaited<ReturnType<typeof getCanonicalTimelinePage>>): Array<string | undefined> {
  return [...page.pinned, ...page.entries].flatMap((envelope) => envelope.cells).map((cell) => cell.text);
}
