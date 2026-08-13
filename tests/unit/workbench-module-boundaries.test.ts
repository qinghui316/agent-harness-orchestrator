import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const retiredLoopName = ["goal", "loop"].join("-");
const retiredFiles = [
  `src/${retiredLoopName}`,
  `src/${retiredLoopName}-runtime`,
  "src/automation-runtime",
  `src/workbench/actions/handlers/${retiredLoopName}.ts`,
  `src/workbench/actions/handlers/${retiredLoopName}-runtime.ts`,
  "src/workbench/actions/handlers/automation.ts",
  "src/workbench/actions/visible-goal-loop-current-gate.ts",
  "src/workbench/actions/goal-loop-gate-confirmation.ts",
  "src/main-agent-orchestration/action-bridge.ts",
  "src/main-agent-orchestration/resume-continuation.ts",
  "src/main-agent-orchestration/strategy-advice-runtime.ts",
  "src/workflow-scheduler/controlled-step.ts",
];

describe("Workbench module boundaries", () => {
  it("retires the legacy objective loop, controlled continuation, scoped automation, and bridge owners", () => {
    for (const file of retiredFiles) expect(existsSync(file), file).toBe(false);
  });

  it("keeps retired action ids out of product source", () => {
    const retiredActionPattern = [
      ["planning\\.", "goal", "-", "loop"].join(""),
      ["planning\\.scheduler\\.controlled-", "(step|advance)"].join(""),
      ["planning\\.automation\\.scoped-", "auto"].join(""),
    ].join("|");
    const output = rgOutput([
      "-n",
      retiredActionPattern,
      "src",
    ]);
    expect(output.trim()).toBe("");
  });

  it("keeps workflow-runtime independent of Workbench, web, and server UI types", () => {
    const output = rgOutput(["-n", "workbench|src/web|src/server", "src/workflow-runtime"]);
    expect(output.trim()).toBe("");
  });

  it("routes provider-switch DemandWorker reconciliation through the Skill-native Workbench owner", () => {
    const providerSwitch = readFileSync("src/workbench/provider-switch.ts", "utf8");
    expect(providerSwitch).toContain('from "./demand-workers/orchestration.js"');
    expect(providerSwitch).not.toMatch(/workflow-runtime\/demand-worker|reconcileDemandWorkersForRuntime/);
  });

  it("keeps Change acceptance independent of Workbench, web, and server storage", () => {
    const output = rgOutput(["-n", "workbench|src/web|src/server", "src/change"]);
    expect(output.trim()).toBe("");
  });

  it("keeps Codex launch sites behind the shared executable resolver", () => {
    const output = rgOutput([
      "-n",
      'spawn\\("codex"|command:\\s*"codex"|command:\\s*\\["codex"|return \\{ command: "codex"',
      "src/codex",
      "src/agent",
      "src/code",
    ]);
    expect(output.trim()).toBe("");
  });

  it("keeps Scheduler current-step selection in workflow-runtime and the leaf helper exact-target only", () => {
    const owner = readFileSync("src/workflow-runtime/scheduler-ready-set.ts", "utf8");
    const leaf = readFileSync("src/scheduler-runtime/worker-start.ts", "utf8");
    expect(owner).toContain("readLatestSchedulerCurrentTransitionView");
    expect(owner).toContain("runSchedulerReadySetCurrentStep");
    expect(owner).toContain("startSchedulerCoderWorkerForReadySetTarget");
    expect(leaf).not.toContain("findNextSchedulerReservationIntent");
    expect(leaf).not.toContain("start-all");
  });

  it("keeps native Goal lifecycle provider-owned without an AHO Goal state store", () => {
    const provider = readFileSync("src/codex/app-server.ts", "utf8");
    const conversation = readFileSync("src/workbench/main-agent-turn-coordinator.ts", "utf8");
    expect(provider).toContain('sendRequest("thread/goal/get"');
    expect(provider).toContain('sendRequest("thread/goal/set"');
    expect(conversation).toContain('name: "aho_goal_yield"');
    expect(conversation).toContain('name: "aho_finalize_current_change"');
    expect(existsSync("src/workbench/codex-chat")).toBe(false);
    expect(existsSync("src/goal-manager")).toBe(false);
  });

  it("keeps canonical Timeline delivery and Conversation lifecycle in exact owners", () => {
    for (const retired of [
      "src/workbench/chat.ts",
      "src/workbench/manager.ts",
      "src/workbench/canonical-timeline.ts",
      "src/workbench/conversation-thread.ts",
    ]) expect(existsSync(retired), retired).toBe(false);

    const directPublishers = rgOutput(["-l", 'emit\\(\\{ event: "timeline\\.patch"', "src/workbench"])
      .trim().split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll("\\", "/"));
    expect(directPublishers).toEqual(["src/workbench/canonical-timeline-delivery.ts"]);

    const directWrites = rgOutput(["-l", "\\.timeline\\.(appendMessage|updateMessage)\\(", "src/workbench"])
      .trim().split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll("\\", "/")).sort();
    expect(directWrites).toEqual([
      "src/workbench/canonical-timeline-delivery.ts",
      "src/workbench/persistence/repositories/interaction-repository.ts",
      "src/workbench/persistence/unit-of-work.ts",
    ]);

    const contract = readFileSync("src/workbench/canonical-timeline-contract.ts", "utf8");
    expect(contract).not.toMatch(/read-model|database|\.\/types\.js/);
    expect(contract).toContain('import type { ProductMode } from "../provider-runtime/index.js";');
    const retiredSymbols = rgOutput([
      "-n",
      "knownIds|canonicalMessageIds|upsertCanonicalMessage|upsertBackgroundEntry|appendConversationTimelineEntry|openConversationTimelineWriter|ConversationTimelineWriter",
      "src",
    ]);
    expect(retiredSymbols.trim()).toBe("");
  });

  it("keeps Conversation, Main Agent, and Workflow lifecycle owners acyclic", () => {
    const conversation = readFileSync("src/workbench/conversation-service.ts", "utf8");
    const main = readFileSync("src/workbench/main-agent-turn-coordinator.ts", "utf8");
    const workflow = readFileSync("src/workbench/workflow-conversation-bridge.ts", "utf8");
    const identity = readFileSync("src/workbench/conversation-identity.ts", "utf8");

    expect(conversation).not.toContain('from "./main-agent-turn-coordinator.js"');
    expect(conversation).toContain('from "./workflow-conversation-bridge.js"');
    expect(main).not.toContain('from "./workflow-conversation-bridge.js"');
    expect(conversation).toContain("continueMainAgentTurn: turnRouter.continueMainAgentTurn");
    expect(workflow).toContain("resumeNativeGoalAfterAction");
    expect(workflow).toContain("requireContinueMainAgentTurn(ports)");
    expect(main).not.toMatch(/childProcessMessage\.attemptId\s*=\s*isPlannerChild/);
    expect(workflow).not.toMatch(/conversation-service|main-agent-turn-coordinator/);
    expect(workflow).toContain('from "./conversation-identity.js"');
    expect(identity).not.toMatch(/conversation-service|main-agent-turn-coordinator|workflow-conversation-bridge/);
  });
});

function rgOutput(args: string[]): string {
  try {
    return execFileSync("rg", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return "";
    throw error;
  }
}
