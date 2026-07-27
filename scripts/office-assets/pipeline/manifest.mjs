import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, sep } from "node:path";

export const ACTION_ORDER = [
  "standby",
  "working",
  "walk-horizontal",
  "walk-vertical",
  "leaving",
  "off-chair",
  "coffee-drink",
  "treadmill",
  "toilet",
  "standing-talk",
  "seated-talk",
  "salute",
  "peek",
];

export const PROOF_ACTIONS = ["standby", "walk-horizontal", "off-chair"];
export const SCREEN_ORDER = ["orchestration", "entertainment-1", "entertainment-2"];
export const EFFECT_ORDER = ["coffee-cup"];
export const SHADOW_ORDER = [
  "standard-workstation-shadow",
  "main-workstation-shadow",
  "coffee-facility-shadow",
  "treadmill-facility-shadow",
];

export class OfficeAssetManifestError extends Error {
  constructor(issues) {
    super(`Invalid office asset manifest:\n- ${issues.join("\n- ")}`);
    this.name = "OfficeAssetManifestError";
    this.issues = issues;
  }
}

export async function loadOfficeAssetManifest(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  validateOfficeAssetManifest(value);
  return value;
}

export function validateOfficeAssetManifest(manifest) {
  const issues = [];
  if (manifest?.schemaVersion !== 3) issues.push("schemaVersion must be 3");
  validateRelativeRoot(manifest?.approvedFrameRoot, "approvedFrameRoot", issues);
  validateRelativeRoot(manifest?.runtimeRoot, "runtimeRoot", issues);
  validateRelativeRoot(manifest?.proofRoot, "proofRoot", issues);
  validateRelativeRoot(manifest?.shadowSourceRoot, "shadowSourceRoot", issues);
  validateCanonicalFrameContract(manifest?.frame, issues);
  validateCanonicalGeometry(manifest?.canonicalGeometry, issues);

  const actions = manifest?.characterActions;
  validateUniqueCollection(actions, ACTION_ORDER.length, "characterActions", issues);
  const actionIds = Array.isArray(actions) ? actions.map((action) => action.id) : [];
  if (JSON.stringify(actionIds) !== JSON.stringify(ACTION_ORDER)) issues.push("character action order does not match the canonical order");
  let characterFrameCount = 0;
  let characterSourceFrameCount = 0;
  for (const action of actions ?? []) {
    if (!Number.isInteger(action.frames) || action.frames < 2) issues.push(`action ${action.id} requires at least two complete-character frames`);
    const sourceFrames = action.sourceFrames ?? action.frames;
    if (!Number.isInteger(sourceFrames) || sourceFrames < 2 || sourceFrames > action.frames) issues.push(`action ${action.id} sourceFrames must be between two and playback frames`);
    if (!Number.isFinite(action.fps) || action.fps <= 0) issues.push(`action ${action.id} requires positive fps`);
    if (typeof action.loop !== "boolean") issues.push(`action ${action.id} loop must be boolean`);
    if (action.sourceKind !== "complete-character-frames") issues.push(`action ${action.id} must use complete-character-frames`);
    validateRelativeRoot(action.directory, `action ${action.id} directory`, issues);
    if (action.framePattern !== `${action.id}_%04d.png`) issues.push(`action ${action.id} framePattern must use its stable action id`);
    if (action.visualAnchor != null && action.visualAnchor !== "seat" && action.visualAnchor !== "ground") issues.push(`action ${action.id} visualAnchor must be seat or ground`);
    validateActionCanvas(action, manifest.frame, issues);
    validatePlayback(action, sourceFrames, issues);
    characterFrameCount += action.frames ?? 0;
    characterSourceFrameCount += sourceFrames ?? 0;
  }

  if (JSON.stringify(manifest?.proofActionIds) !== JSON.stringify(PROOF_ACTIONS)) {
    issues.push("proofActionIds must be standby, walk-horizontal, and off-chair");
  }

  validateUniqueCollection(manifest?.props, 10, "props", issues);
  for (const prop of manifest?.props ?? []) {
    validateRelativePng(prop.file, `prop ${prop.id}`, issues);
    if (prop.orientation != null && prop.orientation !== "flip-y") issues.push(`prop ${prop.id} orientation must be flip-y when declared`);
  }

  validateUniqueCollection(manifest?.shadows, SHADOW_ORDER.length, "shadows", issues);
  const shadowIds = Array.isArray(manifest?.shadows) ? manifest.shadows.map((shadow) => shadow.id) : [];
  if (JSON.stringify(shadowIds) !== JSON.stringify(SHADOW_ORDER)) issues.push("shadow order does not match the canonical order");
  for (const shadow of manifest?.shadows ?? []) {
    validateRelativePng(shadow.file, `shadow ${shadow.id}`, issues);
    validateRelativePng(shadow.sourceFile, `shadow ${shadow.id} source`, issues);
    if (shadow.parent !== "workstation" && shadow.parent !== "facility") issues.push(`shadow ${shadow.id} parent must be workstation or facility`);
    if (typeof shadow.target !== "string" || shadow.target.length === 0) issues.push(`shadow ${shadow.id} requires a target`);
    if (!Number.isFinite(shadow.alpha) || shadow.alpha <= 0 || shadow.alpha > 1) issues.push(`shadow ${shadow.id} alpha must be within (0, 1]`);
    if (!Number.isFinite(shadow.proof?.outputScale) || shadow.proof.outputScale <= 0) issues.push(`shadow ${shadow.id} requires positive proof.outputScale`);
    if (!isFinitePoint(shadow.proof?.shift)) issues.push(`shadow ${shadow.id} requires finite proof.shift`);
  }

  validateUniqueCollection(manifest?.screenAnimations, SCREEN_ORDER.length, "screenAnimations", issues);
  let screenFrameCount = 0;
  const screenIds = Array.isArray(manifest?.screenAnimations) ? manifest.screenAnimations.map((screen) => screen.id) : [];
  if (JSON.stringify(screenIds) !== JSON.stringify(SCREEN_ORDER)) issues.push("screen animation order does not match the canonical order");
  for (const screen of manifest?.screenAnimations ?? []) {
    if (!Number.isInteger(screen.frames) || screen.frames < 25) issues.push(`screen ${screen.id} requires a complete frame sequence`);
    if (!Number.isFinite(screen.fps) || screen.fps <= 0) issues.push(`screen ${screen.id} requires positive fps`);
    if (screen.loop !== true) issues.push(`screen ${screen.id} must loop`);
    if (!Number.isInteger(screen.width2x) || !Number.isInteger(screen.height2x)
      || screen.width2x <= 0 || screen.height2x <= 0 || screen.width2x % 2 !== 0 || screen.height2x % 2 !== 0) {
      issues.push(`screen ${screen.id} requires positive even 2x dimensions`);
    }
    validateRelativeRoot(screen.directory, `screen ${screen.id} directory`, issues);
    screenFrameCount += screen.frames ?? 0;
  }

  validateUniqueCollection(manifest?.effects, EFFECT_ORDER.length, "effects", issues);
  const effectIds = Array.isArray(manifest?.effects) ? manifest.effects.map((effect) => effect.id) : [];
  if (JSON.stringify(effectIds) !== JSON.stringify(EFFECT_ORDER)) issues.push("effect order does not match the canonical order");
  let effectFrameCount = 0;
  for (const effect of manifest?.effects ?? []) {
    if (!Number.isInteger(effect.frames) || effect.frames < 2) issues.push(`effect ${effect.id} requires a complete frame sequence`);
    if (!Number.isFinite(effect.fps) || effect.fps <= 0) issues.push(`effect ${effect.id} requires positive fps`);
    if (effect.loop !== true) issues.push(`effect ${effect.id} must loop`);
    if (!Number.isInteger(effect.width2x) || !Number.isInteger(effect.height2x)
      || effect.width2x <= 0 || effect.height2x <= 0 || effect.width2x % 2 !== 0 || effect.height2x % 2 !== 0) {
      issues.push(`effect ${effect.id} requires positive even 2x dimensions`);
    }
    validateRelativeRoot(effect.directory, `effect ${effect.id} directory`, issues);
    effectFrameCount += effect.frames ?? 0;
  }

  if (manifest?.scarf?.sourceKind !== "synchronized-frame-mask") issues.push("scarf must use synchronized-frame-mask");
  if (manifest?.characterAssembly !== "complete-frame-only") issues.push("characterAssembly must be complete-frame-only");
  if (manifest?.sourceSheetGrid != null) issues.push("sourceSheetGrid is retired; full-frame sources must not use a grid contract");

  if (issues.length > 0) throw new OfficeAssetManifestError(issues);
  return {
    characterActionCount: actions.length,
    characterFrameCount,
    characterSourceFrameCount,
    proofActionCount: manifest.proofActionIds.length,
    propCount: manifest.props.length,
    shadowCount: manifest.shadows.length,
    screenAnimationCount: manifest.screenAnimations.length,
    screenFrameCount,
    effectCount: manifest.effects.length,
    effectFrameCount,
  };
}

