import type { Spritesheet, SpritesheetData, Texture } from "pixi.js";
import { OfficeAssetLoader, type OfficeAtlasHandle } from "./officeAssetLoader.js";
import type { OfficeScarf } from "./officeScene.js";

type PixiModule = typeof import("pixi.js");

type AtlasAnimation = {
  fps: number;
  loop: boolean;
};

type AtlasData = {
  frames: Record<string, AtlasFrameData>;
  animations?: Record<string, string[]>;
  meta?: {
    animation?: AtlasAnimation;
    visualAnchor?: { x: number; y: number };
    scale?: number;
    officeProps?: Record<string, OfficePropMetadata>;
  };
};

type AtlasFrameData = {
  sourceSize?: { w: number; h: number };
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
};

export type OfficePropMetadata = {
  frame: string;
  anchors2x: Record<string, { x: number; y: number }>;
  orientation?: "identity" | "flip-y";
};

export type ParsedOfficeAtlas = {
  sheet: Spritesheet;
  animationId?: string;
  animation: AtlasAnimation;
  visualAnchor?: { x: number; y: number };
  firstFrameVisualBounds?: OfficeAtlasVisualBounds;
  officeProps: Record<string, OfficePropMetadata>;
};

export type OfficeAtlasVisualBounds = {
  sourceSize: { width: number; height: number };
  visibleRect: { x: number; y: number; width: number; height: number };
};

export type OfficeRuntimeAssetOptions = {
  actionRoots?: Readonly<Record<string, string>>;
};

export type OfficeScreenProfile = "orchestration" | "entertainment-1" | "entertainment-2";

export class OfficeRuntimeAssets {
  private readonly loader: OfficeAssetLoader<ParsedOfficeAtlas>;

  constructor(
    private readonly pixi: PixiModule,
    private readonly resolution: "1x" | "2x",
    private readonly options: OfficeRuntimeAssetOptions = {},
  ) {
    this.loader = new OfficeAssetLoader(
      (key, signal) => this.importAtlas(key, signal),
      12,
      (asset) => asset.sheet.destroy(true),
    );
  }

  acquireProps(owner: string): Promise<OfficeAtlasHandle<ParsedOfficeAtlas>> {
    return this.loader.acquire(`props/office-props@${this.resolution}`, owner, "bootstrap");
  }

  acquireAction(actionId: string, scarf: OfficeScarf, owner: string, priority: "bootstrap" | "semantic" | "ambient" = "semantic"): Promise<OfficeAtlasHandle<ParsedOfficeAtlas>> {
    return this.loader.acquire(`actions/${actionId}@${this.resolution}|${scarf}`, owner, priority);
  }

  acquireScreen(profileId: OfficeScreenProfile, owner: string, priority: "bootstrap" | "semantic" | "ambient" = "bootstrap"): Promise<OfficeAtlasHandle<ParsedOfficeAtlas>> {
    return this.loader.acquire(`screens/${profileId}@${this.resolution}`, owner, priority);
  }

  acquireEffect(effectId: "coffee-cup", owner: string, priority: "bootstrap" | "semantic" | "ambient" = "ambient"): Promise<OfficeAtlasHandle<ParsedOfficeAtlas>> {
    return this.loader.acquire(`effects/${effectId}@${this.resolution}`, owner, priority);
  }

  cancel(): void {
    this.loader.dispose();
  }

  dispose(): void {
    this.loader.dispose();
  }

