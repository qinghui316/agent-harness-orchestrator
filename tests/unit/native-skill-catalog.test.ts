import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCodexNativeSkills, setCodexNativeSkillEnabled } from "../../src/codex/native-skills.js";
import type { ProviderSkillCatalogSnapshot } from "../../src/provider-runtime/contracts.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { initializeProjectRuntimeSidecar } from "../../src/project-runtime/lifecycle.js";
import {
  addSkillRoot,
  getEnabledSkillContext,
  listSkills,
  setSkillEnabled,
} from "../../src/skill/catalog.js";
import { hashNativeSkillPackageContent } from "../../src/skill/content-hash.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-native-skills-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Codex native Skill adapter", () => {
  it("maps exact cwd scope, enablement, errors and package content identity", async () => {
    const projectPath = await directory("repo");
    const skillPath = await createSkill(join(root, "skills"), "portable-skill");
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const requester = {
      async requestMetadata(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
        calls.push({ method, params });
        if (method === "skills/extraRoots/set") return {};
        return {
          data: [{
            cwd: projectPath,
            skills: [{
              name: "portable-skill",
              description: "Portable Skill",
              path: skillPath,
              scope: "user",
              enabled: true,
              interface: { displayName: "Portable" },
              dependencies: { tools: [] },
            }],
            errors: [{ path: join(root, "broken", "SKILL.md"), message: "invalid frontmatter" }],
          }],
        };
      },
    };

    const snapshot = await listCodexNativeSkills({
      projectPath,
      extraRoots: [join(root, "skills"), join(root, "skills")],
      forceReload: true,
    }, { requester });

    expect(calls.map((call) => call.method)).toEqual(["skills/extraRoots/set", "skills/list"]);
    expect(calls[0].params).toEqual({ extraRoots: [resolve(join(root, "skills"))] });
    expect(calls[1].params).toEqual({ cwds: [resolve(projectPath)], forceReload: true });
    expect(snapshot.skills).toEqual([expect.objectContaining({
      name: "portable-skill",
      path: skillPath,
      scope: "user",
      enabled: true,
      contentHash: await hashNativeSkillPackageContent(dirname(skillPath)),
    })]);
    expect(snapshot.errors).toEqual([expect.objectContaining({ message: "invalid frontmatter" })]);
  });

  it("uses path-based Provider configuration and returns effective enablement", async () => {
    const projectPath = await directory("repo");
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const result = await setCodexNativeSkillEnabled({
      projectPath,
      path: join(root, "skills", "portable-skill", "SKILL.md"),
      enabled: false,
    }, {
      requester: {
        async requestMetadata(method, params) {
          calls.push({ method, params });
          return { effectiveEnabled: false };
        },
      },
    });
    expect(result).toEqual({ effectiveEnabled: false });
    expect(calls).toEqual([{
      method: "skills/config/write",
      params: { path: join(root, "skills", "portable-skill", "SKILL.md"), enabled: false },
    }]);
  });

  it("fails closed when Codex does not return the requested cwd", async () => {
    const projectPath = await directory("repo");
    await expect(listCodexNativeSkills({ projectPath }, {
      requester: {
        async requestMetadata(method) {
          return method === "skills/list"
            ? { data: [{ cwd: join(root, "other"), skills: [], errors: [] }] }
            : {};
        },
      },
    })).rejects.toThrow("did not return the requested project cwd");
  });
});

