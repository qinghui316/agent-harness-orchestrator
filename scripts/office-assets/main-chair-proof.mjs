/* global Buffer, process */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const CANVAS = { width: 960, height: 960 };
const CHAIR = { left: 535, top: 470, width: 380, height: 450 };

export async function buildMainChairProof(repositoryRoot = process.cwd()) {
  const actorPath = resolve(repositoryRoot, "design-assets/agent-office/approved/actions/working/working_0000.png");
  const chairPath = resolve(repositoryRoot, "design-assets/agent-office/proof/props/main-chair-v2/main-chair-v2-source-transparent.png");
  const outputRoot = resolve(repositoryRoot, "design-assets/agent-office/proof/workstations/main-chair-v2");
  await mkdir(outputRoot, { recursive: true });

  const actor = await sharp(await readFile(actorPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const chairVisible = await sharp(await readFile(chairPath)).ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const chairPng = await sharp(chairVisible).resize(CHAIR.width, CHAIR.height, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const chair = await sharp(chairPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const scarfOverlapPixels = countScarfOverlap(actor, chair);
  if (scarfOverlapPixels !== 0) throw new Error(`Main chair covers ${scarfOverlapPixels} working scarf pixels.`);

  const shadow = await sharp(Buffer.from('<svg width="420" height="64" xmlns="http://www.w3.org/2000/svg"><ellipse cx="210" cy="32" rx="170" ry="18" fill="rgba(20,20,20,0.12)"/></svg>')).blur(8).png().toBuffer();
  const compositePath = join(outputRoot, "working-main-chair-composite.png");
  await sharp({ create: { ...CANVAS, channels: 4, background: { r: 247, g: 247, b: 245, alpha: 1 } } })
    .composite([
      { input: shadow, left: 515, top: 830 },
      { input: actorPath, left: 0, top: 0 },
      { input: chairPng, left: CHAIR.left, top: CHAIR.top },
    ])
    .png()
    .toFile(compositePath);

  const report = {
    schemaVersion: 1,
    canvas: CANVAS,
    chair: CHAIR,
    layerOrder: ["workstation-shadow", "actor", "main-chair-foreground"],
    scarfOverlapPixels,
    shadow: { owner: "Pixi workstation shadow layer", bakedIntoChair: false },
    output: compositePath,
  };
  await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function countScarfOverlap(actor, chair) {
  let overlap = 0;
  for (let y = 0; y < chair.info.height; y += 1) {
    for (let x = 0; x < chair.info.width; x += 1) {
      const chairOffset = (y * chair.info.width + x) * 4;
      if (chair.data[chairOffset + 3] <= 8) continue;
      const actorX = CHAIR.left + x;
      const actorY = CHAIR.top + y;
      const actorOffset = (actorY * actor.info.width + actorX) * 4;
      const red = actor.data[actorOffset];
      const green = actor.data[actorOffset + 1];
      const blue = actor.data[actorOffset + 2];
      const alpha = actor.data[actorOffset + 3];
      if (alpha > 8 && red > 145 && red > green * 1.55 && blue < 70) overlap += 1;
    }
  }
  return overlap;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("main-chair-proof.mjs")) {
  buildMainChairProof().then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`));
}
