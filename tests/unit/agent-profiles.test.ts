import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const profileRoot = join(process.cwd(), "templates", "agent-profiles");

async function readProfile(name: string): Promise<string> {
  return await readFile(join(profileRoot, `${name}.md`), "utf8");
}

describe("agent role profiles", () => {
  it("bundles all profiles with ECL-derived required sections", async () => {
    for (const name of ["validator", "auditor", "coder", "spec-test-proposer"]) {
      const content = await readProfile(name);
      for (const section of [
        "## Role",
        "## Source of Truth",
        "## Success Criteria",
        "## Evidence Discipline",
        "## Constraints",
        "## Workflow / Protocol",
        "## State Transition Boundary",
        "## Human Confirmation Boundary",
        "## Allowed Inputs",
        "## Allowed Outputs",
        "## Output Contract",
        "## Blocked Actions",
        "## Failure Modes",
      ]) {
        expect(content).toContain(section);
      }
      expect(content).toContain("Resolved AHO durable memory");
      expect(content).toContain("Do not treat chat history");
    }
  });

  it("keeps spec-test proposer as a proposal-only evidence suggester", async () => {
    const content = await readProfile("spec-test-proposer");

    expect(content).toContain("Only `aho spec-test proposal accept` may write accepted mappings to `spec-tests.json`");
    expect(content).toContain('"refId": "ev-001"');
    expect(content).toContain('"source": "source-root | worktree-only | suggested | unknown"');
    expect(content).toContain("Do not invent test names, files, command names, command results, or Acceptance Criteria.");
    expect(content).toContain("Worktree-only evidence may be reported for awareness");
  });

  it("keeps auditor as an evidence-backed semantic proposal gate", async () => {
    const content = await readProfile("auditor");

    expect(content).toContain("Auditor is a read-only semantic review role");
    expect(content).toContain("Findings must cite a concrete artifact");
    expect(content).toContain("Passing validation is evidence, not semantic proof.");
    expect(content).toContain("Status: approved | approved-with-notes | blocked");
    expect(content).toContain("Your output is an audit proposal.");
  });

  it("keeps coder bounded to worktree proposals traceable to tasks and ACs", async () => {
    const content = await readProfile("coder");

    expect(content).toContain("Work only in the assigned worktree.");
    expect(content).toContain("The diff maps back to the selected tasks and Acceptance Criteria.");
    expect(content).toContain("User extra prompt as additional instruction only.");
    expect(content).toContain("Do not update review status or accept spec-test evidence.");
    expect(content).toContain("Do not apply, merge, close, archive");
  });

  it("keeps validator as mechanical evidence rather than semantic approval", async () => {
    const content = await readProfile("validator");

    expect(content).toContain("deterministic mechanical evidence role");
    expect(content).toContain("Record command results as observed");
    expect(content).toContain("Distinguish missing fallback scripts from explicit configured command failures.");
    expect(content).toContain("Passing validation is not human approval.");
    expect(content).toContain("Do not infer semantic correctness from passing commands.");
  });
});
