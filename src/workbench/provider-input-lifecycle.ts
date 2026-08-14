import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import type { ProductMode, ProviderUserInputRequest, ProviderUserInputResolution } from "../provider-runtime/index.js";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";
import { CanonicalTimelineDelivery, type CanonicalTimelinePublisher } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import type { TopicThreadEntry, WorkbenchProviderUserInputRequest } from "./types.js";

export async function persistProviderUserInputRequest(
  runtime: ProjectWorkbenchPathPort,
  request: WorkbenchProviderUserInputRequest,
  productMode: ProductMode,
  publisher?: CanonicalTimelinePublisher,
): Promise<CanonicalTimelineEnvelope> {
  if (!request.conversationId) throw new Error("Provider user input requires a project conversation.");
  const agentSurfaceId = request.agentRoleId && request.agentRoleId !== "main-agent"
    ? request.threadId?.trim()
      ? agentThreadSurfaceId(request.providerId, request.threadId)
      : failMissingChildIdentity()
    : "main-agent";
  const entry: TopicThreadEntry = {
    id: `provider-user-input:${request.requestKey}`,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId: request.conversationId,
    graphScopeId: request.graphScopeId,
    changeId: request.changeId ?? "",
    runId: request.runId,
    providerId: request.providerId,
    attemptId: request.attemptId,
    sessionId: request.threadId,
    threadId: request.threadId,
    turnId: request.turnId,
    agentRoleId: request.agentRoleId,
    agentSurfaceId,
    status: request.status,
    providerUserInput: request,
  };
  const database = await openProjectRuntimeWorkbenchDatabase(runtime);
  try {
    return new CanonicalTimelineDelivery(database, productMode, publisher).append(toCanonicalTimelineMessage(runtime.projectId, request.conversationId, entry));
  } finally {
    database.close();
  }
}

export interface ProviderInputLifecycleOwnerOptions {
  runtime: ProjectWorkbenchPathPort;
  productMode: ProductMode;
  projectId: string;
  conversationId: string;
  graphScopeId: string;
  runId: string;
  providerId: string;
  attemptId: string;
  runtimeScopeId: string;
  changeId?: string;
  publisher?: CanonicalTimelinePublisher;
  onUpdated?: () => void | Promise<void>;
  onError?: (error: Error) => void;
}

export class ProviderInputLifecycleOwner {
  private readonly requestKeys = new Map<string, string>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(private readonly options: ProviderInputLifecycleOwnerOptions) {}

  readonly onRequest = (request: ProviderUserInputRequest): void => {
    try {
      this.assertCallbackIdentity(request);
      const requestKey = providerUserInputRequestKey(this.options.runId, request);
      this.requestKeys.set(request.requestId, requestKey);
      const persistence = persistProviderUserInputRequest(this.options.runtime, {
        providerId: request.providerId,
        attemptId: request.attemptId,
        requestKey,
        requestId: request.requestId,
        threadId: request.threadId,
        turnId: request.turnId,
        itemId: request.itemId,
        runId: this.options.runId,
        runtimeScopeId: this.options.runtimeScopeId,
        conversationId: this.options.conversationId,
        graphScopeId: this.options.graphScopeId,
        changeId: this.options.changeId,
        agentRoleId: request.roleId !== "main-agent" ? request.roleId : undefined,
        questions: request.questions,
        ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
        status: "pending",
      }, this.options.productMode, this.options.publisher).then(() => this.options.onUpdated?.());
      this.track(request.requestId, persistence);
    } catch (cause) {
      this.options.onError?.(asError(cause));
    }
  };

  readonly onResolved = (resolution: ProviderUserInputResolution): void => {
    const work = this.resolveRequest(resolution);
    this.track(`resolved:${resolution.requestId}`, work);
  };

  async terminalize(): Promise<void> {
    await Promise.allSettled(this.pending.values());
    const database = await openProjectRuntimeWorkbenchDatabase(this.options.runtime);
    try {
      const rows = database.interactions.terminalizeProviderUserInputRequests(
        this.options.projectId,
        this.options.conversationId,
        this.options.runId,
        new Date().toISOString(),
      );
      const delivery = new CanonicalTimelineDelivery(database, this.options.productMode, this.options.publisher);
      delivery.publishCommittedMany(rows);
    } finally {
      database.close();
    }
    await this.options.onUpdated?.();
  }

