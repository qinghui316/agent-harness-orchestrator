import { runGoalLoopControlledContinuation } from "../../../goal-loop-runtime/runner.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import type { ManagedProject } from "../../../types/index.js";
import { emitAssistantEvent } from "../../live-events.js";
import { resolveTopic } from "../../topic-resolver.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../types.js";
import { controlledLoopResultLabel } from "../../user-surface/controlled-loop-results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction } from "../boundary.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";
import { summarizeActionResult } from "../results.js";
import { resolveVisibleControlledSchedulerAdvanceRequest } from "../visible-goal-loop-current-gate.js";
import { buildSchedulerActionHandlers } from "./scheduler.js";

type GoalLoopRuntimeWorkbenchActionType = "planning.goal-loop.controlled-continue.run";

type ControlledAdvanceRequest = WorkbenchWorkflowActionRequest & { actionType: "planning.scheduler.controlled-advance.run" };

export function buildGoalLoopRuntimeActionHandlers(): Pick<WorkbenchActionHandlerMap, GoalLoopRuntimeWorkbenchActionType> {
  return {
    "planning.goal-loop.controlled-continue.run": async (project, changeId, request, live) => runControlledGoalLoopContinuation(project, changeId, request, live),
  };
}

async function runControlledGoalLoopContinuation(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
) {
  const runtimeRequest = assertGoalLoopControlledContinueRequest(changeId, request);
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal Loop controlled continuation runtime");
  const schedulerHandlers = buildSchedulerActionHandlers();
  const result = await runGoalLoopControlledContinuation({
    memory,
    changePath,
    request: runtimeRequest,
    services: {
      resolveCurrentControlledAdvanceRequest: async () => {
        const resolved = await resolveVisibleControlledSchedulerAdvanceRequest(project, changeId);
        return "request" in resolved ? resolved.request : resolved;
      },
      dispatchControlledAdvance: async (childRequest, auditScope) => {
        const workflowRequest = {
          ...childRequest,
          actionType: "planning.scheduler.controlled-advance.run",
          goalLoopRuntimeAuthorizationId: readString(auditScope, "coveredByGoalLoopRuntimeAuthorizationId"),
          goalLoopRuntimeRunId: readString(auditScope, "goalLoopRuntimeRunId"),
        } as ControlledAdvanceRequest;
        assertWorkflowActionScope(workflowRequest);
        await auditHighImpactWorkflowAction(project, changeId, workflowRequest, live);
        return schedulerHandlers["planning.scheduler.controlled-advance.run"](project, changeId, workflowRequest, live);
      },
      summarizeChildResult: (childResult) => summarizeActionResult("planning.scheduler.controlled-advance.run", childResult),
    },
  });
  const text = `已按一次确认连续推进 ${result.runtimeRun.completedSteps} 步。停止原因：${result.summary}`;
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-controlled-continuation-stopped",
    text,
    artifact: result.runtimeRun.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.runtimeRun.id,
    kind: "file-change",
    phase: "goal-loop-controlled-continuation-stopped",
    title: controlledLoopResultLabel("planning.goal-loop.controlled-continue.run") ?? "连续推进当前目标",
    summary: text,
    artifactRef: result.runtimeRun.artifact,
  });
  return result;
}

function assertGoalLoopControlledContinueRequest(
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
): WorkbenchWorkflowActionRequest & {
  actionType: "planning.goal-loop.controlled-continue.run";
  changeId: string;
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  goalLoopGateReadinessPreflightId: string;
  goalLoopCurrentGateActionType: string;
} {
  if (request.actionType !== "planning.goal-loop.controlled-continue.run") throw new Error("Expected planning.goal-loop.controlled-continue.run.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.controlled-continue.run changeId scope mismatch.");
  if (!request.goalLoopNextStepPacketId) throw new Error("planning.goal-loop.controlled-continue.run requires goalLoopNextStepPacketId.");
  if (!request.goalLoopControllerPolicyId) throw new Error("planning.goal-loop.controlled-continue.run requires goalLoopControllerPolicyId.");
  if (!request.goalLoopGateReadinessPreflightId) throw new Error("planning.goal-loop.controlled-continue.run requires goalLoopGateReadinessPreflightId.");
  if (!request.goalLoopCurrentGateActionType) throw new Error("planning.goal-loop.controlled-continue.run requires goalLoopCurrentGateActionType.");
  return request as ReturnType<typeof assertGoalLoopControlledContinueRequest>;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}
