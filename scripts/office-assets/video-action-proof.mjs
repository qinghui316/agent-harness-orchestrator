/* global Buffer, process */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { cutoutImage } from "./cutout-pipeline.mjs";

const execFileAsync = promisify(execFile);
const CANVAS = { width: 960, height: 960 };
const CHAIR = { left: 545, top: 463, width: 360, height: 412 };
const SHADOW = { left: 545, top: 836, width: 360, height: 58, alpha: 0.12 };
const ACTIONS = {
  standby: {
    sourceFrames: 32,
    fps: 20,
    scarfWidth: 195,
    anchor: { x: 739, y: 518 },
    runtimeVisualAnchor: { x: 725, y: 550 },
    playback: "ping-pong",
    chair: true,
  },
  "walk-horizontal": {
    sourceFrames: 49,
    fps: 16,
    scarfWidth: 195,
    anchor: { x: 480, y: 874 },
    canvas: { width: 1280, height: 960 },
    canvasMargin: 24,
    playback: "direct",
    chair: false,
  },
  leaving: {
    sourceFrames: 21,
    fps: 12,
    scarfWidth: 195,
    anchor: { x: 480, y: 874 },
    playback: "direct",
    chair: false,
    sourceWindow: { firstFrame: 47, lastFrame: 80 },
  },
  "coffee-drink": {
    sourceFrames: 79,
    fps: 12,
    scarfWidth: 195,
    anchor: { x: 739, y: 518 },
    runtimeVisualAnchor: { x: 725, y: 550 },
    playback: "direct",
    chair: true,
    sourceCropInset: 2,
  },
  peek: {
    sourceFrames: 48,
    fps: 12,
    scarfWidth: 195,
    anchor: { x: 739, y: 518 },
    runtimeVisualAnchor: { x: 725, y: 550 },
    playback: "direct",
    chair: true,
    sourceCropInset: 2,
  },
  treadmill: {
    sourceFrames: 45,
    fps: 16,
    scarfWidth: 195,
    anchor: { x: 700, y: 874 },
    canvas: { width: 1600, height: 1080 },
    canvasMargin: 24,
    cutoutOptions: { minimumBackgroundGreen: 128, minimumGreenDominance: 16 },
    placement: "sequence-foot-anchor",
    playback: "direct",
    chair: false,
  },
  "standing-talk": {
    sourceFrames: 76,
    fps: 24,
    scarfWidth: 195,
    anchor: { x: 480, y: 874 },
    canvasMargin: 24,
    playback: "direct",
    chair: false,
  },
  "seated-talk": {
    sourceFrames: 86,
    fps: 24,
    scarfWidth: 195,
    anchor: { x: 739, y: 518 },
    runtimeVisualAnchor: { x: 725, y: 550 },
    playback: "direct",
    chair: true,
    sourceCropInset: 2,
  },
  salute: {
    sourceFrames: 76,
    fps: 24,
    scarfWidth: 195,
    anchor: { x: 739, y: 518 },
    runtimeVisualAnchor: { x: 725, y: 550 },
    playback: "direct",
    chair: true,
    sourceCropInset: 2,
  },
};

