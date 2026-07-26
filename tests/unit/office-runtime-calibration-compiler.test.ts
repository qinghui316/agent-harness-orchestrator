import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileRuntimeCalibration } from "../../scripts/office-assets/compile-runtime-calibration.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Office runtime calibration compiler", () => {
  it("strips preview actions and emits deterministic production geometry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aho-office-calibration-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "generated.ts");
    const result = await compileRuntimeCalibration(
      "design-assets/agent-office/calibration/scene-calibration-v3.json",
      output,
      process.cwd(),
    );
    const secondOutput = join(directory, "generated-second.ts");
    const secondResult = await compileRuntimeCalibration(
      "design-assets/agent-office/calibration/scene-calibration-v3.json",
      secondOutput,
      process.cwd(),
    );
    const generated = await readFile(output, "utf8");
    const secondGenerated = await readFile(secondOutput, "utf8");
    const source = await readFile("design-assets/agent-office/calibration/scene-calibration-v3.json", "utf8");
    expect(result.sourceSha256).toBe(createHash("sha256").update(source).digest("hex"));
    expect(result.sourceSha256).toBe("69bcb8b954953cc64711ecafb7285e78cff570d08f59b2f23e2583eea5595fb9");
    expect(result.normalizedHash).toBe("dbaeb3aa9327785ed4865297b5ed72c37bfefa38b71cb317061991c2370b30a9");
    expect(secondResult).toMatchObject({
      sourceSha256: result.sourceSha256,
      normalizedHash: result.normalizedHash,
    });
    expect(secondGenerated).toBe(generated);
    expect(generated).toContain('"schemaVersion": 1');
    expect(generated).toContain('"editorSchemaVersion": 3');
    expect(generated).not.toContain('"actionId"');
    expect(generated.match(/"slotId":/g)).toHaveLength(9);
    const runtime = JSON.parse(generated.slice(generated.indexOf("= {") + 2, generated.lastIndexOf("};") + 1));
    const expectedRuntime = JSON.parse(source);
    expectedRuntime.schemaVersion = 1;
    expectedRuntime.editorSchemaVersion = 3;
    for (const seat of expectedRuntime.roster.seats) delete seat.actionId;
    const geometryWithoutReceipt = structuredClone(runtime);
    delete geometryWithoutReceipt.sourceSha256;
    delete geometryWithoutReceipt.normalizedHash;
    expect(geometryWithoutReceipt).toEqual(expectedRuntime);
    expect(Object.keys(runtime.actionScales)).toHaveLength(13);
    expect(runtime.actionOffsets.working).toEqual({ x: -7.881743332435346, y: -1.9704132831742616 });
    expect(Object.keys(runtime.transitionDirections)).toHaveLength(23);
    expect(Object.keys(runtime.facilityRouteTargets)).toEqual([
      "main", "planning", "coder", "auditor", "rework", "spec-proposer", "spec-generator", "maintenance", "evolution",
    ]);
    expect(Object.keys(runtime.handoff.targetRoutes)).toEqual([
      "planning", "coder", "auditor", "rework", "spec-proposer", "spec-generator", "maintenance", "evolution",
    ]);
    expect(runtime.facilityRouteTargets.main.coffee.stageFlipX["leaving-out"]).toBe(false);
    expect(runtime.handoff.targetRoutes.planning.walkVerticalFlipX).toBe(true);
    expect(runtime.workstations.standard.shadow).toMatchObject({ resourceId: "standard-workstation-shadow", alpha: 0.42 });
    expect(runtime.facilities.coffee.shadow).toMatchObject({ resourceId: "coffee-facility-shadow", alpha: 0.42 });
  });
});
