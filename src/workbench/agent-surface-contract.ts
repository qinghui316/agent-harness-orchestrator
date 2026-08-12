import type { ProductMode } from "../provider-runtime/index.js";

export type AgentSurfaceStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "needs-change"
  | "failed"
  | "waiting-user"
  | "interrupted"
  | "terminated";

export interface AgentSurfaceProjectionItem {
  agentSurfaceId: string;
  kind: "main-agent" | "agent";
  roleId: string;
  roleDisplayName: string;
  label: string;
  description: string;
  skills: string[];
  parentAgentSurfaceId: string | null;
  graphScopeId: string;
  scopeRange: "current" | "historical";
  status: AgentSurfaceStatus;
  readOnly: boolean;
  createdAt: string;
}

export interface AgentSurfaceProjection {
  projectId: string;
  productMode: ProductMode;
  conversationId: string;
  graphScopeId: string;
  scopeStatus: "active" | "terminal";
  projectionHash: string;
  surfaces: AgentSurfaceProjectionItem[];
  diagnostics: AgentSurfaceProjectionDiagnostic[];
}

export interface AgentSurfaceProjectionDiagnostic {
  code: "malformed-lineage" | "orphan-lineage" | "cyclic-lineage" | "mismatched-fact";
  agentSurfaceId?: string;
}

export type AgentSurfacesInvalidationReason =
  | "thread-bound"
  | "attempt-updated"
  | "interaction-updated"
  | "scope-changed"
  | "provider-interrupted"
  | "provider-terminated"
  | "snapshot";

export interface AgentSurfacesInvalidated {
  conversationId: string;
  graphScopeId?: string;
  reason: AgentSurfacesInvalidationReason;
}
