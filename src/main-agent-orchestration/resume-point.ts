import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";

export type MainAgentResumePointAuthority = "non-executing-main-agent-resume-point";
export type MainAgentResumePointLane = "scoped-local-automation" | "controlled-scheduler" | "manual-gate";
export type MainAgentResumePointStopReason =
  | "user-rejected"
  | "user-stopped"
  | "discarded"
  | "feedback-provided"
  | "budget-limited"
  | "blocked"
  | "stale";

export interface MainAgentResumePointGateSnapshot {
  kind: "workflow-action" | "approval-action" | "manual" | "none" | "unknown";
  actionType?: string;
  approvalActionId?: string;
  changeId?: string;
  targetIds: string[];
  scope: Record<string, unknown>;
}

export interface MainAgentResumeKeyInput {
  changeId: string;
  lane: MainAgentResumePointLane;
  gate?: MainAgentResumePointGateSnapshot | null;
  targetRefs?: Record<string, unknown>;
  acceptedArtifactHashes?: Record<string, unknown>;
  sourceState?: Record<string, unknown>;
  goalLoopRefs?: Record<string, unknown>;
  workflowRefs?: Record<string, unknown>;
  schedulerRefs?: Record<string, unknown>;
  roleRefs?: Record<string, unknown>;
  runtimePolicy?: Record<string, unknown>;
  worktreeBase?: Record<string, unknown>;
  feedbackHash?: string | null;
}

export interface MainAgentResumePointRefs {
  automationAuthorizationIds: string[];
  automationRunIds: string[];
  automationIterationIds: string[];
  goalLoopFeedbackIds: string[];
  goalLoopNextStepPacketIds: string[];
  goalLoopControllerPolicyIds: string[];
  goalLoopGateReadinessPreflightIds: string[];
  workflowRunIds: string[];
  taskQueueRunIds: string[];
  taskQueueItemIds: string[];
  taskRunIds: string[];
  schedulerRunIds: string[];
  workerLeaseIds: string[];
  integrationCheckIds: string[];
  agentTaskIds: string[];
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
}

export interface MainAgentResumePoint {
  version: "1.0";
  authority: MainAgentResumePointAuthority;
  executionStarted: false;
  id: string;
  ref: string;
  changeId: string;
  projectId: string | null;
  lane: MainAgentResumePointLane;
  stopReason: MainAgentResumePointStopReason;
  sourceStopReason?: string;
  summary: string;
  stableResumeKey: string;
  resumeKeyInput: Record<string, unknown>;
  currentGate: MainAgentResumePointGateSnapshot;
  reusableEvidenceRefs: string[];
  mustRevalidate: string[];
  forbiddenActions: string[];
  nextOwner: "main-agent" | "goal-loop" | "task-queue" | "controlled-scheduler" | "human";
  refs: MainAgentResumePointRefs;
  artifact: string;
  createdAt: string;
}

export interface RecordMainAgentResumePointInput {
  projectId?: string | null;
  changeId: string;
  lane: MainAgentResumePointLane;
  stopReason: MainAgentResumePointStopReason;
  sourceStopReason?: string;
  summary: string;
  resumeKeyInput: MainAgentResumeKeyInput;
  currentGate?: MainAgentResumePointGateSnapshot | null;
  reusableEvidenceRefs?: string[];
  mustRevalidate?: string[];
  forbiddenActions?: string[];
  nextOwner?: MainAgentResumePoint["nextOwner"];
  refs?: Partial<MainAgentResumePointRefs>;
}

export interface RecordScopedAutomationMainAgentResumePointInput {
  projectId: string;
  changeId: string;
  sourceStopReason: string;
  summary: string;
  requestedGate: Record<string, unknown>;
  currentGate?: MainAgentResumePointGateSnapshot | null;
  sourceState?: Record<string, unknown>;
  acceptedArtifactHashes?: Record<string, unknown>;
  automationAuthorizationId: string;
  automationRunId: string;
  automationIterationIds?: string[];
  artifactRefs?: string[];
}

export interface BindMainAgentResumePointResult {
  status: "bound" | "missing" | "scope-mismatch" | "key-mismatch" | "stale" | "blocked";
  reason: string;
  resumePoint?: MainAgentResumePoint;
  expectedStableResumeKey: string;
}

export interface BindMainAgentResumePointOptions {
  projectId?: string | null;
}

const gateSnapshotSchema = z.object({
  kind: z.enum(["workflow-action", "approval-action", "manual", "none", "unknown"]),
  actionType: z.string().optional(),
  approvalActionId: z.string().optional(),
  changeId: z.string().optional(),
  targetIds: z.array(z.string()),
  scope: z.record(z.unknown()),
});

