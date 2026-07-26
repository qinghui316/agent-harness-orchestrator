/* global process */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  deriveCanonicalResolution,
  packPixiAtlas,
  readCanonicalFullCharacterSequence,
  writeContactSheet,
  writeOfficeBuildReceipt,
} from "./image-pipeline.mjs";
import { loadOfficeAssetManifest } from "./manifest.mjs";

const execFileAsync = promisify(execFile);
const VALIDATION = { alphaThreshold: 8, visibleKeyPixels: 0, transparentNonZeroRgb: 0 };

export async function importEffectVideo(sourcePath, effectId, repositoryRoot = process.cwd()) {
  const source = resolve(sourcePath);
  const manifest = await loadOfficeAssetManifest(resolve(repositoryRoot, "design-assets/agent-office/office-assets.manifest.json"));
  const effect = manifest.effects.find((candidate) => candidate.id === effectId);
  if (!effect) throw new Error(`Unknown office effect: ${effectId}`);
  const size2x = { width: effect.width2x, height: effect.height2x };
  const size1x = { width: effect.width2x / 2, height: effect.height2x / 2 };
  const stagingRoot = resolve(repositoryRoot, "design-assets/agent-office/staging/effects", effectId);
  const approvedRoot = resolve(repositoryRoot, "design-assets/agent-office/approved/effects", effectId);
  const proofRoot = resolve(repositoryRoot, "design-assets/agent-office/proof/effects", `${effectId}-user-approved-v1`);
  const runtimeRoot = resolve(repositoryRoot, "design-assets/agent-office/runtime-v3/effects");
  const publicRoot = resolve(repositoryRoot, "src/web/public/agent-office/effects");
  await Promise.all([approvedRoot, proofRoot].map((path) => rm(path, { recursive: true, force: true })));
  await Promise.all([stagingRoot, approvedRoot, proofRoot, runtimeRoot, publicRoot].map((path) => mkdir(path, { recursive: true })));

  const controlledSource = join(stagingRoot, "transparent-user-source.mov");
  await cp(source, controlledSource, { force: true });
  await execFileAsync("ffmpeg", [
    "-y", "-i", controlledSource, "-map", "0:v:0", "-frames:v", String(effect.frames), "-start_number", "0",
    "-vf", `pad=${size2x.width}:${size2x.height}:0:0:color=black@0,format=rgba`,
    join(approvedRoot, `${effectId}_%04d.png`),
  ]);
  const framePattern = new RegExp(`^${effectId}_\\d{4}\\.png$`);
  const frameFiles = (await readdir(approvedRoot)).filter((name) => framePattern.test(name)).sort();
  if (frameFiles.length !== effect.frames) throw new Error(`Expected ${effect.frames} ${effectId} frames, received ${frameFiles.length}.`);
  const sequence2x = await readCanonicalFullCharacterSequence(frameFiles.map((name) => ({ name, path: join(approvedRoot, name) })), {
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
    const image = join(runtimeRoot, `${effectId}@${resolution}.webp`);
    await packPixiAtlas(sequence.frames, {
      animationId: effectId,
      outputImage: image,
      outputJson: `${image}.json`,
      padding: 2,
      maxWidth,
      scale,
      fps: effect.fps,
      loop: true,
    });
    await Promise.all([
      cp(image, join(publicRoot, basename(image)), { force: true }),
      cp(`${image}.json`, join(publicRoot, basename(`${image}.json`)), { force: true }),
    ]);
    outputs.push(image, `${image}.json`);
  }
  const contactSheet = join(proofRoot, `${effectId}-contact-sheet.png`);
  await writeContactSheet(sequence2x.frames, contactSheet, { columns: 5 });
  const sourceBytes = await readFile(controlledSource);
  const report = {
    schemaVersion: 1,
    effectId,
    status: "user-confirmed-production-authorized",
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    source: { width: 1067, height: 800, playbackFrames: 75, fps: 24 },
    admitted: { ...size2x, uniqueFrames: effect.frames, fps: effect.fps, loop: true, alpha: true },
    composition: { owner: "coffee-facility-effect", overlaysCoffeeDrinkActor: false },
    outputs: { controlledSource, approvedFrames: approvedRoot, contactSheet, atlases: outputs },
  };
  await writeFile(join(proofRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeOfficeBuildReceipt(manifest, repositoryRoot);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("effect-video-import.mjs")) {
  const effectId = process.argv[2];
  const source = process.argv[3];
  if (!effectId || !source) throw new Error("Usage: node effect-video-import.mjs <effect-id> <transparent-video>");
  importEffectVideo(source, effectId).then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`));
}