describe("native Skill catalog and sidecar selections", () => {
  it("keeps Provider discovery authoritative and sidecar state selection-only", async () => {
    const projectPath = await directory("repo");
    const paths = resolveProjectRuntimePaths("demo-project", join(root, "aho-home"));
    await initializeProjectRuntimeSidecar(paths);
    const customRoot = await directory("custom-skills");
    const optionalPath = await createSkill(customRoot, "portable-skill");
    const harnessPath = await createSkill(join(projectPath, ".agents", "skills"), "demo-project-harness");
    await addSkillRoot(paths, customRoot);
    const snapshot = await snapshotFor(projectPath, [
      { name: "portable-skill", path: optionalPath, enabled: true, scope: "user" },
      { name: "demo-project-harness", path: harnessPath, enabled: true, scope: "repo" },
    ]);
    const harnessInput = {
      id: "demo-project-harness",
      path: harnessPath,
      contentHash: await hashNativeSkillPackageContent(dirname(harnessPath)),
      source: "project-harness" as const,
      required: true,
    };

    const initial = await listSkills(paths, snapshot, [harnessInput]);
    expect(initial.skills.find((skill) => skill.skillId === "portable-skill")).toMatchObject({
      sourceKind: "custom",
      providerEnabled: true,
      required: false,
      runtimeAssigned: false,
    });
    expect(initial.skills.find((skill) => skill.skillId === "demo-project-harness")).toMatchObject({
      sourceKind: "project-harness",
      required: true,
    });
    await expect(setSkillEnabled(paths, snapshot, "demo-project-harness", { enabled: false }, [harnessInput]))
      .rejects.toThrow("assigned by the Runtime");

    await setSkillEnabled(paths, snapshot, "portable-skill", { enabled: true }, [harnessInput]);
    const context = await getEnabledSkillContext(paths, snapshot, undefined, [harnessInput]);
    expect(context.inputs).toEqual([
      expect.objectContaining({ id: "demo-project-harness", source: "project-harness", required: true }),
      expect.objectContaining({ id: "portable-skill", source: "provider-native", required: false }),
    ]);
    expect(context.promptSection).toContain("Native Skill Inputs");

    const disabled = await snapshotFor(projectPath, [
      { name: "portable-skill", path: optionalPath, enabled: false, scope: "user" },
      { name: "demo-project-harness", path: harnessPath, enabled: true, scope: "repo" },
    ]);
    const disabledContext = await getEnabledSkillContext(paths, disabled, undefined, [harnessInput]);
    expect(disabledContext.inputs).toEqual([expect.objectContaining({ id: "demo-project-harness" })]);
    expect(disabledContext.warnings).toContain("Selected Skill portable-skill is disabled in the Provider configuration.");
  });

  it("does not expose bundled runtime Skills as ordinary selections", async () => {
    const projectPath = await directory("repo");
    const paths = resolveProjectRuntimePaths("demo-project", join(root, "aho-home"));
    await initializeProjectRuntimeSidecar(paths);
    const systemPath = await createSkill(join(root, "system-skills"), "aho-harness-engineering");
    const snapshot = await snapshotFor(projectPath, [{
      name: "aho-harness-engineering",
      path: systemPath,
      enabled: true,
      scope: "system",
    }]);
    const catalog = await listSkills(paths, snapshot);
    expect(catalog.skills[0]).toMatchObject({ runtimeAssigned: true });
    await expect(setSkillEnabled(paths, snapshot, "aho-harness-engineering", { enabled: true }))
      .rejects.toThrow("assigned by the Runtime");
  });

  it.each([
    {
      label: "missing",
      skills: [],
      inputHash: "expected-hash",
      expected: "was not discovered",
    },
    {
      label: "disabled",
      skills: [{ enabled: false }],
      inputHash: null,
      expected: "is disabled",
    },
    {
      label: "content drift",
      skills: [{ enabled: true }],
      inputHash: "stale-content-hash",
      expected: "content identity does not match",
    },
  ])("fails closed for a $label required project Harness", async ({ skills, inputHash, expected }) => {
    const projectPath = await directory("repo");
    const paths = resolveProjectRuntimePaths("demo-project", join(root, "aho-home"));
    await initializeProjectRuntimeSidecar(paths);
    const harnessPath = await createSkill(join(projectPath, ".agents", "skills"), "demo-project-harness");
    const discoveredHash = await hashNativeSkillPackageContent(dirname(harnessPath));
    const snapshot = await snapshotFor(projectPath, skills.map(({ enabled }) => ({
      name: "demo-project-harness",
      path: harnessPath,
      enabled,
      scope: "repo" as const,
    })));
    await expect(getEnabledSkillContext(paths, snapshot, undefined, [{
      id: "demo-project-harness",
      path: harnessPath,
      contentHash: inputHash ?? discoveredHash,
      source: "project-harness",
      required: true,
    }])).rejects.toThrow(expected);
  });
});

async function directory(name: string): Promise<string> {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  return path;
}

async function createSkill(parent: string, name: string): Promise<string> {
  const skillRoot = join(parent, name);
  await mkdir(join(skillRoot, "references"), { recursive: true });
  await writeFile(join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: Test Skill.\n---\n`, "utf8");
  await writeFile(join(skillRoot, "references", "note.md"), "reference\n", "utf8");
  return join(skillRoot, "SKILL.md");
}

async function snapshotFor(
  projectPath: string,
  skills: Array<{ name: string; path: string; enabled: boolean; scope: "user" | "repo" | "system" | "admin" }>,
): Promise<ProviderSkillCatalogSnapshot> {
  return {
    providerId: "codex",
    projectPath,
    skills: await Promise.all(skills.map(async (skill) => ({
      ...skill,
      description: "Test Skill",
      contentHash: await hashNativeSkillPackageContent(dirname(skill.path)),
    }))),
    errors: [],
  };
}