const refsSchema = z.object({
  automationAuthorizationIds: z.array(z.string()),
  automationRunIds: z.array(z.string()),
  automationIterationIds: z.array(z.string()),
  goalLoopFeedbackIds: z.array(z.string()),
  goalLoopNextStepPacketIds: z.array(z.string()),
  goalLoopControllerPolicyIds: z.array(z.string()),
  goalLoopGateReadinessPreflightIds: z.array(z.string()),
  workflowRunIds: z.array(z.string()),
  taskQueueRunIds: z.array(z.string()),
  taskQueueItemIds: z.array(z.string()),
  taskRunIds: z.array(z.string()),
  schedulerRunIds: z.array(z.string()),
  workerLeaseIds: z.array(z.string()),
  integrationCheckIds: z.array(z.string()),
  agentTaskIds: z.array(z.string()),
  runIds: z.array(z.string()),
  validationIds: z.array(z.string()),
  auditIds: z.array(z.string()),
});

const resumePointSchema = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-main-agent-resume-point"),
  executionStarted: z.literal(false),
  id: z.string(),
  ref: z.string(),
  changeId: z.string(),
  projectId: z.string().nullable(),
  lane: z.enum(["scoped-local-automation", "controlled-scheduler", "manual-gate"]),
  stopReason: z.enum(["user-rejected", "user-stopped", "discarded", "feedback-provided", "budget-limited", "blocked", "stale"]),
  sourceStopReason: z.string().optional(),
  summary: z.string(),
  stableResumeKey: z.string(),
  resumeKeyInput: z.record(z.unknown()),
  currentGate: gateSnapshotSchema,
  reusableEvidenceRefs: z.array(z.string()),
  mustRevalidate: z.array(z.string()),
  forbiddenActions: z.array(z.string()),
  nextOwner: z.enum(["main-agent", "goal-loop", "task-queue", "controlled-scheduler", "human"]),
  refs: refsSchema,
  artifact: z.string(),
  createdAt: z.string(),
});

export function mainAgentResumePointsPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "main-agent-resume-points", "resume-points.jsonl");
}

export function mainAgentResumePointRef(memory: ResolvedMemory, changePath: string, id: string): string {
  return `${displayMemoryPath(memory, mainAgentResumePointsPath(memory, changePath))}#${id}`;
}

export function createMainAgentStableResumeKey(input: MainAgentResumeKeyInput): string {
  return createHash("sha256").update(stableStringify(normalizeForKey(input))).digest("hex");
}

export async function recordMainAgentResumePoint(
  memory: ResolvedMemory,
  changePath: string,
  input: RecordMainAgentResumePointInput,
): Promise<MainAgentResumePoint> {
  assertResumePointInputScope(input);
  const now = new Date().toISOString();
  const normalizedKeyInput = normalizeForKey(input.resumeKeyInput) as Record<string, unknown>;
  const stableResumeKey = createHash("sha256").update(stableStringify(normalizedKeyInput)).digest("hex");
  const id = `resume-point-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${input.changeId}:${input.lane}:${input.stopReason}:${stableResumeKey}`)}`;
  const artifact = mainAgentResumePointRef(memory, changePath, id);
  const point: MainAgentResumePoint = {
    version: "1.0",
    authority: "non-executing-main-agent-resume-point",
    executionStarted: false,
    id,
    ref: artifact,
    changeId: input.changeId,
    projectId: input.projectId ?? null,
    lane: input.lane,
    stopReason: input.stopReason,
    sourceStopReason: input.sourceStopReason,
    summary: truncate(input.summary),
    stableResumeKey,
    resumeKeyInput: normalizedKeyInput,
    currentGate: normalizeGateSnapshot(input.currentGate ?? input.resumeKeyInput.gate ?? emptyGateSnapshot()),
    reusableEvidenceRefs: dedupeStrings(input.reusableEvidenceRefs ?? []),
    mustRevalidate: dedupeStrings(input.mustRevalidate ?? defaultMustRevalidate()),
    forbiddenActions: dedupeStrings(input.forbiddenActions ?? defaultForbiddenActions()),
    nextOwner: input.nextOwner ?? nextOwnerForLane(input.lane),
    refs: normalizeRefs(input.refs),
    artifact,
    createdAt: now,
  };
  const path = mainAgentResumePointsPath(memory, changePath);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(point)}\n`, "utf8");
  return point;
}

