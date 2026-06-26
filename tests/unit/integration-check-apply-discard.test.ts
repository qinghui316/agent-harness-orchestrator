import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyIntegrationCheck, discardIntegrationCheck } from "../../src/integration-check/manager.js";
import { integrationCheckRoot } from "../../src/integration-check/paths.js";
import { readIntegrationCheck, writeCheckArtifacts } from "../../src/integration-check/repository.js";
import type { IntegrationCheckRecord } from "../../src/integration-check/types.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { execFileAsync, getTempDir, prepareSeededSchedulerIntegrationHandoff, project } from "./workbench/fixtures.js";

describe("integration check apply/discard gates", () => {
  it("discards a passed IntegrationCheck without mutating source root", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Integration Discard Gate");
    const beforeModuleA = await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8");
    const beforeModuleB = await readFile(join(getTempDir(), "src", "module-b.ts"), "utf8");
    const beforeStatus = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
    expect(beforeStatus.stdout.trim()).toBe("");

    const result = await discardIntegrationCheck(project(), prepared.handoff.handoff!.integrationCheckId);

    expect(result.check).toMatchObject({ status: "discarded" });
    expect(await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8")).toBe(beforeModuleA);
    expect(await readFile(join(getTempDir(), "src", "module-b.ts"), "utf8")).toBe(beforeModuleB);
    const afterStatus = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: getTempDir() });
    expect(afterStatus.stdout.trim()).toBe("");
  });

  it("fails closed when discarding terminal IntegrationChecks", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Integration Discard Terminal Guard");
    const memory = await resolveProjectMemory(project());
    const checkId = prepared.handoff.handoff!.integrationCheckId;
    const directory = join(integrationCheckRoot(memory), checkId);
    const check = await readIntegrationCheck(memory, checkId);

    await discardIntegrationCheck(project(), checkId);
    await expect(discardIntegrationCheck(project(), checkId)).rejects.toThrow(/status is discarded/i);

    const applied: IntegrationCheckRecord = {
      ...check,
      status: "applied",
      appliedAt: new Date().toISOString(),
      summary: "Applied fixture.",
    };
    await writeCheckArtifacts(memory, directory, applied);

    await expect(discardIntegrationCheck(project(), checkId)).rejects.toThrow(/status is applied/i);
  });

  it("fails closed when applying with a stale artifact hash", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Integration Apply Hash Guard");
    const checkId = prepared.handoff.handoff!.integrationCheckId;
    const beforeModuleA = await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8");

    await expect(applyIntegrationCheck(project(), checkId, "stale-artifact-hash")).rejects.toThrow(/selected integration artifact is stale/i);

    expect(await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8")).toBe(beforeModuleA);
  });

  it("fails closed when source HEAD drifts before integration apply", async () => {
    const prepared = await prepareSeededSchedulerIntegrationHandoff("Integration Apply Source Drift Guard");
    const checkId = prepared.handoff.handoff!.integrationCheckId;
    await writeFile(join(getTempDir(), "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    await execFileAsync("git", ["add", "src/unrelated.ts"], { cwd: getTempDir() });
    await execFileAsync("git", ["commit", "-m", "source drift"], { cwd: getTempDir() });

    await expect(applyIntegrationCheck(project(), checkId, prepared.latestArtifactHash)).rejects.toThrow(/project changed after the check/i);

    expect(await readFile(join(getTempDir(), "src", "module-a.ts"), "utf8")).toBe("export const moduleA = 1;\n");
  });
});
