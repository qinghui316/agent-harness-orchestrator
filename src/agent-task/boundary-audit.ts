import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import type {
  BoundaryViolation,
  PostRunBoundaryAudit,
  RuntimeEnforcementMode,
  ToolEventAuditEntry,
  ToolPolicyDecision,
  WorkerPermissionProfile,
} from "../types/index.js";
import { workerPermissionProfileForRole } from "./tool-policy.js";
import type { AgentTaskPathPort } from "./paths.js";

export interface BoundaryAuditInput {
  changeId: string;
  roleId: string;
  runId?: string;
  taskId?: string;
  sourceChanged?: boolean;
  changedPaths?: string[];
  artifactRefs?: string[];
  enforcementMode?: RuntimeEnforcementMode;
}

export async function recordToolEventAuditEntry(
  memory: AgentTaskPathPort,
  input: {
    changeId?: string;
    conversationId?: string;
    actorRoleId: string;
    actionType: string;
    targetId?: string;
    scope?: Record<string, unknown>;
    decision: ToolPolicyDecision;
    evidenceRefs?: string[];
  },
): Promise<string> {
  const entry: ToolEventAuditEntry = {
    version: "1.0",
    id: `tool-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ...(input.changeId ? { changeId: input.changeId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    actorRoleId: input.actorRoleId,
    actionType: input.actionType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.scope ? { scope: input.scope } : {}),
    decisionStatus: input.decision.status,
    enforcementMode: input.decision.enforcementMode,
    reason: input.decision.reason,
    evidenceRefs: input.evidenceRefs ?? [],
    createdAt: new Date().toISOString(),
  };
  const root = toolAuditRoot(memory);
  await mkdir(root, { recursive: true });
  const jsonl = join(root, "tool-events.jsonl");
  await appendFile(jsonl, `${JSON.stringify(entry)}\n`, "utf8");
  return relative(memory.workbenchRoot, jsonl).replace(/\\/g, "/");
}

export async function recordPostRunBoundaryAudit(memory: AgentTaskPathPort, input: BoundaryAuditInput): Promise<PostRunBoundaryAudit> {
  const profile = workerPermissionProfileForRole(input.roleId);
  const violations = findBoundaryViolations(profile, input);
  const audit: PostRunBoundaryAudit = {
    version: "1.0",
    id: `boundary-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    changeId: input.changeId,
    roleId: input.roleId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    enforcementMode: input.enforcementMode ?? "sandbox-audited",
    status: violations.length > 0 ? "failed" : "passed",
    violations,
    evidenceRefs: input.artifactRefs ?? [],
    createdAt: new Date().toISOString(),
  };
  const root = boundaryAuditRoot(memory, input.changeId);
  await mkdir(root, { recursive: true });
  await writeJsonFile(join(root, `${audit.id}.json`), audit);
  await writeFile(join(root, `${audit.id}.md`), renderBoundaryAuditMarkdown(audit), "utf8");
  return audit;
}

export function boundaryAuditArtifactRef(memory: AgentTaskPathPort, audit: PostRunBoundaryAudit): string {
  return displayMemoryPath(memory, join(boundaryAuditRoot(memory, audit.changeId), `${audit.id}.json`));
}

export function findBoundaryViolations(profile: WorkerPermissionProfile, input: BoundaryAuditInput): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  if (input.sourceChanged && !profile.allowedWriteRoots.includes("source-root")) {
    violations.push({
      kind: "source-root-modified",
      reason: `${profile.roleId} is not allowed to modify the source root.`,
    });
  }
  for (const changedPath of input.changedPaths ?? []) {
    const denied = profile.deniedPaths.find((pattern) => globMatch(pattern, normalizePath(changedPath)));
    if (denied) {
      violations.push({ kind: "denied-path", path: changedPath, reason: `Matches denied pattern: ${denied}` });
    }
  }
  if ((profile.roleId === "validator" || profile.roleId === "auditor-agent" || profile.roleId === "merge-reviewer-agent") && (input.changedPaths ?? []).length > 0) {
    for (const changedPath of input.changedPaths ?? []) {
      violations.push({
        kind: "readonly-role-write",
        path: changedPath,
        reason: `${profile.roleId} is a read-only evidence role and cannot produce code writes.`,
      });
    }
  }
  for (const artifact of input.artifactRefs ?? []) {
    if (artifact.includes("..") || /^[a-zA-Z]:[\\/]/.test(artifact)) {
      violations.push({ kind: "cross-demand-artifact", path: artifact, reason: "Artifact reference is not safely demand-scoped." });
    }
  }
  return violations;
}

export async function readLatestBoundaryAuditForTask(memory: AgentTaskPathPort, changeId: string, taskId: string): Promise<PostRunBoundaryAudit | null> {
  const root = boundaryAuditRoot(memory, changeId);
  if (!existsSync(root)) return null;
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(root)).filter((name) => name.endsWith(".json")).sort().reverse();
  for (const file of files) {
    const text = await readFile(join(root, file), "utf8").catch(() => "");
    if (!text) continue;
    const parsed = JSON.parse(text) as PostRunBoundaryAudit;
    if (parsed.taskId === taskId) return parsed;
  }
  return null;
}

function renderBoundaryAuditMarkdown(audit: PostRunBoundaryAudit): string {
  return [
    `# Boundary Audit: ${audit.id}`,
    "",
    `- Change: ${audit.changeId}`,
    `- Role: ${audit.roleId}`,
    `- Status: ${audit.status}`,
    `- Enforcement: ${audit.enforcementMode}`,
    "",
    "## Violations",
    "",
    ...(audit.violations.length ? audit.violations.map((violation) => `- ${violation.kind}${violation.path ? ` ${violation.path}` : ""}: ${violation.reason}`) : ["- none"]),
    "",
  ].join("\n");
}

function toolAuditRoot(memory: AgentTaskPathPort): string {
  return join(memory.workbenchRoot, "agent-tasks", "audit");
}

function boundaryAuditRoot(memory: AgentTaskPathPort, changeId: string): string {
  return join(memory.workbenchRoot, "agent-tasks", "boundary-audits", changeId);
}

function displayMemoryPath(memory: AgentTaskPathPort, absolutePath: string): string {
  return relative(memory.workbenchRoot, absolutePath).replace(/\\/g, "/");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function globMatch(pattern: string, value: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const normalizedValue = normalizePath(value);
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`).test(normalizedValue);
}

export function pathEscapesRoot(root: string, target: string): boolean {
  const rel = relative(root, resolve(root, target));
  return rel.startsWith("..") || rel === "..";
}
