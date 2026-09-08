import type { TopicAttachment } from "../types.js";
import type { DraftSubmissionSnapshot } from "./conversation-submission-contract.js";

export type PendingSubmissionState = "sending" | "uncertain" | "failed";

export interface PendingConversationSubmission {
  kind: "create" | "message";
  snapshot: DraftSubmissionSnapshot;
  attachments: TopicAttachment[];
  attachmentFiles: File[];
  state: PendingSubmissionState;
}

export class ConversationTurnSubmissionController {
  private readonly submissions = new Map<string, PendingConversationSubmission>();

  begin(input: Omit<PendingConversationSubmission, "state">): PendingConversationSubmission {
    const submission = cloneSubmission({ ...input, state: "sending" });
    this.submissions.set(submission.snapshot.clientRequestId, submission);
    return cloneSubmission(submission);
  }

  updateSnapshot(clientRequestId: string, snapshot: DraftSubmissionSnapshot): void {
    const current = this.submissions.get(clientRequestId);
    if (!current) return;
    this.submissions.set(clientRequestId, cloneSubmission({ ...current, snapshot }));
  }

  settle(clientRequestId: string): void {
    this.submissions.delete(clientRequestId);
  }

  fail(clientRequestId: string, state: Exclude<PendingSubmissionState, "sending">): PendingConversationSubmission | null {
    const current = this.submissions.get(clientRequestId);
    if (!current) return null;
    const failed = cloneSubmission({ ...current, state });
    this.submissions.set(clientRequestId, failed);
    return cloneSubmission(failed);
  }

  retry(clientRequestId: string, nextClientRequestId: string): PendingConversationSubmission | null {
    const current = this.submissions.get(clientRequestId);
    if (!current || current.state !== "failed") return null;
    const retry = cloneSubmission({
      ...current,
      state: "sending",
      snapshot: { ...current.snapshot, clientRequestId: nextClientRequestId },
    });
    this.submissions.set(nextClientRequestId, retry);
    return cloneSubmission(retry);
  }

  restore(clientRequestId: string): PendingConversationSubmission | null {
    const current = this.submissions.get(clientRequestId);
    return current && current.state !== "sending" ? cloneSubmission(current) : null;
  }
}

function cloneSubmission(submission: PendingConversationSubmission): PendingConversationSubmission {
  return {
    ...submission,
    snapshot: {
      ...submission.snapshot,
      contextRefs: submission.snapshot.contextRefs.map((reference) => ({ ...reference })),
      attachmentIds: [...submission.snapshot.attachmentIds],
      skillOverrides: { ...submission.snapshot.skillOverrides },
    },
    attachments: submission.attachments.map((attachment) => ({ ...attachment })),
    attachmentFiles: [...submission.attachmentFiles],
  };
}
