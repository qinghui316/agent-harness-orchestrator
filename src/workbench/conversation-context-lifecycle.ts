import { createHash } from "node:crypto";
import type {
  ProductMode,
  ProviderContextEvent,
  ProviderContextUsage,
  ProviderId,
  ProviderRegistry,
  ProviderSessionRef,
} from "../provider-runtime/index.js";
import type { ProjectRuntimeCoordinatorPort } from "../project-runtime/coordinator.js";
import type { ProjectRuntimePaths } from "../project-runtime/paths.js";
import type { ManagedProject } from "../types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { StoredContextCompactionEvidence } from "./persistence/repositories/conversation-context-repository.js";
import { publishConversationContextInvalidated } from "./project-live-events.js";

export type ProviderContextLifecycleState = "idle" | "submitting" | "compacting" | "completed" | "failed" | "interrupted";

export interface ConversationContextSnapshot {
  providerId: ProviderId;
  contextRevision: string;
  usage: ProviderContextUsage | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  lifecycle: ProviderContextLifecycleState;
  source: "manual" | "automatic" | null;
  lastCompactedAt: string | null;
  canCompact: boolean;
  disabledReason?: string;
}

export interface ConversationContextCompactRequest {
  projectId: string;
  productMode: ProductMode;
  conversationId: string;
  providerId: ProviderId;
  contextRevision: string;
  clientRequestId: string;
}

export interface ConversationContextObservation {
  paths: ProjectRuntimePaths;
  productMode: ProductMode;
  conversationId: string;
  graphScopeId: string | null;
  providerId: ProviderId;
}

type OwnerRegistry = Pick<ProviderRegistry, "get">;

export class ConversationContextLifecycleOwner {
  private readonly submissions = new Map<string, { contextRevision: string; promise: Promise<{ status: "accepted" }> }>();
  private readonly manualByBinding = new Map<string, { clientRequestId: string; contextRevision: string }>();
  private readonly compactByConversation = new Map<string, string>();
  private readonly compactionByItem = new Map<string, { clientRequestId: string; contextRevision: string; source: "manual" | "automatic" }>();
  private readonly recordQueues = new Map<string, Promise<void>>();
  private readonly retainedCompactions = new Map<string, {
    paths: ProjectRuntimePaths;
    conversationId: string;
    changeId: string;
    evidence: StoredContextCompactionEvidence;
  }>();
  private readonly retainedEvents = new Map<string, { observation: ConversationContextObservation; event: ProviderContextEvent }>();
  private readonly retainedEventTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retainedEventRetryAttempts = new Map<string, number>();

  constructor(private readonly options: {
    providerRegistry: OwnerRegistry;
    projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve">;
  }) {}

  listener(observation: ConversationContextObservation): (event: ProviderContextEvent) => void {
    return (event) => {
      void this.enqueueRecord(observation, event).catch(() => {
        if (event.type !== "compaction") return;
        const bindingHash = sessionBindingHash(
          observation.paths.projectId,
          observation.productMode,
          observation.conversationId,
          observation.providerId,
          event.session.sessionId,
        );
        const itemKey = `${bindingHash}\0${event.itemId}`;
        const item = this.compactionByItem.get(itemKey) ?? this.manualByBinding.get(bindingHash);
        const clientRequestId = item?.clientRequestId ?? `automatic-${shortHash(itemKey)}`;
        const retainedKey = retainedCompactionKey(observation.paths.projectId, observation.conversationId, clientRequestId);
        this.retainedEvents.set(retainedKey, { observation, event });
        this.scheduleRetainedEventRetry(retainedKey);
      });
    };
  }

  async read(project: ManagedProject, productMode: ProductMode, conversationId: string): Promise<ConversationContextSnapshot> {
    const resolved = await this.resolve(project, productMode, conversationId);
    return resolved.snapshot;
  }

