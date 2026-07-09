import type { ChangeStatus } from "../types/index.js";
import type { SchedulerRuntimeClaimReservation, SchedulerRuntimeClaimReservationIntent } from "./types.js";

export interface SchedulerWorkerScopeContext {
  taskId: string;
  taskText: string;
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  currentSourceScopes: string[];
  siblingSourceScopes: string[];
}

export function buildSchedulerWorkerScopeContext(
  changeStatus: ChangeStatus,
  reservation: SchedulerRuntimeClaimReservation,
  intent: SchedulerRuntimeClaimReservationIntent,
  taskId: string,
): SchedulerWorkerScopeContext {
  return {
    taskId,
    taskText: taskTextFor(changeStatus, taskId),
    reservationIntentId: intent.reservationIntentId,
    claimIntentId: intent.claimIntentId,
    nodeId: intent.nodeId,
    unitId: intent.unitId,
    currentSourceScopes: normalizeScopes(intent.sourceScopes),
    siblingSourceScopes: normalizeScopes(reservation.reservationIntents
      .filter((item) => item.reservationIntentId !== intent.reservationIntentId)
      .flatMap((item) => item.sourceScopes)),
  };
}

export function resolveSchedulerWorkerReservationIntent(
  reservation: SchedulerRuntimeClaimReservation,
  scope: {
    reservationIntentId: string;
    claimIntentId: string;
    nodeId: string;
    unitId: string;
  },
  label: string,
): SchedulerRuntimeClaimReservationIntent {
  const intent = reservation.reservationIntents.find((item) =>
    item.reservationIntentId === scope.reservationIntentId
    && item.claimIntentId === scope.claimIntentId
    && item.nodeId === scope.nodeId
    && item.unitId === scope.unitId
  );
  if (!intent) throw new Error(`${label} reservation intent scope mismatch.`);
  return intent;
}

export function composeSchedulerWorkerCoderScopePrompt(context: SchedulerWorkerScopeContext): string {
  return [
    `Scheduler worker scope: implement only task ${context.taskId}.`,
    `Task text: ${context.taskText}`,
    `Current worker source scopes: ${formatScopes(context.currentSourceScopes)}.`,
    context.siblingSourceScopes.length > 0
      ? `Do not modify sibling scheduler source scopes: ${formatScopes(context.siblingSourceScopes)}. Those belong to other worker tasks.`
      : "No sibling scheduler source scopes are reserved in this wave.",
    "You may add or update task-specific tests when needed, but do not implement sibling tasks, run another worker, apply, merge, close, or start a scheduler loop.",
  ].join("\n");
}

export function composeSchedulerWorkerAuditScopePrompt(context: SchedulerWorkerScopeContext): string {
  return [
    `Scheduler worker audit scope: audit only task ${context.taskId} and its current worker diff.`,
    `Task text: ${context.taskText}`,
    `Current worker source scopes: ${formatScopes(context.currentSourceScopes)}.`,
    context.siblingSourceScopes.length > 0
      ? `Sibling scheduler source scopes not assigned to this worker: ${formatScopes(context.siblingSourceScopes)}. Do not block this worker only because those sibling tasks are not implemented yet.`
      : "No sibling scheduler source scopes are reserved in this wave.",
    "Use Status: blocked only for defects in this worker's assigned task, validation evidence, source safety, or writes into sibling source scopes.",
    "Do not require this worker to complete the whole demand; later scheduler workers and IntegrationCheck handle sibling outputs and aggregate compatibility.",
  ].join("\n");
}

export function composeSchedulerWorkerReworkScopePrompt(
  context: SchedulerWorkerScopeContext,
  blockingSource: string,
  reworkReason: string,
): string {
  return [
    `Rework the scheduler worker result for task ${context.taskId}.`,
    `Task text: ${context.taskText}`,
    `Blocking source: ${blockingSource}.`,
    `Reason: ${reworkReason}`,
    `Current worker source scopes: ${formatScopes(context.currentSourceScopes)}.`,
    context.siblingSourceScopes.length > 0
      ? `Do not modify sibling scheduler source scopes: ${formatScopes(context.siblingSourceScopes)}. If the blocker only concerns a sibling task, report blocked instead of editing that sibling scope.`
      : "No sibling scheduler source scopes are reserved in this wave.",
    "Use the existing worktree. Do not start validation, audit, apply, merge, another worker, or a scheduler loop.",
  ].join("\n");
}

export function findSiblingSourceScopeWrites(diff: string, context: SchedulerWorkerScopeContext): string[] {
  const changedPaths = parseDiffChangedPaths(diff);
  const siblingScopes = context.siblingSourceScopes.map(normalizePath).filter(Boolean);
  const violations = new Set<string>();
  for (const file of changedPaths) {
    for (const scope of siblingScopes) {
      if (pathMatchesScope(file, scope)) {
        violations.add(file);
      }
    }
  }
  return [...violations].sort((left, right) => left.localeCompare(right));
}

export function parseDiffChangedPaths(diff: string): string[] {
  const changed = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (!match) continue;
    changed.add(normalizePath(match[2] ?? match[1] ?? ""));
  }
  return [...changed].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

function taskTextFor(changeStatus: ChangeStatus, taskId: string): string {
  const task = changeStatus.acMap?.tasks.find((item) => item.id.toUpperCase() === taskId.toUpperCase());
  return task ? `${task.id}: ${task.text}; Covers: ${task.acIds.join(", ") || "none"}` : taskId;
}

function normalizeScopes(scopes: string[]): string[] {
  return [...new Set(scopes.map(normalizePath).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "").trim();
}

function formatScopes(scopes: string[]): string {
  return scopes.length > 0 ? scopes.join(", ") : "none";
}

function pathMatchesScope(path: string, scope: string): boolean {
  return path === scope || path.startsWith(`${scope}/`);
}
