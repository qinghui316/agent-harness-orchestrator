import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import type { ProductMode, ProviderApprovalRequest, ProviderApprovalResolution, ProviderUserInputRequest, ProviderUserInputResolution } from "../provider-runtime/index.js";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";
import { CanonicalTimelineDelivery, type CanonicalTimelinePublisher } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import { projectCanonicalTimelineEnvelope } from "./canonical-timeline-projector.js";
import type { TopicThreadEntry, WorkbenchProviderApprovalRequest, WorkbenchProviderUserInputRequest } from "./types.js";

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
    const existing = database.timeline.readMessage(runtime.projectId, request.conversationId, entry.id);
    if (existing) {
      const raw = JSON.parse(existing.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest };
      if (!raw.providerUserInput || !sameProviderUserInputIdentity(raw.providerUserInput, request)) {
        throw new Error("Provider user input request identity conflicts with persisted Timeline evidence.");
      }
      return projectCanonicalTimelineEnvelope(existing, productMode);
    }
    return new CanonicalTimelineDelivery(database, productMode, publisher).append(toCanonicalTimelineMessage(runtime.projectId, request.conversationId, entry));
  } finally {
    database.close();
  }
}

export async function persistProviderApprovalRequest(
  runtime: ProjectWorkbenchPathPort,
  request: WorkbenchProviderApprovalRequest,
  publisher?: CanonicalTimelinePublisher,
): Promise<CanonicalTimelineEnvelope> {
  const entry: TopicThreadEntry = {
    id: `provider-approval:${request.requestKey}`,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId: request.conversationId,
    graphScopeId: request.graphScopeId,
    changeId: "",
    runId: request.runId,
    providerId: request.providerId,
    attemptId: request.attemptId,
    sessionId: request.threadId,
    threadId: request.threadId,
    turnId: request.turnId,
    itemId: request.itemId,
    agentRoleId: request.agentRoleId,
    agentSurfaceId: request.agentRoleId === "main-agent" ? "main-agent" : agentThreadSurfaceId(request.providerId, request.threadId),
    status: request.status,
    providerApproval: request,
  };
  const database = await openProjectRuntimeWorkbenchDatabase(runtime);
  try {
    const existing = database.timeline.readMessage(runtime.projectId, request.conversationId, entry.id);
    if (existing) {
      const raw = JSON.parse(existing.rawJson) as { providerApproval?: WorkbenchProviderApprovalRequest };
      if (!raw.providerApproval || !sameProviderApprovalIdentity(raw.providerApproval, request)) {
        throw new Error("Provider approval identity conflicts with persisted Timeline evidence.");
      }
      return projectCanonicalTimelineEnvelope(existing, "agent");
    }
    return new CanonicalTimelineDelivery(database, "agent", publisher).append(toCanonicalTimelineMessage(runtime.projectId, request.conversationId, entry));
  } finally {
    database.close();
  }
}

export interface ProviderInteractionLifecycleOwnerOptions {
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
  resolveApprovalIdentity?: (threadId: string) => { attemptId: string; roleId: string } | null;
  onUnexpectedApproval?: (request: ProviderApprovalRequest) => void | Promise<void>;
  agentTurnMode?: "default" | "plan";
}

export class ProviderInteractionLifecycleOwner {
  private readonly requests = new Map<string, WorkbenchProviderUserInputRequest>();
  private readonly earlyResolutions = new Map<string, ProviderUserInputResolution>();
  private readonly resolutions = new Map<string, ProviderUserInputResolution>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly approvals = new Map<string, WorkbenchProviderApprovalRequest>();
  private readonly earlyApprovalResolutions = new Map<string, ProviderApprovalResolution>();
  private readonly approvalResolutions = new Map<string, ProviderApprovalResolution>();

  constructor(private readonly options: ProviderInteractionLifecycleOwnerOptions) {}

  readonly onRequest = (request: ProviderUserInputRequest): void => {
    try {
      this.assertCallbackIdentity(request);
      const requestKey = providerUserInputRequestKey(this.options.runId, request);
      const normalized: WorkbenchProviderUserInputRequest = {
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
      };
      const existing = this.requests.get(request.requestId);
      if (existing) {
        if (!sameProviderUserInputIdentity(existing, normalized)) {
          throw new Error("Provider user input requestId was reused with different Turn lineage.");
        }
        return;
      }
      this.requests.set(request.requestId, normalized);
      const persistence = persistProviderUserInputRequest(
        this.options.runtime,
        normalized,
        this.options.productMode,
        this.options.publisher,
      ).then(async () => {
        const earlyResolution = this.earlyResolutions.get(request.requestId);
        if (earlyResolution) {
          this.earlyResolutions.delete(request.requestId);
          await this.resolvePersistedRequest(earlyResolution, requestKey);
        }
        await this.options.onUpdated?.();
      });
      this.track(request.requestId, persistence);
    } catch (cause) {
      this.options.onError?.(asError(cause));
    }
  };

