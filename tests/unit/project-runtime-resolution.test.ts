import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveProjectRuntime } from "../../src/project-runtime/resolution.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import type { ManagedProject } from "../../src/types/index.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project runtime resolution", () => {
  it("resolves one canonical Harness, both provider bindings, and sidecar-only runtime paths", async () => {
    const fixture = await createFixture();
    const resolved = await resolveProjectRuntime(fixture.project, runtimeOptions(fixture.ahoHome));

    expect(resolved.harness).toMatchObject({ projectId: "sample-a1", skillName: "sample-a1-harness" });
    expect(resolved.binding.providers).toEqual([
      expect.objectContaining({ providerId: "codex", status: "ready", sameTarget: true }),
      expect.objectContaining({ providerId: "claude", status: "ready", sameTarget: true }),
    ]);
    expect(resolved.providerInput).toMatchObject({ source: "project-harness", required: true });
    expect(resolved.paths.sidecarRoot).toBe(join(fixture.ahoHome, "projects", "sample-a1"));
    expect(resolved.paths.worktreeIndexPath).toBe(join(resolved.paths.sidecarRoot, "worktrees", "index.json"));
  });

  it("fails closed when one provider link is missing", async () => {
    const fixture = await createFixture({ includeClaude: false });
    await expect(resolveProjectRuntime(fixture.project, runtimeOptions(fixture.ahoHome)))
      .rejects.toThrow(/required discovery links/);
  });

  it("requires controlled migration when registry and Harness identities differ", async () => {
    const fixture = await createFixture();
    await expect(resolveProjectRuntime({ ...fixture.project, id: "legacy-id" }, runtimeOptions(fixture.ahoHome)))
      .rejects.toThrow(/controlled identity migration/);
  });

  it("rejects an existing runtime sidecar Junction", async () => {
    const fixture = await createFixture();
    const projectsRoot = join(fixture.ahoHome, "projects");
    const linkedTarget = join(fixture.root, "linked-sidecar");
    await mkdir(projectsRoot, { recursive: true });
    await mkdir(linkedTarget);
    await symlink(
      linkedTarget,
      join(projectsRoot, fixture.project.id),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(resolveProjectRuntime(fixture.project, runtimeOptions(fixture.ahoHome)))
      .rejects.toThrow(/link, Junction/);
  });
});

function runtimeOptions(ahoHome: string) {
  return { ahoHome, discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY };
}

async function createFixture(options: { includeClaude?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "aho-runtime-resolution-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const ahoHome = join(root, "aho-home");
  const skillName = "sample-a1-harness";
  const skillRoot = join(projectRoot, ".agents", "skills", skillName);
  await mkdir(join(skillRoot, "state"), { recursive: true });
  await writeFile(join(skillRoot, "SKILL.md"), `---\nname: ${skillName}\n---\n`, "utf8");
  await writeFile(join(skillRoot, "state", "manifest.json"), `${JSON.stringify({
    schema_version: "2.0",
    project_id: "sample-a1",
    project_name: "sample",
    skill_name: skillName,
    skill_revision: 27,
    analysis_status: "complete",
  }, null, 2)}\n`, "utf8");
  if (options.includeClaude !== false) {
    const claudeRoot = join(projectRoot, ".claude", "skills");
    await mkdir(claudeRoot, { recursive: true });
    await symlink(skillRoot, join(claudeRoot, skillName), process.platform === "win32" ? "junction" : "dir");
  }
  const project: ManagedProject = {
    id: "sample-a1",
    name: "sample",
    path: projectRoot,
    addedAt: "2026-08-03T00:00:00.000Z",
    lastSeenAt: "2026-08-03T00:00:00.000Z",
  };
  return { root, projectRoot, ahoHome, project };
}
