import type {
  RuntimeEnforcementMode,
  ToolPolicyDecision,
  ToolPolicyDecisionStatus,
  WorkerPermissionProfile,
} from "../types/index.js";

export interface ToolPolicyRequest {
  actionType: string;
  actorRoleId: string;
  changeId?: string;
  conversationId?: string;
  targetId?: string;
  goal?: string;
  enforcementMode?: RuntimeEnforcementMode;
}

const HIGH_IMPACT_ACTIONS = new Set([
  "change.spec.accept",
  "change.plan.accept",
  "planning.confirm-execution",
  "code.run",
  "task.run.start",
  "task.run.retry",
  "task.queue.start",
  "worktree.apply",
  "result.apply",
  "apply-check.apply",
  "landing-queue.merge-next",
  "pr-draft.create",
  "pr-feedback.update-draft",
  "pr-review.submit",
  "pr-review.reply-submit",
  "pr-review.thread-resolve",
  "remote-landing.merge",
  "post-merge.sync-local.run",
  "post-merge.cleanup-branch.run",
  "harness-change.close",
  "harness-evolve.apply",
  "harness-evolve.mark-complete",
]);

const FORBIDDEN_ROLE_GOAL_PHRASES = [
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

const SECURE_DENIED_PATHS = [".git/**", ".env*", "**/.env*", "**/secrets/**", "**/.ssh/**", "**/node_modules/.cache/**"];

export function evaluateToolPolicy(request: ToolPolicyRequest): ToolPolicyDecision {
  const now = new Date().toISOString();
  const enforcementMode = request.enforcementMode ?? "broker-enforced";
  const forbiddenGoal = request.goal ? FORBIDDEN_ROLE_GOAL_PHRASES.find((phrase) => request.goal?.toLowerCase().includes(phrase)) : undefined;
  const workerProfile = workerPermissionProfileForRole(request.actorRoleId);
  let status: ToolPolicyDecisionStatus = "allowed";
  let reason = "Policy accepted.";
  let readableMessage = "这个操作在当前边界内。";

  if (request.actionType === "delegateTask" && !workerProfile.mayDelegate) {
    status = "denied";
    reason = `${request.actorRoleId} cannot delegate role tasks.`;
    readableMessage = "当前角色不是主 agent，不能继续委派子任务。";
  } else if (forbiddenGoal && request.actorRoleId !== "main-agent" && request.actorRoleId !== "orchestrator") {
    status = "denied";
    reason = `Role goal requests forbidden operation: ${forbiddenGoal}.`;
    readableMessage = "这个操作需要用户确认，不能交给角色 agent 自动执行。";
  } else if (HIGH_IMPACT_ACTIONS.has(request.actionType) && request.actorRoleId !== "main-agent" && request.actorRoleId !== "orchestrator") {
    status = "denied";
    reason = `${request.actionType} is a high-impact action and cannot be executed by ${request.actorRoleId}.`;
    readableMessage = "这个高影响操作只能由主 agent 提交到确认队列，角色 agent 不能直接执行。";
  } else if (HIGH_IMPACT_ACTIONS.has(request.actionType)) {
    status = "needs-user-confirmation";
    reason = `${request.actionType} requires an explicit human gate.`;
    readableMessage = "这个操作需要你确认后才能执行。";
  }

  return {
    version: "1.0",
    id: `policy-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    actionType: request.actionType,
    actorRoleId: request.actorRoleId,
    ...(request.targetId ? { targetId: request.targetId } : {}),
    status,
    enforcementMode,
    reason,
    readableMessage,
    createdAt: now,
  };
}

export function workerPermissionProfileForRole(roleId: string): WorkerPermissionProfile {
  if (roleId === "main-agent" || roleId === "orchestrator") {
    return {
      version: "1.0",
      roleId,
      allowedReadRoots: ["current-demand", "project-stable", "selected-evidence"],
      allowedWriteRoots: ["agent-task", "transcript", "policy-audit"],
      deniedPaths: SECURE_DENIED_PATHS,
      allowedCommands: [],
      sandboxPolicy: "read-only",
      mayDelegate: true,
    };
  }
  if (roleId === "coder-agent" || roleId === "rework-coder") {
    return {
      version: "1.0",
      roleId,
      allowedReadRoots: ["current-demand", "accepted-artifacts", "source-root"],
      allowedWriteRoots: ["aho-owned-worktree"],
      deniedPaths: SECURE_DENIED_PATHS,
      allowedCommands: ["npm test", "npm run", "pnpm test", "pnpm run", "yarn test", "yarn run", "tsc", "npx vitest", "git status", "git diff"],
      sandboxPolicy: "workspace-write",
      mayDelegate: false,
    };
  }
  if (roleId === "validator" || roleId === "auditor-agent" || roleId === "merge-reviewer-agent") {
    return {
      version: "1.0",
      roleId,
      allowedReadRoots: ["current-demand", "accepted-artifacts", "worktree", "evidence"],
      allowedWriteRoots: ["validation-artifacts", "audit-artifacts", "review-artifacts"],
      deniedPaths: SECURE_DENIED_PATHS,
      allowedCommands: ["npm test", "npm run test", "npm run lint", "npm run build", "npm run typecheck", "pnpm test", "pnpm run", "yarn test", "tsc", "git status", "git diff"],
      sandboxPolicy: "read-only",
      mayDelegate: false,
    };
  }
  if (roleId.includes("maintenance") || roleId.includes("documentation") || roleId.includes("evolution") || roleId.includes("architecture")) {
    return {
      version: "1.0",
      roleId,
      allowedReadRoots: ["archive", "maintenance-ledger", "generated-index", "docs"],
      allowedWriteRoots: ["maintenance-ledger", "candidates", "generated-cache", "proposals"],
      deniedPaths: [...SECURE_DENIED_PATHS, "AGENTS.md", "docs/**/*.md", "harness/templates/**"],
      allowedCommands: ["git status", "git diff"],
      sandboxPolicy: "read-only",
      mayDelegate: false,
    };
  }
  return {
    version: "1.0",
    roleId,
    allowedReadRoots: ["current-demand"],
    allowedWriteRoots: [],
    deniedPaths: SECURE_DENIED_PATHS,
    allowedCommands: [],
    sandboxPolicy: "read-only",
    mayDelegate: false,
  };
}

export function highImpactActions(): string[] {
  return [...HIGH_IMPACT_ACTIONS].sort();
}
