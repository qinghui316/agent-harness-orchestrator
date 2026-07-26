/* global Buffer */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { cutoutImage } from "./cutout-pipeline.mjs";
import {
  assertDistinctFrames,
  buildAnchorReport,
  OfficeAssetPipelineError,
  placeExtractedFramesOnCanvas,
  writeContactSheet,
} from "./image-pipeline.mjs";

export async function extractProofPhase(input, options) {
  const { repositoryRoot, actionId, phaseId, firstFrame, frameCount, columns = 4, rows = 2 } = options;
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > columns * rows) {
    throw new OfficeAssetPipelineError("Proof phase frameCount must fit the declared staging board.");
  }

  const source = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = await cutoutImage(input);
  const components = extractCompleteFrameComponents(result.cutout, frameCount, columns, rows);
  const stagingRoot = safeOfficePath(repositoryRoot, `design-assets/agent-office/staging/actions/${actionId}`);
  const extractedRoot = safeOfficePath(repositoryRoot, `design-assets/agent-office/proof/actions/${actionId}/extracted`);
  const reportRoot = safeOfficePath(repositoryRoot, `design-assets/agent-office/proof/actions/${actionId}/phases`);
  await Promise.all([mkdir(stagingRoot, { recursive: true }), mkdir(extractedRoot, { recursive: true }), mkdir(reportRoot, { recursive: true })]);

  const frames = [];
  const extractedInputs = [];
  const proofWidth = Math.ceil(source.info.width / columns);
  const proofHeight = Math.ceil(source.info.height / rows);
  for (let index = 0; index < components.length; index += 1) {
    const frameIndex = firstFrame + index;
    const frameName = `${actionId}_${String(frameIndex).padStart(4, "0")}.png`;
    const cell = gridSlotBounds(source.info.width, source.info.height, columns, rows, index % columns, Math.floor(index / columns));
    const crop = paddedBoundsInside(components[index].bounds, cell, 16);
    const raw = await sharp(source.data, { raw: source.info }).extract(crop).png().toBuffer();
    const extracted = await sharp(result.cutout.data, { raw: result.cutout.info }).extract(crop).png().toBuffer();
    const placement = { left: crop.left - cell.left, top: crop.top - cell.top };
    await Promise.all([
      writeFile(join(stagingRoot, frameName), raw),
      writeFile(join(extractedRoot, frameName), extracted),
    ]);
    extractedInputs.push({ name: frameName, path: join(extractedRoot, frameName), placement });
    frames.push({ frameIndex, frameName, cell, sourceBounds: components[index].bounds, crop, placement });
  }

  const restored = await placeExtractedFramesOnCanvas(extractedInputs, {
    frameWidth: proofWidth,
    frameHeight: proofHeight,
    validation: options.validation ?? { alphaThreshold: 8, visibleKeyPixels: 0, transparentNonZeroRgb: 0 },
  });
  await assertDistinctFrames(restored.frames, options.duplicateThreshold ?? 0.05);
  const contactPath = join(reportRoot, `${phaseId}-contact-sheet.png`);
  const anchorPath = join(reportRoot, `${phaseId}-anchor-report.json`);
  const anchorReport = buildAnchorReport(`${actionId}:${phaseId}`, restored.frames);
  await Promise.all([
    writeContactSheet(restored.frames, contactPath, { columns }),
    writeFile(anchorPath, `${JSON.stringify(anchorReport, null, 2)}\n`, "utf8"),
  ]);

  const report = {
    schemaVersion: 2,
    actionId,
    phaseId,
    firstFrame,
    frameCount,
    sourceBoard: input,
    boardCutout: result.report,
    totals: {
      visibleKeyPixels: result.report.visibleKeyPixels,
      transparentNonZeroRgb: result.report.transparentNonZeroRgb,
    },
    outputs: { contactSheet: contactPath, anchorReport: anchorPath },
    sourceCanvas: { width: proofWidth, height: proofHeight },
    canvasAnchorDrift: anchorReport.canvasAnchorDrift,
    frames,
  };
  const reportPath = join(reportRoot, `${phaseId}-report.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { reportPath, report };
}

export async function extractGridProofAction(input, options) {
  const {
    repositoryRoot,
    actionId,
    phaseId = "manual-grid",
    firstFrame = 0,
    frameCount,
    columns,
    rows,
    gridInset,
  } = options;
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new OfficeAssetPipelineError("Grid proof columns and rows must be positive integers.");
  }
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > columns * rows) {
    throw new OfficeAssetPipelineError("Grid proof frameCount must fit the declared grid.");
  }

  const sourceBytes = await readFile(input);
  const metadata = await sharp(sourceBytes).metadata();
  if (!metadata.width || !metadata.height) throw new OfficeAssetPipelineError("Grid proof source has no dimensions.");
  const cellWidth = metadata.width / columns;
  const cellHeight = metadata.height / rows;
  const inset = gridInset ?? Math.max(4, Math.ceil(Math.min(cellWidth, cellHeight) * 0.025));
  if (inset * 2 >= cellWidth || inset * 2 >= cellHeight) {
    throw new OfficeAssetPipelineError("Grid proof inset leaves no usable cell area.");
  }

  const stagingRoot = safeOfficePath(repositoryRoot, `design-assets/agent-office/staging/actions/${actionId}`);
  const extractedRoot = safeOfficePath(repositoryRoot, `design-assets/agent-office/proof/actions/${actionId}/extracted`);
  const reportRoot = safeOfficePath(repositoryRoot, `design-assets/agent-office/proof/actions/${actionId}/phases`);
  await Promise.all([mkdir(stagingRoot, { recursive: true }), mkdir(extractedRoot, { recursive: true }), mkdir(reportRoot, { recursive: true })]);

  const frames = [];
  const extractedInputs = [];
  const cutoutReports = [];
  for (let index = 0; index < frameCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cell = gridCellBounds(metadata.width, metadata.height, columns, rows, column, row, inset);
    const cellPng = await sharp(sourceBytes).extract(cell).png().toBuffer();
    const result = await cutoutImage(cellPng);
    const visibleBounds = findVisibleAlphaBounds(result.cutout);
    if (!visibleBounds) throw new OfficeAssetPipelineError(`Grid proof frame ${index} is empty after cutout.`);

    const frameIndex = firstFrame + index;
    const frameName = `${actionId}_${String(frameIndex).padStart(4, "0")}.png`;
    const crop = paddedBounds(visibleBounds, result.cutout.info.width, result.cutout.info.height, 16);
    const raw = await sharp(cellPng).extract(crop).png().toBuffer();
    const extracted = await sharp(result.cutout.data, { raw: result.cutout.info }).extract(crop).png().toBuffer();
    const placement = { left: crop.left, top: crop.top };
    await Promise.all([
      writeFile(join(stagingRoot, frameName), raw),
      writeFile(join(extractedRoot, frameName), extracted),
    ]);
    extractedInputs.push({ name: frameName, path: join(extractedRoot, frameName), placement });
    frames.push({ frameIndex, frameName, grid: { row, column }, cell, crop, placement, sourceBounds: visibleBounds });
    cutoutReports.push({ frameIndex, ...result.report });
  }

  const proofWidth = Math.max(...frames.map((frame) => frame.cell.width));
  const proofHeight = Math.max(...frames.map((frame) => frame.cell.height));
  const restored = await placeExtractedFramesOnCanvas(extractedInputs, {
    frameWidth: proofWidth,
    frameHeight: proofHeight,
    validation: options.validation ?? { alphaThreshold: 8, visibleKeyPixels: 0, transparentNonZeroRgb: 0 },
  });
  await assertDistinctFrames(restored.frames, options.duplicateThreshold ?? 0.05);
  const contactPath = join(reportRoot, `${phaseId}-contact-sheet.png`);
  const alphaQaPath = join(reportRoot, `${phaseId}-alpha-qa.png`);
  const anchorPath = join(reportRoot, `${phaseId}-anchor-report.json`);
  const motionPath = join(reportRoot, `${phaseId}-motion-report.json`);
  const anchorReport = buildAnchorReport(`${actionId}:${phaseId}`, restored.frames);
  const motionReport = await buildMotionContinuityReport(`${actionId}:${phaseId}`, restored.frames, columns);
  await Promise.all([
    writeContactSheet(restored.frames, contactPath, { columns }),
    writeSequenceAlphaQa(restored.frames, alphaQaPath, { columns }),
    writeFile(anchorPath, `${JSON.stringify(anchorReport, null, 2)}\n`, "utf8"),
    writeFile(motionPath, `${JSON.stringify(motionReport, null, 2)}\n`, "utf8"),
  ]);

  const report = {
    schemaVersion: 2,
    actionId,
    phaseId,
    firstFrame,
    frameCount,
    sourceBoard: input,
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    grid: { columns, rows, inset, cellWidth, cellHeight },
    totals: {
      visibleKeyPixels: cutoutReports.reduce((sum, item) => sum + item.visibleKeyPixels, 0),
      transparentNonZeroRgb: cutoutReports.reduce((sum, item) => sum + item.transparentNonZeroRgb, 0),
    },
    outputs: { contactSheet: contactPath, alphaQa: alphaQaPath, anchorReport: anchorPath, motionReport: motionPath },
    sourceCanvas: { width: proofWidth, height: proofHeight },
    canvasAnchorDrift: anchorReport.canvasAnchorDrift,
    motion: motionReport.summary,
    cutoutReports,
    frames,
  };
  const reportPath = join(reportRoot, `${phaseId}-report.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { reportPath, report };
}

