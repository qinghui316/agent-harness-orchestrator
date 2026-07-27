import type { OfficeAmbientPreference, OfficeExperienceSnapshot, OfficeParticipantState, OfficeScarfId, OfficeSemanticEvent, OfficeStation, OfficeWorkstationAnchors } from "./officeExperience.js";
import type { OfficeCalibrationDocument } from "./officeCalibrationDocument.js";
import type { OfficePoint } from "./officeVisualContract.js";

export type { OfficePoint } from "./officeVisualContract.js";
export type OfficeScarf = OfficeScarfId;
export type OfficeActorStatus = OfficeParticipantState;

export type OfficeSceneStation = OfficeStation;

type OfficeActorBase = {
  actorId: string;
  seatId: string;
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

export type OfficeParticipantActor = OfficeActorBase & {
  kind: "main-agent" | "agent";
  agentSurfaceId: string;
};

export type OfficeResidentActor = OfficeActorBase & {
  kind: "resident";
  residentId: string;
};

export type OfficeActor = OfficeParticipantActor | OfficeResidentActor;

export type OfficeZone = {
  id: "water-coffee" | "fitness" | "toilet";
  propId: "water-coffee" | "treadmill" | "toilet-back";
  origin: OfficePoint;
  scale: number;
  anchors: { aisleEntry: OfficePoint; contact: OfficePoint };
};

export type OfficeSceneModel = {
  experience: OfficeExperienceSnapshot;
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

export function createOfficeScene(
  snapshot: OfficeExperienceSnapshot,
  document: Readonly<OfficeCalibrationDocument>,
  events: OfficeSemanticEvent[] = [],
): OfficeSceneModel {
  const stations = snapshot.stations;
  const stationById = new Map(stations.map((station) => [station.stationId, station] as const));
  const participantActors: OfficeParticipantActor[] = snapshot.participants.map((participant) => {
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
  const residentActors: OfficeResidentActor[] = snapshot.residents.map((resident) => {
    const station = stationById.get(resident.stationId);
    if (!station) throw new Error(`Office resident ${resident.residentId} has no station ${resident.stationId}.`);
    return {
      actorId: resident.residentId,
      residentId: resident.residentId,
      seatId: station.stationId,
      kind: "resident",
      roleId: resident.roleId,
      label: resident.label,
      status: "idle",
      parentActorId: null,
      workstation: station.origin,
      anchors: station.anchors,
      scarf: resident.scarf,
      createdAt: resident.residentId,
      ambientPreferences: resident.ambientPreferences.map((preference) => ({ ...preference })),
    };
  });
  return {
    experience: snapshot,
    conversationId: snapshot.contextId,
    graphScopeId: snapshot.contextId,
    projectionHash: snapshot.revision,
    scopeStatus: snapshot.lifecycle,
    width: document.world.width,
    height: document.world.height,
    stations,
    actors: [...participantActors, ...residentActors],
    zones: officeZones(document),
    events,
    diagnostics: snapshot.diagnostics,
  };
}

function officeZones(document: Readonly<OfficeCalibrationDocument>): OfficeZone[] {
  const { coffee, treadmill, toilet } = document.facilities;
  return [
    zone("water-coffee", "water-coffee", coffee),
    zone("fitness", "treadmill", treadmill),
    zone("toilet", "toilet-back", toilet),
  ];

  function zone(id: OfficeZone["id"], propId: OfficeZone["propId"], facility: OfficeCalibrationDocument["facilities"][string]): OfficeZone {
    const body = facility.components.find((component) => component.componentId === "body");
    if (!body) throw new Error(`Office facility ${id} has no body component.`);
    return {
      id,
      propId,
      origin: facility.origin,
      scale: body.scale.x,
      anchors: {
        aisleEntry: addPoints(facility.origin, facility.anchors.aisleEntry!),
        contact: addPoints(facility.origin, facility.anchors.contact!),
      },
    };
  }
}

function addPoints(left: OfficePoint, right: OfficePoint): OfficePoint {
  return { x: left.x + right.x, y: left.y + right.y };
}
