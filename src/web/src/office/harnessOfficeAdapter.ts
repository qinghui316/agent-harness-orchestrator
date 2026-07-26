import type { AgentSurfaceProjection, AgentSurfaceProjectionItem, AgentSurfaceStatus } from "../types.js";
import type {
  OfficeExperienceSnapshot,
  OfficeParticipant,
  OfficeParticipantState,
  OfficeSceneSourceAdapter,
  OfficeSemanticEvent,
} from "./officeExperience.js";
import { OfficeCalibrationResolver } from "./officeCalibrationResolver.js";
import { OfficePresencePolicy } from "./officePresencePolicy.js";
import { officePresentationForRole } from "./officePresentationRegistry.js";

export class HarnessOfficeAdapter implements OfficeSceneSourceAdapter<AgentSurfaceProjection> {
  private currentSnapshot: OfficeExperienceSnapshot | null = null;

  constructor(
    private readonly projectId: string,
    private readonly presence = new OfficePresencePolicy(),
    private readonly resolver = new OfficeCalibrationResolver(),
  ) {}

  hydrate(projection: AgentSurfaceProjection): OfficeExperienceSnapshot {
    const snapshot = this.snapshot(projection);
    this.currentSnapshot = snapshot;
    return snapshot;
  }

  reconcile(previous: AgentSurfaceProjection, next: AgentSurfaceProjection): {
    snapshot: OfficeExperienceSnapshot;
    events: OfficeSemanticEvent[];
  } {
    if (previous.graphScopeId !== next.graphScopeId) {
      this.presence.reset();
      const snapshot = this.snapshot(next);
      this.currentSnapshot = snapshot;
      return { snapshot, events: [{ kind: "scope-reset", previousContextId: previous.graphScopeId }] };
    }
    const previousSnapshot = this.currentSnapshot?.contextId === previous.graphScopeId
      && this.currentSnapshot.revision === previous.projectionHash
      ? this.currentSnapshot
      : this.snapshot(previous);
    const snapshot = this.snapshot(next);
    const before = participantById(previousSnapshot);
    const after = participantById(snapshot);
    const events: OfficeSemanticEvent[] = [];
    for (const participant of snapshot.participants) {
      const prior = before.get(participant.participantId);
      if (!prior) {
        events.push({ kind: "participant-added", participantId: participant.participantId, parentParticipantId: participant.parentParticipantId });
        continue;
      }
      if (prior.stationId !== participant.stationId) {
        events.push({ kind: "station-changed", participantId: participant.participantId, fromStationId: prior.stationId, toStationId: participant.stationId });
      }
      if (prior.state !== participant.state) {
        events.push({ kind: "state-changed", participantId: participant.participantId, from: prior.state, to: participant.state });
      }
    }
    for (const participantId of before.keys()) {
      if (!after.has(participantId)) events.push({ kind: "participant-removed", participantId });
    }
    if (previous.scopeStatus !== "terminal" && next.scopeStatus === "terminal") events.push({ kind: "scope-terminal" });
    this.currentSnapshot = snapshot;
    return { snapshot, events };
  }

  private snapshot(projection: AgentSurfaceProjection): OfficeExperienceSnapshot {
    const stations = this.resolver.stations();
    const current = projection.surfaces.filter((surface) => (
      surface.scopeRange === "current"
      && surface.graphScopeId === projection.graphScopeId
      && surface.status !== "terminated"
    ));
    const main = current.find((surface) => surface.kind === "main-agent");
    if (!main) throw new Error("Harness Office requires a canonical current Main surface.");
    const children = current.filter((surface) => surface.kind === "agent");
    const allocation = this.presence.assign(
      { projectId: this.projectId, conversationId: projection.conversationId, graphScopeId: projection.graphScopeId },
      stations,
      children.map((surface) => ({
        participantId: surface.agentSurfaceId,
        roleId: surface.roleId,
        state: mapHarnessState(surface.status),
        createdAt: surface.createdAt,
      })),
    );
    const mainStation = stations.find((station) => station.workstationKind === "main");
    if (!mainStation) throw new Error("Harness Office requires a calibrated Main station.");
    const participants = [participantFromSurface(main, "main", mainStation.stationId)];
    for (const surface of children) {
      const stationId = allocation.stationByParticipant.get(surface.agentSurfaceId);
      if (stationId) participants.push(participantFromSurface(surface, "child", stationId));
    }
    return {
      contextId: projection.graphScopeId,
      revision: projection.projectionHash,
      lifecycle: projection.scopeStatus,
      stations,
      participants,
      diagnostics: allocation.hiddenParticipantIds.length > 0
        ? [`Office capacity exceeded; hidden participants: ${allocation.hiddenParticipantIds.join(", ")}`]
        : [],
    };
  }
}

export function mapHarnessState(status: AgentSurfaceStatus): OfficeParticipantState {
  switch (status) {
    case "running": return "working";
    case "waiting-user": return "attention";
    case "needs-change": return "blocked";
    case "failed": return "failed";
    case "completed": return "completed";
    case "interrupted": return "interrupted";
    case "queued": return "queued";
    case "idle":
    case "terminated":
    default: return "idle";
  }
}

function participantFromSurface(surface: AgentSurfaceProjectionItem, kind: "main" | "child", stationId: string): OfficeParticipant {
  const presentation = officePresentationForRole(surface.roleId);
  return {
    participantId: surface.agentSurfaceId,
    navigationId: surface.agentSurfaceId,
    stationId,
    kind,
    label: surface.label,
    roleId: surface.roleId,
    parentParticipantId: surface.parentAgentSurfaceId,
    state: mapHarnessState(surface.status),
    createdAt: surface.createdAt,
    scarf: presentation.scarf,
    ambientPreferences: presentation.ambientPreferences,
  };
}

function participantById(snapshot: OfficeExperienceSnapshot): Map<string, OfficeParticipant> {
  return new Map(snapshot.participants.map((participant) => [participant.participantId, participant] as const));
}
