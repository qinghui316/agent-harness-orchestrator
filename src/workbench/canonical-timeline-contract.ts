import type { ParentAgentTranscriptCell } from "./timeline-cell-contract.js";

export interface CanonicalTimelineScope {
  projectId: string;
  conversationId: string;
  agentSurfaceId: string;
}

export interface CanonicalTimelineEnvelope {
  conversationId: string;
  agentSurfaceId: string;
  messageId: string;
  position: number;
  revision: number;
  orderClass: "sequence" | "thread-start";
  graphScopeId?: string;
  cells: ParentAgentTranscriptCell[];
}

export interface CanonicalTimelinePage {
  conversationId: string;
  agentSurfaceId: string;
  watermark: number;
  pinned: CanonicalTimelineEnvelope[];
  entries: CanonicalTimelineEnvelope[];
  paging: {
    limit: number;
    totalCount: number;
    hasMoreBefore: boolean;
    nextBeforeCursor?: string;
  };
}

export interface CanonicalTimelineCursor {
  projectId: string;
  conversationId: string;
  agentSurfaceId: string;
  beforePosition: number;
  watermarkRevision: number;
}
