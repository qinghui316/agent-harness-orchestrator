import { readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { runCodexChat, runOrchestratorPlan } from "../../src/workbench/codex-chat/bridge.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { compileGoalLoopControllerPolicy, compileGoalLoopEvaluation } from "../../src/goal-loop/manager.js";
import type { RunMetadata } from "../../src/types/index.js";
import {
  createFakeCodex,
  findSchedulerGateAction,
  getTempDir,
  prepareSchedulerFirstWorkerThroughResult,
  prepareSchedulerTwoWorkerIntegrationHandoff,
  project,
  readJsonl,
  unwrapControlledSchedulerAdvanceResult,
} from "../unit/workbench/fixtures.js";

describe("Workbench Goal Loop prompt slow flows", () => {
  it("records visible goal loop controller policy in actual main-agent chat and orchestrator prompt artifacts only while fresh", async () => {
    const prepared = await prepareSchedulerFirstWorkerThroughResult({
      title: "Goal Loop Runtime Prompt Evidence",
    });
    const memory = await resolveProjectMemory(project());
    const changePath = join("harness", "changes", "active", prepared.topic.changeId);

    let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.worker.validate-first",
      schedulerRunId: prepared.schedulerRun.id,
      schedulerWorkerResultId: prepared.workerResult.id,
    });
    await compileGoalLoopEvaluation(memory, changePath);
    await compileGoalLoopControllerPolicy(memory, changePath, {
      currentGate: {
        actionType: "planning.scheduler.worker.validate-first",
        scope: {
          changeId: prepared.topic.changeId,
          schedulerRunId: prepared.schedulerRun.id,
          schedulerWorkerResultId: prepared.workerResult.id,
        },
      },
    });
    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId });
    const visibleGoalLoop = snapshot.center.workpad.goalLoop;
    expect(visibleGoalLoop).toMatchObject({
      changeId: prepared.topic.changeId,
      controllerPolicyId: expect.stringContaining("goal-loop-controller-policy"),
    });
    const actionsBeforeChat = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .map((action) => action.actionType)
      .sort();

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    try {
      const chat = await runCodexChat(project(), prepared.topic.changeId, "Explain the current goal-loop policy.");
      const chatRun = JSON.parse(await readFile(join(memory.runsRoot, chat.run.id, "run.json"), "utf8")) as RunMetadata;
      const chatContext = await readFile(join(memory.runsRoot, chat.run.id, "context.md"), "utf8");
      const chatPrompt = await readFile(join(memory.runsRoot, chat.run.id, "prompt.md"), "utf8");
      const chatEvents = await readJsonl(join(memory.runsRoot, chat.run.id, "events.jsonl"));
      expect(chatRun.promptStack).toEqual(expect.arrayContaining(["goal-loop-next-step-packet", "goal-loop-routing-posture", "goal-loop-controlled-loop-state", "goal-loop-controller-policy"]));
      expect(chatContext).toContain("### Controller Policy");
      expect(chatContext).toContain("### Controlled Loop State Evidence");
      expect(chatContext).toContain("### Routing Posture");
      expect(chatContext).toContain(`routingPosture: ${visibleGoalLoop?.routingPosture}`);
      expect(chatContext).toContain(`routingLabel: ${visibleGoalLoop?.routingLabel}`);
      expect(chatContext).toContain("#### Concrete Harness Gate Handoff");
      expect(chatContext).toContain("- Gate action type: planning.scheduler.worker.validate-first");
      expect(chatContext).toContain(`- schedulerRunId: ${prepared.schedulerRun.id}`);
      expect(chatContext).toContain(`- schedulerWorkerResultId: ${prepared.workerResult.id}`);
      expect(chatContext).toContain("this explanation is not confirmation");
      expect(chatContext).toContain("ToolPolicyGate");
      expect(chatPrompt).toContain("### Controller Policy");
      expect(chatPrompt).toContain("### Controlled Loop State Evidence");
      expect(chatPrompt).toContain("### Routing Posture");
      expect(chatPrompt).toContain(`routingPosture: ${visibleGoalLoop?.routingPosture}`);
      expect(chatPrompt).toContain("#### Concrete Harness Gate Handoff");
      expect(chatEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "context.prepared",
          data: expect.objectContaining({
            goalLoopNextStepPacketId: visibleGoalLoop?.goalLoopNextStepPacketId,
            goalLoopControllerPolicyId: visibleGoalLoop?.controllerPolicyId,
            goalLoopRoutingPosture: visibleGoalLoop?.routingPosture,
            goalLoopRoutingLabel: visibleGoalLoop?.routingLabel,
            goalLoopRoutingPostureEvidence: expect.objectContaining({
              authority: "non-executing-routing-posture-prompt-evidence",
              goalLoopNextStepPacketId: visibleGoalLoop?.goalLoopNextStepPacketId,
              routingPosture: visibleGoalLoop?.routingPosture,
              routingLabel: visibleGoalLoop?.routingLabel,
              schedulerExecutionMode: "single-gate-staged",
              currentLegalActionType: "planning.scheduler.worker.validate-first",
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
            goalLoopGuidedGateActionType: "planning.scheduler.worker.validate-first",
            goalLoopGuidedGateScope: expect.objectContaining({
              changeId: prepared.topic.changeId,
              schedulerRunId: prepared.schedulerRun.id,
              schedulerWorkerResultId: prepared.workerResult.id,
            }),
            goalLoopControlledLoopState: expect.objectContaining({
              state: "awaiting-human-gate",
              phase12aLabel: "awaiting human gate for one existing gate",
              currentLegalActionType: "planning.scheduler.worker.validate-first",
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
          }),
        }),
      ]));
      const chatContextPrepared = chatEvents.find((event) => event.type === "context.prepared")?.data as Record<string, unknown> | undefined;
      expect(chatContextPrepared).toBeTruthy();
      expect(chatContextPrepared).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(chatContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(chatContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("markdown");
      expect(chatContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("scope");
      expect(chatContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("goalLoopGuidedGateScope");
      expect(chatContextPrepared?.goalLoopControlledLoopState).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(chatContextPrepared?.goalLoopControlledLoopState).not.toHaveProperty("recommendedActionScope");
      expect(chatContextPrepared?.goalLoopControlledLoopState).not.toHaveProperty("markdown");

      const orchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Plan from the current goal-loop policy.");
      const orchestratorRun = JSON.parse(await readFile(join(memory.runsRoot, orchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
      const orchestratorContext = await readFile(join(memory.runsRoot, orchestrator.run.id, "context.md"), "utf8");
      const orchestratorPrompt = await readFile(join(memory.runsRoot, orchestrator.run.id, "prompt.md"), "utf8");
      const orchestratorEvents = await readJsonl(join(memory.runsRoot, orchestrator.run.id, "events.jsonl"));
      expect(orchestratorRun.promptStack).toEqual(expect.arrayContaining(["goal-loop-next-step-packet", "goal-loop-routing-posture", "goal-loop-controlled-loop-state", "goal-loop-controller-policy"]));
      expect(orchestratorContext).toContain("### Controller Policy");
      expect(orchestratorContext).toContain("### Controlled Loop State Evidence");
      expect(orchestratorContext).toContain("### Routing Posture");
      expect(orchestratorContext).toContain(`routingPosture: ${visibleGoalLoop?.routingPosture}`);
      expect(orchestratorContext).toContain(`routingLabel: ${visibleGoalLoop?.routingLabel}`);
      expect(orchestratorContext).toContain("#### Concrete Harness Gate Handoff");
      expect(orchestratorContext).toContain("- Gate action type: planning.scheduler.worker.validate-first");
      expect(orchestratorPrompt).toContain("### Controller Policy");
      expect(orchestratorPrompt).toContain("### Controlled Loop State Evidence");
      expect(orchestratorPrompt).toContain("### Routing Posture");
      expect(orchestratorPrompt).toContain(`routingPosture: ${visibleGoalLoop?.routingPosture}`);
      expect(orchestratorPrompt).toContain("#### Concrete Harness Gate Handoff");
      expect(orchestratorEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "context.prepared",
          data: expect.objectContaining({
            goalLoopNextStepPacketId: visibleGoalLoop?.goalLoopNextStepPacketId,
            goalLoopControllerPolicyId: visibleGoalLoop?.controllerPolicyId,
            goalLoopRoutingPosture: visibleGoalLoop?.routingPosture,
            goalLoopRoutingLabel: visibleGoalLoop?.routingLabel,
            goalLoopRoutingPostureEvidence: expect.objectContaining({
              authority: "non-executing-routing-posture-prompt-evidence",
              goalLoopNextStepPacketId: visibleGoalLoop?.goalLoopNextStepPacketId,
              routingPosture: visibleGoalLoop?.routingPosture,
              routingLabel: visibleGoalLoop?.routingLabel,
              schedulerExecutionMode: "single-gate-staged",
              currentLegalActionType: "planning.scheduler.worker.validate-first",
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
            goalLoopGuidedGateActionType: "planning.scheduler.worker.validate-first",
            goalLoopGuidedGateScope: expect.objectContaining({
              changeId: prepared.topic.changeId,
              schedulerRunId: prepared.schedulerRun.id,
              schedulerWorkerResultId: prepared.workerResult.id,
            }),
            goalLoopControlledLoopState: expect.objectContaining({
              state: "awaiting-human-gate",
              phase12aLabel: "awaiting human gate for one existing gate",
              currentLegalActionType: "planning.scheduler.worker.validate-first",
              loopAuthorized: false,
              fullParallelExecutorAuthorized: false,
              wholeWaveDispatchAuthorized: false,
              slotAllocatorAuthorized: false,
              sourceMutationAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
          }),
        }),
      ]));
      const orchestratorContextPrepared = orchestratorEvents.find((event) => event.type === "context.prepared")?.data as Record<string, unknown> | undefined;
      expect(orchestratorContextPrepared).toBeTruthy();
      expect(orchestratorContextPrepared).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(orchestratorContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(orchestratorContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("markdown");
      expect(orchestratorContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("scope");
      expect(orchestratorContextPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("goalLoopGuidedGateScope");
      expect(orchestratorContextPrepared?.goalLoopControlledLoopState).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(orchestratorContextPrepared?.goalLoopControlledLoopState).not.toHaveProperty("recommendedActionScope");
      expect(orchestratorContextPrepared?.goalLoopControlledLoopState).not.toHaveProperty("markdown");
      const actionsAfterPromptRunsFull = (await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId }))
        .right.confirmationQueue.current
        .flatMap((item) => item.actions);
      const actionsAfterPromptRuns = actionsAfterPromptRunsFull
        .map((action) => action.actionType)
        .sort();
      expect(actionsBeforeChat).toContain("planning.scheduler.controlled-advance.run");
      expect(actionsAfterPromptRuns).toContain("planning.scheduler.controlled-advance.run");
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => findSchedulerGateAction(
        [action],
        "planning.scheduler.worker.validate-first",
        (candidate) => candidate.schedulerWorkerResultId === prepared.workerResult.id,
      ))).toBe(true);
      expect(actionsAfterPromptRunsFull.some((action) => findSchedulerGateAction(
        [action],
        "planning.scheduler.worker.validate-first",
        (candidate) => candidate.schedulerWorkerResultId === prepared.workerResult.id,
      ))).toBe(true);
      expect(actionsAfterPromptRunsFull.every((action) => !("controlledLoopState" in action) && !("goalLoopControlledLoopState" in action) && !("schedulerLoopEvidenceSnapshot" in action))).toBe(true);
      const allowedGoalLoopEvidenceActions = new Set([
        "planning.goal-loop.feedback.evaluate",
        "planning.goal-loop.controller.refresh",
        "planning.goal-loop.gate-readiness.prepare",
      ]);
      expect(actionsAfterPromptRuns.filter((action) => action?.startsWith("planning.goal-loop")).every((action) => allowedGoalLoopEvidenceActions.has(action))).toBe(true);
      expect(actionsAfterPromptRuns).not.toContain("planning.goal-loop.evaluate");
      expect(actionsAfterPromptRuns).not.toContain("planning.goal-loop.gate.invoke");

      await compileGoalLoopEvaluation(memory, changePath);
      const stalePolicyChat = await runCodexChat(project(), prepared.topic.changeId, "Re-check after a packet refresh.");
      const staleRun = JSON.parse(await readFile(join(memory.runsRoot, stalePolicyChat.run.id, "run.json"), "utf8")) as RunMetadata;
      const staleContext = await readFile(join(memory.runsRoot, stalePolicyChat.run.id, "context.md"), "utf8");
      const staleEvents = await readJsonl(join(memory.runsRoot, stalePolicyChat.run.id, "events.jsonl"));
      expect(staleRun.promptStack).toContain("goal-loop-next-step-packet");
      expect(staleRun.promptStack).toContain("goal-loop-routing-posture");
      expect(staleRun.promptStack).toContain("goal-loop-controlled-loop-state");
      expect(staleRun.promptStack).not.toContain("goal-loop-controller-policy");
      expect(staleContext).toContain("Goal Loop Next-Step Packet");
      expect(staleContext).toContain("### Controlled Loop State Evidence");
      expect(staleContext).toContain("### Routing Posture");
      expect(staleContext).not.toContain("### Controller Policy");
      expect(staleContext).not.toContain("#### Concrete Harness Gate Handoff");
      expect(staleEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "context.prepared",
          data: expect.objectContaining({
            goalLoopRoutingPosture: expect.any(String),
            goalLoopRoutingLabel: expect.any(String),
            goalLoopRoutingPostureEvidence: expect.objectContaining({
              authority: "non-executing-routing-posture-prompt-evidence",
              loopAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
            goalLoopControlledLoopState: expect.objectContaining({
              state: "awaiting-human-gate",
              loopAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
          }),
        }),
        expect.objectContaining({
          type: "context.prepared",
          data: expect.not.objectContaining({
            goalLoopControllerPolicyId: expect.any(String),
            goalLoopGuidedGateActionType: expect.any(String),
          }),
        }),
      ]));
      const stalePolicyOrchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Re-check orchestrator after a packet refresh.");
      const staleOrchestratorRun = JSON.parse(await readFile(join(memory.runsRoot, stalePolicyOrchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
      const staleOrchestratorContext = await readFile(join(memory.runsRoot, stalePolicyOrchestrator.run.id, "context.md"), "utf8");
      const staleOrchestratorEvents = await readJsonl(join(memory.runsRoot, stalePolicyOrchestrator.run.id, "events.jsonl"));
      expect(staleOrchestratorRun.promptStack).toContain("goal-loop-next-step-packet");
      expect(staleOrchestratorRun.promptStack).toContain("goal-loop-routing-posture");
      expect(staleOrchestratorRun.promptStack).toContain("goal-loop-controlled-loop-state");
      expect(staleOrchestratorRun.promptStack).not.toContain("goal-loop-controller-policy");
      expect(staleOrchestratorContext).toContain("Goal Loop Next-Step Packet");
      expect(staleOrchestratorContext).toContain("### Controlled Loop State Evidence");
      expect(staleOrchestratorContext).toContain("### Routing Posture");
      expect(staleOrchestratorContext).not.toContain("### Controller Policy");
      expect(staleOrchestratorContext).not.toContain("#### Concrete Harness Gate Handoff");
      expect(staleOrchestratorEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "context.prepared",
          data: expect.objectContaining({
            goalLoopRoutingPosture: expect.any(String),
            goalLoopRoutingLabel: expect.any(String),
            goalLoopRoutingPostureEvidence: expect.objectContaining({
              authority: "non-executing-routing-posture-prompt-evidence",
              loopAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
            goalLoopControlledLoopState: expect.objectContaining({
              state: "awaiting-human-gate",
              loopAuthorized: false,
              applyAuthorized: false,
              closeAuthorized: false,
              harnessEvolutionAuthorized: false,
            }),
          }),
        }),
        expect.objectContaining({
          type: "context.prepared",
          data: expect.not.objectContaining({
            goalLoopControllerPolicyId: expect.any(String),
            goalLoopGuidedGateActionType: expect.any(String),
          }),
        }),
      ]));

      await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n\nAccepted scope changed after packet creation.\n", "utf8");
      const hiddenGoalLoopChat = await runCodexChat(project(), prepared.topic.changeId, "Re-check after accepted artifact drift.");
      const hiddenRun = JSON.parse(await readFile(join(memory.runsRoot, hiddenGoalLoopChat.run.id, "run.json"), "utf8")) as RunMetadata;
      const hiddenContext = await readFile(join(memory.runsRoot, hiddenGoalLoopChat.run.id, "context.md"), "utf8");
      const hiddenEvents = await readJsonl(join(memory.runsRoot, hiddenGoalLoopChat.run.id, "events.jsonl"));
      expect(hiddenRun.promptStack).not.toContain("goal-loop-next-step-packet");
      expect(hiddenRun.promptStack).not.toContain("goal-loop-routing-posture");
      expect(hiddenRun.promptStack).not.toContain("goal-loop-controlled-loop-state");
      expect(hiddenRun.promptStack).not.toContain("goal-loop-controller-policy");
      expect(hiddenContext).not.toContain("Goal Loop Next-Step Packet");
      expect(hiddenContext).not.toContain("### Controlled Loop State Evidence");
      expect(hiddenEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "context.prepared",
          data: expect.not.objectContaining({
            goalLoopNextStepPacketId: expect.any(String),
            goalLoopRoutingPostureEvidence: expect.any(Object),
            goalLoopControlledLoopState: expect.any(Object),
            goalLoopControllerPolicyId: expect.any(String),
          }),
        }),
      ]));

      const hiddenGoalLoopOrchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Re-check orchestrator after accepted artifact drift.");
      const hiddenOrchestratorRun = JSON.parse(await readFile(join(memory.runsRoot, hiddenGoalLoopOrchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
      const hiddenOrchestratorContext = await readFile(join(memory.runsRoot, hiddenGoalLoopOrchestrator.run.id, "context.md"), "utf8");
      const hiddenOrchestratorEvents = await readJsonl(join(memory.runsRoot, hiddenGoalLoopOrchestrator.run.id, "events.jsonl"));
      expect(hiddenOrchestratorRun.promptStack).not.toContain("goal-loop-next-step-packet");
      expect(hiddenOrchestratorRun.promptStack).not.toContain("goal-loop-routing-posture");
      expect(hiddenOrchestratorRun.promptStack).not.toContain("goal-loop-controlled-loop-state");
      expect(hiddenOrchestratorRun.promptStack).not.toContain("goal-loop-controller-policy");
      expect(hiddenOrchestratorContext).not.toContain("Goal Loop Next-Step Packet");
      expect(hiddenOrchestratorContext).not.toContain("### Controlled Loop State Evidence");
      expect(hiddenOrchestratorEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "context.prepared",
          data: expect.not.objectContaining({
            goalLoopNextStepPacketId: expect.any(String),
            goalLoopRoutingPostureEvidence: expect.any(Object),
            goalLoopControlledLoopState: expect.any(Object),
            goalLoopControllerPolicyId: expect.any(String),
          }),
        }),
      ]));
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  }, 300000);

  it("records quality rework routing posture in actual main-agent prompt artifacts", async () => {
    const prepared = await prepareSchedulerFirstWorkerThroughResult({
      title: "Goal Loop Rework Routing Runtime Evidence",
      packageTestScript: "node -e \"process.exit(1)\"",
    });
    const memory = await resolveProjectMemory(project());
    const changePath = join("harness", "changes", "active", prepared.topic.changeId);
    const validationAction = (await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId }))
      .right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction(
        [action],
        "planning.scheduler.worker.validate-first",
        (candidate) => candidate.schedulerWorkerResultId === prepared.workerResult.id,
      ));
    if (!validationAction) throw new Error("Missing scheduler first worker validation action.");
    const validated = await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...validationAction, confirm: true });
    const validationResult = unwrapControlledSchedulerAdvanceResult((validated.result as { result?: unknown }).result ?? validated.result) as {
      schedulerValidation?: { id?: string };
    };
    const schedulerWorkerValidationId = validationResult.schedulerValidation?.id;

    await compileGoalLoopEvaluation(memory, changePath);
    const visibleGoalLoop = (await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId })).center.workpad.goalLoop;
    expect(visibleGoalLoop).toMatchObject({
      routingPosture: "blocked-or-rework",
      routingLabel: "Blocked or bounded rework",
      controlledLoopState: {
        state: "quality-routing",
        currentLegalActionType: "planning.scheduler.worker.rework-plan.compile",
      },
    });

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    try {
      const chat = await runCodexChat(project(), prepared.topic.changeId, "Explain the rework route.");
      const chatRun = JSON.parse(await readFile(join(memory.runsRoot, chat.run.id, "run.json"), "utf8")) as RunMetadata;
      const chatEvents = await readJsonl(join(memory.runsRoot, chat.run.id, "events.jsonl"));
      expect(chatRun.promptStack).toEqual(expect.arrayContaining(["goal-loop-next-step-packet", "goal-loop-routing-posture", "goal-loop-controlled-loop-state"]));
      const chatPrepared = chatEvents.find((event) => event.type === "context.prepared")?.data as Record<string, unknown> | undefined;
      expect(chatPrepared).toEqual(expect.objectContaining({
        goalLoopRoutingPostureEvidence: expect.objectContaining({
          authority: "non-executing-routing-posture-prompt-evidence",
          routingPosture: "blocked-or-rework",
          routingLabel: "Blocked or bounded rework",
          schedulerExecutionMode: "single-gate-staged",
          currentLegalActionType: "planning.scheduler.worker.rework-plan.compile",
          loopAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          harnessEvolutionAuthorized: false,
        }),
      }));
      expect(chatPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(chatPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("markdown");
      expect(chatPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("scope");

      const orchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Plan from the rework route.");
      const orchestratorRun = JSON.parse(await readFile(join(memory.runsRoot, orchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
      const orchestratorEvents = await readJsonl(join(memory.runsRoot, orchestrator.run.id, "events.jsonl"));
      expect(orchestratorRun.promptStack).toEqual(expect.arrayContaining(["goal-loop-next-step-packet", "goal-loop-routing-posture", "goal-loop-controlled-loop-state"]));
      expect(orchestratorEvents).toEqual(expect.arrayContaining([expect.objectContaining({
        type: "context.prepared",
        data: expect.objectContaining({
          goalLoopRoutingPostureEvidence: expect.objectContaining({
            routingPosture: "blocked-or-rework",
            currentLegalActionType: "planning.scheduler.worker.rework-plan.compile",
            loopAuthorized: false,
            sourceMutationAuthorized: false,
            applyAuthorized: false,
          }),
        }),
      })]));
      expect(schedulerWorkerValidationId).toBeTruthy();
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  }, 300000);

  it("records integration-barrier routing posture in actual main-agent prompt artifacts", async () => {
    const prepared = await prepareSchedulerTwoWorkerIntegrationHandoff("Goal Loop Integration Routing Runtime Evidence");
    const memory = await resolveProjectMemory(project());
    const changePath = join("harness", "changes", "active", prepared.topic.changeId);

    await compileGoalLoopEvaluation(memory, changePath);
    const visibleGoalLoop = (await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: prepared.topic.changeId })).center.workpad.goalLoop;
    expect(visibleGoalLoop).toMatchObject({
      routingPosture: "integration-check-required",
      routingLabel: "IntegrationCheck path required",
      controlledLoopState: {
        state: "integration-barrier",
      },
    });

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    try {
      const chat = await runCodexChat(project(), prepared.topic.changeId, "Explain the integration barrier.");
      const chatRun = JSON.parse(await readFile(join(memory.runsRoot, chat.run.id, "run.json"), "utf8")) as RunMetadata;
      const chatEvents = await readJsonl(join(memory.runsRoot, chat.run.id, "events.jsonl"));
      expect(chatRun.promptStack).toEqual(expect.arrayContaining(["goal-loop-next-step-packet", "goal-loop-routing-posture", "goal-loop-controlled-loop-state"]));
      expect(chatEvents).toEqual(expect.arrayContaining([expect.objectContaining({
        type: "context.prepared",
        data: expect.objectContaining({
          goalLoopRoutingPostureEvidence: expect.objectContaining({
            authority: "non-executing-routing-posture-prompt-evidence",
            routingPosture: "integration-check-required",
            routingLabel: "IntegrationCheck path required",
            schedulerExecutionMode: "blocked-or-waiting",
            loopAuthorized: false,
            wholeWaveDispatchAuthorized: false,
            slotAllocatorAuthorized: false,
            sourceMutationAuthorized: false,
            applyAuthorized: false,
          }),
        }),
      })]));

      const orchestrator = await runOrchestratorPlan(project(), prepared.topic.changeId, "Plan from the integration barrier.");
      const orchestratorRun = JSON.parse(await readFile(join(memory.runsRoot, orchestrator.run.id, "run.json"), "utf8")) as RunMetadata;
      const orchestratorEvents = await readJsonl(join(memory.runsRoot, orchestrator.run.id, "events.jsonl"));
      expect(orchestratorRun.promptStack).toEqual(expect.arrayContaining(["goal-loop-next-step-packet", "goal-loop-routing-posture", "goal-loop-controlled-loop-state"]));
      const orchestratorPrepared = orchestratorEvents.find((event) => event.type === "context.prepared")?.data as Record<string, unknown> | undefined;
      expect(orchestratorPrepared?.goalLoopRoutingPostureEvidence).toEqual(expect.objectContaining({
        routingPosture: "integration-check-required",
        routingLabel: "IntegrationCheck path required",
        loopAuthorized: false,
        sourceMutationAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
      }));
      expect(orchestratorPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("schedulerLoopEvidenceSnapshot");
      expect(orchestratorPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("markdown");
      expect(orchestratorPrepared?.goalLoopRoutingPostureEvidence).not.toHaveProperty("scope");
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  }, 300000);
});
