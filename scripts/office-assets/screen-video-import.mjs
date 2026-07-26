/* global process */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import {
  deriveCanonicalResolution,
  packPixiAtlas,
  readCanonicalFullCharacterSequence,
  writeOfficeBuildReceipt,
} from "./image-pipeline.mjs";
import { loadOfficeAssetManifest } from "./manifest.mjs";

const execFileAsync = promisify(execFile);
const VALIDATION = { alphaThreshold: 8, visibleKeyPixels: 0, transparentNonZeroRgb: 0 };

export async function importScreenVideo(sourcePath, profileId = "orchestration", repositoryRoot = process.cwd()) {
  const source = resolve(sourcePath);
  const manifest = await loadOfficeAssetManifest(resolve(repositoryRoot, "design-assets/agent-office/office-assets.manifest.json"));
  const profile = manifest.screenAnimations.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`Unknown office screen profile: ${profileId}`);
  const size2x = { width: profile.width2x, height: profile.height2x };
  const size1x = { width: profile.width2x / 2, height: profile.height2x / 2 };
  const stagingRoot = resolve(repositoryRoot, "design-assets/agent-office/staging/screens", profileId);
  const approvedRoot = resolve(repositoryRoot, "design-assets/agent-office/approved/screens", profileId);
  const proofRoot = resolve(repositoryRoot, "design-assets/agent-office/proof/screens", `${profileId}-user-approved-v1`);
  const runtimeRoot = resolve(repositoryRoot, "design-assets/agent-office/runtime-v3/screens");
  const publicRoot = resolve(repositoryRoot, "src/web/public/agent-office/screens");
  await Promise.all([approvedRoot, proofRoot].map((path) => rm(path, { recursive: true, force: true })));
  await Promise.all([stagingRoot, approvedRoot, proofRoot, runtimeRoot, publicRoot].map((path) => mkdir(path, { recursive: true })));

  const controlledSource = join(stagingRoot, "screen-content-only-user-source.mp4");
  await cp(source, controlledSource, { force: true });
  await execFileAsync("ffmpeg", [
    "-y", "-i", controlledSource, "-map", "0:v:0", "-fps_mode", "passthrough", "-start_number", "0",
    "-vf", "format=rgba",
    join(approvedRoot, `${profileId}_%04d.png`),
  ]);

  const framePattern = new RegExp(`^${escapeRegExp(profileId)}_\\d{4}\\.png$`);
  const frameFiles = (await readdir(approvedRoot)).filter((name) => framePattern.test(name)).sort();
  if (frameFiles.length !== profile.frames) throw new Error(`Expected ${profile.frames} ${profileId} frames, received ${frameFiles.length}.`);
  const inputs = frameFiles.map((name) => ({ name, path: join(approvedRoot, name) }));
  const sequence2x = await readCanonicalFullCharacterSequence(inputs, {
    frameWidth: size2x.width,
    frameHeight: size2x.height,
    validation: VALIDATION,
  });
  const sequence1x = await deriveCanonicalResolution(sequence2x, {
    factor: 0.5,
    frameWidth: size1x.width,
    frameHeight: size1x.height,
    validation: VALIDATION,
  });

  const outputs = [];
  for (const [resolution, sequence, scale, maxWidth] of [
    ["2x", sequence2x, 2, 4096],
    ["1x", sequence1x, 1, 2048],
  ]) {
    const image = join(runtimeRoot, `${profileId}@${resolution}.webp`);
    await packPixiAtlas(sequence.frames, {
      animationId: profileId,
      outputImage: image,
      outputJson: `${image}.json`,
      padding: 2,
      maxWidth,
      scale,
      fps: profile.fps,
      loop: true,
    });
    await Promise.all([
      cp(image, join(publicRoot, basename(image)), { force: true }),
      cp(`${image}.json`, join(publicRoot, basename(`${image}.json`)), { force: true }),
    ]);
    outputs.push(image, `${image}.json`);
  }

  const keyframeIndices = Array.from({ length: 10 }, (_, index) => Math.round(index * (profile.frames - 1) / 9));
  const thumbWidth = Math.max(1, Math.round(size2x.width / 2));
  const thumbHeight = Math.max(1, Math.round(size2x.height / 2));
  const thumbs = await Promise.all(keyframeIndices.map((index) => sharp(sequence2x.frames[index].png).resize(thumbWidth, thumbHeight).png().toBuffer()));
  const keyframesPath = join(proofRoot, `${profileId}-screen-keyframes.png`);
  await sharp({ create: { width: thumbWidth * 5, height: thumbHeight * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(thumbs.map((input, index) => ({ input, left: (index % 5) * thumbWidth, top: Math.floor(index / 5) * thumbHeight })))
    .png()
    .toFile(keyframesPath);
  const approvedPreview = join(proofRoot, "screen-content-only.mp4");
  await cp(controlledSource, approvedPreview, { force: true });

  const sourceBytes = await readFile(controlledSource);
  const report = {
    schemaVersion: 1,
    profileId,
    status: "user-confirmed-production-authorized",
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    source: { ...size2x, frames: profile.frames, fps: profile.fps, durationSeconds: profile.frames / profile.fps },
    separation: { monitorShellIncluded: false, characterIncluded: false, screenContentOnly: true },
    outputs: { controlledSource, approvedFrames: approvedRoot, keyframes: keyframesPath, preview: approvedPreview, atlases: outputs },
  };
  await writeFile(join(proofRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeOfficeBuildReceipt(manifest, repositoryRoot);
  return report;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("screen-video-import.mjs")) {
  const profileId = process.argv[2];
  const source = process.argv[3];
  if (!profileId || !source) throw new Error("Usage: node screen-video-import.mjs <profile-id> <screen-content.mp4>");
  importScreenVideo(source, profileId).then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`));
}
