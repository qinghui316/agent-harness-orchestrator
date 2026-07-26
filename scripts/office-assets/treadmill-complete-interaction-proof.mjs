#!/usr/bin/env node

/* global process */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const CANVAS = { width: 1200, height: 960 };
const ACTOR_SCALE = 0.5;
const TREADMILL_ORIGIN = { x: 100, y: 292 };
const ENTER_FRAMES = 48;
const ENTER_DISTANCE = 240;

export async function buildTreadmillCompleteInteractionProof(
  propPath,
  treadmillActorRoot,
  leavingActorRoot,
  outputRoot,
  calibrationPath,
) {
  const calibration = JSON.parse(await readFile(calibrationPath, "utf8"));
  validateCalibration(calibration);
  const treadmillFiles = await readFrames(treadmillActorRoot, 45);
  const leavingFiles = await readFrames(leavingActorRoot, 21);
  const treadmillCanvas = await readCanvas(treadmillActorRoot, treadmillFiles);
  const leavingCanvas = await readCanvas(leavingActorRoot, leavingFiles);
  const propMetadata = await sharp(propPath).metadata();
  if (!propMetadata.width || !propMetadata.height) throw new Error("Treadmill prop has no dimensions.");

  const propScale = ACTOR_SCALE * calibration.treadmillScalePerActorScale;
  const propLayer = await sharp(propPath).resize({ width: Math.round(propMetadata.width * propScale) }).png().toBuffer();
  const runOrigin = {
    x: TREADMILL_ORIGIN.x + calibration.runActionOriginFromTreadmillInActorScaleUnits.x * ACTOR_SCALE,
    y: TREADMILL_ORIGIN.y + calibration.runActionOriginFromTreadmillInActorScaleUnits.y * ACTOR_SCALE,
  };
  const runFirstBounds = await readAlphaBounds(join(treadmillActorRoot, treadmillFiles[0]));
  const leavingLastBounds = await readAlphaBounds(join(leavingActorRoot, leavingFiles.at(-1)));
  const switchCenter = worldCenter(runOrigin, runFirstBounds);
  const leavingEndpoint = originForWorldCenter(switchCenter, leavingLastBounds);
  const leavingStart = { x: leavingEndpoint.x + ENTER_DISTANCE, y: leavingEndpoint.y };
  const switchError = centerError(switchCenter, worldCenter(leavingEndpoint, leavingLastBounds));

  const enter = [];
  const mirroredReturn = [];
  for (let index = 0; index < ENTER_FRAMES; index += 1) {
    const sourceIndex = Math.round(index * (leavingFiles.length - 1) / (ENTER_FRAMES - 1));
    const progress = index / (ENTER_FRAMES - 1);
    const origin = interpolate(leavingStart, leavingEndpoint, progress);
    enter.push(await compose(propLayer, join(leavingActorRoot, leavingFiles[sourceIndex]), leavingCanvas, origin));
    const returnOrigin = interpolate(leavingEndpoint, leavingStart, progress);
    mirroredReturn.push(await compose(
      propLayer,
      join(leavingActorRoot, leavingFiles[sourceIndex]),
      leavingCanvas,
      returnOrigin,
      true,
    ));
  }

  const runForward = [];
  for (const file of treadmillFiles) {
    runForward.push(await compose(propLayer, join(treadmillActorRoot, file), treadmillCanvas, runOrigin));
  }
  const frames = [...enter, ...runForward, ...runForward.slice().reverse(), ...mirroredReturn];
  await mkdir(outputRoot, { recursive: true });
  await writeVideo(frames, join(outputRoot, "treadmill-complete-interaction-preview.mp4"), 16);
  await writeKeyframes(frames, [0, 24, 46, 47, 48, 49, 91, 92, 93, 136, 137, 138, 161, 185], join(outputRoot, "treadmill-complete-interaction-transitions.png"));

  const report = {
    schemaVersion: 2,
    proofKind: "complete-facility-interaction",
    facilityId: "treadmill",
    calibrationSource: basename(calibrationPath),
    relativeCalibration: calibration,
    proofComposite: {
      canvas: CANVAS,
      actorScale: ACTOR_SCALE,
      treadmill: { origin: TREADMILL_ORIGIN, scale: propScale },
      runOrigin,
      leavingStart: roundPoint(leavingStart),
      leavingEndpoint: roundPoint(leavingEndpoint),
      switchAnchor: "visible-center",
      switchCenter: roundPoint(switchCenter),
      switchError: roundPoint(switchError),
    },
    interactionSequence: {
      fps: 16,
      phases: [
        { id: "leaving-to-facility", frames: 48, playback: "forward" },
        { id: "run-forward", frames: 45, playback: "forward" },
        { id: "run-reverse", frames: 45, playback: "reverse" },
        { id: "leaving-return", frames: 48, playback: "forward", mirrored: true },
      ],
      frameCount: frames.length,
      reversePlaybackActions: ["treadmill"],
      mirroredPlaybackActions: ["leaving-return"],
    },
    outputs: {
      preview: "treadmill-complete-interaction-preview.mp4",
      transitionAudit: "treadmill-complete-interaction-transitions.png",
    },
    admission: "proof-only-pending-visual-acceptance",
  };
  await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function validateCalibration(calibration) {
  if (calibration?.kind !== "relative-facility-actor-calibration") throw new Error("Invalid treadmill calibration.");
  if (calibration.actorScaleBasis !== ACTOR_SCALE) throw new Error("Treadmill calibration changed the shared actor scale.");
}

async function readFrames(root, count) {
  const files = (await readdir(root)).filter((name) => name.endsWith(".png")).sort();
  if (files.length !== count) throw new Error(`Expected ${count} frames in ${root}; received ${files.length}.`);
  return files;
}

async function readCanvas(root, files) {
  const first = await sharp(join(root, files[0])).metadata();
  if (!first.width || !first.height) throw new Error("Action frame has no dimensions.");
  for (const file of files.slice(1)) {
    const metadata = await sharp(join(root, file)).metadata();
    if (metadata.width !== first.width || metadata.height !== first.height) throw new Error("Action frame canvas drifted.");
  }
  return { width: first.width, height: first.height };
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
  if (right < left) throw new Error(`Action frame is empty: ${path}`);
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function worldCenter(origin, bounds) {
  return { x: origin.x + bounds.centerX * ACTOR_SCALE, y: origin.y + bounds.centerY * ACTOR_SCALE };
}

function originForWorldCenter(center, bounds) {
  return { x: center.x - bounds.centerX * ACTOR_SCALE, y: center.y - bounds.centerY * ACTOR_SCALE };
}

function centerError(expected, actual) {
  return { x: Math.abs(expected.x - actual.x), y: Math.abs(expected.y - actual.y) };
}

function interpolate(from, to, progress) {
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}

function roundPoint(point) {
  return { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 };
}

async function compose(propLayer, actorPath, actorCanvas, origin, mirrorVisible = false) {
  const source = mirrorVisible ? await mirrorVisibleContent(actorPath, actorCanvas) : actorPath;
  const actor = await sharp(source).resize({
    width: Math.round(actorCanvas.width * ACTOR_SCALE),
    height: Math.round(actorCanvas.height * ACTOR_SCALE),
    fit: "fill",
  }).png().toBuffer();
  return sharp({ create: { ...CANVAS, channels: 4, background: { r: 250, g: 249, b: 247, alpha: 1 } } })
    .composite([
      { input: propLayer, left: TREADMILL_ORIGIN.x, top: TREADMILL_ORIGIN.y },
      { input: actor, left: Math.round(origin.x), top: Math.round(origin.y) },
    ]).png().toBuffer();
}

async function mirrorVisibleContent(actorPath, canvas) {
  const bounds = await readAlphaBounds(actorPath);
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const visible = await sharp(actorPath).extract({ left: bounds.left, top: bounds.top, width, height }).flop().png().toBuffer();
  return sharp({ create: { ...canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: visible, left: bounds.left, top: bounds.top }]).png().toBuffer();
}

async function writeVideo(frames, outputPath, fps) {
  const root = await mkdtemp(join(tmpdir(), "aho-treadmill-complete-"));
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

async function writeKeyframes(frames, indices, outputPath) {
  const width = 400;
  const height = 320;
  const columns = 4;
  const selected = await Promise.all(indices.map((index) => sharp(frames[index]).resize(width, height).png().toBuffer()));
  await sharp({
    create: {
      width: columns * width,
      height: Math.ceil(selected.length / columns) * height,
      channels: 4,
      background: { r: 250, g: 249, b: 247, alpha: 1 },
    },
  }).composite(selected.map((input, index) => ({
    input,
    left: (index % columns) * width,
    top: Math.floor(index / columns) * height,
  }))).png().toFile(outputPath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).map((value) => resolve(process.cwd(), value));
  if (args.length !== 5) {
    throw new Error("Usage: treadmill-complete-interaction-proof.mjs <prop> <treadmill-actors> <leaving-actors> <output> <calibration>");
  }
  buildTreadmillCompleteInteractionProof(...args).then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`));
}