function extractCompleteFrameComponents(image, expectedCount, columns, rows) {
  const { width, height, channels } = image.info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];
  for (let seed = 0; seed < width * height; seed += 1) {
    if (visited[seed] || image.data[seed * channels + 3] <= 32) continue;
    let head = 0;
    let tail = 0;
    let pixels = 0;
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    visited[seed] = 1;
    queue[tail++] = seed;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      pixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (const neighbor of neighbors4(pixel, x, y, width, height)) {
        if (visited[neighbor] || image.data[neighbor * channels + 3] <= 32) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (pixels >= 5000) components.push({ pixels, bounds: { left, top, width: right - left + 1, height: bottom - top + 1 } });
  }
  if (components.length !== expectedCount) {
    throw new OfficeAssetPipelineError(`Proof board contains ${components.length} complete-character components; expected ${expectedCount}.`);
  }
  const byY = components.sort((a, b) => centerY(a) - centerY(b));
  const ordered = [];
  let offset = 0;
  for (let row = 0; row < rows && offset < byY.length; row += 1) {
    const rowCount = Math.min(columns, byY.length - offset);
    ordered.push(...byY.slice(offset, offset + rowCount).sort((a, b) => centerX(a) - centerX(b)));
    offset += rowCount;
  }
  return ordered;
}

