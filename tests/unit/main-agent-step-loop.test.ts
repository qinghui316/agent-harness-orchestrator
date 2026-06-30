import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  memoryRoot: "",
}));

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => ({
    mode: "external-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project",
    projectRoot: "E:/tmp/project",
    markerPath: "E:/tmp/project/.agent-harness/project.json",
    agentGuidePath: "E:/tmp/project/AGENTS.md",
    memoryRoot: controls.memoryRoot,
    docsRoot: `${controls.memoryRoot}/docs`,
    harnessRoot: `${controls.memoryRoot}/harness`,
    changesRoot: `${controls.memoryRoot}/harness/changes`,
    evolutionRoot: `${controls.memoryRoot}/harness/evolution`,
    templatesRoot: `${controls.memoryRoot}/templates`,
    scriptsRoot: `${controls.memoryRoot}/scripts`,
    runsRoot: `${controls.memoryRoot}/runs`,
    workbenchRoot: `${controls.memoryRoot}/workbench`,
    workbenchDbPath: `${controls.memoryRoot}/workbench/workbench.sqlite`,
    agentsRoot: `${controls.memoryRoot}/agents`,
    commandsRoot: `${controls.memoryRoot}/commands`,
    agentCatalogPath: `${controls.memoryRoot}/agents/catalog.json`,
    skillsRoot: `${controls.memoryRoot}/skills`,
    worktreeMetadataRoot: `${controls.memoryRoot}/worktrees`,
    worktreeIndexPath: `${controls.memoryRoot}/worktrees/index.json`,
  })),
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
  ensureMainAgentLoopRun,
  mainAgentLoopRunPath,
} from "../../src/main-agent-orchestration/loop-evidence.js";
import {
  mainAgentLoopEventsPath,
  readMainAgentLoopEvents,
  readMainAgentLoopRun,
  runMainAgentOrchestration,
  runMainAgentSourceRefreshRework,
  runMainAgentTaskRunAttempt,
} from "../../src/main-agent-orchestration/index.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
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
  beforeEach(async () => {
    controls.validatorOutcomes = [];
    controls.auditorOutcomes = [];
    controls.memoryRoot = await mkdtemp(join(tmpdir(), "aho-main-agent-loop-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (controls.memoryRoot) await rm(controls.memoryRoot, { recursive: true, force: true });
  });

  it("records bounded loop evidence for a successful top-level run", async () => {
    const result = await runMainAgentOrchestration({
      project,
      changeId: "change-success",
    });

    const loopRunId = result.attempts[0]?.result.loopRunId;
    expect(loopRunId).toBeTruthy();
    const memory = await resolveProjectMemory(project);
    const run = await readMainAgentLoopRun(memory, loopRunId!);
    const events = await readMainAgentLoopEvents(memory, loopRunId!);

    expect(run?.status).toBe("completed");
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "loop.started",
      "observation.recorded",
      "decision.recorded",
      "leaf.started",
      "leaf.completed",
      "loop.completed",
    ]));
    expect(events.filter((event) => event.type === "leaf.started").map((event) => event.roleId)).toEqual([
      "coder-agent",
      "validator",
      "auditor-agent",
    ]);
    expect(JSON.stringify(events)).not.toContain("Check chat-only");
    expect(JSON.stringify(events)).not.toContain("stdout");
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
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, result.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder")).toHaveLength(0);
    expect(events.some((event) => event.type === "loop.stopped")).toBe(true);
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
    expect(result.attempts[0]?.result.loopRunId).toBe(result.attempts[1]?.result.loopRunId);
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, result.attempts[0]!.result.loopRunId!);
    expect(events.filter((event) => event.type === "loop.started")).toHaveLength(1);
    expect(events.filter((event) => event.roleId === "rework-coder" && event.type === "leaf.started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "loop.completed")).toHaveLength(1);
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
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, result.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder" && event.type === "leaf.started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "loop.stopped")).toHaveLength(1);
  });

  it("fails closed when loop evidence is missing or malformed", async () => {
    const result = await runMainAgentTaskRunAttempt({
      project,
      changeId: "change-malformed",
      taskIds: ["task-1"],
      taskRunId: "task-run-1",
    });
    const memory = await resolveProjectMemory(project);

    expect(await readMainAgentLoopRun(memory, "missing-loop")).toBeNull();
    expect(await readMainAgentLoopEvents(memory, "missing-loop")).toEqual([]);

    await writeFile(mainAgentLoopEventsPath(memory, result.loopRunId!), "{not-json}\n", "utf8");
    expect(await readMainAgentLoopEvents(memory, result.loopRunId!)).toEqual([]);
  });

  it("recreates malformed loop metadata without blocking orchestration evidence", async () => {
    const memory = await resolveProjectMemory(project);
    const malformedPath = mainAgentLoopRunPath(memory, "malformed-loop");
    await mkdir(dirname(malformedPath), { recursive: true });
    await writeFile(malformedPath, "{not-json}\n", "utf8");

    const ensured = await ensureMainAgentLoopRun(memory, {
      loopRunId: "malformed-loop",
      changeId: "change-malformed-loop",
      projectId: project.id,
      entrypoint: "task-run",
    });

    expect(ensured.created).toBe(true);
    expect(ensured.run.id).toBe("malformed-loop");
    expect(ensured.run.status).toBe("running");
  });
});
