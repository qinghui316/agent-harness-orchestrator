import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalProjectHarnessId,
  classifyProjectHarnessBaselineRelation,
  normalizeRegistryClaim,
  readBoundProjectHarnessRecords,
  readProjectHarnessBaseline,
  readProjectHarnessLane,
  registryClaimsOverlap,
  writeProjectHarnessBaseline,
  type GitAncestryProbe,
  type ProjectHarnessRegistryContext,
} from "../../src/project-harness/registry.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness Registry", () => {
  it("canonicalizes external ids and rejects path-shaped ids and claims", () => {
    expect(canonicalProjectHarnessId(" Feature / Registry ".replace("/", "-"))).toBe("feature-registry");
    expect(() => canonicalProjectHarnessId("../feature")).toThrow(/path separators|traversal/);
    expect(() => canonicalProjectHarnessId("___")).toThrow(/letter or digit/);
    expect(normalizeRegistryClaim("src\\project-harness\\registry.ts")).toBe("src/project-harness/registry.ts");
    expect(() => normalizeRegistryClaim("../outside.ts")).toThrow(/traverse/);
    expect(() => normalizeRegistryClaim("C:\\outside.ts")).toThrow(/project-relative/);
    expect(registryClaimsOverlap("src/project-harness", "src/project-harness/change.ts")).toBe(true);
    expect(registryClaimsOverlap("src/project", "src/project-harness")).toBe(false);
  });

  it("keeps empty Registry reads non-mutating", async () => {
    const fixture = await createFixture();

    await expect(readProjectHarnessBaseline(fixture.skillRoot)).resolves.toBeNull();
    await expect(readProjectHarnessLane(fixture.context)).resolves.toBeNull();
    await expect(readBoundProjectHarnessRecords(fixture.skillRoot, "changes", "change_id")).resolves.toEqual([]);
    expect(existsSync(join(fixture.skillRoot, "state"))).toBe(false);
  });

  it("writes and validates the baseline record", async () => {
    const fixture = await createFixture();
    const record = {
      schema_version: "1.0" as const,
      canonical_branch: "main",
      canonical_commit: "abc123",
      updated_at: "2026-08-03T01:00:00.000Z",
    };

    await writeProjectHarnessBaseline(fixture.skillRoot, record);

    await expect(readProjectHarnessBaseline(fixture.skillRoot)).resolves.toEqual(record);
  });

  it("rejects Registry records whose canonical filename and embedded id disagree", async () => {
    const fixture = await createFixture();
    const directory = join(fixture.skillRoot, "state", "registry", "changes");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "expected-change.json"), JSON.stringify({ change_id: "different-change" }), "utf8");

    await expect(readBoundProjectHarnessRecords(fixture.skillRoot, "changes", "change_id"))
      .rejects.toThrow(/does not match its filename/);
  });

  it.each([
    { expected: "not_applicable", repository: false, recorded: "work", canonical: "base", relations: [] },
    { expected: "unavailable", repository: true, recorded: null, canonical: "base", relations: [] },
    { expected: "equal", repository: true, recorded: "same", canonical: "same", relations: [] },
    { expected: "canonical_advanced", repository: true, recorded: "work", canonical: "base", relations: [["work", "base"]] },
    { expected: "worktree_behind", repository: true, recorded: "work", canonical: "base", relations: [["base", "work"]] },
    { expected: "diverged", repository: true, recorded: "work", canonical: "base", relations: [] },
  ] as const)("classifies $expected baseline relation", async ({ expected, repository, recorded, canonical, relations }) => {
    const relationSet = new Set(relations.map(([ancestor, descendant]) => `${ancestor}:${descendant}`));
    const probe: GitAncestryProbe = {
      async isRepository() { return repository; },
      async resolveCommit(_root, reference) { return reference; },
      async isAncestor(_root, ancestor, descendant) { return relationSet.has(`${ancestor}:${descendant}`); },
    };

    await expect(classifyProjectHarnessBaselineRelation("unused", recorded, canonical, probe)).resolves.toBe(expected);
  });
});

async function createFixture(): Promise<{
  root: string;
  projectRoot: string;
  skillRoot: string;
  context: ProjectHarnessRegistryContext;
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-project-registry-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const skillRoot = join(root, "skill");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(skillRoot, { recursive: true });
  return {
    root,
    projectRoot,
    skillRoot,
    context: {
      projectId: "sample-a1",
      projectRoot,
      skillRoot,
      mode: "multi_lane",
      branch: "codex/sample",
      headCommit: "same",
    },
  };
}
