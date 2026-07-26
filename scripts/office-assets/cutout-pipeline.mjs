/* global Buffer */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, parse } from "node:path";
import sharp from "sharp";
import { OfficeAssetPipelineError } from "./image-pipeline.mjs";

const DEFAULTS = {
  borderBand: 8,
  borderTolerance: 26,
  minimumUniformBorderRatio: 0.98,
  transparentDistance: 18,
  opaqueDistance: 200,
  minimumGreenDominance: 8,
  minimumBackgroundGreen: 64,
  interiorKeyDominance: 48,
  removeEnclosedKeyBackground: true,
  maximumBackgroundFringeDistance: 2,
  edgeDecontaminationRadius: 6,
  alphaThreshold: 8,
  maximumVisibleKeyPixels: 0,
};

export async function cutoutStagingMaster(input, outputDirectory, options = {}) {
  const { outputStem, outputSuffix = "-transparent", writeQa = true, ...cutoutOptions } = options;
  const { cutout, report: cutoutReport } = await cutoutImage(input, cutoutOptions);
  const sourceName = typeof input === "string" ? basename(input) : `${outputStem ?? "frame"}.png`;
  await mkdir(outputDirectory, { recursive: true });
  const stem = outputStem ?? parse(sourceName).name;
  const cutoutPath = join(outputDirectory, `${stem}${outputSuffix}.png`);
  await sharp(cutout.data, { raw: cutout.info }).png().toFile(cutoutPath);

  const qaPath = writeQa ? join(outputDirectory, `${stem}-alpha-qa.png`) : null;
  if (qaPath) await writeQaComposite(cutout, qaPath);
  const completeReport = {
    schemaVersion: 1,
    input: sourceName,
    ...cutoutReport,
    outputs: {
      cutout: basename(cutoutPath),
      alphaQa: qaPath ? basename(qaPath) : null,
    },
  };
  const reportPath = join(outputDirectory, `${stem}-cutout-report.json`);
  await writeFile(reportPath, `${JSON.stringify(completeReport, null, 2)}\n`, "utf8");
  return { cutoutPath, qaPath, reportPath, report: completeReport };
}

export async function cutoutImage(input, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const source = await readRgba(input);
  const key = sampleBorderMedian(source, settings.borderBand);
  const border = measureBorderUniformity(source, key, settings);
  if (border.ratio < settings.minimumUniformBorderRatio) {
    throw new OfficeAssetPipelineError(
      `Staging background is not flat enough (${(border.ratio * 100).toFixed(2)}% uniform; ${(settings.minimumUniformBorderRatio * 100).toFixed(2)}% required).`,
    );
  }

  const cutout = removeConnectedBackground(source, key, settings);
  if (cutout.preservation.protectedPixelChanges !== 0) {
    throw new OfficeAssetPipelineError(
      `Cutout modified ${cutout.preservation.protectedPixelChanges} protected character pixels.`,
    );
  }
  const report = inspectCutout(cutout, key, settings, cutout.connectedBackground);
  if (report.visibleKeyPixels > settings.maximumVisibleKeyPixels) {
    throw new OfficeAssetPipelineError(`Cutout retains ${report.visibleKeyPixels} visible key-colored pixels.`);
  }
  if (report.transparentNonZeroRgb !== 0) {
    throw new OfficeAssetPipelineError(`Cutout retains RGB data in ${report.transparentNonZeroRgb} transparent pixels.`);
  }

  return {
    cutout: { data: cutout.data, info: cutout.info },
    report: {
    keyColor: rgbHex(key),
    edgeDecontaminationRadius: settings.edgeDecontaminationRadius,
    border,
    ...report,
    preservation: cutout.preservation,
    },
  };
}

