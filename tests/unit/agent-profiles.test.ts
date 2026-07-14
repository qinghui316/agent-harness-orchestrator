import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const profileRoot = join(process.cwd(), "templates", "agent-profiles");

async function readProfile(name: string): Promise<string> {
  return await readFile(join(profileRoot, `${name}.md`), "utf8");
}

describe("agent role profiles", () => {
  it("bundles model profiles with their required contracts", async () => {
    for (const name of ["planning-agent", "coder-agent", "auditor-agent", "rework-coder"]) {
      const content = await readProfile(name);
      for (const section of ["## Role", "## Success Criteria", "## Constraints", "## Inputs", "## Workflow", "## Output Contract", "## Escalate When", "## Avoid"]) {
        expect(content).toContain(section);
      }
    }
  });

  it("keeps spec-test generator as a test-only worktree proposal role", async () => {
    const content = await readProfile("spec-test-generator");

    expect(content).toContain("Spec-Test Generator Agent");
    expect(content).toContain("Modify test files, test fixtures, or test helpers only.");
    expect(content).toContain("Do not modify production code");
    expect(content).toContain("Do not edit `spec-tests.json`.");
    expect(content).toContain("Generated tests are not accepted project truth");
  });

  it("keeps spec-test proposer as a proposal-only evidence suggester", async () => {
    const content = await readProfile("spec-test-proposer");

    expect(content).toContain("Return it to AHO and wait for the existing explicit");
    expect(content).toContain("Do not invoke the `aho`");
    expect(content).toContain('"refId": "ev-001"');
    expect(content).toContain('"source": "source-root | worktree-only | suggested | unknown"');
    expect(content).toContain("Do not invent test names, files, command names, command results, or Acceptance Criteria.");
    expect(content).toContain("Worktree-only evidence may be reported for awareness");
  });

  it("keeps auditor-agent as the only semantic model profile", async () => {
    const content = await readProfile("auditor-agent");
    expect(content).toContain("Status: approved | approved-with-notes | blocked");
    expect(content).toContain("Do not run commands or hidden repair work.");
    expect(content).toContain("Passing validation and other positive evidence belong in the");
  });

  it("keeps coder-agent as the only implementation model profile", async () => {
    const content = await readProfile("coder-agent");

    expect(content).toContain("Do not delegate or spawn Agents.");
    expect(content).toContain("Treat the source project root as read-only context.");
    expect(content).toContain("Task / AC Coverage:");
  });

  it("keeps the real planning child routed through the single authoring Skill", async () => {
    const content = await readProfile("planning-agent");

    expect(content).toContain("$aho-workflow-authoring");
    expect(content).toContain("Write only the assigned run-scoped proposal files");
    expect(content).toContain("The files, not a returned patch or JSON envelope, are the result");
    expect(content).toContain("Do not recursively delegate to another Agent.");
    expect(content).toContain("Do not use parent-thread Plan Mode");
    expect(content).toContain("Do not invoke the `aho` CLI");
  });

  it("keeps Runtime-owned transitions out of Agent self-CLI control", async () => {
    for (const name of ["planning-agent", "coder-agent", "spec-test-proposer", "spec-test-generator"]) {
      const content = await readProfile(name);
      expect(content).not.toMatch(/`aho\s+(validate|audit|code|spec-test|worktree|change|run)\b/);
    }
  });
});