  private async resolveRequest(resolution: ProviderUserInputResolution): Promise<void> {
    if (resolution.providerId !== this.options.providerId
      || resolution.runId !== this.options.runId
      || resolution.attemptId !== this.options.attemptId
      || resolution.runtimeScopeId !== this.options.runtimeScopeId) {
      throw new Error("Provider user input resolution does not match the active Turn identity.");
    }
    await this.pending.get(resolution.requestId);
    const requestKey = this.requestKeys.get(resolution.requestId);
    if (!requestKey) return;
    const database = await openProjectRuntimeWorkbenchDatabase(this.options.runtime);
    try {
      const current = database.interactions.readProviderUserInputRequest(
        this.options.projectId,
        this.options.conversationId,
        requestKey,
      );
      if (!current || current.status === "submitted" || current.status === "interrupted" || current.status === "superseded") return;
      const transition = database.interactions.transitionProviderUserInputRequest(
        this.options.projectId,
        this.options.conversationId,
        this.options.graphScopeId,
        requestKey,
        current.status,
        "submitted",
        current.status === "pending"
          ? {
            skippedQuestionIds: current.questions.map((question) => question.id),
            disposition: "skipped",
          }
          : undefined,
        new Date().toISOString(),
      );
      new CanonicalTimelineDelivery(database, this.options.productMode, this.options.publisher).publishCommitted(transition.row);
    } finally {
      database.close();
    }
    await this.options.onUpdated?.();
  }

  private assertCallbackIdentity(request: ProviderUserInputRequest): void {
    if (request.providerId !== this.options.providerId
      || request.attemptId !== this.options.attemptId
      || request.runId !== this.options.runId
      || request.runtimeScopeId !== this.options.runtimeScopeId) {
      throw new Error("Provider user input request does not match the active Turn identity.");
    }
  }

  private track(key: string, work: Promise<unknown>): void {
    this.pending.set(key, work);
    void work.catch((cause) => this.options.onError?.(asError(cause))).finally(() => {
      if (this.pending.get(key) === work) this.pending.delete(key);
    });
  }
}

export async function reconcileStaleProviderInputRequests(input: {
  runtime: ProjectWorkbenchPathPort;
  providerRegistry: ProviderRegistry;
}): Promise<{ interrupted: number; diagnostics: string[] }> {
  const database = await openProjectRuntimeWorkbenchDatabase(input.runtime, { providerRegistry: input.providerRegistry });
  let interrupted = 0;
  const diagnostics: string[] = [];
  try {
    const conversations = [
      ...database.conversations.listConversations(input.runtime.projectId, "agent", { includeDeleted: true }),
      ...database.conversations.listConversations(input.runtime.projectId, "harness", { includeDeleted: true }),
    ];
    for (const conversation of conversations) {
      for (const row of database.timeline.listConversationMessages(input.runtime.projectId, conversation.conversationId)) {
        let request: WorkbenchProviderUserInputRequest | undefined;
        try {
          request = (JSON.parse(row.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest }).providerUserInput;
        } catch {
          continue;
        }
        if (!request || (request.status !== "pending" && request.status !== "submitting")) continue;
        const active = input.providerRegistry.findActiveTurn(request.runtimeScopeId);
        if (active
          && active.providerId === request.providerId
          && active.attemptId === request.attemptId
          && active.runId === request.runId
          && active.turnId === request.turnId
          && active.session.sessionId === request.threadId
          && active.roleId === (request.agentRoleId ?? "main-agent")) continue;
        const updated = database.interactions.interruptStaleProviderUserInputRequest(
          input.runtime.projectId,
          conversation.conversationId,
          request.requestKey,
          request.status,
          new Date().toISOString(),
        );
        if (!updated) continue;
        interrupted += 1;
        if (diagnostics.length < 20) diagnostics.push([
          conversation.conversationId,
          request.providerId,
          request.attemptId,
          request.requestId,
        ].join(":"));
      }
    }
  } finally {
    database.close();
  }
  return { interrupted, diagnostics };
}

export function providerUserInputRequestKey(
  runId: string,
  request: Pick<ProviderUserInputRequest, "requestId" | "threadId" | "turnId" | "itemId">,
): string {
  return [runId, request.threadId ?? "main", request.turnId ?? "turn", request.itemId ?? "item", request.requestId]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function failMissingChildIdentity(): never {
  throw new Error("Child provider user input requires canonical thread identity.");
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
