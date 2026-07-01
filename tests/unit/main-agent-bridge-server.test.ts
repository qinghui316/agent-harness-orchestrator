import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assessMainAgentActionBridge: vi.fn(),
  getWorkbenchSnapshot: vi.fn(),
  recordWorkbenchDecision: vi.fn(),
  runAllowlistedAction: vi.fn(),
  runWorkbenchWorkflowAction: vi.fn(),
}));

vi.mock("../../src/main-agent-orchestration/index.js", () => ({
  assessMainAgentActionBridge: mocks.assessMainAgentActionBridge,
}));

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => ({ memoryRoot: "memory-root" })),
}));

vi.mock("../../src/workbench/manager.js", () => ({
  getWorkbenchSnapshot: mocks.getWorkbenchSnapshot,
}));

vi.mock("../../src/workbench/chat.js", () => ({
  recordWorkbenchDecision: mocks.recordWorkbenchDecision,
  runWorkbenchWorkflowAction: mocks.runWorkbenchWorkflowAction,
}));

vi.mock("../../src/server/workbench/approval-actions.js", () => ({
  allowedActionIds: new Set(["result.apply", "audit.accept", "change.close"]),
  inferArtifactFromActionResult: vi.fn(() => null),
  inferChangeIdFromAction: vi.fn(() => "change-1"),
  inferRunIdFromActionResult: vi.fn(() => null),
  inferTargetIdFromAction: vi.fn(() => "wt-1"),
  runAllowlistedAction: mocks.runAllowlistedAction,
}));

import { executeWorkbenchAction } from "../../src/server/workbench/actions.js";

const project = {
  id: "repo",
  name: "Repo",
  path: "project-root",
  addedAt: "2026-06-18T00:00:00.000Z",
  lastSeenAt: "2026-06-18T00:00:00.000Z",
};

const applyAction = {
  actionId: "result.apply",
  label: "Apply result",
  command: "result",
  args: ["result", "apply", "change-1", "wt-1"],
  mutates: true,
  requiresConfirmation: true,
};

function approvalSnapshot(enabled = true) {
  return {
    right: {
      confirmationQueue: {
        primary: {
          id: "result:change-1:wt-1",
          kind: "single-result-apply",
          changeId: "change-1",
          resultId: "wt-1",
          worktreeId: "wt-1",
          runId: "run-1",
          evidenceRefs: ["artifact/result-review.json"],
          actions: [{
            id: "apply:change-1:wt-1",
            kind: "approval",
            changeId: "change-1",
            worktreeId: "wt-1",
            runId: "run-1",
            artifact: "artifact/result-review.json",
            enabled,
            action: applyAction,
          }],
        },
        current: [],
        otherDemands: [],
        maintenance: [],
      },
    },
  };
}

describe("main-agent bridge server action acceptance", () => {
  beforeEach(() => {
    mocks.assessMainAgentActionBridge.mockReset();
    mocks.getWorkbenchSnapshot.mockReset();
    mocks.recordWorkbenchDecision.mockReset();
    mocks.runAllowlistedAction.mockReset();
    mocks.runWorkbenchWorkflowAction.mockReset();
    mocks.assessMainAgentActionBridge.mockResolvedValue({
      status: "ready",
      authority: "non-executing-main-agent-action-bridge-assessment",
      executionStarted: false,
    });
    mocks.getWorkbenchSnapshot.mockResolvedValue(approvalSnapshot());
    mocks.runAllowlistedAction.mockResolvedValue({ apply: { changeId: "change-1", worktreeId: "wt-1" } });
  });

  it("validates explicit main-agent evidence before running an approval action", async () => {
    await expect(executeWorkbenchAction({ project, path: "project-root" }, {
      action: applyAction,
      confirm: true,
      changeId: "change-1",
      mainAgentLoopRunId: "loop-1",
      mainAgentNextStepEvidenceId: "decision-1",
    })).resolves.toEqual(expect.objectContaining({ result: expect.anything() }));

    expect(mocks.assessMainAgentActionBridge).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "repo",
      changeId: "change-1",
      loopRunId: "loop-1",
      evidenceId: "decision-1",
      gate: expect.objectContaining({
        kind: "approval-action",
        actionId: "result.apply",
        enabled: true,
        targetId: "wt-1",
      }),
    }));
    expect(mocks.runAllowlistedAction).toHaveBeenCalledWith(project, applyAction, undefined);
  });

  it("fails closed for non-ready approval bridge assessments before action execution", async () => {
    mocks.assessMainAgentActionBridge.mockResolvedValueOnce({
      status: "target-mismatch",
      authority: "non-executing-main-agent-action-bridge-assessment",
      executionStarted: false,
    });

    await expect(executeWorkbenchAction({ project, path: "project-root" }, {
      action: applyAction,
      confirm: true,
      changeId: "change-1",
      mainAgentLoopRunId: "loop-1",
      mainAgentNextStepEvidenceId: "decision-1",
    })).rejects.toThrow("Main-agent decision evidence is stale");

    expect(mocks.runAllowlistedAction).not.toHaveBeenCalled();
  });

  it("fails closed for partial approval bridge ids before snapshot lookup", async () => {
    await expect(executeWorkbenchAction({ project, path: "project-root" }, {
      action: applyAction,
      confirm: true,
      changeId: "change-1",
      mainAgentLoopRunId: "loop-1",
    })).rejects.toThrow("Main-agent decision evidence is stale");

    expect(mocks.getWorkbenchSnapshot).not.toHaveBeenCalled();
    expect(mocks.assessMainAgentActionBridge).not.toHaveBeenCalled();
    expect(mocks.runAllowlistedAction).not.toHaveBeenCalled();
  });

  it("keeps approval action behavior unchanged when bridge ids are absent", async () => {
    await expect(executeWorkbenchAction({ project, path: "project-root" }, {
      action: applyAction,
      confirm: true,
      changeId: "change-1",
    })).resolves.toEqual(expect.objectContaining({ result: expect.anything() }));

    expect(mocks.assessMainAgentActionBridge).not.toHaveBeenCalled();
    expect(mocks.runAllowlistedAction).toHaveBeenCalledWith(project, applyAction, undefined);
  });
});
