import type { ProductMode } from "../types.js";

export type SharedPresentationSurface =
  | "files" | "git" | "terminal" | "provider" | "model" | "skills"
  | "attachments" | "timeline" | "composer" | "office";

export type HarnessPresentationSurface =
  | "workflow" | "change" | "lane" | "governance-approvals" | "aho-worker" | "integration";

export interface ModePresentationPolicy {
  productMode: ProductMode;
  shared: Readonly<Record<SharedPresentationSurface, true>>;
  harness: Readonly<Record<HarnessPresentationSurface, boolean>>;
}

const SHARED: Readonly<Record<SharedPresentationSurface, true>> = Object.freeze({
  files: true,
  git: true,
  terminal: true,
  provider: true,
  model: true,
  skills: true,
  attachments: true,
  timeline: true,
  composer: true,
  office: true,
});

export function modePresentationPolicy(productMode: ProductMode): ModePresentationPolicy {
  const visible = productMode === "harness";
  return {
    productMode,
    shared: SHARED,
    harness: {
      workflow: visible,
      change: visible,
      lane: visible,
      "governance-approvals": visible,
      "aho-worker": visible,
      integration: visible,
    },
  };
}
