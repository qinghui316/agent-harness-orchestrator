import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACTION_ORDER,
  buildActionFramePlan,
  buildActionPlaybackPlan,
  loadOfficeAssetManifest,
  validateOfficeAssetManifest,
} from "../../scripts/office-assets/pipeline/manifest.mjs";
import {
  assertDistinctFrames,
  buildAnchorReport,
  deriveCanonicalResolution,
  packPixiAtlas,
  readCanonicalFullCharacterSequence,
  transformImportedFramesToCanonicalCanvas,
  validateApprovedActionSources,
  writeAnimatedPreview,
  transformPropAnchors,
} from "../../scripts/office-assets/pipeline/image-pipeline.mjs";
import { cutoutStagingMaster } from "../../scripts/office-assets/pipeline/cutout-pipeline.mjs";
import { extractGridProofAction, extractProofPhase } from "../../scripts/office-assets/proofs/proof-pipeline.mjs";

const manifestPath = join("design-assets", "agent-office", "office-assets.manifest.json");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("office asset manifest", () => {
  it("defines complete-character actions without a six-cell source contract", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const summary = validateOfficeAssetManifest(manifest);

    expect(summary).toEqual({
      characterActionCount: 13,
      characterFrameCount: 773,
      characterSourceFrameCount: 743,
      proofActionCount: 3,
      propCount: 10,
      shadowCount: 4,
      screenAnimationCount: 3,
      screenFrameCount: 349,
      effectCount: 1,
      effectFrameCount: 25,
    });
    expect(manifest.characterActions.map((action: { id: string }) => action.id)).toEqual(ACTION_ORDER);
    expect(manifest.characterAssembly).toBe("complete-frame-only");
    expect(manifest.sourceSheetGrid).toBeUndefined();
    expect(manifest.frame).toMatchObject({
      canonical2x: { width: 960, height: 960 },
      canonical1x: { width: 480, height: 480 },
      anchor: { x: 0, y: 0 },
    });
    expect(manifest.frame.source2x).toBeUndefined();
    expect(manifest.frame.source1x).toBeUndefined();
    expect(manifest.runtimeRoot).toBe("design-assets/agent-office/runtime-v3");
    expect(manifest.canonicalGeometry).toMatchObject({
      seatAnchor2x: { x: 725, y: 550 },
      groundAnchor2x: { x: 480, y: 874 },
      referenceScarfWidth2x: 195,
    });
    expect(manifest.proofActionIds).toEqual(["standby", "walk-horizontal", "off-chair"]);
    expect(manifest.characterActions.find((action: { id: string }) => action.id === "walk-horizontal")).toMatchObject({
      canvas2x: { width: 1280, height: 960 },
      visualAnchor2x: { x: 480, y: 874 },
    });
    expect(manifest.characterActions.find((action: { id: string }) => action.id === "treadmill")).toMatchObject({
      canvas2x: { width: 1600, height: 1080 },
      visualAnchor2x: { x: 700, y: 874 },
    });
    expect(manifest.characterActions.find((action: { id: string }) => action.id === "toilet")).toMatchObject({
      frames: 121,
      fps: 24,
      loop: false,
      visualAnchor2x: { x: 549, y: 412 },
    });
    expect(manifest.style.office).toContain("white/light-grey furniture");
    expect(manifest.shadows.map((shadow: { id: string }) => shadow.id)).toEqual([
      "standard-workstation-shadow",
      "main-workstation-shadow",
      "coffee-facility-shadow",
      "treadmill-facility-shadow",
    ]);
    expect(manifest.props.map((prop: { id: string }) => prop.id)).toEqual(expect.arrayContaining([
      "toilet-back",
      "toilet-tail-occluder",
      "toilet-paper-holder",
    ]));
    expect(manifest.props.map((prop: { id: string }) => prop.id)).not.toEqual(expect.arrayContaining([
      "standard-keyboard",
      "main-keyboard",
      "main-monitor",
    ]));
    expect(manifest.props.find((prop: { id: string }) => prop.id === "standard-desk").orientation).toBe("flip-y");
    expect(manifest.props.find((prop: { id: string }) => prop.id === "standard-monitor").orientation).toBe("flip-y");
    expect(manifest.props.find((prop: { id: string }) => prop.id === "main-desk").orientation).toBeUndefined();
    expect(manifest.screenAnimations.map((screen: { id: string; frames: number }) => ({ id: screen.id, frames: screen.frames }))).toEqual([
      { id: "orchestration", frames: 145 },
      { id: "entertainment-1", frames: 102 },
      { id: "entertainment-2", frames: 102 },
    ]);
    expect(manifest.effects).toEqual([
      { id: "coffee-cup", frames: 25, fps: 24, loop: true, width2x: 1068, height2x: 800, directory: "effects/coffee-cup" },
    ]);
  });

  it("publishes approved handoff atlases while retaining their source proof reports", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const productionActionIds = manifest.characterActions.map((action: { id: string }) => action.id);
    const expectedCounts = {
      "standing-talk": 76,
      "seated-talk": 86,
      salute: 76,
    } as const;

    expect(productionActionIds).toEqual(expect.arrayContaining(Object.keys(expectedCounts)));
    for (const [actionId, frameCount] of Object.entries(expectedCounts)) {
      const atlases = await Promise.all((["1x", "2x"] as const).map(async (resolution) => JSON.parse(await readFile(join(
        "design-assets", "agent-office", "runtime-v3", "actions", `${actionId}@${resolution}.webp.json`,
      ), "utf8"))));
      const expectedFrames = Array.from({ length: frameCount }, (_, index) => `${actionId}_${String(index).padStart(4, "0")}.png`);
      expect(atlases[0].animations[actionId]).toEqual(expectedFrames);
      expect(atlases[1].animations[actionId]).toEqual(expectedFrames);
      expect(Object.keys(atlases[0].frames)).toEqual(expectedFrames);
      expect(Object.keys(atlases[1].frames)).toEqual(expectedFrames);
      expect(atlases[0].frames[expectedFrames[0]!]).toMatchObject({
        rotated: false,
        trimmed: true,
        sourceSize: { w: 480, h: 480 },
      });
      expect(atlases[1].frames[expectedFrames[0]!]).toMatchObject({
        rotated: false,
        trimmed: true,
        sourceSize: { w: 960, h: 960 },
      });
      expect(atlases[0].meta.animation).toEqual({ fps: 24, loop: false });
      expect(atlases[1].meta.animation).toEqual({ fps: 24, loop: false });

      const proofName = actionId === "standing-talk" ? "video19" : actionId === "seated-talk" ? "video20" : "video21";
      const report = JSON.parse(await readFile(join(
        "design-assets", "agent-office", "proof", "actions", actionId, proofName, "report.json",
      ), "utf8"));
      expect(report).toMatchObject({
        actionId,
        selection: { playbackFrameCount: frameCount, playback: "direct" },
        alpha: { visibleKeyPixels: 0, transparentNonZeroRgb: 0, protectedPixelChanges: 0 },
      });
    }
  });

  it("stores standby source frames once and derives an endpoint-exclusive 62-frame loop", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const sources = buildActionFramePlan(manifest, "standby");
    const playback = buildActionPlaybackPlan(manifest, "standby");

    expect(sources).toHaveLength(32);
    expect(playback).toHaveLength(62);
    expect(playback.slice(0, 32)).toEqual(sources.map((frame: { frameName: string }) => frame.frameName));
    expect(playback.slice(32)).toEqual(sources.slice(1, -1).reverse().map((frame: { frameName: string }) => frame.frameName));
    expect(playback[0]).toBe("standby_0000.png");
    expect(playback.at(-1)).toBe("standby_0001.png");
    expect(manifest.characterActions[0].visualAnchor).toBe("seat");
  });

  it("keeps the selected orchestration screen separate from the monitor shell", async () => {
    const proof = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "proof", "screens", "orchestration-user-approved-v1", "report.json",
    ), "utf8"));
    const atlas1x = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "runtime-v3", "screens", "orchestration@1x.webp.json",
    ), "utf8"));
    const atlas2x = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "runtime-v3", "screens", "orchestration@2x.webp.json",
    ), "utf8"));

    expect(proof).toMatchObject({
      status: "user-selected",
      source: { width: 912, height: 430, frames: 145, fps: 20 },
      separation: { monitorShellIncluded: false, characterIncluded: false, screenContentOnly: true },
    });
    expect(atlas1x.animations.orchestration).toHaveLength(145);
    expect(atlas2x.animations.orchestration).toHaveLength(145);
    expect(atlas1x.meta).toMatchObject({ scale: 1, animation: { fps: 20, loop: true } });
    expect(atlas2x.meta).toMatchObject({ scale: 2, animation: { fps: 20, loop: true } });
    expect(atlas1x.frames["orchestration_0001.png"].sourceSize).toEqual({ w: 456, h: 215 });
    expect(atlas2x.frames["orchestration_0001.png"].sourceSize).toEqual({ w: 912, h: 430 });
  });

  it("packs two entertainment profiles and one independent transparent coffee effect", async () => {
    for (const profileId of ["entertainment-1", "entertainment-2"]) {
      const proof = JSON.parse(await readFile(join(
        "design-assets", "agent-office", "proof", "screens", `${profileId}-user-approved-v1`, "report.json",
      ), "utf8"));
      const atlas = JSON.parse(await readFile(join(
        "design-assets", "agent-office", "runtime-v3", "screens", `${profileId}@2x.webp.json`,
      ), "utf8"));
      expect(proof).toMatchObject({
        status: "user-confirmed-production-authorized",
        source: { width: 228, height: 108, frames: 102, fps: 24 },
        separation: { monitorShellIncluded: false, characterIncluded: false, screenContentOnly: true },
      });
      expect(atlas.animations[profileId]).toHaveLength(102);
      expect(atlas.meta.animation).toEqual({ fps: 24, loop: true });
    }
    const effectReport = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "proof", "effects", "coffee-cup-user-approved-v1", "report.json",
    ), "utf8"));
    const effectAtlas = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "runtime-v3", "effects", "coffee-cup@2x.webp.json",
    ), "utf8"));
    expect(effectReport).toMatchObject({
      status: "user-confirmed-production-authorized",
      admitted: { width: 1068, height: 800, uniqueFrames: 25, fps: 24, loop: true, alpha: true },
      composition: { owner: "coffee-facility-effect", overlaysCoffeeDrinkActor: false },
    });
    expect(effectAtlas.animations["coffee-cup"]).toHaveLength(25);
    expect(effectAtlas.meta.animation).toEqual({ fps: 24, loop: true });
  });

  it("admits the selected desk only after alpha and preservation gates pass", async () => {
    const report = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "proof", "props", "standard-desk-v2", "standard-desk-v2-source-cutout-report.json",
    ), "utf8"));
    const desk = await sharp(join("design-assets", "agent-office", "approved", "props", "standard-desk.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(report).toMatchObject({
      visibleKeyPixels: 0,
      transparentNonZeroRgb: 0,
      preservation: { protectedPixelChanges: 0 },
    });
    expect(desk.info.channels).toBe(4);
    expect(desk.data.some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
  });

  it("packs the ten approved props and four baked shadow maps", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const expectedFrames = [...manifest.props, ...manifest.shadows].map((prop: { id: string }) => `${prop.id}.png`);
    const runtimeRoot = join("design-assets", "agent-office", "runtime-v3", "props");
    const publicRoot = join("src", "web", "public", "agent-office", "props");
    for (const resolution of ["1x", "2x"]) {
      const imageName = `office-props@${resolution}.webp`;
      const atlas = JSON.parse(await readFile(join(runtimeRoot, `${imageName}.json`), "utf8"));
      expect(Object.keys(atlas.frames)).toEqual(expectedFrames);
      expect(atlas.animations["office-props"]).toEqual(expectedFrames);
      expect(await readFile(join(publicRoot, imageName))).toEqual(await readFile(join(runtimeRoot, imageName)));
      expect(await readFile(join(publicRoot, `${imageName}.json`))).toEqual(await readFile(join(runtimeRoot, `${imageName}.json`)));
    }
    expect(expectedFrames).not.toEqual(expect.arrayContaining([
      "standard-keyboard.png",
      "main-keyboard.png",
      "main-monitor.png",
    ]));
    const receipt = JSON.parse(await readFile(join("design-assets", "agent-office", "runtime-v3", "build-receipt.json"), "utf8"));
    expect(receipt.propsAtlases).toEqual({
      "1x": {
        imageSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        metadataSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      "2x": {
        imageSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        metadataSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it("normalizes only declared prop orientation and transforms screen anchors", () => {
    expect(transformPropAnchors({ seat: { x: 827, y: 770 } }, "flip-y", 1654, 951)).toEqual({ seat: { x: 827, y: 181 } });
    expect(transformPropAnchors({
      "screen-top-left": { x: 250, y: 180 },
      "screen-bottom-right": { x: 1305, y: 700 },
    }, "flip-y", 1557, 1010)).toEqual({
      "screen-top-left": { x: 250, y: 310 },
      "screen-bottom-right": { x: 1305, y: 830 },
    });
  });

  it("records one calibrated chair and ground line in the legacy chair proof", async () => {
    const report = JSON.parse(await readFile(join(
      "design-assets",
      "agent-office",
      "proof",
      "workstations",
      "standard-chair-v3",
      "standard-chair-v3-report.json",
    ), "utf8"));

    expect(report).toMatchObject({
      canvas: { width: 960, height: 960 },
      chair: { left: 545, top: 463, width: 360, height: 412, baseline: 875 },
      actorGroundLine: 874,
      seatAnchor: { x: 725, y: 550 },
      landmarkScale: {
        workingScarfWidth: { median: 195 },
        offChairScarfWidth: { median: 197 },
      },
      shadow: { owner: "Pixi workstation shadow layer", bakedIntoAssets: false },
      layerOrder: ["workstation-shadow", "actor", "chair-foreground"],
    });
    expect(Math.abs(report.landmarkScale.medianRatio - 1)).toBeLessThan(0.03);
  });

  it("keeps the user-calibrated treadmill size and uses only the treadmill action", async () => {
    const treadmillRoot = join("design-assets", "agent-office", "proof", "actions", "treadmill", "video16-tail-safe");
    const treadmillReport = JSON.parse(await readFile(join(treadmillRoot, "report.json"), "utf8"));
    const calibration = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "calibration", "treadmill", "user-calibration.json",
    ), "utf8"));
    const facilityReport = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "proof", "facilities", "treadmill-user-relative-v5", "report.json",
    ), "utf8"));

    expect(calibration).toMatchObject({
      treadmillActionProof: "video16-tail-safe",
      treadmillActionFixedScale: 2.074468085106383,
      actorScaleBasis: 0.5,
      referenceGroupScale: 0.9,
      treadmillScalePerActorScale: 1.23,
    });
    expect(calibration.actorScaleBasis * calibration.referenceGroupScale).toBeCloseTo(0.45, 12);
    expect(calibration.actorScaleBasis * calibration.treadmillScalePerActorScale * calibration.referenceGroupScale).toBeCloseTo(0.5535, 12);
    expect(treadmillReport.normalization.fixedScale).toBeCloseTo(calibration.treadmillActionFixedScale, 12);
    expect(facilityReport.interactionSequence.phases).toEqual([
      { id: "run-forward", frames: 45, anchor: "ground" },
      { id: "run-reverse", frames: 45, anchor: "ground" },
    ]);
    expect(facilityReport.interactionSequence.frameCount).toBe(90);
    expect(facilityReport.interactionSequence.reversePlaybackActions).toEqual(["treadmill"]);
    expect(facilityReport.interactionSequence.usesOneActorActionOnly).toBe(true);
  });

  it("keeps reverse treadmill playback separate from the mirrored return walk", async () => {
    const report = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "proof", "facilities", "treadmill-complete-interaction-v2", "report.json",
    ), "utf8"));

    expect(report.proofKind).toBe("complete-facility-interaction");
    expect(report.interactionSequence.phases).toEqual([
      { id: "leaving-to-facility", frames: 48, playback: "forward" },
      { id: "run-forward", frames: 45, playback: "forward" },
      { id: "run-reverse", frames: 45, playback: "reverse" },
      { id: "leaving-return", frames: 48, playback: "forward", mirrored: true },
    ]);
    expect(report.interactionSequence.frameCount).toBe(186);
    expect(report.interactionSequence.reversePlaybackActions).toEqual(["treadmill"]);
    expect(report.interactionSequence.mirroredPlaybackActions).toEqual(["leaving-return"]);
    expect(report.proofComposite.switchAnchor).toBe("visible-center");
    expect(report.proofComposite.switchError.x).toBeLessThanOrEqual(0.5);
    expect(report.proofComposite.switchError.y).toBeLessThanOrEqual(0.5);
  });

  it("materializes the user-calibrated toilet without changing actor scale", async () => {
    const calibration = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "calibration", "toilet", "user-calibration.json",
    ), "utf8"));
    const report = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "proof", "facilities", "toilet-user-relative-v1", "report.json",
    ), "utf8"));

    expect(calibration).toEqual({
      schemaVersion: 1,
      kind: "relative-toilet-actor-calibration",
      actorScaleBasis: 1,
      toiletScalePerActorScale: 0.315,
      actorOriginFromToiletInActorScaleUnits: { x: 69, y: -58 },
      paper: {
        scalePerActorScale: 0.175,
        originFromToiletInActorScaleUnits: { x: 353, y: -48 },
      },
      tailOccluderFromToiletInActorScaleUnits: { x: 58, y: 164, width: 124, height: 88 },
    });
    expect(report.calibration).toEqual(calibration);
    expect(report.calibrationPlacement).toMatchObject({
      toilet: { scale: 0.315 },
      actor: { x: 329, y: 132, scale: 1 },
      paper: { x: 613, y: 142, scale: 0.175 },
      occluder: { x: 318, y: 354, width: 124, height: 88 },
    });
    expect(report.scaleNormalization).toMatchObject({
      referenceAction: "working",
      workingScarfWidth: 195,
      toiletScarfWidth: 108,
      runtimeActorScale: 0.45,
    });
    expect(report.scaleNormalization.offlineActorSourceNormalizationToWorking).toBeCloseTo(195 / 108, 12);
    expect(report.scaleNormalization.calibrationToWorldScale).toBeCloseTo((195 / 108) * 0.45, 12);
    expect(report.proofPlacementFromRawSources.actor.runtimeSpriteScaleAfterOfflineNormalization).toBe(0.45);
    expect(
      report.proofPlacementFromRawSources.toilet.rawSourceScale
        / report.proofPlacementFromRawSources.actor.rawSourceProofScale,
    ).toBeCloseTo(0.315, 12);
    expect(
      report.proofPlacementFromRawSources.paper.rawSourceScale
        / report.proofPlacementFromRawSources.actor.rawSourceProofScale,
    ).toBeCloseTo(0.175, 12);
    expect(report.layerOrder).toEqual(["toilet-back", "actor", "tail-only-occluder", "toilet-paper"]);
    expect(report.validation).toMatchObject({
      actorScaleChanged: false,
      facilityRatiosChanged: false,
      fullToiletForegroundUsed: false,
      bakedShadowUsed: false,
    });
    expect(report.validation.occludedActorPixels).toBeGreaterThan(0);
  });

  it("keeps the complete toilet action on one fixed transform", async () => {
    const report = JSON.parse(await readFile(join(
      "design-assets", "agent-office", "proof", "actions", "toilet-video17-complete-v1", "report.json",
    ), "utf8"));

    expect(report.source).toEqual({ width: 752, height: 560, fps: 24, frameCount: 121 });
    expect(report.sourceCrop).toEqual({ left: 40, top: 10, width: 672, height: 510 });
    expect(report.playback).toMatchObject({ mode: "direct", fps: 24, frameCount: 121 });
    expect(report.normalization).toMatchObject({ referenceAction: "working", runtimeActorScale: 0.45 });
    expect(report.placement).toMatchObject({ perFrameFit: false, perFrameRecenter: false });
    expect(report.layerOrder).toEqual(["toilet-back", "actor", "tail-only-occluder", "toilet-paper"]);
    expect(report.interactionSequence.phases).toEqual([
      { id: "approach", action: "leaving", playback: "forward", destination: "toilet-contact" },
      { id: "sit-and-use", action: "toilet", playback: "forward", frames: 121 },
      { id: "stable-hold", action: "toilet", frame: 120, previewFrames: 24 },
      { id: "stand-up", action: "toilet", playback: "reverse", frames: 120 },
      { id: "return", action: "leaving", playback: "forward", mirrored: true },
      { id: "restore-chair", action: "off-chair", playback: "reverse" },
    ]);
    expect(report.interactionSequence.roundTripPreviewFrameCount).toBe(265);
    expect(report.alpha).toMatchObject({
      visibleKeyPixels: 0,
      transparentNonZeroRgb: 0,
      protectedPixelChanges: 0,
    });
  });

  it("packs one reversible toilet atlas at both canonical resolutions", async () => {
    for (const [resolution, sourceSize, visualAnchor] of [
      ["1x", { w: 480, h: 480 }, { x: 274.5, y: 206 }],
      ["2x", { w: 960, h: 960 }, { x: 549, y: 412 }],
    ] as const) {
      const atlas = JSON.parse(await readFile(join(
        "design-assets", "agent-office", "runtime-v3", "actions", `toilet@${resolution}.webp.json`,
      ), "utf8"));
      expect(atlas.animations.toilet).toHaveLength(121);
      expect(atlas.animations.toilet[0]).toBe("toilet_0000.png");
      expect(atlas.animations.toilet.at(-1)).toBe("toilet_0120.png");
      expect(atlas.frames[atlas.animations.toilet[0]].sourceSize).toEqual(sourceSize);
      expect(atlas.meta.animation).toEqual({ fps: 24, loop: false });
      expect(atlas.meta.visualAnchor).toEqual(visualAnchor);
    }
  });

  it("creates one contiguous full-frame plan for a proof action", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const walking = buildActionFramePlan(manifest, "walk-horizontal");

    expect(walking).toHaveLength(49);
    expect(manifest.characterActions.find((action: { id: string }) => action.id === "walk-horizontal").visualAnchor).toBe("ground");
    expect(walking[0]).toMatchObject({ frameIndex: 0, frameName: "walk-horizontal_0000.png" });
    expect(walking[48]).toMatchObject({ frameIndex: 48, frameName: "walk-horizontal_0048.png" });
    expect(new Set(walking.map((frame: { frameName: string }) => frame.frameName)).size).toBe(49);
  });

  it("keeps every approved horizontal-walk frame clear of the canvas edge", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    await expect(validateApprovedActionSources(manifest, process.cwd(), "walk-horizontal")).resolves.toMatchObject({
      actionId: "walk-horizontal",
      frameCount: 49,
    });
  });

  it("rejects reordered runtime actions", async () => {
    const manifest = await loadOfficeAssetManifest(manifestPath);
    const changed = structuredClone(manifest);
    [changed.characterActions[0], changed.characterActions[1]] = [changed.characterActions[1], changed.characterActions[0]];

    expect(() => validateOfficeAssetManifest(changed)).toThrow("canonical order");
  });
});

