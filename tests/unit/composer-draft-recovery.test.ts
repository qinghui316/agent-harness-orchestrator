import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTopicAttachment } from "../../src/workbench/attachments.js";
import { ComposerDraftRecoveryService } from "../../src/workbench/composer-draft-recovery.js";
import { TurnAttachmentResolver } from "../../src/workbench/turn-attachment-resolver.js";
import type { StoredComposerDraft } from "../../src/workbench/persistence/contracts.js";
import type { ManagedProject } from "../../src/types/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ComposerDraftRecoveryService", () => {
  it("round-trips safe full snapshots and promotes legacy text attachments without private paths or bodies", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.project.path, "note.md"), "PROJECT_MARKER", "utf8");
    const attachment = await createTopicAttachment(fixture.project, {
      fileName: "private.txt",
      mediaType: "text/plain",
      data: Buffer.from("PRIVATE_ATTACHMENT_BODY").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });

    const write = await fixture.service.prepareWrite(fixture.project, {
      productMode: "agent",
      agentTurnMode: "plan",
      text: "unsent text",
      contextRefs: [{ relativePath: "note.md", name: "note.md", kind: "file", source: "composer" }],
      attachmentIds: [attachment.id],
      skillOverrides: { reviewer: true },
      selectedProviderId: "codex",
    }, "2026-08-21T00:00:00.000Z");
    const snapshot = await fixture.service.restore(fixture.project, stored(write));

    expect(snapshot).toMatchObject({
      productMode: "agent",
      agentTurnMode: "plan",
      text: "unsent text",
      contextRefs: [{ relativePath: "note.md", kind: "file" }],
      attachments: [{ id: attachment.id, runtimeMode: "provider-file-reference" }],
      skillOverrides: { reviewer: true },
      selectedProviderId: "codex",
      diagnostics: [],
    });
    const publicJson = JSON.stringify(snapshot);
    expect(publicJson).not.toContain(fixture.workbenchRoot);
    expect(publicJson).not.toContain("PRIVATE_ATTACHMENT_BODY");
  });

  it("drops corrupt, missing, and replaced evidence with bounded diagnostics", async () => {
    const fixture = await createFixture();
    const attachment = await createTopicAttachment(fixture.project, {
      fileName: "replace.txt",
      mediaType: "text/plain",
      data: Buffer.from("before").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    const resolution = await fixture.resolver.resolve(fixture.project, [attachment]);
    await writeFile(resolution.fileInputs[0]!.path, "after!", "utf8");
    const snapshot = await fixture.service.restore(fixture.project, {
      projectId: fixture.project.id,
      productMode: "agent",
      agentTurnMode: null,
      text: "keep text",
      contextRefsJson: "{broken",
      attachmentIdsJson: JSON.stringify([attachment.id, "missing-id"]),
      skillOverridesJson: "[]",
      selectedProviderId: "missing-provider",
      updatedAt: "2026-08-21T00:00:00.000Z",
    });

    expect(snapshot).toMatchObject({
      agentTurnMode: "default",
      text: "keep text",
      contextRefs: [],
      attachments: [],
      skillOverrides: {},
      selectedProviderId: "missing-provider",
    });
    expect(snapshot!.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "invalid-field",
      "unavailable-attachment",
      "unavailable-provider",
    ]));
    expect(JSON.stringify(snapshot!.diagnostics)).not.toContain(fixture.workbenchRoot);
  });

  it("rejects Harness turn-mode leakage and stale references before persistence", async () => {
    const fixture = await createFixture();
    await expect(fixture.service.prepareWrite(fixture.project, {
      productMode: "harness",
      agentTurnMode: "plan",
      text: "",
      contextRefs: [],
      attachmentIds: [],
      skillOverrides: {},
      selectedProviderId: null,
    }, "2026-08-21T00:00:00.000Z")).rejects.toMatchObject({ name: "Conflict" });
    await expect(fixture.service.prepareWrite(fixture.project, {
      productMode: "agent",
      agentTurnMode: "default",
      text: "",
      contextRefs: [{ relativePath: "../outside.txt", name: "outside.txt", kind: "file" }],
      attachmentIds: [],
      skillOverrides: {},
      selectedProviderId: "codex",
    }, "2026-08-21T00:00:00.000Z")).rejects.toMatchObject({ name: "BadRequest" });
  });

  it("keeps an unavailable provider id writable so later local edits remain durable", async () => {
    const fixture = await createFixture();
    const write = await fixture.service.prepareWrite(fixture.project, {
      productMode: "agent",
      agentTurnMode: "default",
      text: "edited while provider is unavailable",
      contextRefs: [],
      attachmentIds: [],
      skillOverrides: {},
      selectedProviderId: "removed-provider",
    }, "2026-08-21T00:00:00.000Z");
    const snapshot = await fixture.service.restore(fixture.project, stored(write));

    expect(snapshot).toMatchObject({
      text: "edited while provider is unavailable",
      selectedProviderId: "removed-provider",
      diagnostics: [expect.objectContaining({ code: "unavailable-provider" })],
    });
  });

  it("drops a restored reference that traverses a symlink segment", async () => {
    const fixture = await createFixture();
    const target = join(fixture.project.path, "target");
    await mkdir(target);
    await writeFile(join(target, "inside.txt"), "inside", "utf8");
    await symlink(target, join(fixture.project.path, "linked"), process.platform === "win32" ? "junction" : "dir");
    const snapshot = await fixture.service.restore(fixture.project, {
      projectId: fixture.project.id,
      productMode: "harness",
      agentTurnMode: null,
      text: "",
      contextRefsJson: JSON.stringify([{ relativePath: "linked/inside.txt", name: "inside.txt", kind: "file" }]),
      attachmentIdsJson: "[]",
      skillOverridesJson: "{}",
      selectedProviderId: null,
      updatedAt: "2026-08-21T00:00:00.000Z",
    });
    expect(snapshot?.contextRefs).toEqual([]);
    expect(snapshot?.diagnostics).toContainEqual(expect.objectContaining({ code: "unavailable-reference" }));
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "aho-composer-draft-"));
  roots.push(root);
  const project: ManagedProject = {
    id: "draft-project",
    name: "Draft Project",
    path: join(root, "project"),
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  const workbenchRoot = join(root, "workbench");
  await mkdir(project.path, { recursive: true });
  await mkdir(workbenchRoot, { recursive: true });
  const resolver = new TurnAttachmentResolver({
    resolveRuntimePaths: () => ({ projectId: project.id, workbenchRoot } as never),
  });
  const service = new ComposerDraftRecoveryService({
    attachmentResolver: resolver,
    providerRegistry: { list: () => [{ id: "codex" }] as never },
  });
  return { root, project, workbenchRoot, resolver, service };
}

function stored(write: {
  projectId: string;
  productMode: "agent" | "harness";
  agentTurnMode: "default" | "plan" | null;
  text: string;
  contextRefsJson: string;
  attachmentIdsJson: string;
  skillOverridesJson: string;
  selectedProviderId: string | null;
  updatedAt: string;
}): StoredComposerDraft {
  return write as StoredComposerDraft;
}
