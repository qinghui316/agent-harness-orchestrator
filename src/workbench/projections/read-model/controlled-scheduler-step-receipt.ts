import type { ControlledSchedulerPostStepHandoff, ControlledSchedulerPostStepHandoffStatus } from "../../controlled-scheduler-handoff.js";
import type { WorkbenchControlledSchedulerStepReceipt, WorkbenchControlledSchedulerStepTrace } from "../../read-model-types.js";
import { WorkbenchStore, type StoredDecisionRecord } from "../../store.js";
import type { ResolvedMemory } from "../../../types/index.js";
import { knownSchedulerUserFacingActionLabel } from "./confirmation/scheduler-user-surface.js";

const CONTROLLED_ADVANCE_ACTION = "planning.scheduler.controlled-advance.run";
const STEP_TRACE_LIMIT = 5;

export async function readLatestControlledSchedulerStepReceipt(
  memory: ResolvedMemory,
  changeId: string,
): Promise<WorkbenchControlledSchedulerStepReceipt | null> {
  if (!memory.projectId) return null;
  const store = await WorkbenchStore.open(memory);
  try {
    for (const record of store.listDecisions(memory.projectId, changeId)) {
      if (record.decisionType !== CONTROLLED_ADVANCE_ACTION || record.status !== "completed") continue;
      return controlledSchedulerStepReceiptFromDecision(record, changeId);
    }
    return null;
  } finally {
    store.close();
  }
}

export async function readControlledSchedulerStepTrace(
  memory: ResolvedMemory,
  changeId: string,
  limit = STEP_TRACE_LIMIT,
): Promise<WorkbenchControlledSchedulerStepTrace | null> {
  if (!memory.projectId) return null;
  const store = await WorkbenchStore.open(memory);
  try {
    const items = store.listDecisions(memory.projectId, changeId)
      .filter((record) => record.decisionType === CONTROLLED_ADVANCE_ACTION && record.status === "completed")
      .map((record) => controlledSchedulerStepReceiptFromDecision(record, changeId))
      .filter((item): item is WorkbenchControlledSchedulerStepReceipt => Boolean(item))
      .slice(0, limit);
    if (items.length === 0) return null;
    return {
      label: "受控推进轨迹",
      body: `最近 ${items.length} 个受控步骤都已在完成后主动停止；继续仍要回到右侧确认区重新确认当前步骤。`,
      boundary: "这是只读轨迹，不会自动继续、连续循环、批量启动任务、分配资源、应用源码、关闭需求、远端落地或维护演进。",
      items,
      evidenceRefs: unique(items.flatMap((item) => item.evidenceRefs)).slice(0, limit),
      updatedAt: items[0]?.updatedAt,
    };
  } finally {
    store.close();
  }
}

export function controlledSchedulerStepReceiptFromDecision(
  record: Pick<StoredDecisionRecord, "id" | "artifact" | "completedAt" | "payloadJson" | "updatedAt">,
  expectedChangeId: string,
): WorkbenchControlledSchedulerStepReceipt | null {
  const payload = parseJsonRecord(record.payloadJson);
  if (!payload || !isRecord(payload.scope) || !isRecord(payload.result)) return null;
  if (payload.scope.changeId !== expectedChangeId) return null;
  const handoff = readValidPostStepHandoff(payload.result);
  if (!handoff) return null;

  const executedStepLabel = knownSchedulerUserFacingActionLabel(handoff.executedActionType) ?? "当前步骤";
  const nextStepLabel = knownSchedulerUserFacingActionLabel(handoff.nextConfirmationCandidate?.actionType);
  return {
    label: "已完成一个受控步骤",
    status: receiptStatus(handoff.status),
    body: receiptBody(handoff, executedStepLabel, nextStepLabel),
    executedStepLabel,
    nextStepLabel,
    readinessLabel: readinessLabel(handoff.status),
    boundary: "已主动停止；是否继续仍需要你重新确认下一步。不会自动连续执行、批量启动任务、分配资源、应用源码、关闭需求或远端落地。",
    humanConfirmationStillRequired: true,
    evidenceRefs: record.artifact ? [record.artifact] : [],
    decisionId: record.id,
    updatedAt: record.completedAt ?? record.updatedAt,
  };
}

function readValidPostStepHandoff(result: Record<string, unknown>): ControlledSchedulerPostStepHandoff | null {
  if (!isRecord(result.postStepHandoff)) return null;
  const handoff = result.postStepHandoff;
  if (handoff.authority !== "derived-non-executing-workbench-handoff") return null;
  if (handoff.stopReason !== "one-confirmed-scheduler-transition-completed") return null;
  if (!isPostStepStatus(handoff.status)) return null;
  if (handoff.executionStarted !== false) return null;
  if (handoff.loopAuthorized !== false) return null;
  if (handoff.wholeWaveDispatchAuthorized !== false) return null;
  if (handoff.slotAllocatorAuthorized !== false) return null;
  if (typeof handoff.needsReevaluation !== "boolean") return null;

  if (handoff.nextConfirmationCandidate !== undefined) {
    if (!isRecord(handoff.nextConfirmationCandidate)) return null;
    const candidate = handoff.nextConfirmationCandidate;
    if (candidate.executionStarted !== false) return null;
    if (candidate.authorizationGranted !== false) return null;
    if (candidate.humanConfirmationStillRequired !== true) return null;
    if (typeof candidate.readinessEvidencePrepared !== "boolean") return null;
  }
  return handoff as unknown as ControlledSchedulerPostStepHandoff;
}

function receiptStatus(status: ControlledSchedulerPostStepHandoffStatus): WorkbenchControlledSchedulerStepReceipt["status"] {
  if (status === "next-confirmation-candidate-ready") return "ready-for-confirmation";
  if (status === "next-confirmation-candidate-needs-review") return "needs-review";
  if (status === "next-step-evaluation-failed") return "needs-reevaluation";
  return "refreshed";
}

function receiptBody(
  handoff: ControlledSchedulerPostStepHandoff,
  executedStepLabel: string,
  nextStepLabel: string | undefined,
): string {
  const next = nextStepLabel ? `下一步候选：${nextStepLabel}。` : "下一步判断已刷新。";
  return `本次执行：${executedStepLabel}。${next}${readinessLabel(handoff.status)} 继续前仍需要你再次确认。`;
}

function readinessLabel(status: ControlledSchedulerPostStepHandoffStatus): string {
  if (status === "next-confirmation-candidate-ready") return "当前步骤检查已刷新。";
  if (status === "next-confirmation-candidate-needs-review") return "当前步骤检查还需要复核。";
  if (status === "next-step-evaluation-failed") return "下一步判断刷新未完成。";
  return "下一步判断已刷新。";
}

function isPostStepStatus(value: unknown): value is ControlledSchedulerPostStepHandoffStatus {
  return value === "next-confirmation-candidate-ready"
    || value === "next-confirmation-candidate-needs-review"
    || value === "next-step-evaluation-refreshed"
    || value === "next-step-evaluation-failed";
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
