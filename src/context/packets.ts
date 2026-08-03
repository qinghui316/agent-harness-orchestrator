import { createHash } from "node:crypto";
import type {
  ChangeStatus,
  RunContextPacketRef,
  RunWorktreeInfo,
} from "../types/index.js";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import type { ProjectHarnessAgentIdentity } from "../project-harness/agent-input.js";

export type ContextSourceInlineMode = "inline" | "ref";

export interface ContextSourceRef {
  kind: string;
  ref: string;
  mode: ContextSourceInlineMode;
  reason: string;
}

export interface ChangeContextPacket {
  changeId: string;
  title: string;
  reviewStatus: string;
  latestValidation: string;
  latestAudit: string;
  closeGateReady: boolean;
  acceptanceCriteria: Array<{ id: string; text: string }>;
  tasks: Array<{ id: string; text: string; done: boolean; acIds: string[] }>;
  closeGateBlockingIssues: string[];
  closeGateWarnings: string[];
}

export interface EvidenceContextPacket {
  summary: string[];
  refs: ContextSourceRef[];
}

export interface RoleToolPermissions {
  sandboxPolicy: "read-only" | "workspace-write";
  writableRoots: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  mayDelegate: boolean;
}

export interface RoleContextPacket {
  version: "2.0";
  kind: "role-context-packet";
  roleId: string;
  changeId: string;
  goal: string;
  runId?: string;
  taskIds: string[];
  tokenBudget: number;
  projectHarness: ProjectHarnessAgentIdentity;
  permissions: RoleToolPermissions;
  change: ChangeContextPacket;
  evidence: EvidenceContextPacket;
  worktree?: RunWorktreeInfo;
  createdAt: string;
}

export interface RoleContextPacketInput {
  roleId: string;
  changeStatus: ChangeStatus;
  goal: string;
  runId?: string;
  taskIds?: string[];
  tokenBudget?: number;
  worktree?: RunWorktreeInfo;
  projectHarness: ProjectHarnessAgentIdentity;
  writableRoots: string[];
  sandboxPolicy: "read-only" | "workspace-write";
  allowedCommands?: string[];
  evidenceSummary?: string[];
  evidenceRefs?: ContextSourceRef[];
  createdAt?: string;
}

export interface RoleContextArtifact {
  packet: RoleContextPacket;
  markdown: string;
  hash: string;
  ref: RunContextPacketRef;
}

const DEFAULT_TOKEN_BUDGET = 8000;

