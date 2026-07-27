import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { loadOfficeAssetManifest } from "../../scripts/office-assets/pipeline/manifest.mjs";
import { parseOfficeCalibrationJson } from "../../src/web/src/office/officeCalibrationDocument.js";
import { OfficeSpriteFactory } from "../../src/web/src/office/OfficeSpriteFactory.js";

const designRoot = join("design-assets", "agent-office");
const manifestPath = join(designRoot, "office-assets.manifest.json");
const documentPath = join("src", "web", "public", "agent-office", "config", "office-calibration.json");

describe("Agent Office baked shadows", () => {
  it("keeps proof transforms immutable without owning runtime calibration", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    expect(manifest.shadows.map((shadow: { proof: { shift: { x: number; y: number } } }) => shadow.proof.shift)).toEqual([
      { x: 126, y: 140 }, { x: 454, y: 187 }, { x: 496, y: 203 }, { x: 459, y: -210 },
    ]);
    const source = await readFile(join("scripts", "office-assets", "imports", "baked-shadow-import.mjs"), "utf8");
    expect(source).not.toMatch(/scene-calibration|calibrationOffset|calibrationAdjustment/);
  });

  it("publishes neutral-black multi-level alpha with corresponding 1x and 2x atlas geometry", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const atlas1x = JSON.parse(await readFile(join(designRoot, "runtime-v3", "props", "office-props@1x.webp.json"), "utf8"));
    const atlas2x = JSON.parse(await readFile(join(designRoot, "runtime-v3", "props", "office-props@2x.webp.json"), "utf8"));
    for (const shadow of manifest.shadows) {
      const image = await sharp(join(designRoot, "approved", shadow.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const levels = new Set<number>();
      let nonBlackPixels = 0;
      for (let offset = 0; offset < image.data.length; offset += 4) {
        if (image.data[offset] !== 0 || image.data[offset + 1] !== 0 || image.data[offset + 2] !== 0) nonBlackPixels += 1;
        if (image.data[offset + 3] > 0) levels.add(image.data[offset + 3]);
      }
      expect(nonBlackPixels).toBe(0);
      expect(levels.size).toBeGreaterThan(8);
      const frame1x = atlas1x.frames[`${shadow.id}.png`];
      const frame2x = atlas2x.frames[`${shadow.id}.png`];
      expect(frame2x.sourceSize).toEqual({ w: image.info.width, h: image.info.height });
      expect(frame1x.sourceSize).toEqual({ w: Math.round(image.info.width / 2), h: Math.round(image.info.height / 2) });
    }
  });

  it("stores every shadow as an ordinary static component at its approved local position", async () => {
    const document = parseOfficeCalibrationJson(await readFile(documentPath, "utf8"));
    expect(component(document.stationTemplates.standard.components, "shadow")).toMatchObject({
      resourceId: "standard-workstation-shadow", alpha: 0.42,
    });
    expect(component(document.stationTemplates.main.components, "shadow")).toMatchObject({
      resourceId: "main-workstation-shadow", alpha: 0.42,
    });
    expect(component(document.facilities.coffee.components, "shadow")).toMatchObject({
      resourceId: "coffee-facility-shadow", alpha: 0.42,
    });
    expect(component(document.facilities.treadmill.components, "shadow")).toMatchObject({
      resourceId: "treadmill-facility-shadow", alpha: 0.42,
    });
  });

  it("preserves each proof's furniture-relative shadow placement in the runtime facility container", async () => {
    const document = parseOfficeCalibrationJson(await readFile(documentPath, "utf8"));
    const atlas = JSON.parse(await readFile(join(designRoot, "runtime-v3", "props", "office-props@2x.webp.json"), "utf8"));
    const proof = JSON.parse(await readFile(join(designRoot, "approved", "shadows", "baked-shadow-calibration.json"), "utf8"));
    const bodyResources = {
      coffee: "water-coffee",
      treadmill: "treadmill",
    } as const;
    for (const facilityId of ["coffee", "treadmill"] as const) {
      const facility = document.facilities[facilityId];
      const body = component(facility.components, "body")!;
      const shadow = component(facility.components, "shadow")!;
      const bodyTrim = atlas.frames[`${bodyResources[facilityId]}.png`].spriteSourceSize;
      const source = proof.shadows.find((candidate: { target: string }) => candidate.target === facilityId);
      const proofCanvasOrigin = {
        x: (source.sourceCrop.left - source.proof.shift.x) / source.proof.outputScale - source.parentOrigin.x,
        y: (source.sourceCrop.top - source.proof.shift.y) / source.proof.outputScale - source.parentOrigin.y,
      };
      expect(shadow.localPosition.x).toBeCloseTo(proofCanvasOrigin.x + bodyTrim.x / 2 * body.scale.x, 12);
      expect(shadow.localPosition.y).toBeCloseTo(proofCanvasOrigin.y + bodyTrim.y / 2 * body.scale.y, 12);
    }
  });

  it("lets Pixi own atlas trim while applying only authored local coordinates", () => {
    const sprite = { position: { set: vi.fn() }, scale: { set: vi.fn() }, alpha: 1, visible: true };
    const parent = { addChild: vi.fn() };
    const texture = { trim: { x: 100, y: 200 } };
    const factory = new OfficeSpriteFactory(
      { Sprite: vi.fn(() => sprite) } as never,
      { officeProps: { shadow: { frame: "shadow.png" } }, sheet: { textures: { "shadow.png": texture } } } as never,
    );
    factory.add(parent as never, {
      componentId: "shadow", resourceId: "shadow", localPosition: { x: -3, y: 61 }, scale: { x: 1, y: 1 }, alpha: 0.42, layer: "shadow", visible: true,
    });
    expect(sprite.position.set).toHaveBeenCalledWith(-3, 61);
    expect(sprite.position.set).not.toHaveBeenCalledWith(-103, -139);
    expect(sprite.alpha).toBe(0.42);
  });

  it("has no ellipse, trim compensation, or shadow-specific renderer path", async () => {
    const files = await Promise.all([
      "PixiOfficeRenderer.tsx", "OfficeStaticSceneRenderer.ts", "OfficeSpriteFactory.ts",
    ].map((name) => readFile(join("src", "web", "src", "office", name), "utf8")));
    expect(files.join("\n")).not.toMatch(/\.ellipse\(|texture\.trim|addCalibratedShadow|calibrationOffset|calibrationAdjustment/);
  });
});

function component(components: readonly { componentId: string }[], id: string) {
  return components.find((candidate) => candidate.componentId === id);
}
