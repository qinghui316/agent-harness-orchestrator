import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordMainAgentOrchestrationStep,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationState,
} from "../../src/agent-task/orchestration-engine.js";
import type { ManagedProject } from "../../src/types/index.js";

type MockLeafInput = {
  orchestration: MainAgentOrchestrationState;
  decision: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>;
};

const controls = vi.hoisted(() => ({
  validatorOutcomes: [] as Array<"completed" | "failed">,
  auditorOutcomes: [] as Array<"completed" | "failed">,
}));

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => ({ root: "memory-root" })),
}));

vi.mock("../../src/main-agent-orchestration/leaf-stages.js", () => {
  function codeRun(label: string) {
    return {
      run: {
        id: label,
        status: "completed",
        worktree: { worktreeId: `${label}-worktree` },
        artifacts: { directory: `runs/${label}` },
      },
    };
  }

  function validationRun(label: string, status: "passed" | "failed") {
    return {
      id: label,
      status,
      artifacts: { directory: `validation/${label}` },
    };
  }

  function auditRun(label: string, status: "approved" | "blocked") {
    return {
      id: label,
      status,
      artifacts: { directory: `audit/${label}` },
    };
  }

  return {
    runCoderLeafStage: vi.fn(async (input: MockLeafInput) => {
      const code = codeRun("code");
      return {
        leaf: "coder",
        roleId: "coder-agent",
        status: "completed",
        code,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "coder-agent",
          status: "completed",
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["runs/code"],
          summary: "Coder completed.",
        }),
      };
    }),
    runReworkCoderLeafStage: vi.fn(async (input: MockLeafInput) => {
      const code = codeRun("rework");
      return {
        leaf: "coder",
        roleId: "rework-coder",
        status: "completed",
        code,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "rework-coder",
          status: "completed",
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["runs/rework"],
          summary: "Rework completed.",
        }),
      };
    }),
    runValidatorLeafStage: vi.fn(async (input: MockLeafInput) => {
      const outcome = controls.validatorOutcomes.shift() ?? "completed";
      const validation = validationRun("validation", outcome === "completed" ? "passed" : "failed");
      return {
        leaf: "validator",
        roleId: "validator",
        status: outcome,
        validation,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "validator",
          status: outcome,
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["validation/validation"],
          ...(outcome === "failed" ? { failureClassification: "validation-failure", stoppedAt: "validation" } : {}),
          summary: outcome === "completed" ? "Validation passed." : "Validation failed.",
        }),
      };
    }),
    runAuditorLeafStage: vi.fn(async (input: MockLeafInput) => {
      const outcome = controls.auditorOutcomes.shift() ?? "completed";
      const audit = auditRun("audit", outcome === "completed" ? "approved" : "blocked");
      return {
        leaf: "auditor",
        roleId: "auditor-agent",
        status: outcome,
        audit,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "auditor-agent",
          status: outcome,
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["audit/audit"],
          ...(outcome === "failed" ? { failureClassification: "audit-failure", stoppedAt: "audit" } : {}),
          summary: outcome === "completed" ? "Audit approved." : "Audit failed.",
        }),
      };
    }),
  };
});

import {
  runMainAgentOrchestration,
  runMainAgentSourceRefreshRework,
  runMainAgentTaskRunAttempt,
} from "../../src/main-agent-orchestration/index.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
} from "../../src/main-agent-orchestration/leaf-stages.js";

const project: ManagedProject = {
  id: "project",
  name: "project",
  path: "E:/tmp/project",
  addedAt: "2026-06-30T00:00:00.000Z",
  lastSeenAt: "2026-06-30T00:00:00.000Z",
};

describe("main-agent step loop contract", () => {
  beforeEach(() => {
    controls.validatorOutcomes = [];
    controls.auditorOutcomes = [];
    vi.clearAllMocks();
  });

  it("keeps TaskRun entrypoints single-attempt when validation fails", async () => {
    controls.validatorOutcomes = ["failed"];

    const result = await runMainAgentTaskRunAttempt({
      project,
      changeId: "change-task-run",
      taskIds: ["task-1"],
      taskRunId: "task-run-1",
    });

    expect(runCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runReworkCoderLeafStage).not.toHaveBeenCalled();
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("validation");
    expect(result.status).toBeUndefined();
  });

  it("allows only the top-level runner to perform one automatic rework", async () => {
    controls.validatorOutcomes = ["failed", "completed"];

    const result = await runMainAgentOrchestration({
      project,
      changeId: "change-top-level",
    });

    expect(runCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(2);
    expect(runAuditorLeafStage).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
    expect(result.reworkUsed).toBe(1);
    expect(result.attempts).toHaveLength(2);
  });

  it("does not nest automatic rework for source-refresh rework entrypoints", async () => {
    controls.validatorOutcomes = ["failed"];

    const result = await runMainAgentSourceRefreshRework({
      project,
      changeId: "change-source-refresh",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("validation");
    expect(result.status).toBeUndefined();
  });
});
