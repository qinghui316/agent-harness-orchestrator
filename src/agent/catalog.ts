import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getTemplateRoot } from "../template-source/paths.js";
import type { ManagedProject, ResolvedMemory, RunAgentRecord } from "../types/index.js";

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
  source: "bundled" | "memory";
  sourcePath: string;
  contentHash: string;
  catalogVersion: string;
  catalogHash: string;
  compatibility: AgentRoleCompatibility;
  providerBindings: AgentRoleProviderBinding[];
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

export interface AgentRoleProviderBinding {
  providerId: string;
  bindingKind: "native" | "materialized";
  status: "ready" | "stale" | "unavailable";
  contentHash: string;
}

export interface AgentSyncResult {
  catalogPath: string;
  agentsRoot: string;
  commandsRoot: string;
  written: string[];
  catalog: AgentCatalog;
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

export async function listAgentRoles(project: ManagedProject): Promise<AgentRole[]> {
  const memory = await resolveProjectMemory(project);
  const catalog = await readAgentCatalog(memory);
  return await Promise.all(catalog.agents.map((entry) => resolveAgentRole(memory, entry.roleId)));
}

export async function showAgentRole(project: ManagedProject, roleId: string): Promise<AgentRole> {
  const memory = await resolveProjectMemory(project);
  return await resolveAgentRole(memory, normalizeRoleId(roleId));
}

export async function syncAgentCatalog(project: ManagedProject): Promise<AgentSyncResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Agent catalog sync");
  await mkdir(memory.agentsRoot, { recursive: true });
  await mkdir(memory.commandsRoot, { recursive: true });
  const written: string[] = [];
  for (const entry of defaultCatalog.agents) {
    const source = bundledAgentPath(entry.roleId);
    if (!existsSync(source)) continue;
    const target = join(memory.agentsRoot, `${entry.roleId}.md`);
    if (!existsSync(target)) {
      await cp(source, target);
      written.push(target);
    }
  }
  if (!existsSync(memory.agentCatalogPath)) {
    await writeJsonFile(memory.agentCatalogPath, defaultCatalog);
    written.push(memory.agentCatalogPath);
  }
  return {
    catalogPath: memory.agentCatalogPath,
    agentsRoot: memory.agentsRoot,
    commandsRoot: memory.commandsRoot,
    written,
    catalog: await readAgentCatalog(memory),
  };
}

export async function readAgentCatalog(memory: ResolvedMemory): Promise<AgentCatalog> {
  const parsed = existsSync(memory.agentCatalogPath)
    ? catalogSchema.parse(parseJsonText(await readFile(memory.agentCatalogPath, "utf8"), memory.agentCatalogPath))
    : defaultCatalog;
  const catalog = normalizeCatalog(parsed);
  validateUniqueRoles(catalog);
  return catalog;
}

export async function resolveAgentRole(memory: ResolvedMemory, roleIdInput: string): Promise<AgentRole> {
  const roleId = normalizeRoleId(roleIdInput);
  const catalog = await readAgentCatalog(memory);
  const entry = catalog.agents.find((item) => item.roleId === roleId);
  if (!entry) throw new Error(`Unknown agent role: ${roleId}`);
  const sourcePath = resolveProfilePath(memory, entry);
  if (!existsSync(sourcePath)) throw new Error(`Agent role ${roleId} profile is missing: ${sourcePath}`);
  const markdown = await readFile(sourcePath, "utf8");
  validateRolePromptContract(entry.roleId, markdown);
  const contentHash = hashText(markdown);
  return {
    ...entry,
    source: isInsideMemoryAgents(memory, sourcePath) ? "memory" : "bundled",
    sourcePath,
    contentHash,
    catalogVersion: catalog.version,
    catalogHash: hashText(JSON.stringify(catalog)),
    compatibility: roleCompatibility(entry),
    providerBindings: [],
    markdown,
  };
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

export function buildRunAgentRecord(role: AgentRole, materialized?: { hash?: string | null }): RunAgentRecord {
  return {
    roleId: role.roleId,
    source: role.source,
    sourcePath: role.sourcePath,
    sourceHash: role.contentHash,
    catalogVersion: role.catalogVersion,
    catalogHash: role.catalogHash,
    bridge: materialized ? "aho-managed" : undefined,
    materializedHash: materialized?.hash ?? null,
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

function resolveProfilePath(memory: ResolvedMemory, entry: AgentCatalogEntry): string {
  if (entry.profilePath.startsWith("agents/")) {
    const memoryPath = join(memory.memoryRoot, entry.profilePath);
    if (existsSync(memoryPath)) return memoryPath;
    return bundledAgentPath(entry.roleId);
  }
  if (entry.profilePath.includes("..")) {
    throw new Error(`Agent role ${entry.roleId} has unsafe profilePath: ${entry.profilePath}`);
  }
  return join(memory.memoryRoot, entry.profilePath);
}

function bundledAgentPath(roleId: string): string {
  return join(dirname(getTemplateRoot()), "agent-profiles", `${roleId}.md`);
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

function isInsideMemoryAgents(memory: ResolvedMemory, sourcePath: string): boolean {
  return sourcePath === memory.agentsRoot || sourcePath.startsWith(`${memory.agentsRoot}\\`) || sourcePath.startsWith(`${memory.agentsRoot}/`);
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}