export async function buildVideoActionProof(actionId, videoPath, outputRoot, repositoryRoot = process.cwd()) {
  const action = ACTIONS[actionId];
  if (!action) throw new Error(`Unsupported video proof action: ${actionId}`);
  const frameRoot = await mkdtemp(join(tmpdir(), "aho-video-action-source-"));
  try {
    await rm(outputRoot, { recursive: true, force: true });
    await execFileAsync("ffmpeg", ["-y", "-i", videoPath, "-fps_mode", "passthrough", join(frameRoot, "frame_%04d.png")]);
    const sourceFiles = (await readdir(frameRoot)).filter((name) => name.endsWith(".png")).sort();
    if (sourceFiles.length < action.sourceFrames) throw new Error(`Video contains only ${sourceFiles.length} frames.`);
    const sourcePaths = sourceFiles.map((name) => join(frameRoot, name));
    const sourceWindow = action.sourceWindow
      ? sourcePaths.slice(action.sourceWindow.firstFrame - 1, action.sourceWindow.lastFrame)
      : sourcePaths;
    const windowOffset = action.sourceWindow ? action.sourceWindow.firstFrame - 1 : 0;
    const selectedIndices = (await selectByCumulativeMotion(sourceWindow, action.sourceFrames))
      .map((index) => index + windowOffset);
    const selected = [];
    for (const sourceIndex of selectedIndices) {
      const cutoutInput = action.sourceCropInset
        ? await cropBackgroundBorder(sourcePaths[sourceIndex], action.sourceCropInset)
        : sourcePaths[sourceIndex];
      const cutout = await cutoutImage(cutoutInput, action.cutoutOptions);
      const landmarks = scanLandmarks(cutout.cutout);
      selected.push({ sourceIndex, cutout: cutout.cutout, cutoutReport: cutout.report, landmarks });
    }

    const canvas = action.canvas ?? CANVAS;
    const requestedScale = action.targetFirstFrameVisibleHeight
      ? action.targetFirstFrameVisibleHeight / selected[0].landmarks.bounds.height
      : action.scarfWidth / median(selected.map((frame) => frame.landmarks.scarfBand.width));
    const sequencePlacement = action.placement === "sequence-foot-anchor"
      ? buildSequenceFootPlacement(selected)
      : undefined;
    const canvasFitScale = action.canvasMargin == null
      ? requestedScale
      : sequencePlacement
        ? maximumSequenceFitScale(sequencePlacement, action.anchor, action.canvasMargin, canvas)
        : maximumCanvasFitScale(selected, action.anchor, action.canvasMargin, canvas);
    const fixedScale = Math.min(requestedScale, canvasFitScale);
    const chair = action.chair ? await prepareChair(resolve(repositoryRoot, "design-assets/agent-office/approved/props/standard-chair.png")) : undefined;
    const shadow = action.chair ? await createShadow() : undefined;
    const actorRoot = join(outputRoot, "actors");
    await mkdir(actorRoot, { recursive: true });
    const actors = [];
    const composites = [];
    const anchorErrors = [];
    for (let index = 0; index < selected.length; index += 1) {
      const actor = await normalizeActor(selected[index], fixedScale, action.anchor, canvas, sequencePlacement);
      actors.push(actor.png);
      anchorErrors.push(actor.anchorError);
      await writeFile(join(actorRoot, `${actionId}-candidate_${String(index).padStart(4, "0")}.png`), actor.png);
      composites.push(action.chair ? await composeChair(actor.png, chair, shadow) : await composeActor(actor.png, canvas));
    }

    const playbackIndices = action.playback === "ping-pong"
      ? [
          ...Array.from({ length: action.sourceFrames }, (_, index) => index),
          ...Array.from({ length: action.sourceFrames - 2 }, (_, index) => action.sourceFrames - 2 - index),
        ]
      : Array.from({ length: action.sourceFrames }, (_, index) => index);
    const playback = playbackIndices.map((index) => composites[index]);
    const keyframes = join(outputRoot, `${actionId}-keyframes.png`);
    const contactSheet = join(outputRoot, `${actionId}-contact-sheet.png`);
    const alphaQa = join(outputRoot, `${actionId}-alpha-keyframes.png`);
    const preview = join(outputRoot, `${actionId}-preview.mp4`);
    const keyframeIndices = Array.from({ length: 5 }, (_, index) => Math.round(index * (action.sourceFrames - 1) / 4));
    await mkdir(outputRoot, { recursive: true });
    await Promise.all([
      writeKeyframeSheet(composites, keyframeIndices, keyframes),
      writeContactSheet(composites, contactSheet),
      writeAlphaKeyframeSheet(actors, keyframeIndices, alphaQa),
      writeMp4(playback, preview, action.fps),
    ]);

    const sourceBytes = await readFile(videoPath);
    const report = {
      schemaVersion: 1,
      actionId,
      sourceVideo: videoPath,
      sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      sourceFrameCount: sourceFiles.length,
      selection: {
        method: "cumulative-frame-difference-with-endpoint-preservation",
        sourceWindow: action.sourceWindow,
        sourceCropInset: action.sourceCropInset ?? 0,
        sourceFrameCount: action.sourceFrames,
        sourceFrameNumbers: selectedIndices.map((index) => index + 1),
        playbackFrameCount: playbackIndices.length,
        playback: action.playback,
      },
      normalization: {
        canvas,
        placement: action.placement ?? "per-frame-anchor",
        sequenceSourceBounds: sequencePlacement?.bounds,
        sequenceSourceAnchor: sequencePlacement?.sourceAnchor,
        sequenceEndpointFeet: sequencePlacement?.endpointFeet,
        sequenceFootPath: sequencePlacement?.feet,
        fixedScale,
        requestedScale,
        canvasFitScale,
        scaleLimitedByCanvas: fixedScale < requestedScale,
        canvasMargin: action.canvasMargin,
        sourceScarfBandWidth: summarize(selected.map((frame) => frame.landmarks.scarfBand.width)),
        targetScarfWidth: action.scarfWidth,
        scaleBasis: action.targetFirstFrameVisibleHeight ? "first-frame-visible-height" : "median-scarf-width",
        targetFirstFrameVisibleHeight: action.targetFirstFrameVisibleHeight,
        targetVisualAnchor: action.anchor,
        runtimeVisualAnchor: action.runtimeVisualAnchor ?? action.anchor,
        fixedActionOffset: action.runtimeVisualAnchor
          ? {
              x: action.anchor.x - action.runtimeVisualAnchor.x,
              y: action.anchor.y - action.runtimeVisualAnchor.y,
            }
          : { x: 0, y: 0 },
        anchorError: {
          x: summarize(anchorErrors.map((value) => Math.abs(value.x))),
          y: summarize(anchorErrors.map((value) => Math.abs(value.y))),
        },
      },
      alpha: {
        cutoutOptions: action.cutoutOptions,
        visibleKeyPixels: selected.reduce((sum, frame) => sum + frame.cutoutReport.visibleKeyPixels, 0),
        transparentNonZeroRgb: selected.reduce((sum, frame) => sum + frame.cutoutReport.transparentNonZeroRgb, 0),
        protectedPixelChanges: selected.reduce((sum, frame) => sum + frame.cutoutReport.preservation.protectedPixelChanges, 0),
        detachedBackgroundMattePixelsRemoved: selected.reduce(
          (sum, frame) => sum + frame.cutoutReport.preservation.detachedBackgroundMattePixelsRemoved,
          0,
        ),
      },
      ...(action.chair ? { workstation: {
        chair: CHAIR,
        shadow: SHADOW,
        layerOrder: ["workstation-shadow", "actor", "chair-foreground"],
      } } : {}),
      outputs: {
        actorRoot: "actors",
        keyframes: basename(keyframes),
        contactSheet: basename(contactSheet),
        alphaQa: basename(alphaQa),
        preview: basename(preview),
      },
      admission: "proof-only-pending-visual-acceptance",
    };
    await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report;
  } finally {
    await rm(frameRoot, { recursive: true, force: true });
  }
}

