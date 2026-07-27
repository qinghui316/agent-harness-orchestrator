/* global process */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  deriveCanonicalResolution,
  packPixiAtlas,
  readCanonicalFullCharacterSequence,
} from "../pipeline/image-pipeline.mjs";

const ACTIONS = [
  {
    id: "standing-talk",
    proof: "design-assets/agent-office/proof/actions/standing-talk/video19/actors",
    frames: 76,
    fps: 24,
    visualAnchor2x: { x: 480, y: 874 },
  },
  {
    id: "seated-talk",
    proof: "design-assets/agent-office/proof/actions/seated-talk/video20/actors",
    frames: 86,
    fps: 24,
    visualAnchor2x: { x: 725, y: 550 },
  },
  {
    id: "salute",
    proof: "design-assets/agent-office/proof/actions/salute/video21/actors",
    frames: 76,
    fps: 24,
    visualAnchor2x: { x: 725, y: 550 },
  },
];

export async function buildHandoffCalibrationAssets(repositoryRoot = process.cwd()) {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "design-assets/agent-office/office-assets.manifest.json"), "utf8"));
  const proofRuntimeRoot = resolve(repositoryRoot, "design-assets/agent-office/proof/runtime/handoff-calibration-actions");
  const publicRoot = resolve(repositoryRoot, "src/web/public/agent-office-calibration/actions");
  await Promise.all([
    rm(proofRuntimeRoot, { recursive: true, force: true }),
    rm(publicRoot, { recursive: true, force: true }),
  ]);
  await Promise.all([mkdir(proofRuntimeRoot, { recursive: true }), mkdir(publicRoot, { recursive: true })]);

  const report = { schemaVersion: 1, status: "proof-only-pending-visual-acceptance", actions: [] };
  for (const action of ACTIONS) {
    const actorRoot = resolve(repositoryRoot, action.proof);
    const sourceFiles = (await readdir(actorRoot)).filter((name) => name.endsWith(".png")).sort();
    if (sourceFiles.length !== action.frames) {
      throw new Error(`${action.id} requires ${action.frames} proof frames, received ${sourceFiles.length}.`);
    }
    const sequence = await readCanonicalFullCharacterSequence(
      sourceFiles.map((file, index) => ({
        path: join(actorRoot, file),
        name: `${action.id}_${String(index).padStart(4, "0")}.png`,
      })),
      {
        frameWidth: manifest.frame.canonical2x.width,
        frameHeight: manifest.frame.canonical2x.height,
        validation: manifest.validation,
        anchor: manifest.frame.anchor,
      },
    );

    const outputs = [];
    for (const resolution of ["2x", "1x"]) {
      const scale = resolution === "2x" ? 2 : 1;
      const frames = resolution === "2x" ? sequence : await deriveCanonicalResolution(sequence, {
        factor: 0.5,
        frameWidth: manifest.frame.canonical1x.width,
        frameHeight: manifest.frame.canonical1x.height,
        validation: manifest.validation,
        anchor: manifest.frame.anchor,
      });
      const image = join(proofRuntimeRoot, `${action.id}@${resolution}.webp`);
      const json = `${image}.json`;
      const mask = join(proofRuntimeRoot, `${action.id}@${resolution}.scarf-mask.webp`);
      await packPixiAtlas(frames.frames, {
        animationId: action.id,
        outputImage: image,
        outputJson: json,
        padding: manifest.frame.padding,
        maxWidth: manifest.frame[`maxAtlasWidth${resolution}`],
        scale,
        fps: action.fps,
        loop: false,
        anchor: manifest.frame.anchor,
        visualAnchor: {
          x: action.visualAnchor2x.x * (resolution === "2x" ? 1 : 0.5),
          y: action.visualAnchor2x.y * (resolution === "2x" ? 1 : 0.5),
        },
        scarfMaskImage: mask,
      });
      for (const path of [image, json, mask]) {
        await cp(path, join(publicRoot, basename(path)), { force: true });
        outputs.push(path.replace(`${repositoryRoot}\\`, ""));
      }
    }
    report.actions.push({ id: action.id, frames: action.frames, fps: action.fps, source: action.proof, outputs });
  }

  await writeFile(join(proofRuntimeRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
