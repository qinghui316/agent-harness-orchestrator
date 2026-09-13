import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { projectSkillArtifact } from "../../src/project-harness/contracts.js";
import {
  assertNoLinkedPathAncestors,
  physicalPathIdentity,
  resolveOwnedArtifactPath,
  resolveWithinPhysicalRoot,
  samePhysicalPath,
} from "../../src/project-harness/path-safety.js";

const cleanup: string[] = [];
const execFileAsync = promisify(execFile);

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

  it("fails closed when physical identity comparison traverses a link or Junction", async () => {
    const base = await mkdtemp(join(tmpdir(), "aho-physical-identity-link-"));
    cleanup.push(base);
    const target = join(base, "target");
    const linked = join(base, "linked");
    await mkdir(join(target, "nested"), { recursive: true });
    await symlink(target, linked, process.platform === "win32" ? "junction" : "dir");

    await expect(samePhysicalPath(
      join(linked, "nested"),
      join(target, "nested"),
      "recovery authority",
    )).rejects.toThrow(/link or Junction/);
  });

  it.runIf(process.platform === "win32")(
    "accepts an ordinary physical path addressed through its Windows 8.3 alias",
    async ({ skip }) => {
      const base = await mkdtemp(join(tmpdir(), "aho-physical-short-path-alias-"));
      cleanup.push(base);
      const nested = join(base, "ordinary-physical-directory", "nested");
      await mkdir(nested, { recursive: true });

      const shortPath = await windowsShortPath(nested);
      if (!shortPath) skip("Windows 8.3 aliases are unavailable on this volume.");
      expect(normalize(shortPath)).not.toBe(normalize(nested));
      await expect(assertNoLinkedPathAncestors(shortPath, "runtime-owned path")).resolves.toBeUndefined();
      expect(normalize(await realpath(shortPath))).toBe(normalize(await realpath(nested)));
      await expect(physicalPathIdentity(shortPath, "short alias identity"))
        .resolves.toBe(await physicalPathIdentity(nested, "long path identity"));
      await expect(physicalPathIdentity(join(shortPath, "missing", "file.txt"), "missing short descendant"))
        .resolves.toBe(await physicalPathIdentity(join(nested, "missing", "file.txt"), "missing long descendant"));
    },
  );
});

async function windowsShortPath(path: string): Promise<string | null> {
  const command = process.env.ComSpec ?? "cmd.exe";
  const { stdout } = await execFileAsync(command, ["/d", "/c", `for %I in (${path}) do @echo %~sI`], {
    encoding: "utf8",
    windowsHide: true,
  });
  const value = stdout.trim().replace(/^"|"$/g, "");
  if (!value) throw new Error(`Windows did not return an 8.3-compatible path for ${path}.`);
  return normalize(value) === normalize(path) ? null : value;
}

function normalize(path: string): string {
  return resolve(path).toLowerCase();
}
