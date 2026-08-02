import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadCompleteAnalysisBundle } from "../../src/project-harness/analysis-bundle.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("complete project Harness analysis bundle", () => {
  it("loads an evidence-backed four-file bundle and binds all artifact content", async () => {
    const fixture = await createFixture();
    const first = await loadCompleteAnalysisBundle({
      bundleRoot: fixture.bundle,
      projectRoot: fixture.project,
      projectId: "sample-a1",
      operation: "migrate",
    });
    const second = await loadCompleteAnalysisBundle({
      bundleRoot: fixture.bundle,
      projectRoot: fixture.project,
      projectId: "sample-a1",
      operation: "migrate",
    });
    expect(first.artifactPaths).toEqual(["references/guides/runtime.md"]);
    expect(first.sourcePaths).toEqual(["package.json", "src/index.ts", "tests/app.test.ts"]);
    expect(first.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.contentFingerprint).toBe(first.contentFingerprint);
  });

  it("rejects incomplete semantic review, repository prose evidence, and secret values", async () => {
    const fixture = await createFixture();
    const audit = await readJson(join(fixture.bundle, "audit.json"));
    delete (audit.dimensions as Record<string, unknown>).evolution;
    await writeJson(join(fixture.bundle, "audit.json"), audit);
    await expect(loadFixture(fixture)).rejects.toThrow(/every core audit dimension/);

    await writeBundle(fixture);
    await writeFile(join(fixture.project, "README.md"), "temporary lead\n", "utf8");
    const profile = await readJson(join(fixture.bundle, "project-profile.json"));
    profile.evidence = ["README.md"];
    await writeJson(join(fixture.bundle, "project-profile.json"), profile);
    await expect(loadFixture(fixture)).rejects.toThrow(/prose-document/);

    await writeBundle(fixture);
    const secretProfile = await readJson(join(fixture.bundle, "project-profile.json"));
    secretProfile.environment = { services: [], variables: [{ name: "API_TOKEN", token: "actual-value" }] };
    await writeJson(join(fixture.bundle, "project-profile.json"), secretProfile);
    await expect(loadFixture(fixture)).rejects.toThrow(/Secret-bearing field/);
  });

  it("allows retirement only in a publication candidate and protects required owners", async () => {
    const fixture = await createFixture();
    const delta = await readJson(join(fixture.bundle, "creation-delta.json")) as {
      mode: string;
      artifacts: Array<Record<string, unknown>>;
    };
    delta.artifacts = [{
      path: "scripts/checks/obsolete.py",
      action: "retire",
      owner: "creator-linters",
      validation: "retired",
      evidence: ["src/index.ts"],
    }];
    delta.mode = "init";
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadCompleteAnalysisBundle({
      bundleRoot: fixture.bundle,
      projectRoot: fixture.project,
      projectId: "sample-a1",
      operation: "init",
    })).rejects.toThrow(/not allowed during project init/);

    delta.mode = "migrate";
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadFixture(fixture)).resolves.toMatchObject({ artifactPaths: ["scripts/checks/obsolete.py"] });

    delta.artifacts[0].path = "references/workflows/close.md";
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadFixture(fixture)).rejects.toThrow(/required project Harness owner/);

    delta.artifacts[0].path = "scripts/harness_runtime/project.py";
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadFixture(fixture)).resolves.toMatchObject({
      artifactPaths: ["scripts/harness_runtime/project.py"],
    });

    delta.artifacts[0].path = "references/project_wiki/index.json";
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadFixture(fixture)).resolves.toMatchObject({
      artifactPaths: ["references/project_wiki/index.json"],
    });

    delta.artifacts[0].path = "scripts/project-harness-runtime/runtime.mjs";
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadFixture(fixture)).rejects.toThrow(/required project Harness owner/);

    delta.artifacts[0].path = "unowned.txt";
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadFixture(fixture)).rejects.toThrow(/unsupported project Harness path/);
  });

  it("requires executable authorization and rejects a linked artifact source path", async () => {
    const fixture = await createFixture();
    const delta = await readJson(join(fixture.bundle, "creation-delta.json")) as {
      artifacts: Array<Record<string, unknown>>;
    };
    delta.artifacts = [{
      path: "scripts/checks/check-project.mjs",
      action: "create",
      source: "artifacts/check-project.mjs",
      owner: "creator-linters",
      validation: "node scripts/checks/check-project.mjs",
      evidence: ["src/index.ts"],
    }];
    await writeFile(join(fixture.bundle, "artifacts", "check-project.mjs"), "console.log('ok');\n", "utf8");
    await writeJson(join(fixture.bundle, "creation-delta.json"), delta);
    await expect(loadFixture(fixture)).rejects.toThrow(/requires explicit authorization/);

    const linkedTarget = join(fixture.root, "linked-artifacts");
    await mkdir(linkedTarget);
    await writeFile(join(linkedTarget, "check-project.mjs"), "console.log('linked');\n", "utf8");
    await rm(join(fixture.bundle, "artifacts"), { recursive: true });
    await symlink(linkedTarget, join(fixture.bundle, "artifacts"), process.platform === "win32" ? "junction" : "dir");
    await expect(loadCompleteAnalysisBundle({
      bundleRoot: fixture.bundle,
      projectRoot: fixture.project,
      projectId: "sample-a1",
      operation: "migrate",
      allowExecutableArtifacts: true,
    })).rejects.toThrow(/link or Junction/);
  });
});

