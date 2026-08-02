import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { projectSkillArtifact } from "../../src/project-harness/contracts.js";
import {
  assertNoLinkedPathAncestors,
  resolveOwnedArtifactPath,
  resolveWithinPhysicalRoot,
} from "../../src/project-harness/path-safety.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness path safety", () => {
  it("resolves an owned artifact only inside its declared physical root", async () => {
    const base = await mkdtemp(join(tmpdir(), "aho-owned-path-"));
    cleanup.push(base);
    const skill = join(base, "skill");
    const sidecar = join(base, "sidecar");
    const source = join(base, "source");
    await Promise.all([mkdir(skill), mkdir(sidecar), mkdir(source)]);

    await expect(resolveOwnedArtifactPath(
      { projectSkill: skill, runtimeSidecar: sidecar, projectSource: source },
      projectSkillArtifact("state/manifest.json"),
    )).resolves.toBe(join(skill, "state", "manifest.json"));
  });

  it("rejects a link or Junction in an artifact parent chain", async () => {
    const base = await mkdtemp(join(tmpdir(), "aho-owned-link-"));
    cleanup.push(base);
    const root = join(base, "root");
    const target = join(base, "target");
    await Promise.all([mkdir(root), mkdir(target)]);
    await writeFile(join(target, "manifest.json"), "{}", "utf8");
    await symlink(target, join(root, "state"), process.platform === "win32" ? "junction" : "dir");

    await expect(resolveWithinPhysicalRoot(root, "state/manifest.json", "project-skill"))
      .rejects.toThrow(/link or Junction/);
  });

  it("rejects an existing final target that is itself a link or Junction", async () => {
    const base = await mkdtemp(join(tmpdir(), "aho-owned-leaf-link-"));
    cleanup.push(base);
    const root = join(base, "root");
    const target = join(base, "target");
    await Promise.all([mkdir(root), mkdir(target)]);
    await symlink(target, join(root, "state"), process.platform === "win32" ? "junction" : "dir");

    await expect(resolveWithinPhysicalRoot(root, "state", "project-skill"))
      .rejects.toThrow(/target is a link or Junction/);
  });

  it("rejects a link or Junction anywhere in an absolute path ancestor chain", async () => {
    const base = await mkdtemp(join(tmpdir(), "aho-absolute-link-"));
    cleanup.push(base);
    const target = join(base, "target");
    const linked = join(base, "linked");
    await mkdir(join(target, "nested"), { recursive: true });
    await symlink(target, linked, process.platform === "win32" ? "junction" : "dir");

    await expect(assertNoLinkedPathAncestors(join(linked, "nested"), "runtime-owned path"))
      .rejects.toThrow(/traverses a link or Junction/);
  });
});
