export type OfficePoint = { x: number; y: number };
export type OfficeLayerId = "shadow" | "desk" | "screen" | "actor" | "chair" | "effect";

export const OFFICE_ACTION_IDS = [
  "working",
  "standby",
  "coffee-drink",
  "peek",
  "off-chair",
  "walk-horizontal",
  "walk-vertical",
  "leaving",
  "treadmill",
  "toilet",
  "standing-talk",
  "seated-talk",
  "salute",
] as const;

export type OfficeActionId = (typeof OFFICE_ACTION_IDS)[number];

export const OFFICE_TRANSITION_IDS = [
  "standby-working",
  "working-standby",
  "standby-peek",
  "peek-standby",
  "standby-coffee",
  "coffee-standby",
  "walk-coffee",
  "coffee-return-walk",
  "standby-off-chair",
  "off-chair-leaving",
  "leaving-walk-out",
  "walk-treadmill",
  "treadmill-return-walk",
  "walk-toilet",
  "toilet-return-walk",
  "walk-leaving-return",
  "leaving-off-chair-reverse",
  "off-chair-standby",
  "walk-standing-talk",
  "standing-talk-return-walk",
  "standby-seated-talk",
  "seated-talk-salute",
  "salute-standby",
] as const;

export type OfficeTransitionId = (typeof OFFICE_TRANSITION_IDS)[number];
export type OfficeTransitionDirection = { fromFlipX: boolean; toFlipX: boolean; fromReverse: boolean; toReverse: boolean };

export const OFFICE_ROUTE_STAGE_IDS = [
  "off-chair-out",
  "leaving-out",
  "walk-out",
  "facility-use",
  "facility-reverse",
  "walk-return",
  "leaving-return",
  "off-chair-return",
] as const;

export type OfficeRouteStageId = (typeof OFFICE_ROUTE_STAGE_IDS)[number];
export const OFFICE_FACILITY_ROUTES = ["coffee", "treadmill", "toilet"] as const;
export type OfficeFacilityRoute = (typeof OFFICE_FACILITY_ROUTES)[number];
export const OFFICE_MOVING_ROUTE_STAGE_IDS = [
  "leaving-out",
  "walk-out",
  "walk-return",
  "leaving-return",
] as const;
export type OfficeMovingRouteStageId = (typeof OFFICE_MOVING_ROUTE_STAGE_IDS)[number];
export const OFFICE_ROUTE_STAGE_POINT_IDS = ["start", "waypoint", "end"] as const;
export type OfficeRouteStagePointId = (typeof OFFICE_ROUTE_STAGE_POINT_IDS)[number];
export type OfficeRouteStagePointOffsets = Record<OfficeRouteStagePointId, OfficePoint>;
export const OFFICE_HANDOFF_STAGE_IDS = [
  "source-working-start",
  "source-off-chair-out",
  "source-leaving-out",
  "walk-source-corridor",
  "walk-target-row",
  "walk-target-approach",
  "source-standing-talk",
  "target-seated-talk",
  "target-salute",
  "walk-target-depart",
  "walk-source-row",
  "walk-source-approach",
  "source-leaving-return",
  "source-off-chair-return",
  "source-working-end",
] as const;
export type OfficeHandoffStageId = (typeof OFFICE_HANDOFF_STAGE_IDS)[number];
export const OFFICE_HANDOFF_MOVING_STAGE_IDS = [
  "source-leaving-out",
  "walk-source-corridor",
  "walk-target-row",
  "walk-target-approach",
  "walk-target-depart",
  "walk-source-row",
  "walk-source-approach",
  "source-leaving-return",
] as const;
export type OfficeHandoffMovingStageId = (typeof OFFICE_HANDOFF_MOVING_STAGE_IDS)[number];
export const OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS = [
  "walk-source-corridor",
  "walk-target-row",
  "walk-target-approach",
  "walk-target-depart",
  "walk-source-row",
] as const;
export type OfficeHandoffTargetScopedMovingStageId = (typeof OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS)[number];
export type OfficeFacilityRoutePoints = {
  start: OfficePoint;
  waypoint: OfficePoint;
  contact: OfficePoint;
};
export type OfficeHandoffRoutePoints = {
  sourceSeat: OfficePoint;
  sourceAisle: OfficePoint;
  sourceCorridor: OfficePoint;
  targetCorridor: OfficePoint;
  targetAisle: OfficePoint;
  targetSeat: OfficePoint;
};
export type OfficeHandoffTargetRouteCalibration = {
  targetCorridorOffset: OfficePoint;
  interactionOffset: OfficePoint;
  standingTalkOffset?: OfficePoint;
  seatedTalkOffset?: OfficePoint;
  saluteOffset?: OfficePoint;
  walkVerticalFlipX?: boolean;
  stageOffsets?: Partial<Record<OfficeHandoffTargetScopedMovingStageId, OfficePoint>>;
  stagePointOffsets?: Partial<Record<OfficeHandoffTargetScopedMovingStageId, OfficeRouteStagePointOffsets>>;
  stagePathPointOffsets?: Partial<Record<OfficeHandoffTargetScopedMovingStageId, OfficeRouteStagePointOffsets>>;
};
export type OfficeFacilityTargetRouteCalibration = {
  routePointOffsets?: OfficeFacilityRoutePoints;
  stageOffsets?: Partial<Record<OfficeRouteStageId, OfficePoint>>;
  stagePointOffsets?: Partial<Record<OfficeMovingRouteStageId, OfficeRouteStagePointOffsets>>;
  stageFlipX?: Partial<Record<OfficeRouteStageId, boolean>>;
};
export const OFFICE_MAIN_HANDOFF_SOURCE_SEAT_INDEX = 0;

export const OFFICE_ACTION_FRAME_COUNTS: Record<OfficeActionId, number> = {
  working: 68,
  standby: 62,
  "coffee-drink": 79,
  peek: 48,
  "off-chair": 34,
  "walk-horizontal": 49,
  "walk-vertical": 8,
  leaving: 21,
  treadmill: 45,
  toilet: 121,
  "standing-talk": 76,
  "seated-talk": 86,
  salute: 76,
};

export function officeActionPlaybackRate(actionId: string): number {
  return actionId === "walk-vertical" ? 0.5 : 1;
}

export function officeActionPlaybackFrameCount(actionId: OfficeActionId, sourceFrameCount = OFFICE_ACTION_FRAME_COUNTS[actionId]): number {
  return Math.max(1, Math.ceil(sourceFrameCount / officeActionPlaybackRate(actionId)));
}

export function officeActionSourceFrameIndex(actionId: OfficeActionId, playbackFrame: number, sourceFrameCount: number): number {
  return Math.max(0, Math.min(sourceFrameCount - 1, Math.floor(playbackFrame * officeActionPlaybackRate(actionId))));
}

export type OfficeComponentTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  layer: OfficeLayerId;
  visible: boolean;
};

export type OfficePositionedComponent = {
  x: number;
  y: number;
  layer: OfficeLayerId;
  visible: boolean;
};

export type OfficeShadowCalibration = Omit<OfficeComponentTransform, "layer"> & {
  resourceId: "standard-workstation-shadow" | "main-workstation-shadow" | "coffee-facility-shadow" | "treadmill-facility-shadow";
  alpha: number;
  layer: "shadow";
};

