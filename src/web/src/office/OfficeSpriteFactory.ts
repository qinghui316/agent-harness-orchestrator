import type { Container, Sprite } from "pixi.js";
import type { OfficeStaticComponent } from "./officeCalibrationDocument.js";
import type { ParsedOfficeAtlas } from "./officeRuntimeAssets.js";

type PixiModule = typeof import("pixi.js");

export class OfficeSpriteFactory {
  constructor(
    private readonly pixi: PixiModule,
    private readonly props: ParsedOfficeAtlas,
  ) {}

  create(component: Readonly<OfficeStaticComponent>): Sprite {
    const metadata = this.props.officeProps[component.resourceId];
    if (!metadata) throw new Error(`Office prop metadata ${component.resourceId} is missing.`);
    const texture = this.props.sheet.textures[metadata.frame];
    if (!texture) throw new Error(`Office prop ${metadata.frame} is missing.`);
    const sprite = new this.pixi.Sprite(texture);
    sprite.position.set(component.localPosition.x, component.localPosition.y);
    sprite.scale.set(component.scale.x, component.scale.y);
    sprite.alpha = component.alpha;
    sprite.visible = component.visible;
    return sprite;
  }

  add(parent: Container, component: Readonly<OfficeStaticComponent>): Sprite {
    const sprite = this.create(component);
    parent.addChild(sprite);
    return sprite;
  }
}
