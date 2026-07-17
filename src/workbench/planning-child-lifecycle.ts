import type { ProviderChildThreadResult } from "../provider-runtime/index.js";
import { attachCanonicalPlanDocument, canonicalPlanDocumentReference } from "./plan-documents.js";
import { writePlannerChildProposal } from "./planning/planner-child-proposal.js";
import { childProcessMessageId } from "./provider-capture-persistence.js";
import type { ChildTranscriptCapture } from "./live-transcript.js";
import type { AssistantTurnBlock } from "./types.js";

export const PLANNING_AGENT_ROLE_ID = "planning-agent";

export async function finalizePlanningChild(input: {
  directory: string;
  projectId: string;
  conversationId: string;
  runId: string;
  providerId: string;
  mainAttemptId: string;
  parentTurnId?: string;
  referenceSequence: number;
  child: ProviderChildThreadResult;
  captures: ChildTranscriptCapture[];
}): Promise<{ referenceBlock: AssistantTurnBlock; documentId: string }> {
  const proposal = await writePlannerChildProposal({
    directory: input.directory,
    projectId: input.projectId,
    conversationId: input.conversationId,
    runId: input.runId,
    parentThreadId: input.child.parentThreadId,
    childThreadId: input.child.threadId,
  });
  const childAttemptId = `${input.mainAttemptId}:child:${input.child.threadId}`;
  const document = attachCanonicalPlanDocument({
    captures: input.captures,
    proposal,
    providerId: input.providerId,
    attemptId: childAttemptId,
    sourceMessageIdForCapture: (capture) => childProcessMessageId(input.conversationId, input.providerId, input.runId, capture),
  });
  return {
    documentId: document.documentId,
    referenceBlock: {
      id: `document-reference:${document.documentId}`,
      providerId: input.providerId,
      attemptId: input.mainAttemptId,
      runId: input.runId,
      threadId: input.child.parentThreadId,
      turnId: input.parentTurnId,
      sequence: input.referenceSequence,
      kind: "tool-result",
      timestamp: new Date().toISOString(),
      source: "aho",
      status: "completed",
      title: document.title,
      text: document.title,
      documentRef: canonicalPlanDocumentReference(document),
    },
  };
}
