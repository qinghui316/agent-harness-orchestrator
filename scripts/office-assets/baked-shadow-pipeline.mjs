import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { safeAssetPath } from "./image-pipeline.mjs";

const SOURCE_PADDING_PIXELS = 8;

export async function buildApprovedBakedShadows(manifest, repositoryRoot) {
  const sourceRoot = safeAssetPath(repositoryRoot, manifest.shadowSourceRoot);
  const approvedRoot = safeAssetPath(repositoryRoot, manifest.approvedFrameRoot);
  const calibrationPath = resolve(repositoryRoot, "design-assets/agent-office/calibration/scene-calibration-v3.json");
  const calibration = JSON.parse(await readFile(calibrationPath, "utf8"));
  const results = [];

  for (const shadow of manifest.shadows) {
    const sourcePath = resolve(sourceRoot, shadow.sourceFile);
    const source = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = alphaBounds(source.data, source.info.width, source.info.height);
    if (!bounds) throw new Error(`Baked shadow source ${shadow.id} has no visible alpha.`);
    const crop = paddedCrop(bounds, source.info.width, source.info.height, SOURCE_PADDING_PIXELS);
    const width2x = Math.max(1, Math.round(crop.width * 2 / shadow.proof.outputScale));
    const height2x = Math.max(1, Math.round(crop.height * 2 / shadow.proof.outputScale));
    const cropped = await sharp(sourcePath)
      .extract(crop)
      .resize(width2x, height2x, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    normalizeShadowPixels(cropped.data);

    const outputPath = resolve(approvedRoot, shadow.file);
    await mkdir(dirname(outputPath), { recursive: true });
    await sharp(cropped.data, { raw: cropped.info }).png().toFile(outputPath);

    const worldOffset = {
      x: (crop.left - shadow.proof.shift.x) / shadow.proof.outputScale,
      y: (crop.top - shadow.proof.shift.y) / shadow.proof.outputScale,
    };
    const parentOrigin = shadow.parent === "facility"
      ? calibration.facilities[shadow.target].origin
      : { x: 0, y: 0 };
    const localOffset = {
      x: worldOffset.x - parentOrigin.x,
      y: worldOffset.y - parentOrigin.y,
    };
    const calibratedShadow = shadow.parent === "facility"
      ? calibration.facilities[shadow.target].shadow
      : calibration.workstations[shadow.target].shadow;
    const calibrationOffset = { x: calibratedShadow.x, y: calibratedShadow.y };
    const calibrationAdjustment = {
      x: calibrationOffset.x - localOffset.x,
      y: calibrationOffset.y - localOffset.y,
    };
    const alpha = alphaStats(cropped.data, cropped.info.width, cropped.info.height);
    if (alpha.borderMaximum !== 0) throw new Error(`Baked shadow ${shadow.id} is clipped at its transparent border.`);
    if (alpha.levels < 8) throw new Error(`Baked shadow ${shadow.id} lacks a multi-level soft alpha falloff.`);

    results.push({
      id: shadow.id,
      sourceFile: shadow.sourceFile,
      approvedFile: shadow.file,
      sourceCanvas: { width: source.info.width, height: source.info.height },
      sourceCrop: crop,
      output2x: { width: width2x, height: height2x },
      proof: shadow.proof,
      parent: shadow.parent,
      target: shadow.target,
      parentOrigin,
      localOffset,
      calibrationOffset,
      calibrationAdjustment,
      alpha,
      sha256: createHash("sha256").update(await readFile(outputPath)).digest("hex"),
    });
  }

  const reportPath = resolve(approvedRoot, "shadows/baked-shadow-calibration.json");
  await writeFile(reportPath, `${JSON.stringify({ schemaVersion: 1, sourcePaddingPixels: SOURCE_PADDING_PIXELS, shadows: results }, null, 2)}\n`, "utf8");
  return { reportPath, shadows: results };
}

function alphaBounds(data, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, right, bottom };
}

function paddedCrop(bounds, width, height, padding) {
  const left = Math.max(0, bounds.left - padding);
  const top = Math.max(0, bounds.top - padding);
  const right = Math.min(width - 1, bounds.right + padding);
  const bottom = Math.min(height - 1, bounds.bottom + padding);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function normalizeShadowPixels(data) {
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
  }
}

function alphaStats(data, width, height) {
  const levels = new Set();
  let visiblePixels = 0;
  let maximum = 0;
  let borderMaximum = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (alpha > 0) {
      visiblePixels += 1;
      maximum = Math.max(maximum, alpha);
      levels.add(alpha);
    }
    const pixel = offset / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) borderMaximum = Math.max(borderMaximum, alpha);
  }
  return { visiblePixels, maximum, levels: levels.size, borderMaximum };
}
