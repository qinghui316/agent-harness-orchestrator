import { createHash } from "node:crypto";
import type { ResolvedMemory } from "../types/index.js";
import {
  bindLatestMainAgentResumePoint,
  type BindMainAgentResumePointResult,
  type MainAgentResumeKeyInput,
  type MainAgentResumePoint,
  type MainAgentResumePointGateSnapshot,
  type MainAgentResumePointLane,
  type MainAgentResumePointStopReason,
} from "./resume-point.js";

export type MainAgentResumeContinuationAuthority = "read-only-main-agent-resume-continuation-context";
export type MainAgentResumeContinuationStatus =
  | "available"
  | "not-requested"
  | "missing"
  | "scope-mismatch"
  | "key-mismatch"
  | "stale"
  | "blocked";

export interface MainAgentResumeContinuationIntent {
  requested: boolean;
  source: "explicit" | "user-message";
  summary?: string;
  feedbackHash?: string | null;
}

export interface MainAgentResumeContinuationCurrentEvidence {
  changeId: string;
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

export interface BuildMainAgentResumeContinuationContextInput {
  projectId: string | null | undefined;
  changeId: string;
  changePath: string;
  continuationIntent: MainAgentResumeContinuationIntent;
  currentEvidence: MainAgentResumeContinuationCurrentEvidence;
  candidateLanes?: MainAgentResumePointLane[];
  priority?: {
    hasNewerUserInput?: boolean;
    hasActiveTurn?: boolean;
    hasQueuedInput?: boolean;
    hasConcreteCurrentGate?: boolean;
  };
}

export interface MainAgentResumeContinuationPointSummary {
  id: string;
  ref: string;
  changeId: string;
  projectId: string | null;
  lane: MainAgentResumePointLane;
  stopReason: MainAgentResumePointStopReason;
  sourceStopReason?: string;
  summary: string;
  currentGate: {
    kind: MainAgentResumePointGateSnapshot["kind"];
    actionType?: string;
    approvalActionId?: string;
    changeId?: string;
    targetIds: string[];
  };
  reusableEvidenceRefs: string[];
  mustRevalidate: string[];
  forbiddenActions: string[];
  nextOwner: MainAgentResumePoint["nextOwner"];
  refs: {
    goalLoopFeedbackIds: string[];
    goalLoopNextStepPacketIds: string[];
    workflowRunIds: string[];
    taskQueueRunIds: string[];
    taskRunIds: string[];
    schedulerRunIds: string[];
    workerLeaseIds: string[];
    integrationCheckIds: string[];
    agentTaskIds: string[];
    runIds: string[];
    validationIds: string[];
    auditIds: string[];
  };
}

export interface MainAgentResumeContinuationContext {
  authority: MainAgentResumeContinuationAuthority;
  executionStarted: false;
  status: MainAgentResumeContinuationStatus;
  reason: string;
  projectId: string | null;
  changeId: string;
  attemptedLanes: MainAgentResumePointLane[];
  expectedStableResumeKey?: string;
  matchStatus?: BindMainAgentResumePointResult["status"];
  resumePoint?: MainAgentResumeContinuationPointSummary;
  reusePosture: "none" | "subordinate-context" | "must-reobserve" | "blocked";
  subordinateTo: Array<"current-gate" | "newer-user-input" | "active-turn" | "queued-input">;
  mustRevalidate: string[];
  forbiddenActions: string[];
  promptEvidence: string[];
}

const DEFAULT_CANDIDATE_LANES: MainAgentResumePointLane[] = [
  "scoped-local-automation",
  "controlled-scheduler",
  "manual-gate",
];

export async function buildMainAgentResumeContinuationContext(
  memory: ResolvedMemory,
  input: BuildMainAgentResumeContinuationContextInput,
): Promise<MainAgentResumeContinuationContext> {
  const projectId = input.projectId ?? null;
  const attemptedLanes = input.candidateLanes?.length ? [...input.candidateLanes] : [...DEFAULT_CANDIDATE_LANES];
  if (!input.continuationIntent.requested) {
    return baseContext(input, attemptedLanes, "not-requested", "No explicit resume continuation intent was provided.");
  }
  if (!projectId) {
    return baseContext(input, attemptedLanes, "scope-mismatch", "Resume continuation requires an explicit project id.");
  }
  if (input.currentEvidence.changeId !== input.changeId) {
    return baseContext(input, attemptedLanes, "scope-mismatch", "Current resume evidence is scoped to a different Change.");
  }

  const subordinateTo = priorityMarkers(input.priority);
  let best: BindMainAgentResumePointResult | null = null;
  for (const lane of attemptedLanes) {
    const keyInput = buildCurrentKeyInput(input, lane);
    const result = await bindLatestMainAgentResumePoint(memory, input.changePath, keyInput, { projectId });
    if (result.status === "bound" && result.resumePoint) {
      return contextFromBound(input, attemptedLanes, { ...result, resumePoint: result.resumePoint }, subordinateTo);
    }
    best = chooseMoreSpecificBindResult(best, result);
    if (result.status === "blocked") break;
  }

  const status = mapBindStatus(best?.status ?? "missing");
  return {
    ...baseContext(input, attemptedLanes, status, best?.reason ?? "No matching resume point was available."),
    expectedStableResumeKey: best?.expectedStableResumeKey,
    matchStatus: best?.status,
    subordinateTo,
    promptEvidence: [
      `- Status: ${status}`,
      `- Reason: ${quoteEvidence(best?.reason ?? "No matching resume point was available.")}`,
      "- This is resume evidence only. Re-observe current Harness evidence before proposing any next step.",
    ],
  };
}

export function detectMainAgentResumeContinuationIntent(userMessage: string): MainAgentResumeContinuationIntent {
  const text = userMessage.trim();
  if (!text) return { requested: false, source: "user-message" };
  const requested = /(^|\s)(continue|resume|retry|try again|pick up|carry on)(\s|$)|继续|接着|续跑|断点|按(?:这个|刚才|上面|之前)?(?:的)?(?:反馈|意见|建议)?继续(?:跑|执行)?|根据(?:这个|刚才|上面|之前)?(?:的)?(?:反馈|意见|建议)继续(?:跑|执行)?|从断点继续|重新(?:继续|跑|执行)/i.test(text);
  if (!requested) return { requested: false, source: "user-message" };
  return {
    requested: true,
    source: "user-message",
    summary: text.length > 240 ? `${text.slice(0, 237)}...` : text,
    feedbackHash: /\bfeedback\b|反馈|意见|修改/.test(text) ? hashText(text) : null,
  };
}

export function renderMainAgentResumeContinuationPromptSection(
  context: MainAgentResumeContinuationContext,
): string[] {
  if (context.status === "not-requested") return [];
  return [
    "## Main Agent Resume Continuation Context",
    "",
    "- Authority: read-only resume continuation evidence.",
    "- Execution started: false.",
    "- Do not replay old actions. Re-observe current Harness evidence and match a current real gate before any execution path.",
    `- Status: ${context.status}`,
    `- Reason: ${quoteEvidence(context.reason)}`,
    `- Change ID: ${context.changeId}`,
    `- Project ID: ${context.projectId ?? "unknown"}`,
    ...(context.subordinateTo.length
      ? [`- Priority: subordinate to ${context.subordinateTo.join(", ")}.`]
      : ["- Priority: no higher-priority current turn marker was provided."]),
    ...(context.resumePoint ? renderResumePointSummary(context.resumePoint) : []),
    "",
  ];
}

function contextFromBound(
  input: BuildMainAgentResumeContinuationContextInput,
  attemptedLanes: MainAgentResumePointLane[],
  result: BindMainAgentResumePointResult & { resumePoint: MainAgentResumePoint },
  subordinateTo: MainAgentResumeContinuationContext["subordinateTo"],
): MainAgentResumeContinuationContext {
  const point = summarizePoint(result.resumePoint);
  const context: MainAgentResumeContinuationContext = {
    authority: "read-only-main-agent-resume-continuation-context",
    executionStarted: false,
    status: "available",
    reason: result.reason,
    projectId: input.projectId ?? null,
    changeId: input.changeId,
    attemptedLanes,
    expectedStableResumeKey: result.expectedStableResumeKey,
    matchStatus: result.status,
    resumePoint: point,
    reusePosture: subordinateTo.length > 0 ? "subordinate-context" : "must-reobserve",
    subordinateTo,
    mustRevalidate: point.mustRevalidate,
    forbiddenActions: point.forbiddenActions,
    promptEvidence: [
      `- Bound resume point: ${point.id}`,
      `- Lane: ${point.lane}`,
      `- Stop reason: ${point.stopReason}`,
      `- Summary: ${quoteEvidence(point.summary)}`,
      "- Reuse posture: stable matching leaf/stage evidence may be considered, but current Harness evidence must be re-observed first.",
    ],
  };
  return context;
}

function baseContext(
  input: BuildMainAgentResumeContinuationContextInput,
  attemptedLanes: MainAgentResumePointLane[],
  status: MainAgentResumeContinuationStatus,
  reason: string,
): MainAgentResumeContinuationContext {
  return {
    authority: "read-only-main-agent-resume-continuation-context",
    executionStarted: false,
    status,
    reason,
    projectId: input.projectId ?? null,
    changeId: input.changeId,
    attemptedLanes,
    reusePosture: status === "blocked" ? "blocked" : "none",
    subordinateTo: priorityMarkers(input.priority),
    mustRevalidate: [],
    forbiddenActions: defaultForbiddenActions(),
    promptEvidence: [],
  };
}

function buildCurrentKeyInput(
  input: BuildMainAgentResumeContinuationContextInput,
  lane: MainAgentResumePointLane,
): MainAgentResumeKeyInput {
  return {
    changeId: input.changeId,
    lane,
    gate: input.currentEvidence.gate ?? null,
    targetRefs: input.currentEvidence.targetRefs,
    acceptedArtifactHashes: input.currentEvidence.acceptedArtifactHashes,
    sourceState: input.currentEvidence.sourceState,
    goalLoopRefs: input.currentEvidence.goalLoopRefs,
    workflowRefs: input.currentEvidence.workflowRefs,
    schedulerRefs: input.currentEvidence.schedulerRefs,
    roleRefs: input.currentEvidence.roleRefs,
    runtimePolicy: input.currentEvidence.runtimePolicy,
    worktreeBase: input.currentEvidence.worktreeBase,
    feedbackHash: input.currentEvidence.feedbackHash ?? input.continuationIntent.feedbackHash ?? null,
  };
}

function chooseMoreSpecificBindResult(
  current: BindMainAgentResumePointResult | null,
  next: BindMainAgentResumePointResult,
): BindMainAgentResumePointResult {
  if (!current) return next;
  const rank: Record<BindMainAgentResumePointResult["status"], number> = {
    bound: 6,
    blocked: 5,
    stale: 4,
    "scope-mismatch": 3,
    "key-mismatch": 2,
    missing: 1,
  };
  return rank[next.status] > rank[current.status] ? next : current;
}

function mapBindStatus(status: BindMainAgentResumePointResult["status"]): MainAgentResumeContinuationStatus {
  return status === "bound" ? "available" : status;
}

function summarizePoint(point: MainAgentResumePoint): MainAgentResumeContinuationPointSummary {
  return {
    id: point.id,
    ref: point.ref,
    changeId: point.changeId,
    projectId: point.projectId,
    lane: point.lane,
    stopReason: point.stopReason,
    sourceStopReason: point.sourceStopReason,
    summary: point.summary,
    currentGate: {
      kind: point.currentGate.kind,
      actionType: point.currentGate.actionType,
      approvalActionId: point.currentGate.approvalActionId,
      changeId: point.currentGate.changeId,
      targetIds: [...point.currentGate.targetIds],
    },
    reusableEvidenceRefs: [...point.reusableEvidenceRefs],
    mustRevalidate: [...point.mustRevalidate],
    forbiddenActions: [...point.forbiddenActions],
    nextOwner: point.nextOwner,
    refs: {
      goalLoopFeedbackIds: [...point.refs.goalLoopFeedbackIds],
      goalLoopNextStepPacketIds: [...point.refs.goalLoopNextStepPacketIds],
      workflowRunIds: [...point.refs.workflowRunIds],
      taskQueueRunIds: [...point.refs.taskQueueRunIds],
      taskRunIds: [...point.refs.taskRunIds],
      schedulerRunIds: [...point.refs.schedulerRunIds],
      workerLeaseIds: [...point.refs.workerLeaseIds],
      integrationCheckIds: [...point.refs.integrationCheckIds],
      agentTaskIds: [...point.refs.agentTaskIds],
      runIds: [...point.refs.runIds],
      validationIds: [...point.refs.validationIds],
      auditIds: [...point.refs.auditIds],
    },
  };
}

function renderResumePointSummary(point: MainAgentResumeContinuationPointSummary): string[] {
  return [
    `- Resume point: ${point.id}`,
    `- Resume ref: ${point.ref}`,
    `- Lane: ${point.lane}`,
    `- Stop reason: ${point.stopReason}`,
    `- Prior summary: ${quoteEvidence(point.summary)}`,
    `- Prior gate kind: ${point.currentGate.kind}`,
    ...(point.currentGate.actionType ? [`- Prior workflow action: ${point.currentGate.actionType}`] : []),
    ...(point.currentGate.approvalActionId ? [`- Prior approval action: ${point.currentGate.approvalActionId}`] : []),
    `- Prior target ids: ${point.currentGate.targetIds.join(", ") || "none"}`,
    `- Reusable evidence refs: ${point.reusableEvidenceRefs.join(", ") || "none"}`,
    `- Must revalidate: ${point.mustRevalidate.join(", ") || "current Harness gate"}`,
    `- Forbidden actions: ${point.forbiddenActions.join(", ") || "none"}`,
  ];
}

function priorityMarkers(
  priority: BuildMainAgentResumeContinuationContextInput["priority"],
): MainAgentResumeContinuationContext["subordinateTo"] {
  const markers: MainAgentResumeContinuationContext["subordinateTo"] = [];
  if (priority?.hasNewerUserInput) markers.push("newer-user-input");
  if (priority?.hasActiveTurn) markers.push("active-turn");
  if (priority?.hasQueuedInput) markers.push("queued-input");
  if (priority?.hasConcreteCurrentGate) markers.push("current-gate");
  return markers;
}

function defaultForbiddenActions(): string[] {
  return [
    "action-replay",
    "raw-scheduler",
    "worker-recursive-delegation",
    "manual-integration-check-auto-consume",
    "integration-apply-discard-auto-consume",
    "apply-close-without-current-gate",
    "remote",
    "pr",
    "merge",
    "harness-evolution",
  ];
}

function quoteEvidence(value: string): string {
  return JSON.stringify(value);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
