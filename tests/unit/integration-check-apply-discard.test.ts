import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discardIntegrationCheck } from "../../src/integration-check/manager.js";
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
});
