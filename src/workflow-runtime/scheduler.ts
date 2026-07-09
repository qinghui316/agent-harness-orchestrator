import { reserveSchedulerRuntimeClaims } from "../scheduler-runtime/claim-reservation.js";
import { initializeSchedulerRuntime } from "../scheduler-runtime/initialize.js";
import type { SchedulerIntegrationCandidateInput } from "../scheduler-runtime/integration-candidate.js";
import type { SchedulerIntegrationCheckHandoffInput } from "../scheduler-runtime/integration-check-handoff.js";
import { reconcileSchedulerIntegrationOutcome } from "../scheduler-runtime/integration-outcome.js";
import { reconcileSchedulerRuntime } from "../scheduler-runtime/reconcile.js";
import type { SchedulerRunBlockedCloseoutInput } from "../scheduler-runtime/run-closeout.js";
import type { SchedulerRunCompletionInput } from "../scheduler-runtime/run-completion.js";
import { auditSchedulerFirstWorker } from "../scheduler-runtime/worker-audit.js";
import { validateSchedulerFirstWorker } from "../scheduler-runtime/worker-validation.js";
import { reconcileSchedulerFirstWorkerResult } from "../scheduler-runtime/worker-result.js";
import { auditSchedulerFirstWorkerRework } from "../scheduler-runtime/worker-rework-audit.js";
import { compileSchedulerFirstWorkerReworkPlan } from "../scheduler-runtime/worker-rework-plan.js";
import { reconcileSchedulerFirstWorkerReworkResult } from "../scheduler-runtime/worker-rework-result.js";
import { validateSchedulerFirstWorkerRework } from "../scheduler-runtime/worker-rework-validation.js";
import { startFirstSchedulerWorkerRework } from "../scheduler-runtime/worker-rework.js";
import type { SchedulerFirstWorkerStartInput, SchedulerNextWorkerStartInput } from "../scheduler-runtime/worker-start.js";
import type { ManagedProject } from "../types/index.js";
import { runSchedulerReadySetCurrentStep } from "./scheduler-ready-set.js";

export type { SchedulerIntegrationCandidateResult } from "../scheduler-runtime/integration-candidate.js";
export type { SchedulerIntegrationCheckHandoffResult } from "../scheduler-runtime/integration-check-handoff.js";
export type { SchedulerIntegrationOutcomeResult } from "../scheduler-runtime/integration-outcome.js";
export type { SchedulerRunBlockedCloseoutResult } from "../scheduler-runtime/run-closeout.js";
export type { SchedulerRunCompletionResult } from "../scheduler-runtime/run-completion.js";
export type { SchedulerWorkerAuditResult } from "../scheduler-runtime/worker-audit.js";
export type { SchedulerWorkerResultReconcileResult } from "../scheduler-runtime/worker-result.js";
export type { SchedulerWorkerReworkAuditResult } from "../scheduler-runtime/worker-rework-audit.js";
export type { SchedulerWorkerReworkPlanResult } from "../scheduler-runtime/worker-rework-plan.js";
export type { SchedulerWorkerReworkResultReconcileResult } from "../scheduler-runtime/worker-rework-result.js";
export type { SchedulerWorkerReworkValidationResult } from "../scheduler-runtime/worker-rework-validation.js";
export type { SchedulerFirstWorkerReworkStartResult } from "../scheduler-runtime/worker-rework.js";
export type { SchedulerWorkerValidationResult } from "../scheduler-runtime/worker-validation.js";

export function runSchedulerRuntimeInitialize(...args: Parameters<typeof initializeSchedulerRuntime>) {
  return initializeSchedulerRuntime(...args);
}

export function runSchedulerRuntimeReconcile(...args: Parameters<typeof reconcileSchedulerRuntime>) {
  return reconcileSchedulerRuntime(...args);
}

export function runSchedulerRuntimeReserveClaims(...args: Parameters<typeof reserveSchedulerRuntimeClaims>) {
  return reserveSchedulerRuntimeClaims(...args);
}

export async function runSchedulerWorkerStartFirst(project: ManagedProject, input: SchedulerFirstWorkerStartInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.start-first", input });
}

export async function runSchedulerWorkerStartNext(project: ManagedProject, input: SchedulerNextWorkerStartInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.start-next", input });
}

export function runSchedulerWorkerResultReconcile(...args: Parameters<typeof reconcileSchedulerFirstWorkerResult>) {
  return reconcileSchedulerFirstWorkerResult(...args);
}

export function runSchedulerWorkerValidation(...args: Parameters<typeof validateSchedulerFirstWorker>) {
  return validateSchedulerFirstWorker(...args);
}

export function runSchedulerWorkerAudit(...args: Parameters<typeof auditSchedulerFirstWorker>) {
  return auditSchedulerFirstWorker(...args);
}

export function runSchedulerWorkerReworkPlanCompile(...args: Parameters<typeof compileSchedulerFirstWorkerReworkPlan>) {
  return compileSchedulerFirstWorkerReworkPlan(...args);
}

export function runSchedulerWorkerReworkStart(...args: Parameters<typeof startFirstSchedulerWorkerRework>) {
  return startFirstSchedulerWorkerRework(...args);
}

export function runSchedulerWorkerReworkResultReconcile(...args: Parameters<typeof reconcileSchedulerFirstWorkerReworkResult>) {
  return reconcileSchedulerFirstWorkerReworkResult(...args);
}

export function runSchedulerWorkerReworkValidation(...args: Parameters<typeof validateSchedulerFirstWorkerRework>) {
  return validateSchedulerFirstWorkerRework(...args);
}

export function runSchedulerWorkerReworkAudit(...args: Parameters<typeof auditSchedulerFirstWorkerRework>) {
  return auditSchedulerFirstWorkerRework(...args);
}

export async function runSchedulerIntegrationCandidateCompile(project: ManagedProject, input: SchedulerIntegrationCandidateInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.integration-candidate.compile", input });
}

export async function runSchedulerIntegrationCheck(project: ManagedProject, input: SchedulerIntegrationCheckHandoffInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.integration-check.run", input });
}

export function runSchedulerIntegrationOutcomeReconcile(...args: Parameters<typeof reconcileSchedulerIntegrationOutcome>) {
  return reconcileSchedulerIntegrationOutcome(...args);
}

export async function runSchedulerRunComplete(project: ManagedProject, input: SchedulerRunCompletionInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.run.complete", input });
}

export async function runSchedulerRunCloseBlocked(project: ManagedProject, input: SchedulerRunBlockedCloseoutInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.run.close-blocked", input });
}
