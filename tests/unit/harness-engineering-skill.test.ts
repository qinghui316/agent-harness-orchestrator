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
  it("is the only Harness Skill and exposes only the supported candidate modes", async () => {
    expect(existsSync(join(root, "aho-harness-onboarding"))).toBe(false);
    const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
    expect(skill).toContain("name: aho-harness-engineering");
    for (const mode of ["onboard", "migrate", "audit", "evolve-candidate"]) {
      expect(skill).toContain(mode);
    }
    expect(skill).not.toContain("maintain-assigned-closeout");
    expect(skill).not.toContain("evolve-assigned-window");
    expect(skill).not.toContain("auditHarness");
    expect(skill).toContain("complete semantic bundle");
    expect(skill).toContain("Do not infer a different mode");
    expect(skill).toContain("single Runtime-provided");
  });

  it("teaches semantic deltas, isolated candidates, and atomic publication", async () => {
    const content = await readSkillFiles();
    for (const method of ["Promote", "Retain", "Merge", "Retire", "Archive-only"]) {
      expect(content).toContain(method);
    }
    expect(content).toContain("project-profile.json");
    expect(content).toContain("creation-delta.json");
    expect(content).toContain("independent Evolution Judge");
    expect(content).toContain("score of at least 80");
    expect(content).toMatch(/Never\s+edit\s+the canonical project Skill directly/);
    expect(content).toMatch(/full-bundle review is not an Evolution/i);
    expect(content).toContain("Verification And Handoff");
  });

  it("removes the legacy Agent-authored patch teaching", async () => {
    const content = await readSkillFiles();
    for (const legacyTerm of ["PatchPackage", "allowedTargets", '"kind":"hunk"', '"kind":"replacement"']) {
      expect(content).not.toContain(legacyTerm);
    }
    expect(content).not.toMatch(/```json/);
  });

  it("uses transaction examples instead of legacy layout modes", async () => {
    const examples = await readFile(join(skillRoot, "references", "worked-examples.md"), "utf8");
    for (const heading of [
      "Empty Project",
      "Existing Source Without A Harness",
      "Blocked Review",
      "Evolution Compression",
    ]) {
      expect(examples).toContain(`## ${heading}`);
    }
    const content = await readSkillFiles();
    expect(content).not.toMatch(/external-local|repo-local|memory root|memory-root|allowedTargets/i);
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
