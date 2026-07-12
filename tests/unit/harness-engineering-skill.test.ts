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
      expect(skill).toContain(mode);
    }
    expect(skill).toContain("Do not infer another mode");
    expect(skill).toContain("Do not invent");
  });

  it("teaches ECL delta analysis, direct edits, and scored Evolution", async () => {
    const content = await readSkillFiles();
    for (const method of ["Create", "Update", "Already Good", "Promote", "Retain", "Merge", "Retire", "Archive-only"]) {
      expect(content).toContain(method);
    }
    expect(content).toContain("Directly complete justified edits");
    expect(content).toContain("scorer child");
    expect(content).toContain("score of at least 80");
    expect(content).toContain("create or claim");
    expect(content).toContain("widen an assigned Evolution window");
    expect(content).toContain("close Changes");
  });

  it("removes the legacy Agent-authored patch teaching", async () => {
    const content = await readSkillFiles();
    for (const legacyTerm of ["PatchPackage", "allowedTargets", '"kind":"hunk"', '"kind":"replacement"']) {
      expect(content).not.toContain(legacyTerm);
    }
    expect(content).not.toMatch(/```json/);
  });

  it("uses cross-layout examples instead of a global Harness file schema", async () => {
    const examples = await readFile(join(skillRoot, "references", "worked-examples.md"), "utf8");
    for (const heading of [
      "External Memory, Project Entry",
      "Existing Layout With Different Names",
      "Closeout No-op",
      "Evolution Compression",
    ]) {
      expect(examples).toContain(`## ${heading}`);
    }
    const content = await readSkillFiles();
    expect(content).not.toMatch(/writable namespace|allowedTargets|path allowlist|path blacklist/i);
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
