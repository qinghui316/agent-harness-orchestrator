import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { contentHash } from "../../src/integration-check/artifacts.js";
import { integrationCheckRoot } from "../../src/integration-check/paths.js";
import { writeCheckArtifacts } from "../../src/integration-check/repository.js";
import type { IntegrationCheckRecord } from "../../src/integration-check/types.js";
import { collectSourceDiff } from "../../src/landing/source-diff.js";
import { targetFromIntegrationCheck } from "../../src/landing/targets.js";
import { diffContentHash } from "../../src/landing/utils.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { execFileAsync, getTempDir, initGitRepository, project } from "./workbench/fixtures.js";

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
    const expectedPatch = (await execFileAsync("git", ["diff", "--no-ext-diff", "--binary", "--full-index", "HEAD"], { cwd: getTempDir() })).stdout;

    expect(source.changedFiles).toEqual(["src/alpha.ts", "src/beta.ts", "src/integration-note.ts"]);
    expect(source.diffHash).toBe(diffContentHash(expectedPatch));
  });

  it("uses normalized integration patch hash for landing attribution", async () => {
    await initGitRepository(getTempDir());
    await initHarness(project());
    await mkdir(join(getTempDir(), "src"), { recursive: true });
    await writeFile(join(getTempDir(), "src", "alpha.ts"), "export const alphaMode = \"legacy\";\n", "utf8");
    await writeFile(join(getTempDir(), "src", "beta.ts"), "export const betaMode = \"legacy\";\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: getTempDir() });
    await execFileAsync("git", ["commit", "-m", "initial"], { cwd: getTempDir() });

    await writeFile(join(getTempDir(), "src", "alpha.ts"), "export const alphaMode = \"modern\";\n", "utf8");
    await writeFile(join(getTempDir(), "src", "beta.ts"), "export const betaMode = \"modern\";\n", "utf8");
    const source = await collectSourceDiff(getTempDir());
    const rawIntegrationPatch = source.diff.replace(/\ndiff --git a\/src\/beta\.ts/, "\n\ndiff --git a/src/beta.ts");
    const memory = await resolveProjectMemory(project());
    const checkId = "apply-check-normalized";
    const directory = join(integrationCheckRoot(memory), checkId);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "combined.patch"), rawIntegrationPatch, "utf8");
    const rawArtifactHash = contentHash(rawIntegrationPatch);
    const check: IntegrationCheckRecord = {
      version: "1.0",
      id: checkId,
      projectId: project().id,
      status: "applied",
      resultTargets: [
        { changeId: "change-1", worktreeId: "wt-alpha", diffHash: "diff-alpha", diffStat: "src/alpha.ts | 1 +", sourceHead: null },
        { changeId: "change-1", worktreeId: "wt-beta", diffHash: "diff-beta", diffStat: "src/beta.ts | 1 +", sourceHead: null },
      ],
      sourceHead: null,
      createdAt: new Date().toISOString(),
      summary: "Applied integration result.",
      riskSummary: "Local result.",
      artifactRefs: ["workbench/integration-checks/apply-check-normalized/integration-check.json"],
      artifacts: [{ kind: "combined", path: "memory://workbench/integration-checks/apply-check-normalized/combined.patch", hash: rawArtifactHash, createdAt: new Date().toISOString(), source: "integration-check" }],
      latestArtifactHash: rawArtifactHash,
      latestArtifactRef: "workbench/integration-checks/apply-check-normalized/combined.patch",
      aggregateValidation: { id: "validation-1", status: "passed", command: ["npm", "run", "test:fast"], exitCode: 0, stdout: "", stderr: "", artifactRef: "validation.json", createdAt: new Date().toISOString() },
      aggregateAudit: { id: "audit-1", status: "approved", summary: "Approved.", findings: [], artifactRef: "audit.json", createdAt: new Date().toISOString() },
      fixAttempts: [],
      blockingIssues: [],
      warnings: [],
    };
    await writeCheckArtifacts(memory, directory, check);

    const target = await targetFromIntegrationCheck(memory, checkId);

    expect(rawArtifactHash).not.toBe(source.diffHash);
    expect(target.expectedDiffHash).toBe(source.diffHash);
  });
});
