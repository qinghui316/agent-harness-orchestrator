import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange, closeChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { startLocalCommandRun } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { appendTopicThreadEntry, createWorkbenchTopic } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, getWorkbenchStream, getWorkbenchTopic, listWorkbenchApprovals, listWorkbenchRoles, listWorkbenchTopics } from "../../src/workbench/manager.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ManagedProject, RunMetadata } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-workbench-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function project(path = tempDir): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

describe("workbench read model", () => {
  it("lists active and archived changes as topics", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archive Me" });
    await writeFile(join(tempDir, "harness", "changes", "active", "archive-me", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);
    await createChange(project(), { title: "Active Topic" });

    const topics = await listWorkbenchTopics({ project: project(), path: tempDir });

    expect(topics.map((item) => [item.id, item.state])).toEqual(expect.arrayContaining([
      ["active-topic", "active"],
      ["archive-me", "archive"],
    ]));
  });

  it("builds a snapshot with selected topic, semantic thread, roles, gaps, and close approval", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workbench Smoke" });
    await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('hello')"]);
    await writeFile(join(tempDir, "harness", "changes", "active", "workbench-smoke", "reviews", "review.md"), "Status: approved\n", "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir });

    expect(snapshot.left.topics[0]).toMatchObject({ id: "workbench-smoke", state: "active" });
    expect(snapshot.center.selectedTopic?.id).toBe("workbench-smoke");
    expect(snapshot.center.agentLoop.runs).toHaveLength(1);
    expect(snapshot.center.thread.items.some((item) => item.kind === "change-state")).toBe(true);
    expect(snapshot.center.thread.items.some((item) => item.runId === snapshot.center.agentLoop.runs[0]?.id)).toBe(false);
    expect(snapshot.right.approvals.some((item) => item.kind === "change-close")).toBe(true);
    expect(snapshot.right.approvals.find((item) => item.kind === "change-close")?.action).toMatchObject({
      actionId: "change.close",
      mutates: true,
      requiresConfirmation: true,
    });
    expect(snapshot.roles.map((item) => item.id)).toEqual(expect.arrayContaining(["coder", "auditor", "validator"]));
    expect(snapshot.harnessGaps.map((item) => item.id)).toEqual(expect.arrayContaining(["roleCatalog", "sessionModel", "subagentSpec"]));
  });

  it("keeps archived topic messages in the semantic thread stream", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Archive Messages", body: "Need a durable archived thread." });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "orchestrator.plan",
      text: "I prepared the plan card.",
      planCard: {
        title: "Archived plan",
        summary: "This plan should survive archive lookup.",
        steps: [{ label: "Review", description: "Read the archived evidence." }],
        warnings: [],
      },
    });
    await writeFile(join(tempDir, "harness", "changes", "active", topic.changeId, "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.center.selectedTopic).toMatchObject({ id: topic.changeId, state: "archive" });
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "Need a durable archived thread." }),
      expect.objectContaining({
        kind: "assistant-turn",
        planCard: expect.objectContaining({ title: "Archived plan" }),
        blocks: expect.arrayContaining([
          expect.objectContaining({ kind: "plan-card", title: "Archived plan" }),
        ]),
      }),
    ]));
  });

  it("projects code workflow summaries with validation and audit evidence without raw run events", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), { title: "Code Evidence", body: "Implement the pricing rule." });
    const run = await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('code')"]);
    await appendTopicThreadEntry(project(), topic.changeId, { type: "workflow.started", actionRunId: "action-code", actionType: "code.run", status: "running" });
    await appendTopicThreadEntry(project(), topic.changeId, {
      type: "workflow.completed",
      actionRunId: "action-code",
      actionType: "code.run",
      status: "completed",
      runId: run.run.id,
      text: "I updated the pricing rule and kept validation evidence attached.",
      activity: [
        { kind: "status", label: "running", detail: "Coder", timestamp: run.run.startedAt },
        {
          kind: "assistant-event",
          event: {
            runId: run.run.id,
            kind: "command",
            phase: "completed",
            title: "Command completed",
            summary: "npm test",
            command: "npm test",
            preview: "ok",
            exitCode: 0,
          },
          timestamp: run.run.finishedAt ?? run.run.startedAt,
        },
        { kind: "tool", tool: { runId: run.run.id, phase: "completed", name: "Validation", status: "passed" }, timestamp: run.run.finishedAt ?? run.run.startedAt },
      ],
    });
    await writeFile(join(tempDir, ".agent-harness", "runs", run.run.id, "validation.json"), JSON.stringify({
      version: "1.0",
      id: "validation-code",
      runId: run.run.id,
      changeId: topic.changeId,
      profile: "default",
      status: "passed",
      executionMode: "direct",
      startedAt: run.run.startedAt,
      finishedAt: run.run.finishedAt ?? run.run.startedAt,
      commands: [{
        name: "test",
        command: ["npm", "test"],
        cwd: tempDir,
        status: "passed",
        exitCode: 0,
        signal: null,
        startedAt: run.run.startedAt,
        finishedAt: run.run.finishedAt ?? run.run.startedAt,
        stdout: "ok",
        stderr: "",
      }],
    }, null, 2), "utf8");
    await writeFile(join(tempDir, ".agent-harness", "runs", run.run.id, "audit.json"), JSON.stringify({
      version: "1.0",
      id: "audit-code",
      runId: run.run.id,
      changeId: topic.changeId,
      status: "approved-with-notes",
      startedAt: run.run.startedAt,
      finishedAt: run.run.finishedAt ?? run.run.startedAt,
      findings: [],
      artifacts: {
        audit: `.agent-harness/runs/${run.run.id}/audit.json`,
        auditMarkdown: `.agent-harness/runs/${run.run.id}/audit.md`,
        lastMessage: `.agent-harness/runs/${run.run.id}/last-message.md`,
      },
    }, null, 2), "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.center.thread.items.filter((item) => item.kind === "workflow-summary" && item.actionRunId === "action-code")).toHaveLength(0);
    expect(snapshot.center.thread.items.filter((item) => item.kind === "assistant-turn" && item.runId === run.run.id)).toHaveLength(1);
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "assistant-turn",
        body: "I updated the pricing rule and kept validation evidence attached.",
        activity: expect.arrayContaining([
          expect.objectContaining({ kind: "assistant-event" }),
          expect.objectContaining({ kind: "tool" }),
        ]),
        blocks: expect.arrayContaining([
          expect.objectContaining({ kind: "prose", text: "I updated the pricing rule and kept validation evidence attached." }),
          expect.objectContaining({ kind: "command", command: "npm test" }),
          expect.objectContaining({ kind: "workflow-evidence", source: "workflow", status: "completed" }),
          expect.objectContaining({ kind: "workflow-evidence", source: "validation", status: "passed" }),
          expect.objectContaining({ kind: "workflow-evidence", source: "audit", status: "approved-with-notes" }),
        ]),
        evidence: expect.arrayContaining([
          expect.objectContaining({ source: "workflow", status: "completed" }),
          expect.objectContaining({ source: "validation", status: "passed" }),
          expect.objectContaining({ source: "audit", status: "approved-with-notes" }),
        ]),
      }),
    ]));
    expect(snapshot.center.thread.items.some((item) => item.kind === "evidence" && item.runId === run.run.id)).toBe(false);
    expect(snapshot.center.thread.items.some((item) => item.label === "process.started" || item.label === "run.completed")).toBe(false);
  });

  it("replays run stream artifacts with bounded previews and diagnostics", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Stream Topic" });
    const result = await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('hello stream')"]);
    const runDir = join(tempDir, ".agent-harness", "runs", result.run.id);
    await writeFile(join(runDir, "last-message.md"), "x".repeat(5000), "utf8");
    await rm(join(runDir, "stderr.log"), { force: true });

    const stream = await getWorkbenchStream({ project: project(), path: tempDir }, result.run.id);

    expect(stream.live).toBe(false);
    expect(stream.run.id).toBe(result.run.id);
    expect(stream.events.map((item) => item.type)).toEqual(expect.arrayContaining(["run.created", "process.started", "run.completed"]));
    expect(stream.artifacts.find((item) => item.key === "stdout")).toMatchObject({ exists: true, kind: "log" });
    expect(stream.artifacts.find((item) => item.key === "lastMessage")).toMatchObject({ exists: true, truncated: true });
    expect(stream.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("stderr")]));
  });

  it("returns a diagnostic snapshot when durable memory is unavailable", async () => {
    const snapshot = await getWorkbenchSnapshot({ project: null, path: tempDir });

    expect(snapshot.left.topics).toHaveLength(0);
    expect(snapshot.center.selectedTopic).toBeNull();
    expect(snapshot.warnings).toEqual(expect.arrayContaining([
      "Project is not registered; snapshot is diagnostic only.",
      "Project is not managed by AHO.",
      "Durable memory is unavailable. AHO will not infer project history.",
    ]));
  });

  it("summarizes bundled role profiles without enabling scheduling", async () => {
    const roles = await listWorkbenchRoles();
    const coder = roles.find((item) => item.id === "coder");
    const validator = roles.find((item) => item.id === "validator");

    expect(coder).toMatchObject({ writeCapability: "worktree-write", preferredRuntime: "codex" });
    expect(validator).toMatchObject({ writeCapability: "deterministic-writer", preferredRuntime: "local-command" });
    expect(roles.every((item) => item.sections.length > 0)).toBe(true);
  });

  it("derives spec proposal approval items from existing artifacts", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Spec Proposal Topic" });
    const run = await writeSpecProposalRun("spec-proposal-topic");
    const otherRun = await writeSpecProposalRun("other-topic");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir });

    expect(snapshot.right.approvals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `spec:${run.id}`,
        kind: "spec-proposal",
        targetId: run.id,
        action: expect.objectContaining({
          actionId: "change.spec.accept",
          command: "change",
          args: ["spec", "accept", "repo", run.id],
          mutates: true,
          requiresConfirmation: true,
        }),
      }),
      expect.objectContaining({
        id: `spec:${otherRun.id}`,
        kind: "spec-proposal",
        targetId: otherRun.id,
      }),
    ]));
  });

  it("hides accepted proposals from pending approvals and keeps completed decisions", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Decision Topic" });
    const run = await writeSpecProposalRun("decision-topic");
    const memory = await resolveProjectMemory(project());
    await writeFile(join(tempDir, ".agent-harness", "runs", run.id, "events.jsonl"), [
      JSON.stringify({ timestamp: new Date().toISOString(), type: "change.spec.proposal.completed", runId: run.id }),
      JSON.stringify({ timestamp: new Date().toISOString(), type: "change.spec.proposal.accepted", runId: run.id }),
      "",
    ].join("\n"), "utf8");
    const store = await WorkbenchStore.open(memory);
    try {
      store.upsertDecision({
        id: `approval:change.spec.accept:${run.id}`,
        projectId: "repo",
        changeId: "decision-topic",
        decisionType: "change.spec.accept",
        status: "accepted",
        label: "Accept spec proposal",
        summary: "Accepted Spec proposal.",
        targetId: run.id,
        runId: run.id,
        artifact: run.artifacts.specProposal ?? null,
        actionId: "change.spec.accept",
        feedback: null,
        payloadJson: "{}",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } finally {
      store.close();
    }

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "decision-topic" });

    expect(snapshot.right.approvals.some((item) => item.id === `spec:${run.id}`)).toBe(false);
    expect(snapshot.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: run.id, status: "accepted", artifact: run.artifacts.specProposal }),
    ]));
  });

  it("keeps accepted close decisions attached to the closed topic", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Close Decision Topic" });
    await writeFile(join(tempDir, "harness", "changes", "active", "close-decision-topic", "reviews", "review.md"), "Status: approved\n", "utf8");

    const before = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "close-decision-topic" });
    const closeAction = before.right.approvals.find((item) => item.kind === "change-close")?.action;
    expect(closeAction).toBeTruthy();
    if (!closeAction) throw new Error("Expected close action");

    await executeWorkbenchAction({ project: project(), path: tempDir }, { action: closeAction, confirm: true });
    const after = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "close-decision-topic" });

    expect(after.right.approvals.some((item) => item.kind === "change-close")).toBe(false);
    expect(after.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "change.close",
        changeId: "close-decision-topic",
        targetId: "close-decision-topic",
        status: "accepted",
      }),
    ]));
  });

  it("lists project-level approvals and filters display by topic", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Approval Topic" });
    const run = await writeSpecProposalRun("approval-topic");
    await writeSpecProposalRun("other-topic");

    const allApprovals = await listWorkbenchApprovals({ project: project(), path: tempDir });
    const topicApprovals = await listWorkbenchApprovals({ project: project(), path: tempDir }, { topicId: "approval-topic" });

    expect(allApprovals.filter((item) => item.kind === "spec-proposal")).toHaveLength(2);
    expect(topicApprovals).toEqual([
      expect.objectContaining({
        id: `spec:${run.id}`,
        changeId: "approval-topic",
      }),
    ]);
  });

  it("returns one selected topic by id", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Specific Topic" });

    const topic = await getWorkbenchTopic({ project: project(), path: tempDir }, "specific-topic");

    expect(topic).toMatchObject({ id: "specific-topic", state: "active" });
  });
});

