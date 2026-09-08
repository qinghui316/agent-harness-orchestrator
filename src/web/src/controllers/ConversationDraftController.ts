import type { AgentTurnMode, TopicAttachment, TopicFileReference } from "../types.js";
import type { DraftSubmissionSnapshot } from "./conversation-submission-contract.js";

type StateUpdater<T> = (current: T) => T;

export interface ConversationDraftViewModel {
  text: string;
  contextRefs: TopicFileReference[];
  attachments: TopicAttachment[];
  skillOverrides: Record<string, boolean>;
  agentTurnMode: AgentTurnMode;
  modelId: string | null;
  reasoningEffort: string | null;
}

export interface ConversationDraftStatePort {
  read(): ConversationDraftViewModel;
  setText(update: StateUpdater<string>): void;
  setContextRefs(update: StateUpdater<TopicFileReference[]>): void;
  setAttachments(update: StateUpdater<TopicAttachment[]>): void;
  setSkillOverrides(update: StateUpdater<Record<string, boolean>>): void;
  setAgentTurnMode(value: AgentTurnMode): void;
  setModelId(value: string | null): void;
  setReasoningEffort(value: string | null): void;
  markDirty(): void;
}

export interface ClearAcceptedDraftOptions {
  text?: boolean;
  contextRefs?: boolean;
  attachments?: boolean;
  skillOverrides?: boolean;
}

export interface RestoreSubmissionOptions {
  restoreSkillOverrides?: boolean;
  restoreConfiguration?: boolean;
}

/**
 * Owns in-memory draft reads and value-bound settlement. Persistence and CAS remain owned by
 * ComposerDraftSyncOwner; this owner never performs network or canonical Timeline writes.
 */
export class ConversationDraftController {
  constructor(private readonly port: ConversationDraftStatePort) {}

  read(): ConversationDraftViewModel {
    return cloneDraft(this.port.read());
  }

  updateText(text: string): void {
    this.port.setText(() => text);
    this.port.markDirty();
  }

  updateConfiguration(input: {
    agentTurnMode: AgentTurnMode;
    modelId: string | null;
    reasoningEffort: string | null;
  }): void {
    this.port.setAgentTurnMode(input.agentTurnMode);
    this.port.setModelId(input.modelId);
    this.port.setReasoningEffort(input.reasoningEffort);
    this.port.markDirty();
  }

  clearAcceptedSnapshot(
    snapshot: ConversationDraftViewModel,
    options: ClearAcceptedDraftOptions = { text: true, contextRefs: true, attachments: true, skillOverrides: true },
  ): void {
    if (options.text) this.port.setText((current) => current === snapshot.text ? "" : current);
    if (options.contextRefs) {
      this.port.setContextRefs((current) => sameReferences(current, snapshot.contextRefs) ? [] : current);
    }
    if (options.attachments) {
      this.port.setAttachments((current) => sameAttachments(current, snapshot.attachments) ? [] : current);
    }
    if (options.skillOverrides) {
      this.port.setSkillOverrides((current) => sameOverrides(current, snapshot.skillOverrides) ? {} : current);
    }
  }

  restore(
    snapshot: DraftSubmissionSnapshot,
    attachments: readonly TopicAttachment[],
    options: RestoreSubmissionOptions = {},
  ): void {
    const current = this.port.read();
    const currentDraftIsEmpty = !current.text.trim()
      && current.contextRefs.length === 0
      && current.attachments.length === 0
      && Object.keys(current.skillOverrides).length === 0;
    this.port.setText((value) => mergeRestoredText(value, snapshot.text));
    this.port.setContextRefs((value) => mergeReferences(value, snapshot.contextRefs));
    this.port.setAttachments((value) => mergeAttachments(value, attachments));
    if (options.restoreSkillOverrides) {
      this.port.setSkillOverrides((value) => ({ ...snapshot.skillOverrides, ...value }));
    }
    if (options.restoreConfiguration && snapshot.productMode === "agent" && currentDraftIsEmpty) {
      this.port.setAgentTurnMode(snapshot.agentTurnMode ?? "default");
      this.port.setModelId(snapshot.modelId);
      this.port.setReasoningEffort(snapshot.reasoningEffort);
    }
    this.port.markDirty();
  }
}

function cloneDraft(draft: ConversationDraftViewModel): ConversationDraftViewModel {
  return {
    ...draft,
    contextRefs: draft.contextRefs.map((reference) => ({ ...reference })),
    attachments: draft.attachments.map((attachment) => ({ ...attachment })),
    skillOverrides: { ...draft.skillOverrides },
  };
}

function mergeRestoredText(current: string, restored: string): string {
  const existing = current.trimEnd();
  const recovered = restored.trim();
  if (!existing) return recovered;
  if (!recovered) return current;
  return `${existing}\n\n${recovered}`;
}

function mergeReferences(
  current: readonly TopicFileReference[],
  next: readonly TopicFileReference[],
): TopicFileReference[] {
  const seen = new Set<string>();
  const result: TopicFileReference[] = [];
  for (const reference of [...current, ...next]) {
    const normalized = { ...reference, source: "composer" as const };
    const key = `${normalized.kind}:${normalized.relativePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function mergeAttachments(
  current: readonly TopicAttachment[],
  next: readonly TopicAttachment[],
): TopicAttachment[] {
  const seen = new Set(current.map((attachment) => attachment.id));
  return [...current.map((attachment) => ({ ...attachment })), ...next.flatMap((attachment) => {
    if (seen.has(attachment.id)) return [];
    seen.add(attachment.id);
    return [{ ...attachment }];
  })];
}

function sameReferences(left: readonly TopicFileReference[], right: readonly TopicFileReference[]): boolean {
  return JSON.stringify(mergeReferences([], left)) === JSON.stringify(mergeReferences([], right));
}

function sameAttachments(left: readonly TopicAttachment[], right: readonly TopicAttachment[]): boolean {
  return left.map((attachment) => attachment.id).join("\0") === right.map((attachment) => attachment.id).join("\0");
}

function sameOverrides(left: Readonly<Record<string, boolean>>, right: Readonly<Record<string, boolean>>): boolean {
  const entries = (value: Readonly<Record<string, boolean>>) => Object.entries(value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}
