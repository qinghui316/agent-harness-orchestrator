import { createHash } from "node:crypto";
import type {
  ChangeStatus,
  RunContextPacketRef,
  RunWorktreeInfo,
  WorkerPermissionProfile,
} from "../types/index.js";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";

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

export interface RoleContextPacket {
  version: "1.0";
  kind: "role-context-packet";
  roleId: string;
  changeId: string;
  goal: string;
  runId?: string;
  taskIds: string[];
  tokenBudget: number;
  permissionProfile: WorkerPermissionProfile;
  change: ChangeContextPacket;
  evidence: EvidenceContextPacket;
  worktree?: RunWorktreeInfo;
  includedSources: ContextSourceRef[];
  evidenceRefs: ContextSourceRef[];
  excludedSources: string[];
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

const ORDINARY_WORKER_EXCLUSIONS = [
  "full parent transcript",
  "full archive history",
  "maintenance hot/warm/cold ledger",
  "raw stdout/stderr/jsonl unless explicitly selected",
  "unrelated active changes",
  "delegateTask manifest for worker roles",
  "full Harness directory",
  "Workbench snapshot as context source",
];

export function buildRoleContextPacket(input: RoleContextPacketInput): RoleContextPacket {
  const change = input.changeStatus.change;
  const changeId = change?.id ?? input.changeStatus.acMap?.changeId ?? "unknown";
  const taskIds = input.taskIds ?? [];
  const roleId = input.roleId.trim() || "unknown-role";
  const permissionProfile = workerPermissionProfileForRole(roleId);
  const changeContext = buildChangeContext(input.changeStatus);
  const includedSources = buildIncludedSources(changeId, roleId, taskIds, input.worktree);
  const evidenceRefs = input.evidenceRefs ?? [];
  const evidence = {
    summary: input.evidenceSummary?.filter((item) => item.trim().length > 0) ?? [],
    refs: evidenceRefs,
  };

  return {
    version: "1.0",
    kind: "role-context-packet",
    roleId,
    changeId,
    goal: input.goal.trim() || `Run ${roleId} for ${changeId}.`,
    ...(input.runId ? { runId: input.runId } : {}),
    taskIds,
    tokenBudget: input.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
    permissionProfile,
    change: changeContext,
    evidence,
    ...(input.worktree ? { worktree: input.worktree } : {}),
    includedSources,
    evidenceRefs,
    excludedSources: exclusionsForRole(roleId),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function buildRoleContextArtifact(packet: RoleContextPacket, ref: string): RoleContextArtifact {
  const hash = hashRoleContextPacket(packet);
  return {
    packet,
    markdown: renderRoleContextPacket(packet),
    hash,
    ref: { ref, hash, format: "role-context-packet@1.0" },
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
    `- May Delegate: ${packet.permissionProfile.mayDelegate}`,
    `- Sandbox Policy: ${packet.permissionProfile.sandboxPolicy}`,
    `- Allowed Read Roots: ${packet.permissionProfile.allowedReadRoots.join(", ") || "none"}`,
    `- Allowed Write Roots: ${packet.permissionProfile.allowedWriteRoots.join(", ") || "none"}`,
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
    ...(packet.evidenceRefs.length ? packet.evidenceRefs.map(formatSourceRef) : ["- No role-specific evidence refs were selected."]),
    "",
    "## Included Sources",
    "",
    ...(packet.includedSources.length ? packet.includedSources.map(formatSourceRef) : ["- No included source refs were selected."]),
    "",
    "## Excluded Sources",
    "",
    ...packet.excludedSources.map((source) => `- ${source}`),
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

function buildIncludedSources(changeId: string, roleId: string, taskIds: string[], worktree?: RunWorktreeInfo): ContextSourceRef[] {
  const sources: ContextSourceRef[] = [
    contextSourceRef("agents-routing", "AGENTS.md", "ref", "Route map and project conventions; not expanded as full Harness context by this packet."),
    contextSourceRef("change-spec", `harness/changes/active/${changeId}/spec.md`, "inline", "Current accepted demand semantics."),
    contextSourceRef("change-plan", `harness/changes/active/${changeId}/plan.md`, "inline", "Current accepted implementation plan."),
    contextSourceRef("change-tasks", `harness/changes/active/${changeId}/tasks.md`, "inline", "Current task and AC mapping."),
  ];
  if (taskIds.length > 0) {
    sources.push(contextSourceRef("selected-task-scope", taskIds.join(", "), "inline", `Selected task scope for ${roleId}.`));
  }
  if (worktree) {
    sources.push(contextSourceRef("worktree", worktree.worktreeId, "inline", "Assigned role worktree boundary."));
  }
  return sources;
}

function exclusionsForRole(roleId: string): string[] {
  if (/maintenance|documentation|evolution|architecture/i.test(roleId)) {
    return [
      "source root mutation",
      "direct canonical memory mutation; Runtime applies reviewed project Markdown automatically",
      "apply/merge/close/archive without explicit confirmation",
      "delegateTask manifest unless explicitly granted by a future AgentSpec",
    ];
  }
  return ORDINARY_WORKER_EXCLUSIONS;
}

function formatSourceRef(source: ContextSourceRef): string {
  return `- ${source.kind}: ${source.ref} (${source.mode}); ${source.reason}`;
}