function removeConnectedBackground(source, key, settings) {
  const { width, height, channels } = source.info;
  const output = Buffer.from(source.data);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (pixel) => {
    if (visited[pixel]) return;
    const offset = pixel * channels;
    if (!isBackgroundCandidate(output, offset, key, settings)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  if (settings.removeEnclosedKeyBackground) {
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * channels;
      if (!isEnclosedBackgroundSeed(output, offset, key, settings)) continue;
      enqueue(pixel);
    }
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
    if (x > 0 && y > 0) enqueue(pixel - width - 1);
    if (x + 1 < width && y > 0) enqueue(pixel - width + 1);
    if (x > 0 && y + 1 < height) enqueue(pixel + width - 1);
    if (x + 1 < width && y + 1 < height) enqueue(pixel + width + 1);
  }

  for (let pixel = 0; pixel < visited.length; pixel += 1) {
    if (!visited[pixel]) continue;
    const offset = pixel * channels;
    const rgb = [output[offset], output[offset + 1], output[offset + 2]];
    const distance = colorDistance(rgb, key);
    const alpha = matteAlpha(distance, settings.transparentDistance, settings.opaqueDistance);
    if (alpha === 0) {
      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
      output[offset + 3] = 0;
      continue;
    }
    const recovered = recoverForeground(rgb, key, alpha / 255);
    output[offset] = recovered[0];
    output[offset + 1] = Math.min(recovered[1], Math.max(recovered[0], recovered[2]) + 2);
    output[offset + 2] = recovered[2];
    output[offset + 3] = alpha;
  }
  decontaminatePartialEdges(output, width, height, channels, key, settings, visited);
  despillConnectedEdgeGreen(output, channels, visited, settings.minimumGreenDominance);
  const detachedBackgroundMattePixelsRemoved = clearDetachedBackgroundMatte(
    output,
    width,
    height,
    channels,
    visited,
    settings.maximumBackgroundFringeDistance,
  );
  normalizeTransparentRgb(output, channels);
  let protectedPixelChanges = 0;
  for (let pixel = 0; pixel < visited.length; pixel += 1) {
    if (visited[pixel]) continue;
    const offset = pixel * channels;
    for (let channel = 0; channel < channels; channel += 1) {
      if (output[offset + channel] !== source.data[offset + channel]) {
        protectedPixelChanges += 1;
        break;
      }
    }
  }
  return {
    data: output,
    info: source.info,
    preservation: {
      connectedBackgroundPixels: tail,
      protectedPixels: visited.length - tail,
      protectedPixelChanges,
      detachedBackgroundMattePixelsRemoved,
    },
    connectedBackground: visited,
  };
}

function clearDetachedBackgroundMatte(data, width, height, channels, connectedBackground, maximumDistance) {
  const source = Buffer.from(data);
  let removedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * channels;
      if (!connectedBackground[pixel] || source[offset + 3] === 0) continue;
      let nearProtectedPixel = false;
      for (let candidateY = Math.max(0, y - maximumDistance); candidateY <= Math.min(height - 1, y + maximumDistance) && !nearProtectedPixel; candidateY += 1) {
        for (let candidateX = Math.max(0, x - maximumDistance); candidateX <= Math.min(width - 1, x + maximumDistance); candidateX += 1) {
          if (!connectedBackground[candidateY * width + candidateX]) {
            nearProtectedPixel = true;
            break;
          }
        }
      }
      if (nearProtectedPixel) continue;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
      removedPixels += 1;
    }
  }
  return removedPixels;
}

function despillConnectedEdgeGreen(data, channels, connectedBackground, minimumDominance) {
  for (let pixel = 0; pixel < connectedBackground.length; pixel += 1) {
    if (!connectedBackground[pixel]) continue;
    const offset = pixel * channels;
    if (data[offset + 3] === 0) continue;
    const cap = Math.max(data[offset], data[offset + 2]) + 2;
    if (data[offset + 1] - Math.max(data[offset], data[offset + 2]) >= minimumDominance) {
      data[offset + 1] = Math.min(255, cap);
    }
  }
}

function decontaminatePartialEdges(data, width, height, channels, key, settings, connectedBackground) {
  const source = Buffer.from(data);
  const searchRadius = settings.edgeDecontaminationRadius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      if (!connectedBackground[y * width + x]) continue;
      const alpha = source[offset + 3];
      if (alpha === 0 || alpha === 255) continue;

      let nearestOffset = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let candidateY = Math.max(0, y - searchRadius); candidateY <= Math.min(height - 1, y + searchRadius); candidateY += 1) {
        for (let candidateX = Math.max(0, x - searchRadius); candidateX <= Math.min(width - 1, x + searchRadius); candidateX += 1) {
          const candidateOffset = (candidateY * width + candidateX) * channels;
          if (source[candidateOffset + 3] < 250) continue;
          if (colorDistance([source[candidateOffset], source[candidateOffset + 1], source[candidateOffset + 2]], key) < settings.opaqueDistance + 8) continue;
          const distance = (candidateX - x) ** 2 + (candidateY - y) ** 2;
          if (distance >= nearestDistance) continue;
          nearestDistance = distance;
          nearestOffset = candidateOffset;
        }
      }
      if (nearestOffset < 0) continue;

      for (let channel = 0; channel < 3; channel += 1) {
        data[offset + channel] = source[nearestOffset + channel];
      }
    }
  }
}

function isBackgroundCandidate(data, offset, key, settings) {
  const rgb = [data[offset], data[offset + 1], data[offset + 2]];
  const distance = colorDistance(rgb, key);
  const dominance = rgb[1] - Math.max(rgb[0], rgb[2]);
  return rgb[1] >= settings.minimumBackgroundGreen
    && dominance >= settings.minimumGreenDominance
    && distance <= settings.opaqueDistance;
}