  async compact(project: ManagedProject, request: ConversationContextCompactRequest): Promise<{ status: "accepted" }> {
    const clientRequestId = request.clientRequestId.trim();
    if (!clientRequestId) throw badRequest("Context compaction requires clientRequestId.");
    const key = `${request.projectId}\0${request.productMode}\0${request.conversationId}\0${clientRequestId}`;
    const existing = this.submissions.get(key);
    if (existing) {
      if (existing.contextRevision !== request.contextRevision) throw conflict("Context compaction clientRequestId is bound to another context revision.");
      const receipt = await existing.promise;
      await this.flushRetainedCompaction(request);
      return receipt;
    }
    const conversationKey = compactConversationKey(request);
    const activeClientRequestId = this.compactByConversation.get(conversationKey);
    if (activeClientRequestId && activeClientRequestId !== clientRequestId) {
      throw conflict("Conversation context already has a pending compaction request.");
    }
    this.compactByConversation.set(conversationKey, clientRequestId);
    const promise = this.submit(project, { ...request, clientRequestId }).catch((error: unknown) => {
      if (!(error instanceof Error) || error.name !== "ProviderContextCompactUncertain") {
        if (this.compactByConversation.get(conversationKey) === clientRequestId) this.compactByConversation.delete(conversationKey);
      }
      throw error;
    });
    this.submissions.set(key, { contextRevision: request.contextRevision, promise });
    return promise;
  }

