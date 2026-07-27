/* global URL */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAnchorReport,
  transformImportedFramesToCanonicalCanvas,
  writeAnimatedPreview,
  writeContactSheet,
} from "../pipeline/image-pipeline.mjs";
import { loadOfficeAssetManifest } from "../pipeline/manifest.mjs";
import { buildActionFramePlan } from "../pipeline/manifest.mjs";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..", "..");

export async function runCanonicalImport(calibrationPath, root = repositoryRoot) {
  const calibration = JSON.parse(await readFile(calibrationPath, "utf8"));
  if (calibration.schemaVersion !== 1) throw new Error("Canonical import calibration schemaVersion must be 1.");
  const manifest = await loadOfficeAssetManifest(resolveInside(root, calibration.manifest));
  const sourceRoot = resolveInside(root, calibration.sourceRoot);
  const sourceReport = JSON.parse(await readFile(resolveInside(root, calibration.sourceReport), "utf8"));
  const outputRoot = resolveInside(root, calibration.outputRoot);
  const outputReport = resolveInside(root, calibration.outputReport);
  const action = manifest.characterActions.find((item) => item.id === calibration.actionId);
  if (!action) throw new Error(`Unknown canonical import action: ${calibration.actionId}`);
  if (sourceReport.actionId !== calibration.actionId || sourceReport.frames.length !== buildActionFramePlan(manifest, calibration.actionId).length) {
    throw new Error("Canonical import source report does not match the manifest action.");
  }
  const inputs = sourceReport.frames.map((frame) => ({
    name: frame.frameName,
    path: join(sourceRoot, frame.frameName),
    sourcePlacement: { left: frame.crop.left, top: frame.crop.top },
  }));
  const sequence = await transformImportedFramesToCanonicalCanvas(inputs, {
    frameWidth: manifest.frame.canonical2x.width,
    frameHeight: manifest.frame.canonical2x.height,
    anchor: manifest.frame.anchor,
    validation: manifest.validation,
    stabilization: calibration.stabilization,
    ...calibration.transform,
  });
  const temporaryRoot = `${outputRoot}.tmp`;
  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });
  for (const frame of sequence.frames) await writeFile(join(temporaryRoot, frame.name), frame.png);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(dirname(outputRoot), { recursive: true });
  await rename(temporaryRoot, outputRoot);

  const proofRoot = dirname(outputReport);
  await mkdir(proofRoot, { recursive: true });
  const contactSheet = join(proofRoot, `${calibration.actionId}-canonical-contact-sheet.png`);
  const preview = join(proofRoot, `${calibration.actionId}-canonical-preview.webp`);
  const report = {
    schemaVersion: 1,
    actionId: calibration.actionId,
    frameCount: sequence.frames.length,
    sourceRoot: calibration.sourceRoot,
    sourceReport: calibration.sourceReport,
    outputRoot: calibration.outputRoot,
    canonicalCanvas: manifest.frame.canonical2x,
    transform: sequence.transform,
    pixelNormalization: sequence.pixelNormalization,
    anchorReport: buildAnchorReport(calibration.actionId, sequence.frames),
    outputs: { contactSheet, preview },
  };
  await Promise.all([
    writeContactSheet(sequence.frames, contactSheet, { columns: calibration.contactSheetColumns ?? 8 }),
    writeAnimatedPreview(sequence.frames, preview, { fps: action.fps, loop: action.loop }),
    writeFile(outputReport, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  ]);
  return report;
}

function resolveInside(root, value) {
  if (typeof value !== "string" || value.length === 0 || normalize(value).startsWith(`..${sep}`)) {
    throw new Error("Canonical import paths must be non-empty repository-relative paths.");
  }
  const target = resolve(root, value);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Canonical import path escapes the repository.");
  return target;
}
