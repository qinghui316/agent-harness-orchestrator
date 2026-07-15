import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listRuns } from "../../src/run/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../../src/task-run/manager.js";
import { listWorktreeMetadata } from "../../src/worktree/manager.js";
import {
  compileWorkflowGraphPlan,
  hashArtifactRefs,
  writeWorkflowGraphPlan,
  type WorkflowAuthoringPlan,
} from "../../src/workflow-artifacts/manager.js";
import { readLatestSchedulerCurrentTransitionView } from "../../src/workflow-runtime/scheduler-current-transition-view.js";
import { runSchedulerReadySetInitialization } from "../../src/workflow-runtime/scheduler.js";
import { getTempDir, project, writeAcceptedSpecAndTasks } from "./workbench/fixtures.js";

let tempDir: string;

beforeEach(() => {
  tempDir = getTempDir();
});
describe("authored ready-set Scheduler initialization", () => {
  it("materializes the current start-first evidence without legacy planning authority or execution records", async () => {
    await initHarness(project());
    const topic = await createConversationChangeFixture(project(), {
      title: "Authored ready-set runtime",
      body: "Accept a fixed ready-set graph and initialize Scheduler evidence.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const memory = await resolveProjectMemory(project());
    const changePath = join("harness", "changes", "active", topic.changeId);
    const planRef = join(changePath, "plan.md").replaceAll("\\", "/");
    const plan: WorkflowAuthoringPlan = {
      version: "1.0",
      mode: "ready-set-v1",
      nodes: [{
        id: "implementation",
        title: "Implement accepted task",
        taskIds: ["T-001"],
        acIds: ["AC-001"],
        prompt: "Objective: Implement T-001. Required behavior: Complete the accepted task. Constraints: Stay within the accepted scope. Expected evidence: Return verification results.",
        dependsOn: [],
        sourceScopes: ["src/feature.ts"],
      }],
    };
    await writeFile(join(tempDir, planRef), [
      "# Plan",
      "",
      "## Workflow",
      "",
      "```json",
      JSON.stringify(plan, null, 2),
      "```",
      "",
    ].join("\n"), "utf8");
    const graphId = "authored-ready-set-graph";
    const graphBase = `${changePath.replaceAll("\\", "/")}/planning/workflow-graphs/${graphId}`;
    const graph = compileWorkflowGraphPlan(plan, {
      id: graphId,
      changeId: topic.changeId,
      planArtifactRef: planRef,
      taskIds: ["T-001"],
      acIds: ["AC-001"],
      sourceArtifactHashes: await hashArtifactRefs(memory, [planRef]),
      artifactRefs: [planRef],
      artifact: `${graphBase}.json`,
      markdownArtifact: `${graphBase}.md`,
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    if (graph.graphMode !== "ready-set-v1") throw new Error("Expected ready-set graph fixture.");
    await writeWorkflowGraphPlan(memory, changePath, graph);

    expect(existsSync(join(memory.memoryRoot, changePath, "planning", "decomposition-plan.json"))).toBe(false);
    expect(existsSync(join(memory.memoryRoot, changePath, "planning", "decomposition-readiness.json"))).toBe(false);

    const initialized = await runSchedulerReadySetInitialization(memory, changePath, graph);

    expect(initialized).toMatchObject({
      executionStarted: false,
      contract: { id: graph.schedulerContractId },
      dryRun: { id: graph.schedulerDispatchDryRunId, schedulerContractId: graph.schedulerContractId },
      workerPlan: { id: graph.schedulerWorkerPlanId, schedulerDispatchDryRunId: graph.schedulerDispatchDryRunId },
      claimReconcilePlan: { id: graph.schedulerClaimReconcilePlanId, schedulerWorkerPlanId: graph.schedulerWorkerPlanId },
      launchPreflight: { status: "checked" },
      schedulerRun: { status: "prepared", claimIntentCount: 1 },
      runtimeState: { status: "initialized", blockedCount: 0 },
      reconcileSnapshot: { status: "generated", blockedCount: 0 },
      claimReservation: { status: "reserved", reservedCount: 1 },
    });
    expect(initialized.claimReservation.launchConfirmed).toBeUndefined();
    expect(initialized.workerPlan.plannedStages.map((stage) => ({
      stage: stage.stage,
      adapterFamily: stage.adapterFamily,
      expectedEventTypes: stage.eventSourceExpectation.expectedEventTypes,
    }))).toEqual([
      {
        stage: "coder",
        adapterFamily: "provider-code",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "provider.started", "provider.exited", "external-execution.completed"],
      },
      {
        stage: "validation",
        adapterFamily: "validation-command",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "validation.command.started", "validation.command.exited", "external-execution.completed"],
      },
      {
        stage: "audit",
        adapterFamily: "provider-readonly",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "audit.started", "provider.started", "provider.exited", "external-execution.completed"],
      },
      {
        stage: "bounded-rework",
        adapterFamily: "provider-code",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "provider.started", "provider.exited", "external-execution.completed"],
      },
    ]);
    expect(initialized.claimReconcilePlan.claimIntents[0]).toMatchObject({
      claimIntentId: graph.nodes[0].claimIntentId,
      nodeId: graph.nodes[0].schedulerNodeId,
    });

    const transition = await readLatestSchedulerCurrentTransitionView(
      memory,
      changePath,
      initialized.schedulerRun.id,
      "planning.scheduler.worker.start-first",
    );
    expect(transition.transition).toMatchObject({
      kind: "start-first-worker",
      reservationIntent: { claimIntentId: graph.nodes[0].claimIntentId },
    });
    expect(await listTaskQueues(memory, topic.changeId)).toEqual([]);
    expect(await listTaskRuns(memory, topic.changeId)).toEqual([]);
    expect(await listWorkerLeases(memory, topic.changeId)).toEqual([]);
    expect(await listWorktreeMetadata(memory)).toEqual([]);
    expect(await listRuns(memory)).toEqual([]);

    const retried = await runSchedulerReadySetInitialization(memory, changePath, graph);
    expect(retried.schedulerRun.id).toBe(initialized.schedulerRun.id);
    expect(retried.runtimeState.id).toBe(initialized.runtimeState.id);
    expect(retried.reconcileSnapshot.id).toBe(initialized.reconcileSnapshot.id);
    expect(retried.claimReservation.id).toBe(initialized.claimReservation.id);
  });
});
