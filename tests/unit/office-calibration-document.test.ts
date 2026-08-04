import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  diffOfficeCalibrationFiles,
  migrateOfficeCalibrationFile,
  migrateOfficeCalibrationV3,
  validateOfficeCalibrationFile,
} from "../../scripts/office-calibration.js";
import {
  parseOfficeCalibrationDocument,
  parseOfficeCalibrationJson,
  type OfficeCalibrationDocument,
} from "../../src/web/src/office/officeCalibrationDocument.js";
import { OFFICE_SCENE_CALIBRATION, serializeOfficeSceneCalibration } from "../../scripts/office-calibration-v3.js";
import { officeVerificationFixturePath } from "../helpers/office-verification-fixture.js";

const legacyCalibrationPath = officeVerificationFixturePath("calibration", "scene-calibration-v3.json");
const atlasPath = "src/web/public/agent-office/props/office-props@1x.webp.json";
const highResolutionAtlasPath = "src/web/public/agent-office/props/office-props@2x.webp.json";
const shadowProofPath = "design-assets/agent-office/approved/shadows/baked-shadow-calibration.json";
const documentPath = "src/web/public/agent-office/config/office-calibration.json";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Office calibration document", () => {
  it("migrates v3 into one strict v4 document without changing authored routes or visible prop geometry", async () => {
    const legacy = JSON.parse(await readFile(legacyCalibrationPath, "utf8"));
    const atlas = JSON.parse(await readFile(atlasPath, "utf8"));
    const shadowProof = JSON.parse(await readFile(shadowProofPath, "utf8"));
    const highResolutionAtlas = JSON.parse(await readFile(highResolutionAtlasPath, "utf8"));
    const document = migrateOfficeCalibrationV3(legacy, atlas, shadowProof, highResolutionAtlas);

    expect(document.schemaVersion).toBe(4);
    const published = parseOfficeCalibrationJson(await readFile(documentPath, "utf8"));
    expect(document.routes).toEqual(published.routes);
    expect(document.handoffs).toEqual(published.handoffs);
    expect(document.stations.items.map((station) => station.stationId)).toEqual(legacy.roster.seats.map((seat: { slotId: string }) => seat.slotId));
    expect(document.actionVisualAlignments.working).toEqual({
      scale: legacy.actionScales.working,
      offset: legacy.actionOffsets.working,
    });

    for (const templateId of ["standard", "main"] as const) {
      const template = document.stationTemplates[templateId]!;
      const legacyTemplate = legacy.workstations[templateId];
      for (const [componentId, legacyId] of [["desk", legacyTemplate.deskId], ["monitor", "standard-monitor"], ["chair", legacyTemplate.chairId]] as const) {
        const component = template.components.find((candidate) => candidate.componentId === componentId)!;
        const transform = legacyTemplate[componentId];
        const trim = atlas.frames[`${legacyId}.png`].spriteSourceSize;
        expect(component.localPosition.x + trim.x * component.scale.x).toBeCloseTo(transform.x, 12);
        expect(component.localPosition.y + trim.y * component.scale.y).toBeCloseTo(transform.y, 12);
      }
    }

    for (const templateId of ["standard", "main"] as const) {
      expect(component(document, templateId, "shadow").localPosition).toEqual(component(published, templateId, "shadow").localPosition);
    }
    for (const facilityId of ["coffee", "treadmill"] as const) {
      const actual = facilityComponent(document, facilityId, "shadow").localPosition;
      const expected = facilityComponent(published, facilityId, "shadow").localPosition;
      expect(actual.x).toBeCloseTo(expected.x, 12);
      expect(actual.y).toBeCloseTo(expected.y, 12);
    }

    for (const facilityId of ["coffee", "treadmill", "toilet"] as const) {
      const facility = document.facilities[facilityId]!;
      expect(facility.components.find((candidate) => candidate.componentId === "body")?.localPosition).toEqual({ x: 0, y: 0 });
      for (const [anchorId, local] of Object.entries(facility.anchors)) {
        expect(facility.origin.x + local.x).toBeCloseTo(legacy.facilities[facilityId].anchors[anchorId].x, 12);
        expect(facility.origin.y + local.y).toBeCloseTo(legacy.facilities[facilityId].anchors[anchorId].y, 12);
      }
    }
    expect(document.facilities.coffee?.anchors.aisleEntry).toEqual({
      x: legacy.facilities.coffee.anchors.aisleEntry.x - legacy.facilities.coffee.origin.x,
      y: legacy.facilities.coffee.anchors.aisleEntry.y - legacy.facilities.coffee.origin.y,
    });
    expect(document.facilities.toilet?.components.find((candidate) => candidate.componentId === "toilet-paper")?.localPosition).toEqual({
      x: legacy.facilities.toiletPaper.origin.x - legacy.facilities.toilet.origin.x,
      y: legacy.facilities.toiletPaper.origin.y - legacy.facilities.toilet.origin.y,
    });

    const movedGeometry = structuredClone(document);
    movedGeometry.stations.items[0]!.origin.x += 100;
    movedGeometry.facilities.coffee!.origin.x += 100;
    const reparsed = parseOfficeCalibrationDocument(movedGeometry);
    expect(reparsed.routes).toEqual(document.routes);
    expect(reparsed.handoffs).toEqual(document.handoffs);
  });

  it("accepts only schema v4, rejects unknown structure, and deeply freezes the parsed document", async () => {
    const source = await readFile(documentPath, "utf8");
    const document = parseOfficeCalibrationJson(source);
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.facilities.coffee?.components)).toBe(true);
    expect(Object.isFrozen(document.routes.main?.coffee)).toBe(true);

    const old = { ...JSON.parse(source), schemaVersion: 3 };
    expect(() => parseOfficeCalibrationDocument(old)).toThrow(/schemaVersion/i);
    const unknown = { ...JSON.parse(source), compatibilityFallback: true };
    expect(() => parseOfficeCalibrationDocument(unknown)).toThrow(/unrecognized key/i);
    const invalidResource = structuredClone(JSON.parse(source));
    invalidResource.stationTemplates.standard.components = invalidResource.stationTemplates.standard.components.filter(
      (candidate: { componentId: string }) => candidate.componentId !== "chair",
    );
    expect(() => parseOfficeCalibrationDocument(invalidResource)).toThrow(/missing component chair/i);
  });

  it("writes migrations atomically with a previous-document backup and leaves invalid input untouched", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aho-office-calibration-"));
    temporaryDirectories.push(directory);
    const target = join(directory, "office-calibration.json");
    const legacyPath = join(directory, "scene-calibration-v3.json");
    const previous = await readFile(documentPath, "utf8");
    await writeFile(legacyPath, serializeOfficeSceneCalibration(OFFICE_SCENE_CALIBRATION), "utf8");
    await writeFile(target, previous, "utf8");

    const result = await migrateOfficeCalibrationFile(legacyPath, target, atlasPath);
    expect(result.backupPath).toBe(`${target}.bak`);
    expect(await readFile(`${target}.bak`, "utf8")).toBe(previous);
    const migrated = await readFile(target, "utf8");
    expect(() => parseOfficeCalibrationJson(migrated)).not.toThrow();

    const invalidLegacy = join(directory, "invalid-v3.json");
    await writeFile(invalidLegacy, JSON.stringify({ schemaVersion: 2 }), "utf8");
    const before = await readFile(target, "utf8");
    await expect(migrateOfficeCalibrationFile(invalidLegacy, target, atlasPath)).rejects.toThrow(/schemaVersion must be 3/i);
    expect(await readFile(target, "utf8")).toBe(before);
  });

  it("validates and diffs without rewriting either source document", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aho-office-calibration-diff-"));
    temporaryDirectories.push(directory);
    const source = await readFile(documentPath, "utf8");
    const left = join(directory, "left.json");
    const right = join(directory, "right.json");
    const changed = structuredClone(JSON.parse(source));
    changed.facilities.coffee.components[0].alpha = 0.9;
    await writeFile(left, source, "utf8");
    await writeFile(right, `${JSON.stringify(changed, null, 2)}\n`, "utf8");

    const beforeLeft = await readFile(left, "utf8");
    const validation = await validateOfficeCalibrationFile(left);
    expect(validation.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await diffOfficeCalibrationFiles(left, left)).toEqual([]);
    expect(await diffOfficeCalibrationFiles(left, right)).toEqual([
      "$.facilities.coffee.components[0].alpha: 1 -> 0.9",
    ]);
    expect(await readFile(left, "utf8")).toBe(beforeLeft);
  });
});

function component(document: Readonly<OfficeCalibrationDocument>, templateId: "standard" | "main", componentId: string) {
  return document.stationTemplates[templateId]!.components.find((candidate) => candidate.componentId === componentId)!;
}

function facilityComponent(document: Readonly<OfficeCalibrationDocument>, facilityId: "coffee" | "treadmill", componentId: string) {
  return document.facilities[facilityId]!.components.find((candidate) => candidate.componentId === componentId)!;
}
