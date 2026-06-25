import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGoalLoopControlledContinuation } from "../../src/goal-loop-runtime/runner.js";
import type { ResolvedMemory } from "../../src/types/index.js";
import type { WorkflowActionScopeCarrier } from "../../src/workflow-actions/registry.js";

describe("Goal Loop controlled continuation runtime", () => {
  let tempDir: string;
  let memory: ResolvedMemory;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-goal-loop-runtime-"));
    memory = buildMemory(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("executes multiple controlled scheduler steps under one authorization and records child audit scope", async () => {
    const dispatched: Array<{ request: WorkflowActionScopeCarrier; auditScope: Record<string, unknown> }> = [];
    const result = await runGoalLoopControlledContinuation({
      memory,
      changePath: "harness/changes/active/change-1",
      request: baseRequest({ maxSteps: 5 }),
      services: {
        resolveCurrentControlledAdvanceRequest: async () => {
          if (dispatched.length >= 2) {
            return { stopReason: "no-current-gate", summary: "No current gate." };
          }
          return controlledAdvanceRequest(`claim-${dispatched.length + 1}`);
        },
        dispatchControlledAdvance: async (request, auditScope) => {
          dispatched.push({ request, auditScope });
          return { controlledAdvance: { goalLoopGateReadinessPreflightId: `preflight-child-${dispatched.length}` } };
        },
        summarizeChildResult: () => "child step completed",
      },
    });

    expect(result.runtimeRun.status).toBe("stopped");
    expect(result.runtimeRun.completedSteps).toBe(2);
    expect(result.stopReason).toBe("no-current-gate");
    expect(result.iterations).toHaveLength(2);
    expect(dispatched).toHaveLength(2);
    for (const [index, item] of dispatched.entries()) {
      expect(item.request).toMatchObject({
        actionType: "planning.scheduler.controlled-advance.run",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      });
      expect(item.auditScope).toMatchObject({
        coveredByGoalLoopRuntimeAuthorizationId: result.authorization.id,
        goalLoopRuntimeRunId: result.runtimeRun.id,
        goalLoopRuntimeIterationOrdinal: index + 1,
      });
      expect(result.iterations[index]?.childAuditScope).toMatchObject({
        coveredByGoalLoopRuntimeAuthorizationId: result.authorization.id,
        goalLoopRuntimeRunId: result.runtimeRun.id,
      });
    }
    expect(result.artifactRefs).toEqual(expect.arrayContaining([
      result.authorization.artifact,
      result.runtimeRun.artifact,
      result.iterations[0]!.artifact,
      result.iterations[1]!.artifact,
    ]));
  });

  it("stops at the hard max even when a larger budget is requested", async () => {
    let count = 0;
    const result = await runGoalLoopControlledContinuation({
      memory,
      changePath: "harness/changes/active/change-1",
      request: baseRequest({ maxSteps: 99 }),
      services: {
        resolveCurrentControlledAdvanceRequest: async () => controlledAdvanceRequest(`claim-${count + 1}`),
        dispatchControlledAdvance: async () => {
          count += 1;
          return { ok: true };
        },
        summarizeChildResult: () => "child step completed",
      },
    });

    expect(count).toBe(10);
    expect(result.authorization.maxSteps).toBe(10);
    expect(result.runtimeRun.status).toBe("completed");
    expect(result.stopReason).toBe("max-steps");
  });

  it("fails closed when a child controlled advance handler fails", async () => {
    const result = await runGoalLoopControlledContinuation({
      memory,
      changePath: "harness/changes/active/change-1",
      request: baseRequest({ maxSteps: 3 }),
      services: {
        resolveCurrentControlledAdvanceRequest: async () => controlledAdvanceRequest("claim-1"),
        dispatchControlledAdvance: async () => {
          throw new Error("stale target");
        },
        summarizeChildResult: () => "unused",
      },
    });

    expect(result.runtimeRun.status).toBe("failed");
    expect(result.stopReason).toBe("handler-failed");
    expect(result.iterations).toHaveLength(1);
    expect(result.iterations[0]).toMatchObject({
      status: "failed",
      stopReason: "handler-failed",
      error: "stale target",
    });
  });

  it("fails closed before dispatching a controlled advance for another Change", async () => {
    const dispatched: WorkflowActionScopeCarrier[] = [];
    const result = await runGoalLoopControlledContinuation({
      memory,
      changePath: "harness/changes/active/change-1",
      request: baseRequest({ maxSteps: 3 }),
      services: {
        resolveCurrentControlledAdvanceRequest: async () => ({
          ...controlledAdvanceRequest("claim-1"),
          changeId: "change-2",
        }),
        dispatchControlledAdvance: async (request) => {
          dispatched.push(request);
          return { ok: true };
        },
        summarizeChildResult: () => "unused",
      },
    });

    expect(result.runtimeRun.status).toBe("stopped");
    expect(result.stopReason).toBe("stale-target");
    expect(result.summary).toContain("authorized Change");
    expect(result.runtimeRun.completedSteps).toBe(0);
    expect(dispatched).toHaveLength(0);
  });
});

function baseRequest(overrides: Partial<Parameters<typeof runGoalLoopControlledContinuation>[0]["request"]> = {}): Parameters<typeof runGoalLoopControlledContinuation>[0]["request"] {
  return {
    actionType: "planning.goal-loop.controlled-continue.run",
    changeId: "change-1",
    goalLoopNextStepPacketId: "packet-1",
    goalLoopControllerPolicyId: "policy-1",
    goalLoopGateReadinessPreflightId: "preflight-1",
    goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
    schedulerRunId: "scheduler-run-1",
    schedulerClaimReservationId: "claim-1",
    reservationIntentId: "reservation-1",
    claimIntentId: "claim-intent-1",
    ...overrides,
  };
}

function controlledAdvanceRequest(claimId: string): WorkflowActionScopeCarrier & { actionType: "planning.scheduler.controlled-advance.run" } {
  return {
    actionType: "planning.scheduler.controlled-advance.run",
    changeId: "change-1",
    goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
    schedulerRunId: "scheduler-run-1",
    schedulerClaimReservationId: claimId,
    reservationIntentId: `reservation-${claimId}`,
    claimIntentId: `intent-${claimId}`,
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
