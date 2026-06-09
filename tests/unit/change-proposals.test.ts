import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptPlanProposal,
  acceptSpecProposal,
  parsePlanProposalMessage,
  parseSpecProposalMessage,
  startSpecProposalRun,
} from "../../src/change/proposals.js";
import { createChange, createConcurrentChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import type { ManagedProject } from "../../src/types/index.js";
import { readActiveChangeFiles } from "../../src/change/proposals/prompt-builders.js";
import { writePlanProposal, writeSpecProposal } from "../../src/change/proposals/repository.js";
import { prepareProposalRun } from "../../src/change/proposals/runner.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-change-proposals-"));
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

describe("change proposal parsing", () => {
  it("parses proposed spec proposal JSON", () => {
    const parsed = parseSpecProposalMessage([
      "```json",
      JSON.stringify({
        status: "proposed",
        specMd: "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Works",
        openQuestions: [],
        assumptions: ["Low-risk assumption"],
        warnings: [],
      }),
      "```",
    ].join("\n"));

    expect(parsed.status).toBe("proposed");
    expect(parsed.specMd).toContain("AC-001");
    expect(parsed.assumptions).toEqual(["Low-risk assumption"]);
  });

  it("parses blocked status line as blocked proposal", () => {
    const parsed = parseSpecProposalMessage("Status: blocked\n");

    expect(parsed.status).toBe("blocked");
    expect(parsed.warnings[0]).toContain("No JSON payload");
  });

  it("marks invalid spec JSON as failed", () => {
    const parsed = parseSpecProposalMessage("```json\n{\"status\":\"unknown\"}\n```");

    expect(parsed.status).toBe("failed");
    expect(parsed.warnings[0]).toContain("Spec proposal JSON was invalid");
  });

  it("parses proposed plan proposal JSON", () => {
    const parsed = parsePlanProposalMessage([
      "```json",
      JSON.stringify({
        status: "proposed",
        planMd: "# Plan\n\nUse current patterns.",
        tasksMd: "# Tasks\n\n- [ ] T-001: Do it\n  - Covers: AC-001",
        openQuestions: [],
        assumptions: [],
        warnings: [],
      }),
      "```",
    ].join("\n"));

    expect(parsed.status).toBe("proposed");
    expect(parsed.planMd).toContain("current patterns");
    expect(parsed.tasksMd).toContain("T-001");
  });

  it("marks missing plan JSON as failed", () => {
    const parsed = parsePlanProposalMessage("No useful output");

    expect(parsed.status).toBe("failed");
    expect(parsed.warnings[0]).toContain("did not include parseable JSON");
  });
});

