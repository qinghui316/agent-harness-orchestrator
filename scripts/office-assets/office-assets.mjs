#!/usr/bin/env node

/* global process, URL */

import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const defaultRepositoryRoot = resolve(scriptDirectory, "..", "..");

export async function runOfficeAssetCli(argv, repositoryRoot = defaultRepositoryRoot) {
  const [command = "help", ...args] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    return { exitCode: 0, output: helpText() };
  }

  if (command === "check-manifest") {
    const { loadOfficeAssetManifest, validateOfficeAssetManifest } = await import("./pipeline/manifest.mjs");
    return json(validateOfficeAssetManifest(await loadOfficeAssetManifest(manifestPath(repositoryRoot, args[0]))));
  }
  if (command === "check-approved") {
    requireArguments(command, args, 1);
    const [{ loadOfficeAssetManifest }, { validateApprovedActionSources }] = await Promise.all([
      import("./pipeline/manifest.mjs"),
      import("./pipeline/image-pipeline.mjs"),
    ]);
    const manifest = await loadOfficeAssetManifest(manifestPath(repositoryRoot, args[1]));
    return json(await validateApprovedActionSources(manifest, repositoryRoot, args[0]));
  }
  if (command === "cutout" || command === "cutout-sequence") {
    requireArguments(command, args, 2);
    const { cutoutStagingMaster } = await import("./pipeline/cutout-pipeline.mjs");
    const inputRoot = resolve(process.cwd(), args[0]);
    const outputRoot = resolve(process.cwd(), args[1]);
    if (command === "cutout") {
      const result = await cutoutStagingMaster(inputRoot, outputRoot);
      return json(result.report);
    }
    const files = (await readdir(inputRoot)).filter((name) => name.endsWith("-source.png")).sort();
    if (files.length === 0) throw new Error("cutout-sequence found no *-source.png files.");
    const reports = [];
    for (const file of files) {
      const result = await cutoutStagingMaster(join(inputRoot, file), outputRoot, {
        outputStem: basename(file, "-source.png"),
        writeQa: false,
      });
      reports.push(result.report);
    }
    return json({ frameCount: reports.length, reports });
  }
  if (command === "proof-phase" || command === "proof-grid") {
    requireArguments(command, args, 2);
    const { extractGridProofAction, extractProofPhase } = await import("./proofs/proof-pipeline.mjs");
    const [actionId, frameCountOrFirst, columnsOrCount, rowsOrPhase, gridInset] = args[1].split(":");
    if (!actionId || !rowsOrPhase) throw new Error(`${command} received an invalid descriptor.`);
    const options = command === "proof-phase"
      ? { repositoryRoot, actionId, firstFrame: Number(frameCountOrFirst), frameCount: Number(columnsOrCount), phaseId: rowsOrPhase }
      : { repositoryRoot, actionId, frameCount: Number(frameCountOrFirst), columns: Number(columnsOrCount), rows: Number(rowsOrPhase), gridInset: gridInset == null ? undefined : Number(gridInset) };
    const result = command === "proof-phase"
      ? await extractProofPhase(resolve(process.cwd(), args[0]), options)
      : await extractGridProofAction(resolve(process.cwd(), args[0]), options);
    return json(result.report);
  }
  if (command === "pack-action" || command === "pack-props" || command === "pack") {
    if (command === "pack-action") requireArguments(command, args, 1);
    const [{ loadOfficeAssetManifest }, pipeline] = await Promise.all([
      import("./pipeline/manifest.mjs"),
      import("./pipeline/image-pipeline.mjs"),
    ]);
    const manifestArgument = command === "pack-action" ? args[1] : args[0];
    const manifest = await loadOfficeAssetManifest(manifestPath(repositoryRoot, manifestArgument));
    if (command === "pack-action") return json(await pipeline.buildActionAssets(manifest, repositoryRoot, args[0]));
    if (command === "pack-props") {
      const result = await pipeline.buildPropAssets(manifest, repositoryRoot);
      const receipt = await pipeline.writeOfficeBuildReceipt(manifest, repositoryRoot);
      return json({ ...result, receipt });
    }
    return json(await pipeline.buildOfficeAssets(manifest, repositoryRoot));
  }
  if (command === "import-shadows") {
    const [{ loadOfficeAssetManifest }, { importApprovedBakedShadows }] = await Promise.all([
      import("./pipeline/manifest.mjs"),
      import("./imports/baked-shadow-import.mjs"),
    ]);
    const manifest = await loadOfficeAssetManifest(manifestPath(repositoryRoot, args[0]));
    return json(await importApprovedBakedShadows(manifest, repositoryRoot));
  }
  if (command === "import-canonical") {
    requireArguments(command, args, 1);
    const { runCanonicalImport } = await import("./imports/canonical-import.mjs");
    return json(await runCanonicalImport(resolve(process.cwd(), args[0]), repositoryRoot));
  }
  if (command === "import-screen") {
    requireArguments(command, args, 2);
    const { importScreenVideo } = await import("./imports/screen-video-import.mjs");
    return json(await importScreenVideo(resolve(process.cwd(), args[1]), args[0], repositoryRoot));
  }
  if (command === "import-effect") {
    requireArguments(command, args, 2);
    const { importEffectVideo } = await import("./imports/effect-video-import.mjs");
    return json(await importEffectVideo(resolve(process.cwd(), args[1]), args[0], repositoryRoot));
  }
  if (command === "promote-handoff") {
    const { promoteHandoffActions } = await import("./imports/promote-handoff-actions.mjs");
    return json(await promoteHandoffActions(repositoryRoot));
  }
  if (command === "build-handoff-calibration") {
    const { buildHandoffCalibrationAssets } = await import("./imports/handoff-calibration-assets.mjs");
    return json(await buildHandoffCalibrationAssets(repositoryRoot));
  }
  if (command === "generate-ui") {
    const { generateOfficeUiAssets } = await import("./pipeline/generate-office-ui-assets.mjs");
    return json(await generateOfficeUiAssets(repositoryRoot));
  }
  if (command === "cleanup-inventory") {
    const { writeCleanupInventory } = await import("./pipeline/cleanup-inventory.mjs");
    return json(await writeCleanupInventory(repositoryRoot, args[0]));
  }
  throw new Error(`Unknown office asset command: ${command}`);
}

function manifestPath(repositoryRoot, value) {
  return value
    ? resolve(process.cwd(), value)
    : resolve(repositoryRoot, "design-assets", "agent-office", "office-assets.manifest.json");
}

function requireArguments(command, args, count) {
  if (args.length < count || args.slice(0, count).some((value) => !value)) {
    throw new Error(`${command} requires ${count} argument${count === 1 ? "" : "s"}.`);
  }
}

function json(value) {
  return { exitCode: 0, output: JSON.stringify(value, null, 2) };
}

function helpText() {
  return [
    "Usage: node scripts/office-assets/office-assets.mjs <command> [arguments]",
    "",
    "Production: check-manifest, check-approved, pack-action, pack-props, pack, generate-ui, cleanup-inventory",
    "Proofs: cutout, cutout-sequence, proof-phase, proof-grid",
    "Imports: import-shadows, import-canonical, import-screen, import-effect, promote-handoff, build-handoff-calibration",
    "",
    "Import and pack commands are explicit mutating operations. No command selects drafts or invokes Imagegen.",
  ].join("\n");
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
