import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectHarness } from "../../src/project-harness/discovery.js";

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

    const discovered = await discoverProjectHarness(project);
    expect(discovered?.handle).toMatchObject({
      projectId: "sample-a1b2",
      skillName,
      skillRevision: 27,
    });
    expect(discovered?.binding.providers).toEqual([
      expect.objectContaining({ providerId: "codex", status: "ready", sameTarget: true }),
      expect.objectContaining({ providerId: "claude", status: "ready", sameTarget: true }),
    ]);
    expect(discovered?.providerInput).toMatchObject({ source: "project-harness", required: true });
  });

  it("rejects two different physical project Harness targets", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-collision-"));
    cleanup.push(project);
    await createSkill(join(project, ".agents", "skills", "one-a1-harness"), "one-a1-harness", "one-a1");
    await createSkill(join(project, ".claude", "skills", "two-b2-harness"), "two-b2-harness", "two-b2");

    await expect(discoverProjectHarness(project)).rejects.toThrow(/ambiguous/);
  });

  it("returns null when no schema-2 project Harness is discoverable", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-project-empty-"));
    cleanup.push(project);
    await expect(discoverProjectHarness(project)).resolves.toBeNull();
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
