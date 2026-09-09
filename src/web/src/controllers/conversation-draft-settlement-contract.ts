import type { TopicFileReference } from "../types.js";

export interface ConversationDraftSettlementIdentity {
  text: string;
  contextRefs: readonly TopicFileReference[];
  attachmentIds: readonly string[];
  skillOverrides: Readonly<Record<string, boolean>>;
}

export interface ComposerDraftSettlementGuard {
  preserveText: boolean;
  preserveContextRefIdentities: readonly string[];
  preserveAttachmentIds: readonly string[];
  preserveSkillIds: readonly string[];
}