export function buildRoleContextPacket(input: RoleContextPacketInput): RoleContextPacket {
  const change = input.changeStatus.change;
  const changeId = change?.id ?? input.changeStatus.acMap?.changeId ?? "unknown";
  const taskIds = input.taskIds ?? [];
  const roleId = input.roleId.trim() || "unknown-role";
  const permissionProfile = workerPermissionProfileForRole(roleId);
  const changeContext = buildChangeContext(input.changeStatus);
  const evidenceRefs = input.evidenceRefs ?? [];
  const evidence = {
    summary: input.evidenceSummary?.filter((item) => item.trim().length > 0) ?? [],
    refs: evidenceRefs,
  };

  return {
    version: "2.0",
    kind: "role-context-packet",
    roleId,
    changeId,
    goal: input.goal.trim() || `Run ${roleId} for ${changeId}.`,
    ...(input.runId ? { runId: input.runId } : {}),
    taskIds,
    tokenBudget: input.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
    projectHarness: input.projectHarness,
    permissions: {
      sandboxPolicy: input.sandboxPolicy,
      writableRoots: [...new Set(input.writableRoots)],
      deniedPaths: permissionProfile.deniedPaths,
      allowedCommands: input.allowedCommands ?? permissionProfile.allowedCommands,
      mayDelegate: permissionProfile.mayDelegate,
    },
    change: changeContext,
    evidence,
    ...(input.worktree ? { worktree: input.worktree } : {}),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function buildRoleContextArtifact(packet: RoleContextPacket, ref: string): RoleContextArtifact {
  const hash = hashRoleContextPacket(packet);
  return {
    packet,
    markdown: renderRoleContextPacket(packet),
    hash,
    ref: { ref, hash, format: "role-context-packet@2.0" },
  };
}

export function hashRoleContextPacket(packet: RoleContextPacket): string {
  return createHash("sha256").update(JSON.stringify(packet)).digest("hex");
}

export function renderRoleContextPacket(packet: RoleContextPacket): string {
  return [
    "# Role Context Packet",
    "",
    "This file is generated for one role run. It is not the source of truth.",
    "The structured audit copy is `context-packet.json` in the same run directory.",
    "",
    "## Role",
    "",
    `- Role: ${packet.roleId}`,
    `- Change ID: ${packet.changeId}`,
    packet.runId ? `- Run ID: ${packet.runId}` : "- Run ID: none",
    `- Goal: ${packet.goal}`,
    `- Token Budget: ${packet.tokenBudget}`,
    `- Project Harness ID: ${packet.projectHarness.projectId}`,
    `- Project Harness Skill: ${packet.projectHarness.skillName}`,
    `- Project Harness Revision: ${packet.projectHarness.skillRevision}`,
    `- Project Harness Fingerprint: ${packet.projectHarness.contentFingerprint}`,
    `- May Delegate: ${packet.permissions.mayDelegate}`,
    `- Sandbox Policy: ${packet.permissions.sandboxPolicy}`,
    `- Writable Roots: ${packet.permissions.writableRoots.join(", ") || "none"}`,
    `- Allowed Commands: ${packet.permissions.allowedCommands.join(", ") || "none"}`,
    "",
    "## Change Context",
    "",
    `- Title: ${packet.change.title}`,
    `- Review Status: ${packet.change.reviewStatus}`,
    `- Latest Validation: ${packet.change.latestValidation}`,
    `- Latest Audit: ${packet.change.latestAudit}`,
    `- Close Gate Ready: ${packet.change.closeGateReady}`,
    "",
    "### Acceptance Criteria",
    "",
    ...(packet.change.acceptanceCriteria.length
      ? packet.change.acceptanceCriteria.map((criterion) => `- ${criterion.id}: ${criterion.text || "(empty)"}`)
      : ["- None parsed."]),
    "",
    "### Tasks",
    "",
    ...(packet.change.tasks.length
      ? packet.change.tasks.map((task) => `- ${task.done ? "[x]" : "[ ]"} ${task.id}: ${task.text || "(empty)"}; Covers: ${task.acIds.join(", ") || "none"}`)
      : ["- None parsed."]),
    "",
    "## Worktree Context",
    "",
    ...(packet.worktree
      ? [
          `- Worktree ID: ${packet.worktree.worktreeId}`,
          `- Checkout Path: ${packet.worktree.checkoutPath}`,
          `- Branch: ${packet.worktree.branchName}`,
          `- Base Ref: ${packet.worktree.baseRef}`,
          `- Base Commit: ${packet.worktree.baseCommit}`,
        ]
      : ["- No worktree assigned for this role run."]),
    "",
    "## Evidence Summary",
    "",
    ...(packet.evidence.summary.length ? packet.evidence.summary.map((item) => `- ${item}`) : ["- No role-specific evidence summary was selected."]),
    "",
    "## Evidence Refs",
    "",
    ...(packet.evidence.refs.length ? packet.evidence.refs.map(formatSourceRef) : ["- No role-specific evidence refs were selected."]),
    "",
    "The packet selects evidence and execution permissions only. It does not limit which project Harness Skill pages the Agent may read.",
    "",
  ].join("\n");
}

export function contextSourceRef(kind: string, ref: string, mode: ContextSourceInlineMode, reason: string): ContextSourceRef {
  return { kind, ref, mode, reason };
}

function buildChangeContext(status: ChangeStatus): ChangeContextPacket {
  return {
    changeId: status.change?.id ?? status.acMap?.changeId ?? "unknown",
    title: status.change?.title ?? "unknown",
    reviewStatus: status.reviewStatus,
    latestValidation: status.latestValidation ? `${status.latestValidation.status} (${status.latestValidation.id})` : "none",
    latestAudit: status.latestAudit ? `${status.latestAudit.status} (${status.latestAudit.id})` : "none",
    closeGateReady: status.closeGate.ready,
    acceptanceCriteria: status.acMap?.acceptanceCriteria.map((criterion) => ({ id: criterion.id, text: criterion.text })) ?? [],
    tasks: status.acMap?.tasks.map((task) => ({ id: task.id, text: task.text, done: task.done, acIds: task.acIds })) ?? [],
    closeGateBlockingIssues: status.closeGate.blockingIssues,
    closeGateWarnings: status.closeGate.warnings,
  };
}

function formatSourceRef(source: ContextSourceRef): string {
  return `- ${source.kind}: ${source.ref} (${source.mode}); ${source.reason}`;
}
