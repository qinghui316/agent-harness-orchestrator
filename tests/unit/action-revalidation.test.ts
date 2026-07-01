import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkbenchSnapshot: vi.fn(),
  assertGoalLoopAssistedConcreteGateConfirmation: vi.fn(),
  listAuditResults: vi.fn(),
  assessMainAgentActionBridge: vi.fn(),
}));

vi.mock("../../src/workbench/manager.js", () => ({
  getWorkbenchSnapshot: mocks.getWorkbenchSnapshot,
}));

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => ({ memoryRoot: "memory-root" })),
}));

vi.mock("../../src/ecl/index.js", () => ({
  getActiveChanges: vi.fn(async () => [{ name: "change-1", path: "harness/changes/active/change-1" }]),
}));

vi.mock("../../src/workbench/actions/goal-loop-gate-confirmation.js", () => ({
  assertGoalLoopAssistedConcreteGateConfirmation: mocks.assertGoalLoopAssistedConcreteGateConfirmation,
}));

vi.mock("../../src/audit/artifacts.js", () => ({
  listAuditResults: mocks.listAuditResults,
}));

vi.mock("../../src/main-agent-orchestration/index.js", () => ({
  assessMainAgentActionBridge: mocks.assessMainAgentActionBridge,
}));

import { assertCurrentWorkflowAction } from "../../src/server/workbench/action-revalidation.js";

function assertCurrent(input: Parameters<typeof assertCurrentWorkflowAction>[0], body: Parameters<typeof assertCurrentWorkflowAction>[1]): ReturnType<typeof assertCurrentWorkflowAction> {
  return assertCurrentWorkflowAction(input, body, { getWorkbenchSnapshot: mocks.getWorkbenchSnapshot });
}

