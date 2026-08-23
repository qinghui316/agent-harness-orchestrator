import { createHash } from "node:crypto";
import type { ProductMode, ProviderContextUsage, ProviderId } from "../../../provider-runtime/index.js";
import type { StoredTopicMessage } from "../contracts.js";
import type { TimelineRepository } from "./timeline-repository.js";

export type StoredContextLifecycle = "submitting" | "compacting" | "completed" | "failed" | "interrupted";

export interface StoredContextUsageEvidence {
  providerId: ProviderId;
  productMode: ProductMode;
  graphScopeId: string | null;
  bindingHash: string;
  contextRevision: string;
  usage: ProviderContextUsage;
}

export interface StoredContextCompactionEvidence {
  providerId: ProviderId;
  productMode: ProductMode;
  graphScopeId: string | null;
  bindingHash: string;
  contextRevision: string;
  clientRequestId: string;
  source: "manual" | "automatic";
  lifecycle: StoredContextLifecycle;
  updatedAt: string;
  lastCompactedAt: string | null;
  diagnostic?: string;
}

export class ConversationContextRepository {
  constructor(private readonly timeline: TimelineRepository) {}

  readLatestUsage(projectId: string, conversationId: string, bindingHash: string): StoredContextUsageEvidence | null {
    return this.readRows(projectId, conversationId, "provider.context-usage")
      .map(parseUsage)
      .reverse()
      .find((value): value is StoredContextUsageEvidence => Boolean(value && value.bindingHash === bindingHash)) ?? null;
  }

  upsertUsage(input: {
    projectId: string;
    conversationId: string;
    changeId: string;
    evidence: StoredContextUsageEvidence;
  }): StoredTopicMessage {
    const id = `provider-context-usage:${digest(`${input.conversationId}\0${input.evidence.bindingHash}`)}`;
    const existing = this.timeline.readMessage(input.projectId, input.conversationId, id);
    const write = {
      id,
      projectId: input.projectId,
      conversationId: input.conversationId,
      changeId: input.changeId,
      agentSurfaceId: "main-agent",
      type: "provider.context-usage",
      timestamp: input.evidence.usage.updatedAt,
      text: null,
      actionRunId: null,
      actionType: null,
      status: "current",
      runId: null,
      providerId: input.evidence.providerId,
      threadId: null,
      turnId: null,
      itemId: null,
      artifact: null,
      error: null,
      rawJson: JSON.stringify({ providerContextUsage: input.evidence }),
    };
    return existing ? this.timeline.updateMessage({ ...write, initialThreadInput: existing.initialThreadInput }) : this.timeline.appendMessage(write);
  }

  readLatestCompaction(projectId: string, conversationId: string, bindingHash: string): StoredContextCompactionEvidence | null {
    return this.readRows(projectId, conversationId, "provider.context-compaction")
      .map(parseCompaction)
      .reverse()
      .find((value): value is StoredContextCompactionEvidence => Boolean(value && value.bindingHash === bindingHash)) ?? null;
  }

  readCompactionByClientRequest(projectId: string, conversationId: string, clientRequestId: string): StoredContextCompactionEvidence | null {
    return this.readRows(projectId, conversationId, "provider.context-compaction")
      .map(parseCompaction)
      .reverse()
      .find((value): value is StoredContextCompactionEvidence => value?.clientRequestId === clientRequestId) ?? null;
  }

  upsertCompaction(input: {
    projectId: string;
    conversationId: string;
    changeId: string;
    evidence: StoredContextCompactionEvidence;
  }): StoredTopicMessage {
    const id = `provider-context-compaction:${digest(`${input.conversationId}\0${input.evidence.clientRequestId}`)}`;
    const existing = this.timeline.readMessage(input.projectId, input.conversationId, id);
    const existingEvidence = existing ? parseCompaction(existing) : null;
    if (existing && existingEvidence) {
      assertSameCompactionIdentity(existingEvidence, input.evidence);
      if (!canAdvanceCompaction(existingEvidence.lifecycle, input.evidence.lifecycle)) return existing;
    }
    const write = {
      id,
      projectId: input.projectId,
      conversationId: input.conversationId,
      changeId: input.changeId,
      agentSurfaceId: "main-agent",
      type: "provider.context-compaction",
      timestamp: input.evidence.updatedAt,
      text: null,
      actionRunId: null,
      actionType: null,
      status: input.evidence.lifecycle,
      runId: null,
      providerId: input.evidence.providerId,
      threadId: null,
      turnId: null,
      itemId: null,
      artifact: null,
      error: input.evidence.diagnostic ?? null,
      rawJson: JSON.stringify({ providerContextCompaction: input.evidence }),
    };
    return existing ? this.timeline.updateMessage({ ...write, initialThreadInput: existing.initialThreadInput }) : this.timeline.appendMessage(write);
  }

