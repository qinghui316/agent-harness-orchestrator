#!/usr/bin/env node

/* global Buffer, process */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const CANONICAL_PROP = { width: 384, height: 416, visibleWidth: 360, bottomPadding: 12 };
const PROOF_CANVAS = { width: 1200, height: 960 };
const TREADMILL_VISUAL_ANCHOR = { x: 700, y: 874 };
const WALK_VISUAL_ANCHOR = { x: 480, y: 874 };
const ACTOR_SCALE = 0.5;
const PROOF_TREADMILL_ORIGIN = { x: 100, y: 292 };

export async function buildTreadmillFacilityProof(propPath, actorRoot, outputRoot, calibrationPath) {
  const propMetadata = await sharp(propPath).metadata();
  if (!propMetadata.width || !propMetadata.height || !propMetadata.hasAlpha) {
    throw new Error("Treadmill proof requires a transparent prop source.");
  }
  const propBounds = await readAlphaBounds(propPath);
  const belt = await detectTreadmillBelt(propPath, propBounds);
  const relativeCalibration = validateUserCalibration(JSON.parse(await readFile(calibrationPath, "utf8")));
  const calibration = materializeProofCalibration(relativeCalibration);
  const actors = (await readdir(actorRoot)).filter((name) => name.endsWith(".png")).sort();
  if (actors.length !== 45) throw new Error(`Treadmill proof requires 45 actor frames; received ${actors.length}.`);
  const actorCanvas = await readSequenceCanvas(actorRoot, actors);
  await mkdir(outputRoot, { recursive: true });

  const canonicalScale = CANONICAL_PROP.visibleWidth / propBounds.width;
  const canonicalHeight = Math.round(propBounds.height * canonicalScale);
  const canonicalPlacement = {
    left: Math.round((CANONICAL_PROP.width - CANONICAL_PROP.visibleWidth) / 2),
    top: CANONICAL_PROP.height - CANONICAL_PROP.bottomPadding - canonicalHeight,
  };
  const canonicalProp = await sharp({
    create: { width: CANONICAL_PROP.width, height: CANONICAL_PROP.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: await sharp(propPath).extract(propBounds).resize({ width: CANONICAL_PROP.visibleWidth }).png().toBuffer(),
    ...canonicalPlacement,
  }]).png().toBuffer();
  const canonicalPath = join(outputRoot, "treadmill-canonical-candidate.png");
  await writeFile(canonicalPath, canonicalProp);

  const proofScale = calibration.treadmill.scale;
  const proofWidth = Math.round(propMetadata.width * proofScale);
  const proofHeight = Math.round(propMetadata.height * proofScale);
  const proofLeft = calibration.treadmill.x;
  const proofTop = calibration.treadmill.y;
  const walkAnchor = anchorForPlacement(calibration.walkEndpoint, WALK_VISUAL_ANCHOR);
  const runAnchor = anchorForPlacement(calibration.runAction, TREADMILL_VISUAL_ANCHOR);
  const propLayer = await sharp(propPath).resize({ width: proofWidth }).png().toBuffer();
  const composites = [];
  for (const actorFile of actors) composites.push(await composeFacilityFrame(
    propLayer,
    proofLeft,
    proofTop,
    join(actorRoot, actorFile),
    actorCanvas,
    runAnchor,
    TREADMILL_VISUAL_ANCHOR,
  ));

  const fullSequence = [
    ...composites,
    ...composites.slice().reverse(),
  ];
  const interactionKeyframes = [
    0,
    Math.floor(composites.length / 2),
    composites.length - 1,
    composites.length,
    composites.length + Math.floor(composites.length / 2),
    fullSequence.length - 1,
  ];

  const keyframeIndices = Array.from({ length: 5 }, (_, index) => Math.round(index * (composites.length - 1) / 4));
  await writeKeyframeStrip(composites, keyframeIndices, join(outputRoot, "treadmill-facility-keyframes.png"));
  await writeKeyframeStrip(fullSequence, interactionKeyframes, join(outputRoot, "treadmill-forward-reverse-keyframes.png"));
  await writeCalibrationDebug(composites[0], belt, proofScale, proofLeft, proofTop, walkAnchor, runAnchor, join(outputRoot, "treadmill-calibration-debug.png"));

  const frameRoot = await mkdtemp(join(tmpdir(), "aho-treadmill-facility-"));
  try {
    await Promise.all(composites.map((frame, index) => writeFile(join(frameRoot, `frame_${String(index).padStart(4, "0")}.png`), frame)));
    await execFileAsync("ffmpeg", [
      "-y", "-framerate", "16", "-i", join(frameRoot, "frame_%04d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      join(outputRoot, "treadmill-facility-preview.mp4"),
    ]);
  } finally {
    await rm(frameRoot, { recursive: true, force: true });
  }
  await writeMp4(fullSequence, join(outputRoot, "treadmill-forward-reverse-preview.mp4"), 16);

  const sourceContact = {
    x: (walkAnchor.x - proofLeft) / proofScale,
    y: (walkAnchor.y - proofTop) / proofScale,
  };
  const canonicalContact = {
    x: canonicalPlacement.left + (sourceContact.x - propBounds.left) * canonicalScale,
    y: canonicalPlacement.top + (sourceContact.y - propBounds.top) * canonicalScale,
  };
  const report = {
    schemaVersion: 1,
    facilityId: "treadmill",
    propSource: basename(propPath),
    calibrationSource: basename(calibrationPath),
    relativeCalibration,
    actorFrames: actors.length,
    canonicalProp: {
      canvas: CANONICAL_PROP,
      sourceVisibleBounds: propBounds,
      placement: canonicalPlacement,
      anchors: {
        "treadmill-contact": roundPoint(canonicalContact),
        "aisle-entry": { x: 366, y: 392 },
      },
      detectedBelt: belt,
    },
    proofComposite: {
      canvas: PROOF_CANVAS,
      propPlacement: { left: proofLeft, top: proofTop, width: proofWidth, height: proofHeight },
      actorScale: ACTOR_SCALE,
      actorCanvas,
      actorVisualAnchor: TREADMILL_VISUAL_ANCHOR,
      actorPlacement: calibration.runAction,
      runAnchor: roundPoint(runAnchor),
      walkEndpoint: calibration.walkEndpoint,
      walkAnchor: roundPoint(walkAnchor),
      layerOrder: ["facility-prop", "actor"],
    },
    interactionSequence: {
      fps: 16,
      phases: [
        { id: "run-forward", frames: composites.length, anchor: "ground" },
        { id: "run-reverse", frames: composites.length, anchor: "ground" },
      ],
      frameCount: fullSequence.length,
      reversePlaybackActions: ["treadmill"],
      usesOneActorActionOnly: true,
    },
    outputs: {
      canonicalCandidate: "treadmill-canonical-candidate.png",
      keyframes: "treadmill-facility-keyframes.png",
      preview: "treadmill-facility-preview.mp4",
      interactionPreview: "treadmill-forward-reverse-preview.mp4",
      interactionKeyframes: "treadmill-forward-reverse-keyframes.png",
      calibrationDebug: "treadmill-calibration-debug.png",
    },
    admission: "proof-only-pending-visual-acceptance",
  };
  await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function roundPoint(point) {
  return { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 };
}

async function readAlphaBounds(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("Treadmill prop is empty after alpha cutout.");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function detectTreadmillBelt(path, visibleBounds) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const candidates = new Uint8Array(info.width * info.height);
  const minimumX = Math.floor(visibleBounds.left + visibleBounds.width * 0.18);
  const minimumY = Math.floor(visibleBounds.top + visibleBounds.height * 0.45);
  const maximumY = Math.ceil(visibleBounds.top + visibleBounds.height * 0.9);
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x < visibleBounds.left + visibleBounds.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      if (data[offset + 3] > 160 && maximum >= 24 && maximum <= 145 && maximum - minimum <= 32) {
        candidates[y * info.width + x] = 1;
      }
    }
  }

  const visited = new Uint8Array(candidates.length);
  const queue = new Int32Array(candidates.length);
  let largest = null;
  for (let seed = 0; seed < candidates.length; seed += 1) {
    if (!candidates[seed] || visited[seed]) continue;
    let head = 0;
    let tail = 0;
    let left = info.width;
    let top = info.height;
    let right = -1;
    let bottom = -1;
    visited[seed] = 1;
    queue[tail++] = seed;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (const neighbor of [pixel - 1, pixel + 1, pixel - info.width, pixel + info.width]) {
        if (neighbor < 0 || neighbor >= candidates.length || visited[neighbor] || !candidates[neighbor]) continue;
        const neighborX = neighbor % info.width;
        if (Math.abs(neighborX - x) > 1) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (!largest || tail > largest.pixelCount) largest = { left, top, width: right - left + 1, height: bottom - top + 1, pixelCount: tail };
  }
  if (!largest || largest.pixelCount < 10_000) throw new Error("Unable to detect one stable treadmill belt component.");
  return largest;
}

async function writeCalibrationDebug(frame, belt, scale, proofLeft, proofTop, walkAnchor, runAnchor, outputPath) {
  const left = proofLeft + belt.left * scale;
  const top = proofTop + belt.top * scale;
  const width = belt.width * scale;
  const height = belt.height * scale;
  const overlay = Buffer.from(`<svg width="${PROOF_CANVAS.width}" height="${PROOF_CANVAS.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="none" stroke="#d12f2f" stroke-width="4"/><circle cx="${walkAnchor.x}" cy="${walkAnchor.y}" r="8" fill="#2f7d68"/><circle cx="${runAnchor.x}" cy="${runAnchor.y}" r="8" fill="#3b6ea8"/></svg>`);
  await sharp(frame).composite([{ input: overlay, left: 0, top: 0 }]).png().toFile(outputPath);
}

function validateUserCalibration(calibration) {
  if (calibration?.schemaVersion !== 1) throw new Error("Treadmill calibration schemaVersion must be 1.");
  if (calibration.kind !== "relative-facility-actor-calibration") throw new Error("Treadmill calibration must contain relative facility/actor geometry.");
  if (calibration.actorScaleBasis !== ACTOR_SCALE) throw new Error("Treadmill calibration cannot change the shared actor scale basis.");
  for (const [label, value] of Object.entries({
    treadmillScalePerActorScale: calibration.treadmillScalePerActorScale,
    walkX: calibration.walkEndpointOriginFromTreadmillInActorScaleUnits?.x,
    walkY: calibration.walkEndpointOriginFromTreadmillInActorScaleUnits?.y,
    runX: calibration.runActionOriginFromTreadmillInActorScaleUnits?.x,
    runY: calibration.runActionOriginFromTreadmillInActorScaleUnits?.y,
  })) {
    if (!Number.isFinite(value)) throw new Error(`Treadmill calibration ${label} must be finite.`);
  }
  if (!(calibration.treadmillScalePerActorScale > 0)) throw new Error("Treadmill relative scale must be positive.");
  return calibration;
}

function materializeProofCalibration(calibration) {
  return {
    treadmill: {
      ...PROOF_TREADMILL_ORIGIN,
      scale: ACTOR_SCALE * calibration.treadmillScalePerActorScale,
    },
    runAction: {
      x: PROOF_TREADMILL_ORIGIN.x + calibration.runActionOriginFromTreadmillInActorScaleUnits.x * ACTOR_SCALE,
      y: PROOF_TREADMILL_ORIGIN.y + calibration.runActionOriginFromTreadmillInActorScaleUnits.y * ACTOR_SCALE,
    },
    walkEndpoint: {
      x: PROOF_TREADMILL_ORIGIN.x + calibration.walkEndpointOriginFromTreadmillInActorScaleUnits.x * ACTOR_SCALE,
      y: PROOF_TREADMILL_ORIGIN.y + calibration.walkEndpointOriginFromTreadmillInActorScaleUnits.y * ACTOR_SCALE,
    },
  };
}

function anchorForPlacement(placement, visualAnchor) {
  return {
    x: placement.x + visualAnchor.x * ACTOR_SCALE,
    y: placement.y + visualAnchor.y * ACTOR_SCALE,
  };
}

async function readSequenceCanvas(root, files) {
  const first = await sharp(join(root, files[0])).metadata();
  if (!first.width || !first.height) throw new Error("Action frame has no dimensions.");
  for (const file of files.slice(1)) {
    const metadata = await sharp(join(root, file)).metadata();
    if (metadata.width !== first.width || metadata.height !== first.height) throw new Error("Action frame canvas drifts within the sequence.");
  }
  return { width: first.width, height: first.height };
}

async function composeFacilityFrame(propLayer, proofLeft, proofTop, actorPath, actorCanvas, anchor, visualAnchor, flip = false) {
  let actorPipeline = sharp(actorPath).resize({
    width: Math.round(actorCanvas.width * ACTOR_SCALE),
    height: Math.round(actorCanvas.height * ACTOR_SCALE),
    fit: "fill",
  });
  if (flip) actorPipeline = actorPipeline.flop();
  const actor = await actorPipeline.png().toBuffer();
  const placement = placementForAnchor(actorCanvas, anchor, visualAnchor, flip);
  return sharp({
    create: { ...PROOF_CANVAS, channels: 4, background: { r: 250, g: 249, b: 247, alpha: 1 } },
  }).composite([
    { input: propLayer, left: proofLeft, top: proofTop },
    { input: actor, ...placement },
  ]).png().toBuffer();
}

function placementForAnchor(actorCanvas, anchor, visualAnchor, flip = false) {
  const anchorX = flip ? actorCanvas.width - visualAnchor.x : visualAnchor.x;
  return {
    left: Math.round(anchor.x - anchorX * ACTOR_SCALE),
    top: Math.round(anchor.y - visualAnchor.y * ACTOR_SCALE),
  };
}

async function writeMp4(frames, outputPath, fps) {
  const root = await mkdtemp(join(tmpdir(), "aho-treadmill-sequence-"));
  try {
    await Promise.all(frames.map((frame, index) => writeFile(join(root, `frame_${String(index).padStart(4, "0")}.png`), frame)));
    await execFileAsync("ffmpeg", [
      "-y", "-framerate", String(fps), "-i", join(root, "frame_%04d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath,
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeKeyframeStrip(frames, indices, outputPath) {
  const width = 320;
  const height = Math.round(PROOF_CANVAS.height * width / PROOF_CANVAS.width);
  const keyframes = await Promise.all(indices.map((index) => sharp(frames[index]).resize(width, height).png().toBuffer()));
  await sharp({
    create: { width: width * keyframes.length, height, channels: 4, background: { r: 250, g: 249, b: 247, alpha: 1 } },
  }).composite(keyframes.map((input, index) => ({ input, left: index * width, top: 0 })))
    .png()
    .toFile(outputPath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [propPath, actorRoot, outputRoot, calibrationPath] = process.argv.slice(2).map((value) => resolve(process.cwd(), value));
  if (!propPath || !actorRoot || !outputRoot || !calibrationPath) throw new Error("Usage: treadmill-facility-proof.mjs <prop-png> <actor-root> <output-root> <calibration-json>");
  buildTreadmillFacilityProof(propPath, actorRoot, outputRoot, calibrationPath).then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`));
}