export async function recordScopedAutomationMainAgentResumePoint(
  memory: ResolvedMemory,
  changePath: string,
  input: RecordScopedAutomationMainAgentResumePointInput,
): Promise<MainAgentResumePoint> {
  return recordMainAgentResumePoint(memory, changePath, {
    projectId: input.projectId,
    changeId: input.changeId,
    lane: "scoped-local-automation",
    stopReason: resumeStopReasonForAutomation(input.sourceStopReason),
    sourceStopReason: input.sourceStopReason,
    summary: input.summary,
    currentGate: input.currentGate ?? null,
    resumeKeyInput: {
      changeId: input.changeId,
      lane: "scoped-local-automation",
      gate: input.currentGate ?? emptyGateSnapshot(),
      acceptedArtifactHashes: input.acceptedArtifactHashes,
      sourceState: input.sourceState,
      runtimePolicy: {
        automationMode: "full-access",
        authorizationAuthority: "human-confirmed-scoped-automation-authorization",
      },
    },
    reusableEvidenceRefs: input.artifactRefs,
    refs: {
      automationAuthorizationIds: [input.automationAuthorizationId],
      automationRunIds: [input.automationRunId],
      automationIterationIds: input.automationIterationIds ?? [],
    },
  });
}

export async function recordManualGateMainAgentResumePoint(
  memory: ResolvedMemory,
  changePath: string,
  input: Omit<RecordMainAgentResumePointInput, "lane">,
): Promise<MainAgentResumePoint> {
  return recordMainAgentResumePoint(memory, changePath, {
    ...input,
    lane: "manual-gate",
    resumeKeyInput: {
      ...input.resumeKeyInput,
      changeId: input.changeId,
      lane: "manual-gate",
    },
  });
}

export async function readMainAgentResumePoints(
  memory: ResolvedMemory,
  changePath: string,
): Promise<MainAgentResumePoint[]> {
  const path = mainAgentResumePointsPath(memory, changePath);
  if (!existsSync(path)) return [];
  try {
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const points: MainAgentResumePoint[] = [];
    for (const line of lines) {
      const parsed = resumePointSchema.safeParse(JSON.parse(line));
      if (!parsed.success) return [];
      points.push(parsed.data);
    }
    return points;
  } catch {
    return [];
  }
}

export async function bindLatestMainAgentResumePoint(
  memory: ResolvedMemory,
  changePath: string,
  input: MainAgentResumeKeyInput,
  options: BindMainAgentResumePointOptions = {},
): Promise<BindMainAgentResumePointResult> {
  const expectedStableResumeKey = createMainAgentStableResumeKey(input);
  const readResult = await readMainAgentResumePointsForBinding(memory, changePath);
  if (readResult.status === "blocked") {
    return { status: "blocked", reason: readResult.reason, expectedStableResumeKey };
  }
  const points = readResult.points;
  const latest = [...points].reverse().find((point) => point.changeId === input.changeId);
  if (!latest) {
    return { status: "missing", reason: "No resume point exists for the selected Change.", expectedStableResumeKey };
  }
  if (options.projectId !== undefined && latest.projectId !== (options.projectId ?? null)) {
    return { status: "scope-mismatch", reason: "Latest resume point project scope does not match the selected project.", expectedStableResumeKey, resumePoint: latest };
  }
  if (latest.resumeKeyInput.changeId !== input.changeId) {
    return { status: "scope-mismatch", reason: "Latest resume point scope does not match the selected Change.", expectedStableResumeKey, resumePoint: latest };
  }
  if (latest.resumeKeyInput.lane !== input.lane) {
    return { status: "scope-mismatch", reason: "Latest resume point lane does not match current resume lane.", expectedStableResumeKey, resumePoint: latest };
  }
  const latestGate = latest.currentGate;
  const inputGate = normalizeGateSnapshot(input.gate ?? emptyGateSnapshot());
  const gateScope = compareGateSnapshots(latestGate, inputGate, input.changeId);
  if (gateScope !== "match") {
    return { status: "scope-mismatch", reason: gateScope, expectedStableResumeKey, resumePoint: latest };
  }
  if (latest.stableResumeKey !== expectedStableResumeKey) {
    return { status: classifyStableKeyMismatch(latest, input), reason: "Latest resume point stable key does not match current evidence.", expectedStableResumeKey, resumePoint: latest };
  }
  return { status: "bound", reason: "Latest resume point matches current evidence.", expectedStableResumeKey, resumePoint: latest };
}

export function sanitizeMainAgentResumeGateScope(scope: Record<string, unknown>): Record<string, unknown> {
  return sanitizeObject(scope);
}

