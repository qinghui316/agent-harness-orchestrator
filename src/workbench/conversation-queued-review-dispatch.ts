import type { ProviderId, ProviderReviewTarget } from "../provider-runtime/index.js";
import type { ManagedProject } from "../types/index.js";

export interface QueuedReviewDispatchRequest {
  conversationId: string;
  providerId: ProviderId;
  target: ProviderReviewTarget;
  expectedTimelineRevision: number;
  expectedExecutionRevision: string | null;
  clientRequestId: string;
}

export interface QueuedReviewDispatchResult {
  conversationId: string;
  clientRequestId: string;
  status: "pending" | "submitting" | "reviewing" | "completed" | "failed" | "interrupted";
}

export interface ConversationQueuedReviewDispatchPort {
  dispatchQueuedReview(
    project: ManagedProject,
    request: QueuedReviewDispatchRequest,
  ): Promise<QueuedReviewDispatchResult>;
}
