import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listProjectFileChildren,
  readProjectFilePreview,
  renderTopicFileReferencesForPrompt,
  resolveTopicFileReferences,
  searchProjectFiles,
} from "../../src/workbench/file-references.js";
import type { ManagedProject } from "../../src/types/index.js";

let root: string;
let outsideRoot: string;

function project(): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path: root,
    addedAt: "2026-06-27T00:00:00.000Z",
    lastSeenAt: "2026-06-27T00:00:00.000Z",
  };
}

describe("Workbench file references", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aho-file-refs-"));
    outsideRoot = await mkdtemp(join(tmpdir(), "aho-file-refs-outside-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(join(root, ".agent-harness"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "src", "pricing.ts"), "export const price = 1;\n", "utf8");
    await writeFile(join(root, "src", "notes.md"), "# Notes\n", "utf8");
    await writeFile(join(root, "node_modules", "pkg", "index.js"), "module.exports = 1;\n", "utf8");
    await writeFile(join(root, ".git", "config"), "[core]\n", "utf8");
    await writeFile(join(root, ".agent-harness", "project.json"), "{}", "utf8");
    await writeFile(join(root, "dist", "bundle.js"), "console.log(1);\n", "utf8");
    await writeFile(join(root, "large.bin"), Buffer.alloc(5 * 1024 * 1024 + 1));
    await writeFile(join(outsideRoot, "outside.ts"), "export const outside = true;\n", "utf8");

    try {
      await symlink(join(root, "src"), join(root, "linked-src"), "junction");
    } catch {
      // Symlink creation can be unavailable on locked-down Windows hosts.
    }
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  });

  it("searches only safe files and directories inside the selected project", async () => {
    const results = await searchProjectFiles(project(), { query: "src", limit: 20 });
    const paths = results.map((result) => result.relativePath);

    expect(paths).toContain("src");
    expect(paths).toContain("src/pricing.ts");
    expect(paths).not.toContain("node_modules/pkg/index.js");
    expect(paths).not.toContain(".git/config");
    expect(paths).not.toContain(".agent-harness/project.json");
    expect(paths).not.toContain("dist/bundle.js");
    expect(paths).not.toContain("large.bin");
    if (existsSync(join(root, "linked-src"))) {
      expect(paths.some((path) => path.startsWith("linked-src"))).toBe(false);
    }
  });

  it("lists safe file tree children for the right tool rail", async () => {
    const rootChildren = await listProjectFileChildren(project());
    const rootPaths = rootChildren.entries.map((entry) => entry.relativePath);

    expect(rootChildren.path).toBe("");
    expect(rootChildren.parentPath).toBeNull();
    expect(rootPaths).toContain("src");
    expect(rootPaths).not.toContain("node_modules");
    expect(rootPaths).not.toContain(".git");
    expect(rootPaths).not.toContain(".agent-harness");
    expect(rootPaths).not.toContain("dist");
    expect(rootPaths).not.toContain("large.bin");

    const srcChildren = await listProjectFileChildren(project(), "src");
    expect(srcChildren.parentPath).toBe("");
    expect(srcChildren.entries).toContainEqual(expect.objectContaining({ relativePath: "src/pricing.ts", kind: "file" }));
  });

  it("previews text files without allowing unsafe paths or large files", async () => {
    const textPreview = await readProjectFilePreview(project(), "src/pricing.ts");

    expect(textPreview).toMatchObject({
      path: "src/pricing.ts",
      kind: "file",
      status: "text",
      content: "export const price = 1;\n",
    });

    const largePreview = await readProjectFilePreview(project(), "large.bin");
    expect(largePreview.status).toBe("too-large");

    const unsafePreview = await readProjectFilePreview(project(), "../outside.ts");
    expect(unsafePreview.status).toBe("not-found");
  });

  it("resolves selected and handwritten @file references without swallowing unknown tokens", async () => {
    const resolved = await resolveTopicFileReferences(project(), "请查看 @src/pricing.ts 和 @../outside.ts", [
      { relativePath: "src/pricing.ts", name: "pricing.ts", kind: "file", extension: ".ts", size: 1 },
    ]);

    expect(resolved.text).toBe("请查看 和 @../outside.ts");
    expect(resolved.contextRefs).toEqual([
      expect.objectContaining({ relativePath: "src/pricing.ts", name: "pricing.ts", kind: "file" }),
    ]);
  });

  it("renders referenced paths as runtime context without injecting file contents", () => {
    const prompt = renderTopicFileReferencesForPrompt([
      { relativePath: "src/pricing.ts", name: "pricing.ts", kind: "file", extension: ".ts", size: 24 },
    ]).join("\n");

    expect(prompt).toContain("User Referenced Project Files");
    expect(prompt).toContain("file: src/pricing.ts");
    expect(prompt).not.toContain("export const price");
    expect(prompt).toContain("runtime context only");
  });
});
