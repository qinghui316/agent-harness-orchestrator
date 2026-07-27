import type { Container, Text } from "pixi.js";
import type { OfficeCalibrationDocument } from "./officeCalibrationDocument.js";
import { officeActorLabelLocalPosition, type OfficeActorLabelKind } from "./officeActorLabel.js";

type PixiModule = typeof import("pixi.js");

export function addOfficeActorLabel(
  pixi: PixiModule,
  actorContainer: Container,
  text: string,
  kind: OfficeActorLabelKind,
  calibration: OfficeCalibrationDocument["stationTemplates"][string],
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
