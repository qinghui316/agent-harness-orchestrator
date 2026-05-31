import { describe, expect, it } from "vitest";
import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  recordMainAgentOrchestrationStep,
} from "../../src/agent-task/orchestration-engine.js";

describe("main-agent orchestration decision engine", () => {
  it("starts with coder and advances through validator, auditor, and completed", () => {
    let state = createMainAgentOrchestrationState({ changeId: "change-a" });
    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "delegate-role", roleId: "coder-agent" });

    state = recordMainAgentOrchestrationStep(state, {
      roleId: "coder-agent",
      status: "completed",
      inputArtifacts: [],
      outputArtifacts: ["runs/run-code"],
      summary: "Coder completed.",
    });
    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "delegate-role", roleId: "validator" });

    state = recordMainAgentOrchestrationStep(state, {
      roleId: "validator",
      status: "completed",
      inputArtifacts: ["runs/run-code"],
      outputArtifacts: ["runs/run-validation/validation.json"],
      summary: "Validation passed.",
    });
    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "delegate-role", roleId: "auditor-agent" });

    state = recordMainAgentOrchestrationStep(state, {
      roleId: "auditor-agent",
      status: "completed",
      inputArtifacts: ["runs/run-validation/validation.json"],
      outputArtifacts: ["runs/run-audit/audit.md"],
      summary: "Audit approved.",
    });
    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "completed" });
  });

  it("sends validation failure to rework once and then back to validation", () => {
    let state = createMainAgentOrchestrationState({ changeId: "change-b" });
    state = recordMainAgentOrchestrationStep(state, {
      roleId: "coder-agent",
      status: "completed",
      inputArtifacts: [],
      outputArtifacts: ["runs/run-code"],
      summary: "Coder completed.",
    });
    state = recordMainAgentOrchestrationStep(state, {
      roleId: "validator",
      status: "failed",
      inputArtifacts: ["runs/run-code"],
      outputArtifacts: ["runs/run-validation/validation.json"],
      failureClassification: "validation-failure",
      stoppedAt: "validation",
      summary: "Validation failed.",
    });
    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "delegate-role", roleId: "rework-coder", attemptKind: "rework" });

    state = recordMainAgentOrchestrationStep(state, {
      roleId: "rework-coder",
      status: "completed",
      inputArtifacts: ["runs/run-validation/validation.json"],
      outputArtifacts: ["runs/run-rework"],
      summary: "Rework completed.",
    });
    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "delegate-role", roleId: "validator" });
  });

  it("stops for user input when rework budget is exhausted", () => {
    let state = createMainAgentOrchestrationState({ changeId: "change-c", maxReworkAttempts: 1 });
    state = recordMainAgentOrchestrationStep(state, {
      roleId: "coder-agent",
      status: "completed",
      inputArtifacts: [],
      outputArtifacts: ["runs/run-code"],
      summary: "Coder completed.",
    });
    state = recordMainAgentOrchestrationStep(state, {
      roleId: "validator",
      status: "failed",
      inputArtifacts: ["runs/run-code"],
      outputArtifacts: ["runs/run-validation"],
      failureClassification: "validation-failure",
      stoppedAt: "validation",
      summary: "Validation failed.",
    });
    state = recordMainAgentOrchestrationStep(state, {
      roleId: "rework-coder",
      status: "completed",
      inputArtifacts: ["runs/run-validation"],
      outputArtifacts: ["runs/run-rework"],
      summary: "Rework completed.",
    });
    state = recordMainAgentOrchestrationStep(state, {
      roleId: "auditor-agent",
      status: "failed",
      inputArtifacts: ["runs/run-rework"],
      outputArtifacts: ["runs/run-audit"],
      failureClassification: "audit-failure",
      stoppedAt: "audit",
      summary: "Audit failed.",
    });

    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "needs-user-input", stoppedAt: "audit" });
  });

  it("does not continue after coder boundary or code failure", () => {
    let state = createMainAgentOrchestrationState({ changeId: "change-d" });
    state = recordMainAgentOrchestrationStep(state, {
      roleId: "coder-agent",
      status: "failed",
      inputArtifacts: [],
      outputArtifacts: ["runs/run-code"],
      failureClassification: "boundary-violation",
      stoppedAt: "boundary",
      summary: "Boundary failed.",
    });
    expect(decideNextMainAgentOrchestration(state)).toMatchObject({ kind: "failed", stoppedAt: "boundary" });
  });
});