async function cropBackgroundBorder(input, inset) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height || inset * 2 >= metadata.width || inset * 2 >= metadata.height) {
    throw new Error("Video frame cannot apply the configured background-border crop.");
  }
  return sharp(input).extract({
    left: inset,
    top: inset,
    width: metadata.width - inset * 2,
    height: metadata.height - inset * 2,
  }).png().toBuffer();
}

async function selectByCumulativeMotion(paths, outputCount) {
  const signatures = [];
  for (const path of paths) signatures.push(await sharp(path).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer());
  const cumulative = [0];
  for (let index = 1; index < signatures.length; index += 1) {
    cumulative.push(cumulative[index - 1] + meanAbsoluteDifference(signatures[index - 1], signatures[index]));
  }
  const selected = [0];
  for (let outputIndex = 1; outputIndex < outputCount - 1; outputIndex += 1) {
    const target = cumulative.at(-1) * outputIndex / (outputCount - 1);
    let sourceIndex = selected.at(-1) + 1;
    while (sourceIndex + 1 < paths.length && Math.abs(cumulative[sourceIndex + 1] - target) < Math.abs(cumulative[sourceIndex] - target)) sourceIndex += 1;
    const maximum = paths.length - (outputCount - outputIndex);
    selected.push(Math.min(sourceIndex, maximum));
  }
  selected.push(paths.length - 1);
  if (new Set(selected).size !== outputCount) throw new Error("Cumulative motion selection produced duplicate source frames.");
  return selected;
}

