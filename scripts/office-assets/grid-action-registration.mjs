/* global process */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAnchorReport,
  transformImportedFramesToCanonicalCanvas,
  writeAnimatedPreview,
  writeContactSheet,
} from "./image-pipeline.mjs";

export async function registerGridAction(actionId, frameCount, target, repositoryRoot = process.cwd()) {
  const extractedRoot = resolve(repositoryRoot, `design-assets/agent-office/proof/actions/${actionId}/extracted`);
  const outputRoot = resolve(repositoryRoot, `design-assets/agent-office/proof/actions/${actionId}/registered`);
  await mkdir(outputRoot, { recursive: true });
  const inputs = Array.from({ length: frameCount }, (_, index) => {
    const name = `${actionId}_${String(index).padStart(4, "0")}.png`;
    return { name, path: join(extractedRoot, name), sourcePlacement: { left: 0, top: 0 } };
  });
  const sequence = await transformImportedFramesToCanonicalCanvas(inputs, {
    frameWidth: 960,
    frameHeight: 960,
    scale: 1,
    translateX: 0,
    translateY: 0,
    validation: { alphaThreshold: 8, visibleKeyPixels: 0, transparentNonZeroRgb: 0 },
    stabilization: {
      type: "scarf-band-and-visible-bottom",
      target,
      minimumPixels: 400,
      maximumDrift: 1,
    },
  });
  for (const frame of sequence.frames) await writeFile(join(outputRoot, frame.name), frame.png);
  const contactSheet = join(outputRoot, `${actionId}-registered-contact-sheet.png`);
  const preview = join(outputRoot, `${actionId}-registered-preview.webp`);
  const anchorReport = buildAnchorReport(`${actionId}:registered`, sequence.frames);
  await Promise.all([
    writeContactSheet(sequence.frames, contactSheet, { columns: 4 }),
    writeAnimatedPreview(sequence.frames, preview, { fps: 12, loop: true }),
    writeFile(join(outputRoot, `${actionId}-registered-anchor-report.json`), `${JSON.stringify(anchorReport, null, 2)}\n`, "utf8"),
  ]);
  const report = {
    schemaVersion: 1,
    actionId,
    frameCount,
    operation: "whole-frame-translation-only",
    scale: 1,
    target,
    stabilizationAnchorDrift: anchorReport.stabilizationAnchorDrift,
    pixelNormalization: sequence.pixelNormalization,
    outputs: {
      frames: "registered",
      contactSheet: basename(contactSheet),
      preview: basename(preview),
      anchorReport: `${actionId}-registered-anchor-report.json`,
    },
  };
  await writeFile(join(outputRoot, "registration-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actionId = process.argv[2];
  const frameCount = Number(process.argv[3]);
  const targetX = Number(process.argv[4]);
  const targetY = Number(process.argv[5]);
  if (!actionId || !Number.isInteger(frameCount) || frameCount < 1 || !Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    throw new Error("Usage: node grid-action-registration.mjs <action-id> <frame-count> <target-x> <target-y>");
  }
  registerGridAction(actionId, frameCount, { x: targetX, y: targetY }).then(
    (report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
