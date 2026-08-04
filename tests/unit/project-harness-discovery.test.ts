import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertRequiredProjectHarnessBindings,
  discoverProjectHarness,
} from "../../src/project-harness/discovery.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { projectRelativePath, type ProjectHarnessDiscoveryPolicy } from "../../src/project-harness/contracts.js";
import { hashNativeSkillPackageContent } from "../../src/skill/content-hash.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness discovery", () => {
  it("makes a Codex-only project ready without fabricating a Claude binding", async () => {
    const project = await createProject("codex-only");
    const skillName = "sample-a1b2-harness";
    const skill = join(project, ".agents", "skills", skillName);
    await createSkill(skill, skillName, "sample-a1b2");

    const discovered = await discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
    if (!discovered) throw new Error("Expected Codex discovery.");
    expect(discovered.handle).toMatchObject({ projectId: "sample-a1b2", skillName, skillRevision: 27 });
    expect(discovered.binding.providers).toEqual([
      expect.objectContaining({ providerId: "codex", status: "ready", sameTarget: true, required: false }),
      expect.objectContaining({ providerId: "claude", status: "missing", sameTarget: false, required: false }),
    ]);
    expect(() => assertRequiredProjectHarnessBindings(discovered, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).not.toThrow();
    expect(discovered.providerInput).toMatchObject({
      source: "project-harness",
      required: true,
      contentHash: await hashNativeSkillPackageContent(skill),
    });
  });

  it("makes a Claude-only project ready", async () => {
    const project = await createProject("claude-only");
    const skill = join(project, ".claude", "skills", "sample-a1b2-harness");
    await createSkill(skill, "sample-a1b2-harness", "sample-a1b2");

    const discovered = await discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
    if (!discovered) throw new Error("Expected Claude discovery.");
    assertRequiredProjectHarnessBindings(discovered, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
    expect(discovered.binding.providers).toEqual([
      expect.objectContaining({ providerId: "codex", status: "missing" }),
      expect.objectContaining({ providerId: "claude", status: "ready", sameTarget: true }),
    ]);
  });

  it("supports a direct AHO Host binding to one physical Skill", async () => {
    const project = await createProject("aho-host");
    const skill = join(project, "portable-skills", "sample-a1b2-harness");
    await createSkill(skill, "sample-a1b2-harness", "sample-a1b2");
    const policy: ProjectHarnessDiscoveryPolicy = {
      routes: [{ providerId: "aho", skillRoot: skill, required: true }],
    };

    const discovered = await discoverProjectHarness(project, policy);
    if (!discovered) throw new Error("Expected direct AHO Host discovery.");
    assertRequiredProjectHarnessBindings(discovered, policy);
    expect(discovered.binding.providers).toEqual([
      expect.objectContaining({ providerId: "aho", status: "ready", sameTarget: true, required: true }),
    ]);
  });

  it("discovers a future Host without parsing its name", async () => {
    const project = await createProject("future-host");
    const skill = join(project, ".future", "skills", "sample-a1b2-harness");
    await createSkill(skill, "sample-a1b2-harness", "sample-a1b2");
    const policy: ProjectHarnessDiscoveryPolicy = {
      routes: [{ providerId: "future-z", relativeRoot: projectRelativePath(".future/skills"), required: true }],
    };

    const discovered = await discoverProjectHarness(project, policy);
    if (!discovered) throw new Error("Expected future Host discovery.");
    assertRequiredProjectHarnessBindings(discovered, policy);
    expect(discovered.binding.providers[0]).toMatchObject({ providerId: "future-z", status: "ready" });
  });

  it("accepts multiple bindings only when they resolve the same physical target", async () => {
    const project = await createProject("same-target");
    const skill = join(project, ".agents", "skills", "sample-a1b2-harness");
    await createSkill(skill, "sample-a1b2-harness", "sample-a1b2");
    const policy: ProjectHarnessDiscoveryPolicy = {
      routes: [
        { providerId: "codex", relativeRoot: projectRelativePath(".agents/skills"), required: true },
        { providerId: "aho", skillRoot: skill, required: true },
      ],
    };

    const discovered = await discoverProjectHarness(project, policy);
    if (!discovered) throw new Error("Expected multi-Host discovery.");
    assertRequiredProjectHarnessBindings(discovered, policy);
    expect(discovered.binding.providers.every((binding) => binding.sameTarget)).toBe(true);
  });

  it("rejects multiple bindings with conflicting targets or fingerprints", async () => {
    const project = await createProject("conflict");
    await createSkill(join(project, ".agents", "skills", "sample-a1b2-harness"), "sample-a1b2-harness", "sample-a1b2");
    const other = join(project, ".claude", "skills", "sample-a1b2-harness");
    await createSkill(other, "sample-a1b2-harness", "sample-a1b2");
    await writeFile(join(other, "extra.md"), "fingerprint drift\n", "utf8");

    await expect(discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).rejects.toThrow(/ambiguous/);
  });

  it("rejects duplicate route identities and duplicate Skills in one Host root", async () => {
    const project = await createProject("duplicates");
    await expect(discoverProjectHarness(project, {
      routes: [
        { providerId: "same", relativeRoot: projectRelativePath(".one/skills"), required: false },
        { providerId: "same", relativeRoot: projectRelativePath(".two/skills"), required: false },
      ],
    })).rejects.toThrow(/Duplicate/);

    await createSkill(join(project, ".agents", "skills", "one-harness"), "one-harness", "one");
    await createSkill(join(project, ".agents", "skills", "two-harness"), "two-harness", "two");
    await expect(discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).rejects.toThrow(/ambiguous/);
  });

  it("fails closed for a missing, disabled, or undiscoverable required binding", async () => {
    const project = await createProject("required");
    await createSkill(join(project, ".agents", "skills", "sample-a1b2-harness"), "sample-a1b2-harness", "sample-a1b2");
    const missingPolicy: ProjectHarnessDiscoveryPolicy = {
      routes: [
        { providerId: "codex", relativeRoot: projectRelativePath(".agents/skills"), required: false },
        { providerId: "selected", relativeRoot: projectRelativePath(".selected/skills"), required: true },
      ],
    };
    const missing = await discoverProjectHarness(project, missingPolicy);
    if (!missing) throw new Error("Expected the optional Codex binding.");
    expect(() => assertRequiredProjectHarnessBindings(missing, missingPolicy)).toThrow(/selected/);

    const disabledPolicy: ProjectHarnessDiscoveryPolicy = {
      routes: [
        { providerId: "codex", relativeRoot: projectRelativePath(".agents/skills"), required: false },
        { providerId: "disabled", skillRoot: join(project, ".agents", "skills", "sample-a1b2-harness"), required: true, enabled: false },
      ],
    };
    const disabled = await discoverProjectHarness(project, disabledPolicy);
    if (!disabled) throw new Error("Expected the optional Codex binding.");
    expect(disabled.binding.providers[1]).toMatchObject({ status: "unavailable", required: true });
    expect(() => assertRequiredProjectHarnessBindings(disabled, disabledPolicy)).toThrow(/disabled/);
  });

  it("returns null when no schema-2 project Harness is discoverable", async () => {
    const project = await createProject("empty");
    await expect(discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).resolves.toBeNull();
  });

  it("rejects unsafe identities, path escape, and linked explicit roots", async () => {
    const project = await createProject("unsafe");
    await createSkill(join(project, ".agents", "skills", "sample-a1-harness"), "sample-a1-harness", "../escape");
    await expect(discoverProjectHarness(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).rejects.toThrow(/portable project id/);
    await expect(discoverProjectHarness(project, {
      routes: [{ providerId: "unsafe", relativeRoot: "../outside" as never, required: true }],
    })).rejects.toThrow(/unsafe segment/);

    const physical = join(project, "physical", "safe-harness");
    await createSkill(physical, "safe-harness", "safe");
    const linked = join(project, "linked-harness");
    await symlink(physical, linked, process.platform === "win32" ? "junction" : "dir");
    await expect(discoverProjectHarness(project, {
      routes: [{ providerId: "direct", skillRoot: linked, required: true }],
    })).rejects.toThrow(/link or Junction/);

    const physicalParent = join(project, "physical-parent");
    const nestedPhysical = join(physicalParent, "nested-harness");
    await createSkill(nestedPhysical, "nested-harness", "nested");
    const linkedParent = join(project, "linked-parent");
    await symlink(physicalParent, linkedParent, process.platform === "win32" ? "junction" : "dir");
    await expect(discoverProjectHarness(project, {
      routes: [{ providerId: "direct", skillRoot: join(linkedParent, "nested-harness"), required: true }],
    })).rejects.toThrow(/link or Junction/);
  });
});

async function createProject(label: string): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), `aho-project-discovery-${label}-`));
  cleanup.push(project);
  return project;
}

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
