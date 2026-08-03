import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectRunsPathPort } from "../../src/project-runtime/paths.js";
import { appendWorkflowRunEvent, readWorkflowRun, readWorkflowRunEvents, summarizeWorkflowRun, writeWorkflowRun } from "../../src/workflow-run/manager.js";
import type { DefaultCodeChangeWorkflowRun } from "../../src/types/index.js";

describe("WorkflowRun default code-change source", () => {
  let root: string;
  let memory: ProjectRunsPathPort;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aho-workflow-run-"));
    memory = { runsRoot: join(root, ".agent-harness", "runs") };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads, writes, summarizes, and journals default-code-change WorkflowRuns", async () => {
    const run = defaultRun("change-default");

    await writeWorkflowRun(memory, run);
    await appendWorkflowRunEvent(memory, run, "node.started", { data: { nodeId: "coder" } });

    await expect(readWorkflowRun(memory, "change-default", run.id)).resolves.toMatchObject({
      source: "default-code-change-workflow",
      templateId: "default-code-change-workflow",
      nodes: expect.arrayContaining([expect.objectContaining({ nodeId: "coder" })]),
    });
    await expect(readWorkflowRunEvents(memory, "change-default", run.id)).resolves.toEqual([
      expect.objectContaining({ type: "node.started", workflowRunId: run.id, changeId: "change-default" }),
    ]);
    expect(summarizeWorkflowRun(run)).toMatchObject({
      source: "default-code-change-workflow",
      currentNodeId: "coder",
      totalCount: 3,
      completedCount: 2,
    });
  });

});

function defaultRun(changeId: string): DefaultCodeChangeWorkflowRun {
  return {
    version: "1.0",
    id: "workflow-default-1",
    changeId,
    status: "running",
    source: "default-code-change-workflow",
    templateId: "default-code-change-workflow",
    currentNodeId: "coder",
    nodes: [
      { nodeId: "coder", status: "completed", roleId: "coder-agent", attempt: 1, runId: "run-1", worktreeId: "wt-1", artifactRefs: ["runs/run-1"], updatedAt: "2026-07-07T00:00:00.000Z" },
      { nodeId: "validation", status: "queued", roleId: "validator", attempt: 1, artifactRefs: [], updatedAt: "2026-07-07T00:00:00.000Z" },
      { nodeId: "audit", status: "queued", roleId: "auditor-agent", attempt: 1, artifactRefs: [], updatedAt: "2026-07-07T00:00:00.000Z" },
      { nodeId: "rework-coder", status: "skipped", roleId: "rework-coder", attempt: 2, artifactRefs: [], updatedAt: "2026-07-07T00:00:00.000Z" },
    ],
    maxReworkAttempts: 1,
    reworkAttempts: 0,
    recoveryKey: {
      version: "1.0",
      changeId,
      templateId: "default-code-change-workflow",
      createdAt: "2026-07-07T00:00:00.000Z",
    },
    artifactRefs: ["runs/run-1"],
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    startedAt: "2026-07-07T00:00:00.000Z",
    finishedAt: null,
  };
}
