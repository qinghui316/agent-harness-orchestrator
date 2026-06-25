import { access, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runScopedAutomation } from "../../src/automation-runtime/runner.js";
import { isScopedAutomationAllowedAction } from "../../src/automation-runtime/policy.js";
import type { ResolvedMemory } from "../../src/types/index.js";
import type { ScopedAutomationChildGate } from "../../src/automation-runtime/runner.js";
import type { WorkflowActionScopeCarrier } from "../../src/workflow-actions/registry.js";

describe("Scoped automation runtime", () => {
  let tempDir: string;
  let memory: ResolvedMemory;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-automation-runtime-"));
    memory = buildMemory(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("keeps raw scheduler actions outside the scoped automation allowlist", () => {
    expect(isScopedAutomationAllowedAction("planning.confirm-execution")).toBe(false);
    expect(isScopedAutomationAllowedAction("planning.goal-loop.controlled-continue.run")).toBe(true);
    expect(isScopedAutomationAllowedAction("planning.goal-loop.evaluate")).toBe(true);
    expect(isScopedAutomationAllowedAction("planning.goal-loop.controller.refresh")).toBe(true);
    expect(isScopedAutomationAllowedAction("planning.goal-loop.gate-readiness.prepare")).toBe(true);
    expect(isScopedAutomationAllowedAction("result.refresh-status")).toBe(true);
    expect(isScopedAutomationAllowedAction("landing.prepare")).toBe(true);
    expect(isScopedAutomationAllowedAction("planning.scheduler.worker.start-next")).toBe(false);
    expect(isScopedAutomationAllowedAction("planning.scheduler.integration-check.run")).toBe(false);
    expect(isScopedAutomationAllowedAction("planning.scheduler.plan.prepare")).toBe(false);
    expect(isScopedAutomationAllowedAction("remote-landing.merge")).toBe(false);
    expect(isScopedAutomationAllowedAction("post-merge.sync-local.run")).toBe(false);
    expect(isScopedAutomationAllowedAction("landing-queue.merge-next")).toBe(false);
  });

  it("executes multiple allowed workflow actions under one scoped authorization", async () => {
    const dispatched: Array<{ request: WorkflowActionScopeCarrier; auditScope: Record<string, unknown> }> = [];
    const sequence = [
      { kind: "workflow-action" as const, actionType: "planning.decompose" as const, changeId: "change-1" },
      { kind: "workflow-action" as const, actionType: "planning.decomposition.confirm" as const, changeId: "change-1", decompositionPlanId: "decomp-1" },
      { kind: "workflow-action" as const, actionType: "planning.decomposition.assess-readiness" as const, changeId: "change-1", decompositionPlanId: "decomp-1" },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { gitHead: "head-1", statusShort: [], capturedAt: "2026-06-24T00:00:00.000Z" },
      acceptedArtifactHashes: { spec: "spec", plan: "plan", tasks: "tasks", acMap: "ac" },
      request: baseRequest({ maxSteps: 5 }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request, auditScope) => {
          dispatched.push({ request, auditScope });
          return { ok: true, actionType: request.actionType };
        },
        summarizeChildResult: (gate) => `${gate.kind === "workflow-action" ? gate.actionType : gate.actionId} completed`,
      },
    });

    expect(result.authorization.mode).toBe("full-access");
    expect(result.authorization.codexRuntimeCapability).toBe("full-access");
    expect(result.authorization.applyAuthorized).toBe(true);
    expect(result.authorization.closeAuthorized).toBe(true);
    expect(result.automationRun.status).toBe("stopped");
    expect(result.automationRun.completedSteps).toBe(3);
    expect(result.stopReason).toBe("no-primary-gate");
    expect(dispatched).toHaveLength(3);
    expect(dispatched[0]?.auditScope).toMatchObject({
      coveredByAutomationAuthorizationId: result.authorization.id,
      automationRunId: result.automationRun.id,
      automationIterationOrdinal: 1,
    });
    expect(dispatched[0]?.request).toMatchObject({
      actionType: "planning.decompose",
      automationAuthorizationId: result.authorization.id,
      automationRunId: result.automationRun.id,
    });
  });

  it("can prepare Goal Loop evidence before controlled scheduler continuation without allowing raw scheduler gates", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      { kind: "workflow-action", actionType: "planning.goal-loop.evaluate", changeId: "change-1" },
      {
        kind: "workflow-action",
        actionType: "planning.goal-loop.controller.refresh",
        changeId: "change-1",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
      {
        kind: "workflow-action",
        actionType: "planning.goal-loop.gate-readiness.prepare",
        changeId: "change-1",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopControllerPolicyId: "policy-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
      {
        kind: "workflow-action",
        actionType: "planning.goal-loop.controlled-continue.run",
        changeId: "change-1",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopControllerPolicyId: "policy-1",
        goalLoopGateReadinessPreflightId: "preflight-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
      { kind: "workflow-action", actionType: "planning.scheduler.worker.start-next", changeId: "change-1", schedulerRunId: "scheduler-run-1" },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-25T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest({ automationCurrentGateActionType: "planning.goal-loop.evaluate", maxSteps: 5 }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { ok: true, actionType: request.kind === "workflow-action" ? request.actionType : request.actionId };
        },
        summarizeChildResult: (gate) => `${gate.kind === "workflow-action" ? gate.actionType : gate.actionId} completed`,
      },
    });

    expect(result.stopReason).toBe("unsupported-gate");
    expect(dispatched.map((gate) => gate.kind === "workflow-action" ? gate.actionType : gate.actionId)).toEqual([
      "planning.goal-loop.evaluate",
      "planning.goal-loop.controller.refresh",
      "planning.goal-loop.gate-readiness.prepare",
      "planning.goal-loop.controlled-continue.run",
    ]);
    expect(dispatched.some((gate) => gate.kind === "workflow-action" && gate.actionType === "planning.scheduler.worker.start-next")).toBe(false);
  });

  it("stops when an allowed gate repeats without advancing the primary surface", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const repeatedGate: ScopedAutomationChildGate = {
      kind: "workflow-action",
      actionType: "planning.goal-loop.evaluate",
      changeId: "change-1",
    };

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-25T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest({ automationCurrentGateActionType: "planning.goal-loop.evaluate", maxSteps: 5 }),
      services: {
        resolveCurrentPrimaryGate: async () => repeatedGate,
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { ok: true, actionType: request.kind === "workflow-action" ? request.actionType : request.actionId };
        },
        summarizeChildResult: (gate) => `${gate.kind === "workflow-action" ? gate.actionType : gate.actionId} completed`,
      },
    });

    expect(dispatched).toHaveLength(1);
    expect(result.stopReason).toBe("no-progress");
    expect(result.summary).toContain("did not advance");
    expect(result.automationRun.completedSteps).toBe(1);
  });

  it("executes bounded recovery workflow gates, safe audit accept, and local apply", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      { kind: "workflow-action", actionType: "result.refresh-rework", changeId: "change-1", worktreeId: "wt-1" },
      { kind: "workflow-action", actionType: "result.revalidate", changeId: "change-1", worktreeId: "wt-2" },
      { kind: "workflow-action", actionType: "result.reaudit", changeId: "change-1", worktreeId: "wt-2" },
      {
        kind: "approval-action",
        actionId: "audit.accept",
        changeId: "change-1",
        targetId: "audit-2",
        runId: "audit-run-2",
        artifact: "runs/audit-run-2/audit.json",
        action: { actionId: "audit.accept", args: ["accept", "project-1", "audit-2"] },
      },
      { kind: "approval-action", actionId: "result.apply", changeId: "change-1", targetId: "wt-2", action: { actionId: "result.apply" } },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-24T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest({ automationCurrentGateActionType: "result.refresh-rework", worktreeId: "wt-1", maxSteps: 6 }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return request.kind === "workflow-action"
            ? { actionType: request.actionType, worktreeId: request.worktreeId === "wt-1" ? "wt-2" : request.worktreeId }
            : { actionId: request.actionId, targetId: request.targetId };
        },
        summarizeChildResult: (gate) => `${gate.kind === "workflow-action" ? gate.actionType : gate.actionId} completed`,
      },
    });

    expect(result.stopReason).toBe("no-primary-gate");
    expect(result.automationRun.completedSteps).toBe(5);
    expect(dispatched.map((gate) => gate.kind === "workflow-action" ? gate.actionType : gate.actionId)).toEqual([
      "result.refresh-rework",
      "result.revalidate",
      "result.reaudit",
      "audit.accept",
      "result.apply",
    ]);
    expect(result.iterations.map((iteration) => iteration.currentGateActionType)).toEqual([
      "result.refresh-rework",
      "result.revalidate",
      "result.reaudit",
      "audit.accept",
      "result.apply",
    ]);
    expect(result.authorization.applyAuthorized).toBe(true);
  });

  it("stops at max steps after recovery gates when the next gate is not terminal", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      { kind: "workflow-action", actionType: "result.revalidate", changeId: "change-1", worktreeId: "wt-1" },
      { kind: "workflow-action", actionType: "result.reaudit", changeId: "change-1", worktreeId: "wt-1" },
      { kind: "workflow-action", actionType: "audit.run", changeId: "change-1", worktreeId: "wt-1" },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-24T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest({ automationCurrentGateActionType: "result.revalidate", worktreeId: "wt-1", maxSteps: 2 }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { ok: true };
        },
        summarizeChildResult: (gate) => `${gate.kind === "workflow-action" ? gate.actionType : gate.actionId} completed`,
      },
    });

    expect(result.stopReason).toBe("max-steps");
    expect(result.automationRun.status).toBe("completed");
    expect(result.automationRun.completedSteps).toBe(2);
    expect(dispatched.map((gate) => gate.kind === "workflow-action" ? gate.actionType : gate.actionId)).toEqual([
      "result.revalidate",
      "result.reaudit",
    ]);
  });

  it("finalizes at the step budget without auto-running an integration-check gate", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      {
        kind: "workflow-action",
        actionType: "planning.goal-loop.controlled-continue.run",
        changeId: "change-1",
        goalLoopNextStepPacketId: "packet-1",
        goalLoopControllerPolicyId: "policy-1",
        goalLoopGateReadinessPreflightId: "preflight-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
      {
        kind: "workflow-action",
        actionType: "planning.scheduler.integration-check.run",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerIntegrationCandidateId: "integration-candidate-1",
      },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-25T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest({
        automationCurrentGateActionType: "planning.goal-loop.controlled-continue.run",
        maxSteps: 1,
      }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { ok: true, stopReason: "integration-barrier" };
        },
        summarizeChildResult: (gate) => `${gate.kind === "workflow-action" ? gate.actionType : gate.actionId} completed`,
      },
    });

    expect(result.stopReason).toBe("max-steps");
    expect(result.automationRun.status).toBe("completed");
    expect(result.automationRun.completedSteps).toBe(1);
    expect(dispatched.map((gate) => gate.kind === "workflow-action" ? gate.actionType : gate.actionId)).toEqual([
      "planning.goal-loop.controlled-continue.run",
    ]);
  });

  it("stops before external or aggregate terminal human gates", async () => {
    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-24T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest(),
      services: {
        resolveCurrentPrimaryGate: async () => ({ kind: "approval-action", actionId: "apply-check.apply", changeId: "change-1", targetId: "check-1", action: { actionId: "apply-check.apply" } }),
        dispatchChildAction: async () => {
          throw new Error("should not dispatch");
        },
        summarizeChildResult: () => "unused",
      },
    });

    expect(result.stopReason).toBe("terminal-human-gate");
    expect(result.automationRun.completedSteps).toBe(0);
  });

  it("fails closed when the current child gate belongs to another Change", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-25T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest(),
      services: {
        resolveCurrentPrimaryGate: async () => ({ kind: "workflow-action", actionType: "validate.run", changeId: "change-2", worktreeId: "wt-2" }),
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { ok: true };
        },
        summarizeChildResult: () => "unused",
      },
    });

    expect(result.stopReason).toBe("stale-target");
    expect(result.summary).toContain("authorized Change");
    expect(result.automationRun.completedSteps).toBe(0);
    expect(dispatched).toHaveLength(0);
  });

  it("executes allowed audit.accept approval actions and then local apply", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      {
        kind: "approval-action",
        actionId: "audit.accept",
        changeId: "change-1",
        targetId: "audit-1",
        runId: "audit-run-1",
        artifact: "runs/audit-run-1/audit.json",
        action: { actionId: "audit.accept", args: ["accept", "project-1", "audit-1"] },
      },
      { kind: "approval-action", actionId: "result.apply", changeId: "change-1", targetId: "wt-1", action: { actionId: "result.apply" } },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-24T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest({ automationCurrentGateActionType: undefined, automationCurrentGateApprovalActionId: "audit.accept", automationCurrentGateTargetId: "audit-1" }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { audit: { id: request.kind === "approval-action" ? request.targetId : "unknown" } };
        },
        summarizeChildResult: (gate) => `${gate.kind === "approval-action" ? gate.actionId : gate.actionType} completed`,
      },
    });

    expect(result.authorization.allowedApprovalActionIds).toContain("audit.accept");
    expect(result.stopReason).toBe("no-primary-gate");
    expect(result.automationRun.completedSteps).toBe(2);
    expect(dispatched).toHaveLength(2);
    expect(result.iterations[0]).toMatchObject({
      submittedApprovalActionId: "audit.accept",
      currentGateKind: "approval-action",
      currentGateActionType: "audit.accept",
    });
    expect(result.iterations[1]).toMatchObject({
      submittedApprovalActionId: "result.apply",
      currentGateKind: "approval-action",
      currentGateActionType: "result.apply",
    });
  });

  it("keeps budget exhaustion distinct when maxSteps ends immediately before local apply", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      {
        kind: "approval-action",
        actionId: "audit.accept",
        changeId: "change-1",
        targetId: "audit-1",
        runId: "audit-run-1",
        artifact: "runs/audit-run-1/audit.json",
        action: { actionId: "audit.accept", args: ["accept", "project-1", "audit-1"] },
      },
      { kind: "approval-action", actionId: "result.apply", changeId: "change-1", targetId: "wt-1", action: { actionId: "result.apply" } },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-24T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest({
        automationCurrentGateActionType: undefined,
        automationCurrentGateApprovalActionId: "audit.accept",
        automationCurrentGateTargetId: "audit-1",
        maxSteps: 1,
      }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { audit: { id: request.kind === "approval-action" ? request.targetId : "unknown" } };
        },
        summarizeChildResult: (gate) => `${gate.kind === "approval-action" ? gate.actionId : gate.actionType} completed`,
      },
    });

    expect(result.stopReason).toBe("max-steps");
    expect(result.automationRun.status).toBe("completed");
    expect(result.automationRun.completedSteps).toBe(1);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({ kind: "approval-action", actionId: "audit.accept" });
  });

  it("executes local apply and close under scoped authorization", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      { kind: "approval-action", actionId: "result.apply", changeId: "change-1", targetId: "wt-1", artifact: "runs/audit-1/audit.json", action: { actionId: "result.apply" } },
      { kind: "approval-action", actionId: "change.close", changeId: "change-1", targetId: "change-1", action: { actionId: "change.close" } },
      { kind: "approval-action", actionId: "audit.accept", changeId: "change-1", targetId: "audit-1", action: { actionId: "audit.accept" } },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-25T00:00:00.000Z" },
      acceptedArtifactHashes: { spec: "spec", plan: "plan", tasks: "tasks", acMap: "ac" },
      request: baseRequest({
        automationCurrentGateActionType: undefined,
        automationCurrentGateApprovalActionId: "result.apply",
        automationCurrentGateTargetId: "wt-1",
        maxSteps: 5,
      }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return { actionId: request.kind === "approval-action" ? request.actionId : request.actionType, targetId: request.kind === "approval-action" ? request.targetId : undefined };
        },
        summarizeChildResult: (gate) => `${gate.kind === "approval-action" ? gate.actionId : gate.actionType} completed`,
      },
    });

    expect(result.stopReason).toBe("no-primary-gate");
    expect(result.automationRun.completedSteps).toBe(2);
    expect(dispatched.map((gate) => gate.kind === "approval-action" ? gate.actionId : gate.actionType)).toEqual([
      "result.apply",
      "change.close",
    ]);
    expect(result.authorization.applyAuthorized).toBe(true);
    expect(result.authorization.closeAuthorized).toBe(true);
  });

  it("executes local landing preparation after apply and then local close", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const sequence: ScopedAutomationChildGate[] = [
      { kind: "approval-action", actionId: "result.apply", changeId: "change-1", targetId: "wt-1", artifact: "runs/audit-1/audit.json", action: { actionId: "result.apply" } },
      { kind: "workflow-action", actionType: "landing.prepare", changeId: "change-1", worktreeId: "wt-1" },
      { kind: "approval-action", actionId: "change.close", changeId: "change-1", targetId: "change-1", action: { actionId: "change.close" } },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-25T00:00:00.000Z", statusShort: [] },
      acceptedArtifactHashes: { spec: "spec", plan: "plan", tasks: "tasks", acMap: "ac" },
      request: baseRequest({
        automationCurrentGateActionType: undefined,
        automationCurrentGateApprovalActionId: "result.apply",
        automationCurrentGateTargetId: "wt-1",
        maxSteps: 5,
      }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          return request.kind === "workflow-action"
            ? { actionType: request.actionType, package: { id: "landing-package-1" } }
            : { actionId: request.actionId, targetId: request.targetId };
        },
        summarizeChildResult: (gate) => `${gate.kind === "approval-action" ? gate.actionId : gate.actionType} completed`,
      },
    });

    expect(result.stopReason).toBe("no-primary-gate");
    expect(result.automationRun.completedSteps).toBe(3);
    expect(dispatched.map((gate) => gate.kind === "approval-action" ? gate.actionId : gate.actionType)).toEqual([
      "result.apply",
      "landing.prepare",
      "change.close",
    ]);
    expect(result.iterations[1]).toMatchObject({
      submittedActionType: "landing.prepare",
      currentGateKind: "workflow-action",
      currentGateActionType: "landing.prepare",
    });
  });

  it("does not recreate the active change after close archives it", async () => {
    const dispatched: ScopedAutomationChildGate[] = [];
    const activeRoot = join(tempDir, "harness", "changes", "active", "change-1");
    const archiveRoot = join(tempDir, "harness", "changes", "archive", "20260625-change-1");
    await mkdir(activeRoot, { recursive: true });
    await mkdir(join(tempDir, "harness", "changes", "archive"), { recursive: true });
    const sequence: ScopedAutomationChildGate[] = [
      { kind: "approval-action", actionId: "result.apply", changeId: "change-1", targetId: "wt-1", action: { actionId: "result.apply" } },
      { kind: "approval-action", actionId: "change.close", changeId: "change-1", targetId: "change-1", action: { actionId: "change.close" } },
    ];

    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-25T00:00:00.000Z" },
      acceptedArtifactHashes: { spec: "spec", plan: "plan", tasks: "tasks", acMap: "ac" },
      request: baseRequest({
        automationCurrentGateActionType: undefined,
        automationCurrentGateApprovalActionId: "result.apply",
        automationCurrentGateTargetId: "wt-1",
        maxSteps: 5,
      }),
      services: {
        resolveCurrentPrimaryGate: async () => sequence[dispatched.length] ?? { stopReason: "no-primary-gate", summary: "No gate." },
        dispatchChildAction: async (request) => {
          dispatched.push(request);
          if (request.kind === "approval-action" && request.actionId === "change.close") {
            await rename(activeRoot, archiveRoot);
          }
          return { actionId: request.kind === "approval-action" ? request.actionId : request.actionType };
        },
        summarizeChildResult: (gate) => `${gate.kind === "approval-action" ? gate.actionId : gate.actionType} completed`,
      },
    });

    await expect(access(activeRoot)).rejects.toThrow();
    const archivedRun = JSON.parse(await readFile(join(archiveRoot, "planning", "automation-runtime", `${result.automationRun.id}.json`), "utf8")) as { stopReason?: string; artifact?: string };
    expect(archivedRun.stopReason).toBe("no-primary-gate");
    expect(archivedRun.artifact).toContain("harness/changes/archive/20260625-change-1/planning/automation-runtime/");
    expect(dispatched.map((gate) => gate.kind === "approval-action" ? gate.actionId : gate.actionType)).toEqual([
      "result.apply",
      "change.close",
    ]);
  });

  it("fails closed when source safety reports drift", async () => {
    const result = await runScopedAutomation({
      memory,
      changePath: "harness/changes/active/change-1",
      projectId: "project-1",
      sourceState: { capturedAt: "2026-06-24T00:00:00.000Z" },
      acceptedArtifactHashes: {},
      request: baseRequest(),
      services: {
        checkSafety: async () => ({ stopReason: "source-drift", summary: "source changed" }),
        resolveCurrentPrimaryGate: async () => ({ kind: "workflow-action", actionType: "validate.run" as const, changeId: "change-1", worktreeId: "wt-1" }),
        dispatchChildAction: async () => ({ ok: true }),
        summarizeChildResult: () => "unused",
      },
    });

    expect(result.stopReason).toBe("source-drift");
    expect(result.automationRun.completedSteps).toBe(0);
  });
});

