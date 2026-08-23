import { describe, expect, it } from "vitest";
import {
  aggregateProductModeActivity,
  deriveAgentSurfaceActivity,
  deriveHarnessActivity,
} from "../../src/workbench/product-mode-activity.js";
import type { WorkbenchSnapshot, WorkbenchWorkpadSummary } from "../../src/workbench/read-model-types.js";
import type { AgentSurfaceProjectionItem, AgentSurfaceStatus } from "../../src/workbench/agent-surface-contract.js";

describe("ProductModeActivityProjectionOwner", () => {
  it("keeps a current terminal failure visible without treating terminal work as running", () => {
    expect(deriveAgentSurfaceActivity([surface("failed")], "terminal")).toBe("failed");
    expect(deriveAgentSurfaceActivity([surface("running")], "terminal")).toBe("idle");
    expect(deriveAgentSurfaceActivity([surface("running")], "active")).toBe("running");
  });

  it("uses attention over failed over running and exposes no detail collection", () => {
    expect(aggregateProductModeActivity([
      { state: "running", updatedAt: "2026-08-23T00:00:01.000Z" },
      { state: "failed", updatedAt: "2026-08-23T00:00:02.000Z" },
      { state: "attention", updatedAt: "2026-08-23T00:00:03.000Z" },
    ])).toEqual({ state: "attention", updatedAt: "2026-08-23T00:00:03.000Z" });
    expect(aggregateProductModeActivity([
      { state: "running", updatedAt: "2026-08-23T00:00:01.000Z" },
      { state: "failed", updatedAt: "2026-08-23T00:00:02.000Z" },
    ])).toEqual({ state: "failed", updatedAt: "2026-08-23T00:00:02.000Z" });
    expect(Object.keys(aggregateProductModeActivity([]))).toEqual(["state", "updatedAt"]);
  });

  it("derives Harness attention, explicit failure, running, and idle from current projection facts", () => {
    expect(deriveHarnessActivity(snapshot([
      workpad("waiting", { runtimeStatus: "waiting-decision", waitingDecisionCount: 1 }),
      workpad("failed", { runtimeStatus: "blocked", latestRunStatus: "failed" }),
      workpad("running", { runtimeStatus: "running" }),
    ]))).toMatchObject({ state: "attention" });
    expect(deriveHarnessActivity(snapshot([
      workpad("failed", { runtimeStatus: "blocked", latestRunStatus: "failed" }),
      workpad("running", { runtimeStatus: "running" }),
    ]))).toMatchObject({ state: "failed" });
    expect(deriveHarnessActivity(snapshot([
      workpad("queued", { runtimeStatus: "queued" }),
    ]))).toMatchObject({ state: "running" });
    expect(deriveHarnessActivity(snapshot([
      workpad("archived", { state: "archive", runtimeStatus: "archived" }),
    ]))).toEqual({ state: "idle", updatedAt: null });
  });

  it("treats non-failure blocked work as attention instead of a failed run", () => {
    expect(deriveHarnessActivity(snapshot([
      workpad("blocked", { runtimeStatus: "blocked", latestRunStatus: "needs-user-input" }),
    ]))).toMatchObject({ state: "attention" });
  });
});

function snapshot(workpads: WorkbenchWorkpadSummary[]): WorkbenchSnapshot {
  return {
    left: { workpads },
    center: { conversationInteractions: { productMode: "harness", items: [] } },
    right: {
      confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [], history: [] },
    },
  } as unknown as WorkbenchSnapshot;
}

function surface(status: AgentSurfaceStatus): AgentSurfaceProjectionItem {
  return {
    agentSurfaceId: "main-agent",
    kind: "main-agent",
    roleId: "main-agent",
    roleDisplayName: "Agent",
    label: "Agent",
    description: "",
    skills: [],
    parentAgentSurfaceId: null,
    graphScopeId: "scope-current",
    scopeRange: "current",
    status,
    readOnly: false,
    createdAt: "2026-08-23T00:00:00.000Z",
  };
}

function workpad(id: string, override: Partial<WorkbenchWorkpadSummary>): WorkbenchWorkpadSummary {
  return {
    id,
    title: id,
    state: "active",
    runtimeStatus: "active",
    userStatus: "processing",
    userStatusLabel: "处理中",
    conversationLifecycle: "active",
    selected: false,
    waitingDecisionCount: 0,
    updatedAt: `2026-08-23T00:00:0${id.length}.000Z`,
    ...override,
  };
}
