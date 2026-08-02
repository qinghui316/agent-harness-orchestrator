import type { AgentCatalogDisplayProjection } from "../types.js";
import { OfficeCalibrationResolver } from "./officeCalibrationResolver.js";
import type {
  OfficeActorSourceItem,
  OfficeActorSourceSnapshot,
  OfficeExperienceSnapshot,
  OfficeParticipant,
  OfficeResident,
  OfficeSemanticEvent,
} from "./officeExperience.js";
import { OfficeOccupancyPolicy } from "./officeOccupancyPolicy.js";
import { officePresentationForRole } from "./officePresentationRegistry.js";
import { officeResidentId, officeResidentRoles } from "./officeResidentPolicy.js";

export class OfficeExperienceComposer {
  private currentSnapshot: OfficeExperienceSnapshot | null = null;

  constructor(
    private readonly projectId: string,
    private readonly resolver: OfficeCalibrationResolver,
    private readonly catalog: AgentCatalogDisplayProjection | null,
    private readonly occupancy = new OfficeOccupancyPolicy(),
    private readonly catalogError: string | null = null,
  ) {}

  hydrate(source: OfficeActorSourceSnapshot): OfficeExperienceSnapshot {
    const snapshot = this.compose(source);
    this.currentSnapshot = snapshot;
    return snapshot;
  }

  reconcile(previous: OfficeActorSourceSnapshot, next: OfficeActorSourceSnapshot): {
    snapshot: OfficeExperienceSnapshot;
    events: OfficeSemanticEvent[];
  } {
    if (previous.contextId !== next.contextId) {
      this.occupancy.reset();
      const snapshot = this.compose(next);
      this.currentSnapshot = snapshot;
      return { snapshot, events: [{ kind: "scope-reset", previousContextId: previous.contextId }] };
    }
    const previousSnapshot = this.currentSnapshot?.contextId === previous.contextId
      && this.currentSnapshot.revision === this.experienceRevision(previous)
      ? this.currentSnapshot
      : this.compose(previous);
    const snapshot = this.compose(next);
    const events = reconcileExperience(previousSnapshot, snapshot, previous.lifecycle, next.lifecycle);
    this.currentSnapshot = snapshot;
    return { snapshot, events };
  }

  private compose(source: OfficeActorSourceSnapshot): OfficeExperienceSnapshot {
    const stations = this.resolver.stations();
    const primaryActors = source.actors.filter((actor) => actor.actorKind === "primary");
    if (primaryActors.length !== 1) throw new Error("Agent Office requires exactly one explicit current primary actor.");
    const primary = primaryActors[0]!;
    const workers = source.actors
      .filter((actor) => actor.actorKind === "worker")
      .sort(stableActorOrder);
    const residentRoles = officeResidentRoles(this.catalog);
    const allocation = this.occupancy.assign(
      { projectId: this.projectId, conversationId: source.conversationId, graphScopeId: source.contextId },
      stations,
      workers.map((actor) => ({
        participantId: actor.actorId,
        roleId: actor.roleId,
        state: actor.state,
        createdAt: actor.createdAt,
      })),
      residentRoles.map((role) => ({ residentId: officeResidentId(role.roleId), roleId: role.roleId })),
    );
    const mainStation = stations.find((station) => station.workstationKind === "main");
    if (!mainStation) throw new Error("Agent Office requires a calibrated Main station.");
    const participants = [participantFromSource(primary, "main", mainStation.stationId)];
    for (const actor of workers) {
      const stationId = allocation.stationByParticipant.get(actor.actorId);
      if (stationId) participants.push(participantFromSource(actor, "child", stationId));
    }
    const residents = residentRoles.flatMap((role): OfficeResident[] => {
      const residentId = officeResidentId(role.roleId);
      const stationId = allocation.stationByResident.get(residentId);
      if (!stationId) return [];
      const presentation = officePresentationForRole(role.roleId);
      return [{
        residentId,
        roleId: role.roleId,
        label: role.displayName,
        stationId,
        scarf: presentation.scarf,
        presentationPreferences: presentation.preferences,
      }];
    });
    return {
      contextId: source.contextId,
      revision: this.experienceRevision(source),
      lifecycle: source.lifecycle,
      stations,
      participants,
      residents,
      diagnostics: [
        ...(allocation.hiddenParticipantIds.length > 0 ? [`Office capacity exceeded; hidden participants: ${allocation.hiddenParticipantIds.join(", ")}`] : []),
        ...(this.catalogError ? [`Office residents unavailable: ${this.catalogError}`] : []),
      ],
    };
  }

  private experienceRevision(source: OfficeActorSourceSnapshot): string {
    return `${source.revision}:${this.catalog?.catalogHash ?? "catalog-unavailable"}`;
  }
}

function participantFromSource(source: OfficeActorSourceItem, kind: "main" | "child", stationId: string): OfficeParticipant {
  const presentation = officePresentationForRole(source.roleId);
  return {
    participantId: source.actorId,
    navigationId: source.navigationId,
    stationId,
    kind,
    label: source.label,
    roleId: source.roleId,
    parentParticipantId: source.parentActorId,
    state: source.state,
    createdAt: source.createdAt,
    scarf: presentation.scarf,
    presentationPreferences: presentation.preferences,
  };
}

function stableActorOrder(left: OfficeActorSourceItem, right: OfficeActorSourceItem): number {
  return left.createdAt.localeCompare(right.createdAt) || left.actorId.localeCompare(right.actorId);
}

function reconcileExperience(
  previous: OfficeExperienceSnapshot,
  next: OfficeExperienceSnapshot,
  previousLifecycle: OfficeActorSourceSnapshot["lifecycle"],
  nextLifecycle: OfficeActorSourceSnapshot["lifecycle"],
): OfficeSemanticEvent[] {
  const before = new Map(previous.participants.map((participant) => [participant.participantId, participant] as const));
  const after = new Map(next.participants.map((participant) => [participant.participantId, participant] as const));
  const residentBefore = new Map(previous.residents.map((resident) => [resident.residentId, resident] as const));
  const residentAfter = new Map(next.residents.map((resident) => [resident.residentId, resident] as const));
  const events: OfficeSemanticEvent[] = [];
  for (const participant of next.participants) {
    const prior = before.get(participant.participantId);
    if (!prior) {
      events.push({ kind: "participant-added", participantId: participant.participantId, parentParticipantId: participant.parentParticipantId });
      continue;
    }
    if (prior.stationId !== participant.stationId) events.push({ kind: "station-changed", participantId: participant.participantId, fromStationId: prior.stationId, toStationId: participant.stationId });
    if (prior.state !== participant.state) events.push({ kind: "state-changed", participantId: participant.participantId, from: prior.state, to: participant.state });
  }
  for (const participantId of before.keys()) if (!after.has(participantId)) events.push({ kind: "participant-removed", participantId });
  for (const resident of next.residents) {
    const prior = residentBefore.get(resident.residentId);
    if (!prior) events.push({ kind: "resident-added", residentId: resident.residentId });
    else if (prior.stationId !== resident.stationId) events.push({ kind: "resident-station-changed", residentId: resident.residentId, fromStationId: prior.stationId, toStationId: resident.stationId });
  }
  for (const residentId of residentBefore.keys()) if (!residentAfter.has(residentId)) events.push({ kind: "resident-removed", residentId });
  if (previousLifecycle !== "terminal" && nextLifecycle === "terminal") events.push({ kind: "scope-terminal" });
  return events;
}
