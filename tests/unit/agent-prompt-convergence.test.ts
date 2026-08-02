import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeAuditPrompt } from "../../src/audit/prompt.js";
import { composeCoderPrompt } from "../../src/code/prompt.js";
import type { ChangeStatus, WorktreeMetadata } from "../../src/types/index.js";

describe("native Agent prompt convergence", () => {
  it("composes coder-agent profile plus one task packet without a second output contract", async () => {
    const prompt = await composeCoderPrompt({
      context: "AC-001 context",
      changeStatus: { acMap: { tasks: [{ id: "T-001", text: "Converge prompts", acIds: ["AC-001"] }] } } as ChangeStatus,
      worktree: {
        worktreeId: "wt-1", checkoutPath: "E:/tmp/wt-1", branchName: "change/wt-1",
        baseRef: "HEAD", baseCommit: "abc123",
      } as WorktreeMetadata,
      sourceProjectPath: "E:/repo",
      selectedTasks: ["T-001"],
    });

    expect(prompt).toContain("# Agent Profile");
    expect(prompt).toContain("# Task Packet");
    expect(prompt.match(/## Output Contract/g)).toHaveLength(1);
    expect(prompt.match(/Status: completed \| blocked \| failed/g)).toHaveLength(1);
    expect(prompt).toContain("T-001: Converge prompts; Covers: AC-001");
  });

  it("composes auditor-agent profile plus one authoritative audit packet", async () => {
    const prompt = await composeAuditPrompt({ context: "AC-001 context", latestValidation: "passed", diff: "diff body" });

    expect(prompt).toContain("# Agent Profile");
    expect(prompt).toContain("# Task Packet");
    expect(prompt.match(/## Output Contract/g)).toHaveLength(1);
    expect(prompt.match(/Status: approved \| approved-with-notes \| blocked/g)).toHaveLength(1);
    expect(prompt.match(/## Authoritative Audit Packet/g)).toHaveLength(1);
  });

  it("keeps Main orchestration guidance concise and excludes retired model dispatch", async () => {
    const skill = await readFile(join(process.cwd(), "templates", "system-skills", "aho-main-orchestration", "SKILL.md"), "utf8");

    expect(skill).toContain("Delegate implementation to the accepted Workflow node");
    expect(skill).toContain("semantic review\n   to the existing Auditor Agent");
    expect(skill).toContain("deterministic validation as a Runtime\n   operation, not an Agent role");
    expect(skill).toContain("Load the required project Harness Skill on every ready project turn");
    expect(skill).toContain("call `aho_prepare_project_harness`");
    expect(skill).toContain("Do not write project source, the candidate, review report");
    expect(skill).toContain("complete a simple request directly");
    expect(skill).toContain("use a real Planning child for complex work");
    expect(skill).toContain("ensure this provider thread has a native Goal");
    expect(skill).toContain("Never update, yield, or complete a Goal that has not");
    expect(skill).toContain("Never dispatch\n  `coder`, `auditor`, `validator`, or `merge-reviewer-agent` as model roles.");
  });
});
