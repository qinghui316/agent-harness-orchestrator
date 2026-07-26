import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const designRoot = join("design-assets", "agent-office");
const runtimeRoot = join(designRoot, "runtime-v3");
const publicRoot = join("src", "web", "public", "agent-office");

describe("published Agent Office assets", () => {
  it("records four baked shadows in both build receipts", async () => {
    const runtimeReceipt = JSON.parse(await readFile(join(runtimeRoot, "build-receipt.json"), "utf8"));
    const publicReceipt = JSON.parse(await readFile(join(publicRoot, "build-receipt.json"), "utf8"));
    expect(runtimeReceipt).toEqual(publicReceipt);
    expect(runtimeReceipt).toMatchObject({ props: 10, shadows: 4 });
  });

  it("publishes exactly the approved action set with runtime byte parity", async () => {
    const manifest = JSON.parse(await readFile(join(designRoot, "office-assets.manifest.json"), "utf8"));
    const expected = manifest.characterActions.map((action: { id: string }) => action.id).sort();
    const published = (await readdir(join(publicRoot, "actions")))
      .filter((name) => name.endsWith("@2x.webp"))
      .map((name) => name.replace("@2x.webp", ""))
      .sort();
    expect(published).toEqual(expected);
    for (const directory of ["actions", "props", "screens", "effects"]) {
      for (const name of await readdir(join(runtimeRoot, directory))) {
        expect(hash(await readFile(join(publicRoot, directory, name)))).toBe(hash(await readFile(join(runtimeRoot, directory, name))));
      }
    }
    for (const actionId of expected) {
      expect(await readFile(join(publicRoot, "actions", `${actionId}@1x.scarf-mask.webp`))).toEqual(
        await readFile(join(runtimeRoot, "actions", `${actionId}@1x.scarf-mask.webp`)),
      );
      expect(await readFile(join(publicRoot, "actions", `${actionId}@2x.scarf-mask.webp`))).toEqual(
        await readFile(join(runtimeRoot, "actions", `${actionId}@2x.scarf-mask.webp`)),
      );
    }
  });

  it("carries named prop anchors, three screen profiles, and the coffee effect", async () => {
    const props = JSON.parse(await readFile(join(publicRoot, "props", "office-props@2x.webp.json"), "utf8"));
    expect(Object.keys(props.meta.officeProps)).toEqual([
      "standard-desk", "standard-chair", "standard-monitor", "main-desk", "main-chair",
      "water-coffee", "treadmill", "toilet-back", "toilet-tail-occluder", "toilet-paper-holder",
      "standard-workstation-shadow", "main-workstation-shadow", "coffee-facility-shadow", "treadmill-facility-shadow",
    ]);
    expect(props.meta.officeProps["standard-desk"].anchors2x).toHaveProperty("seat");
    expect(props.meta.officeProps["standard-desk"]).toMatchObject({ orientation: "flip-y", anchors2x: { seat: { x: 827, y: 181 } } });
    expect(props.meta.officeProps["standard-monitor"]).toMatchObject({
      orientation: "flip-y",
      anchors2x: { "screen-top-left": { x: 250, y: 310 }, "screen-bottom-right": { x: 1305, y: 830 } },
    });
    expect(props.meta.officeProps["main-desk"].orientation).toBe("identity");
    expect(props.meta.officeProps.treadmill.anchors2x).toHaveProperty("treadmill-contact");
    expect(props.meta.officeProps["toilet-back"].anchors2x).toHaveProperty("toilet-contact");
    expect(props.meta.officeProps["standard-workstation-shadow"]).toMatchObject({
      frame: "standard-workstation-shadow.png",
      anchors2x: {},
      orientation: "identity",
    });
    const screen = JSON.parse(await readFile(join(publicRoot, "screens", "orchestration@2x.webp.json"), "utf8"));
    expect(screen.animations.orchestration).toHaveLength(145);
    for (const profileId of ["entertainment-1", "entertainment-2"]) {
      const entertainment = JSON.parse(await readFile(join(publicRoot, "screens", `${profileId}@2x.webp.json`), "utf8"));
      expect(entertainment.animations[profileId]).toHaveLength(102);
    }
    const coffee = JSON.parse(await readFile(join(publicRoot, "effects", "coffee-cup@2x.webp.json"), "utf8"));
    expect(coffee.animations["coffee-cup"]).toHaveLength(25);
  });

  it("publishes transparent profile and loading art without opaque black guide lines", async () => {
    for (const directory of ["avatars", "ui"]) {
      for (const name of await readdir(join(runtimeRoot, directory))) {
        expect(await readFile(join(publicRoot, directory, name))).toEqual(await readFile(join(runtimeRoot, directory, name)));
      }
    }
    for (const path of [
      join(publicRoot, "avatars", "main-agent.webp"),
      join(publicRoot, "ui", "walk-vertical-loader-still.webp"),
      join(publicRoot, "ui", "walk-vertical-loader.webp"),
    ]) {
      const image = sharp(path, { animated: true });
      const metadata = await image.metadata();
      expect(metadata.hasAlpha).toBe(true);
      const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(longestOpaqueBlackRun(data, info.width, info.pageHeight ?? info.height, info.pages ?? 1)).toBeLessThan(
        Math.floor(Math.min(info.width, info.pageHeight ?? info.height) * 0.75),
      );
    }
  });
});

function hash(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function longestOpaqueBlackRun(data: Buffer, width: number, pageHeight: number, pages: number): number {
  let longest = 0;
  const isBlack = (offset: number) => data[offset + 3] > 240 && data[offset] < 8 && data[offset + 1] < 8 && data[offset + 2] < 8;
  for (let page = 0; page < pages; page += 1) {
    const pageTop = page * pageHeight;
    for (let y = 0; y < pageHeight; y += 1) {
      let run = 0;
      for (let x = 0; x < width; x += 1) {
        run = isBlack(((pageTop + y) * width + x) * 4) ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
    }
    for (let x = 0; x < width; x += 1) {
      let run = 0;
      for (let y = 0; y < pageHeight; y += 1) {
        run = isBlack(((pageTop + y) * width + x) * 4) ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
    }
  }
  return longest;
}
