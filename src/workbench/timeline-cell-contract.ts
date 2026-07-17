import type { InteractionHistoryRecord } from "./conversation-interaction-contract.js";

export interface CanonicalDocumentReference {
  documentId: string;
  documentKind: "plan";
  title: string;
  sourceMessageId: string;
  sourceCanonicalItemId: string;
  proposalHash: string;
}

export interface TopicFileReference {
  relativePath: string;
  name: string;
  kind: "file" | "directory";
  extension?: string;
  size?: number;
  source?: "composer";
}

export type TopicAttachmentKind = "image" | "text" | "unsupported";
export type TopicAttachmentRuntimeMode = "provider-image-input" | "bounded-text-preview" | "metadata-only";

export interface TopicAttachment {
  id: string;
  fileName: string;
  mediaType: string;
  kind: TopicAttachmentKind;
  size: number;
  hash: string;
  source: "composer";
  createdAt: string;
  storagePath: string;
  runtimeMode: TopicAttachmentRuntimeMode;
  message?: string;
}

export type ParentAgentTranscriptActor = "user" | "parent-agent";
export type ParentAgentTranscriptBlockKind = "prose" | "process" | "tool-result" | "evidence";
export type ParentAgentTranscriptBlockSource = "user" | "provider-runtime" | "aho-orchestration" | "workflow-evidence" | "maintenance";
export type ParentAgentTranscriptCellKind = "user-message" | "assistant-message" | "process-row" | "evidence-row" | "user-input" | "document-preview" | "detail-only";

export interface ParentAgentEvidenceRef {
  label: string;
  ref: string;
  kind: "artifact" | "run" | "decision" | "remote" | "maintenance";
}

export interface ParentAgentTranscriptBlock {
  id: string;
  kind: ParentAgentTranscriptBlockKind;
  source: ParentAgentTranscriptBlockSource;
  title?: string;
  text: string;
  status?: string;
  evidenceRefs?: ParentAgentEvidenceRef[];
  isError?: boolean;
}

export interface ParentAgentTranscriptItem {
  id: string;
  actor: ParentAgentTranscriptActor;
  timestamp?: string;
  blocks: ParentAgentTranscriptBlock[];
  derived?: boolean;
}

export interface ParentAgentTranscriptCell {
  id: string;
  kind: ParentAgentTranscriptCellKind;
  source: ParentAgentTranscriptBlockSource;
  agentRoleId?: string;
  agentTaskId?: string;
  initialThreadInput?: boolean;
  runId?: string;
  providerId?: string;
  attemptId?: string;
  threadId?: string;
  parentThreadId?: string;
  turnId?: string;
  itemId?: string;
  agentSurfaceId?: string;
  targetAgentSurfaceId?: string;
  targetAgentDisplayName?: string;
  timestamp?: string;
  title?: string;
  text: string;
  status?: string;
  evidenceRefs?: ParentAgentEvidenceRef[];
  isError?: boolean;
  realtime?: boolean;
  activityKind?: "turn" | "reasoning" | "command" | "file" | "search" | "tool" | "agent" | "status";
  detailText?: string;
  contextRefs?: TopicFileReference[];
  attachments?: TopicAttachment[];
  interactionHistory?: InteractionHistoryRecord;
  documentRef?: CanonicalDocumentReference;
}