async function writeSpecProposalRun(changeId: string): Promise<RunMetadata> {
  const runId = `run-test-${changeId}`;
  const runDir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: tempDir,
    runtime: "spec-agent",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "completed",
    exitCode: 0,
    signal: null,
    startedAt: now,
    finishedAt: now,
    artifacts: {
      base: "project-root",
      directory: `.agent-harness/runs/${runId}`,
      context: `.agent-harness/runs/${runId}/context.md`,
      events: `.agent-harness/runs/${runId}/events.jsonl`,
      stdout: `.agent-harness/runs/${runId}/stdout.log`,
      stderr: `.agent-harness/runs/${runId}/stderr.log`,
      specProposal: `.agent-harness/runs/${runId}/spec-proposal.json`,
      specProposalMarkdown: `.agent-harness/runs/${runId}/spec-proposal.md`,
      lastMessage: `.agent-harness/runs/${runId}/last-message.md`,
    },
  };
  await writeFile(join(runDir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  await writeFile(join(runDir, "events.jsonl"), `${JSON.stringify({ timestamp: now, type: "change.spec.proposal.completed", runId })}\n`, "utf8");
  await writeFile(join(runDir, "spec-proposal.md"), "# Spec Proposal\n", "utf8");
  await writeFile(join(runDir, "last-message.md"), "Status: proposed\n", "utf8");
  await writeFile(join(runDir, "spec-proposal.json"), JSON.stringify({
    version: "1.0",
    id: runId,
    runId,
    changeId,
    status: "proposed",
    startedAt: now,
    finishedAt: now,
    targetHashes: {},
    specMd: "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Example\n",
    openQuestions: [],
    assumptions: [],
    warnings: [],
    artifacts: {
      proposal: `.agent-harness/runs/${runId}/spec-proposal.json`,
      proposalMarkdown: `.agent-harness/runs/${runId}/spec-proposal.md`,
      lastMessage: `.agent-harness/runs/${runId}/last-message.md`,
    },
  }, null, 2), "utf8");
  expect(existsSync(join(runDir, "spec-proposal.json"))).toBe(true);
  expect(await readFile(join(runDir, "events.jsonl"), "utf8")).toContain("change.spec.proposal.completed");
  return run;
}