function scanLandmarks(image) {
  const { width, height, channels } = image.info;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let bestScarfRow = { count: 0, left: width, right: -1, y: -1 };
  for (let y = 0; y < height; y += 1) {
    let rowCount = 0;
    let rowLeft = width;
    let rowRight = -1;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blue = image.data[offset + 2];
      const alpha = image.data[offset + 3];
      if (alpha > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
      if (alpha <= 32 || red <= 140 || red <= green * 1.35 || red <= blue * 1.8) continue;
      rowCount += 1;
      rowLeft = Math.min(rowLeft, x);
      rowRight = Math.max(rowRight, x);
    }
    if (rowCount > bestScarfRow.count) bestScarfRow = { count: rowCount, left: rowLeft, right: rowRight, y };
  }
  if (right < left || bestScarfRow.right < bestScarfRow.left) throw new Error("Video frame lacks actor or scarf landmarks.");
  return {
    bounds: { left, top, width: right - left + 1, height: bottom - top + 1 },
    scarfBand: {
      centerX: (bestScarfRow.left + bestScarfRow.right) / 2,
      y: bestScarfRow.y,
      width: bestScarfRow.right - bestScarfRow.left + 1,
    },
    bodyFoot: findBodyFoot(image, bestScarfRow),
  };
}

function findBodyFoot(image, scarfBand) {
  const { width, height, channels } = image.info;
  const centerX = (scarfBand.left + scarfBand.right) / 2;
  const bandWidth = scarfBand.right - scarfBand.left + 1;
  const minimumX = Math.max(0, Math.floor(centerX - bandWidth * 1.5));
  const maximumX = Math.min(width - 1, Math.ceil(centerX + bandWidth * 2.6));
  let footY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const offset = (y * width + x) * channels;
      const greenDominance = image.data[offset + 1] - Math.max(image.data[offset], image.data[offset + 2]);
      if (image.data[offset + 3] > 8 && greenDominance < 16) footY = y;
    }
  }
  if (footY < 0) throw new Error("Video frame lacks a body-foot landmark.");
  const bandHeight = Math.max(3, Math.round(bandWidth * 0.08));
  let footLeft = width;
  let footRight = -1;
  for (let y = Math.max(0, footY - bandHeight); y <= footY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const offset = (y * width + x) * channels;
      const greenDominance = image.data[offset + 1] - Math.max(image.data[offset], image.data[offset + 2]);
      if (image.data[offset + 3] <= 8 || greenDominance >= 16) continue;
      footLeft = Math.min(footLeft, x);
      footRight = Math.max(footRight, x);
    }
  }
  if (footRight < footLeft) throw new Error("Video frame lacks a body-foot contact cluster.");
  return { x: (footLeft + footRight) / 2, y: footY };
}

function buildSequenceFootPlacement(frames) {
  const left = Math.min(...frames.map((frame) => frame.landmarks.bounds.left));
  const top = Math.min(...frames.map((frame) => frame.landmarks.bounds.top));
  const right = Math.max(...frames.map((frame) => frame.landmarks.bounds.left + frame.landmarks.bounds.width - 1));
  const bottom = Math.max(...frames.map((frame) => frame.landmarks.bounds.top + frame.landmarks.bounds.height - 1));
  const endpointFrames = [frames[0], frames.at(-1)];
  return {
    bounds: { left, top, width: right - left + 1, height: bottom - top + 1 },
    endpointFeet: endpointFrames.map((frame) => frame.landmarks.bodyFoot),
    feet: frames.map((frame) => frame.landmarks.bodyFoot),
    sourceAnchor: {
      x: median(endpointFrames.map((frame) => frame.landmarks.bodyFoot.x)),
      y: median(endpointFrames.map((frame) => frame.landmarks.bodyFoot.y)),
    },
  };
}

