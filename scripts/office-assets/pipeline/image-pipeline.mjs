/* global Buffer */

import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { buildActionFramePlan, buildActionPlaybackPlan, validateOfficeAssetManifest } from "./manifest.mjs";

export class OfficeAssetPipelineError extends Error {
  constructor(message, details = []) {
    super(details.length > 0 ? `${message}\n- ${details.join("\n- ")}` : message);
    this.name = "OfficeAssetPipelineError";
    this.details = details;
  }
}

export async function validateApprovedActionSources(manifest, repositoryRoot, actionId) {
  validateOfficeAssetManifest(manifest);
  const approvedRoot = safeAssetPath(repositoryRoot, manifest.approvedFrameRoot);
  const action = manifest.characterActions.find((candidate) => candidate.id === actionId);
  if (!action) throw new OfficeAssetPipelineError(`Unknown action: ${actionId}`);
  const expectedCanvas = action.canvas2x ?? manifest.frame.canonical2x;
  const missing = [];
  const invalid = [];
  for (const frame of buildActionFramePlan(manifest, actionId)) {
    const path = resolveInside(approvedRoot, frame.sourceFile);
    try {
      await access(path);
      const image = await readValidatedAlphaPng(path, manifest.validation);
      if (image.info.width !== expectedCanvas.width || image.info.height !== expectedCanvas.height) {
        invalid.push(`${frame.sourceFile}: expected ${expectedCanvas.width}x${expectedCanvas.height}, received ${image.info.width}x${image.info.height}`);
      }
      if (!image.bounds) invalid.push(`${frame.sourceFile}: frame is empty`);
      else if (image.bounds.left === 0 || image.bounds.top === 0
        || image.bounds.left + image.bounds.width === image.info.width
        || image.bounds.top + image.bounds.height === image.info.height) {
        invalid.push(`${frame.sourceFile}: visible pixels touch the canvas edge and may be clipped`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") missing.push(frame.sourceFile);
      else invalid.push(`${frame.sourceFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (missing.length || invalid.length) {
    throw new OfficeAssetPipelineError("Approved complete-character frames are incomplete or invalid.", [
      ...missing.map((path) => `missing: ${path}`),
      ...invalid,
    ]);
  }
  return { approvedRoot, actionId, frameCount: buildActionFramePlan(manifest, actionId).length };
}

export async function readCanonicalFullCharacterSequence(inputs, options) {
  const { frameWidth, frameHeight, validation, anchor = { x: 0, y: 0 } } = options;
  if (inputs.length === 0) throw new OfficeAssetPipelineError("Cannot read an empty canonical action sequence.");
  const frames = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const source = await readValidatedAlphaPng(inputs[index].path ?? inputs[index], validation);
    if (source.info.width !== frameWidth || source.info.height !== frameHeight) {
      throw new OfficeAssetPipelineError(
        `canonical frame ${inputs[index].name ?? index} must be ${frameWidth}x${frameHeight}; received ${source.info.width}x${source.info.height}`,
      );
    }
    if (!source.bounds) throw new OfficeAssetPipelineError(`canonical frame ${inputs[index].name ?? index} is empty`);
    frames.push(await frameFromRaw(source, {
      name: inputs[index].name ?? `frame_${String(index).padStart(4, "0")}.png`,
      sourceSize: { width: frameWidth, height: frameHeight },
      anchor,
      sourceBounds: source.bounds,
      validation,
    }));
  }
  return { frames };
}

export async function deriveCanonicalResolution(sequence, options) {
  const { factor, frameWidth, frameHeight, validation, anchor = { x: 0, y: 0 } } = options;
  if (!(factor > 0 && factor < 1)) throw new OfficeAssetPipelineError("Canonical resolution factor must be between zero and one.");
  const frames = [];
  for (const frame of sequence.frames) {
    const expectedWidth = Math.round(frame.sourceSize.width * factor);
    const expectedHeight = Math.round(frame.sourceSize.height * factor);
    if (expectedWidth !== frameWidth || expectedHeight !== frameHeight) {
      throw new OfficeAssetPipelineError("Derived canonical resolution does not match the complete source canvas scale.");
    }
    const resized = await sharp(frame.png).resize(frameWidth, frameHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
    const normalized = await normalizeTransformedPixels(resized, validation);
    const source = await readValidatedAlphaPng(normalized.png, validation);
    if (!source.bounds) throw new OfficeAssetPipelineError(`derived canonical frame ${frame.name} is empty`);
    frames.push(await frameFromRaw(source, {
      name: frame.name,
      sourceSize: { width: frameWidth, height: frameHeight },
      anchor,
      sourceBounds: source.bounds,
      validation,
    }));
  }
  return { frames };
}

export async function placeExtractedFramesOnCanvas(inputs, options) {
  const { frameWidth, frameHeight, validation, anchor = { x: 0, y: 0 } } = options;
  const frames = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const source = await readValidatedAlphaPng(input.path ?? input, validation);
    const placement = input.placement;
    if (!placement || !Number.isFinite(placement.left) || !Number.isFinite(placement.top)) {
      throw new OfficeAssetPipelineError(`proof frame ${input.name ?? index} requires an explicit source-canvas placement`);
    }
    if (placement.left < 0 || placement.top < 0 || placement.left + source.info.width > frameWidth || placement.top + source.info.height > frameHeight) {
      throw new OfficeAssetPipelineError(`proof frame ${input.name ?? index} does not fit its declared source canvas`);
    }
    const png = await sharp({ create: { width: frameWidth, height: frameHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(source.data, { raw: source.info }).png().toBuffer(), left: placement.left, top: placement.top }])
      .png()
      .toBuffer();
    const restored = await readValidatedAlphaPng(png, validation);
    frames.push(await frameFromRaw(restored, {
      name: input.name ?? `frame_${String(index).padStart(4, "0")}.png`,
      sourceSize: { width: frameWidth, height: frameHeight },
      anchor,
      sourceBounds: source.bounds,
      validation,
    }));
  }
  return { frames };
}

export async function transformImportedFramesToCanonicalCanvas(inputs, options) {
  const { frameWidth, frameHeight, scale, translateX, translateY, validation, anchor = { x: 0, y: 0 }, stabilization } = options;
  if (!(scale > 0) || !Number.isFinite(translateX) || !Number.isFinite(translateY)) {
    throw new OfficeAssetPipelineError("Canonical import requires one finite positive scale and translation.");
  }
  const frames = [];
  const postTransformDespillPixels = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const source = await readValidatedAlphaPng(input.path ?? input, validation);
    if (!input.sourcePlacement || !Number.isFinite(input.sourcePlacement.left) || !Number.isFinite(input.sourcePlacement.top)) {
      throw new OfficeAssetPipelineError(`canonical import frame ${input.name ?? index} requires a source placement`);
    }
    const width = Math.max(1, Math.round(source.info.width * scale));
    const height = Math.max(1, Math.round(source.info.height * scale));
    const sourceStabilizationAnchor = stabilization ? findSourceStabilizationAnchor(source, stabilization) : undefined;
    const left = sourceStabilizationAnchor
      ? Math.round(stabilization.target.x - sourceStabilizationAnchor.x * scale)
      : Math.round(translateX + input.sourcePlacement.left * scale);
    const top = sourceStabilizationAnchor
      ? Math.round(stabilization.target.y - sourceStabilizationAnchor.y * scale)
      : Math.round(translateY + input.sourcePlacement.top * scale);
    if (left < 0 || top < 0 || left + width > frameWidth || top + height > frameHeight) {
      throw new OfficeAssetPipelineError(`canonical import frame ${input.name ?? index} does not fit the canonical canvas`);
    }
    const resized = await sharp(source.data, { raw: source.info })
      .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    const png = await sharp({ create: { width: frameWidth, height: frameHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: resized, left, top }])
      .png()
      .toBuffer();
    const normalized = await normalizeTransformedPixels(png, validation);
    const canonical = await readValidatedAlphaPng(normalized.png, validation);
    postTransformDespillPixels.push({ name: input.name ?? index, pixels: normalized.despilledPixels });
    const frame = await frameFromRaw(canonical, {
      name: input.name ?? `frame_${String(index).padStart(4, "0")}.png`,
      sourceSize: { width: frameWidth, height: frameHeight },
      anchor,
      sourceBounds: source.bounds,
      validation,
    });
    if (sourceStabilizationAnchor) {
      frame.trace.stabilizationAnchor = {
        source: sourceStabilizationAnchor,
        target: stabilization.target,
        actual: {
          x: left + sourceStabilizationAnchor.x * scale,
          y: top + sourceStabilizationAnchor.y * scale,
        },
      };
    }
    frames.push(frame);
  }
  if (stabilization) {
    const actualX = frames.map((frame) => frame.trace.stabilizationAnchor.actual.x);
    const actualY = frames.map((frame) => frame.trace.stabilizationAnchor.actual.y);
    const drift = {
      x: Math.max(...actualX) - Math.min(...actualX),
      y: Math.max(...actualY) - Math.min(...actualY),
    };
    const maximumDrift = stabilization.maximumDrift ?? 1;
    if (drift.x > maximumDrift || drift.y > maximumDrift) {
      throw new OfficeAssetPipelineError(
        `Canonical stabilization drift exceeds ${maximumDrift}px: x=${drift.x.toFixed(3)}, y=${drift.y.toFixed(3)}`,
      );
    }
  }
  return {
    frames,
    transform: { scale, translateX, translateY },
    pixelNormalization: {
      despilledPixels: postTransformDespillPixels.reduce((sum, frame) => sum + frame.pixels, 0),
      frames: postTransformDespillPixels,
    },
  };
}

export async function assertDistinctFrames(frames, threshold) {
  const signatures = [];
  for (const frame of frames) signatures.push(await sharp(frame.png).resize(32, 32, { fit: "fill" }).ensureAlpha().raw().toBuffer());
  const duplicates = [];
  for (let left = 0; left < signatures.length; left += 1) {
    for (let right = left + 1; right < signatures.length; right += 1) {
      const difference = meanAbsoluteDifference(signatures[left], signatures[right]);
      if (difference <= threshold) duplicates.push(`${frames[left].name} ~= ${frames[right].name} (${difference.toFixed(3)})`);
    }
  }
  if (duplicates.length > 0) throw new OfficeAssetPipelineError("Action contains duplicate or near-duplicate frames.", duplicates);
}

export function buildAnchorReport(actionId, frames) {
  const anchorX = frames.map((frame) => frame.trace.canvasAnchor.x);
  const anchorY = frames.map((frame) => frame.trace.canvasAnchor.y);
  const visibleBottomX = frames.map((frame) => frame.trace.visibleBottomCenter.x);
  const visibleBottomY = frames.map((frame) => frame.trace.visibleBottomCenter.y);
  const stabilizationAnchors = frames.map((frame) => frame.trace.stabilizationAnchor?.actual).filter(Boolean);
  return {
    schemaVersion: 2,
    actionId,
    frameCount: frames.length,
    sourceSize: frames[0]?.sourceSize,
    canvasAnchorRange: { x: range(anchorX), y: range(anchorY) },
    canvasAnchorDrift: { x: Math.max(...anchorX) - Math.min(...anchorX), y: Math.max(...anchorY) - Math.min(...anchorY) },
    visibleBottomCenterRange: { x: range(visibleBottomX), y: range(visibleBottomY) },
    ...(stabilizationAnchors.length === frames.length ? {
      stabilizationAnchorRange: {
        x: range(stabilizationAnchors.map((value) => value.x)),
        y: range(stabilizationAnchors.map((value) => value.y)),
      },
      stabilizationAnchorDrift: {
        x: Math.max(...stabilizationAnchors.map((value) => value.x)) - Math.min(...stabilizationAnchors.map((value) => value.x)),
        y: Math.max(...stabilizationAnchors.map((value) => value.y)) - Math.min(...stabilizationAnchors.map((value) => value.y)),
      },
    } : {}),
    frames: frames.map((frame, frameIndex) => ({ frameIndex, name: frame.name, ...frame.trace })),
  };
}

export async function writeContactSheet(frames, outputPath, options = {}) {
  const columns = options.columns ?? 8;
  const cellWidth = frames[0].sourceSize.width;
  const cellHeight = frames[0].sourceSize.height;
  const rows = Math.ceil(frames.length / columns);
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp({ create: { width: columns * cellWidth, height: rows * cellHeight, channels: 4, background: { r: 232, g: 232, b: 232, alpha: 1 } } })
    .composite(frames.map((frame, index) => ({ input: frame.png, left: (index % columns) * cellWidth, top: Math.floor(index / columns) * cellHeight })))
    .png()
    .toFile(outputPath);
}

export async function writeAnimatedPreview(frames, outputPath, options = {}) {
  if (frames.length === 0) throw new OfficeAssetPipelineError("Cannot preview an empty action sequence.");
  const width = frames[0].sourceSize.width;
  const pageHeight = frames[0].sourceSize.height;
  const pages = [];
  for (const frame of frames) {
    if (frame.sourceSize.width !== width || frame.sourceSize.height !== pageHeight) {
      throw new OfficeAssetPipelineError("Animated preview frames must share one source size.");
    }
    pages.push(await sharp(frame.png).ensureAlpha().raw().toBuffer());
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(Buffer.concat(pages), {
    raw: { width, height: pageHeight * frames.length, channels: 4, pageHeight },
  })
    .webp({
      lossless: false,
      quality: 90,
      alphaQuality: 100,
      smartSubsample: true,
      effort: 1,
      loop: options.loop === false ? 1 : 0,
      delay: Array.from({ length: frames.length }, () => Math.round(1000 / (options.fps ?? 12))),
    })
    .toFile(outputPath);
}

export async function packPixiAtlas(frames, options) {
  const { animationId, animationFrames, outputImage, outputJson, padding, maxWidth, scale, fps, loop, anchor = { x: 0, y: 0 }, visualAnchor, officeMetadata, scarfMaskImage } = options;
  if (frames.length === 0) throw new OfficeAssetPipelineError("Cannot pack an empty atlas.");
  const items = frames.map((frame) => ({ frame, width: frame.bounds.width + padding * 2, height: frame.bounds.height + padding * 2 }));
  const totalArea = items.reduce((sum, item) => sum + item.width * item.height, 0);
  const widest = Math.max(...items.map((item) => item.width));
  const targetWidth = Math.min(maxWidth, Math.max(widest, Math.ceil(Math.sqrt(totalArea) * 1.25)));
  const placements = shelfPack(items, targetWidth);
  const atlasWidth = Math.max(...placements.map((placement) => placement.x + placement.item.width));
  const atlasHeight = Math.max(...placements.map((placement) => placement.y + placement.item.height));
  const composites = [];
  const scarfMaskComposites = [];
  const frameData = {};

  for (const placement of placements) {
    const { frame } = placement.item;
    const trimmed = await sharp(frame.png).extract(frame.bounds).extend({ top: padding, bottom: padding, left: padding, right: padding, extendWith: "copy" }).png().toBuffer();
    composites.push({ input: trimmed, left: placement.x, top: placement.y });
    if (scarfMaskImage) scarfMaskComposites.push({ input: await buildScarfMask(trimmed), left: placement.x, top: placement.y });
    frameData[frame.name] = {
      frame: { x: placement.x + padding, y: placement.y + padding, w: frame.bounds.width, h: frame.bounds.height },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: frame.bounds.left, y: frame.bounds.top, w: frame.bounds.width, h: frame.bounds.height },
      sourceSize: { w: frame.sourceSize.width, h: frame.sourceSize.height },
      anchor,
    };
  }

  await mkdir(dirname(outputImage), { recursive: true });
  await sharp({ create: { width: atlasWidth, height: atlasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .webp({ lossless: true, quality: 100, effort: 6 })
    .toFile(outputImage);
  if (scarfMaskImage) {
    await sharp({ create: { width: atlasWidth, height: atlasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(scarfMaskComposites)
      .webp({ lossless: true, quality: 100, effort: 6 })
      .toFile(scarfMaskImage);
  }
  const json = {
    frames: frameData,
    animations: { [animationId]: animationFrames ?? frames.map((frame) => frame.name) },
    meta: { app: "aho-office-assets", version: "3.0", image: basename(outputImage), format: "RGBA8888", size: { w: atlasWidth, h: atlasHeight }, scale, animation: { fps, loop }, visualAnchor, ...officeMetadata },
  };
  await writeFile(outputJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  return json;
}

export async function buildActionAssets(manifest, repositoryRoot, actionId) {
  validateOfficeAssetManifest(manifest);
  const action = manifest.characterActions.find((candidate) => candidate.id === actionId);
  if (!action) throw new OfficeAssetPipelineError(`Unknown action: ${actionId}`);
  await validateApprovedActionSources(manifest, repositoryRoot, actionId);
  const approvedRoot = safeAssetPath(repositoryRoot, manifest.approvedFrameRoot);
  const runtimeRoot = safeAssetPath(repositoryRoot, manifest.runtimeRoot);
  const publicRoot = resolve(repositoryRoot, "src/web/public/agent-office/actions");
  await mkdir(publicRoot, { recursive: true });
  const plan = buildActionFramePlan(manifest, actionId);
  const playbackPlan = buildActionPlaybackPlan(manifest, actionId);
  const visualAnchor2x = action.visualAnchor2x ?? (action.visualAnchor === "seat"
    ? manifest.canonicalGeometry.seatAnchor2x
    : action.visualAnchor === "ground"
      ? manifest.canonicalGeometry.groundAnchor2x
      : undefined);
  const canonicalSize = action.canvas2x ?? manifest.frame.canonical2x;
  const canonical = await readCanonicalFullCharacterSequence(plan.map((frame) => ({
    path: resolveInside(approvedRoot, frame.sourceFile),
    name: frame.frameName,
  })), {
    frameWidth: canonicalSize.width,
    frameHeight: canonicalSize.height,
    validation: manifest.validation,
    anchor: manifest.frame.anchor,
  });
  const outputs = [];
  for (const resolution of ["2x", "1x"]) {
    const scale = resolution === "2x" ? 2 : 1;
    const size = resolution === "2x"
      ? canonicalSize
      : { width: canonicalSize.width / 2, height: canonicalSize.height / 2 };
    const sequence = resolution === "2x" ? canonical : await deriveCanonicalResolution(canonical, {
      factor: 0.5,
      frameWidth: size.width,
      frameHeight: size.height,
      validation: manifest.validation,
      anchor: manifest.frame.anchor,
    });
    const image = join(runtimeRoot, "actions", `${actionId}@${resolution}.webp`);
    const scarfMaskImage = join(runtimeRoot, "actions", `${actionId}@${resolution}.scarf-mask.webp`);
    await packPixiAtlas(sequence.frames, {
      animationId: actionId,
      animationFrames: playbackPlan,
      outputImage: image,
      outputJson: `${image}.json`,
      padding: manifest.frame.padding,
      maxWidth: manifest.frame[`maxAtlasWidth${resolution}`],
      scale,
      fps: action.fps,
      loop: action.loop,
      anchor: manifest.frame.anchor,
      visualAnchor: visualAnchor2x
        ? {
            x: visualAnchor2x.x * (resolution === "2x" ? 1 : 0.5),
            y: visualAnchor2x.y * (resolution === "2x" ? 1 : 0.5),
          }
        : undefined,
      scarfMaskImage,
    });
    await Promise.all([
      cp(image, join(publicRoot, basename(image)), { force: true }),
      cp(`${image}.json`, join(publicRoot, basename(`${image}.json`)), { force: true }),
      cp(scarfMaskImage, join(publicRoot, basename(scarfMaskImage)), { force: true }),
    ]);
    outputs.push(image, `${image}.json`, scarfMaskImage);
    if (resolution === "2x") {
      const proofRoot = safeAssetPath(repositoryRoot, manifest.proofRoot);
      const actionProofRoot = join(proofRoot, "actions", actionId);
      const framesByName = new Map(sequence.frames.map((frame) => [frame.name, frame]));
      const playbackFrames = playbackPlan.map((name) => framesByName.get(name));
      await writeContactSheet(playbackFrames, join(actionProofRoot, `${actionId}-contact-sheet.png`));
      await writeAnimatedPreview(playbackFrames, join(actionProofRoot, `${actionId}-preview.webp`), { fps: action.fps, loop: action.loop });
      await mkdir(actionProofRoot, { recursive: true });
      await writeFile(join(actionProofRoot, `${actionId}-anchor-report.json`), `${JSON.stringify(buildAnchorReport(actionId, sequence.frames), null, 2)}\n`, "utf8");
    }
  }
  return { actionId, sourceFrameCount: plan.length, frameCount: action.frames, outputs };
}

export async function buildPropAssets(manifest, repositoryRoot) {
  validateOfficeAssetManifest(manifest);
  const approvedRoot = safeAssetPath(repositoryRoot, manifest.approvedFrameRoot);
  const runtimeRoot = safeAssetPath(repositoryRoot, manifest.runtimeRoot);
  const publicRoot = resolve(repositoryRoot, "src/web/public/agent-office/props");
  const frames2x = [];
  const propAnchors2x = {};
  const staticProps = [...manifest.props, ...manifest.shadows];
  for (const prop of staticProps) {
    const validation = manifest.shadows.some((shadow) => shadow.id === prop.id)
      ? { ...manifest.validation, alphaThreshold: 0 }
      : manifest.validation;
    const sourcePath = resolveInside(approvedRoot, prop.file);
    const sourceMetadata = await sharp(sourcePath).metadata();
    const sourceInput = prop.orientation === "flip-y"
      ? await sharp(sourcePath).flip().png().toBuffer()
      : sourcePath;
    const source = await readValidatedAlphaPng(sourceInput, validation);
    if (!source.bounds) throw new OfficeAssetPipelineError(`approved prop ${prop.id} is empty`);
    propAnchors2x[prop.id] = transformPropAnchors(prop.anchors2x ?? {}, prop.orientation, sourceMetadata.width, sourceMetadata.height);
    frames2x.push(await frameFromRaw(source, {
      name: `${prop.id}.png`,
      sourceSize: { width: source.info.width, height: source.info.height },
      anchor: { x: 0, y: 0 },
      sourceBounds: source.bounds,
      validation,
    }));
  }

  const frames1x = [];
  for (const frame of frames2x) {
    const validation = manifest.shadows.some((shadow) => `${shadow.id}.png` === frame.name)
      ? { ...manifest.validation, alphaThreshold: 0 }
      : manifest.validation;
    const width = Math.max(1, Math.round(frame.sourceSize.width * 0.5));
    const height = Math.max(1, Math.round(frame.sourceSize.height * 0.5));
    const resized = await sharp(frame.png).resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
    const normalized = await normalizeTransformedPixels(resized, validation);
    const source = await readValidatedAlphaPng(normalized.png, validation);
    if (!source.bounds) throw new OfficeAssetPipelineError(`derived prop ${frame.name} is empty`);
    frames1x.push(await frameFromRaw(source, {
      name: frame.name,
      sourceSize: { width, height },
      anchor: { x: 0, y: 0 },
      sourceBounds: source.bounds,
      validation,
    }));
  }

  await mkdir(publicRoot, { recursive: true });
  const outputs = [];
  for (const [resolution, frames, scale, maxWidth] of [
    ["2x", frames2x, 2, manifest.frame.maxAtlasWidth2x],
    ["1x", frames1x, 1, manifest.frame.maxAtlasWidth1x],
  ]) {
    const image = join(runtimeRoot, "props", `office-props@${resolution}.webp`);
    await packPixiAtlas(frames, {
      animationId: "office-props",
      outputImage: image,
      outputJson: `${image}.json`,
      padding: manifest.frame.padding,
      maxWidth,
      scale,
      fps: 0,
      loop: false,
      officeMetadata: {
        officeProps: Object.fromEntries(staticProps.map((prop) => [prop.id, {
          frame: `${prop.id}.png`,
          anchors2x: propAnchors2x[prop.id],
          orientation: prop.orientation ?? "identity",
        }])),
      },
    });
    await Promise.all([
      cp(image, join(publicRoot, basename(image)), { force: true }),
      cp(`${image}.json`, join(publicRoot, basename(`${image}.json`)), { force: true }),
    ]);
    outputs.push(image, `${image}.json`);
  }
  return { propCount: manifest.props.length, shadowCount: manifest.shadows.length, frameNames: frames2x.map((frame) => frame.name), outputs };
}

export function transformPropAnchors(anchors, orientation, width, height) {
  if (orientation !== "flip-y") {
    return Object.fromEntries(Object.entries(anchors).map(([name, point]) => [name, { ...point }]));
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new OfficeAssetPipelineError("flip-y prop orientation requires source dimensions");
  const transformed = Object.fromEntries(Object.entries(anchors).map(([name, point]) => [name, { x: point.x, y: height - point.y }]));
  const first = transformed["screen-top-left"];
  const second = transformed["screen-bottom-right"];
  if (first && second) {
    transformed["screen-top-left"] = { x: Math.min(first.x, second.x), y: Math.min(first.y, second.y) };
    transformed["screen-bottom-right"] = { x: Math.max(first.x, second.x), y: Math.max(first.y, second.y) };
  }
  return transformed;
}

async function buildScarfMask(input) {
  const source = await rawRgba(input);
  const mask = Buffer.alloc(source.data.length);
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const red = source.data[offset];
    const green = source.data[offset + 1];
    const blue = source.data[offset + 2];
    const alpha = source.data[offset + 3];
    const isScarf = alpha > 0
      && red >= 120
      && green >= 28
      && green <= 175
      && blue <= 120
      && red >= green * 1.2
      && red >= blue * 1.55;
    if (!isScarf) continue;
    mask[offset] = 255;
    mask[offset + 1] = 255;
    mask[offset + 2] = 255;
    mask[offset + 3] = alpha;
  }
  return sharp(mask, { raw: source.info }).png().toBuffer();
}

export async function buildOfficeAssets(manifest, repositoryRoot) {
  const runtimeRoot = safeAssetPath(repositoryRoot, manifest.runtimeRoot);
  const publicRoot = resolve(repositoryRoot, "src/web/public/agent-office");
  for (const action of manifest.characterActions) {
    await validateApprovedActionSources(manifest, repositoryRoot, action.id);
  }
  await Promise.all([
    rm(join(runtimeRoot, "actions"), { recursive: true, force: true }),
    rm(join(runtimeRoot, "props"), { recursive: true, force: true }),
    rm(join(publicRoot, "actions"), { recursive: true, force: true }),
    rm(join(publicRoot, "props"), { recursive: true, force: true }),
  ]);
  const actions = [];
  for (const action of manifest.characterActions) actions.push(await buildActionAssets(manifest, repositoryRoot, action.id));
  const props = await buildPropAssets(manifest, repositoryRoot);
  return writeOfficeBuildReceipt(manifest, repositoryRoot, {
    characterActions: actions.length,
    characterFrames: actions.reduce((sum, action) => sum + action.frameCount, 0),
    props: props.propCount,
    shadows: props.shadowCount,
  });
}

export async function writeOfficeBuildReceipt(manifest, repositoryRoot, actual = {}) {
  const runtimeRoot = safeAssetPath(repositoryRoot, manifest.runtimeRoot);
  const publicRoot = resolve(repositoryRoot, "src/web/public/agent-office");
  const propsAtlases = {};
  for (const resolution of ["1x", "2x"]) {
    const imageName = `office-props@${resolution}.webp`;
    propsAtlases[resolution] = {
      imageSha256: sha256(await readFile(join(runtimeRoot, "props", imageName))),
      metadataSha256: sha256(await readFile(join(runtimeRoot, "props", `${imageName}.json`))),
    };
  }
  const receipt = {
    schemaVersion: 3,
    manifestAssetFamily: manifest.assetFamily,
    characterActions: actual.characterActions ?? manifest.characterActions.length,
    characterFrames: actual.characterFrames ?? manifest.characterActions.reduce((sum, action) => sum + action.frames, 0),
    props: actual.props ?? manifest.props.length,
    shadows: actual.shadows ?? manifest.shadows.length,
    propsAtlases,
    screens: manifest.screenAnimations.map((screen) => ({ id: screen.id, frames: screen.frames })),
    effects: manifest.effects.map((effect) => ({ id: effect.id, frames: effect.frames })),
  };
  await writeFile(join(runtimeRoot, "build-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(join(publicRoot, "build-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readValidatedAlphaPng(input, validation) {
  const metadata = await sharp(input).metadata();
  if (metadata.format !== "png" || !metadata.hasAlpha) throw new OfficeAssetPipelineError("approved frame must be a PNG with alpha");
  const image = await rawRgba(input);
  let transparentNonZeroRgb = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3];
    if (alpha === 0 && (image.data[offset] || image.data[offset + 1] || image.data[offset + 2])) transparentNonZeroRgb += 1;
  }
  if (transparentNonZeroRgb !== validation.transparentNonZeroRgb) throw new OfficeAssetPipelineError(`frame has ${transparentNonZeroRgb} colored transparent pixels`);
  return { ...image, bounds: findAlphaBounds(image.data, image.info.width, image.info.height, validation.alphaThreshold) };
}

async function frameFromRaw(source, options) {
  const data = Buffer.from(source.data);
  zeroTransparentRgb(data);
  const bounds = findAlphaBounds(data, source.info.width, source.info.height, options.validation?.alphaThreshold ?? 8) ?? source.bounds;
  if (!bounds) throw new OfficeAssetPipelineError(`frame ${options.name} is empty`);
  const png = await sharp(data, { raw: source.info }).png().toBuffer();
  return {
    name: options.name,
    png,
    bounds,
    sourceSize: options.sourceSize,
    trace: {
      sourceBounds: options.sourceBounds,
      visibleBounds: bounds,
      visibleBottomCenter: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height },
      canvasAnchor: {
        x: options.anchor.x * options.sourceSize.width,
        y: options.anchor.y * options.sourceSize.height,
      },
    },
  };
}

async function normalizeTransformedPixels(input) {
  const image = await rawRgba(input);
  const data = Buffer.from(image.data);
  const despilledPixels = 0;
  for (let offset = 0; offset < data.length; offset += image.info.channels) {
    const alpha = data[offset + 3];
    if (alpha === 0) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      continue;
    }
  }
  return {
    png: await sharp(data, { raw: image.info }).png().toBuffer(),
    despilledPixels,
  };
}

async function rawRgba(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), info };
}

function zeroTransparentRgb(data) {
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] !== 0) continue;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
  }
}

function findSourceStabilizationAnchor(source, stabilization) {
  if (stabilization.type !== "scarf-band-and-visible-bottom") {
    throw new OfficeAssetPipelineError(`Unsupported canonical stabilization type: ${stabilization.type}`);
  }
  const color = stabilization.color ?? {};
  let matchedPixels = 0;
  let bestRow = { count: 0, left: source.info.width, right: -1, y: -1 };
  for (let y = 0; y < source.info.height; y += 1) {
    let rowCount = 0;
    let rowLeft = source.info.width;
    let rowRight = -1;
    for (let x = 0; x < source.info.width; x += 1) {
      const offset = (y * source.info.width + x) * source.info.channels;
      const red = source.data[offset];
      const green = source.data[offset + 1];
      const blue = source.data[offset + 2];
      const alpha = source.data[offset + 3];
      const matches = alpha > (color.alphaMin ?? 32)
        && red >= (color.redMin ?? 150)
        && green >= (color.greenMin ?? 25)
        && green <= (color.greenMax ?? 140)
        && blue <= (color.blueMax ?? 90)
        && red >= green * (color.redGreenRatioMin ?? 1.5);
      if (!matches) continue;
      matchedPixels += 1;
      rowCount += 1;
      rowLeft = Math.min(rowLeft, x);
      rowRight = Math.max(rowRight, x);
    }
    if (rowCount > bestRow.count) bestRow = { count: rowCount, left: rowLeft, right: rowRight, y };
  }
  if (matchedPixels < (stabilization.minimumPixels ?? 400) || bestRow.right < bestRow.left || !source.bounds) {
    throw new OfficeAssetPipelineError("Canonical frame does not contain a stable scarf band landmark.");
  }
  return {
    x: (bestRow.left + bestRow.right) / 2,
    y: source.bounds.top + source.bounds.height,
    scarfBandY: bestRow.y,
    matchedPixels,
  };
}

function findAlphaBounds(data, width, height, threshold) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function shelfPack(items, maxWidth) {
  const placements = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of items) {
    if (x > 0 && x + item.width > maxWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    placements.push({ item, x, y });
    x += item.width;
    rowHeight = Math.max(rowHeight, item.height);
  }
  return placements;
}

function meanAbsoluteDifference(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

function range(values) {
  return { min: Math.min(...values), max: Math.max(...values), span: Math.max(...values) - Math.min(...values) };
}

export function safeAssetPath(repositoryRoot, relativePath) {
  const assetRoot = resolve(repositoryRoot, "design-assets", "agent-office");
  const target = resolve(repositoryRoot, relativePath);
  if (target !== assetRoot && !target.startsWith(`${assetRoot}${sep}`)) throw new OfficeAssetPipelineError(`Refusing asset path outside ${relative(repositoryRoot, assetRoot)}: ${relativePath}`);
  return target;
}

function resolveInside(root, relativePath) {
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new OfficeAssetPipelineError(`Refusing source path outside approved root: ${relativePath}`);
  return target;
}

export async function readManifestFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