export type WorkstationCalibration = {
  deskId: "standard-desk" | "main-desk";
  chairId: "standard-chair" | "main-chair";
  desk: OfficeComponentTransform;
  monitor: OfficeComponentTransform;
  chair: OfficeComponentTransform;
  actor: OfficePositionedComponent;
  screen: { x: number; y: number; width: number; height: number; layer: OfficeLayerId; visible: boolean };
  shadow: OfficeShadowCalibration;
  label: OfficePositionedComponent & { scale: number };
  anchors: {
    seat: OfficePoint;
    keyboard: OfficePoint;
    monitor: OfficePoint;
    aisleEntry: OfficePoint;
  };
};

export type FacilityCalibration = {
  propId: "water-coffee" | "treadmill" | "toilet-back" | "toilet-paper-holder" | "toilet-tail-occluder" | "coffee-cup";
  origin: OfficePoint;
  scale: number;
  layer: OfficeLayerId;
  visible: boolean;
  shadow?: OfficeShadowCalibration;
  anchors: { aisleEntry: OfficePoint; contact: OfficePoint };
};

export type OfficePreviewSeatCalibration = {
  slotId: string;
  label: string;
  roleId: string;
  workstationKind: "main" | "standard";
  origin: OfficePoint;
  actorOffset: OfficePoint;
  visible: boolean;
  actionId: OfficeActionId;
};

export type OfficeSceneCalibrationV3 = {
  schemaVersion: 3;
  world: { width: number; height: number };
  actionScales: Record<OfficeActionId, number>;
  actionOffsets: Record<OfficeActionId, OfficePoint>;
  transitionDirections: Record<OfficeTransitionId, OfficeTransitionDirection>;
  routeStageOffsets: Record<OfficeFacilityRoute, Record<OfficeRouteStageId, OfficePoint>>;
  routeStagePointOffsets: Record<OfficeFacilityRoute, Record<OfficeMovingRouteStageId, OfficeRouteStagePointOffsets>>;
  facilityRouteTargets?: Record<string, Partial<Record<OfficeFacilityRoute, OfficeFacilityTargetRouteCalibration>>>;
  handoff: {
    stageOffsets: Record<OfficeHandoffStageId, OfficePoint>;
    stagePointOffsets: Record<OfficeHandoffMovingStageId, OfficeRouteStagePointOffsets>;
    stagePathPointOffsets: Record<OfficeHandoffMovingStageId, OfficeRouteStagePointOffsets>;
    targetRoutes: Record<string, OfficeHandoffTargetRouteCalibration>;
  };
  layerOrder: OfficeLayerId[];
  roster: {
    columnStep: number;
    seats: OfficePreviewSeatCalibration[];
  };
  workstations: { standard: WorkstationCalibration; main: WorkstationCalibration };
  facilities: {
    coffee: FacilityCalibration;
    coffeeCup: FacilityCalibration;
    treadmill: FacilityCalibration;
    toilet: FacilityCalibration;
    toiletPaper: FacilityCalibration;
    toiletTailOccluder: FacilityCalibration;
  };
};

export type OfficeSceneGeometryCalibration = Omit<OfficeSceneCalibrationV3, "schemaVersion" | "roster"> & {
  roster: {
    columnStep: number;
    seats: Array<Omit<OfficePreviewSeatCalibration, "actionId"> & { actionId?: OfficeActionId }>;
  };
};

export type ScalableWorkstationComponent = "desk" | "monitor" | "chair" | "screen" | "shadow";

export const OFFICE_COMPONENT_SCALE_MIN = 0.2;
export const OFFICE_COMPONENT_SCALE_MAX = 3;
export const OFFICE_FACILITY_SCALE_MIN = 0.1;
export const OFFICE_FACILITY_SCALE_MAX = 10;
export const OFFICE_ACTION_SCALE_MIN = 0.15;
export const OFFICE_ACTION_SCALE_MAX = 1.2;

const DEFAULT_ACTION_SCALES = Object.fromEntries(OFFICE_ACTION_IDS.map((id) => [id, 0.45])) as Record<OfficeActionId, number>;
const DEFAULT_ACTION_OFFSETS = Object.fromEntries(OFFICE_ACTION_IDS.map((id) => [id, { x: 0, y: 0 }])) as Record<OfficeActionId, OfficePoint>;
export const DEFAULT_OFFICE_ROUTE_STAGE_OFFSETS = Object.fromEntries(
  OFFICE_FACILITY_ROUTES.map((route) => [
    route,
    Object.fromEntries(OFFICE_ROUTE_STAGE_IDS.map((stageId) => [stageId, { x: 0, y: 0 }])),
  ]),
) as Record<OfficeFacilityRoute, Record<OfficeRouteStageId, OfficePoint>>;
export const DEFAULT_OFFICE_ROUTE_STAGE_POINT_OFFSETS = Object.fromEntries(
  OFFICE_FACILITY_ROUTES.map((route) => [
    route,
    Object.fromEntries(OFFICE_MOVING_ROUTE_STAGE_IDS.map((stageId) => [
      stageId,
      Object.fromEntries(OFFICE_ROUTE_STAGE_POINT_IDS.map((pointId) => [pointId, { x: 0, y: 0 }])),
    ])),
  ]),
) as Record<OfficeFacilityRoute, Record<OfficeMovingRouteStageId, OfficeRouteStagePointOffsets>>;
export const DEFAULT_OFFICE_HANDOFF_STAGE_OFFSETS = Object.fromEntries(
  OFFICE_HANDOFF_STAGE_IDS.map((stageId) => [stageId, { x: 0, y: 0 }]),
) as Record<OfficeHandoffStageId, OfficePoint>;
export const DEFAULT_OFFICE_HANDOFF_STAGE_POINT_OFFSETS = Object.fromEntries(
  OFFICE_HANDOFF_MOVING_STAGE_IDS.map((stageId) => [
    stageId,
    Object.fromEntries(OFFICE_ROUTE_STAGE_POINT_IDS.map((pointId) => [pointId, { x: 0, y: 0 }])),
  ]),
) as Record<OfficeHandoffMovingStageId, OfficeRouteStagePointOffsets>;
export const DEFAULT_OFFICE_HANDOFF_STAGE_PATH_POINT_OFFSETS = Object.fromEntries(
  OFFICE_HANDOFF_MOVING_STAGE_IDS.map((stageId) => [
    stageId,
    Object.fromEntries(OFFICE_ROUTE_STAGE_POINT_IDS.map((pointId) => [pointId, { x: 0, y: 0 }])),
  ]),
) as Record<OfficeHandoffMovingStageId, OfficeRouteStagePointOffsets>;
export const DEFAULT_OFFICE_TRANSITION_DIRECTIONS: Record<OfficeTransitionId, OfficeTransitionDirection> = {
  "standby-working": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "working-standby": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "standby-peek": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "peek-standby": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "standby-coffee": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "coffee-standby": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "walk-coffee": { fromFlipX: true, toFlipX: false, fromReverse: false, toReverse: false },
  "coffee-return-walk": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "standby-off-chair": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "off-chair-leaving": { fromFlipX: false, toFlipX: true, fromReverse: false, toReverse: false },
  "leaving-walk-out": { fromFlipX: true, toFlipX: true, fromReverse: false, toReverse: false },
  "walk-treadmill": { fromFlipX: true, toFlipX: false, fromReverse: false, toReverse: false },
  "treadmill-return-walk": { fromFlipX: false, toFlipX: false, fromReverse: true, toReverse: false },
  "walk-toilet": { fromFlipX: true, toFlipX: false, fromReverse: false, toReverse: false },
  "toilet-return-walk": { fromFlipX: false, toFlipX: false, fromReverse: true, toReverse: false },
  "walk-leaving-return": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "leaving-off-chair-reverse": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: true },
  "off-chair-standby": { fromFlipX: false, toFlipX: false, fromReverse: true, toReverse: false },
  "walk-standing-talk": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "standing-talk-return-walk": { fromFlipX: false, toFlipX: true, fromReverse: false, toReverse: false },
  "standby-seated-talk": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "seated-talk-salute": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
  "salute-standby": { fromFlipX: false, toFlipX: false, fromReverse: false, toReverse: false },
};

