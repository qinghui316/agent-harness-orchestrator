import { describe, expect, it } from "vitest";
import { HarnessWorkflowRunEngine, type HarnessWorkflowRunEngineServices } from "../../src/workflow-runtime/code-workflow.js";
import type {
  DefaultCodeChangeWorkflowRun,
  ManagedProject,
  ResolvedMemory,
} from "../../src/types/index.js";
import type { WorkflowRuntimeExecutionState } from "../../src/workflow-runtime/execution-contract.js";
import type {
  AuditLeafRun,
  CodeLeafRun,
  WorkflowRuntimeAuditorLeafResult,
  WorkflowRuntimeCoderLeafResult,
  WorkflowRuntimeValidatorLeafResult,
  ValidationLeafRun,
} from "../../src/workflow-runtime/leaf-execution.js";

describe("HarnessWorkflowRunEngine default code-change workflow", () => {
  it("runs coder, validation, and audit to completion", async () => {
    const calls: string[] = [];
    const engine = new HarnessWorkflowRunEngine(fakeServices({
      calls,
      validationStatuses: ["completed"],
      auditStatuses: ["completed"],
    }));

    const result = await engine.runDefaultCodeChangeWorkflow({ project: project(), changeId: "change-success" });

    expect(result.status).toBe("completed");
    expect(result.workflowRun.source).toBe("default-code-change-workflow");
    expect(result.workflowRun.status).toBe("completed");
    expect(result.workflowRun.nodes.find((node) => node.nodeId === "coder")?.status).toBe("completed");
    expect(result.workflowRun.nodes.find((node) => node.nodeId === "validation")?.status).toBe("completed");
    expect(result.workflowRun.nodes.find((node) => node.nodeId === "audit")?.status).toBe("completed");
    expect(result.workflowRun.reworkAttempts).toBe(0);
    expect(calls).toEqual(["coder", "validator", "auditor"]);
  });

  it("routes a validation failure through one rework attempt before audit", async () => {
    const calls: string[] = [];
    const engine = new HarnessWorkflowRunEngine(fakeServices({
      calls,
      validationStatuses: ["failed", "completed"],
      auditStatuses: ["completed"],
    }));

    const result = await engine.runDefaultCodeChangeWorkflow({ project: project(), changeId: "change-validation-rework" });

    expect(result.status).toBe("completed");
    expect(result.reworkUsed).toBe(1);
    expect(result.workflowRun.reworkAttempts).toBe(1);
    expect(result.workflowRun.nodes.find((node) => node.nodeId === "rework-coder")?.status).toBe("completed");
    expect(calls).toEqual(["coder", "validator", "rework-coder", "validator", "auditor"]);
  });

  it("routes an audit failure through one rework attempt", async () => {
    const calls: string[] = [];
    const engine = new HarnessWorkflowRunEngine(fakeServices({
      calls,
      validationStatuses: ["completed", "completed"],
      auditStatuses: ["failed", "completed"],
    }));

    const result = await engine.runDefaultCodeChangeWorkflow({ project: project(), changeId: "change-audit-rework" });

    expect(result.status).toBe("completed");
    expect(result.reworkUsed).toBe(1);
    expect(calls).toEqual(["coder", "validator", "auditor", "rework-coder", "validator", "auditor"]);
  });

  it("stops for user input when the bounded rework budget is exhausted", async () => {
    const calls: string[] = [];
    const engine = new HarnessWorkflowRunEngine(fakeServices({
      calls,
      validationStatuses: ["failed", "failed"],
      auditStatuses: [],
    }));

    const result = await engine.runDefaultCodeChangeWorkflow({ project: project(), changeId: "change-budget" });

    expect(result.status).toBe("needs-user-input");
    expect(result.requiresUserInput).toBe(true);
    expect(result.stoppedAt).toBe("validation");
    expect(result.workflowRun.status).toBe("blocked");
    expect(calls).toEqual(["coder", "validator", "rework-coder", "validator"]);
  });

  it("fails closed when coder fails before validation", async () => {
    const calls: string[] = [];
    const engine = new HarnessWorkflowRunEngine(fakeServices({
      calls,
      codeStatuses: ["failed"],
      validationStatuses: ["completed"],
      auditStatuses: ["completed"],
    }));

    const result = await engine.runDefaultCodeChangeWorkflow({ project: project(), changeId: "change-code-failed" });

    expect(result.status).toBe("failed");
    expect(result.stoppedAt).toBe("code");
    expect(result.workflowRun.status).toBe("failed");
    expect(calls).toEqual(["coder"]);
  });
});

function fakeServices(input: {
  calls: string[];
  codeStatuses?: Array<"completed" | "failed">;
  validationStatuses: Array<"completed" | "failed">;
  auditStatuses: Array<"completed" | "failed">;
}): HarnessWorkflowRunEngineServices {
  let run: DefaultCodeChangeWorkflowRun | null = null;
  let codeIndex = 0;
  let validationIndex = 0;
  let auditIndex = 0;
  return {
    resolveMemory: async () => memory(),
    writeRun: async (_memory, next) => {
      run = next;
      return next;
    },
    updateRun: async (_memory, next) => {
      run = next;
      return next;
    },
    appendEvent: async () => undefined,
    runCoder: async (leafInput) => {
      input.calls.push("coder");
      const status = input.codeStatuses?.[codeIndex++] ?? "completed";
      return coderResult("coder-agent", status, leafInput.orchestration);
    },
    runReworkCoder: async (leafInput) => {
      input.calls.push("rework-coder");
      const status = input.codeStatuses?.[codeIndex++] ?? "completed";
      return coderResult("rework-coder", status, leafInput.orchestration);
    },
    runValidator: async (leafInput) => {
      input.calls.push("validator");
      const status = input.validationStatuses[validationIndex++] ?? "completed";
      return validatorResult(status, leafInput.orchestration);
    },
    runAuditor: async (leafInput) => {
      input.calls.push("auditor");
      const status = input.auditStatuses[auditIndex++] ?? "completed";
      return auditorResult(status, leafInput.orchestration);
    },
  };

  void run;
}

