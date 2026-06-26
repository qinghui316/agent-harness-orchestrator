import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectSourceDiff } from "../../src/landing/source-diff.js";
import { diffContentHash } from "../../src/landing/utils.js";
import { execFileAsync, getTempDir, initGitRepository } from "./workbench/fixtures.js";

describe("landing source diff attribution", () => {
  it("hashes applied repaired integration patches with untracked new files like git patch output", async () => {
    await initGitRepository(getTempDir());
    await mkdir(join(getTempDir(), "src"), { recursive: true });
    await writeFile(join(getTempDir(), "src", "alpha.ts"), "export const alphaMode = \"legacy\";\n", "utf8");
    await writeFile(join(getTempDir(), "src", "beta.ts"), "export const betaMode = \"legacy\";\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: getTempDir() });
    await execFileAsync("git", ["commit", "-m", "initial"], { cwd: getTempDir() });

    await writeFile(join(getTempDir(), "src", "alpha.ts"), "export const alphaMode = \"modern\";\n", "utf8");
    await writeFile(join(getTempDir(), "src", "beta.ts"), "export const betaMode = \"modern\";\n", "utf8");
    await writeFile(join(getTempDir(), "src", "integration-note.ts"), "export const integrationReady = true;\n", "utf8");

    const source = await collectSourceDiff(getTempDir());
    await execFileAsync("git", ["add", "src/integration-note.ts"], { cwd: getTempDir() });
    const expectedPatch = (await execFileAsync("git", ["diff", "--no-ext-diff", "--binary", "HEAD"], { cwd: getTempDir() })).stdout;

    expect(source.changedFiles).toEqual(["src/alpha.ts", "src/beta.ts", "src/integration-note.ts"]);
    expect(source.diffHash).toBe(diffContentHash(expectedPatch));
  });
});