  interruptIncomplete(projectId: string, conversationId: string, updatedAt: string): number {
    let changed = 0;
    for (const row of this.readRows(projectId, conversationId, "provider.context-compaction")) {
      const evidence = parseCompaction(row);
      if (!evidence || (evidence.lifecycle !== "submitting" && evidence.lifecycle !== "compacting")) continue;
      this.upsertCompaction({
        projectId,
        conversationId,
        changeId: row.changeId,
        evidence: {
          ...evidence,
          lifecycle: "interrupted",
          updatedAt,
          diagnostic: "Context compaction was interrupted because the prior Provider process is unavailable.",
        },
      });
      changed += 1;
    }
    return changed;
  }

  private readRows(projectId: string, conversationId: string, type: string): StoredTopicMessage[] {
    return this.timeline.listConversationMessages(projectId, conversationId).filter((row) => row.type === type);
  }
}

function assertSameCompactionIdentity(left: StoredContextCompactionEvidence, right: StoredContextCompactionEvidence): void {
  const keys = ["providerId", "productMode", "graphScopeId", "bindingHash", "contextRevision", "clientRequestId", "source"] as const;
  if (keys.some((key) => left[key] !== right[key])) {
    throw new Error("Provider context compaction evidence conflicts with its persisted identity.");
  }
}

function canAdvanceCompaction(current: StoredContextLifecycle, next: StoredContextLifecycle): boolean {
  if (current === "completed" || current === "failed" || current === "interrupted") return false;
  if (current === "compacting") return next === "completed" || next === "failed" || next === "interrupted";
  return next !== "submitting";
}

function parseUsage(row: StoredTopicMessage): StoredContextUsageEvidence | null {
  try {
    const raw = JSON.parse(row.rawJson) as unknown;
    if (!isRecord(raw) || !isRecord(raw.providerContextUsage)) return null;
    const value = raw.providerContextUsage;
    if (!isProviderId(value.providerId)
      || !isProductMode(value.productMode)
      || !isNullableString(value.graphScopeId)
      || !isNonEmptyString(value.bindingHash)
      || !isNonEmptyString(value.contextRevision)
      || !isProviderContextUsage(value.usage)) return null;
    return value as unknown as StoredContextUsageEvidence;
  } catch {
    return null;
  }
}

function parseCompaction(row: StoredTopicMessage): StoredContextCompactionEvidence | null {
  try {
    const raw = JSON.parse(row.rawJson) as unknown;
    if (!isRecord(raw) || !isRecord(raw.providerContextCompaction)) return null;
    const value = raw.providerContextCompaction;
    if (!isProviderId(value.providerId)
      || !isProductMode(value.productMode)
      || !isNullableString(value.graphScopeId)
      || !isNonEmptyString(value.bindingHash)
      || !isNonEmptyString(value.contextRevision)
      || !isNonEmptyString(value.clientRequestId)
      || (value.source !== "manual" && value.source !== "automatic")
      || !isContextLifecycle(value.lifecycle)
      || !isIsoTimestamp(value.updatedAt)
      || !(value.lastCompactedAt === null || isIsoTimestamp(value.lastCompactedAt))
      || !(value.diagnostic === undefined || typeof value.diagnostic === "string")) return null;
    return value as unknown as StoredContextCompactionEvidence;
  } catch {
    return null;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function isProviderContextUsage(value: unknown): value is ProviderContextUsage {
  if (!isRecord(value)
    || !isTokenUsageBreakdown(value.total)
    || !isTokenUsageBreakdown(value.last)
    || !isNullableSafeInteger(value.contextUsedTokens, false)
    || !isNullableSafeInteger(value.modelContextWindow, true)
    || !isIsoTimestamp(value.updatedAt)) return false;
  return true;
}

function isTokenUsageBreakdown(value: unknown): boolean {
  return isRecord(value)
    && ["totalTokens", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens"]
      .every((key) => isSafeInteger(value[key], false));
}

function isNullableSafeInteger(value: unknown, positive: boolean): boolean {
  return value === null || isSafeInteger(value, positive);
}

function isSafeInteger(value: unknown, positive: boolean): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= (positive ? 1 : 0);
}

function isContextLifecycle(value: unknown): value is StoredContextLifecycle {
  return value === "submitting" || value === "compacting" || value === "completed" || value === "failed" || value === "interrupted";
}

function isProviderId(value: unknown): value is ProviderId {
  return isNonEmptyString(value);
}

function isProductMode(value: unknown): value is ProductMode {
  return value === "agent" || value === "harness";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