describe("change proposal scoped boundaries", () => {
  it("keeps legacy facade imports available", () => {
    expect(typeof startSpecProposalRun).toBe("function");
    expect(typeof acceptSpecProposal).toBe("function");
    expect(typeof acceptPlanProposal).toBe("function");
  });

  it("prepares scoped spec proposals from the selected active demand when multiple are active", async () => {
    await initHarness(project());
    await createChange(project(), { title: "First Demand" });
    await createConcurrentChange(project(), { title: "Second Demand" });
    await writeChangeFiles("first-demand", { spec: "- AC-001: First only\n", plan: "# First plan\n", tasks: "- [ ] T-001: First\n  - Covers: AC-001\n" });
    await writeChangeFiles("second-demand", { spec: "- AC-001: Second only\n", plan: "# Second plan\n", tasks: "- [ ] T-001: Second\n  - Covers: AC-001\n" });

    const prepared = await prepareProposalRun(project(), "spec", { changeId: "second-demand", prompt: "scope-check" });
    const files = await readActiveChangeFiles(prepared.changePath);

    expect(prepared.changeId).toBe("second-demand");
    expect(prepared.targetHashes.spec).toBe(hashText("- AC-001: Second only\n"));
    expect(files.spec).toContain("Second only");
    expect(files.spec).not.toContain("First only");
  });

  it("prepares scoped plan proposals from the selected active demand when multiple are active", async () => {
    await initHarness(project());
    await createChange(project(), { title: "First Demand" });
    await createConcurrentChange(project(), { title: "Second Demand" });
    await writeChangeFiles("first-demand", { spec: "- AC-001: First spec\n", plan: "# First plan\n", tasks: "- [ ] T-001: First\n  - Covers: AC-001\n" });
    await writeChangeFiles("second-demand", { spec: "- AC-001: Second spec\n", plan: "# Second plan\n", tasks: "- [ ] T-001: Second\n  - Covers: AC-001\n" });

    const prepared = await prepareProposalRun(project(), "plan", { changeId: "second-demand", prompt: "plan-scope" });

    expect(prepared.changeId).toBe("second-demand");
    expect(prepared.targetHashes.spec).toBe(hashText("- AC-001: Second spec\n"));
    expect(prepared.targetHashes.plan).toBe(hashText("# Second plan\n"));
    expect(prepared.targetHashes.tasks).toBe(hashText("- [ ] T-001: Second\n  - Covers: AC-001\n"));
  });

  it("keeps CLI-style unscoped proposal fallback for one active change and fail-closed for multiple active changes", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Only Demand" });
    await writeChangeFiles("only-demand", { spec: "- AC-001: Single\n", plan: "# Plan\n", tasks: "- [ ] T-001: Single\n  - Covers: AC-001\n" });

    const prepared = await prepareProposalRun(project(), "spec", { prompt: "single-active" });
    expect(prepared.changeId).toBe("only-demand");

    await createConcurrentChange(project(), { title: "Second Demand" });
    await expect(prepareProposalRun(project(), "spec", { prompt: "multi-active" })).rejects.toThrow("expected exactly one active change");
  });

  it("rejects spec proposal accept when spec changed after proposal generation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Stale Spec" });
    await writeChangeFiles("stale-spec", { spec: "- AC-001: Original\n", plan: "# Plan\n", tasks: "- [ ] T-001: Original\n  - Covers: AC-001\n" });
    const prepared = await prepareProposalRun(project(), "spec", { prompt: "stale-spec" });
    await writeSpecProposal(prepared.paths.proposal, prepared.paths.proposalMarkdown, {
      runId: prepared.runId,
      changeId: prepared.changeId,
      startedAt: prepared.startedAt,
      status: "proposed",
      output: { status: "proposed", specMd: "- AC-001: Proposed\n", openQuestions: [], assumptions: [], warnings: [] },
      message: "spec-proposal",
      targetHashes: prepared.targetHashes,
      artifacts: prepared.artifacts,
    });
    await writeFile(changeFile("stale-spec", "spec.md"), "- AC-001: Changed\n", "utf8");

    await expect(acceptSpecProposal(project(), prepared.runId)).rejects.toThrow("spec.md changed after proposal was generated");
  });

  it("rejects plan proposal accept when spec changed after proposal generation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Stale Plan Spec" });
    await writeChangeFiles("stale-plan-spec", { spec: "- AC-001: Original\n", plan: "# Plan\n", tasks: "- [ ] T-001: Original\n  - Covers: AC-001\n" });
    const prepared = await prepareProposalRun(project(), "plan", { prompt: "stale-plan-spec" });
    await writeValidPlanProposal(prepared);
    await writeFile(changeFile("stale-plan-spec", "spec.md"), "- AC-001: Changed\n", "utf8");

    await expect(acceptPlanProposal(project(), prepared.runId)).rejects.toThrow("spec.md changed after proposal was generated");
  });

  it("rejects plan proposal accept when plan or tasks changed after proposal generation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Stale Plan Tasks" });
    await writeChangeFiles("stale-plan-tasks", { spec: "- AC-001: Original\n", plan: "# Plan\n", tasks: "- [ ] T-001: Original\n  - Covers: AC-001\n" });
    const planChanged = await prepareProposalRun(project(), "plan", { prompt: "stale-plan" });
    await writeValidPlanProposal(planChanged);
    await writeFile(changeFile("stale-plan-tasks", "plan.md"), "# Changed plan\n", "utf8");
    await expect(acceptPlanProposal(project(), planChanged.runId)).rejects.toThrow("plan.md changed after proposal was generated");

    await writeChangeFiles("stale-plan-tasks", { spec: "- AC-001: Original\n", plan: "# Plan\n", tasks: "- [ ] T-001: Original\n  - Covers: AC-001\n" });
    const tasksChanged = await prepareProposalRun(project(), "plan", { prompt: "stale-tasks" });
    await writeValidPlanProposal(tasksChanged);
    await writeFile(changeFile("stale-plan-tasks", "tasks.md"), "- [ ] T-001: Changed\n  - Covers: AC-001\n", "utf8");
    await expect(acceptPlanProposal(project(), tasksChanged.runId)).rejects.toThrow("tasks.md changed after proposal was generated");
  });

  it("rejects invalid accepted proposal content", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Invalid Proposal" });
    await writeChangeFiles("invalid-proposal", { spec: "- AC-001: Original\n", plan: "# Plan\n", tasks: "- [ ] T-001: Original\n  - Covers: AC-001\n" });

    const specPrepared = await prepareProposalRun(project(), "spec", { prompt: "missing-ac" });
    await writeSpecProposal(specPrepared.paths.proposal, specPrepared.paths.proposalMarkdown, {
      runId: specPrepared.runId,
      changeId: specPrepared.changeId,
      startedAt: specPrepared.startedAt,
      status: "proposed",
      output: { status: "proposed", specMd: "# No acceptance criteria\n", openQuestions: [], assumptions: [], warnings: [] },
      message: "no-ac",
      targetHashes: specPrepared.targetHashes,
      artifacts: specPrepared.artifacts,
    });
    await expect(acceptSpecProposal(project(), specPrepared.runId)).rejects.toThrow("proposal must contain at least one Acceptance Criterion");

    const noTask = await prepareProposalRun(project(), "plan", { prompt: "no-task" });
    await writePlanProposal(noTask.paths.proposal, noTask.paths.proposalMarkdown, {
      runId: noTask.runId,
      changeId: noTask.changeId,
      startedAt: noTask.startedAt,
      status: "proposed",
      output: { status: "proposed", planMd: "# Plan\n", tasksMd: "# Tasks\n", openQuestions: [], assumptions: [], warnings: [] },
      message: "no-task",
      targetHashes: noTask.targetHashes,
      artifacts: noTask.artifacts,
    });
    await expect(acceptPlanProposal(project(), noTask.runId)).rejects.toThrow("tasksMd must contain at least one T-xxx task");

    const badAc = await prepareProposalRun(project(), "plan", { prompt: "bad-ac" });
    await writePlanProposal(badAc.paths.proposal, badAc.paths.proposalMarkdown, {
      runId: badAc.runId,
      changeId: badAc.changeId,
      startedAt: badAc.startedAt,
      status: "proposed",
      output: { status: "proposed", planMd: "# Plan\n", tasksMd: "- [ ] T-001: Bad AC\n  - Covers: AC-999\n", openQuestions: [], assumptions: [], warnings: [] },
      message: "bad-ac",
      targetHashes: badAc.targetHashes,
      artifacts: badAc.artifacts,
    });
    await expect(acceptPlanProposal(project(), badAc.runId)).rejects.toThrow("references unknown Acceptance Criterion AC-999");
  });
});

async function writeValidPlanProposal(prepared: Awaited<ReturnType<typeof prepareProposalRun>>): Promise<void> {
  await writePlanProposal(prepared.paths.proposal, prepared.paths.proposalMarkdown, {
    runId: prepared.runId,
    changeId: prepared.changeId,
    startedAt: prepared.startedAt,
    status: "proposed",
    output: {
      status: "proposed",
      planMd: "# Proposed Plan\n",
      tasksMd: "- [ ] T-001: Proposed\n  - Covers: AC-001\n",
      openQuestions: [],
      assumptions: [],
      warnings: [],
    },
    message: "valid-plan",
    targetHashes: prepared.targetHashes,
    artifacts: prepared.artifacts,
  });
}

async function writeChangeFiles(changeId: string, files: { spec: string; plan: string; tasks: string }): Promise<void> {
  await writeFile(changeFile(changeId, "spec.md"), files.spec, "utf8");
  await writeFile(changeFile(changeId, "plan.md"), files.plan, "utf8");
  await writeFile(changeFile(changeId, "tasks.md"), files.tasks, "utf8");
}

function changeFile(changeId: string, file: string): string {
  return join(tempDir, "harness", "changes", "active", changeId, file);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
