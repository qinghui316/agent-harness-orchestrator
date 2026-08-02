import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bindCodexEnabledSkills, bindCodexSkillCatalog, getCodexBridgeStatus, installCodexBridge, listNativeCodexSkills, syncCodexBridge } from "../../src/codex/bridge.js";
import { listAgentRoles, showAgentRole, syncAgentCatalog } from "../../src/agent/catalog.js";
import { writeProjectMarker } from "../../src/project/marker.js";
import { addSkillRoot, getEnabledSkillContext, importSkill, listSkills, setSkillEnabled } from "../../src/skill/catalog.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";

let root: string;
let originalAhoHome: string | undefined;
let originalCodexHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-skill-bridge-"));
  originalAhoHome = process.env.AHO_HOME;
  originalCodexHome = process.env.CODEX_HOME;
  process.env.AHO_HOME = join(root, "aho-home");
  process.env.CODEX_HOME = join(root, "codex-home");
});

afterEach(async () => {
  process.env.AHO_HOME = originalAhoHome;
  process.env.CODEX_HOME = originalCodexHome;
  await rm(root, { recursive: true, force: true });
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

describe("AHO skill source and Codex bridge", () => {
  it("imports legal skill package files and resolves project/topic enablement", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    const source = await createSkillSource("pricing-skill");

    const imported = await importSkill(repo, source);
    await setSkillEnabled(repo, imported.skill.skillId, { enabled: true });
    await setSkillEnabled(repo, imported.skill.skillId, { topic: "change-a", enabled: false });

    const skills = await listSkills(repo);
    const memory = await resolveProjectMemory(repo);

    const pricing = skills.find((skill) => skill.skillId === "pricing-skill");
    expect(pricing).toMatchObject({ skillId: "pricing-skill", enabledProject: true, disabledTopics: ["change-a"] });
    expect(pricing?.sourceKind).toBe("managed");
    expect(existsSync(join(memory.skillsRoot, "pricing-skill", "SKILL.md"))).toBe(true);
    expect(existsSync(join(memory.skillsRoot, "pricing-skill", "references", "note.md"))).toBe(true);
    expect(existsSync(join(memory.skillsRoot, "pricing-skill", "scripts", "run.ps1"))).toBe(true);
    expect((await getEnabledSkillContext(repo, "change-a")).records).toHaveLength(0);
    const context = await getEnabledSkillContext(repo, "change-b");
    expect(context.records[0].id).toBe("pricing-skill");
    expect(context.promptSection).toContain("AHO Skill Availability");
    expect(context.promptSection).not.toContain("# pricing-skill");
  });

  it("scans custom roots and keeps unsafe package entries out of the Codex bridge", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    const rootDir = join(root, "custom-skills");
    const source = await createSkillSource("analytics-skill", rootDir);
    await mkdir(join(source, ".git"), { recursive: true });
    await mkdir(join(source, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(source, ".git", "config"), "secret\n", "utf8");
    await writeFile(join(source, "node_modules", "pkg", "index.js"), "module\n", "utf8");
    await symlink(join(root, "outside.txt"), join(source, "linked.txt")).catch(() => undefined);
    await writeFile(join(root, "outside.txt"), "outside\n", "utf8");

    const refreshed = await addSkillRoot(repo, rootDir);
    expect(refreshed.roots[0]).toMatchObject({ rootPath: rootDir, sourceKind: "custom" });
    expect(refreshed.skills.some((skill) => skill.skillId === "analytics-skill" && skill.sourceKind === "custom")).toBe(true);

    await setSkillEnabled(repo, "analytics-skill", { enabled: true });
    await syncCodexBridge(repo);
    const bridgeSkillRoot = join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "demo__analytics-skill");

    expect(existsSync(join(bridgeSkillRoot, "scripts", "run.ps1"))).toBe(true);
    expect(existsSync(join(bridgeSkillRoot, ".git", "config"))).toBe(false);
    expect(existsSync(join(bridgeSkillRoot, "node_modules", "pkg", "index.js"))).toBe(false);
    expect(existsSync(join(bridgeSkillRoot, "linked.txt"))).toBe(false);
  });

  it("installs and syncs enabled skills and agents into the aho-managed Codex plugin namespace", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    const source = await createSkillSource("pricing-skill");
    const imported = await importSkill(repo, source);
    await setSkillEnabled(repo, imported.skill.skillId, { enabled: true });
    await syncAgentCatalog(repo);

    const before = await getCodexBridgeStatus(repo);
    expect(before.state).toBe("missing");

    await installCodexBridge();
    await writeFile(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "agents", "coder.md"), "retired\n", "utf8");
    const synced = await syncCodexBridge(repo);
    const status = await getCodexBridgeStatus(repo);
    const skillPath = join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "demo__pricing-skill", "SKILL.md");
    const agentPath = join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "agents", "coder-agent.md");
    const manifest = JSON.parse(await readFile(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "plugin.json"), "utf8"));

    expect(synced.synced).toHaveLength(1);
    expect(synced.syncedAgents.length).toBeGreaterThan(0);
    expect(status.state).toBe("installed");
    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "demo__pricing-skill", "scripts", "run.ps1"))).toBe(true);
    expect(existsSync(agentPath)).toBe(true);
    expect(existsSync(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "agents", "coder.md"))).toBe(false);
    expect(await readFile(skillPath, "utf8")).toContain("name: demo__pricing-skill");
    expect(manifest.skills[0].id).toBe("demo__pricing-skill");
    expect(manifest.agents.some((item: { id: string }) => item.id === "coder-agent")).toBe(true);
    expect(manifest.agents.some((item: { id: string }) => ["coder", "auditor", "validator", "merge-reviewer-agent"].includes(item.id))).toBe(false);
  });

  it("keeps native Codex Skill discovery inside the Codex bridge", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    const nativeRoot = join(process.env.CODEX_HOME ?? "", "skills");
    await createSkillSource("native-codex-skill", nativeRoot);

    expect((await listSkills(repo)).some((item) => item.skillId === "native-codex-skill")).toBe(false);
    expect(await listNativeCodexSkills(repo)).toEqual([expect.objectContaining({
      skillId: "native-codex-skill",
      scope: "global",
      contentHash: expect.any(String),
      sourcePath: join(nativeRoot, "native-codex-skill"),
    })]);
  });

  it("discovers bundled AHO system skills and materializes them through the AHO-managed bridge", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");

    const skills = await listSkills(repo);
    expect(skills.find((item) => item.skillId === "aho-harness-engineering")).toBeUndefined();
    const authoringSkill = skills.find((item) => item.skillId === "aho-workflow-authoring");
    expect(authoringSkill).toMatchObject({
      sourceKind: "system-aho",
      providerBindings: [],
    });
    expect((await bindCodexSkillCatalog(repo, [authoringSkill!]))[0].providerBindings)
      .toEqual([expect.objectContaining({ providerId: "codex", status: "unavailable", bindingKind: "materialized" })]);

    await expect(setSkillEnabled(repo, "aho-harness-engineering", { topic: "change-a", enabled: true }))
      .rejects.toThrow("Runtime-assigned");
    await setSkillEnabled(repo, "aho-workflow-authoring", { topic: "change-a", enabled: true });
    const beforeSync = await getEnabledSkillContext(repo, "change-a");
    expect(beforeSync.records).toEqual([expect.objectContaining({ id: "aho-workflow-authoring", sourceKind: "system-aho", providerBindings: [] })]);
    expect(beforeSync.warnings).toEqual([]);
    expect((await bindCodexEnabledSkills(repo, beforeSync.records)).warnings)
      .toEqual(["Skill aho-workflow-authoring is not synced to the Codex bridge."]);

    const legacy = join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "demo__aho-harness-onboarding");
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, "SKILL.md"), "---\nname: demo__aho-harness-onboarding\n---\n", "utf8");
    const synced = await syncCodexBridge(repo);
    const materializedAuthoring = join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "demo__aho-workflow-authoring");
    expect(synced.synced.some((item) => item.skillId === "aho-workflow-authoring")).toBe(true);
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "demo__aho-harness-engineering"))).toBe(false);
    expect(await readFile(join(materializedAuthoring, "SKILL.md"), "utf8")).toContain("name: demo__aho-workflow-authoring");
    expect(existsSync(join(materializedAuthoring, "agents", "openai.yaml"))).toBe(true);
    expect(existsSync(join(materializedAuthoring, "references", "fixed-plan-format.md"))).toBe(true);
    expect(existsSync(join(materializedAuthoring, "references", "workflow-patterns.md"))).toBe(true);
    expect(existsSync(join(process.env.CODEX_HOME ?? "", "skills", "aho-harness-engineering"))).toBe(false);
    expect(existsSync(join(process.env.CODEX_HOME ?? "", "skills", "aho-workflow-authoring"))).toBe(false);
    expect((await bindCodexSkillCatalog(repo)).find((item) => item.skillId === "aho-workflow-authoring")?.providerBindings)
      .toEqual([expect.objectContaining({ providerId: "codex", status: "ready" })]);
  });

  it("does not persist the bundled Harness Creator as an ordinary project Skill selection", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");

    const persistent = await getEnabledSkillContext(repo, "change-a");
    expect(persistent.records).toHaveLength(0);
  });

  it("reads bundled agent roles and syncs project catalog sources", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");

    const before = await listAgentRoles(repo);
    expect(before.some((role) => role.roleId === "coder-agent" && role.source === "bundled")).toBe(true);
    expect(before.some((role) => ["coder", "auditor", "validator", "merge-reviewer-agent"].includes(role.roleId))).toBe(false);

    const synced = await syncAgentCatalog(repo);
    const after = await showAgentRole(repo, "coder-agent");

    expect(synced.catalog.agents.some((role) => role.roleId === "coder-agent")).toBe(true);
    expect(after.source).toBe("memory");
    expect(existsSync(join((await resolveProjectMemory(repo)).agentsRoot, "coder-agent.md"))).toBe(true);
  });

});

async function createSkillSource(name: string, parent = join(root, "skill-source")): Promise<string> {
  const source = join(parent, name);
  await mkdir(join(source, "references"), { recursive: true });
  await mkdir(join(source, "examples"), { recursive: true });
  await mkdir(join(source, "scripts"), { recursive: true });
  await writeFile(join(source, "SKILL.md"), `---\nname: ${name}\ndescription: Pricing domain helper.\n---\n\n# ${name}\n`, "utf8");
  await writeFile(join(source, "references", "note.md"), "reference\n", "utf8");
  await writeFile(join(source, "examples", "example.md"), "example\n", "utf8");
  await writeFile(join(source, "scripts", "run.ps1"), "Write-Host nope\n", "utf8");
  return source;
}