export function buildActionFramePlan(manifest, actionId) {
  validateOfficeAssetManifest(manifest);
  const actions = actionId
    ? manifest.characterActions.filter((action) => action.id === actionId)
    : manifest.characterActions;
  if (actionId && actions.length !== 1) throw new OfficeAssetManifestError([`unknown action: ${actionId}`]);
  return actions.flatMap((action) => Array.from({ length: action.sourceFrames ?? action.frames }, (_, frameIndex) => ({
    actionId: action.id,
    sourceFile: `${action.directory}/${action.id}_${String(frameIndex).padStart(4, "0")}.png`,
    frameIndex,
    frameName: `${action.id}_${String(frameIndex).padStart(4, "0")}.png`,
  })));
}

export function buildActionPlaybackPlan(manifest, actionId) {
  validateOfficeAssetManifest(manifest);
  const action = manifest.characterActions.find((candidate) => candidate.id === actionId);
  if (!action) throw new OfficeAssetManifestError([`unknown action: ${actionId}`]);
  const sourceNames = buildActionFramePlan(manifest, actionId).map((frame) => frame.frameName);
  if (action.playback?.type !== "ping-pong") return sourceNames;
  return [
    ...sourceNames,
    ...sourceNames.slice(1, -1).reverse(),
  ];
}

