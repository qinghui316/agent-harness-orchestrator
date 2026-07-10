import { shortHash } from "../fs/path.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import type {
  DefaultCodeChangeWorkflowNodeId,
  DefaultCodeChangeWorkflowNodeState,
  DefaultCodeChangeWorkflowRun,
  ManagedProject,
  ResolvedMemory,
} from "../types/index.js";
import type { WorkflowRuntimeDecision, WorkflowRuntimeExecutionState } from "./execution-contract.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
  type AuditLeafRun,
  type CodeLeafRun,
  type WorkflowRuntimeAuditorLeafResult,
  type WorkflowRuntimeCoderLeafResult,
  type WorkflowRuntimeValidatorLeafResult,
  type ValidationLeafRun,
} from "./leaf-execution.js";
import { appendWorkflowRunEvent, updateWorkflowRun, writeWorkflowRun } from "../workflow-run/manager.js";
import type { WorkflowRuntimeLiveSink } from "./kernel/live-events.js";
import { compactArtifactRefs } from "./kernel/runtime-guards.js";

export type DefaultCodeChangeWorkflowStatus = "completed" | "failed" | "needs-user-input";

export interface DefaultCodeChangeWorkflowInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  taskIds?: string[];
  workflowGraphPlanId?: string;
}

export interface DefaultCodeChangeWorkflowAttempt {
  kind: "initial" | "automatic-rework";
  code?: WorkflowRuntimeCoderLeafResult;
  validation?: WorkflowRuntimeValidatorLeafResult;
  audit?: WorkflowRuntimeAuditorLeafResult;
}

export interface DefaultCodeChangeWorkflowResult {
  status: DefaultCodeChangeWorkflowStatus;
  attempts: DefaultCodeChangeWorkflowAttempt[];
  reworkUsed: number;
  requiresUserInput?: boolean;
  stoppedAt?: "boundary" | "code" | "validation" | "audit";
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  workflowRun: DefaultCodeChangeWorkflowRun;
  workflowRunId: string;
  orchestration: WorkflowRuntimeExecutionState;
}

export interface HarnessWorkflowRunEngineServices {
  resolveMemory(project: ManagedProject): Promise<ResolvedMemory>;
  writeRun(memory: ResolvedMemory, run: DefaultCodeChangeWorkflowRun): Promise<DefaultCodeChangeWorkflowRun>;
  updateRun(memory: ResolvedMemory, run: DefaultCodeChangeWorkflowRun): Promise<DefaultCodeChangeWorkflowRun>;
  appendEvent(
    memory: ResolvedMemory,
    run: DefaultCodeChangeWorkflowRun,
    type: "workflow.created" | "workflow.started" | "node.started" | "node.completed" | "node.failed" | "node.blocked" | "workflow.completed" | "workflow.failed" | "workflow.blocked",
    input?: { status?: string; reason?: string; data?: Record<string, unknown> },
  ): Promise<void>;
  runCoder(input: LeafInput & { roleId: "coder-agent"; executionGate?: CodeExecutionGateOptions }): Promise<WorkflowRuntimeCoderLeafResult>;
  runReworkCoder(input: LeafInput & { executionGate?: CodeExecutionGateOptions }): Promise<WorkflowRuntimeCoderLeafResult>;
  runValidator(input: LeafInput & { decision: DelegateDecision<"validator">; code: CodeLeafRun }): Promise<WorkflowRuntimeValidatorLeafResult>;
  runAuditor(input: LeafInput & { decision: DelegateDecision<"auditor-agent">; code: CodeLeafRun; validation: ValidationLeafRun }): Promise<WorkflowRuntimeAuditorLeafResult>;
}

type DelegateDecision<RoleId extends "coder-agent" | "validator" | "auditor-agent" | "rework-coder"> =
  Extract<WorkflowRuntimeDecision, { kind: "delegate-role" }> & { roleId: RoleId };

