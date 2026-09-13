import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const ALLOWED_FIELDS = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export async function validateSkillPackage(skillRoot) {
  const content = await readFile(resolve(skillRoot, "SKILL.md"), "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new Error("SKILL.md must begin with bounded YAML frontmatter.");

  let frontmatter;
  try {
    frontmatter = load(match[1]);
  } catch {
    throw new Error("SKILL.md frontmatter is not valid YAML.");
  }
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error("SKILL.md frontmatter must be a YAML mapping.");
  }
  for (const key of Object.keys(frontmatter)) {
    if (!ALLOWED_FIELDS.has(key)) throw new Error(`SKILL.md frontmatter contains unsupported field: ${key}.`);
  }

  const name = frontmatter.name;
  const description = frontmatter.description;
  if (typeof name !== "string" || !name.trim()) throw new Error("Skill name must be a non-empty string.");
  if (name.length > MAX_NAME_LENGTH || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error("Skill name must be hyphen-case and at most 64 characters.");
  }
  if (typeof description !== "string" || !description.trim()) {
    throw new Error("Skill description must be a non-empty string.");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH || /[<>]/.test(description)) {
    throw new Error("Skill description is invalid.");
  }
  if (description.trim().startsWith("[TODO:")) throw new Error("Skill description contains an unfinished placeholder.");

  let fenceMarker = null;
  let fenceLength = 0;
  for (const line of content.slice(match[0].length).split(/\r?\n/)) {
    const fence = /^[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[1];
      if (fenceMarker === null) {
        fenceMarker = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceMarker && marker.length >= fenceLength && !fence[2].trim()) {
        fenceMarker = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceMarker === null && /^[ ]{0,3}\[TODO:[^\n]*\][ \t]*$/.test(line)) {
      throw new Error("Skill instructions contain an unfinished placeholder.");
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node scripts/validate-skill-package.mjs <skill-directory>");
    await validateSkillPackage(process.argv[2]);
    process.stdout.write("Skill is valid.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Skill validation failed."}\n`);
    process.exitCode = 1;
  }
}
