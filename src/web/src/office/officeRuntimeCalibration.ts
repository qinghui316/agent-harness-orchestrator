import type {
  OfficeActionId,
  OfficeFacilityRoute,
  OfficeHandoffMovingStageId,
  OfficeHandoffStageId,
  OfficeHandoffTargetRouteCalibration,
  OfficeLayerId,
  OfficeMovingRouteStageId,
  OfficePoint,
  OfficeRouteStageId,
  OfficeRouteStagePointOffsets,
  OfficeTransitionDirection,
  OfficeTransitionId,
  WorkstationCalibration,
  FacilityCalibration,
  OfficeSceneGeometryCalibration,
  OfficeFacilityTargetRouteCalibration,
} from "./officeSceneCalibration.js";

export type OfficeRuntimeSeatCalibration = {
  slotId: string;
  label: string;
  roleId: string;
  workstationKind: "main" | "standard";
  origin: OfficePoint;
  actorOffset: OfficePoint;
  visible: boolean;
};

export type OfficeRuntimeCalibrationV1 = {
  schemaVersion: 1;
  editorSchemaVersion: 3;
  sourceSha256: string;
  normalizedHash: string;
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
  roster: { columnStep: number; seats: OfficeRuntimeSeatCalibration[] };
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

export type OfficeGeometryCalibration = OfficeSceneGeometryCalibration;

export type OfficeRuntimeVisualCommand =
  | { kind: "playAction"; participantId: string; actionId: OfficeActionId; loop?: boolean; reverse?: boolean; flipX?: boolean; phase?: number; durationMs?: number }
  | { kind: "followRoute"; participantId: string; routeId: string; points: OfficePoint[]; durationMs: number; flipX?: boolean }
  | { kind: "setScreen"; stationId: string; profile: "off" | "static" | "orchestration" | "entertainment-1" | "entertainment-2"; phase?: number }
  | { kind: "setEffect"; participantId: string; effect: "none" | "attention" | "blocked" | "failed" | "interrupted" | "coffee-cup"; durationMs?: number }
  | { kind: "showParticipant"; participantId: string }
  | { kind: "hideParticipant"; participantId: string }
  | { kind: "sequence"; commands: OfficeRuntimeVisualCommand[] }
  | { kind: "parallel"; commands: OfficeRuntimeVisualCommand[] };
