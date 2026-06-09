import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { getTemplateRoot } from "../../../template-source/paths.js";
import type { WorkbenchRoleSummary } from "../../read-model-types.js";
import { humanConfirmationForRole, preferredRuntimeForRole, writeCapabilityForRole } from "./support.js";

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
  return {
    id,
    name: title,
    profilePath: relative(dirname(getTemplateRoot()), profilePath).replace(/\\/g, "/"),
    writeCapability: writeCapabilityForRole(id),
    preferredRuntime: preferredRuntimeForRole(id),
    delegatable: id !== "validator",
    humanConfirmation: humanConfirmationForRole(id),
    sections,
  };
}
