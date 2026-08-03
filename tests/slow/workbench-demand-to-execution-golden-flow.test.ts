import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { createWorkbenchConversation } from "../../src/workbench/conversation-service.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import {
  acceptCurrentConversationPlanningPackage,
  writePlannerChildProposal,
} from "../../src/workbench/planning/planner-child-proposal.js";
import { bindProviderThreadFixture } from "../helpers/provider-thread-fixture.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";
import { getTempDir, git, initGitRepository } from "../unit/workbench/fixtures.js";

const execFileAsync = promisify(execFile);
const SLOW_FLOW_TIMEOUT_MS = 120_000;

describe("workbench planning publication flow", () => {
  it("publishes an accepted graph to one physical project Skill without starting execution", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      const fixture = await createReadyProjectHarnessFixture({
        projectRoot: getTempDir(),
        ahoHome: process.env.AHO_HOME,
        projectId: "repo",
        projectName: "Repo",
      });
      const runtimePaths = resolveProjectRuntimePaths(fixture.project.id, fixture.ahoHome);

      const conversation = await createWorkbenchConversation(fixture.project, {
        body: "会员订单满 100 元打九折，非会员不打折，需要测试。",
      }, undefined, { runMainAgent: false });
      const runId = "planner-run-pricing";
      const parentThreadId = "parent-pricing";
      const childThreadId = "child-pricing";
      const directory = join(runtimePaths.workbenchRoot, "conversations", conversation.conversationId, "runs", runId);
      const proposalDirectory = join(directory, "planner-proposal");
      await mkdir(proposalDirectory, { recursive: true });
      await writeFile(join(proposalDirectory, "spec.md"), "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Member orders of at least 100 receive a ten percent discount; non-members do not.\n", "utf8");
      await writeFile(join(proposalDirectory, "plan.md"), [
        "# Plan", "", "Implement and test the pricing rule.", "", "## Workflow", "", "```json",
        JSON.stringify({ version: "1.0", mode: "sequential-v1", nodes: [{
          id: "pricing-rule",
          title: "Implement pricing rule",
          taskIds: ["T-001"],
          acIds: ["AC-001"],
          prompt: "Objective: Implement the accepted pricing rule. Required behavior: Update the rule and its tests. Constraints: Stay within accepted source scopes. Expected evidence: Report changed files and passing tests.",
          dependsOn: [],
          sourceScopes: ["src/**", "tests/**"],
        }] }, null, 2),
        "```", "",
      ].join("\n"), "utf8");
      await writeFile(join(proposalDirectory, "tasks.md"), "# Tasks\n\n- [ ] T-001: Implement and test the pricing rule.\n  - Covers: AC-001\n", "utf8");
      const proposal = await writePlannerChildProposal({
        directory,
        projectId: fixture.project.id,
        conversationId: conversation.conversationId,
        runId,
        parentThreadId,
        childThreadId,
      });
      const store = await openProjectRuntimeWorkbenchDatabase(runtimePaths);
      try {
        const now = new Date().toISOString();
        const graphScopeId = store.conversations.readConversation(
          fixture.project.id,
          conversation.conversationId,
        )?.currentGraphScopeId ?? null;
        bindProviderThreadFixture(store, {
          projectId: fixture.project.id,
          conversationId: conversation.conversationId,
          providerId: "codex",
          providerThreadId: parentThreadId,
          roleId: "main-agent",
          parentThreadId: null,
          changeId: null,
          graphScopeId,
          capabilityProfile: "main-agent-goal-v1",
          updatedAt: now,
        });
        bindProviderThreadFixture(store, {
          projectId: fixture.project.id,
          conversationId: conversation.conversationId,
          providerId: "codex",
          providerThreadId: childThreadId,
          roleId: "planning-agent",
          parentThreadId,
          changeId: null,
          graphScopeId,
          capabilityProfile: "planner-child-v1",
          updatedAt: now,
        });
        store.timeline.appendMessage({
          id: `assistant:${conversation.conversationId}:${runId}:${childThreadId}`,
          projectId: fixture.project.id,
          conversationId: conversation.conversationId,
          agentSurfaceId: `agent:codex:thread:${childThreadId}`,
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

      const accepted = await acceptCurrentConversationPlanningPackage(
        fixture.project,
        conversation.conversationId,
        proposal.artifact,
      );
      expect(accepted.workflowGraphPlan).toMatchObject({
        changeId: accepted.changeId,
        status: "compiled",
      });
      expect(existsSync(join(fixture.skillRoot, accepted.workflowGraphPlan.artifact))).toBe(true);
      expect(await listWorkflowRuns(runtimePaths, accepted.changeId)).toEqual([]);
      expect(await gitStatus(getTempDir())).toBe("");
      expect(existsSync(join(getTempDir(), ".agent-harness", "project.json"))).toBe(false);
      expect(existsSync(join(getTempDir(), "harness", "changes"))).toBe(false);
      expect(existsSync(join(getTempDir(), "runs"))).toBe(false);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, SLOW_FLOW_TIMEOUT_MS);
});

async function gitStatus(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  return stdout.trim();
}
