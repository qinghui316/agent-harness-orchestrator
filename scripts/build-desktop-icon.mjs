import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "design-assets/agent-office/approved/actions/standby/standby_0031.png");
const outputDir = resolve(root, "build");
const sizes = [16, 24, 32, 48, 64, 128, 256];

await mkdir(outputDir, { recursive: true });
const base = sharp(source).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
const images = [];
for (const size of sizes) {
  images.push(await base.clone().resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
}
await writeFile(resolve(outputDir, "BeaverCode.png"), images.at(-1));
await writeFile(resolve(outputDir, "BeaverCode.ico"), encodeIco(images, sizes));

function encodeIco(pngs, dimensions) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((png, index) => {
    const size = dimensions[index];
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs]);
}
