/* global Buffer, process */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const manifest = JSON.parse(await readFile(resolve("design-assets/agent-office/office-assets.manifest.json"), "utf8"));
const approvedRoot = resolve(manifest.approvedFrameRoot);
const outputPath = resolve("design-assets/agent-office/proof/props/approved-v1/approved-props-contact-sheet.png");
const cell = { width: 400, height: 300 };
const columns = 5;
const rows = Math.ceil(manifest.props.length / columns);
await mkdir(dirname(outputPath), { recursive: true });

const composites = [];
for (let index = 0; index < manifest.props.length; index += 1) {
  const prop = manifest.props[index];
  const image = await sharp(join(approvedRoot, prop.file))
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(360, 240, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const x = (index % columns) * cell.width;
  const y = Math.floor(index / columns) * cell.height;
  composites.push({ input: image, left: x + 20, top: y + 10 });
  composites.push({
    input: Buffer.from(`<svg width="400" height="40" xmlns="http://www.w3.org/2000/svg"><text x="200" y="26" text-anchor="middle" font-family="Arial" font-size="18" fill="#202724">${prop.id}</text></svg>`),
    left: x,
    top: y + 252,
  });
}

await sharp({ create: { width: columns * cell.width, height: rows * cell.height, channels: 4, background: { r: 238, g: 240, b: 239, alpha: 1 } } })
  .composite(composites)
  .png()
  .toFile(outputPath);
process.stdout.write(`${outputPath}\n`);