export const OFFICE_SCENE_CALIBRATION: OfficeSceneCalibrationV3 = {
  schemaVersion: 3,
  world: { width: 1200, height: 900 },
  actionScales: DEFAULT_ACTION_SCALES,
  actionOffsets: DEFAULT_ACTION_OFFSETS,
  transitionDirections: DEFAULT_OFFICE_TRANSITION_DIRECTIONS,
  routeStageOffsets: DEFAULT_OFFICE_ROUTE_STAGE_OFFSETS,
  routeStagePointOffsets: DEFAULT_OFFICE_ROUTE_STAGE_POINT_OFFSETS,
  handoff: {
    stageOffsets: DEFAULT_OFFICE_HANDOFF_STAGE_OFFSETS,
    stagePointOffsets: DEFAULT_OFFICE_HANDOFF_STAGE_POINT_OFFSETS,
    stagePathPointOffsets: DEFAULT_OFFICE_HANDOFF_STAGE_PATH_POINT_OFFSETS,
    targetRoutes: {},
  },
  layerOrder: ["shadow", "desk", "screen", "actor", "chair", "effect"],
  roster: {
    columnStep: 250,
    seats: [
      { slotId: "main", label: "Main Agent", roleId: "main-agent", workstationKind: "main", origin: { x: 490, y: 80 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "working" },
      { slotId: "planning", label: "Planning Agent", roleId: "planning-agent", workstationKind: "standard", origin: { x: 490, y: 365 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
      { slotId: "coder", label: "Coder Agent", roleId: "coder-agent", workstationKind: "standard", origin: { x: 490, y: 650 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
      { slotId: "auditor", label: "Auditor Agent", roleId: "auditor-agent", workstationKind: "standard", origin: { x: 740, y: 80 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
      { slotId: "rework", label: "Rework Coder", roleId: "rework-coder", workstationKind: "standard", origin: { x: 740, y: 365 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
      { slotId: "spec-proposer", label: "Spec Test Proposer", roleId: "spec-test-proposer", workstationKind: "standard", origin: { x: 740, y: 650 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
      { slotId: "spec-generator", label: "Spec Test Generator", roleId: "spec-test-generator", workstationKind: "standard", origin: { x: 990, y: 80 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
      { slotId: "standard-8", label: "Standard Workstation", roleId: "default", workstationKind: "standard", origin: { x: 990, y: 365 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
      { slotId: "evolution", label: "Harness Evolution", roleId: "harness-evolution-agent", workstationKind: "standard", origin: { x: 990, y: 650 }, actorOffset: { x: 0, y: 0 }, visible: true, actionId: "standby" },
    ],
  },
  workstations: {
    standard: {
      deskId: "standard-desk",
      chairId: "standard-chair",
      desk: { x: 0, y: 0, scaleX: 0.2213, scaleY: 0.2213, layer: "desk", visible: true },
      monitor: { x: 55, y: -29, scaleX: 0.1, scaleY: 0.1, layer: "desk", visible: true },
      chair: { x: 52.5, y: 47.425, scaleX: 0.135225, scaleY: 0.135924, layer: "chair", visible: true },
      actor: { x: 93, y: 67, layer: "actor", visible: true },
      screen: { x: 93.9, y: -0.5, width: 52.75, height: 26, layer: "screen", visible: true },
      shadow: { resourceId: "standard-workstation-shadow", x: -2.2857142857142856, y: 1.1428571428571428, scaleX: 1, scaleY: 1, alpha: 0.42, layer: "shadow", visible: true },
      label: { x: 0, y: -128, scale: 1, layer: "effect", visible: true },
      anchors: {
        seat: { x: 93, y: 67 },
        keyboard: { x: 91.5, y: 61.8 },
        monitor: { x: 93.9, y: -0.5 },
        aisleEntry: { x: 20, y: 99.5 },
      },
    },
    main: {
      deskId: "main-desk",
      chairId: "main-chair",
      desk: { x: 0, y: 0, scaleX: 0.25, scaleY: 0.25, layer: "desk", visible: true },
      monitor: { x: 55, y: -5, scaleX: 0.1, scaleY: 0.1, layer: "desk", visible: true },
      chair: { x: 54.25, y: 70, scaleX: 0.098958, scaleY: 0.093577, layer: "chair", visible: true },
      actor: { x: 97, y: 88, layer: "actor", visible: true },
      screen: { x: 93.9, y: 23.5, width: 52.75, height: 26, layer: "screen", visible: true },
      shadow: { resourceId: "main-workstation-shadow", x: 0.29411764705882354, y: 74.70588235294117, scaleX: 1, scaleY: 1, alpha: 0.42, layer: "shadow", visible: true },
      label: { x: 0, y: -128, scale: 1, layer: "effect", visible: true },
      anchors: {
        seat: { x: 97, y: 88 },
        keyboard: { x: 92.4, y: 52.6 },
        monitor: { x: 93.9, y: 23.5 },
        aisleEntry: { x: 17.9, y: 118.9 },
      },
    },
  },
  facilities: {
    coffee: {
      propId: "water-coffee", origin: { x: 28, y: 64 }, scale: 0.18, layer: "desk", visible: true,
      shadow: { resourceId: "coffee-facility-shadow", x: 20, y: 60.816511280599585, scaleX: 1, scaleY: 1, alpha: 0.42, layer: "shadow", visible: true },
      anchors: { aisleEntry: { x: 300, y: 225 }, contact: { x: 238, y: 190 } },
    },
    coffeeCup: {
      propId: "coffee-cup", origin: { x: 172, y: 117 }, scale: 0.45, layer: "effect", visible: true,
      anchors: { aisleEntry: { x: 300, y: 225 }, contact: { x: 238, y: 190 } },
    },
    treadmill: {
      propId: "treadmill", origin: { x: 32, y: 365 }, scale: 0.5535, layer: "desk", visible: true,
      shadow: { resourceId: "treadmill-facility-shadow", x: -15, y: 150, scaleX: 1, scaleY: 1, alpha: 0.42, layer: "shadow", visible: true },
      anchors: { aisleEntry: { x: 444.2, y: 379.4 }, contact: { x: 345.2, y: 379.4 } },
    },
    toilet: {
      propId: "toilet-back", origin: { x: 70, y: 655 }, scale: 0.14175, layer: "desk", visible: true,
      anchors: { aisleEntry: { x: 300, y: 770 }, contact: { x: 101.05, y: 628.9 } },
    },
    toiletPaper: {
      propId: "toilet-paper-holder", origin: { x: 70, y: 655 }, scale: 0.14175, layer: "desk", visible: true,
      anchors: { aisleEntry: { x: 300, y: 770 }, contact: { x: 101.05, y: 628.9 } },
    },
    toiletTailOccluder: {
      propId: "toilet-tail-occluder", origin: { x: 70, y: 655 }, scale: 0.14175, layer: "chair", visible: true,
      anchors: { aisleEntry: { x: 300, y: 770 }, contact: { x: 101.05, y: 628.9 } },
    },
  },
};

export function officeActorScaleForAction(actionId: string, calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION): number {
  return isOfficeActionId(actionId) ? calibration.actionScales[actionId] : calibration.actionScales.standby;
}

export function officeActorOffsetForAction(actionId: string, calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION): OfficePoint {
  return isOfficeActionId(actionId) ? calibration.actionOffsets[actionId] : calibration.actionOffsets.standby;
}

export function officeSeatActorAnchor(
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  const seat = calibration.roster.seats[seatIndex] ?? calibration.roster.seats[0]!;
  const workstation = calibration.workstations[seat.workstationKind];
  const actorOffset = seat.actorOffset ?? { x: 0, y: 0 };
  return {
    x: seat.origin.x + workstation.actor.x + actorOffset.x,
    y: seat.origin.y + workstation.actor.y + actorOffset.y,
  };
}

export function officeActionWorldAnchor(
  actionId: OfficeActionId,
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  if (actionId === "treadmill") return calibration.facilities.treadmill.anchors.contact;
  if (actionId === "toilet") return calibration.facilities.toilet.anchors.contact;
  const seat = calibration.roster.seats[seatIndex] ?? calibration.roster.seats[0]!;
  const workstation = calibration.workstations[seat.workstationKind];
  if (["working", "standby", "coffee-drink", "peek", "off-chair", "seated-talk", "salute"].includes(actionId)) {
    return officeSeatActorAnchor(seatIndex, calibration);
  }
  return {
    x: seat.origin.x + workstation.anchors.aisleEntry.x,
    y: seat.origin.y + workstation.anchors.aisleEntry.y,
  };
}

export function officeFacilityRoutePoints(
  route: OfficeFacilityRoute,
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeFacilityRoutePoints {
  const seat = calibration.roster.seats[seatIndex] ?? calibration.roster.seats[0]!;
  const workstation = calibration.workstations[seat.workstationKind];
  const facility = calibration.facilities[route];
  const offsets = officeFacilityRouteTargetCalibration(route, seatIndex, calibration).routePointOffsets ?? ZERO_FACILITY_ROUTE_POINT_OFFSETS;
  return {
    start: {
      x: seat.origin.x + workstation.anchors.aisleEntry.x + offsets.start.x,
      y: seat.origin.y + workstation.anchors.aisleEntry.y + offsets.start.y,
    },
    waypoint: addPoint(facility.anchors.aisleEntry, offsets.waypoint),
    contact: addPoint(facility.anchors.contact, offsets.contact),
  };
}

const ZERO_FACILITY_ROUTE_POINT_OFFSETS: OfficeFacilityRoutePoints = {
  start: { x: 0, y: 0 },
  waypoint: { x: 0, y: 0 },
  contact: { x: 0, y: 0 },
};

export function officeFacilityRouteTargetKey(
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): string {
  return calibration.roster.seats[seatIndex]?.slotId ?? `seat-${seatIndex}`;
}

export function officeFacilityRouteTargetCalibration(
  route: OfficeFacilityRoute,
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeFacilityTargetRouteCalibration {
  return calibration.facilityRouteTargets?.[officeFacilityRouteTargetKey(seatIndex, calibration)]?.[route] ?? {};
}

export function officeFacilityStageOffset(
  route: OfficeFacilityRoute,
  stageId: OfficeRouteStageId,
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  return officeFacilityRouteTargetCalibration(route, seatIndex, calibration).stageOffsets?.[stageId]
    ?? calibration.routeStageOffsets[route][stageId];
}

export function officeFacilityStagePointOffsets(
  route: OfficeFacilityRoute,
  stageId: OfficeMovingRouteStageId,
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeRouteStagePointOffsets {
  return officeFacilityRouteTargetCalibration(route, seatIndex, calibration).stagePointOffsets?.[stageId]
    ?? calibration.routeStagePointOffsets[route][stageId];
}

export function officeFacilityStageFlipX(
  route: OfficeFacilityRoute,
  stageId: OfficeRouteStageId,
  seatIndex: number,
  fallback: boolean,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): boolean {
  return officeFacilityRouteTargetCalibration(route, seatIndex, calibration).stageFlipX?.[stageId] ?? fallback;
}

export function officeHandoffRoutePoints(
  sourceSeatIndex: number,
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeHandoffRoutePoints {
  const sourceSeat = calibration.roster.seats[sourceSeatIndex] ?? calibration.roster.seats[0]!;
  const targetSeat = calibration.roster.seats[targetSeatIndex] ?? calibration.roster.seats[1] ?? calibration.roster.seats[0]!;
  const sourceWorkstation = calibration.workstations[sourceSeat.workstationKind];
  const targetWorkstation = calibration.workstations[targetSeat.workstationKind];
  const sourceSeatPoint = officeSeatActorAnchor(sourceSeatIndex, calibration);
  const sourceAisleBase = {
    x: sourceSeat.origin.x + sourceWorkstation.anchors.aisleEntry.x,
    y: sourceSeat.origin.y + sourceWorkstation.anchors.aisleEntry.y,
  };
  const targetAisle = {
    x: targetSeat.origin.x + targetWorkstation.anchors.aisleEntry.x,
    y: targetSeat.origin.y + targetWorkstation.anchors.aisleEntry.y,
  };
  const sourceExitOffset = calibration.handoff.stagePointOffsets["source-leaving-out"].end;
  const sourceCorridorOffset = calibration.handoff.stagePointOffsets["walk-source-corridor"].end;
  const targetRoute = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration);
  const targetCorridorOffset = targetRoute.targetCorridorOffset;
  const sourceAisle = addPoint(sourceAisleBase, sourceExitOffset);
  const corridorX = Math.min(sourceAisleBase.x, targetAisle.x) - 90;
  return {
    sourceSeat: sourceSeatPoint,
    sourceAisle,
    sourceCorridor: addPoint({ x: corridorX, y: sourceAisle.y }, sourceCorridorOffset),
    targetCorridor: addPoint({ x: corridorX, y: targetAisle.y }, targetCorridorOffset),
    targetAisle,
    targetSeat: officeSeatActorAnchor(targetSeatIndex, calibration),
  };
}

export function officeHandoffTargetRouteKey(
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): string {
  return calibration.roster.seats[targetSeatIndex]?.slotId ?? `seat-${targetSeatIndex}`;
}

export function officeHandoffTargetRouteCalibration(
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeHandoffTargetRouteCalibration {
  const saved = calibration.handoff.targetRoutes?.[officeHandoffTargetRouteKey(targetSeatIndex, calibration)];
  return saved ?? {
    targetCorridorOffset: calibration.handoff.stagePointOffsets["walk-target-row"].end,
    interactionOffset: calibration.handoff.stageOffsets["source-standing-talk"],
    standingTalkOffset: calibration.handoff.stageOffsets["source-standing-talk"],
    seatedTalkOffset: calibration.handoff.stageOffsets["target-seated-talk"],
    saluteOffset: calibration.handoff.stageOffsets["target-salute"],
    stageOffsets: Object.fromEntries(OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS.map((stageId) => [
      stageId,
      structuredClone(calibration.handoff.stageOffsets[stageId]),
    ])),
  };
}

export function officeHandoffStageOffset(
  stageId: OfficeHandoffStageId,
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  if (OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS.includes(stageId as OfficeHandoffTargetScopedMovingStageId)) {
    const targetRoute = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration);
    const targetOffset = targetRoute.stageOffsets?.[stageId as OfficeHandoffTargetScopedMovingStageId];
    if (targetOffset) return targetOffset;
  }
  return calibration.handoff.stageOffsets[stageId];
}

export function officeHandoffWalkVerticalFlipX(
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): boolean {
  return officeHandoffTargetRouteCalibration(targetSeatIndex, calibration).walkVerticalFlipX ?? false;
}

export function officeHandoffWalkVerticalReturnFlipX(
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): boolean {
  return !officeHandoffWalkVerticalFlipX(targetSeatIndex, calibration);
}

export function officeHandoffStagePointOffsets(
  stageId: OfficeHandoffMovingStageId,
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeRouteStagePointOffsets {
  if (OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS.includes(stageId as OfficeHandoffTargetScopedMovingStageId)) {
    const targetRoute = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration);
    const targetOffsets = targetRoute.stagePointOffsets?.[stageId as OfficeHandoffTargetScopedMovingStageId];
    if (targetOffsets) return targetOffsets;
  }
  return calibration.handoff.stagePointOffsets[stageId];
}

export function officeHandoffStagePathPointOffsets(
  stageId: OfficeHandoffMovingStageId,
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeRouteStagePointOffsets {
  if (OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS.includes(stageId as OfficeHandoffTargetScopedMovingStageId)) {
    const targetRoute = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration);
    const targetOffsets = targetRoute.stagePathPointOffsets?.[stageId as OfficeHandoffTargetScopedMovingStageId];
    if (targetOffsets) return targetOffsets;
  }
  return calibration.handoff.stagePathPointOffsets[stageId];
}

function addPoint(point: OfficePoint, offset: OfficePoint): OfficePoint {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

export function officeHandoffInteractionWorldPoint(
  sourceSeatIndex: number,
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  const points = officeHandoffRoutePoints(sourceSeatIndex, targetSeatIndex, calibration);
  const targetRoute = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration);
  const stageOffset = targetRoute.standingTalkOffset ?? targetRoute.interactionOffset;
  const actionOffset = calibration.actionOffsets["standing-talk"];
  return {
    x: points.targetAisle.x + stageOffset.x + actionOffset.x,
    y: points.targetAisle.y + stageOffset.y + actionOffset.y,
  };
}

export function officeHandoffLinkedWalkBasePoint(
  stageId: "walk-target-approach" | "walk-target-depart",
  point: "end" | "start",
  sourceSeatIndex: number,
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  const points = officeHandoffRoutePoints(sourceSeatIndex, targetSeatIndex, calibration);
  const legacyRouteOffset = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration).interactionOffset;
  const actionOffset = calibration.actionOffsets["walk-horizontal"];
  return {
    x: points.targetAisle.x + legacyRouteOffset.x + calibration.actionOffsets["standing-talk"].x - actionOffset.x,
    y: points.targetAisle.y + legacyRouteOffset.y + calibration.actionOffsets["standing-talk"].y - actionOffset.y,
  };
}

export function officeHandoffSeatedTalkWorldPoint(
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  const targetRoute = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration);
  const offset = targetRoute.seatedTalkOffset ?? calibration.handoff.stageOffsets["target-seated-talk"];
  const seat = officeSeatActorAnchor(targetSeatIndex, calibration);
  const actionOffset = calibration.actionOffsets["seated-talk"];
  return { x: seat.x + offset.x + actionOffset.x, y: seat.y + offset.y + actionOffset.y };
}

export function officeHandoffSaluteWorldPoint(
  targetSeatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficePoint {
  const targetRoute = officeHandoffTargetRouteCalibration(targetSeatIndex, calibration);
  const offset = targetRoute.saluteOffset ?? calibration.handoff.stageOffsets["target-salute"];
  const seat = officeSeatActorAnchor(targetSeatIndex, calibration);
  const actionOffset = calibration.actionOffsets.salute;
  return { x: seat.x + offset.x + actionOffset.x, y: seat.y + offset.y + actionOffset.y };
}

export function officeFacilityWalkGuidePoints(
  route: OfficeFacilityRoute,
  seatIndex: number,
  calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION,
): OfficeFacilityRoutePoints {
  const points = officeFacilityRoutePoints(route, seatIndex, calibration);
  const actionOffset = calibration.actionOffsets["walk-horizontal"];
  const stageOffset = officeFacilityStageOffset(route, "walk-out", seatIndex, calibration);
  const pointOffsets = officeFacilityStagePointOffsets(route, "walk-out", seatIndex, calibration);
  const apply = (point: OfficePoint, pointOffset: OfficePoint): OfficePoint => ({
    x: point.x + actionOffset.x + stageOffset.x + pointOffset.x,
    y: point.y + actionOffset.y + stageOffset.y + pointOffset.y,
  });
  return {
    start: apply(points.start, pointOffsets.start),
    waypoint: apply(points.waypoint, pointOffsets.waypoint),
    contact: apply(points.contact, pointOffsets.end),
  };
}

export function officeTransitionDirection(transitionId: OfficeTransitionId, calibration: OfficeSceneGeometryCalibration = OFFICE_SCENE_CALIBRATION): OfficeTransitionDirection {
  return calibration.transitionDirections[transitionId];
}

export function validateOfficeSceneCalibration(value: unknown): asserts value is OfficeSceneCalibrationV3 {
  if (!isRecord(value)) throw new Error("Office scene calibration must be an object.");
  if (value.schemaVersion !== 3) throw new Error("Office scene calibration must use schema version 3.");
  if (!isRecord(value.world) || ![value.world.width, value.world.height].every(isPositiveFinite)) throw new Error("Office world size is invalid.");
  if (!isRecord(value.actionScales)) throw new Error("Office action scales are missing.");
  if (!isRecord(value.actionOffsets)) throw new Error("Office action offsets are missing.");
  if (!isRecord(value.transitionDirections)) throw new Error("Office transition directions are missing.");
  if (!isRecord(value.routeStageOffsets)) throw new Error("Office route stage offsets are missing.");
  if (!isRecord(value.routeStagePointOffsets)) throw new Error("Office route stage point offsets are missing.");
  if (!isRecord(value.handoff) || !isRecord(value.handoff.stageOffsets) || !isRecord(value.handoff.stagePointOffsets) || !isRecord(value.handoff.stagePathPointOffsets)) {
    throw new Error("Office handoff calibration is missing.");
  }
  for (const actionId of OFFICE_ACTION_IDS) {
    const scale = value.actionScales[actionId];
    if (typeof scale !== "number" || scale < OFFICE_ACTION_SCALE_MIN || scale > OFFICE_ACTION_SCALE_MAX) {
      throw new Error(`Office action scale ${actionId} must be between ${OFFICE_ACTION_SCALE_MIN} and ${OFFICE_ACTION_SCALE_MAX}.`);
    }
    validatePoint(value.actionOffsets[actionId], `Office action offset ${actionId}`);
  }
  for (const transitionId of OFFICE_TRANSITION_IDS) validateTransitionDirection(value.transitionDirections[transitionId], transitionId);
  for (const route of OFFICE_FACILITY_ROUTES) {
    const offsets = value.routeStageOffsets[route];
    if (!isRecord(offsets)) throw new Error(`Office route stage offsets are missing for ${route}.`);
    for (const stageId of OFFICE_ROUTE_STAGE_IDS) validatePoint(offsets[stageId], `Office route stage offset ${route}/${stageId}`);
    const pointOffsets = value.routeStagePointOffsets[route];
    if (!isRecord(pointOffsets)) throw new Error(`Office route stage point offsets are missing for ${route}.`);
    for (const stageId of OFFICE_MOVING_ROUTE_STAGE_IDS) {
      const stagePoints = pointOffsets[stageId];
      if (!isRecord(stagePoints)) throw new Error(`Office route stage point offsets are missing for ${route}/${stageId}.`);
      for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
        validatePoint(stagePoints[pointId], `Office route stage point offset ${route}/${stageId}/${pointId}`);
      }
    }
  }
  if (value.facilityRouteTargets != null) {
    if (!isRecord(value.facilityRouteTargets)) throw new Error("Office facility target routes are invalid.");
    for (const [seatKey, routes] of Object.entries(value.facilityRouteTargets)) {
      if (!isRecord(routes)) throw new Error(`Office facility target routes are invalid for ${seatKey}.`);
      for (const route of OFFICE_FACILITY_ROUTES) {
        const target = routes[route];
        if (target == null) continue;
        if (!isRecord(target)) throw new Error(`Office facility target route is invalid for ${seatKey}/${route}.`);
        if (target.routePointOffsets != null) {
          if (!isRecord(target.routePointOffsets)) throw new Error(`Office facility route points are invalid for ${seatKey}/${route}.`);
          for (const pointId of ["start", "waypoint", "contact"] as const) {
            validatePoint(target.routePointOffsets[pointId], `Office facility route point ${seatKey}/${route}/${pointId}`);
          }
        }
        if (target.stageOffsets != null) {
          if (!isRecord(target.stageOffsets)) throw new Error(`Office facility stage offsets are invalid for ${seatKey}/${route}.`);
          for (const [stageId, offset] of Object.entries(target.stageOffsets)) {
            if (!OFFICE_ROUTE_STAGE_IDS.includes(stageId as OfficeRouteStageId)) throw new Error(`Unknown Office facility stage ${stageId}.`);
            validatePoint(offset, `Office facility stage offset ${seatKey}/${route}/${stageId}`);
          }
        }
        if (target.stagePointOffsets != null) {
          if (!isRecord(target.stagePointOffsets)) throw new Error(`Office facility stage points are invalid for ${seatKey}/${route}.`);
          for (const [stageId, points] of Object.entries(target.stagePointOffsets)) {
            if (!OFFICE_MOVING_ROUTE_STAGE_IDS.includes(stageId as OfficeMovingRouteStageId) || !isRecord(points)) {
              throw new Error(`Office facility stage points are invalid for ${seatKey}/${route}/${stageId}.`);
            }
            for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
              validatePoint(points[pointId], `Office facility stage point ${seatKey}/${route}/${stageId}/${pointId}`);
            }
          }
        }
        if (target.stageFlipX != null) {
          if (!isRecord(target.stageFlipX)) throw new Error(`Office facility stage mirrors are invalid for ${seatKey}/${route}.`);
          for (const [stageId, flipX] of Object.entries(target.stageFlipX)) {
            if (!OFFICE_ROUTE_STAGE_IDS.includes(stageId as OfficeRouteStageId) || typeof flipX !== "boolean") {
              throw new Error(`Office facility stage mirror is invalid for ${seatKey}/${route}/${stageId}.`);
            }
          }
        }
      }
    }
  }
  for (const stageId of OFFICE_HANDOFF_STAGE_IDS) {
    validatePoint(value.handoff.stageOffsets[stageId], `Office handoff stage offset ${stageId}`);
  }
  for (const stageId of OFFICE_HANDOFF_MOVING_STAGE_IDS) {
    const stagePoints = value.handoff.stagePointOffsets[stageId];
    if (!isRecord(stagePoints)) throw new Error(`Office handoff stage point offsets are missing for ${stageId}.`);
    const stagePathPoints = value.handoff.stagePathPointOffsets[stageId];
    if (!isRecord(stagePathPoints)) throw new Error(`Office handoff stage path point offsets are missing for ${stageId}.`);
    for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
      validatePoint(stagePoints[pointId], `Office handoff stage point offset ${stageId}/${pointId}`);
      validatePoint(stagePathPoints[pointId], `Office handoff stage path point offset ${stageId}/${pointId}`);
    }
  }
  const targetRoutes = isRecord(value.handoff.targetRoutes) ? value.handoff.targetRoutes : {};
  for (const [targetKey, targetRoute] of Object.entries(targetRoutes)) {
    if (!isRecord(targetRoute)) throw new Error(`Office handoff target route is invalid for ${targetKey}.`);
    validatePoint(targetRoute.targetCorridorOffset, `Office handoff target corridor offset ${targetKey}`);
    validatePoint(targetRoute.interactionOffset, `Office handoff interaction offset ${targetKey}`);
    if (targetRoute.standingTalkOffset != null) validatePoint(targetRoute.standingTalkOffset, `Office handoff standing-talk offset ${targetKey}`);
    if (targetRoute.seatedTalkOffset != null) validatePoint(targetRoute.seatedTalkOffset, `Office handoff seated-talk offset ${targetKey}`);
    if (targetRoute.saluteOffset != null) validatePoint(targetRoute.saluteOffset, `Office handoff salute offset ${targetKey}`);
    if (targetRoute.walkVerticalFlipX != null && typeof targetRoute.walkVerticalFlipX !== "boolean") {
      throw new Error(`Office handoff walk-vertical mirror is invalid for ${targetKey}.`);
    }
    if (targetRoute.stageOffsets != null) {
      if (!isRecord(targetRoute.stageOffsets)) throw new Error(`Office handoff target stage offsets are invalid for ${targetKey}.`);
      for (const stageId of OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS) {
        const stageOffset = targetRoute.stageOffsets[stageId];
        if (stageOffset != null) validatePoint(stageOffset, `Office handoff target stage offset ${targetKey}/${stageId}`);
      }
    }
    if (targetRoute.stagePointOffsets != null) {
      if (!isRecord(targetRoute.stagePointOffsets)) throw new Error(`Office handoff target stage points are invalid for ${targetKey}.`);
      for (const stageId of OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS) {
        const stagePoints = targetRoute.stagePointOffsets[stageId];
        if (stagePoints == null) continue;
        if (!isRecord(stagePoints)) throw new Error(`Office handoff target stage points are invalid for ${targetKey}/${stageId}.`);
        for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
          validatePoint(stagePoints[pointId], `Office handoff target stage point ${targetKey}/${stageId}/${pointId}`);
        }
      }
    }
    if (targetRoute.stagePathPointOffsets != null) {
      if (!isRecord(targetRoute.stagePathPointOffsets)) throw new Error(`Office handoff target stage path points are invalid for ${targetKey}.`);
      for (const stageId of OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS) {
        const stagePoints = targetRoute.stagePathPointOffsets[stageId];
        if (stagePoints == null) continue;
        if (!isRecord(stagePoints)) throw new Error(`Office handoff target stage path points are invalid for ${targetKey}/${stageId}.`);
        for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
          validatePoint(stagePoints[pointId], `Office handoff target stage path point ${targetKey}/${stageId}/${pointId}`);
        }
      }
    }
  }
  if (!Array.isArray(value.layerOrder) || value.layerOrder.length !== OFFICE_LAYER_IDS.length) throw new Error("Office layer order is incomplete.");
  if (!value.layerOrder.every((layer) => OFFICE_LAYER_IDS.includes(layer as OfficeLayerId))) throw new Error("Office layer order contains an unknown layer.");
  if (new Set(value.layerOrder).size !== value.layerOrder.length) throw new Error("Office layer order must not contain duplicates.");
  if (!isRecord(value.roster) || !Array.isArray(value.roster.seats) || value.roster.seats.length !== 9) throw new Error("Office preview roster must contain nine seats.");
  for (const seat of value.roster.seats) validatePreviewSeat(seat);
  if (!isRecord(value.workstations)) throw new Error("Office workstation calibration is missing.");
  for (const workstation of Object.values(value.workstations)) validateWorkstation(workstation);
  if (!isRecord(value.facilities)) throw new Error("Office facility calibration is missing.");
  for (const facility of Object.values(value.facilities)) validateFacility(facility);
}

export function serializeOfficeSceneCalibration(value: OfficeSceneCalibrationV3): string {
  validateOfficeSceneCalibration(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parseOfficeSceneCalibration(source: string): OfficeSceneCalibrationV3 {
  const value: unknown = JSON.parse(source);
  if (isRecord(value) && value.schemaVersion === 3) {
    const actionScales = isRecord(value.actionScales) ? value.actionScales : {};
    const actionOffsets = isRecord(value.actionOffsets) ? value.actionOffsets : {};
    value.actionScales = actionScales;
    value.actionOffsets = actionOffsets;
    for (const actionId of OFFICE_ACTION_IDS) {
      if (typeof actionScales[actionId] !== "number") actionScales[actionId] = DEFAULT_ACTION_SCALES[actionId];
      if (!isRecord(actionOffsets[actionId])) actionOffsets[actionId] = structuredClone(DEFAULT_ACTION_OFFSETS[actionId]);
    }
    if (isRecord(value.roster) && Array.isArray(value.roster.seats)) {
      for (const seat of value.roster.seats) {
        if (isRecord(seat) && !isRecord(seat.actorOffset)) seat.actorOffset = { x: 0, y: 0 };
      }
    }
    if (!isRecord(value.transitionDirections)) value.transitionDirections = structuredClone(DEFAULT_OFFICE_TRANSITION_DIRECTIONS);
    else for (const transitionId of OFFICE_TRANSITION_IDS) {
      if (!isRecord(value.transitionDirections[transitionId])) {
        value.transitionDirections[transitionId] = structuredClone(DEFAULT_OFFICE_TRANSITION_DIRECTIONS[transitionId]);
      }
    }
    const routeStageOffsets = isRecord(value.routeStageOffsets) ? value.routeStageOffsets : {};
    const routeStagePointOffsets = isRecord(value.routeStagePointOffsets) ? value.routeStagePointOffsets : {};
    value.routeStageOffsets = routeStageOffsets;
    value.routeStagePointOffsets = routeStagePointOffsets;
    for (const route of OFFICE_FACILITY_ROUTES) {
      const stageOffsets = isRecord(routeStageOffsets[route]) ? routeStageOffsets[route] : {};
      const stagePointOffsets = isRecord(routeStagePointOffsets[route]) ? routeStagePointOffsets[route] : {};
      routeStageOffsets[route] = stageOffsets;
      routeStagePointOffsets[route] = stagePointOffsets;
      for (const stageId of OFFICE_ROUTE_STAGE_IDS) {
        if (!isRecord(stageOffsets[stageId])) {
          stageOffsets[stageId] = structuredClone(DEFAULT_OFFICE_ROUTE_STAGE_OFFSETS[route][stageId]);
        }
      }
      for (const stageId of OFFICE_MOVING_ROUTE_STAGE_IDS) {
        const stagePoints = isRecord(stagePointOffsets[stageId]) ? stagePointOffsets[stageId] : {};
        stagePointOffsets[stageId] = stagePoints;
        for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
          if (!isRecord(stagePoints[pointId])) {
            stagePoints[pointId] = structuredClone(DEFAULT_OFFICE_ROUTE_STAGE_POINT_OFFSETS[route][stageId][pointId]);
          }
        }
      }
    }
    const facilities = isRecord(value.facilities) ? value.facilities : {};
    value.facilities = facilities;
    if (!isRecord(facilities.coffeeCup)) facilities.coffeeCup = structuredClone(OFFICE_SCENE_CALIBRATION.facilities.coffeeCup);
    const handoff = isRecord(value.handoff) ? value.handoff : {};
    const handoffStageOffsets = isRecord(handoff.stageOffsets) ? handoff.stageOffsets : {};
    const handoffStagePointOffsets = isRecord(handoff.stagePointOffsets) ? handoff.stagePointOffsets : {};
    const handoffStagePathPointOffsets = isRecord(handoff.stagePathPointOffsets) ? handoff.stagePathPointOffsets : {};
    const handoffTargetRoutes = isRecord(handoff.targetRoutes) ? handoff.targetRoutes : {};
    value.handoff = handoff;
    handoff.stageOffsets = handoffStageOffsets;
    handoff.stagePointOffsets = handoffStagePointOffsets;
    handoff.stagePathPointOffsets = handoffStagePathPointOffsets;
    handoff.targetRoutes = handoffTargetRoutes;
    for (const stageId of OFFICE_HANDOFF_STAGE_IDS) {
      if (!isRecord(handoffStageOffsets[stageId])) {
        handoffStageOffsets[stageId] = structuredClone(DEFAULT_OFFICE_HANDOFF_STAGE_OFFSETS[stageId]);
      }
    }
    for (const stageId of OFFICE_HANDOFF_MOVING_STAGE_IDS) {
      const stagePointOffsets = isRecord(handoffStagePointOffsets[stageId]) ? handoffStagePointOffsets[stageId] : {};
      const stagePathPointOffsets = isRecord(handoffStagePathPointOffsets[stageId]) ? handoffStagePathPointOffsets[stageId] : {};
      handoffStagePointOffsets[stageId] = stagePointOffsets;
      handoffStagePathPointOffsets[stageId] = stagePathPointOffsets;
      for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
        if (!isRecord(stagePointOffsets[pointId])) {
          stagePointOffsets[pointId] = structuredClone(DEFAULT_OFFICE_HANDOFF_STAGE_POINT_OFFSETS[stageId][pointId]);
        }
        if (!isRecord(stagePathPointOffsets[pointId])) {
          stagePathPointOffsets[pointId] = legacyHandoffPathPointOffset(stageId, pointId, handoffStageOffsets, stagePointOffsets);
        }
      }
    }
    for (const targetRoute of Object.values(handoffTargetRoutes)) {
      if (!isRecord(targetRoute)) continue;
      if (!isRecord(targetRoute.standingTalkOffset)) {
        targetRoute.standingTalkOffset = structuredClone(
          isRecord(targetRoute.interactionOffset)
            ? targetRoute.interactionOffset
            : handoffStageOffsets["source-standing-talk"],
        );
      }
      if (!isRecord(targetRoute.seatedTalkOffset)) {
        targetRoute.seatedTalkOffset = structuredClone(handoffStageOffsets["target-seated-talk"]);
      }
      if (!isRecord(targetRoute.saluteOffset)) {
        targetRoute.saluteOffset = structuredClone(handoffStageOffsets["target-salute"]);
      }
      const targetStagePointOffsets = isRecord(targetRoute.stagePointOffsets) ? targetRoute.stagePointOffsets : null;
      let targetStagePathPointOffsets = isRecord(targetRoute.stagePathPointOffsets) ? targetRoute.stagePathPointOffsets : null;
      for (const stageId of OFFICE_HANDOFF_TARGET_SCOPED_MOVING_STAGE_IDS) {
        const savedLegacyPoints = targetStagePointOffsets?.[stageId];
        const fallbackLegacyPoints = handoffStagePointOffsets[stageId];
        const legacyPoints = isRecord(savedLegacyPoints)
          ? savedLegacyPoints
          : isRecord(fallbackLegacyPoints) ? fallbackLegacyPoints : {};
        const sharedPathPoints = isRecord(handoffStagePathPointOffsets[stageId])
          ? handoffStagePathPointOffsets[stageId]
          : {};
        const savedPathPoints = targetStagePathPointOffsets?.[stageId];
        if (!isRecord(savedLegacyPoints) && !isRecord(savedPathPoints)) continue;
        const pathPoints = isRecord(savedPathPoints)
          && !(stageId === "walk-source-corridor" && isLegacyDerivedHandoffPath(savedPathPoints, stageId, handoffStageOffsets, legacyPoints))
          ? savedPathPoints
          : {};
        if (targetStagePathPointOffsets === null) {
          targetStagePathPointOffsets = {};
          targetRoute.stagePathPointOffsets = targetStagePathPointOffsets;
        }
        targetStagePathPointOffsets[stageId] = pathPoints;
        for (const pointId of OFFICE_ROUTE_STAGE_POINT_IDS) {
          if (!isRecord(pathPoints[pointId])) {
            pathPoints[pointId] = isRecord(savedLegacyPoints)
              ? legacyHandoffPathPointOffset(stageId, pointId, handoffStageOffsets, legacyPoints)
              : stageId === "walk-source-corridor"
                ? structuredClone(sharedPathPoints[pointId])
                : legacyHandoffPathPointOffset(stageId, pointId, handoffStageOffsets, legacyPoints);
          }
        }
      }
    }
  }
  validateOfficeSceneCalibration(value);
  return value;
}

function legacyHandoffPathPointOffset(
  stageId: OfficeHandoffMovingStageId,
  pointId: OfficeRouteStagePointId,
  stageOffsets: Record<string, unknown>,
  legacyPoints: Record<string, unknown>,
): OfficePoint {
  if (isLegacyLinkedHandoffPoint(stageId, pointId)) {
    const stageOffset = stageOffsets[stageId] as OfficePoint;
    return { x: -stageOffset.x, y: -stageOffset.y };
  }
  return structuredClone(legacyPoints[pointId] as OfficePoint);
}

function isLegacyDerivedHandoffPath(
  value: Record<string, unknown>,
  stageId: OfficeHandoffMovingStageId,
  stageOffsets: Record<string, unknown>,
  legacyPoints: Record<string, unknown>,
): boolean {
  return OFFICE_ROUTE_STAGE_POINT_IDS.every((pointId) => {
    const candidate = value[pointId];
    if (!isRecord(candidate)) return false;
    const legacy = legacyHandoffPathPointOffset(stageId, pointId, stageOffsets, legacyPoints);
    return candidate.x === legacy.x && candidate.y === legacy.y;
  });
}

function isLegacyLinkedHandoffPoint(stageId: OfficeHandoffMovingStageId, pointId: OfficeRouteStagePointId): boolean {
  return (stageId === "source-leaving-out" && pointId === "end")
    || (stageId === "walk-source-corridor" && pointId === "end")
    || (stageId === "walk-target-row" && pointId === "end")
    || (stageId === "walk-target-approach" && pointId === "end")
    || (stageId === "walk-target-depart" && pointId === "start");
}

export function workstationComponentScaleFactor(
  workstation: WorkstationCalibration,
  baseline: WorkstationCalibration,
  component: ScalableWorkstationComponent,
): number {
  if (component === "screen") return workstation.screen.width / baseline.screen.width;
  return workstation[component].scaleX / baseline[component].scaleX;
}

export function resizeWorkstationComponent(
  workstation: WorkstationCalibration,
  baseline: WorkstationCalibration,
  component: ScalableWorkstationComponent,
  factor: number,
): WorkstationCalibration {
  if (!Number.isFinite(factor) || factor < OFFICE_COMPONENT_SCALE_MIN || factor > OFFICE_COMPONENT_SCALE_MAX) {
    throw new Error(`Office component scale factor must be between ${OFFICE_COMPONENT_SCALE_MIN} and ${OFFICE_COMPONENT_SCALE_MAX}.`);
  }
  const next = structuredClone(workstation);
  if (component === "screen") {
    next.screen.width = baseline.screen.width * factor;
    next.screen.height = baseline.screen.height * factor;
  } else {
    next[component].scaleX = baseline[component].scaleX * factor;
    next[component].scaleY = baseline[component].scaleY * factor;
  }
  return next;
}

export function isOfficeActionId(value: string): value is OfficeActionId {
  return OFFICE_ACTION_IDS.includes(value as OfficeActionId);
}

const OFFICE_LAYER_IDS: OfficeLayerId[] = ["shadow", "desk", "screen", "actor", "chair", "effect"];

function validatePreviewSeat(value: unknown): void {
  if (!isRecord(value) || typeof value.slotId !== "string" || typeof value.label !== "string" || typeof value.roleId !== "string") throw new Error("Office preview seat identity is invalid.");
  if (value.workstationKind !== "main" && value.workstationKind !== "standard") throw new Error("Office preview workstation kind is invalid.");
  validatePoint(value.origin, "Office preview seat origin");
  validatePoint(value.actorOffset, "Office preview seat actor offset");
  if (typeof value.visible !== "boolean" || typeof value.actionId !== "string" || !isOfficeActionId(value.actionId)) throw new Error("Office preview seat state is invalid.");
}

function validateWorkstation(value: unknown): void {
  if (!isRecord(value)) throw new Error("Office workstation calibration must be an object.");
  for (const component of [value.desk, value.monitor, value.chair]) validateTransform(component);
  for (const component of [value.actor, value.screen, value.shadow, value.label]) {
    if (!isRecord(component)) throw new Error("Office component calibration is missing.");
    validatePoint(component, "Office component position");
    if (typeof component.visible !== "boolean" || !OFFICE_LAYER_IDS.includes(component.layer as OfficeLayerId)) throw new Error("Office component state is invalid.");
  }
  if (!isRecord(value.screen) || ![value.screen.width, value.screen.height].every(isPositiveFinite)) throw new Error("Office component dimensions are invalid.");
  validateShadow(value.shadow);
  if (!isRecord(value.label) || !isPositiveFinite(value.label.scale)) throw new Error("Office label scale is invalid.");
}

function validateFacility(value: unknown): void {
  if (!isRecord(value)) throw new Error("Office facility calibration must be an object.");
  validatePoint(value.origin, "Office facility origin");
  if (!isPositiveFinite(value.scale) || typeof value.visible !== "boolean" || !OFFICE_LAYER_IDS.includes(value.layer as OfficeLayerId)) throw new Error("Office facility state is invalid.");
  if (value.shadow != null) validateShadow(value.shadow);
}

function validateShadow(value: unknown): void {
  validateTransform(value);
  if (!isRecord(value) || typeof value.resourceId !== "string" || value.layer !== "shadow" || !isPositiveFinite(value.alpha) || value.alpha > 1) {
    throw new Error("Office shadow calibration is invalid.");
  }
}

function validateTransform(value: unknown): void {
  if (!isRecord(value)) throw new Error("Office component transform is missing.");
  if (![value.x, value.y].every(isFiniteNumber) || ![value.scaleX, value.scaleY].every(isPositiveFinite)) throw new Error("Office component transform must be finite and positive.");
  if (typeof value.visible !== "boolean" || !OFFICE_LAYER_IDS.includes(value.layer as OfficeLayerId)) throw new Error("Office component state is invalid.");
}

function validatePoint(value: unknown, label: string): void {
  if (!isRecord(value) || ![value.x, value.y].every(isFiniteNumber)) throw new Error(`${label} must be finite.`);
}

function validateTransitionDirection(value: unknown, transitionId: string): void {
  if (!isRecord(value) || ![value.fromFlipX, value.toFlipX, value.fromReverse, value.toReverse].every((entry) => typeof entry === "boolean")) {
    throw new Error(`Office transition direction ${transitionId} is invalid.`);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

validateOfficeSceneCalibration(OFFICE_SCENE_CALIBRATION);