async function loadFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return loadCompleteAnalysisBundle({
    bundleRoot: fixture.bundle,
    projectRoot: fixture.project,
    projectId: "sample-a1",
    operation: "migrate",
  });
}

async function createFixture(): Promise<{ root: string; project: string; bundle: string }> {
  const root = await mkdtemp(join(tmpdir(), "aho-analysis-bundle-"));
  cleanup.push(root);
  const project = join(root, "project");
  const bundle = join(root, "bundle");
  await Promise.all([
    mkdir(join(project, "src"), { recursive: true }),
    mkdir(join(project, "tests"), { recursive: true }),
    mkdir(join(bundle, "artifacts"), { recursive: true }),
  ]);
  await writeFile(join(project, "package.json"), "{}\n", "utf8");
  await writeFile(join(project, "src", "index.ts"), "export const main = true;\n", "utf8");
  await writeFile(join(project, "tests", "app.test.ts"), "export {};\n", "utf8");
  const fixture = { root, project, bundle };
  await writeBundle(fixture);
  return fixture;
}

async function writeBundle(fixture: { project: string; bundle: string }): Promise<void> {
  const evidence = ["package.json", "src/index.ts", "tests/app.test.ts"];
  await mkdir(join(fixture.bundle, "artifacts"), { recursive: true });
  await writeFile(join(fixture.bundle, "artifacts", "runtime.md"), "# Runtime\n", "utf8");
  await writeJson(join(fixture.bundle, "project-profile.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    project_id: "sample-a1",
    project_name: "sample",
    purpose: { summary: "Exercise a project Harness.", evidence: ["src/index.ts"] },
    primary_flows: [{ name: "Run", evidence: ["src/index.ts"] }],
    languages: [{ name: "TypeScript", evidence: ["package.json"] }],
    frameworks: [],
    package_managers: [{ name: "npm", evidence: ["package.json"] }],
    source_roots: [{ path: "src", evidence: ["package.json"] }],
    entrypoints: [{ path: "src/index.ts", evidence: ["src/index.ts"] }],
    modules: [{ id: "runtime", name: "Runtime", responsibility: "Own runtime.", evidence: ["src/index.ts"] }],
    commands: [{ command: "npm test", status: "configured", evidence: ["package.json"] }],
    environment: { services: [], variables: [], modes: [], evidence: [] },
    ci: [],
    bridges: [],
    reference_projects: [],
    global_boundaries: [],
    unknowns: [],
    evidence,
  });
  await writeJson(join(fixture.bundle, "architecture.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    layers: [{ level: 1, packages: ["src"], evidence: ["src/index.ts"] }],
    dependencies: [],
    components: [],
    circular_dependencies: [],
    key_interfaces: [],
    code_paths: [],
    error_patterns: {},
    evidence: ["src/index.ts"],
  });
  const dimensions = Object.fromEntries([
    ["project_knowledge", 25],
    ["mechanical_checks", 20],
    ["environment", 15],
    ["coordination", 15],
    ["ecl_changes", 15],
    ["evolution", 10],
  ].map(([name, weight]) => [name, { score: 8, weight }]));
  await writeJson(join(fixture.bundle, "audit.json"), {
    schema_version: "1.0",
    analysis_status: "complete",
    dimensions,
    overall_score: 8,
    strengths: [{ summary: "Bounded runtime", evidence: ["src/index.ts"] }],
    gaps: [],
    knowledge_findings: [],
  });
  await writeJson(join(fixture.bundle, "creation-delta.json"), {
    schema_version: "1.0",
    mode: "migrate",
    decisions: [{
      source: "src/index.ts",
      action: "retain",
      owner: "runtime",
      projection: "L2",
      validation: "source exists",
    }],
    artifacts: [{
      path: "references/guides/runtime.md",
      action: "create",
      source: "artifacts/runtime.md",
      owner: "creator-docs",
      validation: "text-present",
      evidence: ["src/index.ts"],
    }],
  });
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
