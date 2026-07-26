import type { OfficeParticipantState, OfficeStation } from "./officeExperience.js";
import { OfficeStationAssignmentStore, type OfficeStationAssignmentScope } from "./officeStationAssignmentStore.js";

export type OfficePresenceCandidate = {
  participantId: string;
  roleId: string;
  state: OfficeParticipantState;
  createdAt: string;
};

export class OfficePresencePolicy {
  private contextKey: string | null = null;
  private readonly assignments = new Map<string, string>();

  constructor(private readonly store = new OfficeStationAssignmentStore()) {}

  assign(scope: OfficeStationAssignmentScope, stations: readonly OfficeStation[], candidates: readonly OfficePresenceCandidate[]): {
    stationByParticipant: ReadonlyMap<string, string>;
    hiddenParticipantIds: string[];
  } {
    const contextKey = `${scope.projectId}\u0000${scope.conversationId}\u0000${scope.graphScopeId}`;
    if (this.contextKey !== contextKey) {
      this.contextKey = contextKey;
      this.assignments.clear();
      for (const [participantId, stationId] of this.store.read(scope)) this.assignments.set(participantId, stationId);
    }
    const stationById = new Map(stations.map((station) => [station.stationId, station] as const));
    const candidateById = new Map(candidates.map((candidate) => [candidate.participantId, candidate] as const));
    const validatedAssignments = new Map<string, string>();
    const savedStations = new Set<string>();
    for (const [participantId, stationId] of this.assignments) {
      if (!candidateById.has(participantId) || !stationById.has(stationId) || savedStations.has(stationId)) continue;
      validatedAssignments.set(participantId, stationId);
      savedStations.add(stationId);
    }
    this.assignments.clear();
    for (const assignment of validatedAssignments) this.assignments.set(...assignment);

    const childStations = stations.filter((station) => station.workstationKind === "standard");
    const visible = chooseVisibleCandidates(candidates, childStations.length, this.assignments);
    const visibleIds = new Set(visible.map((candidate) => candidate.participantId));
    for (const participantId of this.assignments.keys()) {
      if (!visibleIds.has(participantId)) this.assignments.delete(participantId);
    }

    const occupied = new Set(this.assignments.values());
    for (const candidate of visible) {
      if (this.assignments.has(candidate.participantId)) continue;
      const preferred = childStations.find((station) => station.preferredRoleId === candidate.roleId && !occupied.has(station.stationId));
      const fallback = childStations.find((station) => !occupied.has(station.stationId));
      const station = preferred ?? fallback;
      if (!station) continue;
      this.assignments.set(candidate.participantId, station.stationId);
      occupied.add(station.stationId);
    }
    this.store.write(scope, this.assignments);
    return {
      stationByParticipant: new Map(this.assignments),
      hiddenParticipantIds: candidates.filter((candidate) => !this.assignments.has(candidate.participantId)).map((candidate) => candidate.participantId),
    };
  }

  reset(): void {
    this.contextKey = null;
    this.assignments.clear();
  }
}

function chooseVisibleCandidates(
  candidates: readonly OfficePresenceCandidate[],
  capacity: number,
  assignments: ReadonlyMap<string, string>,
): OfficePresenceCandidate[] {
  if (candidates.length <= capacity) return [...candidates];
  return [...candidates]
    .sort((left, right) => {
      const state = visibilityPriority(right.state) - visibilityPriority(left.state);
      if (state !== 0) return state;
      const stable = Number(assignments.has(right.participantId)) - Number(assignments.has(left.participantId));
      return stable || left.createdAt.localeCompare(right.createdAt) || left.participantId.localeCompare(right.participantId);
    })
    .slice(0, capacity);
}

function visibilityPriority(state: OfficeParticipantState): number {
  if (state === "working" || state === "attention" || state === "blocked" || state === "failed" || state === "interrupted") return 4;
  if (state === "queued") return 3;
  if (state === "idle") return 2;
  return 1;
}
