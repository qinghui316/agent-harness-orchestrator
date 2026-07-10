import { describe, expect, it } from "vitest";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { getWorkbenchRunGraphProjection, getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import {
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
} from "../../src/agent-task/manager.js";
import { buildDelegateTaskManifest, validateDelegateTaskPolicy } from "../../src/agent-task/delegate-task.js";
import { findBoundaryViolations } from "../../src/agent-task/boundary-audit.js";
import { dispatchForegroundRoleTask } from "../../src/agent-task/role-dispatcher.js";
import { evaluateToolPolicy, workerPermissionProfileForRole } from "../../src/agent-task/tool-policy.js";
import { startTaskRun } from "../../src/task-run/manager.js";
import { runStartedTaskRunStage } from "../../src/workflow-runtime/code-workflow.js";
import { project, writeAcceptedSpecAndTasks } from "./workbench/fixtures.js";

describe("workbench AgentTask domain", () => {
  it("persists AgentTaskRepository results and projects them into the role pipeline", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Agent Task Demand" });
    const memory = await resolveProjectMemory(project());

    const task = await createAgentTask(memory, {
      conversationId: "agent-task-demand",
      changeId: "agent-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Implement the accepted demand.",
      inputArtifacts: ["harness/changes/active/agent-task-demand/spec.md"],
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
    expect(snapshot.center.parentAgentTranscript.cells).toHaveLength(0);
    expect(snapshot.center.agentRunGraph.nodes).toEqual([]);
    const graph = await getWorkbenchRunGraphProjection({ project: project(), path: project().path }, "agent-task-demand");
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "main-agent",
        kind: "main-agent",
        status: "idle",
      }),
      expect.objectContaining({
        kind: "coder-agent",
        roleId: "coder-agent",
        status: "completed",
        outputSummary: "Coder returned a worktree proposal.",
        evidenceRefs: expect.arrayContaining([
          expect.objectContaining({ ref: "runs/run-agent-task/implementation.md", kind: "artifact" }),
        ]),
      }),
    ]));
    const coderNode = graph.nodes.find((node) => node.kind === "coder-agent");
    expect(coderNode?.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: task.id,
        status: "completed",
        summary: "Coder returned a worktree proposal.",
      }),
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "main-agent",
        to: coderNode?.id,
        kind: "delegates",
      }),
      expect.objectContaining({
        from: coderNode?.id,
        to: "main-agent",
        kind: "returns",
      }),
    ]));
  });

  it("validates delegateTask policy and records queued to running AgentTask lifecycle", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Delegate Task Demand" });
    const memory = await resolveProjectMemory(project());
    const manifest = buildDelegateTaskManifest();

    expect(manifest.allowedRoles.map((role) => role.roleId)).toEqual(expect.arrayContaining(["coder-agent", "validator", "auditor-agent", "rework-coder"]));
    const accepted = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement the confirmed demand in an AHO-owned worktree.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
    });
    expect(accepted.ok).toBe(true);
    const acceptedFromSeparateConversation = await validateDelegateTaskPolicy(memory, {
      conversationId: "conversation-window-1",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement the confirmed demand in an AHO-owned worktree.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
    });
    expect(acceptedFromSeparateConversation.ok).toBe(true);
    const forbidden = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Apply this result and merge the PR.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
    });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.readableMessage).toContain("用户确认");

    const dispatched = await dispatchForegroundRoleTask(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement via delegated task.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
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
    await initHarness(project());
    await createChange(project(), { title: "Code Setup Failure" });
    await writeAcceptedSpecAndTasks("code-setup-failure");
    const memory = await resolveProjectMemory(project());
    const started = await startTaskRun(project(), { changeId: "code-setup-failure", taskId: "T-001" });

    const result = await runStartedTaskRunStage({
      project: project(),
      started,
      executionGate: { mode: "workflow-graph", workflowGraphPlanId: "graph-missing" },
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
      inputArtifacts: ["harness/changes/active/code-setup-failure/spec.md"],
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
