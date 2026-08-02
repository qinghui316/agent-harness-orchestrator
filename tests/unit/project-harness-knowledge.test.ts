import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkProjectKnowledge,
  parseProjectKnowledgeFrontmatter,
  readProjectKnowledgeCatalogEntries,
  reindexProjectKnowledge,
  renderProjectKnowledgeCatalog,
  scanProjectKnowledge,
  type ProjectKnowledgeContext,
} from "../../src/project-harness/knowledge.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness knowledge", () => {
  it("parses the quoted block-list frontmatter emitted by project Harness renderers", () => {
    const metadata = parseProjectKnowledgeFrontmatter([
      "---",
      "ecl:",
      '  id: "quoted-owner-map"',
      '  layer: "L2"',
      '  kind: "current"',
      '  status: "implemented"',
      '  owner: "project-profile"',
      "  modules:",
      '    - "project-kernel"',
      "  evidence:",
      '    - "src/project/runtime.ts::ProjectRuntime"',
      "  managed_by: renderer",
      "---",
      "",
    ].join("\n"), "quoted.md");
    expect(metadata).toEqual({
      id: "quoted-owner-map",
      layer: "L2",
      kind: "current",
      status: "implemented",
      owner: "project-profile",
      modules: ["project-kernel"],
      evidence: ["src/project/runtime.ts::ProjectRuntime"],
      managedBy: "renderer",
    });
  });

  it("reindexes open Markdown knowledge into a deterministic catalog and structured baseline", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.projectRoot, "src", "current.ts"), "export const current = true;\n", "utf8");
    await writeKnowledge(fixture, "overview.md", {
      id: "overview",
      layer: "L1",
      kind: "current",
      status: "implemented",
      owner: "project-profile",
      modules: [],
      evidence: ["src/current.ts"],
    }, "BODY_SENTINEL_MUST_NOT_ENTER_CATALOG");
    await writeKnowledge(fixture, "targets/runtime.md", {
      id: "runtime-target",
      layer: "L2",
      kind: "target",
      status: "accepted",
      owner: "runtime-architecture",
      modules: ["runtime"],
      evidence: ["user:accepted runtime target"],
    });
    await writeKnowledge(fixture, "decisions/identity.md", {
      id: "identity-decision",
      layer: "L2",
      kind: "decision",
      status: "accepted",
      owner: "project-identity",
      modules: ["runtime"],
      evidence: ["contract:project-id"],
    });
    await writeKnowledge(fixture, "guides/operations.md", {
      id: "operations-guide",
      layer: "L3",
      kind: "guide",
      status: "implemented",
      owner: "runtime-operations",
      modules: ["runtime"],
      evidence: ["https://example.test/runtime-contract"],
    });

    const result = await reindexProjectKnowledge(fixture.context);
    expect(result).toMatchObject({ healthy: true, checkedDocuments: 4, checkedSources: 1 });
    const catalogPath = join(fixture.wikiRoot, "catalog.md");
    const baselinePath = join(fixture.wikiRoot, ".ecl-baselines.json");
    const firstCatalog = await readFile(catalogPath, "utf8");
    const firstBaseline = await readFile(baselinePath, "utf8");
    expect(firstCatalog).toContain("[overview](overview.md)");
    expect(firstCatalog).toContain("[runtime-target](targets/runtime.md)");
    expect(firstCatalog).not.toContain("BODY_SENTINEL_MUST_NOT_ENTER_CATALOG");
    const baseline = JSON.parse(firstBaseline) as {
      schema_version: string;
      project_id: string;
      documents: Record<string, { path: string; content_fingerprint: string; source_fingerprints: Record<string, string> }>;
    };
    expect(baseline.schema_version).toBe("1.0");
    expect(baseline.project_id).toBe("sample-a1");
    expect(baseline.documents.overview.path).toBe("overview.md");
    expect(baseline.documents.overview.content_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(baseline.documents.overview.source_fingerprints["src/current.ts"]).toMatch(/^[a-f0-9]{64}$/);
    await expect(readFile(join(fixture.wikiRoot, "index.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    await reindexProjectKnowledge(fixture.context);
    expect(await readFile(catalogPath, "utf8")).toBe(firstCatalog);
    expect(await readFile(baselinePath, "utf8")).toBe(firstBaseline);
    expect((await checkProjectKnowledge(fixture.context)).healthy).toBe(true);
  });

  it("keeps scan and check read-only while reporting document, source, and catalog drift", async () => {
    const fixture = await createFixture();
    const sourcePath = join(fixture.projectRoot, "src", "owner.ts");
    await writeFile(sourcePath, "export const version = 1;\n", "utf8");
    const documentPath = await writeKnowledge(fixture, "modules/owner.md", {
      id: "owner-module",
      layer: "L2",
      kind: "current",
      status: "implemented",
      owner: "owner-module",
      modules: ["owner-module"],
      evidence: ["src/owner.ts"],
    });
    await reindexProjectKnowledge(fixture.context);
    const catalogPath = join(fixture.wikiRoot, "catalog.md");
    const baselinePath = join(fixture.wikiRoot, ".ecl-baselines.json");
    const catalogBefore = await readFile(catalogPath, "utf8");
    const baselineBefore = await readFile(baselinePath, "utf8");

    await writeFile(documentPath, `${await readFile(documentPath, "utf8")}\nchanged body\n`, "utf8");
    await writeFile(sourcePath, "export const version = 2;\n", "utf8");
    await writeFile(catalogPath, `${catalogBefore}\nstale generated edit\n`, "utf8");
    const scan = await scanProjectKnowledge(fixture.context);
    const check = await checkProjectKnowledge(fixture.context);
    expect(scan.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining([
      "stale-content-fingerprint",
      "stale-source-fingerprint",
    ]));
    expect(check.findings.map((finding) => finding.type)).toContain("catalog-drift");
    expect(await readFile(catalogPath, "utf8")).toBe(`${catalogBefore}\nstale generated edit\n`);
    expect(await readFile(baselinePath, "utf8")).toBe(baselineBefore);
  });

  it("rejects duplicate ids and invalid layer, kind, status, and owner metadata", async () => {
    const fixture = await createFixture();
    await writeKnowledge(fixture, "one.md", {
      id: "duplicate",
      layer: "L1",
      kind: "current",
      status: "implemented",
      owner: "valid-owner",
      modules: [],
      evidence: [],
    });
    await writeKnowledge(fixture, "two.md", {
      id: "duplicate",
      layer: "L2",
      kind: "target",
      status: "accepted",
      owner: "valid-owner",
      modules: [],
      evidence: [],
    });
    await writeFile(join(fixture.wikiRoot, "invalid-layer.md"), frontmatter({
      id: "invalid-layer", layer: "L4", kind: "current", status: "implemented", owner: "owner", modules: [], evidence: [],
    }), "utf8");
    await writeFile(join(fixture.wikiRoot, "invalid-kind.md"), frontmatter({
      id: "invalid-kind", layer: "L2", kind: "history", status: "implemented", owner: "owner", modules: [], evidence: [],
    }), "utf8");
    await writeFile(join(fixture.wikiRoot, "invalid-status.md"), frontmatter({
      id: "invalid-status", layer: "L2", kind: "target", status: "maybe", owner: "owner", modules: [], evidence: [],
    }), "utf8");
    await writeFile(join(fixture.wikiRoot, "invalid-owner.md"), frontmatter({
      id: "invalid-owner", layer: "L2", kind: "guide", status: "accepted", owner: "bad owner/path", modules: [], evidence: [],
    }), "utf8");

    const metadata = await readProjectKnowledgeCatalogEntries(fixture.context);
    expect(metadata.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining([
      "duplicate-id",
      "invalid-frontmatter",
    ]));
    expect(metadata.findings.filter((finding) => finding.type === "invalid-frontmatter")).toHaveLength(4);
    await expect(reindexProjectKnowledge(fixture.context)).rejects.toThrow(/cannot be reindexed/);
  });

  it("fails closed on machine absolute paths and evidence path escape", async () => {
    const fixture = await createFixture();
    await writeKnowledge(fixture, "absolute.md", {
      id: "absolute-path",
      layer: "L2",
      kind: "current",
      status: "implemented",
      owner: "path-owner",
      modules: [],
      evidence: ["C:/Users/example/private.ts"],
    });
    await writeKnowledge(fixture, "escape.md", {
      id: "path-escape",
      layer: "L2",
      kind: "current",
      status: "implemented",
      owner: "path-owner",
      modules: [],
      evidence: ["../outside.ts"],
    });
    await writeKnowledge(fixture, "body-absolute.md", {
      id: "body-absolute",
      layer: "L3",
      kind: "guide",
      status: "implemented",
      owner: "path-owner",
      modules: [],
      evidence: [],
    }, "Do not persist /home/example/private.txt in project knowledge.");

    const report = await scanProjectKnowledge(fixture.context);
    expect(report.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining([
      "absolute-path",
      "path-escape",
    ]));
    expect(report.findings.filter((finding) => finding.type === "absolute-path")).toHaveLength(2);
    await expect(reindexProjectKnowledge(fixture.context)).rejects.toThrow(/cannot be reindexed/);
  });

  it("renders catalog content only from supplied frontmatter metadata", async () => {
    const fixture = await createFixture();
    await writeKnowledge(fixture, "guide.md", {
      id: "catalog-contract",
      layer: "L3",
      kind: "guide",
      status: "accepted",
      owner: "knowledge-owner",
      modules: ["knowledge"],
      evidence: ["user:accepted catalog contract"],
    }, "UNRELATED_BODY_SENTINEL");
    const result = await readProjectKnowledgeCatalogEntries(fixture.context);
    const catalog = renderProjectKnowledgeCatalog(result.entries);
    expect(catalog).toContain("catalog-contract");
    expect(catalog).not.toContain("UNRELATED_BODY_SENTINEL");
  });
});