function neighbors4(pixel, x, y, width, height) {
  const result = [];
  if (x > 0) result.push(pixel - 1);
  if (x + 1 < width) result.push(pixel + 1);
  if (y > 0) result.push(pixel - width);
  if (y + 1 < height) result.push(pixel + width);
  return result;
}

function paddedBounds(bounds, width, height, padding) {
  const left = Math.max(0, bounds.left - padding);
  const top = Math.max(0, bounds.top - padding);
  const right = Math.min(width, bounds.left + bounds.width + padding);
  const bottom = Math.min(height, bounds.top + bounds.height + padding);
  return { left, top, width: right - left, height: bottom - top };
}

function paddedBoundsInside(bounds, container, padding) {
  const left = Math.max(container.left, bounds.left - padding);
  const top = Math.max(container.top, bounds.top - padding);
  const right = Math.min(container.left + container.width, bounds.left + bounds.width + padding);
  const bottom = Math.min(container.top + container.height, bounds.top + bounds.height + padding);
  return { left, top, width: right - left, height: bottom - top };
}

function gridCellBounds(width, height, columns, rows, column, row, inset) {
  const slot = gridSlotBounds(width, height, columns, rows, column, row);
  return {
    left: slot.left + inset,
    top: slot.top + inset,
    width: slot.width - inset * 2,
    height: slot.height - inset * 2,
  };
}