function resumeStopReasonForAutomation(reason: string): MainAgentResumePointStopReason {
  switch (reason) {
    case "max-steps":
      return "budget-limited";
    case "stale-target":
    case "source-drift":
    case "accepted-artifact-drift":
      return "stale";
    default:
      return "blocked";
  }
}

function nextOwnerForLane(lane: MainAgentResumePointLane): MainAgentResumePoint["nextOwner"] {
  if (lane === "controlled-scheduler") return "controlled-scheduler";
  if (lane === "manual-gate") return "human";
  return "main-agent";
}

function normalizeRefs(refs: Partial<MainAgentResumePointRefs> | undefined): MainAgentResumePointRefs {
  return {
    automationAuthorizationIds: dedupeStrings(refs?.automationAuthorizationIds ?? []),
    automationRunIds: dedupeStrings(refs?.automationRunIds ?? []),
    automationIterationIds: dedupeStrings(refs?.automationIterationIds ?? []),
    goalLoopFeedbackIds: dedupeStrings(refs?.goalLoopFeedbackIds ?? []),
    goalLoopNextStepPacketIds: dedupeStrings(refs?.goalLoopNextStepPacketIds ?? []),
    goalLoopControllerPolicyIds: dedupeStrings(refs?.goalLoopControllerPolicyIds ?? []),
    goalLoopGateReadinessPreflightIds: dedupeStrings(refs?.goalLoopGateReadinessPreflightIds ?? []),
    workflowRunIds: dedupeStrings(refs?.workflowRunIds ?? []),
    taskQueueRunIds: dedupeStrings(refs?.taskQueueRunIds ?? []),
    taskQueueItemIds: dedupeStrings(refs?.taskQueueItemIds ?? []),
    taskRunIds: dedupeStrings(refs?.taskRunIds ?? []),
    schedulerRunIds: dedupeStrings(refs?.schedulerRunIds ?? []),
    workerLeaseIds: dedupeStrings(refs?.workerLeaseIds ?? []),
    integrationCheckIds: dedupeStrings(refs?.integrationCheckIds ?? []),
    agentTaskIds: dedupeStrings(refs?.agentTaskIds ?? []),
    runIds: dedupeStrings(refs?.runIds ?? []),
    validationIds: dedupeStrings(refs?.validationIds ?? []),
    auditIds: dedupeStrings(refs?.auditIds ?? []),
  };
}

async function readMainAgentResumePointsForBinding(
  memory: ResolvedMemory,
  changePath: string,
): Promise<{ status: "ok"; points: MainAgentResumePoint[] } | { status: "blocked"; reason: string }> {
  const path = mainAgentResumePointsPath(memory, changePath);
  if (!existsSync(path)) return { status: "ok", points: [] };
  try {
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const points: MainAgentResumePoint[] = [];
    for (const line of lines) {
      const parsedJson = JSON.parse(line);
      const parsed = resumePointSchema.safeParse(parsedJson);
      if (!parsed.success) return { status: "blocked", reason: "Resume point evidence is malformed or uses an unsupported schema." };
      points.push(parsed.data);
    }
    return { status: "ok", points };
  } catch {
    return { status: "blocked", reason: "Resume point evidence could not be read safely." };
  }
}

function assertResumePointInputScope(input: RecordMainAgentResumePointInput): void {
  if (input.resumeKeyInput.changeId !== input.changeId) {
    throw new Error("MainAgentResumePoint changeId scope mismatch.");
  }
  if (input.resumeKeyInput.lane !== input.lane) {
    throw new Error("MainAgentResumePoint lane scope mismatch.");
  }
  const keyGate = input.resumeKeyInput.gate ? normalizeGateSnapshot(input.resumeKeyInput.gate) : null;
  const currentGate = input.currentGate ? normalizeGateSnapshot(input.currentGate) : keyGate;
  if (keyGate) assertGateMatchesChange(input.changeId, keyGate, "resume key gate");
  if (currentGate) assertGateMatchesChange(input.changeId, currentGate, "current gate");
  if (keyGate && currentGate) {
    const compare = compareGateSnapshots(currentGate, keyGate, input.changeId);
    if (compare !== "match") throw new Error(`MainAgentResumePoint gate scope mismatch: ${compare}`);
  }
}

function assertGateMatchesChange(changeId: string, gate: MainAgentResumePointGateSnapshot, label: string): void {
  if (gate.changeId && gate.changeId !== changeId) {
    throw new Error(`MainAgentResumePoint ${label} Change scope mismatch.`);
  }
  if (gate.kind === "workflow-action" && !gate.actionType) {
    throw new Error(`MainAgentResumePoint ${label} requires actionType.`);
  }
  if (gate.kind === "approval-action" && !gate.approvalActionId) {
    throw new Error(`MainAgentResumePoint ${label} requires approvalActionId.`);
  }
}