function repoProject() {
  return { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" };
}

describe("Workbench action revalidation", () => {
  beforeEach(() => {
    mocks.getWorkbenchSnapshot.mockReset();
    mocks.assertGoalLoopAssistedConcreteGateConfirmation.mockReset();
    mocks.listAuditResults.mockReset();
    mocks.assessMainAgentActionBridge.mockReset();
    mocks.assessMainAgentActionBridge.mockResolvedValue({
      status: "ready",
      authority: "non-executing-main-agent-action-bridge-assessment",
      executionStarted: false,
    });
  });

  it("runs main-agent bridge validation before non-revalidated workflow actions when evidence ids are explicit", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "result.refresh-status",
      changeId: "change-1",
      worktreeId: "wt-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: visibleAction,
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: repoProject(), path: "project-root" }, {
      actionType: "result.refresh-status",
      changeId: "change-1",
      worktreeId: "wt-1",
      mainAgentLoopRunId: "loop-1",
      mainAgentNextStepEvidenceId: "decision-1",
    })).resolves.toBeUndefined();
    expect(mocks.assessMainAgentActionBridge).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "repo",
      changeId: "change-1",
      loopRunId: "loop-1",
      evidenceId: "decision-1",
      gate: expect.objectContaining({
        kind: "workflow-action",
        actionType: "result.refresh-status",
        enabled: true,
      }),
    }));
  });

  it("does not run main-agent bridge validation when workflow action evidence ids are absent", async () => {
    await expect(assertCurrent({ project: repoProject(), path: "project-root" }, {
      actionType: "result.refresh-status",
      changeId: "change-1",
      worktreeId: "wt-1",
    })).resolves.toBeUndefined();

    expect(mocks.getWorkbenchSnapshot).not.toHaveBeenCalled();
    expect(mocks.assessMainAgentActionBridge).not.toHaveBeenCalled();
  });

  it("rejects partial main-agent bridge ids on workflow actions", async () => {
    await expect(assertCurrent({ project: repoProject(), path: "project-root" }, {
      actionType: "result.refresh-status",
      changeId: "change-1",
      worktreeId: "wt-1",
      mainAgentLoopRunId: "loop-1",
    })).rejects.toThrow("stale or no longer available");

    expect(mocks.getWorkbenchSnapshot).not.toHaveBeenCalled();
    expect(mocks.assessMainAgentActionBridge).not.toHaveBeenCalled();
  });

  it("rejects explicit main-agent bridge requests when assessment is not ready", async () => {
    mocks.assessMainAgentActionBridge.mockResolvedValueOnce({
      status: "target-mismatch",
      authority: "non-executing-main-agent-action-bridge-assessment",
      executionStarted: false,
    });
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "result.refresh-status",
            changeId: "change-1",
            worktreeId: "wt-1",
            enabled: true,
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: repoProject(), path: "project-root" }, {
      actionType: "result.refresh-status",
      changeId: "change-1",
      worktreeId: "wt-1",
      mainAgentLoopRunId: "loop-1",
      mainAgentNextStepEvidenceId: "decision-1",
    })).rejects.toThrow("stale or no longer available");
  });

  it("rejects explicit main-agent bridge requests for unsupported workflow gate families", async () => {
    mocks.assessMainAgentActionBridge.mockResolvedValueOnce({
      status: "unsupported",
      authority: "non-executing-main-agent-action-bridge-assessment",
      executionStarted: false,
    });
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-first",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
            enabled: true,
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: repoProject(), path: "project-root" }, {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      mainAgentLoopRunId: "loop-1",
      mainAgentNextStepEvidenceId: "decision-1",
    })).rejects.toThrow("stale or no longer available");
    expect(mocks.assessMainAgentActionBridge).toHaveBeenCalledWith(expect.objectContaining({
      gate: expect.objectContaining({
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
      }),
    }));
  });

  it("rejects Goal Loop-assisted concrete gate payloads when the matched visible gate is disabled", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-first",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{
            actions: [{
              kind: "workflow-action",
              actionType: "planning.scheduler.worker.start-first",
              changeId: "change-1",
              schedulerRunId: "scheduler-run-1",
              schedulerClaimReservationId: "claim-reservation-1",
              goalLoopGateReadinessPreflightId: "preflight-1",
              enabled: false,
            }],
          }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: null, path: "project-root" }, {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
    })).rejects.toThrow("stale or no longer available");
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).not.toHaveBeenCalled();
  });

  it("passes enabled Goal Loop-assisted concrete gate payloads to the assisted confirmation guard", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-first",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{ actions: [visibleAction] }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: repoProject(), path: "project-root" }, {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
    })).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).toHaveBeenCalledWith(
      { memoryRoot: "memory-root" },
      "harness/changes/active/change-1",
      "change-1",
      expect.objectContaining({ goalLoopGateReadinessPreflightId: "preflight-1" }),
      { visibleGate: visibleAction },
    );
  });

  it("passes controlled scheduler step payloads to the assisted confirmation guard as the concrete scheduler gate", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.scheduler.controlled-step.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "controller-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-first",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{ actions: [visibleAction] }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.scheduler.controlled-step.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "controller-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    })).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).toHaveBeenCalledWith(
      { memoryRoot: "memory-root" },
      "harness/changes/active/change-1",
      "change-1",
      expect.objectContaining({
        actionType: "planning.scheduler.worker.start-first",
        goalLoopGateReadinessPreflightId: "preflight-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      }),
      {},
    );
  });

  it("passes controlled scheduler advance payloads only when the current visible gate scope matches", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-next",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
            reservationIntentId: "reservation-intent-2",
            claimIntentId: "claim-intent-2",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{ actions: [visibleAction] }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    })).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).not.toHaveBeenCalled();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-other",
      claimIntentId: "claim-intent-2",
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes controlled continuation payloads only when Goal Loop evidence and current scheduler gate match", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          goalLoop: {
            changeId: "change-1",
            goalLoopNextStepPacketId: "packet-1",
            controllerPolicyId: "policy-1",
            gateReadinessPreflightId: "preflight-1",
            controllerVerdict: "recommend-existing-gate",
            controllerGateStatus: "matches-current-gate",
            recommendedActionType: "planning.scheduler.worker.start-next",
            recommendedActionScope: {
              changeId: "change-1",
              schedulerRunId: "scheduler-run-1",
              schedulerClaimReservationId: "claim-reservation-1",
              reservationIntentId: "reservation-intent-2",
              claimIntentId: "claim-intent-2",
            },
          },
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-next",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
            reservationIntentId: "reservation-intent-2",
            claimIntentId: "claim-intent-2",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [],
          otherDemands: [],
        },
      },
    });

    const request = {
      actionType: "planning.goal-loop.controlled-continue.run",
      changeId: "change-1",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "policy-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
      maxSteps: 5,
    } as const;

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, request)).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).not.toHaveBeenCalled();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      goalLoopGateReadinessPreflightId: "preflight-old",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      claimIntentId: "claim-intent-other",
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes scoped automation only when the current primary gate scope matches", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.decomposition.confirm",
      changeId: "change-1",
      decompositionPlanId: "decomp-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: { actions: [visibleAction], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });

    const request = {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.decomposition.confirm",
      decompositionPlanId: "decomp-1",
      maxSteps: 5,
    } as const;

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, request)).resolves.toBeUndefined();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      decompositionPlanId: "decomp-old",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      changeId: "change-2",
    })).rejects.toThrow("stale or no longer available");
  });

  it("rejects scoped automation for human-only planning confirmation gates", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.confirm-execution",
      changeId: "change-1",
      planningBundleId: "planning-bundle-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: { actions: [visibleAction], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.confirm-execution",
      planningBundleId: "planning-bundle-1",
      maxSteps: 5,
    })).rejects.toThrow("stale or no longer available");
  });

  it("allows planning confirmation to carry post-plan automation mode without becoming scoped automation", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.confirm-execution",
      changeId: "change-1",
      planningBundleId: "planning-bundle-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: { actions: [visibleAction], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.confirm-execution",
      changeId: "change-1",
      planningBundleId: "planning-bundle-1",
      postPlanAutomationMode: "full-access",
    })).resolves.toBeUndefined();
  });

  it("passes scoped automation for bounded recovery gates only with matching worktree scope", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "result.refresh-rework",
      changeId: "change-1",
      worktreeId: "wt-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: { actions: [visibleAction], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });

    const request = {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateActionType: "result.refresh-rework",
      worktreeId: "wt-1",
      maxSteps: 5,
    } as const;

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, request)).resolves.toBeUndefined();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      worktreeId: "wt-old",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      changeId: "change-2",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      worktreeId: undefined,
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes scoped automation for local landing.prepare only with matching current gate targets", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "landing.prepare",
      changeId: "change-1",
      worktreeId: "wt-1",
      applyCheckId: "apply-check-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: { actions: [visibleAction], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });

    const request = {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateActionType: "landing.prepare",
      worktreeId: "wt-1",
      applyCheckId: "apply-check-1",
      maxSteps: 5,
    } as const;

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, request)).resolves.toBeUndefined();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      worktreeId: "wt-old",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      applyCheckId: "apply-check-old",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      changeId: "change-2",
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes scoped automation for current approved audit.accept approval gates", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: {
            changeId: "change-1",
            runId: "audit-run-1",
            resultId: "audit-1",
            evidenceRefs: ["runs/audit-run-1/audit.json"],
            actions: [{
              kind: "approval",
              enabled: true,
              changeId: "change-1",
              action: { actionId: "audit.accept", args: ["accept", "repo", "audit-1"] },
            }],
          },
          current: [],
          otherDemands: [],
        },
      },
    });
    mocks.listAuditResults.mockResolvedValue([{
      id: "audit-1",
      changeId: "change-1",
      runId: "audit-run-1",
      status: "approved",
      artifacts: { audit: "runs/audit-run-1/audit.json" },
    }]);

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "audit.accept",
      automationCurrentGateTargetId: "audit-1",
      automationCurrentGateRunId: "audit-run-1",
      automationCurrentGateArtifact: "runs/audit-run-1/audit.json",
      maxSteps: 5,
    })).resolves.toBeUndefined();
  });

  it("rejects scoped automation for approved-with-notes audit.accept approval gates", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: {
            changeId: "change-1",
            runId: "audit-run-1",
            resultId: "audit-1",
            evidenceRefs: ["runs/audit-run-1/audit.json"],
            actions: [{
              kind: "approval",
              enabled: true,
              changeId: "change-1",
              action: { actionId: "audit.accept", args: ["accept", "repo", "audit-1"] },
            }],
          },
          current: [],
          otherDemands: [],
        },
      },
    });
    mocks.listAuditResults.mockResolvedValue([{
      id: "audit-1",
      changeId: "change-1",
      runId: "audit-run-1",
      status: "approved-with-notes",
      artifacts: { audit: "runs/audit-run-1/audit.json" },
    }]);

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "audit.accept",
      automationCurrentGateTargetId: "audit-1",
      automationCurrentGateRunId: "audit-run-1",
      automationCurrentGateArtifact: "runs/audit-run-1/audit.json",
      maxSteps: 5,
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes scoped automation for current local result.apply approval gates", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: {
            changeId: "change-1",
            resultId: "wt-1",
            evidenceRefs: ["runs/audit-run-1/audit.json"],
            actions: [{
              kind: "approval",
              enabled: true,
              changeId: "change-1",
              action: { actionId: "result.apply", args: ["apply", "repo", "change-1", "wt-1"] },
            }],
          },
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "result.apply",
      automationCurrentGateTargetId: "wt-1",
      automationCurrentGateArtifact: "runs/audit-run-1/audit.json",
      maxSteps: 5,
    })).resolves.toBeUndefined();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "result.apply",
      automationCurrentGateTargetId: "wt-old",
      automationCurrentGateArtifact: "runs/audit-run-1/audit.json",
      maxSteps: 5,
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes scoped automation for current local change.close approval gates", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: {
            changeId: "change-1",
            resultId: "change-1",
            actions: [{
              kind: "approval",
              enabled: true,
              changeId: "change-1",
              action: { actionId: "change.close", args: ["close", "repo", "change-1"] },
            }],
          },
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "change.close",
      automationCurrentGateTargetId: "change-1",
      maxSteps: 5,
    })).resolves.toBeUndefined();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-2",
      automationMode: "full-access",
      automationCurrentGateApprovalActionId: "change.close",
      automationCurrentGateTargetId: "change-1",
      maxSteps: 5,
    })).rejects.toThrow("stale or no longer available");
  });

  it("revalidates planning.decompose against the current primary gate", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.decompose",
      changeId: "change-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "workflow-action", ...visibleAction } } },
      right: {
        confirmationQueue: {
          primary: { actions: [visibleAction], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.decompose",
      changeId: "change-1",
    })).resolves.toBeUndefined();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.decompose",
      changeId: "change-2",
    })).rejects.toThrow("stale or no longer available");

    mocks.getWorkbenchSnapshot.mockResolvedValueOnce({
      center: { workpad: { nextAction: { kind: "workflow-action", ...visibleAction, enabled: false } } },
      right: {
        confirmationQueue: {
          primary: { actions: [{ ...visibleAction, enabled: false }], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });
    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.decompose",
      changeId: "change-1",
    })).rejects.toThrow("stale or no longer available");
  });
});

