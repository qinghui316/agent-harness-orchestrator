import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import { getAgentSurfaceProjection } from "../../src/workbench/agent-surface-projection.js";
import {
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
} from "../../src/agent-task/manager.js";
import { buildDelegateTaskManifest, validateDelegateTaskPolicy } from "../../src/agent-task/delegate-task.js";
import { findBoundaryViolations } from "../../src/agent-task/boundary-audit.js";
import { dispatchForegroundRoleTask } from "../../src/agent-task/role-dispatcher.js";
import { evaluateToolPolicy, workerPermissionProfileForRole } from "../../src/agent-task/tool-policy.js";
import { startTaskRunFromRuntime } from "../../src/task-run/manager.js";
import { runStartedTaskRunStage } from "../../src/workflow-runtime/code-workflow.js";
import { startSkillNativeCodeRun } from "../../src/code/manager.js";
import { startSkillNativeValidationRun } from "../../src/validation/service.js";
import { startSkillNativeAuditRun } from "../../src/audit/service.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  prepareSkillNativeWorkbenchFixture,
  resolveSkillNativeWorkbenchHarness,
  writeSkillNativeAcceptedSpecAndTasks,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";
import { project } from "../helpers/skill-native-test-environment.js";

describe("workbench AgentTask domain", () => {
  let fixture: SkillNativeWorkbenchFixture;

  beforeEach(async () => {
    fixture = await prepareSkillNativeWorkbenchFixture({ project: project() });
  });

  afterEach(() => fixture.restoreEnvironment());

  it("persists AgentTaskRepository results without leaking an unscoped task into the current Agent graph", async () => {
    await createConversationChangeFixture(project(), { title: "Agent Task Demand" });
    const memory = fixture.runtime;

    const task = await createAgentTask(memory, {
      conversationId: "agent-task-demand",
      changeId: "agent-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Implement the accepted demand.",
      inputArtifacts: ["state/changes/active/agent-task-demand/spec.md"],
    });
    await completeAgentTask(memory, task, {
      status: "completed",
      summary: "Coder returned a worktree proposal.",
      artifactRefs: ["runs/run-agent-task/implementation.md"],
      nextRecommendation: "Run validation.",
    });

    const tasks = await listAgentTasks(memory, "agent-task-demand");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: project().path }, { topicId: "agent-task-demand" });

    expect(tasks).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(snapshot.center.workpad, "rolePipeline")).toBe(false);
    expect(JSON.stringify(snapshot.center.workpad)).not.toContain('"rolePipeline"');
    expect(snapshot.center.workpad.mainAgentExecution?.agentTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: task.id,
        roleId: "coder-agent",
        status: "completed",
        resultSummary: "Coder returned a worktree proposal.",
        evidenceRefs: ["runs/run-agent-task/implementation.md"],
      }),
    ]));
    expect(snapshot.center).not.toHaveProperty("parentAgentTranscript");
    expect(snapshot.center).not.toHaveProperty("agentRelationGraph");
    await expect(getAgentSurfaceProjection({ project: project(), path: project().path }, "agent-task-demand"))
      .rejects.toThrow("conversation was not found");
  });

  it("validates delegateTask policy and records queued to running AgentTask lifecycle", async () => {
    await createConversationChangeFixture(project(), { title: "Delegate Task Demand" });
    const memory = fixture.runtime;
    const manifest = buildDelegateTaskManifest();

    expect(manifest.allowedRoles.map((role) => role.roleId)).toEqual(expect.arrayContaining(["coder-agent", "validator", "auditor-agent", "rework-coder"]));
    const accepted = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement the confirmed demand in an AHO-owned worktree.",
      inputArtifacts: ["state/changes/active/delegate-task-demand/spec.md"],
    });
    expect(accepted.ok).toBe(true);
    const acceptedFromSeparateConversation = await validateDelegateTaskPolicy(memory, {
      conversationId: "conversation-window-1",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement the confirmed demand in an AHO-owned worktree.",
      inputArtifacts: ["state/changes/active/delegate-task-demand/spec.md"],
    });
    expect(acceptedFromSeparateConversation.ok).toBe(true);
    const forbidden = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Apply this result and merge the PR.",
      inputArtifacts: ["state/changes/active/delegate-task-demand/spec.md"],
    });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.readableMessage).toContain("用户确认");

    const dispatched = await dispatchForegroundRoleTask(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement via delegated task.",
      inputArtifacts: ["state/changes/active/delegate-task-demand/spec.md"],
      delegationMode: "orchestrator-policy",
    });
    expect(dispatched.task.status).toBe("running");
    expect(dispatched.task.startedAt).toBeTruthy();
    expect(dispatched.policyAuditRef).toContain("tool-events.jsonl");
    const tasks = await listAgentTasks(memory, "delegate-task-demand");
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: dispatched.task.id, roleId: "coder-agent", status: "running" }),
    ]));
  });

  it("marks coder AgentTask failed when code setup fails before run artifacts exist", async () => {
    await createConversationChangeFixture(project(), { title: "Code Setup Failure" });
    await writeSkillNativeAcceptedSpecAndTasks(fixture, "code-setup-failure");
    const memory = fixture.runtime;
    const harness = await resolveSkillNativeWorkbenchHarness(fixture, "code-setup-failure");
    const started = await startTaskRunFromRuntime(memory, harness.changeStatus, {
      changeId: "code-setup-failure",
      taskId: "T-001",
    });

    const result = await runStartedTaskRunStage({
      project: project(),
      started,
      executionGate: { mode: "workflow-graph", workflowGraphPlanId: "graph-missing" },
      skillNative: {
        runtime: memory,
        changeStatus: harness.changeStatus,
        leafServices: {
          startCode: (managedProject, options) => startSkillNativeCodeRun(managedProject, memory, harness, options),
          startValidation: (managedProject, options) => startSkillNativeValidationRun(managedProject, memory, harness, options),
          startAudit: (managedProject, options) => startSkillNativeAuditRun(managedProject, memory, harness, options),
        },
      },
    });

    expect(result.workflow).toMatchObject({
      status: "failed",
      stoppedAt: "code",
      error: expect.any(String),
    });
    const tasks = await listAgentTasks(memory, "code-setup-failure");
    expect(tasks).toEqual([
      expect.objectContaining({
        roleId: "coder-agent",
        status: "failed",
        outputArtifacts: [],
      }),
    ]);

    const nextDelegation = await validateDelegateTaskPolicy(memory, {
      conversationId: "code-setup-failure",
      changeId: "code-setup-failure",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Retry implementation after failed setup.",
      inputArtifacts: ["state/changes/active/code-setup-failure/spec.md"],
    });
    expect(nextDelegation.ok).toBe(true);
  });

  it("enforces worker permission boundaries for delegation and high-impact actions", () => {
    expect(workerPermissionProfileForRole("main-agent").mayDelegate).toBe(true);
    expect(workerPermissionProfileForRole("coder-agent").mayDelegate).toBe(false);

    const workerDelegation = evaluateToolPolicy({
      actionType: "delegateTask",
      actorRoleId: "coder-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(workerDelegation.status).toBe("denied");
    expect(workerDelegation.readableMessage).toContain("不能继续委派");

    const roleMerge = evaluateToolPolicy({
      actionType: "remote-landing.merge",
      actorRoleId: "auditor-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(roleMerge.status).toBe("denied");

    const mainApply = evaluateToolPolicy({
      actionType: "remote-landing.merge",
      actorRoleId: "main-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(mainApply.status).toBe("needs-user-confirmation");
  });

  it("detects post-run boundary violations for source writes and read-only role writes", () => {
    const coderViolations = findBoundaryViolations(workerPermissionProfileForRole("coder-agent"), {
      sourceChanged: true,
      changedPaths: ["src/pricing.ts", ".env"],
      artifactRefs: ["runs/run-1/implementation.md"],
    });
    expect(coderViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "source-root-modified" }),
      expect.objectContaining({ kind: "denied-path", path: ".env" }),
    ]));

    const validatorViolations = findBoundaryViolations(workerPermissionProfileForRole("validator"), {
      changedPaths: ["src/pricing.ts"],
      artifactRefs: ["validation/run-1/validation.json"],
    });
    expect(validatorViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "readonly-role-write", path: "src/pricing.ts" }),
    ]));

    const scopedViolations = findBoundaryViolations(workerPermissionProfileForRole("auditor-agent"), {
      artifactRefs: ["C:/outside/audit.json", "../other-change/audit.json"],
    });
    expect(scopedViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "cross-demand-artifact" }),
    ]));
  });
});
