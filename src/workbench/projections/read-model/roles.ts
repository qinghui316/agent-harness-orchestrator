import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { getTemplateRoot } from "../../../template-source/paths.js";
import type { WorkbenchRoleSummary } from "../../read-model-types.js";
import { humanConfirmationForRole } from "./support.js";

export async function listWorkbenchRoles(): Promise<WorkbenchRoleSummary[]> {
  const profileRoot = join(dirname(getTemplateRoot()), "agent-profiles");
  if (!existsSync(profileRoot)) return [];
  const entries = await readdir(profileRoot, { withFileTypes: true });
  const roles = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => summarizeRoleProfile(profileRoot, entry.name)));
  return roles.sort((a, b) => a.id.localeCompare(b.id));
}

export async function summarizeRoleProfile(profileRoot: string, fileName: string): Promise<WorkbenchRoleSummary> {
  const profilePath = join(profileRoot, fileName);
  const content = await readFile(profilePath, "utf8");
  const id = fileName.replace(/\.md$/, "");
  const title = /^#\s+(.+)\s*$/m.exec(content)?.[1] ?? id;
  const sections = [...content.matchAll(/^##\s+(.+)\s*$/gm)].map((match) => match[1]);
  const writeCapability = /(?:^|\n)writeCapability:\s*([^\r\n]+)/.exec(content)?.[1]?.trim();
  const preferredRuntime = /(?:^|\n)preferredRuntime:\s*([^\r\n]+)/.exec(content)?.[1]?.trim();
  if (!isWriteCapability(writeCapability) || !preferredRuntime) throw new Error(`Agent profile ${id} has invalid runtime frontmatter.`);
  return {
    id,
    name: title,
    profilePath: relative(dirname(getTemplateRoot()), profilePath).replace(/\\/g, "/"),
    writeCapability,
    preferredRuntime,
    delegatable: id !== "validator",
    humanConfirmation: humanConfirmationForRole(id),
    sections,
  };
}

function isWriteCapability(value: string | undefined): value is WorkbenchRoleSummary["writeCapability"] {
  return value !== undefined && ["read-only", "proposal-write", "worktree-write", "canonical-doc-write", "deterministic-writer"].includes(value);
}