  async reconcileProject(paths: ProjectRuntimePaths): Promise<number> {
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      let changed = 0;
      const now = new Date().toISOString();
      for (const mode of ["agent", "harness"] as const) {
        for (const conversation of database.conversations.listConversations(paths.projectId, mode)) {
          changed += database.conversationContext.interruptIncomplete(paths.projectId, conversation.conversationId, now);
        }
      }
      return changed;
    } finally {
      database.close();
    }
  }

  private async submit(project: ManagedProject, request: ConversationContextCompactRequest): Promise<{ status: "accepted" }> {
    const resolved = await this.resolve(project, request.productMode, request.conversationId);
    if (request.projectId !== project.id || resolved.conversation.projectId !== request.projectId) throw conflict("Context compaction project identity does not match.");
    if (resolved.conversation.selectedProviderId !== request.providerId || resolved.binding?.providerId !== request.providerId) throw conflict("Context compaction Provider identity does not match.");
    if (resolved.snapshot.contextRevision !== request.contextRevision) throw conflict("Context compaction revision is stale.");
    if (!resolved.binding?.nativeSessionId || resolved.binding.bindingStatus !== "ready") throw conflict("Conversation has no ready Provider session to compact.");
    if (!resolved.snapshot.canCompact) throw conflict(resolved.snapshot.disabledReason ?? "Conversation context cannot be compacted now.");
    const evidence: StoredContextCompactionEvidence = {
      providerId: request.providerId,
      productMode: request.productMode,
      graphScopeId: resolved.conversation.currentGraphScopeId,
      bindingHash: resolved.bindingHash,
      contextRevision: request.contextRevision,
      clientRequestId: request.clientRequestId,
      source: "manual",
      lifecycle: "submitting",
      updatedAt: new Date().toISOString(),
      lastCompactedAt: null,
    };
    const database = await openProjectRuntimeWorkbenchDatabase(resolved.paths);
    try {
      const prior = database.conversationContext.readCompactionByClientRequest(request.projectId, request.conversationId, request.clientRequestId);
      if (prior) {
        if (prior.contextRevision !== request.contextRevision) throw conflict("Context compaction clientRequestId conflicts with persisted evidence.");
        if (prior.lifecycle === "completed" || prior.lifecycle === "compacting" || prior.lifecycle === "submitting") return { status: "accepted" };
        if (prior.lifecycle === "failed") throw providerRejected();
        if (prior.lifecycle === "interrupted") throw conflict("Context compaction request is terminal; retry with a new clientRequestId.");
      }
      database.conversationContext.upsertCompaction({
        projectId: request.projectId,
        conversationId: request.conversationId,
        changeId: resolved.conversation.boundChangeId ?? request.conversationId,
        evidence,
      });
    } finally {
      database.close();
    }
    publishConversationContextInvalidated(request.projectId, { conversationId: request.conversationId });
    this.manualByBinding.set(resolved.bindingHash, { clientRequestId: request.clientRequestId, contextRevision: request.contextRevision });
    const session: ProviderSessionRef = { providerId: request.providerId, sessionId: resolved.binding.nativeSessionId };
    try {
      return await this.options.providerRegistry.get(request.providerId).conversation.compactContext({
        providerId: request.providerId,
        projectId: request.projectId,
        cwd: project.path,
        session,
        onContextEvent: this.listener({
          paths: resolved.paths,
          productMode: request.productMode,
          conversationId: request.conversationId,
          graphScopeId: resolved.conversation.currentGraphScopeId,
          providerId: request.providerId,
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ProviderContextCompactRejected") {
        await this.updateManualFailure(resolved.paths, resolved.conversation, evidence, "Provider rejected context compaction.");
        this.manualByBinding.delete(resolved.bindingHash);
        throw providerRejected();
      }
      const uncertain = error instanceof Error ? error : new Error(String(error));
      uncertain.name = "ProviderContextCompactUncertain";
      throw uncertain;
    }
  }

  private enqueueRecord(observation: ConversationContextObservation, event: ProviderContextEvent): Promise<void> {
    const key = event.type === "compaction"
      ? [observation.paths.projectId, observation.productMode, observation.conversationId, event.session.providerId, event.session.sessionId, event.itemId].join("\0")
      : [observation.paths.projectId, observation.productMode, observation.conversationId, event.session.providerId, event.session.sessionId, "usage"].join("\0");
    const previous = this.recordQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.record(observation, event));
    this.recordQueues.set(key, current);
    void current.finally(() => {
      if (this.recordQueues.get(key) === current) this.recordQueues.delete(key);
    }).catch(() => undefined);
    return current;
  }

  private async record(observation: ConversationContextObservation, event: ProviderContextEvent): Promise<void> {
    if (event.session.providerId !== observation.providerId) return;
    const database = await openProjectRuntimeWorkbenchDatabase(observation.paths);
    try {
      const conversation = database.conversations.readConversation(observation.paths.projectId, observation.conversationId);
      if (!conversation || conversation.productMode !== observation.productMode || conversation.selectedProviderId !== observation.providerId) return;
      if (conversation.currentGraphScopeId !== observation.graphScopeId) return;
      const binding = database.providerAttempts.readConversationProviderBinding(observation.paths.projectId, observation.conversationId, observation.providerId);
      if (!binding?.nativeSessionId || binding.nativeSessionId !== event.session.sessionId) return;
      const bindingHash = sessionBindingHash(observation.paths.projectId, observation.productMode, observation.conversationId, observation.providerId, binding.nativeSessionId);
      const contextRevision = revisionFor(bindingHash, conversation.currentGraphScopeId);
      if (event.type === "usage") {
        const usage = normalizeUsage(event.usage);
        if (!usage) return;
        database.conversationContext.upsertUsage({
          projectId: observation.paths.projectId,
          conversationId: observation.conversationId,
          changeId: conversation.boundChangeId ?? observation.conversationId,
          evidence: { providerId: observation.providerId, productMode: observation.productMode, graphScopeId: conversation.currentGraphScopeId, bindingHash, contextRevision, usage },
        });
      } else {
        const itemKey = `${bindingHash}\0${event.itemId}`;
        const priorItem = this.compactionByItem.get(itemKey);
        const manual = this.manualByBinding.get(bindingHash);
        const item = priorItem ?? (manual
          ? { ...manual, source: "manual" as const }
          : { clientRequestId: `automatic-${shortHash(itemKey)}`, contextRevision, source: "automatic" as const });
        this.compactionByItem.set(itemKey, item);
        const { source, clientRequestId } = item;
        const previous = database.conversationContext.readCompactionByClientRequest(observation.paths.projectId, observation.conversationId, clientRequestId);
        const lifecycle = event.phase === "started" ? "compacting" : event.phase === "completed" ? "completed" : "failed";
        if (previous && isTerminalLifecycle(previous.lifecycle)) return;
        const retainedKey = retainedCompactionKey(observation.paths.projectId, observation.conversationId, clientRequestId);
        const retained = {
          paths: observation.paths,
          conversationId: observation.conversationId,
          changeId: conversation.boundChangeId ?? observation.conversationId,
          evidence: {
            providerId: observation.providerId,
            productMode: observation.productMode,
            graphScopeId: conversation.currentGraphScopeId,
            bindingHash,
            contextRevision: item.contextRevision,
            clientRequestId,
            source,
            lifecycle,
            updatedAt: event.occurredAt,
            lastCompactedAt: lifecycle === "completed" ? event.occurredAt : previous?.lastCompactedAt ?? null,
            ...(lifecycle === "failed" ? { diagnostic: "Provider context compaction failed." } : {}),
          } satisfies StoredContextCompactionEvidence,
        };
        this.retainedCompactions.set(retainedKey, retained);
        database.conversationContext.upsertCompaction({
          projectId: observation.paths.projectId,
          conversationId: observation.conversationId,
          changeId: retained.changeId,
          evidence: retained.evidence,
        });
        this.retainedCompactions.delete(retainedKey);
        if (event.phase !== "started" && source === "manual") {
          this.manualByBinding.delete(bindingHash);
          const conversationKey = compactConversationKey({
            projectId: observation.paths.projectId,
            productMode: observation.productMode,
            conversationId: observation.conversationId,
          });
          if (this.compactByConversation.get(conversationKey) === clientRequestId) this.compactByConversation.delete(conversationKey);
        }
      }
    } finally {
      database.close();
    }
    publishConversationContextInvalidated(observation.paths.projectId, { conversationId: observation.conversationId });
  }

  private async flushRetainedCompaction(request: ConversationContextCompactRequest): Promise<void> {
    const key = retainedCompactionKey(request.projectId, request.conversationId, request.clientRequestId);
    const retainedEvent = this.retainedEvents.get(key);
    if (retainedEvent) {
      await this.enqueueRecord(retainedEvent.observation, retainedEvent.event);
      if (this.retainedEvents.get(key) === retainedEvent) {
        this.retainedEvents.delete(key);
        this.clearRetainedEventRetry(key);
      } else {
        this.retainedEventRetryAttempts.set(key, 0);
        this.scheduleRetainedEventRetry(key);
      }
    }
    const retained = this.retainedCompactions.get(key);
    if (!retained || retained.evidence.contextRevision !== request.contextRevision) return;
    const database = await openProjectRuntimeWorkbenchDatabase(retained.paths);
    try {
      database.conversationContext.upsertCompaction({
        projectId: request.projectId,
        conversationId: retained.conversationId,
        changeId: retained.changeId,
        evidence: retained.evidence,
      });
      this.retainedCompactions.delete(key);
      if (retained.evidence.source === "manual" && isTerminalLifecycle(retained.evidence.lifecycle)) {
        this.manualByBinding.delete(retained.evidence.bindingHash);
        const conversationKey = compactConversationKey({
          projectId: request.projectId,
          productMode: retained.evidence.productMode,
          conversationId: request.conversationId,
        });
        if (this.compactByConversation.get(conversationKey) === request.clientRequestId) this.compactByConversation.delete(conversationKey);
      }
    } finally {
      database.close();
    }
    publishConversationContextInvalidated(request.projectId, { conversationId: request.conversationId });
  }

  private scheduleRetainedEventRetry(key: string): void {
    if (this.retainedEventTimers.has(key)) return;
    const attempt = this.retainedEventRetryAttempts.get(key) ?? 0;
    const delayMs = Math.min(100 * (2 ** Math.min(attempt, 6)), 5_000);
    const timer = setTimeout(() => {
      this.retainedEventTimers.delete(key);
      const retained = this.retainedEvents.get(key);
      if (!retained) {
        this.retainedEventRetryAttempts.delete(key);
        return;
      }
      void this.enqueueRecord(retained.observation, retained.event).then(() => {
        if (this.retainedEvents.get(key) === retained) {
          this.retainedEvents.delete(key);
          this.retainedCompactions.delete(key);
          this.retainedEventRetryAttempts.delete(key);
          return;
        }
        this.retainedEventRetryAttempts.set(key, 0);
        this.scheduleRetainedEventRetry(key);
      }).catch(() => {
        this.retainedEventRetryAttempts.set(key, attempt + 1);
        this.scheduleRetainedEventRetry(key);
      });
    }, delayMs);
    timer.unref?.();
    this.retainedEventTimers.set(key, timer);
  }

  private clearRetainedEventRetry(key: string): void {
    const timer = this.retainedEventTimers.get(key);
    if (timer) clearTimeout(timer);
    this.retainedEventTimers.delete(key);
    this.retainedEventRetryAttempts.delete(key);
  }

  private async resolve(project: ManagedProject, productMode: ProductMode, conversationId: string) {
    const runtime = await this.options.projectRuntimeCoordinator.resolve(project);
    const paths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    let persisted: {
      conversation: NonNullable<ReturnType<typeof database.conversations.readConversation>>;
      binding: ReturnType<typeof database.providerAttempts.readConversationProviderBinding>;
      bindingHash: string;
      contextRevision: string;
      usage: ProviderContextUsage | null;
      compaction: StoredContextCompactionEvidence | null;
      activeAttempt: boolean;
      pendingInteraction: boolean;
    };
    try {
      const conversation = database.conversations.readConversation(paths.projectId, conversationId);
      if (!conversation || conversation.deletedAt || conversation.state !== "active") throw conflict("Conversation is not active.");
      if (conversation.productMode !== productMode) throw conflict("Conversation ProductMode does not match context request.");
      const binding = database.providerAttempts.readConversationProviderBinding(paths.projectId, conversationId, conversation.selectedProviderId);
      const bindingHash = binding?.nativeSessionId
        ? sessionBindingHash(paths.projectId, productMode, conversationId, conversation.selectedProviderId, binding.nativeSessionId)
        : sessionBindingHash(paths.projectId, productMode, conversationId, conversation.selectedProviderId, "unbound");
      const contextRevision = revisionFor(bindingHash, conversation.currentGraphScopeId);
      const usage = binding?.nativeSessionId ? database.conversationContext.readLatestUsage(paths.projectId, conversationId, bindingHash)?.usage ?? null : null;
      const compaction = binding?.nativeSessionId ? database.conversationContext.readLatestCompaction(paths.projectId, conversationId, bindingHash) : null;
      const activeAttempt = database.providerAttempts.listProviderAttempts(paths.projectId, conversationId).some((attempt) =>
        attempt.graphScopeId === conversation.currentGraphScopeId && (attempt.status === "queued" || attempt.status === "running"));
      const pendingInteraction = database.timeline.listConversationMessages(paths.projectId, conversationId).some((row) => {
        try {
          const raw = JSON.parse(row.rawJson) as { providerUserInput?: { status?: string }; providerApproval?: { status?: string } };
          return [raw.providerUserInput?.status, raw.providerApproval?.status].some((status) => status === "pending" || status === "submitting");
        } catch { return false; }
      });
      persisted = { conversation, binding, bindingHash, contextRevision, usage, compaction, activeAttempt, pendingInteraction };
    } finally {
      database.close();
    }
    let compactReady = false;
    let capabilityUnavailable = false;
    try {
      const capability = await this.options.providerRegistry.get(persisted.conversation.selectedProviderId)
        .capabilitySnapshot(project, productMode, project.path);
      compactReady = capability.capabilities.some((item) => item.key === "context.compact" && item.runtime === "ready");
    } catch {
      capabilityUnavailable = true;
    }
    const lifecycle = persisted.compaction && persisted.usage
      && persisted.usage.updatedAt > persisted.compaction.updatedAt
      && persisted.compaction.lifecycle === "completed"
      ? "idle"
      : persisted.compaction?.lifecycle ?? "idle";
    const disabledReason = !persisted.binding?.nativeSessionId || persisted.binding.bindingStatus !== "ready"
        ? "当前会话没有可用的 Provider 上下文。"
        : capabilityUnavailable
          ? "暂时无法验证 Provider 的上下文压缩能力。"
          : !compactReady
          ? "当前 Provider 不支持手动压缩上下文。"
          : persisted.activeAttempt
            ? "当前回合运行中，结束后才能压缩上下文。"
            : persisted.pendingInteraction
              ? "请先处理当前 Provider 问题或审批。"
              : lifecycle === "submitting" || lifecycle === "compacting"
                ? "上下文压缩正在进行。"
                : undefined;
    const usedPercent = percentage(persisted.usage?.contextUsedTokens ?? null, persisted.usage?.modelContextWindow ?? null);
    return {
      paths,
      conversation: persisted.conversation,
      binding: persisted.binding,
      bindingHash: persisted.bindingHash,
      snapshot: {
        providerId: persisted.conversation.selectedProviderId,
        contextRevision: persisted.contextRevision,
        usage: persisted.usage,
        usedPercent,
        remainingPercent: usedPercent === null ? null : Math.max(0, 100 - usedPercent),
        lifecycle,
        source: persisted.compaction?.source ?? null,
        lastCompactedAt: persisted.compaction?.lastCompactedAt ?? null,
        canCompact: !disabledReason,
        ...(disabledReason ? { disabledReason } : {}),
      } satisfies ConversationContextSnapshot,
    };
  }

  private async updateManualFailure(paths: ProjectRuntimePaths, conversation: { conversationId: string; boundChangeId: string | null }, evidence: StoredContextCompactionEvidence, diagnostic: string): Promise<void> {
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.conversationContext.upsertCompaction({
        projectId: paths.projectId,
        conversationId: conversation.conversationId,
        changeId: conversation.boundChangeId ?? conversation.conversationId,
        evidence: { ...evidence, lifecycle: "failed", updatedAt: new Date().toISOString(), diagnostic },
      });
    } finally {
      database.close();
    }
    publishConversationContextInvalidated(paths.projectId, { conversationId: conversation.conversationId });
  }
}