function gridSlotBounds(width, height, columns, rows, column, row) {
  const leftBoundary = Math.floor(column * width / columns);
  const rightBoundary = Math.floor((column + 1) * width / columns);
  const topBoundary = Math.floor(row * height / rows);
  const bottomBoundary = Math.floor((row + 1) * height / rows);
  return {
    left: leftBoundary,
    top: topBoundary,
    width: rightBoundary - leftBoundary,
    height: bottomBoundary - topBoundary,
  };
}

function findVisibleAlphaBounds(image, threshold = 8) {
  const { width, height, channels } = image.info;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (image.data[(y * width + x) * channels + 3] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function writeSequenceAlphaQa(frames, outputPath, options = {}) {
  const columns = options.columns ?? 8;
  const cellWidth = frames[0].sourceSize.width;
  const cellHeight = frames[0].sourceSize.height;
  const rows = Math.ceil(frames.length / columns);
  const sheetWidth = columns * cellWidth;
  const sheetHeight = rows * cellHeight;
  const frameComposites = frames.map((frame, index) => ({
    input: frame.png,
    left: (index % columns) * cellWidth,
    top: Math.floor(index / columns) * cellHeight,
  }));
  const transparentSheet = await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frameComposites)
    .png()
    .toBuffer();
  const backgrounds = [
    { r: 255, g: 255, b: 255 },
    { r: 0, g: 0, b: 0 },
    { r: 128, g: 128, b: 128 },
  ];
  const cells = [];
  for (let index = 0; index < backgrounds.length; index += 1) {
    const background = await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: { ...backgrounds[index], alpha: 1 } } })
      .composite([{ input: transparentSheet }])
      .png()
      .toBuffer();
    cells.push({ input: background, left: (index % 2) * sheetWidth, top: Math.floor(index / 2) * sheetHeight });
  }
  const checker = await checkerboard(sheetWidth, sheetHeight);
  const checkerComposite = await sharp(checker).composite([{ input: transparentSheet }]).png().toBuffer();
  cells.push({ input: checkerComposite, left: sheetWidth, top: sheetHeight });
  await sharp({ create: { width: sheetWidth * 2, height: sheetHeight * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
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

async function buildMotionContinuityReport(actionId, frames, columns) {
  const signatures = [];
  for (const frame of frames) signatures.push(await sharp(frame.png).resize(64, 69, { fit: "fill" }).ensureAlpha().raw().toBuffer());
  const adjacent = [];
  for (let index = 1; index < signatures.length; index += 1) {
    adjacent.push({ from: index - 1, to: index, difference: meanAbsoluteDifference(signatures[index - 1], signatures[index]) });
  }
  const differences = adjacent.map((entry) => entry.difference);
  const loopSeamDifference = meanAbsoluteDifference(signatures.at(-1), signatures[0]);
  return {
    schemaVersion: 1,
    actionId,
    frameCount: frames.length,
    summary: {
      adjacentMinimum: Math.min(...differences),
      adjacentMaximum: Math.max(...differences),
      adjacentMean: differences.reduce((sum, value) => sum + value, 0) / differences.length,
      loopSeamDifference,
    },
    largestTransitions: [...adjacent].sort((left, right) => right.difference - left.difference).slice(0, 10),
    rowBoundaryTransitions: adjacent.filter((entry) => entry.to % columns === 0),
  };
}

function meanAbsoluteDifference(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

function centerX(component) {
  return component.bounds.left + component.bounds.width / 2;
}

function centerY(component) {
  return component.bounds.top + component.bounds.height / 2;
}

function safeOfficePath(repositoryRoot, relativePath) {
  const officeRoot = resolve(repositoryRoot, "design-assets", "agent-office");
  const target = resolve(repositoryRoot, relativePath);
  if (target !== officeRoot && !target.startsWith(`${officeRoot}${sep}`)) throw new OfficeAssetPipelineError(`Refusing proof output outside Agent Office assets: ${relativePath}`);
  return target;
}
