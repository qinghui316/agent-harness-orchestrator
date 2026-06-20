import { describe, expect, it } from "vitest";
import { labelForAction, summarizeActionResult } from "../../src/workbench/actions/results.js";

const CONTROLLED_LOOP_ACTIONS = [
  {
    actionType: "planning.scheduler.controlled-advance.run",
    result: {
      controlledAdvance: { actionType: "planning.scheduler.worker.start-next" },
      controlledStep: { actionType: "planning.scheduler.worker.start-next" },
    },
    label: "按当前建议继续一个受控步骤",
    summary: "只按当前建议推进了一个受控步骤",
  },
  {
    actionType: "planning.scheduler.controlled-step.run",
    result: {
      controlledStep: { actionType: "planning.scheduler.worker.start-next" },
    },
    label: "执行一个受控步骤",
    summary: "已执行当前确认的一个受控步骤",
  },
  {
    actionType: "planning.goal-loop.evaluate",
    result: { goalLoopIteration: { continuationState: "ready-for-existing-gate" } },
    label: "评估下一步",
    summary: "下一步评估已完成",
  },
  {
    actionType: "planning.goal-loop.feedback.evaluate",
    result: { goalLoopIteration: { continuationState: "ready-for-existing-gate" } },
    label: "根据反馈重新评估",
    summary: "你的反馈已记录",
  },
  {
    actionType: "planning.goal-loop.controller.refresh",
    result: { goalLoopControllerPolicy: { verdict: "allow" } },
    label: "刷新下一步判断",
    summary: "下一步判断已刷新",
  },
  {
    actionType: "planning.goal-loop.gate-readiness.prepare",
    result: { goalLoopGateReadinessPreflight: { currentGate: { actionType: "planning.scheduler.worker.start-next" } } },
    label: "检查当前步骤",
    summary: "当前步骤已重新检查",
  },
] as const;

const FORBIDDEN_PRIMARY_TERMS = [
  "Goal Loop",
  "Goal loop",
  "GoalLoop",
  "planning.scheduler",
  "SchedulerRun",
  "Harness gate",
  "continuation brief",
  "concrete gate",
  "whole-wave",
  "slot allocator",
];

describe("Workbench action result summaries", () => {
  it("labels and summarizes controlled loop results in user-facing terms", () => {
    for (const item of CONTROLLED_LOOP_ACTIONS) {
      const label = labelForAction(item.actionType);
      const summary = summarizeActionResult(item.actionType, item.result);

      expect(label).toBe(item.label);
      expect(summary).toContain(item.summary);
      expect(summary).toMatch(/需要你?单独确认/);
      expectUserCopyNotToContainInternalTerms(`${label}\n${summary}`);
    }
  });

  it("does not leak nested scheduler action ids from degraded controlled advance payloads", () => {
    const summary = summarizeActionResult("planning.scheduler.controlled-advance.run", {
      controlledAdvance: {
        actionType: "planning.scheduler.integration-check.run",
      },
    });

    expect(summary).toContain("只按当前建议推进了一个受控步骤");
    expectUserCopyNotToContainInternalTerms(summary);
  });

  it("summarizes controlled advance post-step evidence without adding executable language", () => {
    const refreshed = summarizeActionResult("planning.scheduler.controlled-advance.run", {
      postStepGoalLoopEvaluation: {
        goalLoopNextStepPacketId: "packet-post",
        executionStarted: false,
      },
    });
    const warning = summarizeActionResult("planning.scheduler.controlled-advance.run", {
      postStepGoalLoopEvaluationWarning: "refresh failed",
    });

    expect(refreshed).toContain("下一步证据已刷新");
    expect(refreshed).toMatch(/需要你?单独确认/);
    expect(warning).toContain("当前步骤已完成，但下一步证据刷新未完成");
    expect(warning).toMatch(/重新评估/);
    expectUserCopyNotToContainInternalTerms(`${refreshed}\n${warning}`);
  });
});

function expectUserCopyNotToContainInternalTerms(copy: string): void {
  for (const forbidden of FORBIDDEN_PRIMARY_TERMS) {
    expect(copy).not.toContain(forbidden);
  }
}