function coderResult(roleId: "coder-agent" | "rework-coder", status: "completed" | "failed", orchestration: WorkflowRuntimeExecutionState): WorkflowRuntimeCoderLeafResult {
  return {
    leaf: "coder",
    roleId,
    status,
    stoppedAt: status === "failed" ? "code" : undefined,
    code: status === "completed" ? codeRun(roleId) : undefined,
    orchestration: appendStep(orchestration, roleId, status, status === "failed" ? "code-failure" : undefined),
  };
}

function validatorResult(status: "completed" | "failed", orchestration: WorkflowRuntimeExecutionState): WorkflowRuntimeValidatorLeafResult {
  return {
    leaf: "validator",
    roleId: "validator",
    status,
    stoppedAt: status === "failed" ? "validation" : undefined,
    validation: validationRun(status),
    orchestration: appendStep(orchestration, "validator", status, status === "failed" ? "validation-failure" : undefined),
  };
}

function auditorResult(status: "completed" | "failed", orchestration: WorkflowRuntimeExecutionState): WorkflowRuntimeAuditorLeafResult {
  return {
    leaf: "auditor",
    roleId: "auditor-agent",
    status,
    stoppedAt: status === "failed" ? "audit" : undefined,
    audit: auditRun(status),
    orchestration: appendStep(orchestration, "auditor-agent", status, status === "failed" ? "audit-failure" : undefined),
  };
}

function appendStep(
  orchestration: WorkflowRuntimeExecutionState,
  roleId: "coder-agent" | "validator" | "auditor-agent" | "rework-coder",
  status: "completed" | "failed",
  failureClassification?: "code-failure" | "validation-failure" | "audit-failure",
): WorkflowRuntimeExecutionState {
  return {
    ...orchestration,
    steps: [
      ...orchestration.steps,
      {
        roleId,
        status,
        inputArtifacts: [],
        outputArtifacts: [`artifact:${roleId}:${status}`],
        failureClassification,
        stoppedAt: failureClassification === "validation-failure" ? "validation" : failureClassification === "audit-failure" ? "audit" : failureClassification === "code-failure" ? "code" : undefined,
        summary: `${roleId} ${status}`,
      },
    ],
  };
}

function codeRun(roleId: string): CodeLeafRun {
  return {
    run: {
      id: `run-${roleId}`,
      changeId: "change",
      status: "completed",
      runtime: "codex",
      taskIds: [],
      artifacts: {
        directory: `runs/${roleId}`,
        implementation: `runs/${roleId}/implementation.md`,
      },
      worktree: { worktreeId: `worktree-${roleId}` },
    },
    warnings: [],
  } as unknown as CodeLeafRun;
}

function validationRun(status: "completed" | "failed"): ValidationLeafRun {
  return {
    run: {
      id: `validation-run-${status}`,
      artifacts: {
        validation: `validation/${status}.json`,
        stdout: `validation/${status}.out`,
        stderr: `validation/${status}.err`,
      },
    },
    validation: {
      id: `validation-${status}`,
      status: status === "completed" ? "passed" : "failed",
    },
  } as unknown as ValidationLeafRun;
}

function auditRun(status: "completed" | "failed"): AuditLeafRun {
  return {
    run: { id: `audit-run-${status}` },
    audit: {
      id: `audit-${status}`,
      status: status === "completed" ? "approved" : "changes-requested",
      artifacts: {
        audit: `audit/${status}.json`,
        auditMarkdown: `audit/${status}.md`,
        lastMessage: `audit/${status}.txt`,
      },
    },
  } as unknown as AuditLeafRun;
}

function project(): ManagedProject {
  return {
    id: "project",
    name: "Project",
    path: "E:/tmp/project",
    addedAt: "2026-07-07T00:00:00.000Z",
    lastSeenAt: "2026-07-07T00:00:00.000Z",
  };
}

function memory(): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project",
    projectRoot: "E:/tmp/project",
    markerPath: "E:/tmp/project/.agent-harness/project.json",
    agentGuidePath: "E:/tmp/project/AGENTS.md",
    memoryRoot: "E:/tmp/project/.agent-harness",
    docsRoot: "E:/tmp/project/.agent-harness/docs",
    harnessRoot: "E:/tmp/project/.agent-harness/harness",
    changesRoot: "E:/tmp/project/.agent-harness/harness/changes",
    evolutionRoot: "E:/tmp/project/.agent-harness/harness/evolution",
    templatesRoot: "E:/tmp/project/.agent-harness/templates",
    scriptsRoot: "E:/tmp/project/.agent-harness/scripts",
    runsRoot: "E:/tmp/project/.agent-harness/runs",
    workbenchRoot: "E:/tmp/project/.agent-harness/workbench",
    workbenchDbPath: "E:/tmp/project/.agent-harness/workbench/workbench.sqlite",
    agentsRoot: "E:/tmp/project/.agent-harness/agents",
    commandsRoot: "E:/tmp/project/.agent-harness/commands",
    agentCatalogPath: "E:/tmp/project/.agent-harness/agents/catalog.json",
    skillsRoot: "E:/tmp/project/.agent-harness/skills",
    worktreeMetadataRoot: "E:/tmp/project/.agent-harness/worktrees",
    worktreeIndexPath: "E:/tmp/project/.agent-harness/worktrees/index.json",
  };
}
