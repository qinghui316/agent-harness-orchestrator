import type { AgentTurnMode, ProductMode, TopicAttachment, TopicFileReference } from "../types.js";

export interface DraftSubmissionSnapshot {
  projectId: string;
  productMode: ProductMode;
  conversationId: string | null;
  clientRequestId: string;
  draftRevision: string | null;
  text: string;
  contextRefs: TopicFileReference[];
  attachmentIds: string[];
  skillOverrides: Record<string, boolean>;
  providerId: string | null;
  agentTurnMode: AgentTurnMode | null;
  modelId: string | null;
  reasoningEffort: string | null;
}

export function createDraftSubmissionSnapshot(input: Omit<DraftSubmissionSnapshot, "contextRefs" | "attachmentIds" | "skillOverrides"> & {
  contextRefs: readonly TopicFileReference[];
  attachments: readonly Pick<TopicAttachment, "id">[];
  skillOverrides: Readonly<Record<string, boolean>>;
}): DraftSubmissionSnapshot {
  return {
    ...input,
    contextRefs: input.contextRefs.map((reference) => ({ ...reference })),
    attachmentIds: input.attachments.map((attachment) => attachment.id),
    skillOverrides: { ...input.skillOverrides },
  };
}
