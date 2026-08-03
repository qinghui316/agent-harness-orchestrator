import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";

const runCurrentStep = vi.hoisted(() => vi.fn());

vi.mock("../../src/workflow-runtime/scheduler-ready-set.js", () => ({
  runSchedulerReadySetCurrentStep: runCurrentStep,
}));

import {
  runSchedulerIntegrationCandidateCompile,
  runSchedulerIntegrationCheck,
  runSchedulerIntegrationOutcomeReconcile,
  runSchedulerRunCloseBlocked,
  runSchedulerRunComplete,
  runSchedulerWorkerAudit,
  runSchedulerWorkerResultReconcile,
  runSchedulerWorkerReworkAudit,
  runSchedulerWorkerReworkPlanCompile,
  runSchedulerWorkerReworkResultReconcile,
  runSchedulerWorkerReworkStart,
  runSchedulerWorkerReworkValidation,
  runSchedulerWorkerStartFirst,
  runSchedulerWorkerStartNext,
  runSchedulerWorkerValidation,
} from "../../src/workflow-runtime/scheduler.js";

const executionPort = {
  artifacts: {
    changeEvidenceRoot: "skill-root/state/changes/active/change-1",
    planningRoot: "skill-root/state/changes/active/change-1/planning",
    runtimeRoot: "sidecar-root/scheduler-runs/change-1",
    artifactRoots: ["skill-root", "sidecar-root"],
  },
  runtime: { projectId: "project-1" },
  harness: {
    planning: { change: { change_id: "change-1" } },
    changeStatus: {
      change: { id: "change-1" },
      activeChanges: [{ name: "change-1", path: "state/changes/active/change-1" }],
    },
  },
} as never;

describe("Scheduler current-step facade dispatch", () => {
  beforeEach(() => runCurrentStep.mockReset());

  it.each([
    [runSchedulerWorkerStartFirst, "planning.scheduler.worker.start-first", { reservationIntentId: "reservation-1", claimIntentId: "claim-1" }],
    [runSchedulerWorkerStartNext, "planning.scheduler.worker.start-next", { reservationIntentId: "reservation-2", claimIntentId: "claim-2" }],
    [runSchedulerWorkerResultReconcile, "planning.scheduler.worker.reconcile-result", { schedulerWorkerStartId: "start-1" }],
    [runSchedulerWorkerValidation, "planning.scheduler.worker.validate-first", { schedulerWorkerResultId: "result-1" }],
    [runSchedulerWorkerAudit, "planning.scheduler.worker.audit-first", { schedulerWorkerValidationId: "validation-1" }],
    [runSchedulerWorkerReworkPlanCompile, "planning.scheduler.worker.rework-plan.compile", { schedulerWorkerValidationId: "validation-1" }],
    [runSchedulerWorkerReworkStart, "planning.scheduler.worker.rework-start-first", { schedulerWorkerReworkPlanId: "rework-plan-1" }],
    [runSchedulerWorkerReworkResultReconcile, "planning.scheduler.worker.rework-reconcile-result", { schedulerWorkerReworkStartId: "rework-start-1" }],
    [runSchedulerWorkerReworkValidation, "planning.scheduler.worker.rework-validate-first", { schedulerWorkerReworkResultId: "rework-result-1" }],
    [runSchedulerWorkerReworkAudit, "planning.scheduler.worker.rework-audit-first", { schedulerWorkerReworkValidationId: "rework-validation-1" }],
    [runSchedulerIntegrationCandidateCompile, "planning.scheduler.integration-candidate.compile", {}],
    [runSchedulerIntegrationCheck, "planning.scheduler.integration-check.run", { schedulerIntegrationCandidateId: "candidate-1" }],
    [runSchedulerIntegrationOutcomeReconcile, "planning.scheduler.integration-outcome.reconcile", { schedulerIntegrationCheckHandoffId: "handoff-1" }],
    [runSchedulerRunComplete, "planning.scheduler.run.complete", { schedulerIntegrationOutcomeId: "outcome-1" }],
    [runSchedulerRunCloseBlocked, "planning.scheduler.run.close-blocked", { schedulerIntegrationCandidateId: "candidate-1" }],
  ] as const)("routes %s through the canonical owner", async (runAction, actionType, target) => {
    const project = {} as ManagedProject;
    const input = { changeId: "change-1", schedulerRunId: "scheduler-run-1", ...target };

    await runAction(project, input as never, executionPort);

    expect(runCurrentStep).toHaveBeenCalledOnce();
    expect(runCurrentStep).toHaveBeenCalledWith(project, { actionType, input }, executionPort);
  });
});
