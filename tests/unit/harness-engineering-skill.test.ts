import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "templates", "system-skills");
const skillRoot = join(root, "aho-harness-engineering");

async function readSkillFiles(): Promise<string> {
  const paths = [join(skillRoot, "SKILL.md"), join(skillRoot, "agents", "openai.yaml")];
  const references = await readdir(join(skillRoot, "references"));
  paths.push(...references.map((name) => join(skillRoot, "references", name)));
  return (await Promise.all(paths.map((path) => readFile(path, "utf8")))).join("\n");
}

describe("AHO Harness engineering Skill", () => {
  it("is the only Harness Skill and preserves the four Runtime-assigned modes", async () => {
    expect(existsSync(join(root, "aho-harness-onboarding"))).toBe(false);
    const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
    expect(skill).toContain("name: aho-harness-engineering");
    for (const mode of ["onboard", "audit", "maintain-assigned-closeout", "evolve-assigned-window"]) {
      expect(skill).toContain(`\`${mode}\``);
    }
    expect(skill).toContain("Never infer a mode");
    expect(skill).toContain("Do not invoke AHO lifecycle commands");
  });

  it("teaches bounded direct canonical edits and scored Evolution", async () => {
    const content = await readSkillFiles();
    for (const operation of ["create", "edit", "delete", "split", "merge", "rename"]) {
      expect(content.toLowerCase()).toContain(operation);
    }
    expect(content).toContain("canonical project Markdown");
    expect(content).toContain("native scorer");
    expect(content).toContain("score of at least 80");
    expect(content).toContain("There is no reviewer, diff-manifest, or project-memory apply stage");
    expect(content).toContain("cannot trigger work");
    expect(content).toContain("create or claim assignments");
    expect(content).toContain("choose or count archive windows");
    expect(content).toContain("close Changes");
  });

  it("removes the legacy Agent-authored patch teaching", async () => {
    const content = await readSkillFiles();
    for (const legacyTerm of ["PatchPackage", "allowedTargets", '"kind":"hunk"', '"kind":"replacement"']) {
      expect(content).not.toContain(legacyTerm);
    }
    expect(content).not.toMatch(/```json/);
  });

  it("includes worked workspace examples for no-op and structural Markdown edits", async () => {
    const examples = await readFile(join(skillRoot, "references", "worked-examples.md"), "utf8");
    for (const heading of [
      "Closeout No-op",
      "Edit A Stale Handoff",
      "Create And Rename On Onboarding",
      "Split An Overloaded Guide",
      "Merge Duplicate Guidance",
      "Block An Out-of-Scope Request",
    ]) {
      expect(examples).toContain(`## ${heading}`);
    }
  });

  it("passes the Skill Creator validator", () => {
    const validator = join(
      process.env.USERPROFILE ?? "",
      ".codex",
      "skills",
      ".system",
      "skill-creator",
      "scripts",
      "quick_validate.py",
    );
    expect(existsSync(validator)).toBe(true);
    const output = execFileSync("python", [validator, skillRoot], { encoding: "utf8" });
    expect(output).toContain("Skill is valid!");
  });
});
