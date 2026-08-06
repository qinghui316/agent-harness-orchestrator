import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { getAgentProfilesRoot } from "../template-source/paths.js";
import type { ManagedProject, RunAgentRecord } from "../types/index.js";

export const AGENT_CATALOG_VERSION = "1.0";

export type AgentWriteCapability = "read-only" | "proposal-write" | "worktree-write" | "canonical-doc-write" | "deterministic-writer";

export interface AgentCatalogEntry {
  roleId: string;
  displayName: string;
  description: string;
  profilePath: string;
  writeCapability: AgentWriteCapability;
  allowedInputs: string[];
  allowedOutputs: string[];
  allowedSkills: string[];
  blockedSkills: string[];
  requiredGates: string[];
  delegatable: boolean;
}

export interface AgentCatalog {
  version: "1.0";
  agents: AgentCatalogEntry[];
}

export interface AgentRole {
  roleId: string;
  displayName: string;
  description: string;
  source: "bundled";
  sourcePath: string;
  contentHash: string;
  catalogVersion: string;
  catalogHash: string;
  compatibility: AgentRoleCompatibility;
  writeCapability: AgentWriteCapability;
  allowedInputs: string[];
  allowedOutputs: string[];
  allowedSkills: string[];
  blockedSkills: string[];
  requiredGates: string[];
  delegatable: boolean;
  markdown: string;
}

export interface AgentRoleCompatibility {
  requiredCapabilities: string[];
}

const roleIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const writeCapabilitySchema = z.enum(["read-only", "proposal-write", "worktree-write", "canonical-doc-write", "deterministic-writer"]);

const catalogEntrySchema = z.object({
  roleId: roleIdSchema,
  displayName: z.string().min(1),
  description: z.string().default(""),
  profilePath: z.string().min(1),
  writeCapability: writeCapabilitySchema,
  allowedInputs: z.array(z.string()).default([]),
  allowedOutputs: z.array(z.string()).default([]),
  allowedSkills: z.array(z.string()).default([]),
  blockedSkills: z.array(z.string()).default([]),
  requiredGates: z.array(z.string()).default([]),
  delegatable: z.boolean().default(false),
});

const catalogSchema = z.object({
  version: z.literal("1.0"),
  agents: z.array(catalogEntrySchema),
});

const defaultCatalog: AgentCatalog = {
  version: "1.0",
  agents: [
    { ...role("planning-agent", "Planning Agent", "Authors one file-backed Workflow proposal for Main Agent and user review.", "proposal-write", ["goal-brief", "state-brief", "project-guidance"], ["spec-plan-tasks-workflow-proposal"], ["main-agent-handoff"]), allowedSkills: ["aho-workflow-authoring"] },
    role("coder-agent", "Coder Agent", "Implements one Coding Work Package in an AHO-owned worktree and performs internal self-tests.", "worktree-write", ["accepted-planning-artifacts", "task-context", "worktree"], ["diff", "implementation-notes", "self-test-summary"], ["validation", "audit", "human-apply"], false),
    role("auditor-agent", "Auditor Agent", "Reviews task implementation evidence against accepted planning artifacts.", "read-only", ["accepted-planning-artifacts", "diff", "validation"], ["audit-proposal"], ["audit-accept"]),
    role("rework-coder", "Rework Coder", "Repairs a failed implementation attempt from validation or audit evidence within the same bounded workflow.", "worktree-write", ["failed-validation", "audit-findings", "worktree"], ["repair-diff", "rework-notes", "self-test-summary"], ["validation", "audit", "human-apply"], false),
    role("spec-test-proposer", "Spec-Test Proposer", "Finds existing source-root evidence candidates.", "read-only", ["ac-map", "spec-tests", "validation"], ["spec-test-proposal"], ["spec-test-proposal-accept"]),
    role("spec-test-generator", "Spec-Test Generator", "Generates passing test-only proposals in worktrees.", "worktree-write", ["missing-ac", "worktree"], ["test-diff", "implementation-notes"], ["validation", "audit", "human-apply"]),
    { ...role("harness-evolution-agent", "Harness Evolution Agent", "Builds an isolated project Harness candidate for one explicitly owned Evolution window.", "proposal-write", ["assigned-window", "project-harness"], ["evolution-candidate", "judge-request"]), allowedSkills: ["aho-harness-engineering"] },
  ],
};

export function readBundledAgentCatalog(): AgentCatalog {
  const catalog = normalizeCatalog(catalogSchema.parse(defaultCatalog));
  validateUniqueRoles(catalog);
  return catalog;
}

export async function resolveBundledAgentRole(roleIdInput: string): Promise<AgentRole> {
  const roleId = normalizeRoleId(roleIdInput);
  const catalog = readBundledAgentCatalog();
  const entry = catalog.agents.find((item) => item.roleId === roleId);
  if (!entry) throw new Error(`Unknown bundled agent role: ${roleId}`);
  const sourcePath = bundledAgentPath(entry.roleId);
  if (!existsSync(sourcePath)) throw new Error(`Bundled agent role ${roleId} profile is missing: ${sourcePath}`);
  const markdown = await readFile(sourcePath, "utf8");
  validateRolePromptContract(entry.roleId, markdown);
  return {
    ...entry,
    source: "bundled",
    sourcePath,
    contentHash: hashText(markdown),
    catalogVersion: catalog.version,
    catalogHash: hashText(JSON.stringify(catalog)),
    compatibility: roleCompatibility(entry),
    markdown,
  };
}

