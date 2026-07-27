/* global Buffer, process */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";

export async function readmitOpaquePixels(actionId, frameCount, sourceRoot, cutoutRoot, outputRoot, repositoryRoot = process.cwd()) {
  const assetRoot = `${resolve(repositoryRoot, "design-assets/agent-office")}${sep}`;
  for (const candidate of [sourceRoot, cutoutRoot, outputRoot]) {
    if (!resolve(candidate).startsWith(assetRoot)) throw new Error("Opaque-pixel readmission paths must stay inside design-assets/agent-office.");
  }
  await mkdir(outputRoot, { recursive: true });

  const frames = [];
  let restoredOpaquePixels = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const number = String(index).padStart(4, "0");
    const sourcePath = join(sourceRoot, `${actionId}_${number}-source.png`);
    const cutoutPath = join(cutoutRoot, `${actionId}_${number}-transparent.png`);
    const source = await readRgba(sourcePath);
    const cutout = await readRgba(cutoutPath);
    if (source.info.width !== cutout.info.width || source.info.height !== cutout.info.height) {
      throw new Error(`Frame geometry mismatch: ${actionId}_${number}`);
    }
    const output = Buffer.from(cutout.data);
    let frameRestored = 0;
    for (let offset = 0; offset < output.length; offset += 4) {
      if (output[offset + 3] === 255) {
        const changed = output[offset] !== source.data[offset]
          || output[offset + 1] !== source.data[offset + 1]
          || output[offset + 2] !== source.data[offset + 2];
        output[offset] = source.data[offset];
        output[offset + 1] = source.data[offset + 1];
        output[offset + 2] = source.data[offset + 2];
        if (changed) frameRestored += 1;
      } else if (output[offset + 3] === 0) {
        output[offset] = 0;
        output[offset + 1] = 0;
        output[offset + 2] = 0;
      }
    }
    const outputPath = join(outputRoot, `${actionId}_${number}-transparent.png`);
    await sharp(output, { raw: cutout.info }).png().toFile(outputPath);
    frames.push({ frame: index, restoredOpaquePixels: frameRestored });
    restoredOpaquePixels += frameRestored;
  }

  const report = {
    schemaVersion: 1,
    actionId,
    frameCount,
    restoredOpaquePixels,
    protectedOpaquePixelChangesAfterReadmission: 0,
    transparentNonZeroRgb: 0,
    frames,
  };
  await writeFile(join(outputRoot, "readmission-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function readRgba(path) {
  const { data, info } = await sharp(await readFile(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`Expected RGBA input: ${path}`);
  return { data: Buffer.from(data), info };
}
