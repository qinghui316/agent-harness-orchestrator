import { describe, expect, it } from "vitest";
import {
  createWorkflowRuntimeExecutionState,
  recordWorkflowRuntimeExecutionStep,
} from "../../src/workflow-runtime/execution-contract.js";

describe("workflow runtime execution contract", () => {
  it("creates empty state with the default bounded rework budget", () => {
    expect(createWorkflowRuntimeExecutionState({ changeId: "change-a" })).toEqual({
      changeId: "change-a",
      steps: [],
      maxReworkAttempts: 1,
    });
  });

  it("preserves explicit steps and bounded rework budget", () => {
    const state = createWorkflowRuntimeExecutionState({
      changeId: "change-b",
      maxReworkAttempts: 2,
      steps: [{
        roleId: "coder-agent",
        status: "completed",
        inputArtifacts: [],
        outputArtifacts: ["runs/run-code"],
        summary: "Coder completed.",
      }],
    });

    expect(state).toMatchObject({
      changeId: "change-b",
      maxReworkAttempts: 2,
      steps: [{ roleId: "coder-agent", status: "completed" }],
    });
  });

  it("records steps immutably for runtime leaf evidence", () => {
    const initial = createWorkflowRuntimeExecutionState({ changeId: "change-c" });
    const next = recordWorkflowRuntimeExecutionStep(initial, {
      roleId: "validator",
      status: "failed",
      inputArtifacts: ["runs/run-code"],
      outputArtifacts: ["validation/validation.json"],
      failureClassification: "validation-failure",
      stoppedAt: "validation",
      summary: "Validation failed.",
    });

    expect(initial.steps).toEqual([]);
    expect(next.steps).toEqual([{
      roleId: "validator",
      status: "failed",
      inputArtifacts: ["runs/run-code"],
      outputArtifacts: ["validation/validation.json"],
      failureClassification: "validation-failure",
      stoppedAt: "validation",
      summary: "Validation failed.",
    }]);
  });
});
