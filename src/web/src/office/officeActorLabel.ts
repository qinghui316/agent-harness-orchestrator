import type { OfficePoint, WorkstationCalibration } from "./officeSceneCalibration.js";

export type OfficeActorLabelKind = "main" | "standard";

export const RETIRED_OFFICE_LABEL_ORIGIN = { x: 0, y: -128 } as const;

const CANONICAL_FIRST_FRAME_BOUNDS = {
  main: { centerX: 7, top: -195, referenceTopOffset: 4 },
  standard: { centerX: 8.5, top: -195, referenceTopOffset: -50 },
} as const;
const MIN_ACTOR_TOP_CLEARANCE = 24;

export function officeActorLabelLocalPosition(
  kind: OfficeActorLabelKind,
  label: WorkstationCalibration["label"],
  canonicalActionScale: number,
): OfficePoint {
  const basis = CANONICAL_FIRST_FRAME_BOUNDS[kind];
  const scaledTop = basis.top * canonicalActionScale;
  const calibrationDeltaY = label.y - RETIRED_OFFICE_LABEL_ORIGIN.y;
  return {
    x: basis.centerX * canonicalActionScale + label.x - RETIRED_OFFICE_LABEL_ORIGIN.x,
    y: Math.min(
      scaledTop + basis.referenceTopOffset,
      scaledTop - MIN_ACTOR_TOP_CLEARANCE,
    ) + calibrationDeltaY,
  };
}

export function officeActorStatusLocalPosition(
  labelPosition: OfficePoint,
  labelWidth: number,
  labelHeight: number,
): OfficePoint {
  return {
    x: labelPosition.x + labelWidth / 2 + 11.5,
    y: labelPosition.y - labelHeight / 2,
  };
}

export function officeActorLabelWorldPosition(
  kind: OfficeActorLabelKind,
  seatOrigin: OfficePoint,
  workstation: WorkstationCalibration,
  canonicalActionScale: number,
): OfficePoint {
  const local = officeActorLabelLocalPosition(kind, workstation.label, canonicalActionScale);
  return {
    x: seatOrigin.x + workstation.actor.x + local.x,
    y: seatOrigin.y + workstation.actor.y + local.y,
  };
}
