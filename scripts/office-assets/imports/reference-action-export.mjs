/* global process */

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export async function exportReferenceAction(actionId, outputRoot, repositoryRoot = process.cwd()) {
  const resolvedOutputRoot = resolve(outputRoot);
  const temporaryRoot = `${resolve(tmpdir())}${sep}`;
  if (!resolvedOutputRoot.startsWith(temporaryRoot)) throw new Error("Reference exports must stay under the system temporary directory.");
  const assetRoot = resolve(repositoryRoot, "reference-projects/marvis-office/src/assets/agent");
  const imagePath = join(assetRoot, `${actionId}@2x.webp`);
  const jsonPath = `${imagePath}.json`;
  const atlas = JSON.parse(await readFile(jsonPath, "utf8"));
  const packs = await loadAtlasPacks(assetRoot, imagePath, jsonPath, atlas);
  const animationNames = Object.keys(atlas.animations ?? {});
  const animationName = atlas.animations?.[actionId]
    ? actionId
    : animationNames.length === 1
      ? animationNames[0]
      : undefined;
  const animation = packs.length > 1
    ? Array.from(new Set(packs.flatMap((pack) => Object.keys(pack.atlas.frames ?? {}))))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    : animationName
      ? atlas.animations[animationName]
      : undefined;
  if (!Array.isArray(animation) || animation.length === 0) throw new Error(`Reference action has no ordered animation: ${actionId}`);

  await rm(resolvedOutputRoot, { recursive: true, force: true });
  const frameRoot = join(resolvedOutputRoot, "frames");
  const playbackRoot = join(resolvedOutputRoot, "playback");
  await Promise.all([mkdir(frameRoot, { recursive: true }), mkdir(playbackRoot, { recursive: true })]);

  const frames = [];
  for (let index = 0; index < animation.length; index += 1) {
    const frameName = animation[index];
    const pack = packs.find((candidate) => candidate.atlas.frames?.[frameName]);
    const descriptor = pack?.atlas.frames?.[frameName];
    if (!descriptor) throw new Error(`Reference atlas is missing frame: ${frameName}`);
    const packedWidth = descriptor.rotated ? descriptor.frame.h : descriptor.frame.w;
    const packedHeight = descriptor.rotated ? descriptor.frame.w : descriptor.frame.h;
    let extracted = sharp(pack.imagePath).extract({
      left: descriptor.frame.x,
      top: descriptor.frame.y,
      width: packedWidth,
      height: packedHeight,
    });
    if (descriptor.rotated) extracted = extracted.rotate(270);
    const sprite = await extracted.png().toBuffer();
    const canvas = await sharp({
      create: {
        width: descriptor.sourceSize.w,
        height: descriptor.sourceSize.h,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite([{
      input: sprite,
      left: descriptor.spriteSourceSize.x,
      top: descriptor.spriteSourceSize.y,
    }]).png().toBuffer();
    const output = join(frameRoot, `${actionId}_${String(index).padStart(4, "0")}.png`);
    await writeFile(output, canvas);
    frames.push(output);
  }

  const contactSheet = join(resolvedOutputRoot, `${actionId}-all-frames.png`);
  await writeContactSheet(frames, contactSheet);
  const screenContent = actionId.startsWith("fc_screen_");
  const endpointHoldFrames = screenContent ? 0 : 12;
  const poseRepeats = screenContent ? 1 : Math.max(1, Math.ceil((73 - endpointHoldFrames * 2) / frames.length));
  const playback = screenContent
    ? frames
    : [
        ...Array.from({ length: endpointHoldFrames }, () => frames[0]),
        ...frames.flatMap((frame) => Array.from({ length: poseRepeats }, () => frame)),
        ...Array.from({ length: endpointHoldFrames }, () => frames.at(-1)),
      ];
  const videoBackground = screenContent
    ? { r: 0, g: 0, b: 0 }
    : { r: 0, g: 255, b: 0 };
  for (let index = 0; index < playback.length; index += 1) {
    await sharp(playback[index])
      .flatten({ background: videoBackground })
      .png()
      .toFile(join(playbackRoot, `frame_${String(index).padStart(4, "0")}.png`));
  }
  const preview = join(resolvedOutputRoot, `${actionId}-24fps-3s-plus.mp4`);
  await execFileAsync("ffmpeg", [
    "-y",
    "-framerate", "24",
    "-i", join(playbackRoot, "frame_%04d.png"),
    "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    preview,
  ]);
  await rm(playbackRoot, { recursive: true, force: true });

  const report = {
    schemaVersion: 1,
    actionId,
    animationName,
    referenceImages: packs.map((pack) => basename(pack.imagePath)),
    uniqueFrameCount: frames.length,
    orderedFrames: animation,
    preview: {
      fps: 24,
      frameCount: playback.length,
      durationSeconds: playback.length / 24,
      endpointHoldFrames,
      poseRepeats,
    },
    videoKind: screenContent ? "screen-content-only" : "complete-character-green-screen",
    videoBackground: screenContent ? "original-full-frame" : "#00ff00",
    outputs: { frames: "frames", contactSheet: basename(contactSheet), preview: basename(preview) },
  };
  await writeFile(join(resolvedOutputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function loadAtlasPacks(assetRoot, imagePath, jsonPath, atlas) {
  const packs = [{ imagePath, jsonPath, atlas }];
  const pending = [...(atlas.meta?.related_multi_packs ?? [])];
  const loaded = new Set([basename(jsonPath)]);
  while (pending.length > 0) {
    const relatedName = pending.shift();
    if (loaded.has(relatedName)) continue;
    loaded.add(relatedName);
    const relatedJsonPath = join(assetRoot, relatedName);
    const relatedAtlas = JSON.parse(await readFile(relatedJsonPath, "utf8"));
    const relatedImageName = relatedAtlas.meta?.realImage ?? relatedName.replace(/\.json$/, "");
    packs.push({ imagePath: join(assetRoot, relatedImageName), jsonPath: relatedJsonPath, atlas: relatedAtlas });
    pending.push(...(relatedAtlas.meta?.related_multi_packs ?? []));
  }
  return packs;
}

async function writeContactSheet(frames, outputPath) {
  const columns = 7;
  const cell = { width: 267, height: 200 };
  const rows = Math.ceil(frames.length / columns);
  const resized = await Promise.all(frames.map((frame) => sharp(frame).resize(cell.width, cell.height).png().toBuffer()));
  await sharp({
    create: {
      width: columns * cell.width,
      height: rows * cell.height,
      channels: 4,
      background: { r: 246, g: 246, b: 244, alpha: 1 },
    },
  }).composite(resized.map((input, index) => ({
    input,
    left: (index % columns) * cell.width,
    top: Math.floor(index / columns) * cell.height,
  }))).png().toFile(outputPath);
}
