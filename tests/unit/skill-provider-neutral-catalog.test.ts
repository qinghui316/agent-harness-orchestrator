import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeProjectMarker } from "../../src/project/marker.js";
import { addSkillRoot, getEnabledSkillContext, listSkills, setSkillEnabled } from "../../src/skill/catalog.js";
import type { ManagedProject } from "../../src/types/index.js";

let root: string;
let originalAhoHome: string | undefined;
let originalCodexHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-neutral-skill-catalog-"));
  originalAhoHome = process.env.AHO_HOME;
  originalCodexHome = process.env.CODEX_HOME;
  process.env.AHO_HOME = join(root, "aho-home");
  process.env.CODEX_HOME = join(root, "provider-home");
});

afterEach(async () => {
  process.env.AHO_HOME = originalAhoHome;
  process.env.CODEX_HOME = originalCodexHome;
  await rm(root, { recursive: true, force: true });
});

describe("provider-neutral Skill catalog", () => {
  it("publishes canonical compatibility and content identity", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    const customRoot = join(root, "custom-skills");
    await createSkill(customRoot, "portable-skill");

    await addSkillRoot(repo, customRoot);
    await setSkillEnabled(repo, "portable-skill", { enabled: true });

    const skill = (await listSkills(repo)).find((item) => item.skillId === "portable-skill");
    expect(skill).toMatchObject({
      sourceKind: "custom",
      contentHash: expect.any(String),
      compatibility: { requiredCapabilities: ["skill.native-load"] },
      providerBindings: [],
    });
    expect(skill).not.toHaveProperty("runtimeTargets");
    expect(skill).not.toHaveProperty("sourceHash");

    const context = await getEnabledSkillContext(repo);
    expect(context.records).toEqual([expect.objectContaining({
      id: "portable-skill",
      contentHash: skill?.contentHash,
      providerBindings: [],
    })]);
    expect(context.records[0]).not.toHaveProperty("runtimeTarget");
    expect(context.promptSection).toContain("provider-neutral capability inputs");
    expect(context.promptSection).not.toContain("Codex");
  });

  it("does not infer canonical Skills from provider-owned paths", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    await createSkill(join(repo.path, ".codex", "skills"), "project-provider-skill");
    await createSkill(join(process.env.CODEX_HOME ?? "", "skills"), "global-provider-skill");

    const ids = (await listSkills(repo)).map((item) => item.skillId);
    expect(ids).not.toContain("project-provider-skill");
    expect(ids).not.toContain("global-provider-skill");
  });
});

function project(): ManagedProject {
  return {
    id: "demo",
    name: "Demo",
    path: join(root, "repo"),
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

async function createSkill(parent: string, name: string): Promise<void> {
  const skillRoot = join(parent, name);
  await mkdir(skillRoot, { recursive: true });
  await writeFile(join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: Portable test Skill.\n---\n`, "utf8");
}