async function createFixture(): Promise<{
  root: string;
  projectRoot: string;
  skillRoot: string;
  wikiRoot: string;
  context: ProjectKnowledgeContext;
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-project-knowledge-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const skillRoot = join(root, "skill");
  const wikiRoot = join(skillRoot, "references", "project_wiki");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await mkdir(wikiRoot, { recursive: true });
  return {
    root,
    projectRoot,
    skillRoot,
    wikiRoot,
    context: { projectId: "sample-a1", projectRoot, skillRoot },
  };
}

interface KnowledgeFixtureMetadata {
  id: string;
  layer: string;
  kind: string;
  status: string;
  owner: string;
  modules: string[];
  evidence: string[];
}

async function writeKnowledge(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  relativePath: string,
  metadata: KnowledgeFixtureMetadata,
  body = "Current source-backed knowledge.",
): Promise<string> {
  const path = join(fixture.wikiRoot, ...relativePath.split("/"));
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${frontmatter(metadata)}\n${body}\n`, "utf8");
  return path;
}

function frontmatter(metadata: KnowledgeFixtureMetadata): string {
  return [
    "---",
    "ecl:",
    `  id: ${metadata.id}`,
    `  layer: ${metadata.layer}`,
    `  kind: ${metadata.kind}`,
    `  status: ${metadata.status}`,
    `  owner: ${metadata.owner}`,
    `  modules: [${metadata.modules.join(", ")}]`,
    "  evidence:",
    ...metadata.evidence.map((evidence) => `    - ${evidence}`),
    "---",
    "",
  ].join("\n");
}
