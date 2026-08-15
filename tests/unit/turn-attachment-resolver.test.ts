import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTopicAttachment } from "../../src/workbench/attachments.js";
import { TurnAttachmentResolver } from "../../src/workbench/turn-attachment-resolver.js";
import type { ManagedProject } from "../../src/types/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("TurnAttachmentResolver", () => {
  it("resolves stable managed image/file inputs without exposing text bodies", async () => {
    const fixture = await createFixture();
    const text = await createTopicAttachment(fixture.project, {
      fileName: "marker.txt",
      mediaType: "text/plain",
      data: Buffer.from("PRIVATE_MARKER_CONTENT").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    const image = await createTopicAttachment(fixture.project, {
      fileName: "pixel.png",
      mediaType: "image/png",
      data: Buffer.from("png-bytes").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });

    expect(text.runtimeMode).toBe("provider-file-reference");
    const resolution = await fixture.resolver.resolve(fixture.project, [text, image, text]);
    expect(resolution.attachmentIds).toEqual([image.id, text.id].sort());
    expect(resolution.imageInputs).toEqual([expect.objectContaining({ id: image.id, source: "managed-attachment" })]);
    expect(resolution.fileInputs).toEqual([expect.objectContaining({ id: text.id, name: "marker.txt", source: "managed-attachment" })]);
    expect(JSON.stringify(resolution.evidence)).not.toContain("PRIVATE_MARKER_CONTENT");
    expect(Object.isFrozen(resolution)).toBe(true);
    expect((await fixture.resolver.resolve(fixture.project, [image, text])).handoffHash).toBe(resolution.handoffHash);
  });

  it("reads legacy bounded-preview metadata and promotes it to a provider file reference", async () => {
    const fixture = await createFixture();
    const text = await createTopicAttachment(fixture.project, {
      fileName: "legacy.md",
      mediaType: "text/markdown",
      data: Buffer.from("legacy").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    const metadataPath = join(fixture.workbenchRoot, "attachments", text.id, "attachment.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    await writeFile(metadataPath, `${JSON.stringify({ ...metadata, runtimeMode: "bounded-text-preview" }, null, 2)}\n`, "utf8");

    const stored = await fixture.resolver.resolveMetadata(fixture.project, [text.id]);
    expect(stored[0]?.runtimeMode).toBe("bounded-text-preview");
    const resolution = await fixture.resolver.resolve(fixture.project, stored);
    expect(resolution.evidence[0]?.runtimeMode).toBe("provider-file-reference");
  });

  it("fails revalidation after content replacement", async () => {
    const fixture = await createFixture();
    const text = await createTopicAttachment(fixture.project, {
      fileName: "marker.txt",
      mediaType: "text/plain",
      data: Buffer.from("before").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    const resolution = await fixture.resolver.resolve(fixture.project, [text]);
    await writeFile(resolution.fileInputs[0]!.path, "after!", "utf8");
    await expect(fixture.resolver.revalidate(fixture.project, resolution)).rejects.toMatchObject({ name: "Conflict" });
  });

  it("fails closed when managed metadata escapes the Workbench root", async () => {
    const fixture = await createFixture();
    const text = await createTopicAttachment(fixture.project, {
      fileName: "marker.txt",
      mediaType: "text/plain",
      data: Buffer.from("marker").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    await expect(fixture.resolver.resolve(fixture.project, [{ ...text, storagePath: "../outside.txt" }]))
      .rejects.toMatchObject({ name: "BadRequest" });
  });

  it("returns the canonical managed path instead of a lexical link path", async () => {
    const fixture = await createFixture();
    const text = await createTopicAttachment(fixture.project, {
      fileName: "marker.txt",
      mediaType: "text/plain",
      data: Buffer.from("marker").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    const managedDirectory = join(fixture.workbenchRoot, "attachments", text.id);
    const canonicalDirectory = join(fixture.workbenchRoot, "attachments", `${text.id}-canonical`);
    await mkdir(canonicalDirectory);
    await writeFile(join(canonicalDirectory, "content.txt"), "marker", "utf8");
    await rm(managedDirectory, { recursive: true, force: true });
    await symlink(canonicalDirectory, managedDirectory, process.platform === "win32" ? "junction" : "dir");

    const resolution = await fixture.resolver.resolve(fixture.project, [text]);
    expect(resolution.fileInputs[0]?.path).toBe(await realpath(join(canonicalDirectory, "content.txt")));
  });

  it("fails closed when metadata points at another attachment directory", async () => {
    const fixture = await createFixture();
    const first = await createTopicAttachment(fixture.project, {
      fileName: "first.txt",
      mediaType: "text/plain",
      data: Buffer.from("first").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    const second = await createTopicAttachment(fixture.project, {
      fileName: "second.txt",
      mediaType: "text/plain",
      data: Buffer.from("second").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });

    await expect(fixture.resolver.resolve(fixture.project, [{ ...first, storagePath: second.storagePath }]))
      .rejects.toMatchObject({ name: "BadRequest" });
  });

  it("fails closed when the managed attachment directory resolves through a link", async () => {
    const fixture = await createFixture();
    const text = await createTopicAttachment(fixture.project, {
      fileName: "marker.txt",
      mediaType: "text/plain",
      data: Buffer.from("marker").toString("base64"),
    }, { workbenchRoot: fixture.workbenchRoot });
    const managedDirectory = join(fixture.workbenchRoot, "attachments", text.id);
    const escapedDirectory = join(fixture.workbenchRoot, "escaped-attachment");
    await mkdir(escapedDirectory);
    await writeFile(join(escapedDirectory, "content.txt"), "marker", "utf8");
    await rm(managedDirectory, { recursive: true, force: true });
    await symlink(escapedDirectory, managedDirectory, process.platform === "win32" ? "junction" : "dir");

    await expect(fixture.resolver.resolve(fixture.project, [text]))
      .rejects.toMatchObject({ name: "BadRequest" });
  });
});

async function createFixture() {
  const workbenchRoot = await mkdtemp(join(tmpdir(), "aho-attachment-resolver-"));
  roots.push(workbenchRoot);
  const project: ManagedProject = {
    id: "attachment-project",
    name: "Attachment Project",
    path: join(workbenchRoot, "project"),
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  const resolver = new TurnAttachmentResolver({
    resolveRuntimePaths: () => ({ projectId: project.id, workbenchRoot } as never),
  });
  return { workbenchRoot, project, resolver };
}