function maximumSequenceFitScale(placement, targetAnchor, margin, canvas) {
  const anchorX = placement.sourceAnchor.x - placement.bounds.left;
  const anchorY = placement.sourceAnchor.y - placement.bounds.top;
  const rightExtent = placement.bounds.width - anchorX;
  const bottomExtent = placement.bounds.height - anchorY;
  const limits = [
    (targetAnchor.x - margin) / anchorX,
    (canvas.width - margin - targetAnchor.x) / rightExtent,
    (targetAnchor.y - margin) / anchorY,
  ];
  if (bottomExtent > 0) limits.push((canvas.height - margin - targetAnchor.y) / bottomExtent);
  const maximum = Math.min(...limits);
  if (!(maximum > 0) || !Number.isFinite(maximum)) throw new Error("Sequence cannot fit the declared canvas with the configured visual anchor.");
  return maximum;
}

function maximumCanvasFitScale(frames, targetAnchor, margin, canvas) {
  let maximum = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const { bounds, scarfBand } = frame.landmarks;
    const anchorX = scarfBand.centerX - bounds.left;
    maximum = Math.min(
      maximum,
      (targetAnchor.x - margin) / anchorX,
      (canvas.width - margin - targetAnchor.x) / (bounds.width - anchorX),
      (targetAnchor.y - margin) / bounds.height,
    );
  }
  if (!(maximum > 0) || !Number.isFinite(maximum)) throw new Error("Action cannot fit the canonical canvas with the configured margin.");
  return maximum;
}