interface LeafInput {
  project: ManagedProject;
  memory: ResolvedMemory;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  taskIds?: string[];
  orchestration: WorkflowRuntimeExecutionState;
  decision?: Extract<WorkflowRuntimeDecision, { kind: "delegate-role" }>;
}

const DEFAULT_TEMPLATE_ID = "default-code-change-workflow" as const;
const MAX_REWORK_ATTEMPTS = 1;

export const defaultHarnessWorkflowRunEngineServices: HarnessWorkflowRunEngineServices = {
  resolveMemory: resolveProjectMemory,
  writeRun: async (memory, run) => writeWorkflowRun(memory, run) as Promise<DefaultCodeChangeWorkflowRun>,
  updateRun: async (memory, run) => updateWorkflowRun(memory, run) as Promise<DefaultCodeChangeWorkflowRun>,
  appendEvent: appendWorkflowRunEvent,
  runCoder: runCoderLeafStage,
  runReworkCoder: runReworkCoderLeafStage,
  runValidator: runValidatorLeafStage,
  runAuditor: runAuditorLeafStage,
};

export class HarnessWorkflowRunEngine {
  constructor(private readonly services: HarnessWorkflowRunEngineServices = defaultHarnessWorkflowRunEngineServices) {}

  async runDefaultCodeChangeWorkflow(input: DefaultCodeChangeWorkflowInput): Promise<DefaultCodeChangeWorkflowResult> {
    const memory = await this.services.resolveMemory(input.project);
    let workflowRun = await this.createRun(memory, input);
    await this.services.appendEvent(memory, workflowRun, "workflow.started", { data: { templateId: DEFAULT_TEMPLATE_ID } });
    workflowRun = await this.markWorkflowRunning(memory, workflowRun);

    let orchestration: WorkflowRuntimeExecutionState = {
      changeId: input.changeId,
      steps: [],
      maxReworkAttempts: MAX_REWORK_ATTEMPTS,
    };

    const attempts: DefaultCodeChangeWorkflowAttempt[] = [];
    const initial = await this.runAttempt(memory, workflowRun, input, orchestration, "initial", undefined);
    workflowRun = initial.workflowRun;
    orchestration = initial.orchestration;
    attempts.push(initial.attempt);

    if (initial.terminal) {
      return this.finish(memory, workflowRun, initial.terminal, attempts, 0, orchestration);
    }

    if (!initial.reworkReason) {
      return this.finish(memory, workflowRun, { status: "completed" }, attempts, 0, orchestration);
    }

    workflowRun = await this.markRework(memory, workflowRun, initial.reworkReason);
    const reworkPrompt = [
      "Use the failed official validation/audit evidence from the previous attempt.",
      "Repair only the accepted demand in the assigned worktree.",
      "Do not change canonical planning artifacts.",
      input.prompt ?? "",
    ].join("\n\n");
    const rework = await this.runAttempt(memory, workflowRun, { ...input, prompt: reworkPrompt }, orchestration, "automatic-rework", initial.reworkReason);
    workflowRun = rework.workflowRun;
    orchestration = rework.orchestration;
    attempts.push(rework.attempt);

    if (rework.terminal) {
      return this.finish(memory, workflowRun, rework.terminal, attempts, 1, orchestration);
    }

    if (rework.reworkReason) {
      return this.finish(memory, workflowRun, {
        status: "needs-user-input",
        stoppedAt: rework.reworkReason.stoppedAt,
        reason: `${rework.reworkReason.nodeId} failed and rework budget is exhausted.`,
      }, attempts, 1, orchestration);
    }

    return this.finish(memory, workflowRun, { status: "completed" }, attempts, 1, orchestration);
  }