export async function listAgentRoles(_project: ManagedProject): Promise<AgentRole[]> {
  const catalog = readBundledAgentCatalog();
  return Promise.all(catalog.agents.map((entry) => resolveBundledAgentRole(entry.roleId)));
}

export async function showAgentRole(_project: ManagedProject, roleId: string): Promise<AgentRole> {
  return resolveBundledAgentRole(normalizeRoleId(roleId));
}

export function validateRolePromptContract(roleId: string, markdown: string): void {
  const requiredRoles = new Set([
    "planning-agent", "coder-agent", "auditor-agent", "rework-coder",
    "harness-evolution-agent",
  ]);
  if (!requiredRoles.has(roleId)) return;
  const missingFrontmatter = ["roleId:", "description:", "writeCapability:"].filter((marker) => !markdown.includes(marker));
  const requiredSections = ["## Role", "## Success Criteria", "## Constraints", "## Inputs", "## Workflow", "## Output Contract", "## Escalate When", "## Avoid"];
  const missingSections = requiredSections.filter((section) => !markdown.includes(section));
  if (missingFrontmatter.length > 0 || missingSections.length > 0) {
    throw new Error(`Agent role ${roleId} profile is missing required contract fields: ${[...missingFrontmatter, ...missingSections].join(", ")}`);
  }
}

export function buildRunAgentRecord(role: AgentRole): RunAgentRecord {
  return {
    roleId: role.roleId,
    source: role.source,
    sourcePath: role.sourcePath,
    sourceHash: role.contentHash,
    catalogVersion: role.catalogVersion,
    catalogHash: role.catalogHash,
  };
}

export function buildAgentSystemPrompt(role: AgentRole): string {
  return [
    `<system-instructions role="${role.roleId}">`,
    role.markdown.trim(),
    "</system-instructions>",
  ].join("\n");
}

export function hashText(text: string): string {
  return createHash("sha256").update(stripUtf8Bom(text), "utf8").digest("hex");
}

function role(
  roleId: string,
  displayName: string,
  description: string,
  writeCapability: AgentWriteCapability,
  allowedInputs: string[],
  allowedOutputs: string[],
  requiredGates: string[] = [],
  delegatable = false,
): AgentCatalogEntry {
  return {
    roleId,
    displayName,
    description,
    profilePath: `agents/${roleId}.md`,
    writeCapability,
    allowedInputs,
    allowedOutputs,
    allowedSkills: [],
    blockedSkills: [],
    requiredGates,
    delegatable,
  };
}

function normalizeRoleId(roleId: string): string {
  const parsed = roleIdSchema.safeParse(roleId.trim());
  if (!parsed.success) throw new Error(`Invalid agent role id: ${roleId}`);
  return parsed.data;
}

function bundledAgentPath(roleId: string): string {
  return join(getAgentProfilesRoot(), `${roleId}.md`);
}

function validateUniqueRoles(catalog: AgentCatalog): void {
  const seen = new Set<string>();
  for (const agent of catalog.agents) {
    if (seen.has(agent.roleId)) throw new Error(`Duplicate agent role in catalog: ${agent.roleId}`);
    seen.add(agent.roleId);
  }
}

function normalizeCatalog(parsed: z.infer<typeof catalogSchema>): AgentCatalog {
  // Retired model roles must not re-enter the production catalog during normalization.
  const retiredProductionRoleIds = new Set(["coder", "auditor", "validator", "merge-reviewer-agent", "evolution-scorer"]);
  const entries = parsed.agents.filter((entry) => !retiredProductionRoleIds.has(entry.roleId));
  for (const bundled of defaultCatalog.agents) {
    if (!entries.some((entry) => entry.roleId === bundled.roleId)) entries.push(bundled);
  }
  return {
    version: "1.0",
    agents: entries.map((entry) => ({
      roleId: entry.roleId,
      displayName: entry.displayName,
      description: entry.description ?? "",
      profilePath: entry.profilePath,
      writeCapability: entry.writeCapability,
      allowedInputs: entry.allowedInputs ?? [],
      allowedOutputs: entry.allowedOutputs ?? [],
      allowedSkills: entry.allowedSkills ?? [],
      blockedSkills: entry.blockedSkills ?? [],
      requiredGates: entry.requiredGates ?? [],
      delegatable: entry.delegatable ?? false,
    })),
  };
}

function roleCompatibility(entry: AgentCatalogEntry): AgentRoleCompatibility {
  const requiredCapabilities = new Set<string>(["workspace.read"]);
  if (entry.writeCapability !== "read-only") requiredCapabilities.add("workspace.write");
  if (entry.allowedSkills.length > 0) requiredCapabilities.add("skill.native-load");
  return { requiredCapabilities: [...requiredCapabilities].sort() };
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}