export function listSelectedSourceFiles(manifest, actionId) {
  validateOfficeAssetManifest(manifest);
  return [
    ...manifest.props.map((item) => item.file),
    ...manifest.shadows.map((item) => item.file),
    ...buildActionFramePlan(manifest, actionId).map((item) => item.sourceFile),
  ];
}

function validateUniqueCollection(value, expectedCount, label, issues) {
  if (!Array.isArray(value)) {
    issues.push(`${label} must be an array`);
    return;
  }
  if (value.length !== expectedCount) issues.push(`${label} must contain ${expectedCount} entries`);
  const ids = value.map((item) => item?.id);
  if (ids.some((id) => typeof id !== "string" || id.length === 0)) issues.push(`${label} entries require ids`);
  if (new Set(ids).size !== ids.length) issues.push(`${label} ids must be unique`);
}

function validatePlayback(action, sourceFrames, issues) {
  if (action.playback == null) {
    if (sourceFrames !== action.frames) issues.push(`action ${action.id} requires playback metadata when sourceFrames differs from frames`);
    return;
  }
  if (action.playback.type !== "ping-pong" || action.playback.excludeRepeatedEndpoints !== true) {
    issues.push(`action ${action.id} playback must be endpoint-exclusive ping-pong`);
    return;
  }
  if (action.frames !== sourceFrames * 2 - 2) issues.push(`action ${action.id} ping-pong playback frame count must equal sourceFrames * 2 - 2`);
}