  private async runAttempt(
    memory: ResolvedMemory,
    workflowRun: DefaultCodeChangeWorkflowRun,
    input: DefaultCodeChangeWorkflowInput,
    orchestration: WorkflowRuntimeExecutionState,
    kind: "initial" | "automatic-rework",
    reworkReason: ReworkReason | undefined,
  ): Promise<AttemptRunResult> {
    const attempt: DefaultCodeChangeWorkflowAttempt = { kind };
    const codeNodeId: DefaultCodeChangeWorkflowNodeId = kind === "initial" ? "coder" : "rework-coder";
    const codeDecision = kind === "initial"
      ? coderDecision()
      : reworkDecision(reworkReason?.artifactRefs ?? []);

    workflowRun = await this.markNode(memory, workflowRun, codeNodeId, "running", { reason: codeDecision.reason });
    const codeResult = kind === "initial"
      ? await this.services.runCoder({
        project: input.project,
        memory,
        changeId: input.changeId,
        prompt: input.prompt,
        live: input.live,
        taskIds: input.taskIds,
        roleId: "coder-agent",
        orchestration,
        decision: codeDecision,
        executionGate: input.workflowGraphPlanId ? { mode: "workflow-graph", workflowGraphPlanId: input.workflowGraphPlanId } : undefined,
      })
      : await this.services.runReworkCoder({
        project: input.project,
        memory,
        changeId: input.changeId,
        prompt: input.prompt,
        live: input.live,
        orchestration,
        decision: codeDecision,
      });
    attempt.code = codeResult;
    orchestration = codeResult.orchestration;
    workflowRun = await this.markNodeFromCoder(memory, workflowRun, codeNodeId, codeResult);
    if (codeResult.status === "failed" || !codeResult.code) {
      return {
        workflowRun,
        orchestration,
        attempt,
        terminal: {
          status: "failed",
          stoppedAt: codeResult.stoppedAt ?? "code",
          reason: codeResult.error ?? "Coder failed before validation.",
        },
      };
    }

    const validationDecision = validatorDecision(compactArtifactRefs(codeResult.code.run.artifacts.directory, codeResult.code.run.artifacts.implementation));
    workflowRun = await this.markNode(memory, workflowRun, "validation", "running", { reason: validationDecision.reason });
    const validationResult = await this.services.runValidator({
      project: input.project,
      memory,
      changeId: input.changeId,
      live: input.live,
      orchestration,
      decision: validationDecision,
      code: codeResult.code,
    });
    attempt.validation = validationResult;
    orchestration = validationResult.orchestration;
    workflowRun = await this.markNodeFromValidation(memory, workflowRun, validationResult);
    if (validationResult.status === "failed") {
      return {
        workflowRun,
        orchestration,
        attempt,
        reworkReason: {
          nodeId: "validation",
          stoppedAt: "validation",
          artifactRefs: validationResult.validation
            ? compactArtifactRefs(validationResult.validation.run.artifacts.validation, validationResult.validation.run.artifacts.stderr)
            : [],
        },
      };
    }
    if (!validationResult.validation) {
      return {
        workflowRun,
        orchestration,
        attempt,
        terminal: { status: "failed", stoppedAt: "validation", reason: validationResult.error ?? "Validation failed before artifacts were created." },
      };
    }

    const auditDecision = auditorDecision(compactArtifactRefs(validationResult.validation.run.artifacts.validation, validationResult.validation.run.artifacts.stdout));
    workflowRun = await this.markNode(memory, workflowRun, "audit", "running", { reason: auditDecision.reason });
    const auditResult = await this.services.runAuditor({
      project: input.project,
      memory,
      changeId: input.changeId,
      live: input.live,
      orchestration,
      decision: auditDecision,
      code: codeResult.code,
      validation: validationResult.validation,
    });
    attempt.audit = auditResult;
    orchestration = auditResult.orchestration;
    workflowRun = await this.markNodeFromAudit(memory, workflowRun, auditResult);
    if (auditResult.status === "failed") {
      return {
        workflowRun,
        orchestration,
        attempt,
        reworkReason: {
          nodeId: "audit",
          stoppedAt: "audit",
          artifactRefs: auditResult.audit ? compactArtifactRefs(auditResult.audit.audit.artifacts.auditMarkdown, auditResult.audit.audit.artifacts.lastMessage) : [],
        },
      };
    }

    return { workflowRun, orchestration, attempt };
  }

