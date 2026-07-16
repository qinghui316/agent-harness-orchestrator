import { createHash } from "node:crypto";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import type { PlannerChildProposal } from "./planning/planner-child-proposal.js";
import type { ChildTranscriptCapture } from "./live-transcript.js";
import type { AssistantTurnBlock, CanonicalDocumentReference, CanonicalPlanDocument, TopicThreadEntry } from "./types.js";

export function normalizePlanDocumentText(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  return lines.join("\n");
}

export function planDocumentContentHash(value: string): string {
  return createHash("sha256").update(normalizePlanDocumentText(value), "utf8").digest("hex");
}

export function attachCanonicalPlanDocument(input: {
  captures: ChildTranscriptCapture[];
  proposal: PlannerChildProposal;
  providerId: string;
  attemptId: string;
  sourceMessageIdForCapture: (capture: ChildTranscriptCapture) => string;
}): CanonicalPlanDocument {
  const expectedText = normalizePlanDocumentText(input.proposal.planMd);
  const matched = input.captures
    .flatMap((capture) => capture.blocks.map((block) => ({ capture, block })))
    .filter(({ block }) => block.kind === "prose" && block.source === "provider")
    .at(-1);
  if (!matched || normalizePlanDocumentText(matched.block.text ?? "") !== expectedText) {
    throw new Error("Planning child final canonical item does not match plan.md.");
  }
  const { capture, block } = matched;
  assertCanonicalPlanItem(block, capture, input.providerId, input.attemptId);
  const sourceCanonicalItemId = block.id;
  const contentHash = planDocumentContentHash(expectedText);
  const documentId = `plan-document-${createHash("sha256")
    .update(JSON.stringify({ sourceCanonicalItemId, proposalHash: input.proposal.hash }))
    .digest("hex")
    .slice(0, 24)}`;
  const document: CanonicalPlanDocument = {
    documentId,
    documentKind: "plan",
    title: "实现计划",
    sourceMessageId: input.sourceMessageIdForCapture(capture),
    sourceCanonicalItemId,
    proposalId: input.proposal.id,
    proposalHash: input.proposal.hash,
    proposalArtifact: input.proposal.artifact,
    contentHash,
    agentSurfaceId: agentThreadSurfaceId(input.providerId, capture.threadId),
  };
  block.document = document;
  return document;
}

export function canonicalPlanDocumentFromEntry(entry: TopicThreadEntry): CanonicalPlanDocument | null {
  if (entry.document?.documentKind === "plan") return entry.document;
  const documents = (entry.blocks ?? []).map((block) => block.document).filter((value): value is CanonicalPlanDocument => value?.documentKind === "plan");
  return documents.length === 1 ? documents[0]! : null;
}

export function canonicalPlanDocumentText(entry: TopicThreadEntry, document: CanonicalPlanDocument): string | null {
  const block = (entry.blocks ?? []).find((candidate) => candidate.id === document.sourceCanonicalItemId && candidate.document?.documentId === document.documentId);
  if (!block || block.kind !== "prose" || block.source !== "provider") return null;
  const text = normalizePlanDocumentText(block.text ?? "");
  return text && planDocumentContentHash(text) === document.contentHash ? text : null;
}

export function canonicalPlanDocumentReference(document: CanonicalPlanDocument): CanonicalDocumentReference {
  return {
    documentId: document.documentId,
    documentKind: document.documentKind,
    title: document.title,
    sourceMessageId: document.sourceMessageId,
    sourceCanonicalItemId: document.sourceCanonicalItemId,
    proposalHash: document.proposalHash,
  };
}

function assertCanonicalPlanItem(
  block: AssistantTurnBlock,
  capture: ChildTranscriptCapture,
  providerId: string,
  attemptId: string,
): asserts block is AssistantTurnBlock & Required<Pick<AssistantTurnBlock, "providerId" | "attemptId" | "threadId" | "turnId" | "itemId">> {
  if (!block.providerId || !block.attemptId || !block.threadId || !block.turnId || !block.itemId) {
    throw new Error("Planning child final canonical item identity is incomplete.");
  }
  if (block.providerId !== providerId || block.attemptId !== attemptId || block.threadId !== capture.threadId || block.turnId !== capture.turnId) {
    throw new Error("Planning child final canonical item identity does not match its ProviderAttempt.");
  }
}
