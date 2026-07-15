import type { AgentTaskKind, AgentTaskStatus } from "../types/index.js";
import type { MainAgentDecision } from "./decisions.js";
import { listAgentTasks } from "./repository.js";
import type { ResolvedMemory } from "../types/index.js";

export const DELEGATE_TASK_ALLOWED_ROLES = [
  "coder-agent",
  "validator",
  "auditor-agent",
  "rework-coder",
] as const;

export type DelegateTaskRoleId = typeof DELEGATE_TASK_ALLOWED_ROLES[number];
export type DelegationMode = "runtime-tool" | "orchestrator-policy";

export interface AgentTaskRequest {
  roleId: string;
  changeId: string;
  conversationId: string;
  kind: AgentTaskKind;
  goal: string;
  inputArtifacts?: string[];
  parentTaskId?: string;
  delegationMode?: DelegationMode;
}

export interface DelegateTaskManifestRole {
  roleId: DelegateTaskRoleId;
  description: string;
  writeCapability: "worktree" | "none";
  outputContract: string;
}

export interface DelegateTaskManifest {
  toolName: "delegateTask";
  availableTo: "main-agent";
  allowedRoles: DelegateTaskManifestRole[];
  constraints: string[];
}

export interface DelegateTaskCapability {
  toolName: "delegateTask";
  available: boolean;
  reason: string;
}

export interface DelegateTaskPolicyResult {
  ok: boolean;
  request: AgentTaskRequest;
  reason: string;
  readableMessage: string;
}

export function buildDelegateTaskManifest(): DelegateTaskManifest {
  return {
    toolName: "delegateTask",
    availableTo: "main-agent",
    allowedRoles: [
      {
        roleId: "coder-agent",
        description: "Implement the confirmed demand in an AHO-owned worktree and self-test.",
        writeCapability: "worktree",
        outputContract: "worktree proposal summary, self-test summary, and run evidence refs",
      },
      {
        roleId: "validator",
        description: "Run independent mechanical validation against a worktree proposal.",
        writeCapability: "none",
        outputContract: "validation status and evidence refs",
      },
      {
        roleId: "auditor-agent",
        description: "Run independent semantic audit against validated evidence.",
        writeCapability: "none",
        outputContract: "audit verdict, notes, and evidence refs",
      },
      {
        roleId: "rework-coder",
        description: "Repair a same-demand worktree attempt from validation/audit/feedback evidence.",
        writeCapability: "worktree",
        outputContract: "fresh worktree proposal summary and evidence refs",
      },
    ],
    constraints: [
      "Only main-agent/orchestrator turns may call delegateTask.",
      "Worker roles cannot call delegateTask or spawn subagents.",
      "Role tasks cannot apply source changes, create/update PRs, mark ready for review, merge, sync, cleanup, close/archive, or evolve Harness docs.",
      "coder-agent and rework-coder may write only inside AHO-owned worktrees.",
      "validator and auditor-agent are read-only evidence roles.",
    ],
  };
}

export function detectDelegateTaskMcpCapability(): DelegateTaskCapability {
  return {
    toolName: "delegateTask",
    available: false,
    reason: "The local delegateTask contract is implemented, but the selected Agent provider cannot dynamically load AHO MCP tools.",
  };
}

export async function validateDelegateTaskPolicy(memory: ResolvedMemory, request: AgentTaskRequest): Promise<DelegateTaskPolicyResult> {
  const role = request.roleId.trim();
  if (!isAllowedDelegateRole(role)) {
    return reject(request, `Unknown or unavailable role: ${role || "(empty)"}.`, "这个角色当前不能由主 agent 委派。");
  }
  if (!request.goal.trim()) {
    return reject(request, "delegateTask requires a non-empty goal.", "主 agent 需要先说明要委派的具体目标。");
  }
  const forbidden = forbiddenGoalPhrase(request.goal);
  if (forbidden) {
    return reject(request, `Role goal requests forbidden operation: ${forbidden}.`, "这个操作需要用户确认，不能交给角色 agent 自动执行。");
  }
  const invalidArtifact = (request.inputArtifacts ?? []).find((artifact) => !isDemandScopedArtifact(artifact, request.changeId));
  if (invalidArtifact) {
    return reject(request, `Artifact is not scoped to the current demand: ${invalidArtifact}.`, "这个证据不属于当前需求，不能作为委派输入。");
  }
  const existing = await listAgentTasks(memory, request.changeId);
  const active = existing.find((task) => task.kind === "foreground" && task.status !== "completed" && task.status !== "blocked" && task.status !== "failed" && task.status !== "needs-user-input" && task.status !== "cancelled");
  if (active) {
    return reject(request, `Foreground role task already active: ${active.id}.`, "当前需求已有角色任务在处理，主 agent 需要等它返回后再委派下一步。");
  }
  if ((role === "validator" || role === "auditor-agent") && request.goal.toLowerCase().match(/\b(write|modify|edit|patch|apply)\b/)) {
    return reject(request, `${role} is read-only and cannot modify code.`, "验证/审查角色只能产出证据，不能修改代码。");
  }
  return {
    ok: true,
    request: { ...request, roleId: role, inputArtifacts: request.inputArtifacts ?? [], delegationMode: request.delegationMode ?? "orchestrator-policy" },
    reason: "Policy accepted.",
    readableMessage: `主 agent 正在委派 ${role}。`,
  };
}

export function buildDelegateTaskDecisionInput(request: AgentTaskRequest, reason: string): Omit<MainAgentDecision, "version" | "id" | "createdAt"> {
  return {
    changeId: request.changeId,
    recommendedAction: `delegateTask:${request.roleId}`,
    userMessage: `委派 ${request.roleId}`,
    requiresUserDecision: false,
    createTask: {
      roleId: request.roleId,
      kind: request.kind,
      summary: request.goal,
      inputArtifacts: request.inputArtifacts ?? [],
      ...(request.parentTaskId ? { parentTaskId: request.parentTaskId } : {}),
    },
    reason,
  };
}

export function statusFromRoleResult(status: AgentTaskStatus): "completed" | "failed" | "needs-user-input" {
  if (status === "completed") return "completed";
  if (status === "needs-user-input") return "needs-user-input";
  return "failed";
}

function isAllowedDelegateRole(roleId: string): roleId is DelegateTaskRoleId {
  return DELEGATE_TASK_ALLOWED_ROLES.includes(roleId as DelegateTaskRoleId);
}

function reject(request: AgentTaskRequest, reason: string, readableMessage: string): DelegateTaskPolicyResult {
  return { ok: false, request, reason, readableMessage };
}

function forbiddenGoalPhrase(goal: string): string | null {
  const normalized = goal.toLowerCase();
  const forbidden = [
    "apply",
    "merge",
    "pull request",
    "pr ",
    "ready for review",
    "sync",
    "cleanup",
    "clean up branch",
    "close",
    "archive",
    "evolve",
    "stable memory",
    "project/stable",
  ];
  return forbidden.find((phrase) => normalized.includes(phrase)) ?? null;
}

function isDemandScopedArtifact(artifact: string, changeId: string): boolean {
  const value = artifact.trim();
  if (!value) return false;
  if (value.includes("..")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  return value.includes(changeId)
    || value.startsWith("run/")
    || value.startsWith("runs/")
    || value.startsWith("validation/")
    || value.startsWith("audit/")
    || value.startsWith("agent-task/")
    || value.startsWith("worktrees/")
    || value.startsWith("taskrun-")
    || /^[a-z]+-[0-9]{8,}/.test(value);
}