describe("office asset image pipeline", () => {
  it("removes only edge-connected key background and zeros transparent RGB", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-cutout-"));
    temporaryDirectories.push(root);
    const input = join(root, "parts.png");
    await createCutoutFixture(input);

    const result = await cutoutStagingMaster(input, join(root, "proof"), {
      maximumVisibleKeyPixels: 0,
    });
    const { data, info } = await sharp(await readFile(result.cutoutPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(result.report.keyColor).toBe("#00ff00");
    expect(result.report.border.ratio).toBe(1);
    expect(result.report.visibleKeyPixels).toBe(0);
    expect(result.report.transparentNonZeroRgb).toBe(0);
    expect(result.report.preservation.protectedPixelChanges).toBe(0);
    expect([...data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    const enclosedBackgroundOffset = (24 * info.width + 24) * 4;
    expect([...data.subarray(enclosedBackgroundOffset, enclosedBackgroundOffset + 4)]).toEqual([0, 0, 0, 0]);
    const protectedOffset = (30 * info.width + 25) * 4;
    expect([...data.subarray(protectedOffset, protectedOffset + 4)]).toEqual([18, 31, 20, 255]);
    expect(info.channels).toBe(4);
  });

  it("removes detached background matte without changing protected character pixels", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-cutout-shadow-"));
    temporaryDirectories.push(root);
    const input = join(root, "shadow.png");
    const width = 64;
    const height = 64;
    const source = Buffer.alloc(width * height * 4);
    for (let offset = 0; offset < source.length; offset += 4) {
      source[offset + 1] = 255;
      source[offset + 3] = 255;
    }
    paintRect(source, width, 20, 12, 24, 30, [24, 24, 24, 255]);
    paintRect(source, width, 12, 50, 40, 3, [12, 96, 12, 255]);
    await sharp(source, { raw: { width, height, channels: 4 } }).png().toFile(input);

    const result = await cutoutStagingMaster(input, join(root, "proof"));
    const output = await sharp(result.cutoutPath).ensureAlpha().raw().toBuffer();
    const characterOffset = (20 * width + 30) * 4;
    const shadowOffset = (51 * width + 30) * 4;
    expect([...output.subarray(characterOffset, characterOffset + 4)]).toEqual([24, 24, 24, 255]);
    expect([...output.subarray(shadowOffset, shadowOffset + 4)]).toEqual([0, 0, 0, 0]);
    expect(result.report.preservation.protectedPixelChanges).toBe(0);
    expect(result.report.preservation.detachedBackgroundMattePixelsRemoved).toBeGreaterThan(0);
  });

  it("preserves every protected interior RGBA byte", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-cutout-preservation-"));
    temporaryDirectories.push(root);
    const input = join(root, "character.png");
    const width = 48;
    const height = 48;
    const source = Buffer.alloc(width * height * 4);
    for (let offset = 0; offset < source.length; offset += 4) {
      source[offset + 1] = 255;
      source[offset + 3] = 255;
    }
    paintRect(source, width, 10, 10, 28, 28, [18, 31, 20, 255]);
    paintRect(source, width, 16, 16, 16, 16, [22, 38, 24, 255]);
    paintRect(source, width, 20, 20, 8, 8, [201, 100, 66, 255]);
    await sharp(source, { raw: { width, height, channels: 4 } }).png().toFile(input);

    const result = await cutoutStagingMaster(input, join(root, "proof"));
    const output = await sharp(result.cutoutPath).ensureAlpha().raw().toBuffer();
    for (let y = 10; y < 38; y += 1) {
      for (let x = 10; x < 38; x += 1) {
        const offset = (y * width + x) * 4;
        expect([...output.subarray(offset, offset + 4)]).toEqual([...source.subarray(offset, offset + 4)]);
      }
    }
    expect(result.report.preservation.protectedPixelChanges).toBe(0);
  });

  it("rejects a nonuniform staging border before cutout", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-cutout-border-"));
    temporaryDirectories.push(root);
    const input = join(root, "bad-border.png");
    await createCutoutFixture(input, { noisyBorder: true });

    await expect(cutoutStagingMaster(input, join(root, "proof"), {
      minimumUniformBorderRatio: 0.99,
    })).rejects.toThrow("background is not flat enough");
  });

  it("extracts ordered complete characters without equal-cell cropping", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-proof-phase-"));
    temporaryDirectories.push(root);
    const input = join(root, "phase.png");
    await createProofBoard(input);

    const result = await extractProofPhase(input, {
      repositoryRoot: root,
      actionId: "standby",
      phaseId: "phase-01",
      firstFrame: 0,
      frameCount: 6,
      columns: 3,
      rows: 2,
    });

    expect(result.report.frames.map((frame: { frameName: string }) => frame.frameName)).toEqual([
      "standby_0000.png",
      "standby_0001.png",
      "standby_0002.png",
      "standby_0003.png",
      "standby_0004.png",
      "standby_0005.png",
    ]);
    expect(result.report.totals).toEqual({ visibleKeyPixels: 0, transparentNonZeroRgb: 0 });
    expect(result.report.canvasAnchorDrift).toEqual({ x: 0, y: 0 });
    expect(await readFile(result.report.outputs.contactSheet)).not.toHaveLength(0);
    expect(JSON.parse(await readFile(result.report.outputs.anchorReport, "utf8"))).toMatchObject({
      actionId: "standby:phase-01",
      frameCount: 6,
    });
    const first = await sharp(join(root, "design-assets", "agent-office", "proof", "actions", "standby", "extracted", "standby_0000.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(first.info.channels).toBe(4);
    expect(first.data.some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
  });

  it("extracts a partial final row from a gridded board without retaining grid lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-proof-grid-"));
    temporaryDirectories.push(root);
    const input = join(root, "working-grid.jpg");
    await createGridProofBoard(input);

    const result = await extractGridProofAction(input, {
      repositoryRoot: root,
      actionId: "working",
      frameCount: 5,
      columns: 3,
      rows: 2,
      gridInset: 6,
      frameWidth: 96,
      frameHeight: 104,
    });

    expect(result.report.frames.map((frame: { frameName: string }) => frame.frameName)).toEqual([
      "working_0000.png",
      "working_0001.png",
      "working_0002.png",
      "working_0003.png",
      "working_0004.png",
    ]);
    expect(result.report.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.report.totals).toEqual({ visibleKeyPixels: 0, transparentNonZeroRgb: 0 });
    expect(await readFile(result.report.outputs.alphaQa)).not.toHaveLength(0);
    expect(JSON.parse(await readFile(result.report.outputs.motionReport, "utf8"))).toMatchObject({
      actionId: "working:manual-grid",
      frameCount: 5,
      summary: { adjacentMinimum: expect.any(Number), adjacentMaximum: expect.any(Number), loopSeamDifference: expect.any(Number) },
    });
    const first = await sharp(join(root, "design-assets", "agent-office", "proof", "actions", "working", "extracted", "working_0000.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(first.data.some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
    const partialEdgeChroma = [];
    for (let offset = 0; offset < first.data.length; offset += 4) {
      const alpha = first.data[offset + 3];
      if (alpha === 0 || alpha === 255) continue;
      partialEdgeChroma.push(Math.max(first.data[offset], first.data[offset + 1], first.data[offset + 2]) - Math.min(first.data[offset], first.data[offset + 1], first.data[offset + 2]));
    }
    expect(Math.max(...partialEdgeChroma)).toBeLessThanOrEqual(24);
  });

  it("preserves canonical source geometry and writes a trim-only ordered WebP/Pixi atlas", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-assets-"));
    temporaryDirectories.push(root);
    const names = Array.from({ length: 6 }, (_, index) => `test-action_${String(index).padStart(4, "0")}.png`);
    const inputs = await Promise.all(names.map(async (name, index) => ({ name, path: await writeTransparentFrame(root, index) })));
    const sequence = await readCanonicalFullCharacterSequence(inputs, {
      frameWidth: 96,
      frameHeight: 104,
      anchor: { x: 0, y: 0 },
      validation: {
        alphaThreshold: 16,
        visibleKeyPixels: 0,
        transparentNonZeroRgb: 0,
      },
    });
    const frames = sequence.frames;
    expect(frames.map((frame: { bounds: { left: number; top: number } }) => ({ left: frame.bounds.left, top: frame.bounds.top }))).toEqual(
      Array.from({ length: 6 }, (_, index) => ({ left: 18 + index, top: 14 + index })),
    );
    await assertDistinctFrames(frames, 0.1);

    const outputImage = join(root, "test-action@2x.webp");
    const outputJson = `${outputImage}.json`;
    const atlas = await packPixiAtlas(frames, {
      animationId: "test-action",
      outputImage,
      outputJson,
      padding: 2,
      maxWidth: 512,
      scale: 2,
      fps: 10,
      loop: true,
    });
    const metadata = await sharp(await readFile(outputImage)).metadata();
    const persisted = JSON.parse(await readFile(outputJson, "utf8"));

    expect(metadata.format).toBe("webp");
    expect(Object.keys(atlas.frames)).toEqual(names);
    expect(persisted.animations["test-action"]).toEqual(names);
    expect(persisted.meta).toMatchObject({ scale: 2, animation: { fps: 10, loop: true } });
    expect(Object.values(persisted.frames)).toHaveLength(6);
    expect(buildAnchorReport("test-action", frames).canvasAnchorDrift).toEqual({ x: 0, y: 0 });
    expect(persisted.frames[names[0]]).toMatchObject({
      spriteSourceSize: { x: 18, y: 14, w: 30, h: 58 },
      sourceSize: { w: 96, h: 104 },
      anchor: { x: 0, y: 0 },
    });

    const oneX = await deriveCanonicalResolution(sequence, {
      factor: 0.5,
      frameWidth: 48,
      frameHeight: 52,
      anchor: { x: 0, y: 0 },
      validation: { alphaThreshold: 16, visibleKeyPixels: 0, transparentNonZeroRgb: 0 },
    });
    expect(oneX.frames.every((frame: { sourceSize: { width: number; height: number } }) => frame.sourceSize.width === 48 && frame.sourceSize.height === 52)).toBe(true);

    const previewPath = join(root, "test-action-preview.webp");
    await writeAnimatedPreview(frames, previewPath, { fps: 12, loop: true });
    const previewMetadata = await sharp(await readFile(previewPath), { animated: true }).metadata();
    expect(previewMetadata).toMatchObject({ format: "webp", pages: 6, pageHeight: 104, loop: 0 });
    expect(previewMetadata.delay).toEqual(Array.from({ length: 6 }, () => 83));
  });

  it("fails closed instead of fitting a noncanonical source frame", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-wrong-canvas-"));
    temporaryDirectories.push(root);
    const path = join(root, "wrong.png");
    await sharp({ create: { width: 80, height: 96, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toFile(path);

    await expect(readCanonicalFullCharacterSequence([{ name: "wrong.png", path }], {
      frameWidth: 96,
      frameHeight: 104,
      validation: { alphaThreshold: 16, visibleKeyPixels: 0, transparentNonZeroRgb: 0 },
    })).rejects.toThrow("must be 96x104");
  });

  it("applies one recorded import transform while preserving authored displacement", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-fixed-transform-"));
    temporaryDirectories.push(root);
    const first = await writeCroppedFrame(root, "first.png", 10);
    const second = await writeCroppedFrame(root, "second.png", 18);
    const sequence = await transformImportedFramesToCanonicalCanvas([
      { name: "first.png", path: first, sourcePlacement: { left: 30, top: 20 } },
      { name: "second.png", path: second, sourcePlacement: { left: 54, top: 20 } },
    ], {
      frameWidth: 96,
      frameHeight: 104,
      scale: 0.5,
      translateX: 10,
      translateY: 12,
      validation: { alphaThreshold: 16, visibleKeyPixels: 0, transparentNonZeroRgb: 0 },
    });

    expect(sequence.transform).toEqual({ scale: 0.5, translateX: 10, translateY: 12 });
    expect(sequence.frames.map((frame: { bounds: { left: number; top: number; width: number } }) => frame.bounds)).toEqual([
      { left: 25, top: 22, width: 10, height: 16 },
      { left: 37, top: 22, width: 10, height: 16 },
    ]);
  });

  it("stabilizes a seated sequence on its scarf band and visible bottom", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-stabilized-"));
    temporaryDirectories.push(root);
    const first = join(root, "first.png");
    const second = join(root, "second.png");
    await writeStabilizationFrame(first, { left: 8, top: 10, scarfLeft: 14 });
    await writeStabilizationFrame(second, { left: 19, top: 4, scarfLeft: 27 });

    const sequence = await transformImportedFramesToCanonicalCanvas([
      { name: "first.png", path: first, sourcePlacement: { left: 0, top: 0 } },
      { name: "second.png", path: second, sourcePlacement: { left: 0, top: 0 } },
    ], {
      frameWidth: 96,
      frameHeight: 104,
      scale: 1,
      translateX: 0,
      translateY: 0,
      stabilization: {
        type: "scarf-band-and-visible-bottom",
        target: { x: 52, y: 78 },
        minimumPixels: 20,
      },
      validation: { alphaThreshold: 16, visibleKeyPixels: 0, transparentNonZeroRgb: 0 },
    });

    expect(buildAnchorReport("stabilized", sequence.frames)).toMatchObject({
      stabilizationAnchorDrift: { x: 0, y: 0 },
      stabilizationAnchorRange: { x: { min: 52, max: 52 }, y: { min: 78, max: 78 } },
    });
  });

  it("fails closed when complete-character frames are duplicates", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-office-duplicate-"));
    temporaryDirectories.push(root);
    const path = await writeTransparentFrame(root, 0);
    const sequence = await readCanonicalFullCharacterSequence([
      { name: "duplicate_0.png", path },
      { name: "duplicate_1.png", path },
    ], {
      frameWidth: 96,
      frameHeight: 104,
      validation: {
        alphaThreshold: 16,
        visibleKeyPixels: 0,
        transparentNonZeroRgb: 0,
      },
    });

    await expect(assertDistinctFrames(sequence.frames, 0.1)).rejects.toThrow("duplicate or near-duplicate");
  });
});

