/* global process, Buffer */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const CANVAS = { width: 960, height: 960 };
const CHAIR = { left: 545, top: 463, width: 360, height: 412, baseline: 875 };
const SHADOW = { left: 545, top: 836, width: 360, height: 58, alpha: 0.12 };

export async function buildStandardChairProof(root = process.cwd()) {
  const chairSource = resolve(root, "design-assets/agent-office/approved/props/standard-chair.png");
  const workingRoot = resolve(root, "design-assets/agent-office/approved/actions/working");
  const offChairRoot = resolve(root, "design-assets/agent-office/approved/actions/off-chair");
  const outputRoot = resolve(root, "design-assets/agent-office/proof/workstations/standard-chair-v3");
  await mkdir(outputRoot, { recursive: true });

  const chair = await cropVisible(chairSource).then((png) => sharp(png).resize(CHAIR.width, CHAIR.height, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer());
  const shadow = await createShadow();
  const workingFrames = await loadFrames(workingRoot, "working", 68);
  const offChairFrames = await loadFrames(offChairRoot, "off-chair", 34);
  const workingComposites = await Promise.all(workingFrames.map((frame) => composeWorkstation(frame, chair, shadow)));
  const offChairComposites = await Promise.all(offChairFrames.map((frame) => composeWorkstation(frame, chair, shadow)));
  const [workingScarfWidths, offChairScarfWidths] = await Promise.all([
    scanScarfWidths(workingFrames),
    scanScarfWidths(offChairFrames),
  ]);

  const seated = join(outputRoot, "seated-chair-v3.png");
  const workingKeyframes = join(outputRoot, "working-chair-v3-keyframes.png");
  const offChairKeyframes = join(outputRoot, "off-chair-v3-keyframes.png");
  const workingPreview = join(outputRoot, "working-chair-v3-preview.mp4");
  const offChairPreview = join(outputRoot, "off-chair-v3-preview.mp4");
  await Promise.all([
    writeFile(seated, offChairComposites[0]),
    writeKeyframeSheet(workingComposites, [0, 17, 34, 51, 67], workingKeyframes),
    writeKeyframeSheet(offChairComposites, [0, 8, 16, 24, 33], offChairKeyframes),
    writeMp4(workingComposites, workingPreview, 12),
    writeMp4(offChairComposites, offChairPreview, 12),
  ]);

  const report = {
    schemaVersion: 1,
    canvas: CANVAS,
    chair: CHAIR,
    seatAnchor: { x: 725, y: 550 },
    actorGroundLine: 874,
    landmarkScale: {
      workingScarfWidth: summarize(workingScarfWidths),
      offChairScarfWidth: summarize(offChairScarfWidths),
      medianRatio: median(offChairScarfWidths) / median(workingScarfWidths),
    },
    shadow: { ...SHADOW, owner: "Pixi workstation shadow layer", bakedIntoAssets: false },
    layerOrder: ["workstation-shadow", "actor", "chair-foreground"],
    outputs: {
      seated: basename(seated),
      workingKeyframes: basename(workingKeyframes),
      offChairKeyframes: basename(offChairKeyframes),
      workingPreview: basename(workingPreview),
      offChairPreview: basename(offChairPreview),
    },
  };
  await writeFile(join(outputRoot, "standard-chair-v3-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function cropVisible(path) {
  return sharp(await readFile(path)).ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function createShadow() {
  const ellipse = Buffer.from(`<svg width="${SHADOW.width}" height="${SHADOW.height}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${SHADOW.width / 2}" cy="${SHADOW.height / 2}" rx="${SHADOW.width * 0.43}" ry="${SHADOW.height * 0.2}" fill="rgba(20,20,20,${SHADOW.alpha})"/></svg>`);
  return sharp(ellipse).blur(8).png().toBuffer();
}

async function loadFrames(root, actionId, count) {
  return Promise.all(Array.from({ length: count }, (_, index) => readFile(join(root, `${actionId}_${String(index).padStart(4, "0")}.png`))));
}

async function composeWorkstation(actor, chair, shadow) {
  return sharp({ create: { ...CANVAS, channels: 4, background: { r: 247, g: 247, b: 245, alpha: 1 } } })
    .composite([
      { input: shadow, left: SHADOW.left, top: SHADOW.top },
      { input: actor, left: 0, top: 0 },
      { input: chair, left: CHAIR.left, top: CHAIR.top },
    ])
    .png()
    .toBuffer();
}

async function scanScarfWidths(frames) {
  const widths = [];
  for (const frame of frames) {
    const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width;
    let right = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if (data[offset + 3] <= 8 || data[offset] <= 140 || data[offset] <= data[offset + 1] * 1.35 || data[offset] <= data[offset + 2] * 1.8) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (right < left) throw new Error("Workstation proof frame has no detectable scarf landmark.");
    widths.push(right - left + 1);
  }
  return widths;
}

function summarize(values) {
  return { minimum: Math.min(...values), maximum: Math.max(...values), median: median(values) };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function writeKeyframeSheet(frames, indices, outputPath) {
  const cell = 480;
  const resized = await Promise.all(indices.map((index) => sharp(frames[index]).resize(cell, cell).png().toBuffer()));
  await sharp({ create: { width: cell * indices.length, height: cell, channels: 4, background: { r: 247, g: 247, b: 245, alpha: 1 } } })
    .composite(resized.map((input, index) => ({ input, left: index * cell, top: 0 })))
    .png()
    .toFile(outputPath);
}

async function writeMp4(frames, outputPath, fps) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aho-chair-proof-"));
  try {
    await Promise.all(frames.map((frame, index) => writeFile(join(temporaryRoot, `frame_${String(index).padStart(4, "0")}.png`), frame)));
    await execFileAsync("ffmpeg", [
      "-y", "-framerate", String(fps), "-i", join(temporaryRoot, "frame_%04d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath,
    ]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
