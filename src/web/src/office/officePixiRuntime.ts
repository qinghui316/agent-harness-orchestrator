import type * as Pixi from "pixi.js";

type PixiModule = typeof Pixi;

export type OfficePixiLoaders = {
  loadCspCompatibility: () => Promise<unknown>;
  loadPixi: () => Promise<PixiModule>;
};

const defaultLoaders: OfficePixiLoaders = {
  loadCspCompatibility: () => import("pixi.js/unsafe-eval"),
  loadPixi: () => import("pixi.js"),
};

export async function loadOfficePixiModule(loaders: OfficePixiLoaders = defaultLoaders): Promise<PixiModule> {
  await loaders.loadCspCompatibility();
  return loaders.loadPixi();
}