async function writeTransparentFrame(root: string, frame: number): Promise<string> {
  const width = 96;
  const height = 104;
  const data = Buffer.alloc(width * height * 4);
  const shapeLeft = 18 + frame;
  const shapeTop = 14 + frame;
  const shapeWidth = 30 + frame;
  const shapeHeight = 58 - frame;
  for (let y = shapeTop; y < shapeTop + shapeHeight; y += 1) {
    for (let x = shapeLeft; x < shapeLeft + shapeWidth; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 20 + frame * 12;
      data[offset + 1] = 20;
      data[offset + 2] = 20;
      data[offset + 3] = 255;
    }
  }
  const path = join(root, `frame-${frame}.png`);
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(path);
  return path;
}

async function writeCroppedFrame(root: string, name: string, color: number): Promise<string> {
  const path = join(root, name);
  await sharp({ create: { width: 20, height: 32, channels: 4, background: { r: color, g: color, b: color, alpha: 1 } } }).png().toFile(path);
  return path;
}

async function writeStabilizationFrame(path: string, options: { left: number; top: number; scarfLeft: number }): Promise<void> {
  const width = 64;
  const height = 80;
  const data = Buffer.alloc(width * height * 4);
  paintRect(data, width, options.left, options.top, 36, 54, [24, 24, 24, 255]);
  paintRect(data, width, options.scarfLeft, options.top + 20, 21, 6, [201, 100, 66, 255]);
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(path);
}

