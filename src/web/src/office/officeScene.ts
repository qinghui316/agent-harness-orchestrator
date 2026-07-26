import type { OfficeAmbientPreference, OfficeExperienceSnapshot, OfficeParticipantState, OfficeScarfId, OfficeSemanticEvent, OfficeStation, OfficeWorkstationAnchors } from "./officeExperience.js";
import { OFFICE_RUNTIME_CALIBRATION } from "./officeRuntimeCalibration.generated.js";
import { officeActorScaleForAction, type OfficePoint } from "./officeSceneCalibration.js";

export type { OfficePoint } from "./officeSceneCalibration.js";
export type OfficeScarf = OfficeScarfId;
export type OfficeActorStatus = OfficeParticipantState;

export type OfficeSceneStation = OfficeStation;

export type OfficeActor = {
  actorId: string;
  seatId: string;
  agentSurfaceId: string;
  kind: "main-agent" | "agent";
  roleId: string;
  label: string;
  status: OfficeActorStatus;
  parentActorId: string | null;
  workstation: OfficePoint;
  anchors: OfficeWorkstationAnchors;
  scarf: OfficeScarf;
  createdAt: string;
  ambientPreferences: OfficeAmbientPreference[];
};

export type OfficeZone = {
  id: "water-coffee" | "fitness" | "toilet";
  propId: "water-coffee" | "treadmill" | "toilet-back";
  origin: OfficePoint;
  scale: number;
  anchors: { aisleEntry: OfficePoint; contact: OfficePoint };
};

export type OfficeSceneModel = {
  conversationId: string;
  graphScopeId: string;
  projectionHash: string;
  scopeStatus: "active" | "terminal";
  width: number;
  height: number;
  stations: OfficeSceneStation[];
  actors: OfficeActor[];
  zones: OfficeZone[];
  events: OfficeSemanticEvent[];
  diagnostics: string[];
};

export const OFFICE_ACTOR_SCALE = officeActorScaleForAction("working", OFFICE_RUNTIME_CALIBRATION);
export const OFFICE_WORLD_HEIGHT = OFFICE_RUNTIME_CALIBRATION.world.height;
export const OFFICE_WORKSTATION_GEOMETRY = OFFICE_RUNTIME_CALIBRATION.workstations;

export function createOfficeScene(snapshot: OfficeExperienceSnapshot, events: OfficeSemanticEvent[] = []): OfficeSceneModel {
  const stations = snapshot.stations;
  const stationById = new Map(stations.map((station) => [station.stationId, station] as const));
  const actors = snapshot.participants.map((participant) => {
    const station = stationById.get(participant.stationId);
    if (!station) throw new Error(`Office participant ${participant.participantId} has no station ${participant.stationId}.`);
    return {
      actorId: participant.participantId,
      seatId: station.stationId,
      agentSurfaceId: participant.navigationId,
      kind: participant.kind === "main" ? "main-agent" as const : "agent" as const,
      roleId: participant.roleId,
      label: participant.label,
      status: participant.state,
      parentActorId: participant.parentParticipantId,
      workstation: station.origin,
      anchors: station.anchors,
      scarf: participant.scarf,
      createdAt: participant.createdAt,
      ambientPreferences: participant.ambientPreferences.map((preference) => ({ ...preference })),
    };
  });
  return {
    conversationId: snapshot.contextId,
    graphScopeId: snapshot.contextId,
    projectionHash: snapshot.revision,
    scopeStatus: snapshot.lifecycle,
    width: OFFICE_RUNTIME_CALIBRATION.world.width,
    height: OFFICE_RUNTIME_CALIBRATION.world.height,
    stations,
    actors,
    zones: officeZones(),
    events,
    diagnostics: snapshot.diagnostics,
  };
}

function officeZones(): OfficeZone[] {
  const { coffee, treadmill, toilet } = OFFICE_RUNTIME_CALIBRATION.facilities;
  return [
    { id: "water-coffee", propId: "water-coffee", origin: coffee.origin, scale: coffee.scale, anchors: coffee.anchors },
    { id: "fitness", propId: "treadmill", origin: treadmill.origin, scale: treadmill.scale, anchors: treadmill.anchors },
    { id: "toilet", propId: "toilet-back", origin: toilet.origin, scale: toilet.scale, anchors: toilet.anchors },
  ];
}