function compareGateSnapshots(
  left: MainAgentResumePointGateSnapshot,
  right: MainAgentResumePointGateSnapshot,
  changeId: string,
): "match" | string {
  if (left.changeId && left.changeId !== changeId) return "left gate Change scope mismatch.";
  if (right.changeId && right.changeId !== changeId) return "right gate Change scope mismatch.";
  if (left.kind !== right.kind) return "gate kind mismatch.";
  if ((left.actionType ?? null) !== (right.actionType ?? null)) return "gate actionType mismatch.";
  if ((left.approvalActionId ?? null) !== (right.approvalActionId ?? null)) return "gate approvalActionId mismatch.";
  if (!sameStringSet(left.targetIds, right.targetIds)) return "gate target id mismatch.";
  return "match";
}

function classifyStableKeyMismatch(
  latest: MainAgentResumePoint,
  input: MainAgentResumeKeyInput,
): BindMainAgentResumePointResult["status"] {
  const latestInput = latest.resumeKeyInput as Record<string, unknown>;
  if (!sameStableField(latestInput.sourceState, input.sourceState)) return "stale";
  if (!sameStableField(latestInput.acceptedArtifactHashes, input.acceptedArtifactHashes)) return "stale";
  if (!sameStableField(latestInput.runtimePolicy, input.runtimePolicy)) return "stale";
  if (!sameStableField(latestInput.worktreeBase, input.worktreeBase)) return "stale";
  if (!sameStableField(latestInput.feedbackHash, input.feedbackHash)) return "stale";
  return "key-mismatch";
}

function emptyGateSnapshot(): MainAgentResumePointGateSnapshot {
  return { kind: "none", targetIds: [], scope: {} };
}

function normalizeGateSnapshot(gate: MainAgentResumePointGateSnapshot): MainAgentResumePointGateSnapshot {
  return {
    kind: gate.kind,
    actionType: gate.actionType,
    approvalActionId: gate.approvalActionId,
    changeId: gate.changeId,
    targetIds: dedupeStrings(gate.targetIds),
    scope: sanitizeMainAgentResumeGateScope(gate.scope),
  };
}

function defaultMustRevalidate(): string[] {
  return [
    "current-visible-gate",
    "target-ids",
    "source-state",
    "accepted-artifact-hashes",
    "tool-policy",
  ];
}

function defaultForbiddenActions(): string[] {
  return [
    "raw-scheduler",
    "manual-integration-check-auto-consume",
    "integration-apply-discard-auto-consume",
    "remote",
    "pr",
    "merge",
    "harness-evolution",
  ];
}

function normalizeForKey(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeForKey);
    if (normalized.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      return [...new Set(normalized.map((item) => JSON.stringify(item)))].sort().map((item) => JSON.parse(item));
    }
    return normalized;
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if ([
      "timestamp",
      "createdAt",
      "updatedAt",
      "capturedAt",
      "label",
      "text",
      "summary",
      "prose",
      "action",
      "options",
      "payload",
      "confirmationPayload",
      "actionPayload",
      "automationAuthorizationId",
      "automationAuthorizationIds",
      "automationRunId",
      "automationRunIds",
      "automationIterationId",
      "automationIterationIds",
    ].includes(key)) continue;
    const normalized = normalizeForKey(record[key]);
    if (normalized !== null) result[key] = normalized;
  }
  return result;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (["action", "options", "payload", "confirmationPayload", "actionPayload"].includes(key)) continue;
    output[key] = sanitizeValue(item);
  }
  return output;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") return sanitizeObject(value as Record<string, unknown>);
  return value;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))].sort();
}

function sameStringSet(left: string[], right: string[]): boolean {
  const leftSet = dedupeStrings(left);
  const rightSet = dedupeStrings(right);
  return leftSet.length === rightSet.length && leftSet.every((value, index) => value === rightSet[index]);
}

function sameStableField(left: unknown, right: unknown): boolean {
  return stableStringify(normalizeForKey(left)) === stableStringify(normalizeForKey(right));
}

function truncate(value: string): string {
  return value.length > 600 ? `${value.slice(0, 597)}...` : value;
}

function displayMemoryPath(memory: ResolvedMemory, absolutePath: string): string {
  const rel = relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/");
  return rel.startsWith("..") ? absolutePath : rel;
}