  readonly onResolved = (resolution: ProviderUserInputResolution): void => {
    try {
      this.assertResolutionIdentity(resolution);
      const knownResolution = this.resolutions.get(resolution.requestId);
      if (knownResolution) {
        if (!sameProviderUserInputResolutionIdentity(knownResolution, resolution)) {
          throw new Error("Provider user input resolution identity changed for the same requestId.");
        }
        return;
      }
      this.resolutions.set(resolution.requestId, resolution);
      const request = this.requests.get(resolution.requestId);
      if (!request) {
        const existing = this.earlyResolutions.get(resolution.requestId);
        if (existing && !sameProviderUserInputResolutionIdentity(existing, resolution)) {
          throw new Error("Provider user input resolution identity changed before its request arrived.");
        }
        this.earlyResolutions.set(resolution.requestId, resolution);
        return;
      }
      const work = this.resolveRequest(resolution, request);
      this.track(`resolved:${resolution.requestId}`, work);
    } catch (cause) {
      this.options.onError?.(asError(cause));
    }
  };

  readonly onApprovalRequest = (request: ProviderApprovalRequest): void => {
    try {
      if (this.options.productMode !== "agent") {
        const work = Promise.resolve(this.options.onUnexpectedApproval?.(request))
          .then(() => { throw new Error("Provider approval is forbidden outside Direct Agent mode."); });
        this.track(`unexpected-approval:${request.requestId}`, work);
        return;
      }
      this.assertApprovalCallbackIdentity(request);
      const identity = this.options.resolveApprovalIdentity?.(request.threadId);
      if (!identity) throw new Error("Provider approval thread cannot be resolved to an exact Agent Attempt.");
      const requestKey = providerApprovalRequestKey(request.runId, request);
      const normalized: WorkbenchProviderApprovalRequest = {
        providerId: request.providerId,
        requestKey,
        requestId: request.requestId,
        kind: request.kind,
        threadId: request.threadId,
        turnId: request.turnId,
        itemId: request.itemId,
        runId: request.runId,
        runtimeScopeId: request.runtimeScopeId,
        conversationId: this.options.conversationId,
        graphScopeId: this.options.graphScopeId,
        attemptId: identity.attemptId,
        agentRoleId: identity.roleId,
        agentTurnMode: this.options.agentTurnMode ?? "default",
        ...(request.reason ? { reason: request.reason } : {}),
        summary: request.summary,
        availableDecisions: request.availableDecisions.filter((decision) => (
          this.options.agentTurnMode !== "plan"
          || (!request.summary.includesWrite && request.kind !== "file-change")
          || decision === "decline"
          || decision === "cancel-turn"
        )),
        status: "pending",
      };
      const existing = this.approvals.get(request.requestId);
      if (existing) {
        if (!sameProviderApprovalIdentity(existing, normalized)) throw new Error("Provider approval requestId was reused with different Turn lineage.");
        return;
      }
      this.approvals.set(request.requestId, normalized);
      const persistence = persistProviderApprovalRequest(this.options.runtime, normalized, this.options.publisher).then(async () => {
        const early = this.earlyApprovalResolutions.get(request.requestId);
        if (early) {
          this.earlyApprovalResolutions.delete(request.requestId);
          await this.resolvePersistedApproval(early, requestKey);
        }
        await this.options.onUpdated?.();
      });
      this.track(`approval:${request.requestId}`, persistence);
    } catch (cause) {
      this.options.onError?.(asError(cause));
    }
  };

