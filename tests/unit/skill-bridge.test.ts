import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCodexBridgeStatus, installCodexBridge, syncCodexBridge } from "../../src/codex/bridge.js";
import { listAgentRoles, showAgentRole, syncAgentCatalog } from "../../src/agent/catalog.js";
import { writeProjectMarker } from "../../src/project/marker.js";
import { getEnabledSkillContext, importSkill, listSkills, setSkillEnabled } from "../../src/skill/catalog.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
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
  it("imports only allowed skill files and resolves project/topic enablement", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    const source = await createSkillSource("pricing-skill");

    const imported = await importSkill(repo, source);
    await setSkillEnabled(repo, imported.skill.skillId, { enabled: true });
    await setSkillEnabled(repo, imported.skill.skillId, { topic: "change-a", enabled: false });

    const skills = await listSkills(repo);
    const memory = await resolveProjectMemory(repo);

    expect(skills[0]).toMatchObject({ skillId: "pricing-skill", enabledProject: true, disabledTopics: ["change-a"] });
    expect(existsSync(join(memory.skillsRoot, "pricing-skill", "SKILL.md"))).toBe(true);
    expect(existsSync(join(memory.skillsRoot, "pricing-skill", "references", "note.md"))).toBe(true);
    expect(existsSync(join(memory.skillsRoot, "pricing-skill", "scripts", "run.ps1"))).toBe(false);
    expect((await getEnabledSkillContext(repo, "change-a")).records).toHaveLength(0);
    const context = await getEnabledSkillContext(repo, "change-b");
    expect(context.records[0].id).toBe("pricing-skill");
    expect(context.promptSection).toContain("AHO Skill Availability");
    expect(context.promptSection).not.toContain("# pricing-skill");
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
    const synced = await syncCodexBridge(repo);
    const status = await getCodexBridgeStatus(repo);
    const skillPath = join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "demo__pricing-skill", "SKILL.md");
    const agentPath = join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "agents", "coder.md");
    const manifest = JSON.parse(await readFile(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "plugin.json"), "utf8"));

    expect(synced.synced).toHaveLength(1);
    expect(synced.syncedAgents.length).toBeGreaterThan(0);
    expect(status.state).toBe("installed");
    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(agentPath)).toBe(true);
    expect(await readFile(skillPath, "utf8")).toContain("name: demo__pricing-skill");
    expect(manifest.skills[0].id).toBe("demo__pricing-skill");
    expect(manifest.agents.some((item: { id: string }) => item.id === "coder")).toBe(true);
  });

  it("reads bundled agent roles and syncs project catalog sources", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");

    const before = await listAgentRoles(repo);
    expect(before.some((role) => role.roleId === "coder" && role.source === "bundled")).toBe(true);

    const synced = await syncAgentCatalog(repo);
    const after = await showAgentRole(repo, "coder");

    expect(synced.catalog.agents.some((role) => role.roleId === "coder")).toBe(true);
    expect(after.source).toBe("memory");
    expect(existsSync(join((await resolveProjectMemory(repo)).agentsRoot, "coder.md"))).toBe(true);
  });

  it("persists messages and imports legacy thread.jsonl once", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");
    const memory = await resolveProjectMemory(repo);
    const changePath = "harness/changes/active/change-a";
    await mkdir(join(memory.memoryRoot, changePath), { recursive: true });
    await writeFile(join(memory.memoryRoot, changePath, "thread.jsonl"), `${JSON.stringify({
      id: "legacy-1",
      type: "user.message",
      timestamp: "2026-05-16T00:00:00.000Z",
      changeId: "change-a",
      text: "hello",
    })}\n`, "utf8");

    const store = await WorkbenchStore.open(memory);
    try {
      expect(store.hasMessages(repo.id, "change-a")).toBe(false);
    } finally {
      store.close();
    }
    const { importThreadJsonlIfNeeded } = await import("../../src/workbench/store.js");
    expect(await importThreadJsonlIfNeeded(memory, repo.id, "change-a", changePath)).toBe(1);
    expect(await importThreadJsonlIfNeeded(memory, repo.id, "change-a", changePath)).toBe(0);
  });
});

async function createSkillSource(name: string): Promise<string> {
  const source = join(root, "skill-source", name);
  await mkdir(join(source, "references"), { recursive: true });
  await mkdir(join(source, "examples"), { recursive: true });
  await mkdir(join(source, "scripts"), { recursive: true });
  await writeFile(join(source, "SKILL.md"), `---\nname: ${name}\ndescription: Pricing domain helper.\n---\n\n# ${name}\n`, "utf8");
  await writeFile(join(source, "references", "note.md"), "reference\n", "utf8");
  await writeFile(join(source, "examples", "example.md"), "example\n", "utf8");
  await writeFile(join(source, "scripts", "run.ps1"), "Write-Host nope\n", "utf8");
  return source;
}
