import type { AgentSurfaceProjection, AgentSurfaceStatus } from "../types.js";
import type {
  OfficeActorSourceAdapter,
  OfficeActorSourceSnapshot,
  OfficeParticipantState,
} from "./officeExperience.js";

export class AgentSurfaceOfficeSourceAdapter implements OfficeActorSourceAdapter<AgentSurfaceProjection> {
  project(projection: AgentSurfaceProjection): OfficeActorSourceSnapshot {
    return {
      conversationId: projection.conversationId,
      contextId: projection.graphScopeId,
      revision: projection.projectionHash,
      lifecycle: projection.scopeStatus,
      residentPolicy: projection.productMode === "agent" ? "none" : "harness-catalog",
      actors: projection.surfaces
        .filter((surface) => (
          surface.scopeRange === "current"
          && surface.graphScopeId === projection.graphScopeId
          && surface.status !== "terminated"
        ))
        .map((surface) => ({
          actorId: surface.agentSurfaceId,
          actorKind: surface.kind === "main-agent" ? "primary" as const : "worker" as const,
          navigationId: surface.agentSurfaceId,
          roleId: surface.roleId,
          label: surface.label,
          parentActorId: surface.parentAgentSurfaceId,
          state: mapAgentSurfaceState(surface.status),
          createdAt: surface.createdAt,
        })),
    };
  }
}

const OFFICE_STATE_BY_AGENT_SURFACE_STATUS: Record<AgentSurfaceStatus, OfficeParticipantState> = {
  idle: "idle",
  queued: "queued",
  running: "working",
  "waiting-user": "attention",
  "needs-change": "blocked",
  failed: "failed",
  completed: "completed",
  interrupted: "interrupted",
  terminated: "idle",
};

export function mapAgentSurfaceState(status: AgentSurfaceStatus): OfficeParticipantState {
  return OFFICE_STATE_BY_AGENT_SURFACE_STATUS[status];
}
