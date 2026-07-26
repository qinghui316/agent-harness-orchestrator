#!/usr/bin/env node

/* global process, URL */

import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cutoutStagingMaster } from "./cutout-pipeline.mjs";
import { extractGridProofAction, extractProofPhase } from "./proof-pipeline.mjs";
import { buildActionAssets, buildOfficeAssets, buildPropAssets, validateApprovedActionSources, writeOfficeBuildReceipt } from "./image-pipeline.mjs";
import { loadOfficeAssetManifest, validateOfficeAssetManifest } from "./manifest.mjs";
import { buildApprovedBakedShadows } from "./baked-shadow-pipeline.mjs";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const defaultManifestPath = resolve(repositoryRoot, "design-assets", "agent-office", "office-assets.manifest.json");

export async function runOfficeAssetCli(argv) {
  const [command = "help", firstArgument, secondArgument] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    return {
      exitCode: 0,
      output: [
        "Usage: node scripts/office-assets/office-assets.mjs <command> [manifest]",
        "",
        "Commands:",
        "  check-manifest  Validate counts, ordering, paths, and frame plan without images.",
        "  check-approved <action-id>  Validate one complete-character action source sequence.",
        "  cutout <input> <output-directory>  Convert one flat-key staging master into validated transparent proof assets.",
        "  cutout-sequence <input-directory> <output-directory>  Rebuild a sorted *-source.png sequence with current cutout gates.",
        "  proof-phase <input> <action:first:count:phase>  Extract one 4x2 consecutive-frame staging board.",
        "  proof-grid <input> <action:count:columns:rows[:inset]>  Extract a row-major gridded action board without retaining grid lines.",
        "  pack-action <action-id>  Build one proof action at 1x/2x with contact and anchor reports.",
        "  pack-props      Build the approved static props as independent 1x/2x atlases.",
        "  prepare-shadows  Build approved 2x shadow sources from the selected Image 2 extractions.",
        "  pack            Rebuild deterministic 1x/2x WebP atlases and Pixi JSON.",
        "",
        "This tool never invokes Imagegen and never selects draft images automatically.",
      ].join("\n"),
    };
  }

  if (command === "cutout") {
    if (!firstArgument || !secondArgument) throw new Error("cutout requires an input PNG and output directory.");
    const result = await cutoutStagingMaster(resolve(process.cwd(), firstArgument), resolve(process.cwd(), secondArgument));
    return { exitCode: 0, output: JSON.stringify(result.report, null, 2) };
  }
  if (command === "cutout-sequence") {
    if (!firstArgument || !secondArgument) throw new Error("cutout-sequence requires input and output directories.");
    const inputRoot = resolve(process.cwd(), firstArgument);
    const outputRoot = resolve(process.cwd(), secondArgument);
    const files = (await readdir(inputRoot)).filter((name) => name.endsWith("-source.png")).sort();
    if (files.length === 0) throw new Error("cutout-sequence found no *-source.png files.");
    const reports = [];
    for (const file of files) {
      const outputStem = basename(file, "-source.png");
      const result = await cutoutStagingMaster(join(inputRoot, file), outputRoot, { outputStem, writeQa: false });
      reports.push(result.report);
    }
    return { exitCode: 0, output: JSON.stringify({ frameCount: reports.length, reports }, null, 2) };
  }
  if (command === "proof-phase") {
    if (!firstArgument || !secondArgument) throw new Error("proof-phase requires an input and action:first:count:phase descriptor.");
    const [actionId, firstFrame, frameCount, phaseId] = secondArgument.split(":");
    if (!actionId || !phaseId) throw new Error("proof-phase descriptor must be action:first:count:phase.");
    const result = await extractProofPhase(resolve(process.cwd(), firstArgument), {
      repositoryRoot,
      actionId,
      phaseId,
      firstFrame: Number(firstFrame),
      frameCount: Number(frameCount),
    });
    return { exitCode: 0, output: JSON.stringify(result.report, null, 2) };
  }
  if (command === "proof-grid") {
    if (!firstArgument || !secondArgument) throw new Error("proof-grid requires an input and action:count:columns:rows descriptor.");
    const [actionId, frameCount, columns, rows, gridInset] = secondArgument.split(":");
    if (!actionId) throw new Error("proof-grid descriptor must be action:count:columns:rows.");
    const result = await extractGridProofAction(resolve(process.cwd(), firstArgument), {
      repositoryRoot,
      actionId,
      frameCount: Number(frameCount),
      columns: Number(columns),
      rows: Number(rows),
      gridInset: gridInset == null ? undefined : Number(gridInset),
    });
    return { exitCode: 0, output: JSON.stringify(result.report, null, 2) };
  }

  const manifestArgument = command === "pack-action" || command === "check-approved" ? secondArgument : firstArgument;
  const manifestPath = manifestArgument ? resolve(process.cwd(), manifestArgument) : defaultManifestPath;
  const manifest = await loadOfficeAssetManifest(manifestPath);
  if (command === "check-manifest") {
    const result = validateOfficeAssetManifest(manifest);
    return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  }
  if (command === "check-approved") {
    if (!firstArgument) throw new Error("check-approved requires an action id.");
    const result = await validateApprovedActionSources(manifest, repositoryRoot, firstArgument);
    return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  }
  if (command === "pack-action") {
    if (!firstArgument) throw new Error("pack-action requires an action id.");
    const result = await buildActionAssets(manifest, repositoryRoot, firstArgument);
    return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  }
  if (command === "pack-props") {
    const result = await buildPropAssets(manifest, repositoryRoot);
    const receipt = await writeOfficeBuildReceipt(manifest, repositoryRoot);
    return { exitCode: 0, output: JSON.stringify({ ...result, receipt }, null, 2) };
  }
  if (command === "prepare-shadows") {
    const result = await buildApprovedBakedShadows(manifest, repositoryRoot);
    return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  }
  if (command === "pack") {
    const result = await buildOfficeAssets(manifest, repositoryRoot);
    return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  }
  throw new Error(`Unknown office asset command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runOfficeAssetCli(process.argv.slice(2)).then(
    ({ exitCode, output }) => {
      process.stdout.write(`${output}\n`);
      process.exitCode = exitCode;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
