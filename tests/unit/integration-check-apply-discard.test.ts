import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyIntegrationCheck, discardIntegrationCheck } from "../../src/integration-check/manager.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { withProjectWriteLeaseAtPath } from "../../src/project/project-write-lease.js";
import { prepareSkillNativeIntegrationCheckFixture } from "../helpers/skill-native-apply-fixture.js";
import { execFileAsync, getTempDir, git, initGitRepository, project } from "./workbench/fixtures.js";

let previousAhoHome: string | undefined;

beforeEach(() => {
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
});

afterEach(() => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
});

describe("Skill-native integration check apply/discard gates", () => {
  it("applies the exact reviewed IntegrationCheck candidate", async () => {
    const prepared = await prepareFixture("Integration Apply Gate");
    const result = await applyIntegrationCheck(
      project(),
      prepared.check.id,
      prepared.check.latestArtifactHash,
      prepared.actionScope,
    );

    expect(result.check).toMatchObject({ status: "applied" });
    expect((await readFile(join(getTempDir(), "candidate-a.txt"), "utf8")).trim()).toBe("candidate A");
    expect((await readFile(join(getTempDir(), "candidate-b.txt"), "utf8")).trim()).toBe("candidate B");
    await expect(applyIntegrationCheck(
      project(),
      prepared.check.id,
      prepared.check.latestArtifactHash,
      prepared.actionScope,
    )).rejects.toThrow(/completed|already|status is applied/i);
  }, 120_000);

  it("discards a passed IntegrationCheck without mutating source root", async () => {
    const prepared = await prepareFixture("Integration Discard Gate");
    const beforeStatus = await status();

    const result = await discardIntegrationCheck(project(), prepared.check.id, prepared.actionScope);

    expect(result.check).toMatchObject({ status: "discarded" });
    expect(await status()).toBe(beforeStatus);
    await expect(readFile(join(getTempDir(), "candidate-a.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(getTempDir(), "candidate-b.txt"), "utf8")).rejects.toThrow();
  }, 120_000);

  it("fails closed when discarding terminal IntegrationChecks", async () => {
    const prepared = await prepareFixture("Integration Discard Terminal Guard");
    await discardIntegrationCheck(project(), prepared.check.id, prepared.actionScope);
    await expect(discardIntegrationCheck(project(), prepared.check.id, prepared.actionScope)).rejects.toThrow(/completed|discarded/i);
  }, 180_000);

  it("fails closed when applying with a stale artifact hash", async () => {
    const prepared = await prepareFixture("Integration Apply Hash Guard");

    await expect(applyIntegrationCheck(
      project(),
      prepared.check.id,
      "stale-artifact-hash",
      prepared.actionScope,
    )).rejects.toThrow(/selected integration artifact is stale/i);

    expect(await status()).toBe("");
  }, 120_000);

  it("fails closed when source HEAD drifts before integration apply", async () => {
    const prepared = await prepareFixture("Integration Apply Source Drift Guard");
    await writeFile(join(getTempDir(), "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    await git(getTempDir(), ["add", "unrelated.ts"]);
    await git(getTempDir(), ["commit", "-m", "source drift"]);

    await expect(applyIntegrationCheck(
      project(),
      prepared.check.id,
      prepared.check.latestArtifactHash,
      prepared.actionScope,
    )).rejects.toThrow(/project changed after the check|authorization lineage is stale/i);

    await expect(readFile(join(getTempDir(), "candidate-a.txt"), "utf8")).rejects.toThrow();
  }, 120_000);

  it("fails closed before integration revalidation when another apply holds the sidecar lease", async () => {
    const prepared = await prepareFixture("Integration Apply Lease Guard");
    const runtime = projectExecutionRuntimePort(prepared.base.project, prepared.base.resolution);

    await withProjectWriteLeaseAtPath(runtime.projectWriteLeasePath, { holderId: "other-apply", ttlMs: 10_000 }, async () => {
      await expect(applyIntegrationCheck(
        project(),
        prepared.check.id,
        prepared.check.latestArtifactHash,
        prepared.actionScope,
      )).rejects.toThrow(/already held/);
    });

    expect(await status()).toBe("");
  }, 120_000);
});

async function prepareFixture(title: string) {
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  return prepareSkillNativeIntegrationCheckFixture({
    projectRoot: getTempDir(),
    ahoHome: process.env.AHO_HOME!,
    projectId: project().id,
    projectName: project().name,
    title,
  });
}

async function status(): Promise<string> {
  return (await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() })).stdout.trim();
}