  readonly onApprovalResolved = (resolution: ProviderApprovalResolution): void => {
    try {
      this.assertApprovalResolutionIdentity(resolution);
      const known = this.approvalResolutions.get(resolution.requestId);
      if (known) {
        if (!sameProviderApprovalResolutionIdentity(known, resolution)) throw new Error("Provider approval resolution identity changed for the same requestId.");
        return;
      }
      this.approvalResolutions.set(resolution.requestId, resolution);
      const request = this.approvals.get(resolution.requestId);
      if (!request) {
        this.earlyApprovalResolutions.set(resolution.requestId, resolution);
        return;
      }
      this.track(`approval-resolved:${resolution.requestId}`, this.resolveApproval(resolution, request));
    } catch (cause) {
      this.options.onError?.(asError(cause));
    }
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
      rows.push(...database.interactions.terminalizeProviderApprovalRequests(
        this.options.projectId,
        this.options.conversationId,
        this.options.runId,
        new Date().toISOString(),
      ));
      const delivery = new CanonicalTimelineDelivery(database, this.options.productMode, this.options.publisher);
      delivery.publishCommittedMany(rows);
    } finally {
      database.close();
    }
    this.earlyResolutions.clear();
    this.earlyApprovalResolutions.clear();
    await this.options.onUpdated?.();
  }

  private async resolveRequest(
    resolution: ProviderUserInputResolution,
    request: WorkbenchProviderUserInputRequest,
  ): Promise<void> {
    await this.pending.get(resolution.requestId);
    await this.resolvePersistedRequest(resolution, request.requestKey);
  }

  private async resolvePersistedRequest(
    resolution: ProviderUserInputResolution,
    requestKey: string,
  ): Promise<void> {
    const database = await openProjectRuntimeWorkbenchDatabase(this.options.runtime);
    try {
      const current = database.interactions.readProviderUserInputRequest(
        this.options.projectId,
        this.options.conversationId,
        requestKey,
      );
      if (!current) throw new Error("Provider user input resolution arrived without persisted request evidence.");
      if ((resolution.threadId ?? null) !== (current.threadId ?? null)) {
        throw new Error("Provider user input resolution does not match the request thread lineage.");
      }
      if (current.status === "submitted" || current.status === "interrupted" || current.status === "superseded") return;
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

  private assertResolutionIdentity(resolution: ProviderUserInputResolution): void {
    if (resolution.providerId !== this.options.providerId
      || resolution.runId !== this.options.runId
      || resolution.attemptId !== this.options.attemptId
      || resolution.runtimeScopeId !== this.options.runtimeScopeId) {
      throw new Error("Provider user input resolution does not match the active Turn identity.");
    }
  }

  private assertCallbackIdentity(request: ProviderUserInputRequest): void {
    if (request.providerId !== this.options.providerId
      || request.attemptId !== this.options.attemptId
      || request.runId !== this.options.runId
      || request.runtimeScopeId !== this.options.runtimeScopeId) {
      throw new Error("Provider user input request does not match the active Turn identity.");
    }
  }

  private async resolveApproval(resolution: ProviderApprovalResolution, request: WorkbenchProviderApprovalRequest): Promise<void> {
    await this.pending.get(`approval:${resolution.requestId}`);
    await this.resolvePersistedApproval(resolution, request.requestKey);
  }

  private async resolvePersistedApproval(resolution: ProviderApprovalResolution, requestKey: string): Promise<void> {
    const database = await openProjectRuntimeWorkbenchDatabase(this.options.runtime);
    try {
      const current = database.interactions.readProviderApprovalRequest(this.options.projectId, this.options.conversationId, requestKey);
      if (!current) throw new Error("Provider approval resolution arrived without persisted request evidence.");
      if (resolution.threadId !== current.threadId || resolution.turnId !== current.turnId) throw new Error("Provider approval resolution does not match persisted Turn lineage.");
      if (current.status === "submitted" || current.status === "interrupted" || current.status === "superseded") return;
      const transition = database.interactions.transitionProviderApprovalRequest(
        this.options.projectId,
        this.options.conversationId,
        this.options.graphScopeId,
        requestKey,
        current.status,
        "submitted",
        current.decision,
        new Date().toISOString(),
      );
      new CanonicalTimelineDelivery(database, "agent", this.options.publisher).publishCommitted(transition.row);
    } finally {
      database.close();
    }
    await this.options.onUpdated?.();
  }

  private assertApprovalCallbackIdentity(request: ProviderApprovalRequest): void {
    if (request.providerId !== this.options.providerId || request.runId !== this.options.runId || request.runtimeScopeId !== this.options.runtimeScopeId) {
      throw new Error("Provider approval request does not match the active Turn identity.");
    }
  }

  private assertApprovalResolutionIdentity(resolution: ProviderApprovalResolution): void {
    if (resolution.providerId !== this.options.providerId || resolution.runId !== this.options.runId || resolution.runtimeScopeId !== this.options.runtimeScopeId) {
      throw new Error("Provider approval resolution does not match the active Turn identity.");
    }
  }

  private track(key: string, work: Promise<unknown>): void {
    this.pending.set(key, work);
    void work.catch((cause) => this.options.onError?.(asError(cause))).finally(() => {
      if (this.pending.get(key) === work) this.pending.delete(key);
    });
  }
}

export { ProviderInteractionLifecycleOwner as ProviderInputLifecycleOwner };
export type ProviderInputLifecycleOwnerOptions = ProviderInteractionLifecycleOwnerOptions;

function sameProviderUserInputIdentity(
  left: WorkbenchProviderUserInputRequest,
  right: WorkbenchProviderUserInputRequest,
): boolean {
  return JSON.stringify(providerUserInputIdentity(left)) === JSON.stringify(providerUserInputIdentity(right));
}

function providerUserInputIdentity(request: WorkbenchProviderUserInputRequest): Record<string, unknown> {
  return {
    providerId: request.providerId,
    attemptId: request.attemptId,
    requestKey: request.requestKey,
    requestId: request.requestId,
    threadId: request.threadId ?? null,
    turnId: request.turnId ?? null,
    itemId: request.itemId ?? null,
    runId: request.runId,
    runtimeScopeId: request.runtimeScopeId,
    conversationId: request.conversationId,
    graphScopeId: request.graphScopeId,
    changeId: request.changeId ?? null,
    agentRoleId: request.agentRoleId ?? null,
    questions: request.questions,
    expiresAt: request.expiresAt ?? null,
  };
}

function sameProviderUserInputResolutionIdentity(
  left: ProviderUserInputResolution,
  right: ProviderUserInputResolution,
): boolean {
  return left.providerId === right.providerId
    && left.requestId === right.requestId
    && left.runtimeScopeId === right.runtimeScopeId
    && left.runId === right.runId
    && left.attemptId === right.attemptId
    && (left.threadId ?? null) === (right.threadId ?? null);
}

function sameProviderApprovalIdentity(left: WorkbenchProviderApprovalRequest, right: WorkbenchProviderApprovalRequest): boolean {
  return JSON.stringify({ ...left, status: undefined, decision: undefined, submittedAt: undefined })
    === JSON.stringify({ ...right, status: undefined, decision: undefined, submittedAt: undefined });
}

function sameProviderApprovalResolutionIdentity(left: ProviderApprovalResolution, right: ProviderApprovalResolution): boolean {
  return left.providerId === right.providerId
    && left.requestId === right.requestId
    && left.runtimeScopeId === right.runtimeScopeId
    && left.runId === right.runId
    && left.threadId === right.threadId
    && left.turnId === right.turnId;
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
        let approval: WorkbenchProviderApprovalRequest | undefined;
        try {
          const raw = JSON.parse(row.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest; providerApproval?: WorkbenchProviderApprovalRequest };
          request = raw.providerUserInput;
          approval = raw.providerApproval;
        } catch {
          continue;
        }
        if (approval && (approval.status === "pending" || approval.status === "submitting")) {
          const active = input.providerRegistry.findActiveTurn(approval.runtimeScopeId);
          if (active
            && active.providerId === approval.providerId
            && active.attemptId === approval.attemptId
            && active.runId === approval.runId
            && active.turnId === approval.turnId
            && active.session.sessionId === approval.threadId
            && active.roleId === approval.agentRoleId) continue;
          const updated = database.interactions.interruptStaleProviderApprovalRequest(
            input.runtime.projectId,
            conversation.conversationId,
            approval.requestKey,
            approval.status,
            new Date().toISOString(),
          );
          if (updated) {
            interrupted += 1;
            if (diagnostics.length < 20) diagnostics.push(`${conversation.conversationId}:${approval.providerId}:${approval.attemptId}:${approval.requestId}`);
          }
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

export function providerApprovalRequestKey(
  runId: string,
  request: Pick<ProviderApprovalRequest, "requestId" | "threadId" | "turnId" | "itemId" | "kind">,
): string {
  return [runId, request.threadId, request.turnId, request.itemId, request.kind, request.requestId]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function failMissingChildIdentity(): never {
  throw new Error("Child provider user input requires canonical thread identity.");
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
