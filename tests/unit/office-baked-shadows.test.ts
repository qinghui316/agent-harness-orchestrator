import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { buildApprovedBakedShadows } from "../../scripts/office-assets/baked-shadow-pipeline.mjs";
import { loadOfficeAssetManifest } from "../../scripts/office-assets/manifest.mjs";
import { addCalibratedShadow, createCalibratedWorkstationLayers } from "../../src/web/src/office/officePixiComposition.js";
import { OFFICE_SCENE_CALIBRATION, type OfficeSceneCalibrationV3 } from "../../src/web/src/office/officeSceneCalibration.js";

const designRoot = join("design-assets", "agent-office");
const manifestPath = join(designRoot, "office-assets.manifest.json");
const calibrationPath = join(designRoot, "calibration", "scene-calibration-v3.json");

describe("Agent Office baked shadows", () => {
  it("keeps every non-shadow production calibration field unchanged", async () => {
    const calibration = JSON.parse(await readFile(calibrationPath, "utf8"));
    expect(hashStable(stripShadow(calibration))).toBe("7309ecdb99351f6c253e7c1bd8e9ea6211bf45082c0b6ca4a750d3b914233fe7");
  });

  it("keeps proof transforms immutable and records visual calibration separately", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const result = await buildApprovedBakedShadows(manifest, process.cwd());
    const calibration = JSON.parse(await readFile(calibrationPath, "utf8")) as OfficeSceneCalibrationV3;
    expect(result.shadows.map((shadow) => ({ id: shadow.id, output2x: shadow.output2x }))).toEqual([
      { id: "standard-workstation-shadow", output2x: { width: 506, height: 373 } },
      { id: "main-workstation-shadow", output2x: { width: 636, height: 337 } },
      { id: "coffee-facility-shadow", output2x: { width: 764, height: 289 } },
      { id: "treadmill-facility-shadow", output2x: { width: 570, height: 151 } },
    ]);
    expect(result.shadows.map((shadow) => shadow.proof.shift)).toEqual([
      { x: 126, y: 140 },
      { x: 454, y: 187 },
      { x: 496, y: 203 },
      { x: 459, y: -210 },
    ]);
    const expectedCalibration = [
      calibration.workstations.standard.shadow,
      calibration.workstations.main.shadow,
      calibration.facilities.coffee.shadow,
      calibration.facilities.treadmill.shadow,
    ];
    result.shadows.forEach((shadow, index) => {
      expect(shadow.calibrationOffset).toEqual({ x: expectedCalibration[index]!.x, y: expectedCalibration[index]!.y });
      expect(shadow.calibrationOffset.x).toBeCloseTo(shadow.localOffset.x + shadow.calibrationAdjustment.x, 12);
      expect(shadow.calibrationOffset.y).toBeCloseTo(shadow.localOffset.y + shadow.calibrationAdjustment.y, 12);
      expect(shadow.alpha.borderMaximum).toBe(0);
      expect(shadow.alpha.levels).toBeGreaterThan(8);
    });
    expect(result.shadows[2]!.calibrationAdjustment.x).toBeCloseTo(23.61831438878187, 12);
    expect(result.shadows[2]!.calibrationAdjustment.y).toBeCloseTo(0, 12);
    expect(result.shadows[3]!.calibrationAdjustment.x).toBeCloseTo(-5.940369420711896, 12);
    expect(result.shadows[3]!.calibrationAdjustment.y).toBeCloseTo(54.366666666666674, 12);
  });

  it("publishes neutral-black multi-level alpha with corresponding 1x and 2x atlas geometry", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const atlas1x = JSON.parse(await readFile(join(designRoot, "runtime-v3", "props", "office-props@1x.webp.json"), "utf8"));
    const atlas2x = JSON.parse(await readFile(join(designRoot, "runtime-v3", "props", "office-props@2x.webp.json"), "utf8"));
    for (const shadow of manifest.shadows) {
      const sourcePath = join(designRoot, "approved", shadow.file);
      const image = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
      expect(frame2x.sourceSize.w).toBe(image.info.width);
      expect(frame2x.sourceSize.h).toBe(image.info.height);
      expect(frame1x.sourceSize.w).toBe(Math.round(image.info.width / 2));
      expect(frame1x.sourceSize.h).toBe(Math.round(image.info.height / 2));
      expect(Math.abs(frame2x.spriteSourceSize.x / 2 - frame1x.spriteSourceSize.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame2x.spriteSourceSize.y / 2 - frame1x.spriteSourceSize.y)).toBeLessThanOrEqual(1);
    }
  });

  it("applies atlas trim compensation without changing the calibrated parent coordinate", () => {
    const addChild = vi.fn();
    const sprite = { position: { set: vi.fn() }, scale: { set: vi.fn() }, visible: true, alpha: 1 };
    const pixi = { Sprite: vi.fn(() => sprite) };
    const texture = { trim: { x: 7, y: 11 } };
    const props = {
      officeProps: { "standard-workstation-shadow": { frame: "standard-workstation-shadow.png", anchors2x: {} } },
      sheet: { textures: { "standard-workstation-shadow.png": texture } },
    };
    const calibration = {
      resourceId: "standard-workstation-shadow" as const,
      x: -2.2857142857142856,
      y: 1.1428571428571428,
      scaleX: 1,
      scaleY: 1,
      alpha: 0.55,
      layer: "shadow" as const,
      visible: true,
    };
    addCalibratedShadow(pixi as never, { addChild } as never, props as never, calibration);
    expect(sprite.position.set).toHaveBeenCalledWith(calibration.x - 7, calibration.y - 11);
    expect(sprite.scale.set).toHaveBeenCalledWith(1, 1);
    expect(sprite.alpha).toBe(0.55);
    expect(addChild).toHaveBeenCalledWith(sprite);
  });

  it("selects each static shadow resource and keeps workstation shadows under reduced motion", () => {
    const textureById = Object.fromEntries([
      "standard-workstation-shadow", "main-workstation-shadow", "standard-desk", "main-desk", "standard-monitor",
    ].map((id) => [id, { id, trim: { x: 0, y: 0 } }]));
    const containers: Array<{ children: unknown[]; addChild: ReturnType<typeof vi.fn> }> = [];
    const spriteConstructor = vi.fn((texture: unknown) => ({
      texture,
      position: { set: vi.fn() },
      scale: { set: vi.fn() },
      visible: true,
      alpha: 1,
    }));
    const animatedSpriteConstructor = vi.fn(() => ({
      anchor: { set: vi.fn() }, position: { set: vi.fn() }, play: vi.fn(), gotoAndStop: vi.fn(),
      width: 0, height: 0, animationSpeed: 0, loop: false, alpha: 1, visible: true, mask: null,
    }));
    const pixi = {
      Container: vi.fn(() => {
        const container = { children: [] as unknown[], addChild: vi.fn((...children: unknown[]) => container.children.push(...children)) };
        containers.push(container);
        return container;
      }),
      Sprite: spriteConstructor,
      AnimatedSprite: animatedSpriteConstructor,
      Graphics: vi.fn(() => ({ roundRect() { return this; }, fill() { return this; }, visible: true })),
    };
    const props = {
      officeProps: Object.fromEntries(Object.keys(textureById).map((id) => [id, { frame: `${id}.png`, anchors2x: {} }])),
      sheet: { textures: Object.fromEntries(Object.entries(textureById).map(([id, texture]) => [`${id}.png`, texture])) },
    };
    const screens = { animationId: "orchestration", animation: { fps: 20 }, sheet: { animations: { orchestration: [{}] } } };

    for (const workstationKind of ["standard", "main"] as const) {
      const layers = createCalibratedWorkstationLayers(
        pixi as never,
        props as never,
        screens as never,
        OFFICE_SCENE_CALIBRATION.workstations[workstationKind],
        "idle",
        true,
      );
      expect(layers.shadow.children).toHaveLength(1);
      expect((layers.shadow.children[0] as { texture: unknown }).texture).toBe(textureById[`${workstationKind}-workstation-shadow`]);
      expect(layers.screen.gotoAndStop).toHaveBeenCalledWith(0);
      expect(layers.screen.play).not.toHaveBeenCalled();
    }
    expect(OFFICE_SCENE_CALIBRATION.facilities.coffee.shadow?.resourceId).toBe("coffee-facility-shadow");
    expect(OFFICE_SCENE_CALIBRATION.facilities.treadmill.shadow?.resourceId).toBe("treadmill-facility-shadow");
    expect(containers.length).toBeGreaterThan(0);
  });

  it("uses one global shadow layer and has no workstation or facility ellipse fallback", async () => {
    const renderer = await readFile(join("src", "web", "src", "office", "PixiOfficeRenderer.tsx"), "utf8");
    const composition = await readFile(join("src", "web", "src", "office", "officePixiComposition.ts"), "utf8");
    const calibrationApp = await readFile(join("src", "web", "src", "office", "calibration", "SceneCalibrationApp.tsx"), "utf8");
    expect(renderer).toContain("root.addChild(shadowLayer, scenery, workstationLayer, personLayer, chairLayer, effectLayer)");
    expect(renderer).toContain("shadowLayer.addChild(stationShadow)");
    expect(renderer).not.toContain(".ellipse(");
    expect(composition).not.toContain(".ellipse(");
    expect(calibrationApp).not.toContain(".ellipse(");
  });
});

function stripShadow(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripShadow);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "shadow").map(([key, child]) => [key, stripShadow(child)]));
}

function hashStable(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
