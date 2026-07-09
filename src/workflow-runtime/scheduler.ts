import { reserveSchedulerRuntimeClaims } from "../scheduler-runtime/claim-reservation.js";
import { initializeSchedulerRuntime } from "../scheduler-runtime/initialize.js";
import type { SchedulerIntegrationCandidateInput } from "../scheduler-runtime/integration-candidate.js";
import type { SchedulerIntegrationCheckHandoffInput } from "../scheduler-runtime/integration-check-handoff.js";
import type { SchedulerIntegrationOutcomeInput } from "../scheduler-runtime/integration-outcome.js";
import { reconcileSchedulerRuntime } from "../scheduler-runtime/reconcile.js";
import type { SchedulerRunBlockedCloseoutInput } from "../scheduler-runtime/run-closeout.js";
import type { SchedulerRunCompletionInput } from "../scheduler-runtime/run-completion.js";
import type { SchedulerWorkerAuditInput } from "../scheduler-runtime/worker-audit.js";
import type { SchedulerWorkerValidationInput } from "../scheduler-runtime/worker-validation.js";
import type { SchedulerWorkerResultReconcileInput } from "../scheduler-runtime/worker-result.js";
import type { SchedulerWorkerReworkAuditInput } from "../scheduler-runtime/worker-rework-audit.js";
import type { SchedulerWorkerReworkPlanInput } from "../scheduler-runtime/worker-rework-plan.js";
import type { SchedulerWorkerReworkResultReconcileInput } from "../scheduler-runtime/worker-rework-result.js";
import type { SchedulerWorkerReworkValidationInput } from "../scheduler-runtime/worker-rework-validation.js";
import type { SchedulerFirstWorkerReworkStartInput } from "../scheduler-runtime/worker-rework.js";
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

export function runSchedulerWorkerResultReconcile(project: ManagedProject, input: SchedulerWorkerResultReconcileInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.reconcile-result", input });
}

export function runSchedulerWorkerValidation(project: ManagedProject, input: SchedulerWorkerValidationInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.validate-first", input });
}

export function runSchedulerWorkerAudit(project: ManagedProject, input: SchedulerWorkerAuditInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.audit-first", input });
}

export function runSchedulerWorkerReworkPlanCompile(project: ManagedProject, input: SchedulerWorkerReworkPlanInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.rework-plan.compile", input });
}

export function runSchedulerWorkerReworkStart(project: ManagedProject, input: SchedulerFirstWorkerReworkStartInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.rework-start-first", input });
}

export function runSchedulerWorkerReworkResultReconcile(project: ManagedProject, input: SchedulerWorkerReworkResultReconcileInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.rework-reconcile-result", input });
}

export function runSchedulerWorkerReworkValidation(project: ManagedProject, input: SchedulerWorkerReworkValidationInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.rework-validate-first", input });
}

export function runSchedulerWorkerReworkAudit(project: ManagedProject, input: SchedulerWorkerReworkAuditInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.worker.rework-audit-first", input });
}

export async function runSchedulerIntegrationCandidateCompile(project: ManagedProject, input: SchedulerIntegrationCandidateInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.integration-candidate.compile", input });
}

export async function runSchedulerIntegrationCheck(project: ManagedProject, input: SchedulerIntegrationCheckHandoffInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.integration-check.run", input });
}

export function runSchedulerIntegrationOutcomeReconcile(project: ManagedProject, input: SchedulerIntegrationOutcomeInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.integration-outcome.reconcile", input });
}

export async function runSchedulerRunComplete(project: ManagedProject, input: SchedulerRunCompletionInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.run.complete", input });
}

export async function runSchedulerRunCloseBlocked(project: ManagedProject, input: SchedulerRunBlockedCloseoutInput) {
  return runSchedulerReadySetCurrentStep(project, { actionType: "planning.scheduler.run.close-blocked", input });
}