function validateActionCanvas(action, frame, issues) {
  const canvas = action.canvas2x ?? frame.canonical2x;
  if (action.visualAnchor2x != null && (!isFinitePoint(action.visualAnchor2x)
    || action.visualAnchor2x.x <= 0 || action.visualAnchor2x.x >= canvas.width
    || action.visualAnchor2x.y <= 0 || action.visualAnchor2x.y >= canvas.height)) {
    issues.push(`action ${action.id} visualAnchor2x must be inside its 2x canvas`);
  }
  if (action.canvas2x == null) return;
  if (!Number.isInteger(canvas.width) || !Number.isInteger(canvas.height)
    || canvas.width < frame.canonical2x.width || canvas.height < frame.canonical2x.height
    || canvas.width % 2 !== 0 || canvas.height % 2 !== 0) {
    issues.push(`action ${action.id} canvas2x must be an even canvas no smaller than the default canonical canvas`);
    return;
  }
  if (canvas.width > frame.maxAtlasWidth2x) issues.push(`action ${action.id} canvas2x must fit maxAtlasWidth2x`);
}

function validateRelativePng(value, label, issues) {
  validateRelativeRoot(value, `${label} file`, issues);
  if (typeof value === "string" && !value.endsWith(".png")) issues.push(`${label} file must be PNG`);
}

function validateRelativeRoot(value, label, issues) {
  if (typeof value !== "string" || value.length === 0) {
    issues.push(`${label} must be a non-empty relative path`);
    return;
  }
  const normalized = normalize(value);
  if (isAbsolute(value) || normalized === ".." || normalized.startsWith(`..${sep}`)) {
    issues.push(`${label} must stay inside the configured asset root`);
  }
}

function validateCanonicalFrameContract(frame, issues) {
  if (!frame || typeof frame !== "object") {
    issues.push("frame must define the canonical canvas contract");
    return;
  }
  if (frame.source2x != null || frame.source1x != null) {
    issues.push("source2x/source1x are retired; canonical canvases are required");
  }
  validateExactSize(frame.canonical2x, 960, 960, "frame.canonical2x", issues);
  validateExactSize(frame.canonical1x, 480, 480, "frame.canonical1x", issues);
  if (frame.canonical2x && frame.canonical1x
    && (frame.canonical1x.width * 2 !== frame.canonical2x.width || frame.canonical1x.height * 2 !== frame.canonical2x.height)) {
    issues.push("frame.canonical1x must be an exact whole-canvas 0.5 derivation of canonical2x");
  }
  if (frame.anchor?.x !== 0 || frame.anchor?.y !== 0) issues.push("frame.anchor must be the source-canvas origin {x:0,y:0}");
  if (!Number.isInteger(frame.padding) || frame.padding < 1) issues.push("frame.padding must be a positive integer");
  if (!Number.isInteger(frame.maxAtlasWidth2x) || frame.maxAtlasWidth2x < 960) issues.push("frame.maxAtlasWidth2x must fit the canonical 2x canvas");
  if (!Number.isInteger(frame.maxAtlasWidth1x) || frame.maxAtlasWidth1x < 480) issues.push("frame.maxAtlasWidth1x must fit the canonical 1x canvas");
}

function validateCanonicalGeometry(geometry, issues) {
  if (!geometry || typeof geometry !== "object") {
    issues.push("canonicalGeometry is required");
    return;
  }
  if (!isFinitePoint(geometry.seatAnchor2x)) issues.push("canonicalGeometry.seatAnchor2x must be a finite point");
  if (!isFinitePoint(geometry.groundAnchor2x)
    || geometry.groundAnchor2x.x <= 0 || geometry.groundAnchor2x.x >= 960
    || geometry.groundAnchor2x.y <= 0 || geometry.groundAnchor2x.y >= 960) {
    issues.push("canonicalGeometry.groundAnchor2x must be inside the canonical 2x canvas");
  }
  if (!Number.isFinite(geometry.referenceScarfWidth2x) || geometry.referenceScarfWidth2x <= 0) {
    issues.push("canonicalGeometry.referenceScarfWidth2x must be positive");
  }
  if (!Number.isFinite(geometry.maxLandmarkScaleDriftRatio)
    || geometry.maxLandmarkScaleDriftRatio <= 0
    || geometry.maxLandmarkScaleDriftRatio > 0.1) {
    issues.push("canonicalGeometry.maxLandmarkScaleDriftRatio must be within (0, 0.1]");
  }
}

function validateExactSize(value, width, height, label, issues) {
  if (value?.width !== width || value?.height !== height) issues.push(`${label} must be ${width}x${height}`);
}

function isFinitePoint(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y);
}