function baseRequest(overrides: Partial<Parameters<typeof runScopedAutomation>[0]["request"]> = {}): Parameters<typeof runScopedAutomation>[0]["request"] {
  return {
    actionType: "planning.automation.scoped-auto.run",
    changeId: "change-1",
    automationMode: "full-access",
    automationCurrentGateActionType: "planning.decomposition.confirm",
    decompositionPlanId: "decomp-1",
    ...overrides,
  };
}

function buildMemory(root: string): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project-1",
    projectRoot: root,
    markerPath: join(root, ".agent-harness", "project.json"),
    agentGuidePath: join(root, "AGENTS.md"),
    memoryRoot: root,
    docsRoot: join(root, "docs"),
    harnessRoot: join(root, "harness"),
    changesRoot: join(root, "harness", "changes"),
    evolutionRoot: join(root, "harness", "evolution"),
    templatesRoot: join(root, "harness", "templates"),
    scriptsRoot: join(root, "scripts"),
    runsRoot: join(root, ".agent-harness", "runs"),
    workbenchRoot: join(root, ".agent-harness", "workbench"),
    workbenchDbPath: join(root, ".agent-harness", "workbench", "workbench.sqlite"),
    agentsRoot: join(root, ".agents"),
    commandsRoot: join(root, ".agents", "commands"),
    agentCatalogPath: join(root, ".agents", "agents.json"),
    skillsRoot: join(root, ".agents", "skills"),
    worktreeMetadataRoot: join(root, ".agent-harness", "worktrees"),
    worktreeIndexPath: join(root, ".agent-harness", "worktrees", "index.json"),
  };
}
