import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readTopicThreadLog } from "../../thread-log.js";
import type { AssistantTurnActivity, AssistantTurnBlock, TopicThreadEntry } from "../../types.js";
import type { ClarificationRequest, WorkbenchIntakeIteration, WorkbenchIntakeScan } from "../../intake.js";
import type { AuditSummary, ResolvedMemory, RunEvent, RunMetadata, ValidationSummary } from "../../../types/index.js";
import type {
  ThreadStreamAction,
  ThreadStreamEvidence,
  ThreadStreamItem,
  WorkbenchDecisionItem,
  WorkbenchThreadEvent,
  WorkbenchTopicSummary,
} from "../../read-model-types.js";
interface ThreadStreamDraft extends ThreadStreamItem {
  sortKey: number;
  subOrder: number;
}

export async function buildThreadStream(
  memory: ResolvedMemory,
  topic: WorkbenchTopicSummary,
  runs: RunMetadata[],
  validations: unknown[],
  audits: unknown[],
  decisions: WorkbenchDecisionItem[],
): Promise<ThreadStreamItem[]> {
  const items: ThreadStreamDraft[] = [{
    id: `${topic.id}:change-state`,
    kind: "change-state",
    label: topic.state === "archive" ? `Archived: ${topic.title}` : `Topic: ${topic.title}`,
    timestamp: topic.updatedAt ?? topic.createdAt,
    body: topic.path,
    source: "change",
    artifact: topic.path,
    status: topic.state,
    semanticKey: `change:${topic.id}`,
    sortKey: 0,
    subOrder: 0,
  }];
  const messages = await readTopicThreadLog(memory, topic.path).catch(() => []);
  const terminalWorkflowByAction = new Map<string, TopicThreadEntry>();
  const workflowStartedByAction = new Map<string, TopicThreadEntry>();
  const runAnchors = new Map<string, number>();
  const assistantByRun = new Map<string, ThreadStreamDraft>();

  messages.forEach((message, index) => {
    const sortKey = message.position ?? index + 1;
    if (message.type === "workflow.started" && message.actionRunId) {
      workflowStartedByAction.set(message.actionRunId, message);
      return;
    }
    if ((message.type === "workflow.completed" || message.type === "workflow.failed") && message.actionRunId) {
      terminalWorkflowByAction.set(message.actionRunId, message);
      if (message.runId) runAnchors.set(message.runId, sortKey);
      return;
    }
    const mapped = threadItemFromMessage(message, sortKey);
    if (mapped) {
      items.push(mapped);
      if (mapped.kind === "assistant-turn" && mapped.runId) assistantByRun.set(mapped.runId, mapped);
    }
  });

  for (const [actionRunId, started] of workflowStartedByAction) {
    const terminal = terminalWorkflowByAction.get(actionRunId);
    const message = terminal ?? started;
    const sortKey = message.position ?? started.position ?? messages.length + items.length + 1;
    const workflowItem = workflowItemFromMessage(message, sortKey);
    const existing = message.runId ? assistantByRun.get(message.runId) : undefined;
    if (existing) mergeAssistantTurn(existing, workflowItem);
    else {
      items.push(workflowItem);
      if (workflowItem.runId) assistantByRun.set(workflowItem.runId, workflowItem);
    }
    if (message.runId) runAnchors.set(message.runId, sortKey);
  }
  for (const run of runs) {
    if (!runAnchors.has(run.id)) runAnchors.set(run.id, timestampSortKey(run.finishedAt ?? run.startedAt, 3000));
  }

  for (const validation of validations as ValidationSummary[]) {
    const anchor = validation.runId ? runAnchors.get(validation.runId) : undefined;
    const evidence = {
      id: `validation:${validation.id}`,
      label: `Validation ${validation.status}`,
      timestamp: validation.finishedAt,
      body: `${validation.commandCount} command${validation.commandCount === 1 ? "" : "s"} · ${validation.executionMode}`,
      source: "validation",
      status: validation.status,
      runId: validation.runId,
    } satisfies ThreadStreamEvidence;
    const assistant = validation.runId ? assistantByRun.get(validation.runId) : undefined;
    if (assistant) {
      assistant.evidence = [...(assistant.evidence ?? []), evidence];
      assistant.blocks = mergeBlocks(assistant.blocks, [workflowEvidenceBlock(evidence, nextBlockSequence(assistant.blocks), "validation")]);
    } else {
      items.push({
      ...evidence,
      kind: "evidence",
      semanticKey: `validation:${validation.id}`,
      sortKey: anchor !== undefined ? anchor : timestampSortKey(validation.finishedAt, 4000),
      subOrder: 20,
      });
    }
  }
  for (const audit of audits as AuditSummary[]) {
    const anchor = audit.runId ? runAnchors.get(audit.runId) : undefined;
    const evidence = {
      id: `audit:${audit.id}`,
      label: `Audit ${audit.status}`,
      timestamp: audit.finishedAt,
      body: `${audit.findingCount} finding${audit.findingCount === 1 ? "" : "s"}`,
      source: "audit",
      status: audit.status,
      runId: audit.runId,
    } satisfies ThreadStreamEvidence;
    const assistant = audit.runId ? assistantByRun.get(audit.runId) : undefined;
    if (assistant) {
      assistant.evidence = [...(assistant.evidence ?? []), evidence];
      assistant.blocks = mergeBlocks(assistant.blocks, [workflowEvidenceBlock(evidence, nextBlockSequence(assistant.blocks), "audit")]);
    } else {
      items.push({
      ...evidence,
      kind: "evidence",
      semanticKey: `audit:${audit.id}`,
      sortKey: anchor !== undefined ? anchor : timestampSortKey(audit.finishedAt, 5000),
      subOrder: 30,
      });
    }
  }
  for (const decision of decisions.filter((item) => !item.id.startsWith("workflow:"))) {
    items.push({
      id: `decision:${decision.id}`,
      kind: "decision",
      label: decision.label,
      timestamp: decision.completedAt ?? decision.updatedAt,
      body: decision.summary,
      source: "decision",
      artifact: decision.artifact,
      status: decision.status,
      runId: decision.runId,
      semanticKey: `decision:${decision.id}`,
      sortKey: timestampSortKey(decision.completedAt ?? decision.updatedAt, 6000),
      subOrder: 40,
    });
  }

  const actions = await buildPlanCardActions(memory, topic);
  for (const item of items) {
    if (item.kind === "plan-card" || item.planCard) item.actions = actions;
    item.blocks = finalizeAssistantBlocks(item);
  }
  return dedupeThreadItems(items)
    .sort((a, b) => a.sortKey - b.sortKey || a.subOrder - b.subOrder || (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.id.localeCompare(b.id))
    .map(({ sortKey: _sortKey, subOrder: _subOrder, ...item }) => item);
}

function threadItemFromMessage(message: TopicThreadEntry, sortKey: number): ThreadStreamDraft | null {
  if (message.type === "user.message") {
    return {
      id: message.id,
      kind: "user-message",
      label: "User",
      timestamp: message.timestamp,
      body: message.text,
      source: "chat",
      status: message.status,
      runId: message.runId,
      semanticKey: `message:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "assistant.message") {
    return {
      id: message.id,
      kind: "assistant-turn",
      label: "AI",
      timestamp: message.timestamp,
      body: message.text,
      source: "chat",
      artifact: message.artifact,
      status: message.status,
      runId: message.runId,
      activity: message.activity,
      blocks: blocksFromMessage(message),
      semanticKey: `message:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "orchestrator.plan") {
    return {
      id: message.id,
      kind: "assistant-turn",
      label: "Orchestrator plan",
      timestamp: message.timestamp,
      body: message.text,
      source: "chat",
      artifact: message.artifact,
      runId: message.runId,
      planCard: message.planCard,
      activity: message.activity,
      blocks: blocksFromMessage(message),
      semanticKey: `message:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "intake.scan") {
    const intake = parseIntakePayload(message.intake);
    return {
      id: message.id,
      kind: "intake-summary",
      label: "需求分析",
      timestamp: message.timestamp,
      body: message.text,
      source: "intake",
      artifact: message.artifact,
      runId: message.runId,
      intake,
      semanticKey: `intake-scan:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "intake.iteration") {
    const intake = parseIntakePayload(message.intake);
    return {
      id: message.id,
      kind: "intake-summary",
      label: "当前需求理解",
      timestamp: message.timestamp,
      body: message.text,
      source: "intake",
      artifact: message.artifact,
      intake,
      semanticKey: `intake-iteration:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "clarification.request" || message.type === "clarification.answer" || message.type === "clarification.skip") {
    const clarification = parseClarificationPayload(message.clarification);
    return {
      id: message.id,
      kind: "clarification",
      label: message.type === "clarification.request" ? "需要确认" : message.type === "clarification.answer" ? "已回答确认" : "已跳过确认",
      timestamp: message.timestamp,
      body: message.text,
      source: "intake",
      runId: message.runId,
      clarification,
      status: clarification?.status,
      semanticKey: `clarification:${clarification?.id ?? message.id}:${message.type}`,
      sortKey,
      subOrder: 0,
    };
  }
  return null;
}

function parseIntakePayload(value: unknown): ThreadStreamItem["intake"] | undefined {
  if (!isRecord(value)) return undefined;
  const result: ThreadStreamItem["intake"] = {};
  if (isRecord(value.scan)) result.scan = value.scan as unknown as WorkbenchIntakeScan;
  if (isRecord(value.iteration)) result.iteration = value.iteration as unknown as WorkbenchIntakeIteration;
  return result.scan || result.iteration ? result : undefined;
}

function parseClarificationPayload(value: unknown): ClarificationRequest | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.questions)) return undefined;
  return value as unknown as ClarificationRequest;
}

function workflowItemFromMessage(message: TopicThreadEntry, sortKey: number): ThreadStreamDraft {
  const evidence = workflowEvidenceFromMessage(message);
  return {
    id: `assistant-turn:${message.runId ?? message.actionRunId ?? message.id}`,
    kind: "assistant-turn",
    label: workflowLabel(message.actionType, message.status),
    timestamp: message.timestamp,
    body: message.text ?? message.error ?? workflowBody(message.actionType, message.status),
    source: "workflow",
    artifact: message.artifact,
    status: message.status,
    runId: message.runId,
    actionRunId: message.actionRunId,
    activity: message.activity,
    evidence: [evidence],
    blocks: blocksFromMessage(message, evidence),
    semanticKey: `assistant-turn:${message.runId ?? message.actionRunId ?? message.id}`,
    sortKey,
    subOrder: 10,
  };
}

function workflowEvidenceFromMessage(message: TopicThreadEntry): ThreadStreamEvidence {
  return {
    id: `workflow:${message.actionRunId ?? message.id}`,
    label: workflowLabel(message.actionType, message.status),
    source: "workflow",
    timestamp: message.timestamp,
    body: message.error ?? workflowBody(message.actionType, message.status),
    artifact: message.artifact,
    status: message.status,
    runId: message.runId,
    actionRunId: message.actionRunId,
  };
}

function blocksFromMessage(message: TopicThreadEntry, evidence?: ThreadStreamEvidence): AssistantTurnBlock[] | undefined {
  const explicit = normalizeBlocks(message.blocks);
  const blocks: AssistantTurnBlock[] = explicit.length > 0 ? [...explicit] : [];
  const hasExplicitBlocks = blocks.length > 0;
  let sequence = nextBlockSequence(blocks);
  if (blocks.length === 0 && message.text?.trim()) {
    blocks.push({
      id: `legacy-prose:${message.id}`,
      runId: message.runId,
      sequence: sequence++,
      kind: "prose",
      timestamp: message.timestamp,
      source: message.type === "workflow.completed" || message.type === "workflow.failed" ? "workflow" : "legacy",
      title: message.type === "workflow.completed" || message.type === "workflow.failed" ? "执行结果" : undefined,
      text: message.text,
      isError: message.status === "failed",
    });
  }
  if (blocks.length === 0 && message.error?.trim()) {
    blocks.push({
      id: `legacy-error:${message.id}`,
      runId: message.runId,
      sequence: sequence++,
      kind: "error",
      timestamp: message.timestamp,
      source: "workflow",
      title: "执行失败",
      text: message.error,
      isError: true,
    });
  }
  if (!hasExplicitBlocks) {
    for (const block of blocksFromActivity(message.activity, message)) {
      block.sequence = sequence++;
      blocks.push(block);
    }
  }
  if (!hasExplicitBlocks && message.planCard) {
    blocks.push({
      id: `plan-card:${message.id}`,
      runId: message.runId,
      sequence: sequence++,
      kind: "plan-card",
      timestamp: message.timestamp,
      source: "aho",
      title: message.planCard.title,
      text: message.planCard.summary,
      artifactRef: message.artifact,
      planCard: message.planCard,
    });
  }
  if (evidence) {
    blocks.push(workflowEvidenceBlock(evidence, sequence++, evidence.source));
  }
  return blocks.length > 0 ? dedupeBlocks(blocks).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)) : undefined;
}

function normalizeBlocks(blocks: AssistantTurnBlock[] | undefined): AssistantTurnBlock[] {
  return (blocks ?? [])
    .filter((block) => isMainThreadBlock(block))
    .map((block) => ({ ...block, preview: hasInternalRunMetadata(block.preview) ? undefined : block.preview }));
}

function blocksFromActivity(activity: AssistantTurnActivity[] | undefined, message: TopicThreadEntry): AssistantTurnBlock[] {
  const blocks: AssistantTurnBlock[] = [];
  for (const [index, event] of (activity ?? []).entries()) {
    if (event.kind === "assistant-event") {
      const assistantEvent = event.event;
      const kind = assistantEventBlockKind(assistantEvent.kind);
      const block: AssistantTurnBlock = {
        id: `legacy-activity:${message.id}:${index}`,
        runId: assistantEvent.runId ?? message.runId,
        sequence: index + 1,
        kind,
        timestamp: assistantEvent.timestamp ?? event.timestamp,
        source: "codex",
        status: assistantEvent.phase,
        title: assistantEvent.title ?? assistantEventTitle(assistantEvent.kind),
        text: assistantEvent.summary,
        command: assistantEvent.command,
        cwd: assistantEvent.cwd,
        exitCode: assistantEvent.exitCode,
        preview: hasInternalRunMetadata(assistantEvent.preview) ? undefined : assistantEvent.preview,
        artifactRef: assistantEvent.artifactRef,
        isError: assistantEvent.isError,
        truncated: assistantEvent.truncated,
        itemId: assistantEvent.itemId,
      };
      if (isMainThreadBlock(block)) blocks.push(block);
    } else if (event.kind === "tool" && event.tool.phase !== "stderr" && event.tool.command) {
      blocks.push({
        id: `legacy-tool:${message.id}:${index}`,
        runId: event.tool.runId,
        sequence: index + 1,
        kind: "command",
        timestamp: event.timestamp,
        source: "codex",
        status: event.tool.status ?? event.tool.phase,
        title: event.tool.isError ? "命令失败" : event.tool.phase === "started" ? "正在运行命令" : "命令完成",
        command: event.tool.command,
        exitCode: event.tool.exitCode,
        preview: hasInternalRunMetadata(event.tool.outputTail) ? undefined : event.tool.outputTail,
        isError: event.tool.isError,
      });
    } else if (event.kind === "usage") {
      blocks.push({
        id: `legacy-usage:${message.id}:${index}`,
        runId: message.runId,
        sequence: index + 1,
        kind: "usage",
        timestamp: event.timestamp,
        source: "codex",
        title: "用量",
        text: formatUsageSummary(event.usage),
      });
    } else if (event.kind === "error") {
      blocks.push({
        id: `legacy-error:${message.id}:${index}`,
        runId: message.runId,
        sequence: index + 1,
        kind: "error",
        timestamp: event.timestamp,
        source: "codex",
        title: "错误",
        text: event.message,
        isError: true,
      });
    }
  }
  return blocks;
}

function workflowEvidenceBlock(evidence: ThreadStreamEvidence, sequence: number, source: AssistantTurnBlock["source"]): AssistantTurnBlock {
  return {
    id: `evidence-block:${evidence.id}`,
    runId: evidence.runId,
    sequence,
    kind: "workflow-evidence",
    timestamp: evidence.timestamp ?? new Date().toISOString(),
    source,
    status: evidence.status,
    title: evidenceLabel(evidence),
    text: evidence.body,
    artifactRef: evidence.artifact,
    isError: evidence.status === "failed" || evidence.status === "blocked",
  };
}

function finalizeAssistantBlocks(item: ThreadStreamItem): AssistantTurnBlock[] | undefined {
  if (item.kind !== "assistant-turn" && item.kind !== "plan-card") return item.blocks;
  let blocks = normalizeBlocks(item.blocks);
  let sequence = nextBlockSequence(blocks);
  if (blocks.length === 0 && item.body?.trim()) {
    blocks.push({
      id: `final-prose:${item.id}`,
      runId: item.runId,
      sequence: sequence++,
      kind: "prose",
      timestamp: item.timestamp ?? new Date().toISOString(),
      source: item.source === "workflow" ? "workflow" : "legacy",
      title: item.source === "workflow" ? "执行结果" : undefined,
      text: item.body,
      isError: item.status === "failed",
    });
  }
  for (const evidence of item.evidence ?? []) {
    blocks.push(workflowEvidenceBlock(evidence, sequence++, evidence.source));
  }
  blocks = dedupeBlocks(blocks).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  return blocks.length > 0 ? blocks : undefined;
}

function mergeBlocks(left: AssistantTurnBlock[] | undefined, right: AssistantTurnBlock[] | undefined): AssistantTurnBlock[] | undefined {
  const merged = dedupeBlocks([...(left ?? []), ...(right ?? [])]);
  if (merged.length === 0) return undefined;
  return merged.sort((a, b) => a.sequence - b.sequence || (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.id.localeCompare(b.id));
}

function dedupeBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const byKey = new Map<string, AssistantTurnBlock>();
  for (const block of blocks) {
    const key = assistantBlockSemanticKey(block);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeAssistantBlock(existing, block) : block);
  }
  return [...byKey.values()];
}

function mergeAssistantBlock(existing: AssistantTurnBlock, incoming: AssistantTurnBlock): AssistantTurnBlock {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    sequence: existing.sequence,
    timestamp: existing.timestamp,
    text: incoming.text ?? existing.text,
    preview: incoming.preview ?? existing.preview,
    title: incoming.title ?? existing.title,
    status: incoming.status ?? existing.status,
    command: incoming.command ?? existing.command,
    cwd: incoming.cwd ?? existing.cwd,
    exitCode: incoming.exitCode ?? existing.exitCode,
    artifactRef: incoming.artifactRef ?? existing.artifactRef,
    truncated: incoming.truncated ?? existing.truncated,
    isError: incoming.isError ?? existing.isError,
  };
}

function assistantBlockSemanticKey(block: AssistantTurnBlock): string {
  const runId = block.runId ?? "";
  if (block.kind === "usage") return `usage:${runId}`;
  if (block.kind === "error") return `error:${runId}:${normalizeBlockText(block.text ?? block.preview ?? block.title)}`;
  if (block.kind === "workflow-evidence") return `workflow-evidence:${runId}:${block.artifactRef ?? block.title ?? block.status ?? block.id}`;
  if (block.kind === "command") {
    if (block.itemId) return `command:${runId}:item:${block.itemId}`;
    return `command:${runId}:command:${normalizeCommandKey(block.command)}`;
  }
  return block.itemId ? `${block.kind}:${runId}:item:${block.itemId}` : `${block.id}:${block.kind}`;
}

function normalizeCommandKey(command: string | undefined): string {
  return (command ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function nextBlockSequence(blocks: AssistantTurnBlock[] | undefined): number {
  const max = Math.max(0, ...(blocks ?? []).map((block) => block.sequence));
  return max + 1;
}

function isMainThreadBlock(block: AssistantTurnBlock): boolean {
  if (block.kind !== "status") return true;
  const normalized = `${block.title ?? ""} ${block.text ?? ""} ${block.status ?? ""}`.toLowerCase();
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  return Boolean(block.isError) || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

function assistantEventBlockKind(kind: string): AssistantTurnBlock["kind"] {
  if (kind === "reasoning-summary") return "reasoning-summary";
  if (kind === "command") return "command";
  if (kind === "file-change") return "file-change";
  if (kind === "usage") return "usage";
  if (kind === "error") return "error";
  if (kind === "status") return "status";
  return "tool-result";
}

function assistantEventTitle(kind: string): string {
  if (kind === "reasoning-summary") return "工作摘要";
  if (kind === "command") return "命令";
  if (kind === "file-change") return "文件变更";
  if (kind === "mcp-tool") return "工具调用";
  if (kind === "web-search") return "网页搜索";
  if (kind === "plan-update") return "计划更新";
  if (kind === "usage") return "用量";
  if (kind === "error") return "错误";
  return "运行状态";
}

function evidenceLabel(item: ThreadStreamEvidence): string {
  if (item.source === "validation") return `验证：${item.status ?? item.label}`;
  if (item.source === "audit") return `审查：${item.status ?? item.label}`;
  if (item.source === "workflow") return "执行结果";
  if (item.source === "decision") return "决策";
  return item.label;
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? pieces.join(" · ") : "Usage recorded.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasInternalRunMetadata(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  const artifactSignals = ["codex-events.jsonl", "events.jsonl", "stdout.log", "stderr.log", "last-message.md"];
  const hasArtifactSignal = artifactSignals.some((signal) => normalized.includes(signal));
  const hasRunMetadataShape = normalized.includes('"runtime"') && normalized.includes('"artifacts"') && normalized.includes('"promptstack"');
  const hasCodexInvocation = normalized.includes('"command"') && normalized.includes('"codex"') && normalized.includes("--output-last-message");
  return hasRunMetadataShape || hasCodexInvocation || (hasArtifactSignal && normalized.includes('"artifacts"'));
}

function mergeAssistantTurn(target: ThreadStreamDraft, incoming: ThreadStreamDraft): void {
  target.actionRunId = target.actionRunId ?? incoming.actionRunId;
  target.status = target.status ?? incoming.status;
  target.artifact = target.artifact ?? incoming.artifact;
  if (!target.body?.trim() && incoming.body?.trim()) target.body = incoming.body;
  target.activity = mergeActivity(target.activity, incoming.activity);
  target.evidence = mergeEvidence(target.evidence, incoming.evidence);
  target.blocks = mergeBlocks(target.blocks, incoming.blocks);
}

function mergeActivity(left: AssistantTurnActivity[] | undefined, right: AssistantTurnActivity[] | undefined): AssistantTurnActivity[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])];
  if (merged.length === 0) return undefined;
  const seen = new Set<string>();
  return merged.filter((event) => {
    const key = JSON.stringify(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeEvidence(left: ThreadStreamEvidence[] | undefined, right: ThreadStreamEvidence[] | undefined): ThreadStreamEvidence[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])];
  if (merged.length === 0) return undefined;
  const seen = new Set<string>();
  return merged.filter((event) => {
    const key = event.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildPlanCardActions(memory: ResolvedMemory, topic: WorkbenchTopicSummary): Promise<ThreadStreamAction[]> {
  const specReady = await isConcreteChangeFile(memory, topic.path, "spec.md");
  const planReady = await isConcreteChangeFile(memory, topic.path, "plan.md");
  const tasksReady = await isConcreteChangeFile(memory, topic.path, "tasks.md");
  return [
    {
      actionType: "change.spec.propose",
      label: "生成 Spec",
      enabled: topic.state === "active" && !specReady,
      requiresConfirmation: true,
      disabledReason: specReady ? "需求说明已存在" : topic.state === "active" ? undefined : "归档或暂停的需求对话不能执行动作",
    },
    {
      actionType: "change.plan.propose",
      label: "生成 Plan",
      enabled: topic.state === "active" && specReady && !planReady,
      requiresConfirmation: true,
      disabledReason: !specReady ? "先生成并接受需求说明" : planReady ? "执行方案已存在" : topic.state === "active" ? undefined : "归档或暂停的需求对话不能执行动作",
    },
    {
      actionType: "change.plan.propose",
      label: "生成 Tasks",
      enabled: topic.state === "active" && specReady && planReady && !tasksReady,
      requiresConfirmation: true,
      disabledReason: !specReady ? "先生成并接受需求说明" : !planReady ? "先生成执行方案" : tasksReady ? "任务清单已存在" : topic.state === "active" ? undefined : "归档或暂停的需求对话不能执行动作",
    },
    {
      actionType: "planning.decompose",
      label: "拆分评估",
      enabled: topic.state === "active" && specReady && planReady && tasksReady,
      requiresConfirmation: true,
      disabledReason: !specReady ? "先生成并接受需求说明" : !planReady ? "先生成执行方案" : !tasksReady ? "先生成任务清单" : topic.state === "active" ? undefined : "归档或暂停的需求对话不能执行动作",
    },
    {
      actionType: "code.run",
      label: "运行 Code",
      enabled: topic.state === "active" && specReady && planReady && tasksReady,
      requiresConfirmation: true,
      disabledReason: !specReady ? "先生成并接受需求说明" : !planReady ? "先生成并接受执行方案" : !tasksReady ? "先生成任务清单" : topic.state === "active" ? undefined : "归档或暂停的需求对话不能执行动作",
    },
  ];
}

export async function isConcreteChangeFile(memory: ResolvedMemory, changePath: string, fileName: "spec.md" | "plan.md" | "tasks.md"): Promise<boolean> {
  const path = join(memory.memoryRoot, changePath, fileName);
  if (!existsSync(path)) return false;
  const content = await readFile(path, "utf8").catch(() => "");
  if (!content.trim()) return false;
  return !/^\s*(?:(?:[-*]|\d+[.)])\s*)?(?:\[\s\]\s*)?(?:T-\d{3,}:\s*)?TBD\.?\s*$/im.test(content);
}

function workflowLabel(actionType: string | undefined, status: string | undefined): string {
  const label = actionType ? workflowActionLabel(actionType) : "Workflow action";
  if (status === "failed") return `${label} failed`;
  if (status === "running") return `${label} running`;
  return `${label} completed`;
}

function workflowBody(actionType: string | undefined, status: string | undefined): string {
  if (status === "running") return "The action has started and is waiting for a terminal result.";
  if (status === "failed") return "The action failed. See Run Replay for low-level events and artifacts.";
  if (actionType === "code.run") return "Coder, validation, and audit ran as the sequential confirmed workflow.";
  return "The confirmed workflow action completed.";
}

function workflowActionLabel(actionType: string): string {
  switch (actionType) {
    case "change.spec.propose": return "Spec proposal";
    case "change.spec.accept": return "Spec acceptance";
    case "change.plan.propose": return "Plan/Tasks proposal";
    case "change.plan.accept": return "Plan/Tasks acceptance";
    case "planning.decomposition.assess-readiness": return "Decomposition readiness";
    case "planning.taskqueue.propose": return "TaskQueue proposal";
    case "planning.scheduler.plan.prepare": return "Parallel execution plan prepare";
    case "planning.scheduler.contract.compile": return "SchedulerContract compile";
    case "planning.scheduler.dispatch.dry-run": return "Scheduler dispatch dry-run";
    case "planning.scheduler.worker-plan.compile": return "Scheduler worker session plan compile";
    case "planning.scheduler.claim-reconcile.compile": return "Scheduler claim/reconcile plan compile";
    case "planning.scheduler.launch-preflight.check": return "Scheduler launch preflight check";
    case "planning.scheduler.run.prepare": return "SchedulerRun prepare";
    case "planning.scheduler.runtime.initialize": return "Scheduler runtime initialize";
    case "planning.scheduler.runtime.reconcile": return "Scheduler runtime reconcile";
    case "planning.scheduler.runtime.reserve-claims": return "Scheduler runtime claim reservation";
    case "planning.scheduler.worker.start-first": return "Scheduler first worker start";
    case "planning.scheduler.worker.reconcile-result": return "Scheduler first worker result reconcile";
    case "planning.scheduler.worker.validate-first": return "Scheduler first worker validation";
    case "planning.scheduler.worker.audit-first": return "Scheduler first worker audit";
    case "planning.scheduler.worker.rework-plan.compile": return "Scheduler first worker rework plan";
    case "planning.scheduler.worker.rework-start-first": return "Scheduler first worker rework start";
    case "planning.scheduler.worker.rework-reconcile-result": return "Scheduler first worker rework result";
    case "planning.scheduler.worker.rework-validate-first": return "Scheduler first worker rework validation";
    case "planning.workflowgraph.compile": return "WorkflowGraphPlan compile";
    case "planning.taskqueue.confirm-start": return "TaskQueue start confirmation";
    case "code.run": return "Code workflow";
    case "validate.run": return "Validation";
    case "audit.run": return "Audit";
    case "spec-test.drift": return "Spec-Test drift";
    default: return actionType;
  }
}

function timestampSortKey(timestamp: string | undefined, offset: number): number {
  const millis = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(millis) ? 100000 + millis / 1000 + offset : 100000 + offset;
}

function dedupeThreadItems(items: ThreadStreamDraft[]): ThreadStreamDraft[] {
  const seen = new Set<string>();
  const result: ThreadStreamDraft[] = [];
  for (const item of items) {
    const key = item.semanticKey ?? item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export async function readRunEvents(memory: ResolvedMemory, run: RunMetadata): Promise<WorkbenchThreadEvent[]> {
  const eventsPath = join(memory.runsRoot, run.id, "events.jsonl");
  if (!existsSync(eventsPath)) return [];
  const content = await readFile(eventsPath, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => parseRunEventLine(line, index, run))
    .filter((item): item is WorkbenchThreadEvent => item !== null);
}

function parseRunEventLine(line: string, index: number, run: RunMetadata): WorkbenchThreadEvent | null {
  try {
    const event = JSON.parse(line) as RunEvent;
    return {
      id: `${run.id}:event:${index}`,
      type: event.type,
      label: event.type,
      timestamp: event.timestamp,
      source: sourceForEvent(event.type),
      artifact: run.artifacts.directory,
      status: typeof event.data?.status === "string" ? event.data.status : undefined,
      runId: run.id,
    };
  } catch {
    return null;
  }
}

function sourceForEvent(type: string): WorkbenchThreadEvent["source"] {
  if (type.startsWith("validation.")) return "validation";
  if (type.startsWith("audit.")) return "audit";
  if (type.startsWith("worktree.")) return "worktree";
  if (type.startsWith("spec-test.")) return "spec-test";
  return "run";
}