async function normalizeActor(frame, scale, targetAnchor, canvas, sequencePlacement) {
  const { bounds, scarfBand } = frame.landmarks;
  const sourceBounds = sequencePlacement?.bounds ?? bounds;
  const source = await sharp(frame.cutout.data, { raw: frame.cutout.info }).extract(sourceBounds).png().toBuffer();
  const width = Math.max(1, Math.round(sourceBounds.width * scale));
  const height = Math.max(1, Math.round(sourceBounds.height * scale));
  const resized = await sharp(source)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const anchorInCrop = sequencePlacement
    ? {
        x: sequencePlacement.sourceAnchor.x - sourceBounds.left,
        y: sequencePlacement.sourceAnchor.y - sourceBounds.top,
      }
    : { x: scarfBand.centerX - bounds.left, y: bounds.height };
  const left = Math.round(targetAnchor.x - anchorInCrop.x * scale);
  const top = Math.round(targetAnchor.y - anchorInCrop.y * scale);
  const png = await sharp({ create: { ...canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
  return {
    png: await normalizeActorPixels(png),
    anchorError: {
      x: left + anchorInCrop.x * scale - targetAnchor.x,
      y: top + anchorInCrop.y * scale - targetAnchor.y,
    },
  };
}

async function normalizeActorPixels(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const normalized = Buffer.from(data);
  for (let offset = 0; offset < normalized.length; offset += info.channels) {
    const alpha = normalized[offset + 3];
    if (alpha === 0) {
      normalized[offset] = 0;
      normalized[offset + 1] = 0;
      normalized[offset + 2] = 0;
      continue;
    }
  }
  return sharp(normalized, { raw: info }).png().toBuffer();
}

async function prepareChair(path) {
  return sharp(await readFile(path)).ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(CHAIR.width, CHAIR.height, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
}

async function createShadow() {
  const svg = Buffer.from(`<svg width="${SHADOW.width}" height="${SHADOW.height}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${SHADOW.width / 2}" cy="${SHADOW.height / 2}" rx="${SHADOW.width * 0.43}" ry="${SHADOW.height * 0.2}" fill="rgba(20,20,20,${SHADOW.alpha})"/></svg>`);
  return sharp(svg).blur(8).png().toBuffer();
}

async function composeChair(actor, chair, shadow) {
  return sharp({ create: { ...CANVAS, channels: 4, background: { r: 247, g: 247, b: 245, alpha: 1 } } })
    .composite([
      { input: shadow, left: SHADOW.left, top: SHADOW.top },
      { input: actor, left: 0, top: 0 },
      { input: chair, left: CHAIR.left, top: CHAIR.top },
    ])
    .png().toBuffer();
}

async function composeActor(actor, canvas) {
  return sharp({ create: { ...canvas, channels: 4, background: { r: 247, g: 247, b: 245, alpha: 1 } } })
    .composite([{ input: actor, left: 0, top: 0 }])
    .png().toBuffer();
}

async function writeKeyframeSheet(frames, indices, outputPath) {
  const cell = 480;
  const resized = await Promise.all(indices.map((index) => sharp(frames[index]).resize({ width: cell, height: cell, fit: "contain", background: { r: 247, g: 247, b: 245, alpha: 1 } }).png().toBuffer()));
  await sharp({ create: { width: cell * indices.length, height: cell, channels: 4, background: { r: 247, g: 247, b: 245, alpha: 1 } } })
    .composite(resized.map((input, index) => ({ input, left: index * cell, top: 0 })))
    .png().toFile(outputPath);
}

async function writeContactSheet(frames, outputPath) {
  const columns = 7;
  const cell = 240;
  const rows = Math.ceil(frames.length / columns);
  const resized = await Promise.all(frames.map((frame) => sharp(frame).resize({ width: cell, height: cell, fit: "contain", background: { r: 247, g: 247, b: 245, alpha: 1 } }).png().toBuffer()));
  await sharp({
    create: {
      width: columns * cell,
      height: rows * cell,
      channels: 4,
      background: { r: 247, g: 247, b: 245, alpha: 1 },
    },
  }).composite(resized.map((input, index) => ({
    input,
    left: (index % columns) * cell,
    top: Math.floor(index / columns) * cell,
  }))).png().toFile(outputPath);
}

async function writeAlphaKeyframeSheet(frames, indices, outputPath) {
  const cell = 480;
  const width = cell * indices.length;
  const checker = Buffer.alloc(width * cell * 4);
  const tile = 24;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0 ? 238 : 194;
      const offset = (y * width + x) * 4;
      checker[offset] = value;
      checker[offset + 1] = value;
      checker[offset + 2] = value;
      checker[offset + 3] = 255;
    }
  }
  const resized = await Promise.all(indices.map((index) => sharp(frames[index]).resize({ width: cell, height: cell, fit: "contain" }).png().toBuffer()));
  await sharp(checker, { raw: { width, height: cell, channels: 4 } })
    .composite(resized.map((input, index) => ({ input, left: index * cell, top: 0 })))
    .png()
    .toFile(outputPath);
}

async function writeMp4(frames, outputPath, fps) {
  const root = await mkdtemp(join(tmpdir(), "aho-video-action-playback-"));
  try {
    await Promise.all(frames.map((frame, index) => writeFile(join(root, `frame_${String(index).padStart(4, "0")}.png`), frame)));
    await execFileAsync("ffmpeg", ["-y", "-framerate", String(fps), "-i", join(root, "frame_%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function meanAbsoluteDifference(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

function summarize(values) {
  return { minimum: Math.min(...values), maximum: Math.max(...values), median: median(values) };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actionId = process.argv[2];
  const videoPath = process.argv[3];
  const outputRoot = process.argv[4];
  if (!actionId || !videoPath || !outputRoot) throw new Error("Usage: node video-action-proof.mjs <action-id> <video-path> <output-root>");
  buildVideoActionProof(actionId, resolve(videoPath), resolve(outputRoot)).then(
    (report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
