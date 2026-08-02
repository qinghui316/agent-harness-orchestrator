import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  SourceFingerprintSnapshot,
  type SourceFingerprintCommandRunner,
} from "../../src/project-harness/source-fingerprint.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("command-scoped source fingerprint snapshot", () => {
  it("deduplicates scoped sources, batches Git state, and reuses cached results", async () => {
    const project = await createGitProject();
    const calls: string[][] = [];
    const runner: SourceFingerprintCommandRunner = async (cwd, args) => {
      calls.push([...args]);
      return runGit(cwd, args);
    };
    const snapshot = new SourceFingerprintSnapshot({ projectRoot: project, commandRunner: runner });
    const first = await snapshot.fingerprints(["src/a.ts", "src/a.ts"]);
    expect(first.get("src/a.ts")).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.gitCallCount).toBe(3);
    expect(calls.filter((args) => args.includes("--")).every((args) => args.includes("src/a.ts"))).toBe(true);
    expect(calls.some((args) => args.includes("src/b.ts"))).toBe(false);

    const digest = await snapshot.digest(["src/a.ts"]);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect((await snapshot.result("src/a.ts")).fingerprint).toBe(first.get("src/a.ts"));
    expect(snapshot.gitCallCount).toBe(3);
  });

  it("binds the working-tree content when a tracked source is dirty", async () => {
    const project = await createGitProject();
    const before = new SourceFingerprintSnapshot({ projectRoot: project });
    const beforeDigest = await before.digest(["src/a.ts"]);
    await writeFile(join(project, "src", "a.ts"), "export const a = 2;\n", "utf8");
    const after = new SourceFingerprintSnapshot({ projectRoot: project });
    expect(await after.digest(["src/a.ts"])).not.toBe(beforeDigest);
  });

  it("falls back to content identity outside Git and reports missing sources", async () => {
    const project = await mkdtemp(join(tmpdir(), "aho-source-snapshot-"));
    cleanup.push(project);
    await mkdir(join(project, "src"));
    await writeFile(join(project, "src", "a.ts"), "export const a = true;\n", "utf8");
    const snapshot = new SourceFingerprintSnapshot({ projectRoot: project });
    await snapshot.prime(["src/a.ts", "src/missing.ts"]);
    expect(await snapshot.result("src/a.ts")).toMatchObject({ status: "current" });
    expect(await snapshot.result("src/missing.ts")).toEqual({
      source: "src/missing.ts",
      status: "missing",
      fingerprint: null,
    });
    expect(snapshot.gitCallCount).toBe(1);
  });
});

async function createGitProject(): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "aho-source-snapshot-git-"));
  cleanup.push(project);
  await mkdir(join(project, "src"));
  await writeFile(join(project, "src", "a.ts"), "export const a = 1;\n", "utf8");
  await writeFile(join(project, "src", "b.ts"), "export const b = 1;\n", "utf8");
  expect(runGit(project, ["init"]).exitCode).toBe(0);
  expect(runGit(project, ["add", "src/a.ts", "src/b.ts"]).exitCode).toBe(0);
  return project;
}

function runGit(cwd: string, args: readonly string[]) {
  const result = spawnSync("git", [...args], { cwd, encoding: "buffer", windowsHide: true });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
  };
}
