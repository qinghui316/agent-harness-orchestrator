import type { OfficeParticipantState, OfficeStation } from "./officeExperience.js";
import { OfficeStationAssignmentStore, type OfficeStationAssignmentScope } from "./officeStationAssignmentStore.js";

export type OfficeOccupancyParticipantCandidate = {
  participantId: string;
  roleId: string;
  state: OfficeParticipantState;
  createdAt: string;
};

export type OfficeOccupancyResidentCandidate = {
  residentId: string;
  roleId: string;
};

export type OfficeOccupancyAllocation = {
  stationByParticipant: ReadonlyMap<string, string>;
  stationByResident: ReadonlyMap<string, string>;
  hiddenParticipantIds: string[];
};

export class OfficeOccupancyPolicy {
  private contextKey: string | null = null;
  private readonly assignments = new Map<string, string>();

  constructor(private readonly store = new OfficeStationAssignmentStore()) {}

  assign(
    scope: OfficeStationAssignmentScope,
    stations: readonly OfficeStation[],
    participants: readonly OfficeOccupancyParticipantCandidate[],
    residentCandidates: readonly OfficeOccupancyResidentCandidate[],
  ): OfficeOccupancyAllocation {
    this.loadScope(scope);
    const childStations = stations.filter((station) => station.workstationKind === "standard");
    const stationById = new Map(childStations.map((station) => [station.stationId, station] as const));
    const visibleParticipants = chooseVisibleParticipants(participants, childStations.length, this.assignments);
    const visibleParticipantIds = new Set(visibleParticipants.map((candidate) => candidate.participantId));
    const realRoles = new Set(participants.map((candidate) => candidate.roleId));
    const residentLimit = Math.max(0, Math.min(2, childStations.length - visibleParticipants.length, 2 - visibleParticipants.length));
    const residents = residentCandidates.filter((candidate) => !realRoles.has(candidate.roleId)).slice(0, residentLimit);
    const residentIds = new Set(residents.map((candidate) => candidate.residentId));

    const next = new Map<string, string>();
    const occupied = new Set<string>();
    for (const participant of visibleParticipants) {
      const stationId = this.assignments.get(participant.participantId);
      if (!stationId || !stationById.has(stationId) || occupied.has(stationId)) continue;
      next.set(participant.participantId, stationId);
      occupied.add(stationId);
    }
    for (const participant of visibleParticipants) {
      if (next.has(participant.participantId)) continue;
      assignCandidate(next, occupied, childStations, participant.participantId, participant.roleId);
    }
    for (const resident of residents) {
      const stationId = this.assignments.get(resident.residentId);
      if (!stationId || !stationById.has(stationId) || occupied.has(stationId)) continue;
      next.set(resident.residentId, stationId);
      occupied.add(stationId);
    }
    for (const resident of residents) {
      if (next.has(resident.residentId)) continue;
      assignCandidate(next, occupied, childStations, resident.residentId, resident.roleId);
    }

    this.assignments.clear();
    for (const assignment of next) this.assignments.set(...assignment);
    this.store.write(scope, this.assignments);
    return {
      stationByParticipant: new Map([...next].filter(([id]) => visibleParticipantIds.has(id))),
      stationByResident: new Map([...next].filter(([id]) => residentIds.has(id))),
      hiddenParticipantIds: [...participants]
        .sort(stableParticipantOrder)
        .filter((candidate) => !visibleParticipantIds.has(candidate.participantId))
        .map((candidate) => candidate.participantId),
    };
  }

  reset(): void {
    this.contextKey = null;
    this.assignments.clear();
  }

  private loadScope(scope: OfficeStationAssignmentScope): void {
    const contextKey = `${scope.projectId}\u0000${scope.conversationId}\u0000${scope.graphScopeId}`;
    if (this.contextKey === contextKey) return;
    this.contextKey = contextKey;
    this.assignments.clear();
    for (const [id, stationId] of this.store.read(scope)) this.assignments.set(id, stationId);
  }
}

function assignCandidate(
  assignments: Map<string, string>,
  occupied: Set<string>,
  stations: readonly OfficeStation[],
  id: string,
  roleId: string,
): void {
  const station = stations.find((candidate) => candidate.preferredRoleId === roleId && !occupied.has(candidate.stationId))
    ?? stations.find((candidate) => !occupied.has(candidate.stationId));
  if (!station) return;
  assignments.set(id, station.stationId);
  occupied.add(station.stationId);
}

function chooseVisibleParticipants(
  candidates: readonly OfficeOccupancyParticipantCandidate[],
  capacity: number,
  assignments: ReadonlyMap<string, string>,
): OfficeOccupancyParticipantCandidate[] {
  const ordered = [...candidates].sort(stableParticipantOrder);
  if (ordered.length <= capacity) return ordered;
  return ordered.sort((left, right) => {
    const state = visibilityPriority(right.state) - visibilityPriority(left.state);
    if (state !== 0) return state;
    const stable = Number(assignments.has(right.participantId)) - Number(assignments.has(left.participantId));
    return stable || stableParticipantOrder(left, right);
  }).slice(0, capacity);
}

function stableParticipantOrder(
  left: OfficeOccupancyParticipantCandidate,
  right: OfficeOccupancyParticipantCandidate,
): number {
  return left.createdAt.localeCompare(right.createdAt) || left.participantId.localeCompare(right.participantId);
}

function visibilityPriority(state: OfficeParticipantState): number {
  if (state === "working" || state === "attention" || state === "blocked" || state === "failed" || state === "interrupted") return 4;
  if (state === "queued") return 3;
  if (state === "idle") return 2;
  return 1;
}
