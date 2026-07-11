import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchChangeCloseOutbox } from "../../src/agent-task/close-outbox-dispatcher.js";
import { closeChangeForChange, createChange, recoverChangeCloseTransactions } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("Change close outbox dispatcher", () => {
  let root: string | undefined;
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it("creates deterministic per-Change tasks and one task for each fixed five-sequence window", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-close-dispatch-"));
    const memory = repoLocalMemory(root, "project-1");
    await Promise.all([5, 1, 3, 2, 4].map((sequence) => writeEvent(root!, sequence)));

    const first = await dispatchChangeCloseOutbox(memory);
    const second = await dispatchChangeCloseOutbox(memory);

    expect(first.map((result) => result.closeSequence)).toEqual([1, 2, 3, 4, 5]);
    expect(first.map((result) => result.closeoutTask.id)).toEqual(second.map((result) => result.closeoutTask.id));
    expect(first.filter((result) => result.evolutionTask)).toHaveLength(1);
    expect(first[4].evolutionTask).toMatchObject({
      conversationId: "evolution:1-5", changeId: "evolution-window-1-5", kind: "background", createdBy: "maintenance-policy",
    });
    expect(first[4].evolutionTask?.inputArtifacts).toContain("close-window:1-5");
    expect(first[4].evolutionTask?.summary).toContain("Canonical memory application is not authorized");
  });

  it("fills a missing evolution step without replacing the already-created closeout task", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-close-retry-"));
    const memory = repoLocalMemory(root, "project-1");
    await Promise.all([1, 2, 3, 4, 5].map((sequence) => writeEvent(root!, sequence)));
    const first = (await dispatchChangeCloseOutbox(memory))[4];
    const closeoutPath = join(memory.workbenchRoot, "agent-tasks", "tasks", first.closeoutTask.id, "task.json");
    const before = await readFile(closeoutPath, "utf8");
    await rm(join(memory.workbenchRoot, "agent-tasks", "tasks", first.evolutionTask!.id), { recursive: true, force: true });

    const retried = (await dispatchChangeCloseOutbox(memory))[4];

    expect(await readFile(closeoutPath, "utf8")).toBe(before);
    expect(retried.closeoutTask.id).toBe(first.closeoutTask.id);
    expect(retried.evolutionTask?.id).toBe(first.evolutionTask?.id);
  });

  it("persists one monotonic sequence in the close transaction, receipt, and outbox", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-close-sequence-"));
    const managed = project(root);
    await initHarness(managed);
    for (const changeId of ["first-close", "second-close"]) {
      await createChange(managed, { title: changeId });
      await writeFile(join(root, "harness", "changes", "active", changeId, "reviews", "review.md"), "Status: approved\n", "utf8");
      const closed = await closeChangeForChange(managed, changeId);
      const transaction = JSON.parse(await readFile(join(root, "harness", "changes", ".close-transactions", `${changeId}.json`), "utf8"));
      const receipt = JSON.parse(await readFile(join(root, closed.receiptPath), "utf8"));
      const outbox = JSON.parse(await readFile(transaction.outboxPath, "utf8"));
      const expected = changeId === "first-close" ? 1 : 2;
      expect([transaction.closeSequence, receipt.closeSequence, outbox.closeSequence]).toEqual([expected, expected, expected]);
    }
  });

  it("does not create maintenance work for an explicitly non-development close", async () => {
    root = await mkdtemp(join(tmpdir(), "aho-close-non-development-"));
    const managed = project(root);
    const memory = repoLocalMemory(root, "project-1");
    await initHarness(managed);
    const created = await createChange(managed, { title: "maintenance task", maintenanceSequenceEligible: false });
    await writeFile(join(root, "harness", "changes", "active", created.change.id, "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChangeForChange(managed, created.change.id);
    await recoverChangeCloseTransactions(managed);
    await expect(dispatchChangeCloseOutbox(memory)).resolves.toEqual([]);
  });
});

function project(path: string): ManagedProject {
  return { id: "project-1", name: "Project", path, addedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
}

async function writeEvent(root: string, closeSequence: number, advancesMaintenanceSequence = true): Promise<void> {
  const directory = join(root, "outbox", "change-close");
  await mkdir(directory, { recursive: true });
  const changeId = `change-${closeSequence}`;
  await writeFile(join(directory, `close-${closeSequence}.json`), `${JSON.stringify({
    version: "1.0", id: `change-close:close-${closeSequence}`, type: "change.closed", projectId: "project-1",
    changeId, archivePath: `harness/changes/archive/${changeId}`, receiptPath: `harness/changes/archive/${changeId}/close-receipt.json`,
    occurredAt: `2026-07-11T00:00:0${closeSequence}.000Z`, closeSequence, advancesMaintenanceSequence,
  }, null, 2)}\n`, "utf8");
}
