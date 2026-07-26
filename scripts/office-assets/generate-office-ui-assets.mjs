import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..", "..");
const publicRoot = join(root, "src", "web", "public", "agent-office");
const runtimeRoot = join(root, "design-assets", "agent-office", "runtime-v3");
const avatarTargets = [join(publicRoot, "avatars"), join(runtimeRoot, "avatars")];
const uiTargets = [join(publicRoot, "ui"), join(runtimeRoot, "ui")];
const temporary = await mkdtemp(join(tmpdir(), "aho-office-ui-"));

const scarfColors = {
  "main-agent": null,
  "planning-agent": [255, 202, 0],
  "coder-agent": [2, 140, 255],
  "auditor-agent": [105, 170, 102],
  "rework-coder": [229, 20, 0],
  "spec-test-proposer": [0, 188, 207],
  "spec-test-generator": [47, 125, 104],
  "memory-maintenance-agent": [139, 111, 71],
  "harness-evolution-agent": [102, 37, 255],
  default: [111, 119, 130],
};

try {
  await Promise.all([...avatarTargets, ...uiTargets].map((directory) => mkdir(directory, { recursive: true })));
  const standby = await frameCanvas("standby", 0);
  for (const [roleId, color] of Object.entries(scarfColors)) {
    const pixels = color ? recolorScarf(standby.pixels, standby.mask, color) : Buffer.from(standby.pixels);
    const bounds = alphaBounds(pixels, standby.raw);
    const avatar = await sharp(pixels, { raw: standby.raw })
      .extract(bounds)
      .resize(84, 84, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ lossless: true })
      .toBuffer();
    await Promise.all(avatarTargets.map((directory) => writeFile(join(directory, `${roleId}.webp`), avatar)));
  }

  for (let index = 0; index < 8; index += 1) {
    const frame = await frameCanvas("walk-vertical", index);
    const bounds = alphaBounds(frame.pixels, frame.raw);
    await sharp(frame.pixels, { raw: frame.raw })
      .extract(bounds)
      .resize(280, 280, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(temporary, `loader-${String(index).padStart(2, "0")}.png`));
  }
  const still = await sharp(join(temporary, "loader-00.png")).webp({ lossless: true }).toBuffer();
  await Promise.all(uiTargets.map((directory) => writeFile(join(directory, "walk-vertical-loader-still.webp"), still)));
  const loaderPath = join(temporary, "walk-vertical-loader.webp");
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-framerate", "12",
    "-i", join(temporary, "loader-%02d.png"), "-loop", "0", "-c:v", "libwebp_anim",
    "-lossless", "1", "-q:v", "78", loaderPath,
  ]);
  const loader = await readFile(loaderPath);
  await Promise.all(uiTargets.map((directory) => writeFile(join(directory, "walk-vertical-loader.webp"), loader)));
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function frameCanvas(actionId, index) {
  const actionRoot = join(publicRoot, "actions");
  const metadata = JSON.parse(await readFile(join(actionRoot, `${actionId}@1x.webp.json`), "utf8"));
  const frameName = `${actionId}_${String(index).padStart(4, "0")}.png`;
  const frame = metadata.frames[frameName];
  if (!frame) throw new Error(`Missing ${frameName}.`);
  const region = frame.frame;
  const source = frame.sourceSize;
  const placement = frame.spriteSourceSize;
  const [actor, mask] = await Promise.all([
    sharp(join(actionRoot, `${actionId}@1x.webp`)).extract({ left: region.x, top: region.y, width: region.w, height: region.h }).ensureAlpha().raw().toBuffer(),
    sharp(join(actionRoot, `${actionId}@1x.scarf-mask.webp`)).extract({ left: region.x, top: region.y, width: region.w, height: region.h }).ensureAlpha().raw().toBuffer(),
  ]);
  const raw = { width: source.w, height: source.h, channels: 4 };
  const [pixels, maskPixels] = await Promise.all([
    sharp({ create: { ...raw, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: actor, raw: { width: region.w, height: region.h, channels: 4 }, left: placement.x, top: placement.y }]).raw().toBuffer(),
    sharp({ create: { ...raw, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: mask, raw: { width: region.w, height: region.h, channels: 4 }, left: placement.x, top: placement.y }]).raw().toBuffer(),
  ]);
  return { pixels, mask: maskPixels, raw };
}

function recolorScarf(source, mask, target) {
  const pixels = Buffer.from(source);
  for (let index = 0; index < pixels.length; index += 4) {
    if (mask[index + 3] === 0) continue;
    const shade = Math.max(0.52, Math.min(1.3, (pixels[index] + pixels[index + 1] * 0.45) / 250));
    pixels[index] = Math.min(255, Math.round(target[0] * shade));
    pixels[index + 1] = Math.min(255, Math.round(target[1] * shade));
    pixels[index + 2] = Math.min(255, Math.round(target[2] * shade));
  }
  return pixels;
}

function alphaBounds(pixels, raw) {
  let left = raw.width;
  let top = raw.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      if (pixels[(y * raw.width + x) * raw.channels + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("Office UI frame has no visible pixels.");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
