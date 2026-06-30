import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import type { WorkbenchLiveSink } from "../workbench/types.js";
import { emitAssistantEvent } from "../workflow-runtime/kernel/live-events.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
  type AuditLeafRun,
  type CodeLeafRun,
  type ValidationLeafRun,
} from "./leaf-stages.js";

export interface CodeValidateAuditAttemptResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  status?: "failed" | "needs-user-input";
  error?: string;
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  boundaryAudit?: unknown;
  orchestration: MainAgentOrchestrationState;
}

export interface MainAgentOrchestrationAttempt {
  kind: "initial" | "automatic-rework";
  result: CodeValidateAuditAttemptResult;
}

export interface MainAgentOrchestrationResult {
  status: "completed" | "failed" | "needs-user-input";
  attempts: MainAgentOrchestrationAttempt[];
  reworkUsed: number;
  requiresUserInput?: boolean;
  stoppedAt?: "boundary" | "code" | "validation" | "audit";
  orchestration: MainAgentOrchestrationState;
}

export async function runMainAgentOrchestration(input: {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  continuation?: boolean;
  taskIds?: string[];
  readinessManifestId?: string;
}): Promise<MainAgentOrchestrationResult> {
  emitAssistantEvent(input.live, {
    runId: input.changeId,
    kind: "status",
    phase: "main-agent-tool-orchestration",
    title: input.continuation ? "Main-agent orchestration continued" : "Main-agent orchestration started",
    summary: "主 agent 将按当前证据逐步委派角色任务；每一步都经过 ToolPolicyGate、RoleDispatcher 和 AgentTaskResult。",
  });
  let orchestration = createMainAgentOrchestrationState({ changeId: input.changeId });
  const firstDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(firstDecision, "coder-agent");
  const first = await runCodeValidateAuditAttempt({
    project: input.project,
    changeId: input.changeId,
    prompt: input.prompt,
    live: input.live,
    taskIds: input.taskIds,
    initialRole: firstDecision.roleId,
    orchestrationState: orchestration,
    initialDecision: firstDecision,
    executionGate: input.readinessManifestId ? { mode: "single-change-readiness", readinessManifestId: input.readinessManifestId } : undefined,
  });
  orchestration = first.orchestration;
  const next = decideNextMainAgentOrchestration(orchestration);
  if (next.kind === "completed") {
    return { status: "completed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, orchestration };
  }
  if (next.kind === "failed") {
    return { status: "failed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  if (next.kind === "needs-user-input") {
    return { status: "needs-user-input", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  assertDelegateDecision(next, "rework-coder");
  emitAssistantEvent(input.live, {
    runId: input.changeId,
    kind: "status",
    phase: "automatic-rework",
    title: "Automatic rework started",
    summary: `${next.reason} AHO is sending the evidence back to rework-coder once.`,
    isError: true,
  });
  const reworkPrompt = [
    "Use the failed official validation/audit evidence from the previous attempt.",
    "Repair only the accepted demand in the assigned worktree.",
    "Do not change canonical planning artifacts.",
    input.prompt ?? "",
  ].join("\n\n");
  const second = await runCodeValidateAuditAttempt({
    project: input.project,
    changeId: input.changeId,
    prompt: reworkPrompt,
    live: input.live,
    initialRole: next.roleId,
    orchestrationState: orchestration,
    initialDecision: next,
  });
  orchestration = second.orchestration;
  const finalDecision = decideNextMainAgentOrchestration(orchestration);
  const finalStatus = finalDecision.kind === "completed"
    ? "completed"
    : finalDecision.kind === "failed" || finalDecision.kind === "needs-user-input"
      ? finalDecision.kind
      : "needs-user-input";
  return {
    status: finalStatus,
    attempts: [
      { kind: "initial", result: first },
      { kind: "automatic-rework", result: second },
    ],
    reworkUsed: 1,
    requiresUserInput: finalStatus !== "completed",
    stoppedAt: finalDecision.kind === "needs-user-input" || finalDecision.kind === "failed" ? finalDecision.stoppedAt : undefined,
    orchestration,
  };
}

export async function runLegacyCodeValidateAuditFacade(input: {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  taskIds?: string[];
  taskRunId?: string;
  initialRole?: string;
  orchestrationState?: MainAgentOrchestrationState;
  initialDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>;
  executionGate?: CodeExecutionGateOptions;
}): Promise<CodeValidateAuditAttemptResult> {
  return runCodeValidateAuditAttempt(input);
}

async function runCodeValidateAuditAttempt(input: {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  taskIds?: string[];
  taskRunId?: string;
  initialRole?: string;
  orchestrationState?: MainAgentOrchestrationState;
  initialDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>;
  executionGate?: CodeExecutionGateOptions;
}): Promise<CodeValidateAuditAttemptResult> {
  const memory = await resolveProjectMemory(input.project);
  let orchestration = input.orchestrationState ?? createMainAgentOrchestrationState({ changeId: input.changeId });
  let decision = input.initialDecision ?? synthesizeInitialDecision(input.initialRole, orchestration, input.taskRunId);
  let code: CodeLeafRun | undefined;
  let validation: ValidationLeafRun | undefined;
  let audit: AuditLeafRun | undefined;

  for (let i = 0; i < 8; i += 1) {
    if (decision.kind === "completed") {
      return { code, validation, audit, stoppedAt: null, orchestration };
    }
    if (decision.kind === "failed") {
      return { code, validation, audit, status: "failed", stoppedAt: decision.stoppedAt, orchestration };
    }
    if (decision.kind === "needs-user-input") {
      return { code, validation, audit, status: "needs-user-input", stoppedAt: decision.stoppedAt, orchestration };
    }

    if (decision.roleId === "coder-agent" || decision.roleId === "rework-coder") {
      const coder = decision.roleId === "rework-coder"
        ? await runReworkCoderLeafStage({
            project: input.project,
            memory,
            changeId: input.changeId,
            prompt: input.prompt,
            live: input.live,
            taskIds: input.taskIds,
            taskRunId: input.taskRunId,
            orchestration,
            decision,
            executionGate: input.executionGate,
          })
        : await runCoderLeafStage({
            project: input.project,
            memory,
            changeId: input.changeId,
            prompt: input.prompt,
            live: input.live,
            taskIds: input.taskIds,
            taskRunId: input.taskRunId,
            roleId: "coder-agent",
            orchestration,
            decision,
            executionGate: input.executionGate,
          });
      orchestration = coder.orchestration;
      code = coder.code;
      if (coder.status === "failed") {
        return { code, stoppedAt: coder.stoppedAt ?? "code", status: coder.error ? "failed" : undefined, error: coder.error, boundaryAudit: coder.boundaryAudit, orchestration };
      }
      decision = decideNextMainAgentOrchestration(orchestration);
      continue;
    }

    if (decision.roleId === "validator") {
      if (!code?.run.worktree?.worktreeId) {
        return { code, status: "needs-user-input", stoppedAt: "code", error: "Validator requires a completed coder worktree.", orchestration };
      }
      const validator = await runValidatorLeafStage({
        project: input.project,
        memory,
        changeId: input.changeId,
        live: input.live,
        orchestration,
        decision: decision as Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "validator" },
        code,
      });
      orchestration = validator.orchestration;
      validation = validator.validation;
      if (validator.status === "failed") {
        return { code, validation, stoppedAt: "validation", status: validator.error ? "failed" : undefined, error: validator.error, orchestration };
      }
      decision = decideNextMainAgentOrchestration(orchestration);
      continue;
    }

    if (decision.roleId === "auditor-agent") {
      if (!code?.run.worktree?.worktreeId || !validation) {
        return { code, validation, status: "needs-user-input", stoppedAt: "validation", error: "Auditor requires completed code and validation evidence.", orchestration };
      }
      const auditor = await runAuditorLeafStage({
        project: input.project,
        memory,
        changeId: input.changeId,
        live: input.live,
        orchestration,
        decision: decision as Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "auditor-agent" },
        code,
        validation,
      });
      orchestration = auditor.orchestration;
      audit = auditor.audit;
      return { code, validation, audit, stoppedAt: auditor.status === "completed" ? null : "audit", orchestration };
    }
  }

  return { code, validation, audit, status: "needs-user-input", stoppedAt: "audit", error: "Main-agent orchestration exceeded the V1 safety iteration limit.", orchestration };
}

function synthesizeInitialDecision(
  roleId: string | undefined,
  state: MainAgentOrchestrationState,
  taskRunId: string | undefined,
): MainAgentOrchestrationDecision {
  if (roleId === "rework-coder") {
    return {
      kind: "delegate-role",
      roleId: "rework-coder",
      goal: "Repair implementation from validation or audit evidence.",
      inputArtifacts: taskRunId ? [taskRunId] : [],
      reason: "Legacy rework path requested a bounded rework coder run.",
      attemptKind: "rework",
      nextRecommendation: "Run rework-coder, then re-run independent validation and audit.",
    };
  }
  return decideNextMainAgentOrchestration(state);
}

function assertDelegateDecision(decision: MainAgentOrchestrationDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) {
    throw new Error(`Main-agent decision engine expected ${roleId}, got ${decision.kind}${decision.kind === "delegate-role" ? `:${decision.roleId}` : ""}.`);
  }
}
