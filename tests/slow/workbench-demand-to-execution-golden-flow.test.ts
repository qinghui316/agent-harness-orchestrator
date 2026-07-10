import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { acceptConversationPlanningPackage } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchConversation } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { writePlannerChildProposal } from "../../src/workbench/planning/planner-child-proposal.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import {
  createFakeCodex,
  getTempDir,
  git,
  initGitRepository,
  project,
} from "../unit/workbench/fixtures.js";
import type { WorkbenchDecisionAction } from "../../src/workbench/read-model-types.js";

const execFileAsync = promisify(execFile);
const SLOW_FLOW_TIMEOUT_MS = 120_000;

describe("workbench demand-to-execution golden flow", () => {
  it("carries a natural demand through planning, readiness, code, validation, and audit without source apply", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    const oldPath = process.env.PATH;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nfake-codex-bin/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());

      const conversation = await createWorkbenchConversation(project(), {
        title: "Pricing Demand",
        body: "会员订单满 100 元打九折，非会员不打折，需要测试。",
      }, undefined, { runMainAgent: false });
      const memory = await resolveProjectMemory(project());
      const runId = "planner-run-pricing";
      const parentThreadId = "parent-pricing";
      const childThreadId = "child-pricing";
      const proposal = await writePlannerChildProposal({
        directory: join(memory.workbenchRoot, "conversations", conversation.conversationId, "runs", runId),
        projectId: project().id,
        conversationId: conversation.conversationId,
        runId,
        parentThreadId,
        childThreadId,
        finalText: JSON.stringify({
          status: "proposed",
          specMd: "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Member orders of at least 100 receive a ten percent discount; non-members do not.\n",
          planMd: [
            "# Plan", "", "Implement and test the pricing rule.", "", "## Workflow", "", "```json",
            JSON.stringify({ version: "1.0", mode: "sequential-v1", nodes: [{
              id: "pricing-rule",
              title: "Implement pricing rule",
              taskIds: ["T-001"],
              acIds: ["AC-001"],
              prompt: "Implement the accepted pricing rule and its tests.",
              dependsOn: [],
              sourceScopes: ["src/**", "tests/**"],
            }] }, null, 2),
            "```", "",
          ].join("\n"),
          tasksMd: "# Tasks\n\n- [ ] T-001: Implement and test the pricing rule.\n  - Covers: AC-001\n",
          openQuestions: [],
          assumptions: [],
          warnings: [],
        }),
      });
      const store = await WorkbenchStore.open(memory);
      try {
        const now = new Date().toISOString();
        store.writeProviderThread({ projectId: project().id, conversationId: conversation.conversationId, providerThreadId: parentThreadId, roleId: "main-agent", parentThreadId: null, changeId: null, capabilityProfile: "main-agent-goal-v1", updatedAt: now });
        store.writeProviderThread({ projectId: project().id, conversationId: conversation.conversationId, providerThreadId: childThreadId, roleId: "planning-agent", parentThreadId, changeId: null, capabilityProfile: "planner-child-v1", updatedAt: now });
        store.appendMessage({
          id: `assistant:${conversation.conversationId}:${runId}:${childThreadId}`,
          projectId: project().id,
          conversationId: conversation.conversationId,
          changeId: "",
          type: "assistant.message",
          timestamp: now,
          text: proposal.planMd,
          actionRunId: null,
          actionType: null,
          status: "completed",
          runId,
          artifact: proposal.artifact,
          error: null,
          rawJson: JSON.stringify({ agentRoleId: "planning-agent", artifact: proposal.artifact }),
        });
      } finally {
        store.close();
      }
      const accepted = await acceptConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact);
      process.env.PATH = join(getTempDir(), "no-codex-bin");

      let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: conversation.conversationId });
      expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
      const runCode = primaryWorkflowAction(snapshot, "workflow.run.start");
      expect(runCode).toMatchObject({
        changeId: accepted.changeId,
        workflowGraphPlanId: accepted.workflowGraphPlan.id,
      });
      expect(JSON.stringify(snapshot.right.confirmationQueue)).not.toMatch(/full-auto|parallel executor|merge queue|slot allocator|whole-wave/i);
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      expect(await gitStatus(getTempDir())).toBe("");

      const fakeCodex = await createFakeCodex();
      process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
      const codeResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...runCode,
        confirm: true,
      });
      expect(unwrapWorkflowActionResult(codeResult.result)).toMatchObject({ status: "completed" });
      expect(await gitStatus(getTempDir())).toBe("");

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: conversation.conversationId });
      expect(snapshot.center.workpad.resultReview).toMatchObject({
        status: "not-ready",
        validation: expect.objectContaining({ status: "passed" }),
        audit: expect.objectContaining({ status: expect.stringMatching(/approved/) }),
        applyReadiness: expect.objectContaining({ kind: "not-approved" }),
      });
      expect(snapshot.right.confirmationQueue.primary).toMatchObject({
        id: expect.stringContaining("confirm:approval:audit:"),
        changeId: accepted.changeId,
        primary: true,
      });
      const auditAccept = primaryApprovalAction(snapshot, "audit.accept");
      await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        action: auditAccept.action,
        confirm: true,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: conversation.conversationId });
      expect(snapshot.center.workpad.resultReview).toMatchObject({
        status: "ready-to-apply",
        validation: expect.objectContaining({ status: "passed" }),
        audit: expect.objectContaining({ status: expect.stringMatching(/approved/) }),
      });
      expect(snapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "single-result-apply",
        changeId: accepted.changeId,
        primary: true,
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  }, SLOW_FLOW_TIMEOUT_MS);
});

function primaryWorkflowAction(snapshot: Awaited<ReturnType<typeof getWorkbenchSnapshot>>, actionType: string): WorkbenchDecisionAction {
  const action = snapshot.right.confirmationQueue.primary?.actions.find((candidate) => candidate.actionType === actionType);
  if (!action) throw new Error(`Missing primary ${actionType} action.`);
  return action;
}

function primaryApprovalAction(snapshot: Awaited<ReturnType<typeof getWorkbenchSnapshot>>, actionId: string): WorkbenchDecisionAction {
  const action = snapshot.right.confirmationQueue.primary?.actions.find((candidate) => candidate.action?.actionId === actionId);
  if (!action) throw new Error(`Missing primary ${actionId} approval action.`);
  return action;
}

function unwrapWorkflowActionResult(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return record.result ?? value;
}

async function gitStatus(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  return stdout.trim();
}
