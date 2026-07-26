import type { AnimatedSprite, Container, Sprite, Text } from "pixi.js";
import type { ParsedOfficeAtlas } from "./officeRuntimeAssets.js";
import type { OfficeScreenProfile } from "./officeRuntimeAssets.js";
import type { OfficeActorStatus } from "./officeScene.js";
import type { OfficeComponentTransform, WorkstationCalibration } from "./officeSceneCalibration.js";
import { officeActorLabelLocalPosition, type OfficeActorLabelKind } from "./officeActorLabel.js";

type PixiModule = typeof import("pixi.js");

export function addOfficeActorLabel(
  pixi: PixiModule,
  actorContainer: Container,
  text: string,
  kind: OfficeActorLabelKind,
  calibration: WorkstationCalibration,
  canonicalActionScale: number,
): Text | null {
  if (!calibration.label.visible) return null;
  const position = officeActorLabelLocalPosition(kind, calibration.label, canonicalActionScale);
  const label = new pixi.Text({
    text,
    style: {
      fill: 0x24272a,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 17,
      fontWeight: "600",
      align: "center",
    },
  });
  label.anchor.set(0.5, 1);
  label.position.set(position.x, position.y);
  label.scale.set(calibration.label.scale);
  label.eventMode = "none";
  actorContainer.addChild(label);
  return label;
}

export function createCalibratedWorkstationLayers(
  pixi: PixiModule,
  props: ParsedOfficeAtlas,
  screens: ParsedOfficeAtlas,
  calibration: WorkstationCalibration,
  status: OfficeActorStatus,
  reducedMotion: boolean,
  screenProfile: OfficeScreenProfile = "orchestration",
): { shadow: Container; desk: Container; screenLayer: Container; screen: AnimatedSprite } {
  const shadowLayer = new pixi.Container();
  const deskLayer = new pixi.Container();
  const screenLayer = new pixi.Container();
  addCalibratedShadow(pixi, shadowLayer, props, calibration.shadow);
  addCalibratedProp(pixi, deskLayer, props, calibration.deskId, calibration.desk);
  addCalibratedProp(pixi, deskLayer, props, "standard-monitor", calibration.monitor);

  const screenFrames = screens.animationId ? screens.sheet.animations[screens.animationId] ?? [] : [];
  if (screenFrames.length === 0) throw new Error("Office orchestration screen has no frames.");
  const screen = new pixi.AnimatedSprite(screenFrames);
  screen.anchor.set(0.5);
  screen.position.set(calibration.screen.x, calibration.screen.y);
  screen.width = calibration.screen.width;
  screen.height = calibration.screen.height;
  screen.animationSpeed = Math.max(0.03, screens.animation.fps / 60);
  screen.loop = true;
  screen.alpha = 1;
  screen.visible = calibration.screen.visible;
  if (shouldPlayScreen(status, reducedMotion, screenProfile)) screen.play();
  else screen.gotoAndStop(0);
  const mask = new pixi.Graphics()
    .roundRect(
      calibration.screen.x - calibration.screen.width / 2,
      calibration.screen.y - calibration.screen.height / 2,
      calibration.screen.width,
      calibration.screen.height,
      2,
    )
    .fill(0xffffff);
  mask.visible = calibration.screen.visible;
  screen.mask = mask;
  screenLayer.addChild(mask, screen);
  return { shadow: shadowLayer, desk: deskLayer, screenLayer, screen };
}

export function addCalibratedShadow(
  pixi: PixiModule,
  group: Container,
  props: ParsedOfficeAtlas,
  calibration: WorkstationCalibration["shadow"],
): Sprite {
  const sprite = addCalibratedProp(pixi, group, props, calibration.resourceId, calibration);
  sprite.alpha = calibration.alpha;
  return sprite;
}

export function shouldPlayScreen(status: OfficeActorStatus, reducedMotion: boolean, profile: OfficeScreenProfile): boolean {
  if (reducedMotion) return false;
  return profile === "orchestration" ? status === "working" : status === "idle" || status === "completed";
}

export function drawCalibratedChair(
  pixi: PixiModule,
  group: Container,
  props: ParsedOfficeAtlas,
  calibration: WorkstationCalibration,
): Sprite {
  return addCalibratedProp(pixi, group, props, calibration.chairId, calibration.chair);
}

export function addCalibratedProp(
  pixi: PixiModule,
  group: Container,
  props: ParsedOfficeAtlas,
  propId: string,
  transform: OfficeComponentTransform,
): Sprite {
  const metadata = props.officeProps[propId];
  if (!metadata) throw new Error(`Office prop metadata ${propId} is missing.`);
  const texture = props.sheet.textures[metadata.frame];
  if (!texture) throw new Error(`Office prop ${metadata.frame} is missing.`);
  const trim = texture.trim ?? { x: 0, y: 0 };
  const sprite = new pixi.Sprite(texture);
  sprite.position.set(
    transform.x - trim.x * transform.scaleX,
    transform.y - trim.y * transform.scaleY,
  );
  sprite.scale.set(transform.scaleX, transform.scaleY);
  sprite.visible = transform.visible;
  group.addChild(sprite);
  return sprite;
}