  private async createRun(memory: ResolvedMemory, input: DefaultCodeChangeWorkflowInput): Promise<DefaultCodeChangeWorkflowRun> {
    const now = new Date().toISOString();
    const workflowRun: DefaultCodeChangeWorkflowRun = {
      version: "1.0",
      id: `workflow-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${input.changeId}:${DEFAULT_TEMPLATE_ID}:${now}`).slice(0, 8)}`,
      changeId: input.changeId,
      status: "created",
      source: DEFAULT_TEMPLATE_ID,
      templateId: DEFAULT_TEMPLATE_ID,
      nodes: ["coder", "validation", "audit", "rework-coder"].map((nodeId) => ({
        nodeId: nodeId as DefaultCodeChangeWorkflowNodeId,
        status: nodeId === "rework-coder" ? "skipped" : "queued",
        roleId: nodeRoleId(nodeId as DefaultCodeChangeWorkflowNodeId),
        attempt: nodeId === "rework-coder" ? 2 : 1,
        artifactRefs: [],
        updatedAt: now,
      })),
      maxReworkAttempts: MAX_REWORK_ATTEMPTS,
      reworkAttempts: 0,
      recoveryKey: {
        version: "1.0",
        changeId: input.changeId,
        templateId: DEFAULT_TEMPLATE_ID,
        workflowGraphPlanId: input.workflowGraphPlanId,
        policyHash: "tool-policy-gate:default-code-change-workflow:v0",
        capabilityHash: "local-runtime:default-code-change-workflow:v0",
        createdAt: now,
      },
      artifactRefs: [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    };
    const saved = await this.services.writeRun(memory, workflowRun);
    await this.services.appendEvent(memory, saved, "workflow.created", { data: { templateId: DEFAULT_TEMPLATE_ID, projectId: input.project.id } });
    return saved;
  }

  private async markWorkflowRunning(memory: ResolvedMemory, run: DefaultCodeChangeWorkflowRun): Promise<DefaultCodeChangeWorkflowRun> {
    const now = new Date().toISOString();
    return this.services.updateRun(memory, { ...run, status: "running", startedAt: run.startedAt ?? now, updatedAt: now });
  }

  private async markRework(memory: ResolvedMemory, run: DefaultCodeChangeWorkflowRun, reason: ReworkReason): Promise<DefaultCodeChangeWorkflowRun> {
    const now = new Date().toISOString();
    return this.services.updateRun(memory, {
      ...run,
      reworkAttempts: run.reworkAttempts + 1,
      nodes: run.nodes.map((node) => node.nodeId === "rework-coder"
        ? { ...node, status: "queued", reason: `Rework after ${reason.nodeId} failure.`, updatedAt: now }
        : node),
      updatedAt: now,
    });
  }

  private async markNode(
    memory: ResolvedMemory,
    run: DefaultCodeChangeWorkflowRun,
    nodeId: DefaultCodeChangeWorkflowNodeId,
    status: DefaultCodeChangeWorkflowNodeState["status"],
    details: Partial<DefaultCodeChangeWorkflowNodeState> = {},
  ): Promise<DefaultCodeChangeWorkflowRun> {
    const now = new Date().toISOString();
    const next: DefaultCodeChangeWorkflowRun = {
      ...run,
      currentNodeId: nodeId,
      status: run.status === "created" ? "running" : run.status,
      nodes: run.nodes.map((node) => node.nodeId === nodeId ? { ...node, ...details, status, updatedAt: now } : node),
      updatedAt: now,
      startedAt: run.startedAt ?? now,
    };
    const saved = await this.services.updateRun(memory, next);
    const eventType = status === "running" ? "node.started" : status === "blocked" ? "node.blocked" : status === "failed" ? "node.failed" : status === "completed" ? "node.completed" : undefined;
    if (eventType) {
      await this.services.appendEvent(memory, saved, eventType, { status, reason: details.reason, data: { nodeId } });
    }
    return saved;
  }

  private async markNodeFromCoder(memory: ResolvedMemory, run: DefaultCodeChangeWorkflowRun, nodeId: DefaultCodeChangeWorkflowNodeId, result: WorkflowRuntimeCoderLeafResult): Promise<DefaultCodeChangeWorkflowRun> {
    return this.markNode(memory, run, nodeId, result.status === "completed" ? "completed" : "failed", {
      runId: result.code?.run.id,
      worktreeId: result.code?.run.worktree?.worktreeId,
      artifactRefs: compactArtifactRefs(result.code?.run.artifacts.directory, result.code?.run.artifacts.implementation),
      failureClassification: result.status === "failed" ? (result.stoppedAt === "boundary" ? "boundary-violation" : "code-failure") : undefined,
      stoppedAt: result.stoppedAt,
      reason: result.error,
    });
  }

  private async markNodeFromValidation(memory: ResolvedMemory, run: DefaultCodeChangeWorkflowRun, result: WorkflowRuntimeValidatorLeafResult): Promise<DefaultCodeChangeWorkflowRun> {
    return this.markNode(memory, run, "validation", result.status === "completed" ? "completed" : "failed", {
      runId: result.validation?.run.id,
      validationId: result.validation?.validation.id,
      artifactRefs: compactArtifactRefs(result.validation?.run.artifacts.validation, result.validation?.run.artifacts.stdout, result.validation?.run.artifacts.stderr),
      failureClassification: result.status === "failed" ? "validation-failure" : undefined,
      stoppedAt: result.stoppedAt,
      reason: result.error,
    });
  }

  private async markNodeFromAudit(memory: ResolvedMemory, run: DefaultCodeChangeWorkflowRun, result: WorkflowRuntimeAuditorLeafResult): Promise<DefaultCodeChangeWorkflowRun> {
    return this.markNode(memory, run, "audit", result.status === "completed" ? "completed" : "failed", {
      runId: result.audit?.run.id,
      auditId: result.audit?.audit.id,
      artifactRefs: compactArtifactRefs(result.audit?.audit.artifacts.audit, result.audit?.audit.artifacts.auditMarkdown, result.audit?.audit.artifacts.lastMessage),
      failureClassification: result.status === "failed" ? "audit-failure" : undefined,
      stoppedAt: result.stoppedAt,
      reason: result.error,
    });
  }

  private async finish(
    memory: ResolvedMemory,
    run: DefaultCodeChangeWorkflowRun,
    terminal: TerminalResult,
    attempts: DefaultCodeChangeWorkflowAttempt[],
    reworkUsed: number,
    orchestration: WorkflowRuntimeExecutionState,
  ): Promise<DefaultCodeChangeWorkflowResult> {
    const now = new Date().toISOString();
    const status = terminal.status === "completed" ? "completed" : terminal.status === "failed" ? "failed" : "blocked";
    const workflowRun = await this.services.updateRun(memory, {
      ...run,
      status,
      statusReason: terminal.reason,
      currentNodeId: undefined,
      updatedAt: now,
      finishedAt: now,
      artifactRefs: unique([
        ...run.artifactRefs,
        ...attempts.flatMap((attempt) => [
          attempt.code?.code?.run.artifacts.directory,
          attempt.code?.code?.run.artifacts.implementation,
          attempt.validation?.validation?.run.artifacts.validation,
          attempt.audit?.audit?.audit.artifacts.auditMarkdown,
        ]),
      ]),
    });
    await this.services.appendEvent(memory, workflowRun, terminal.status === "completed" ? "workflow.completed" : terminal.status === "failed" ? "workflow.failed" : "workflow.blocked", {
      status: terminal.status,
      reason: terminal.reason,
    });
    const latest = latestAttemptArtifacts(attempts);
    return {
      status: terminal.status,
      attempts,
      reworkUsed,
      requiresUserInput: terminal.status !== "completed",
      stoppedAt: terminal.stoppedAt,
      code: latest.code,
      validation: latest.validation,
      audit: latest.audit,
      workflowRun,
      workflowRunId: workflowRun.id,
      orchestration,
    };
  }
}

export async function runDefaultCodeChangeWorkflow(input: DefaultCodeChangeWorkflowInput): Promise<DefaultCodeChangeWorkflowResult> {
  return new HarnessWorkflowRunEngine().runDefaultCodeChangeWorkflow(input);
}

interface ReworkReason {
  nodeId: "validation" | "audit";
  stoppedAt: "validation" | "audit";
  artifactRefs: string[];
}

interface TerminalResult {
  status: DefaultCodeChangeWorkflowStatus;
  stoppedAt?: "boundary" | "code" | "validation" | "audit";
  reason?: string;
}

interface AttemptRunResult {
  workflowRun: DefaultCodeChangeWorkflowRun;
  orchestration: WorkflowRuntimeExecutionState;
  attempt: DefaultCodeChangeWorkflowAttempt;
  terminal?: TerminalResult;
  reworkReason?: ReworkReason;
}

function coderDecision(): DelegateDecision<"coder-agent"> {
  return {
    kind: "delegate-role",
    roleId: "coder-agent",
    goal: "Implement the confirmed demand in an AHO-owned worktree.",
    inputArtifacts: [],
    reason: "Default code-change workflow starts with the implementation role.",
    attemptKind: "initial",
    nextRecommendation: "Run independent validation after coder-agent completes.",
  };
}

function reworkDecision(inputArtifacts: string[]): DelegateDecision<"rework-coder"> {
  return {
    kind: "delegate-role",
    roleId: "rework-coder",
    goal: "Repair implementation from validation or audit evidence.",
    inputArtifacts,
    reason: "Validation or audit failed and bounded rework budget is available.",
    attemptKind: "rework",
    nextRecommendation: "Run validation and audit again after rework-coder completes.",
  };
}

function validatorDecision(inputArtifacts: string[]): DelegateDecision<"validator"> {
  return {
    kind: "delegate-role",
    roleId: "validator",
    goal: "Run independent mechanical validation for the coder worktree.",
    inputArtifacts,
    reason: "Coder produced a completed worktree proposal.",
    attemptKind: "follow-up",
    nextRecommendation: "Run auditor-agent after validation passes.",
  };
}

function auditorDecision(inputArtifacts: string[]): DelegateDecision<"auditor-agent"> {
  return {
    kind: "delegate-role",
    roleId: "auditor-agent",
    goal: "Run independent semantic audit for the validated worktree.",
    inputArtifacts,
    reason: "Independent validation passed.",
    attemptKind: "follow-up",
    nextRecommendation: "Show result review and apply handoff if audit accepts.",
  };
}

function nodeRoleId(nodeId: DefaultCodeChangeWorkflowNodeId): DefaultCodeChangeWorkflowNodeState["roleId"] {
  if (nodeId === "coder") return "coder-agent";
  if (nodeId === "validation") return "validator";
  if (nodeId === "audit") return "auditor-agent";
  return "rework-coder";
}

function latestAttemptArtifacts(attempts: DefaultCodeChangeWorkflowAttempt[]): { code?: CodeLeafRun; validation?: ValidationLeafRun; audit?: AuditLeafRun } {
  for (const attempt of attempts.slice().reverse()) {
    if (attempt.code?.code) {
      return {
        code: attempt.code.code,
        validation: attempt.validation?.validation,
        audit: attempt.audit?.audit,
      };
    }
  }
  return {};
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
