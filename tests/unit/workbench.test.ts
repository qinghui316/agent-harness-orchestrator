import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange, closeChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { startLocalCommandRun } from "../../src/run/manager.js";
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

  it("builds a snapshot with selected topic, run events, roles, gaps, and close approval", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workbench Smoke" });
    await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('hello')"]);
    await writeFile(join(tempDir, "harness", "changes", "active", "workbench-smoke", "reviews", "review.md"), "Status: approved\n", "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir });

    expect(snapshot.left.topics[0]).toMatchObject({ id: "workbench-smoke", state: "active" });
    expect(snapshot.center.selectedTopic?.id).toBe("workbench-smoke");
    expect(snapshot.center.agentLoop.runs).toHaveLength(1);
    expect(snapshot.center.thread.events.some((event) => event.type === "run.local-command")).toBe(true);
    expect(snapshot.right.approvals.some((item) => item.kind === "change-close")).toBe(true);
    expect(snapshot.right.approvals.find((item) => item.kind === "change-close")?.action).toMatchObject({
      actionId: "change.close",
      mutates: true,
      requiresConfirmation: true,
    });
    expect(snapshot.roles.map((item) => item.id)).toEqual(expect.arrayContaining(["coder", "auditor", "validator"]));
    expect(snapshot.harnessGaps.map((item) => item.id)).toEqual(expect.arrayContaining(["roleCatalog", "sessionModel", "subagentSpec"]));
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
