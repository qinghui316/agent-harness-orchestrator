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
    const conversation = readFileSync("src/workbench/chat.ts", "utf8");
    expect(provider).toContain('sendRequest("thread/goal/get"');
    expect(provider).toContain('sendRequest("thread/goal/set"');
    expect(conversation).toContain('name: "aho_goal_yield"');
    expect(existsSync("src/workbench/codex-chat/bridge.ts")).toBe(false);
    expect(existsSync("src/goal-manager")).toBe(false);
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
