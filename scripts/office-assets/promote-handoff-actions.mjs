#!/usr/bin/env node

/* global process */

import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const ACTIONS = [
  { id: "standing-talk", frames: 76, source: "design-assets/agent-office/proof/actions/standing-talk/video19/actors" },
  { id: "seated-talk", frames: 86, source: "design-assets/agent-office/proof/actions/seated-talk/video20/actors" },
  { id: "salute", frames: 76, source: "design-assets/agent-office/proof/actions/salute/video21/actors" },
];

export async function promoteHandoffActions(repositoryRoot = process.cwd()) {
  const root = resolve(repositoryRoot);
  const proofRuntime = join(root, "design-assets/agent-office/proof/runtime/handoff-calibration-actions");
  const runtimeActions = join(root, "design-assets/agent-office/runtime-v3/actions");
  const publicActions = join(root, "src/web/public/agent-office/actions");
  await Promise.all([mkdir(runtimeActions, { recursive: true }), mkdir(publicActions, { recursive: true })]);

  for (const action of ACTIONS) {
    const approved = join(root, "design-assets/agent-office/approved/actions", action.id);
    await mkdir(approved, { recursive: true });
    const sourceFrames = (await readdir(join(root, action.source))).filter((name) => name.endsWith(".png")).sort();
    if (sourceFrames.length !== action.frames) throw new Error(`${action.id} expected ${action.frames} approved frames, received ${sourceFrames.length}.`);
    for (let index = 0; index < sourceFrames.length; index += 1) {
      await cp(join(root, action.source, sourceFrames[index]), join(approved, `${action.id}_${String(index).padStart(4, "0")}.png`), { force: true });
    }
    for (const resolution of ["1x", "2x"]) {
      for (const suffix of [".webp", ".webp.json", ".scarf-mask.webp"]) {
        const name = `${action.id}@${resolution}${suffix}`;
        await Promise.all([
          cp(join(proofRuntime, name), join(runtimeActions, name), { force: true }),
          cp(join(proofRuntime, name), join(publicActions, name), { force: true }),
        ]);
      }
    }
  }

  const runtimeReceiptPath = join(root, "design-assets/agent-office/runtime-v3/build-receipt.json");
  const publicReceiptPath = join(root, "src/web/public/agent-office/build-receipt.json");
  const receipt = JSON.parse(await readFile(runtimeReceiptPath, "utf8"));
  receipt.characterActions = 13;
  receipt.characterFrames = 773;
  await Promise.all([
    writeFile(runtimeReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
    writeFile(publicReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
  ]);
  return { actions: ACTIONS.map(({ id, frames }) => ({ id, frames })), receipt };
}

if (process.argv[1] && basename(process.argv[1]) === "promote-handoff-actions.mjs") {
  promoteHandoffActions().then(
    (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