  private async importAtlas(key: string, signal: AbortSignal): Promise<ParsedOfficeAtlas> {
    const [assetPath, scarf = "main"] = key.split("|");
    const actionId = assetPath.startsWith("actions/")
      ? assetPath.slice("actions/".length, assetPath.lastIndexOf("@"))
      : undefined;
    const root = actionId ? this.options.actionRoots?.[actionId] ?? "/agent-office" : "/agent-office";
    const baseUrl = `${root}/${assetPath}`;
    const [jsonResponse, imageResponse] = await Promise.all([
      fetch(`${baseUrl}.webp.json`, { signal }),
      fetch(`${baseUrl}.webp`, { signal }),
    ]);
    if (!jsonResponse.ok || !imageResponse.ok) throw new Error(`Unable to load office atlas ${assetPath}.`);
    const data = await jsonResponse.json() as AtlasData;
    const imageBlob = await imageResponse.blob();
    let scarfMaskBlob: Blob | undefined;
    if (scarf !== "main" && assetPath.startsWith("actions/")) {
      const maskResponse = await fetch(`${baseUrl}.scarf-mask.webp`, { signal });
      if (!maskResponse.ok) throw new Error(`Unable to load office scarf mask ${assetPath}.`);
      scarfMaskBlob = await maskResponse.blob();
    }
    const texture = await textureFromBlob(this.pixi, imageBlob, scarf as OfficeScarf, signal, scarfMaskBlob);
    const sheet = new this.pixi.Spritesheet(texture, data as SpritesheetData);
    await sheet.parse();
    const animationId = data.animations ? Object.keys(data.animations)[0] : undefined;
    const atlasResolution = data.meta?.scale ?? 1;
    const firstFrameId = animationId ? data.animations?.[animationId]?.[0] : undefined;
    const firstFrame = firstFrameId ? data.frames[firstFrameId] : undefined;
    return {
      sheet,
      animationId,
      animation: data.meta?.animation ?? { fps: 0, loop: false },
      visualAnchor: data.meta?.visualAnchor
        ? { x: data.meta.visualAnchor.x / atlasResolution, y: data.meta.visualAnchor.y / atlasResolution }
        : undefined,
      firstFrameVisualBounds: parseFirstFrameVisualBounds(firstFrame, atlasResolution),
      officeProps: data.meta?.officeProps ?? {},
    };
  }
}

function parseFirstFrameVisualBounds(frame: AtlasFrameData | undefined, resolution: number): OfficeAtlasVisualBounds | undefined {
  if (!frame?.sourceSize || !frame.spriteSourceSize || resolution <= 0) return undefined;
  return {
    sourceSize: {
      width: frame.sourceSize.w / resolution,
      height: frame.sourceSize.h / resolution,
    },
    visibleRect: {
      x: frame.spriteSourceSize.x / resolution,
      y: frame.spriteSourceSize.y / resolution,
      width: frame.spriteSourceSize.w / resolution,
      height: frame.spriteSourceSize.h / resolution,
    },
  };
}

async function textureFromBlob(pixi: PixiModule, blob: Blob, scarf: OfficeScarf, signal: AbortSignal, scarfMaskBlob?: Blob): Promise<Texture> {
  const bitmap = await createImageBitmap(blob);
  if (signal.aborted) {
    bitmap.close();
    throw new DOMException("Office asset load cancelled", "AbortError");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: scarfMaskBlob != null });
  if (!context) throw new Error("Canvas 2D context is unavailable for office assets.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  if (scarfMaskBlob && scarf !== "main") {
    const maskBitmap = await createImageBitmap(scarfMaskBlob);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskContext) throw new Error("Canvas 2D mask context is unavailable for office assets.");
    maskContext.drawImage(maskBitmap, 0, 0);
    maskBitmap.close();
    const actorPixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const maskPixels = maskContext.getImageData(0, 0, canvas.width, canvas.height);
    applyScarfMask(actorPixels.data, maskPixels.data, SCARF_RGB[scarf]);
    context.putImageData(actorPixels, 0, 0);
  }
  return pixi.Texture.from(canvas);
}

const SCARF_RGB: Record<Exclude<OfficeScarf, "main">, readonly [number, number, number]> = {
  planning: [255, 202, 0],
  coder: [2, 140, 255],
  auditor: [105, 170, 102],
  rework: [229, 20, 0],
  "spec-test-proposer": [0, 188, 207],
  "spec-test-generator": [47, 125, 104],
  maintenance: [139, 111, 71],
  evolution: [102, 37, 255],
  default: [111, 119, 130],
};

export function applyScarfMask(actor: Uint8ClampedArray, mask: Uint8ClampedArray, target: readonly [number, number, number]): void {
  if (actor.length !== mask.length) throw new Error("Office scarf mask dimensions must match the actor atlas.");
  for (let index = 0; index < actor.length; index += 4) {
    if (mask[index + 3] === 0) continue;
    const red = actor[index]!;
    const green = actor[index + 1]!;
    const shade = Math.max(0.52, Math.min(1.3, (red + green * 0.45) / 250));
    actor[index] = Math.min(255, Math.round(target[0] * shade));
    actor[index + 1] = Math.min(255, Math.round(target[1] * shade));
    actor[index + 2] = Math.min(255, Math.round(target[2] * shade));
  }
}