function normalizeUsage(usage: ProviderContextUsage): ProviderContextUsage | null {
  const breakdowns = [usage.total, usage.last];
  if (!breakdowns.every((value) => Object.values(value).every((number) => Number.isSafeInteger(number) && number >= 0))) return null;
  if (!isIsoTimestamp(usage.updatedAt)) return null;
  const contextUsedTokens = safeOptional(usage.contextUsedTokens);
  const modelContextWindow = safeOptional(usage.modelContextWindow, true);
  return { ...usage, contextUsedTokens, modelContextWindow };
}

function isIsoTimestamp(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeOptional(value: number | null, positive = false): number | null {
  return value !== null && Number.isSafeInteger(value) && value >= (positive ? 1 : 0) ? value : null;
}

function percentage(used: number | null, window: number | null): number | null {
  if (used === null || window === null || window <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / window) * 100)));
}

function sessionBindingHash(projectId: string, productMode: ProductMode, conversationId: string, providerId: string, sessionId: string): string {
  return createHash("sha256").update([projectId, productMode, conversationId, providerId, sessionId].join("\0")).digest("hex");
}

function revisionFor(bindingHash: string, graphScopeId: string | null): string {
  return createHash("sha256").update(`${bindingHash}\0${graphScopeId ?? ""}`).digest("hex");
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function compactConversationKey(request: Pick<ConversationContextCompactRequest, "projectId" | "productMode" | "conversationId">): string {
  return `${request.projectId}\0${request.productMode}\0${request.conversationId}`;
}

function retainedCompactionKey(projectId: string, conversationId: string, clientRequestId: string): string {
  return `${projectId}\0${conversationId}\0${clientRequestId}`;
}

function isTerminalLifecycle(lifecycle: StoredContextCompactionEvidence["lifecycle"]): boolean {
  return lifecycle === "completed" || lifecycle === "failed" || lifecycle === "interrupted";
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}

function providerRejected(): Error {
  const error = new Error("Provider rejected context compaction.");
  error.name = "ProviderContextCompactRejected";
  return error;
}
