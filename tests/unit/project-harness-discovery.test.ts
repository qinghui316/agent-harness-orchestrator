import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectHarness } from "../../src/project-harness/discovery.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { projectRelativePath } from "../../src/project-harness/contracts.js";
import { hashNativeSkillPackageContent } from "../../src/skill/content-hash.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness discovery", () => {
  it("binds Codex and Claude discovery to one physical schema-2 project Skill", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-discovery-"));
    cleanup.push(project);
    const skillName = "sample-a1b2-harness";
    const skill = join(project, ".agents", "skills", skillName);
    await createSkill(skill, skillName, "sample-a1b2");
    const claudeRoot = join(project, ".claude", "skills");
    await mkdir(claudeRoot, { recursive: true });
    await symlink(skill, join(claudeRoot, skillName), process.platform === "win32" ? "junction" : "dir");

    const discovered = await discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
    expect(discovered?.handle).toMatchObject({
      projectId: "sample-a1b2",
      skillName,
      skillRevision: 27,
    });
    expect(discovered?.binding.providers).toEqual([
      expect.objectContaining({ providerId: "codex", status: "ready", sameTarget: true }),
      expect.objectContaining({ providerId: "claude", status: "ready", sameTarget: true }),
    ]);
    expect(discovered?.providerInput).toMatchObject({
      source: "project-harness",
      required: true,
      contentHash: await hashNativeSkillPackageContent(skill),
    });
  });

  it("rejects two different physical project Harness targets", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-collision-"));
    cleanup.push(project);
    await createSkill(join(project, ".agents", "skills", "one-a1-harness"), "one-a1-harness", "one-a1");
    await createSkill(join(project, ".claude", "skills", "two-b2-harness"), "two-b2-harness", "two-b2");

    await expect(discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).rejects.toThrow(/ambiguous/);
  });

  it("returns null when no schema-2 project Harness is discoverable", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-empty-"));
    cleanup.push(project);
    await expect(discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).resolves.toBeNull();
  });

  it("rejects a non-portable manifest project_id before it reaches product path resolution", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-unsafe-id-"));
    cleanup.push(project);
    await createSkill(join(project, ".agents", "skills", "sample-a1-harness"), "sample-a1-harness", "../escape");

    await expect(discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).rejects.toThrow(/portable project id/);
  });

  it("discovers opaque provider routes without parsing provider names or route order", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-opaque-discovery-"));
    cleanup.push(project);
    const skillName = "sample-a1b2-harness";
    const skill = join(project, ".future", "skills", skillName);
    await createSkill(skill, skillName, "sample-a1b2");
    const alternateRoot = join(project, ".other", "skills");
    await mkdir(alternateRoot, { recursive: true });
    await symlink(skill, join(alternateRoot, skillName), process.platform === "win32" ? "junction" : "dir");

    const discovered = await discoverProjectHarness(project, {
      routes: [
        { providerId: "future-z", relativeRoot: projectRelativePath(".other/skills"), required: true },
        { providerId: "future-a", relativeRoot: projectRelativePath(".future/skills"), required: true },
      ],
    });

    expect(discovered?.binding.providers.map(({ providerId, sameTarget }) => ({ providerId, sameTarget }))).toEqual([
      { providerId: "future-z", sameTarget: true },
      { providerId: "future-a", sameTarget: true },
    ]);
  });

  it("rejects a forged discovery route that escapes the project root", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-unsafe-discovery-policy-"));
    cleanup.push(project);
    await expect(discoverProjectHarness(project, {
      routes: [{ providerId: "unsafe", relativeRoot: "../outside" as never, required: true }],
    })).rejects.toThrow(/unsafe segment/);
  });
});

async function createSkill(root: string, skillName: string, projectId: string): Promise<void> {
  await mkdir(join(root, "state"), { recursive: true });
  await writeFile(join(root, "SKILL.md"), `---\nname: ${skillName}\n---\n`, "utf8");
  await writeFile(join(root, "state", "manifest.json"), `${JSON.stringify({
    schema_version: "2.0",
    project_id: projectId,
    project_name: projectId,
    skill_name: skillName,
    skill_revision: 27,
    analysis_status: "complete",
  }, null, 2)}\n`, "utf8");
}