function isEnclosedBackgroundSeed(data, offset, key, settings) {
  const rgb = [data[offset], data[offset + 1], data[offset + 2]];
  const distance = colorDistance(rgb, key);
  const dominance = rgb[1] - Math.max(rgb[0], rgb[2]);
  return rgb[1] >= 128
    && dominance >= settings.interiorKeyDominance
    && distance <= 120;
}

function matteAlpha(distance, transparentDistance, opaqueDistance) {
  if (distance <= transparentDistance) return 0;
  if (distance >= opaqueDistance) return 255;
  const value = (distance - transparentDistance) / (opaqueDistance - transparentDistance);
  const smooth = value * value * (3 - 2 * value);
  return Math.round(smooth * 255);
}

function recoverForeground(rgb, key, alpha) {
  if (alpha <= 0.02) return [0, 0, 0];
  return rgb.map((channel, index) => clampByte((channel - (1 - alpha) * key[index]) / alpha));
}

function normalizeTransparentRgb(data, channels) {
  for (let offset = 0; offset < data.length; offset += channels) {
    if (data[offset + 3] !== 0) continue;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
  }
}

function inspectCutout(image, key, settings, connectedBackground) {
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  let transparentNonZeroRgb = 0;
  let visibleKeyPixels = 0;
  for (let pixel = 0; pixel < connectedBackground.length; pixel += 1) {
    const offset = pixel * image.info.channels;
    const alpha = image.data[offset + 3];
    const rgb = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    if (alpha === 0) {
      transparentPixels += 1;
      if (rgb[0] || rgb[1] || rgb[2]) transparentNonZeroRgb += 1;
    } else if (alpha < 255) {
      partialPixels += 1;
    } else {
      opaquePixels += 1;
    }
    if (connectedBackground[pixel] && alpha > settings.alphaThreshold && rgb[1] - Math.max(rgb[0], rgb[2]) >= settings.minimumGreenDominance) {
      visibleKeyPixels += 1;
    }
  }
  return { width: image.info.width, height: image.info.height, transparentPixels, partialPixels, opaquePixels, transparentNonZeroRgb, visibleKeyPixels };
}

async function writeQaComposite(cutout, outputPath) {
  const width = cutout.info.width;
  const height = cutout.info.height;
  const foreground = await sharp(cutout.data, { raw: cutout.info }).png().toBuffer();
  const checker = await checkerboard(width, height);
  const backgrounds = [
    await solid(width, height, { r: 255, g: 255, b: 255 }),
    await solid(width, height, { r: 0, g: 0, b: 0 }),
    await solid(width, height, { r: 128, g: 128, b: 128 }),
    checker,
  ];
  const cells = [];
  for (let index = 0; index < backgrounds.length; index += 1) {
    const composed = await sharp(backgrounds[index]).composite([{ input: foreground }]).png().toBuffer();
    cells.push({ input: composed, left: (index % 2) * width, top: Math.floor(index / 2) * height });
  }
  await sharp({ create: { width: width * 2, height: height * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells)
    .png()
    .toFile(outputPath);
}

async function checkerboard(width, height) {
  const tile = 24;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0 ? 238 : 202;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function solid(width, height, color) {
  return sharp({ create: { width, height, channels: 4, background: { ...color, alpha: 1 } } }).png().toBuffer();
}

function sampleBorderMedian(image, band) {
  const samples = [[], [], []];
  visitBorder(image, band, (offset) => {
    samples[0].push(image.data[offset]);
    samples[1].push(image.data[offset + 1]);
    samples[2].push(image.data[offset + 2]);
  });
  return samples.map((values) => median(values));
}

function measureBorderUniformity(image, key, settings) {
  let total = 0;
  let uniform = 0;
  let maximumDistance = 0;
  visitBorder(image, settings.borderBand, (offset) => {
    const distance = colorDistance([image.data[offset], image.data[offset + 1], image.data[offset + 2]], key);
    total += 1;
    if (distance <= settings.borderTolerance) uniform += 1;
    maximumDistance = Math.max(maximumDistance, distance);
  });
  return { pixels: total, uniformPixels: uniform, ratio: uniform / total, maximumDistance };
}

function visitBorder(image, band, visitor) {
  const { width, height, channels } = image.info;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= band && x < width - band && y >= band && y < height - band) continue;
      visitor((y * width + x) * channels);
    }
  }
}

async function readRgba(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.channels !== 4) throw new OfficeAssetPipelineError("Staging image must decode to RGBA.");
  return { data: Buffer.from(data), info };
}

function colorDistance(rgb, key) {
  return Math.sqrt((rgb[0] - key[0]) ** 2 + (rgb[1] - key[1]) ** 2 + (rgb[2] - key[2]) ** 2);
}

function median(values) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbHex(rgb) {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