async function createCutoutFixture(path: string, options: { noisyBorder?: boolean } = {}): Promise<void> {
  const width = 96;
  const height = 96;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const noisy = options.noisyBorder && y < 8 && x % 2 === 0;
      data[offset] = noisy ? 80 : 0;
      data[offset + 1] = noisy ? 160 : 255;
      data[offset + 2] = noisy ? 80 : 0;
      data[offset + 3] = 255;
    }
  }
  paintRect(data, width, 18, 18, 22, 40, [24, 24, 24, 255]);
  paintRect(data, width, 24, 24, 2, 2, [0, 255, 0, 255]);
  paintRect(data, width, 25, 30, 1, 1, [18, 31, 20, 255]);
  paintRect(data, width, 58, 22, 20, 36, [201, 100, 66, 255]);
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(path);
}

async function createProofBoard(path: string): Promise<void> {
  const width = 600;
  const height = 400;
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset + 1] = 255;
    data[offset + 3] = 255;
  }
  const poses = [
    [45, 45, 160, 120],
    [218, 35, 188, 130],
    [420, 50, 145, 115],
    [35, 235, 170, 120],
    [225, 225, 165, 135],
    [410, 240, 155, 112],
  ] as const;
  poses.forEach(([left, top, poseWidth, poseHeight], index) => {
    paintRect(data, width, left, top, poseWidth, poseHeight, [20 + index, 20, 20, 255]);
  });
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(path);
}

async function createGridProofBoard(path: string): Promise<void> {
  const width = 360;
  const height = 240;
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset + 1] = 255;
    data[offset + 3] = 255;
  }
  for (const x of [0, 120, 240, 359]) paintRect(data, width, x, 0, x === 359 ? 1 : 3, height, [0, 0, 0, 255]);
  for (const y of [0, 120, 239]) paintRect(data, width, 0, y, width, y === 239 ? 1 : 3, [0, 0, 0, 255]);
  const poses = [
    [30, 25, 54, 70],
    [150, 24, 56, 72],
    [270, 23, 58, 74],
    [30, 145, 60, 68],
    [150, 144, 62, 70],
  ] as const;
  poses.forEach(([left, top, poseWidth, poseHeight], index) => {
    paintRect(data, width, left, top, poseWidth, poseHeight, [20 + index * 8, 20, 20, 255]);
  });
  await sharp(data, { raw: { width, height, channels: 4 } }).jpeg({ quality: 95 }).toFile(path);
}

function paintRect(data: Buffer, width: number, left: number, top: number, rectWidth: number, rectHeight: number, color: [number, number, number, number]): void {
  for (let y = top; y < top + rectHeight; y += 1) {
    for (let x = left; x < left + rectWidth; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }
}
