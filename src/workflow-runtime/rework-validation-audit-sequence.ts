import {
  createMainAgentOrchestrationState,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import {
  type AuditLeafRun,
  type CodeLeafRun,
  type MainAgentAuditorLeafResult,
  type MainAgentCoderLeafResult,
  type MainAgentValidatorLeafResult,
  runAuditorLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
  type ValidationLeafRun,
} from "../main-agent-orchestration/leaf-stages.js";
import {
  appendWorkflowRuntimeEvidenceEvent,
  ensureWorkflowRuntimeEvidenceRun,
  finishWorkflowRuntimeEvidenceRun,
  recordWorkflowRuntimeDecisionEvidence,
  type WorkflowRuntimeDecisionEvidenceRefs,
  type WorkflowRuntimeDecisionObservationSummary,
  type WorkflowRuntimeDecisionTargetRefs,
  type WorkflowRuntimeEvidenceEntrypoint,
  type WorkflowRuntimeEvidenceEvent,
  type WorkflowRuntimeEvidenceRun,
} from "./evidence-journal.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { compactArtifactRefs } from "./kernel/runtime-guards.js";

export interface WorkflowRuntimeLiveSink {
  emit(event: unknown): void;
  isClosed?(): boolean;
}

export interface ReworkValidationAuditSequenceInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  config: ReworkValidationAuditSequenceConfig;
}

export interface ReworkValidationAuditSequenceConfig {
  entrypoint: Extract<WorkflowRuntimeEvidenceEntrypoint, "source-refresh-rework" | "feedback-rework">;
  loopStartedSummary: string;
  observationEmptySummary: string;
  observationProgressPrefix: string;
  leafStartedSummaryPrefix: string;
  rework: ReworkValidationAuditDelegateText;
  validation: ReworkValidationAuditDelegateText & {
    failureSummary: string;
  };
  audit: ReworkValidationAuditDelegateText & {
    failureSummary: string;
  };
  codeFailureSummary: string;
  stoppedSummary: string;
  completedReason: string;
  completedNextRecommendation: string;
}

export interface ReworkValidationAuditDelegateText {
  goal: string;
  reason: string;
  nextRecommendation: string;
}

export interface ReworkValidationAuditSequenceResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  status?: "failed" | "needs-user-input";
  error?: string;
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  boundaryAudit?: unknown;
  orchestration: MainAgentOrchestrationState;
  loopRunId: string;
}

export async function runReworkValidationAuditSequence(
  input: ReworkValidationAuditSequenceInput,
): Promise<ReworkValidationAuditSequenceResult> {
  const memory = await resolveProjectMemory(input.project);
  const { run: loopRun, created } = await ensureWorkflowRuntimeEvidenceRun(memory, {
    changeId: input.changeId,
    projectId: input.project.id,
    entrypoint: input.config.entrypoint,
  });
  if (created) {
    await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
      type: "runtime.started",
      entrypoint: input.config.entrypoint,
      summary: input.config.loopStartedSummary,
    });
  }

  let orchestration = createMainAgentOrchestrationState({ changeId: input.changeId });
  let stepIndex = 0;

  const reworkDecision = delegateReworkDecision(input.config, []);
  await recordDecision(memory, loopRun, stepIndex, orchestration, reworkDecision, {}, input.config);
  await appendLeafStarted(memory, loopRun, stepIndex, reworkDecision, input.config);
  const rework = await runReworkCoderLeafStage({
    project: input.project,
    memory,
    changeId: input.changeId,
    prompt: input.prompt,
    live: input.live,
    orchestration,
    decision: reworkDecision,
  });
  orchestration = rework.orchestration;
  await appendLeafCompleted(
    memory,
    loopRun,
    stepIndex,
    reworkDecision,
    rework.status,
    rework.stoppedAt ?? null,
    rework.error,
    refsFromCoder(rework),
    artifactsFromCoder(rework),
    input.config,
  );
  if (rework.status === "failed" || !rework.code) {
    const stoppedAt = rework.stoppedAt ?? "code";
    const decision = terminalDecisionForCodeFailure(input.config, stoppedAt, rework.error);
    await recordDecision(memory, loopRun, stepIndex + 1, orchestration, decision, {
      artifacts: artifactsFromCoder(rework),
      refs: refsFromCoder(rework),
      targets: targetsFromCoder(rework),
    }, input.config);
    await finishWorkflowRuntimeEvidenceRun(memory, loopRun, {
      status: "stopped",
      summary: decision.reason,
      stoppedAt,
      artifactRefs: artifactsFromCoder(rework),
      refs: refsFromCoder(rework),
    });
    return {
      code: rework.code,
      status: "failed",
      error: rework.error,
      stoppedAt,
      boundaryAudit: rework.boundaryAudit,
      orchestration,
      loopRunId: loopRun.id,
    };
  }

  stepIndex += 1;
  const validationDecision = delegateValidatorDecision(
    input.config,
    compactArtifactRefs(rework.code.run.artifacts.directory, rework.code.run.artifacts.implementation),
  );
  await recordDecision(memory, loopRun, stepIndex, orchestration, validationDecision, {
    artifacts: artifactsFromCoder(rework),
    refs: refsFromCoder(rework),
    targets: targetsFromCoder(rework),
  }, input.config);
  await appendLeafStarted(memory, loopRun, stepIndex, validationDecision, input.config);
  const validation = await runValidatorLeafStage({
    project: input.project,
    memory,
    changeId: input.changeId,
    live: input.live,
    orchestration,
    decision: validationDecision,
    code: rework.code,
  });
  orchestration = validation.orchestration;
  await appendLeafCompleted(
    memory,
    loopRun,
    stepIndex,
    validationDecision,
    validation.status,
    validation.stoppedAt ?? null,
    validation.error,
    refsFromValidation(rework, validation),
    artifactsFromValidation(rework, validation),
    input.config,
  );
  if (validation.status === "failed" || !validation.validation) {
    const decision = terminalNeedsUserInput(input.config, "validation", validation.error ?? input.config.validation.failureSummary);
    await recordDecision(memory, loopRun, stepIndex + 1, orchestration, decision, {
      artifacts: artifactsFromValidation(rework, validation),
      refs: refsFromValidation(rework, validation),
      targets: targetsFromValidation(rework, validation),
    }, input.config);
    await finishWorkflowRuntimeEvidenceRun(memory, loopRun, {
      status: "stopped",
      summary: decision.reason,
      stoppedAt: "validation",
      artifactRefs: artifactsFromValidation(rework, validation),
      refs: refsFromValidation(rework, validation),
    });
    return {
      code: rework.code,
      validation: validation.validation,
      status: validation.error ? "failed" : "needs-user-input",
      error: validation.error,
      stoppedAt: "validation",
      orchestration,
      loopRunId: loopRun.id,
    };
  }

  stepIndex += 1;
  const auditDecision = delegateAuditorDecision(
    input.config,
    compactArtifactRefs(validation.validation.run.artifacts.validation, validation.validation.run.artifacts.stdout),
  );
  await recordDecision(memory, loopRun, stepIndex, orchestration, auditDecision, {
    artifacts: artifactsFromValidation(rework, validation),
    refs: refsFromValidation(rework, validation),
    targets: targetsFromValidation(rework, validation),
  }, input.config);
  await appendLeafStarted(memory, loopRun, stepIndex, auditDecision, input.config);
  const audit = await runAuditorLeafStage({
    project: input.project,
    memory,
    changeId: input.changeId,
    live: input.live,
    orchestration,
    decision: auditDecision,
    code: rework.code,
    validation: validation.validation,
  });
  orchestration = audit.orchestration;
  await appendLeafCompleted(
    memory,
    loopRun,
    stepIndex,
    auditDecision,
    audit.status,
    audit.stoppedAt ?? null,
    audit.error,
    refsFromAudit(rework, validation, audit),
    artifactsFromAudit(rework, validation, audit),
    input.config,
  );
  if (audit.status === "failed" || !audit.audit) {
    const decision = terminalNeedsUserInput(input.config, "audit", audit.error ?? input.config.audit.failureSummary);
    await recordDecision(memory, loopRun, stepIndex + 1, orchestration, decision, {
      artifacts: artifactsFromAudit(rework, validation, audit),
      refs: refsFromAudit(rework, validation, audit),
      targets: targetsFromAudit(rework, validation, audit),
    }, input.config);
    await finishWorkflowRuntimeEvidenceRun(memory, loopRun, {
      status: "stopped",
      summary: decision.reason,
      stoppedAt: "audit",
      artifactRefs: artifactsFromAudit(rework, validation, audit),
      refs: refsFromAudit(rework, validation, audit),
    });
    return {
      code: rework.code,
      validation: validation.validation,
      audit: audit.audit,
      status: audit.error ? "failed" : "needs-user-input",
      error: audit.error,
      stoppedAt: "audit",
      orchestration,
      loopRunId: loopRun.id,
    };
  }

  const completedDecision: MainAgentOrchestrationDecision = {
    kind: "completed",
    reason: input.config.completedReason,
    nextRecommendation: input.config.completedNextRecommendation,
  };
  await recordDecision(memory, loopRun, stepIndex + 1, orchestration, completedDecision, {
    artifacts: artifactsFromAudit(rework, validation, audit),
    refs: refsFromAudit(rework, validation, audit),
    targets: targetsFromAudit(rework, validation, audit),
  }, input.config);
  await finishWorkflowRuntimeEvidenceRun(memory, loopRun, {
    status: "completed",
    summary: completedDecision.reason,
    stoppedAt: null,
    artifactRefs: artifactsFromAudit(rework, validation, audit),
    refs: refsFromAudit(rework, validation, audit),
  });
  return {
    code: rework.code,
    validation: validation.validation,
    audit: audit.audit,
    stoppedAt: null,
    orchestration,
    loopRunId: loopRun.id,
  };
}

async function recordDecision(
  memory: ResolvedMemory,
  loopRun: WorkflowRuntimeEvidenceRun,
  stepIndex: number,
  orchestration: MainAgentOrchestrationState,
  decision: MainAgentOrchestrationDecision,
  input: {
    artifacts?: string[];
    refs?: Partial<WorkflowRuntimeDecisionEvidenceRefs>;
    targets?: Partial<WorkflowRuntimeDecisionTargetRefs>;
  },
  config: ReworkValidationAuditSequenceConfig,
): Promise<void> {
  await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
    type: "observation.recorded",
    stepIndex,
    entrypoint: config.entrypoint,
    summary: observationSummary(orchestration, config).summary,
    artifactRefs: input.artifacts,
    refs: input.refs,
  });
  const evidence = await recordWorkflowRuntimeDecisionEvidence(memory, loopRun, {
    stepIndex,
    entrypoint: config.entrypoint,
    observation: observationSummary(orchestration, config),
    decision,
    artifactRefs: input.artifacts,
    refs: input.refs,
    targetRefs: input.targets,
  });
  await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
    type: "decision.recorded",
    stepIndex,
    entrypoint: config.entrypoint,
    decisionKind: decision.kind,
    roleId: decision.kind === "delegate-role" ? decision.roleId : undefined,
    attemptKind: decision.kind === "delegate-role" ? decision.attemptKind : undefined,
    stoppedAt: decision.kind === "failed" || decision.kind === "needs-user-input" ? decision.stoppedAt : undefined,
    reason: "reason" in decision ? decision.reason : undefined,
    decisionEvidenceId: evidence.id,
    decisionEvidenceRef: evidence.ref,
    summary: summarizeDecision(decision),
    artifactRefs: input.artifacts,
    refs: input.refs,
  });
}

async function appendLeafStarted(
  memory: ResolvedMemory,
  loopRun: WorkflowRuntimeEvidenceRun,
  stepIndex: number,
  decision: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
  config: ReworkValidationAuditSequenceConfig,
): Promise<void> {
  await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
    type: "leaf.started",
    stepIndex,
    entrypoint: config.entrypoint,
    roleId: decision.roleId,
    attemptKind: decision.attemptKind,
    reason: decision.reason,
    summary: `${config.leafStartedSummaryPrefix} delegated ${decision.roleId}.`,
    artifactRefs: decision.inputArtifacts,
  });
}

async function appendLeafCompleted(
  memory: ResolvedMemory,
  loopRun: WorkflowRuntimeEvidenceRun,
  stepIndex: number,
  decision: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
  status: "completed" | "failed",
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null,
  reason: string | undefined,
  refs: Partial<WorkflowRuntimeEvidenceEvent["refs"]>,
  artifactRefs: string[],
  config: ReworkValidationAuditSequenceConfig,
): Promise<void> {
  await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
    type: "leaf.completed",
    stepIndex,
    entrypoint: config.entrypoint,
    roleId: decision.roleId,
    attemptKind: decision.attemptKind,
    status,
    stoppedAt,
    reason,
    summary: `${decision.roleId} ${status}.`,
    artifactRefs,
    refs,
  });
}

function observationSummary(
  orchestration: MainAgentOrchestrationState,
  config: ReworkValidationAuditSequenceConfig,
): WorkflowRuntimeDecisionObservationSummary {
  const latest = orchestration.steps.at(-1);
  const completedSteps = orchestration.steps.filter((step) => step.status === "completed").length;
  const failedSteps = orchestration.steps.filter((step) => step.status === "failed").length;
  return {
    summary: latest
      ? `${config.observationProgressPrefix} has ${completedSteps} completed step(s) and ${failedSteps} failed step(s); latest ${latest.roleId} ${latest.status}.`
      : config.observationEmptySummary,
    totalSteps: orchestration.steps.length,
    completedSteps,
    failedSteps,
    latestRoleId: latest?.roleId ?? null,
    latestStatus: latest?.status ?? null,
  };
}

function delegateReworkDecision(
  config: ReworkValidationAuditSequenceConfig,
  inputArtifacts: string[],
): Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "rework-coder" } {
  return {
    kind: "delegate-role",
    roleId: "rework-coder",
    goal: config.rework.goal,
    inputArtifacts,
    reason: config.rework.reason,
    attemptKind: "rework",
    nextRecommendation: config.rework.nextRecommendation,
  };
}

function delegateValidatorDecision(
  config: ReworkValidationAuditSequenceConfig,
  inputArtifacts: string[],
): Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "validator" } {
  return {
    kind: "delegate-role",
    roleId: "validator",
    goal: config.validation.goal,
    inputArtifacts,
    reason: config.validation.reason,
    attemptKind: "follow-up",
    nextRecommendation: config.validation.nextRecommendation,
  };
}

function delegateAuditorDecision(
  config: ReworkValidationAuditSequenceConfig,
  inputArtifacts: string[],
): Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "auditor-agent" } {
  return {
    kind: "delegate-role",
    roleId: "auditor-agent",
    goal: config.audit.goal,
    inputArtifacts,
    reason: config.audit.reason,
    attemptKind: "follow-up",
    nextRecommendation: config.audit.nextRecommendation,
  };
}

function terminalDecisionForCodeFailure(
  config: ReworkValidationAuditSequenceConfig,
  stoppedAt: "boundary" | "code" | "validation" | "audit",
  reason: string | undefined,
): MainAgentOrchestrationDecision {
  if (stoppedAt === "boundary" || stoppedAt === "code") {
    return {
      kind: "failed",
      stoppedAt,
      reason: reason ?? config.codeFailureSummary,
      nextRecommendation: "Surface the failure evidence to the user.",
    };
  }
  return terminalNeedsUserInput(config, stoppedAt, reason ?? config.stoppedSummary);
}

function terminalNeedsUserInput(
  _config: ReworkValidationAuditSequenceConfig,
  stoppedAt: "boundary" | "code" | "validation" | "audit",
  reason: string,
): MainAgentOrchestrationDecision {
  return {
    kind: "needs-user-input",
    stoppedAt,
    reason,
    nextRecommendation: "Ask the user for clarification, acceptance changes, or explicit next action.",
  };
}

function artifactsFromCoder(result: MainAgentCoderLeafResult): string[] {
  return compactArtifactRefs(result.code?.run.artifacts.directory, result.code?.run.artifacts.implementation);
}

function artifactsFromValidation(coder: MainAgentCoderLeafResult, validation: MainAgentValidatorLeafResult): string[] {
  return compactArtifactRefs(
    ...artifactsFromCoder(coder),
    validation.validation?.run.artifacts.validation,
    validation.validation?.run.artifacts.stdout,
    validation.validation?.run.artifacts.stderr,
  );
}

function artifactsFromAudit(coder: MainAgentCoderLeafResult, validation: MainAgentValidatorLeafResult, audit: MainAgentAuditorLeafResult): string[] {
  return compactArtifactRefs(
    ...artifactsFromValidation(coder, validation),
    audit.audit?.audit.artifacts.audit,
    audit.audit?.audit.artifacts.auditMarkdown,
    audit.audit?.audit.artifacts.lastMessage,
  );
}

function refsFromCoder(result: MainAgentCoderLeafResult): Partial<WorkflowRuntimeDecisionEvidenceRefs & WorkflowRuntimeEvidenceEvent["refs"]> {
  return {
    runIds: compactArtifactRefs(result.code?.run.id),
  };
}

function refsFromValidation(
  coder: MainAgentCoderLeafResult,
  validation: MainAgentValidatorLeafResult,
): Partial<WorkflowRuntimeDecisionEvidenceRefs & WorkflowRuntimeEvidenceEvent["refs"]> {
  return {
    runIds: compactArtifactRefs(coder.code?.run.id, validation.validation?.run.id),
    validationIds: compactArtifactRefs(validation.validation?.validation.id),
  };
}

function refsFromAudit(
  coder: MainAgentCoderLeafResult,
  validation: MainAgentValidatorLeafResult,
  audit: MainAgentAuditorLeafResult,
): Partial<WorkflowRuntimeDecisionEvidenceRefs & WorkflowRuntimeEvidenceEvent["refs"]> {
  return {
    runIds: compactArtifactRefs(coder.code?.run.id, validation.validation?.run.id, audit.audit?.run.id),
    validationIds: compactArtifactRefs(validation.validation?.validation.id),
    auditIds: compactArtifactRefs(audit.audit?.audit.id),
  };
}

function targetsFromCoder(result: MainAgentCoderLeafResult): Partial<WorkflowRuntimeDecisionTargetRefs> {
  return {
    worktreeIds: compactArtifactRefs(result.code?.run.worktree?.worktreeId),
    runIds: compactArtifactRefs(result.code?.run.id),
  };
}

function targetsFromValidation(
  coder: MainAgentCoderLeafResult,
  validation: MainAgentValidatorLeafResult,
): Partial<WorkflowRuntimeDecisionTargetRefs> {
  return {
    worktreeIds: compactArtifactRefs(coder.code?.run.worktree?.worktreeId),
    runIds: compactArtifactRefs(coder.code?.run.id, validation.validation?.run.id),
    validationIds: compactArtifactRefs(validation.validation?.validation.id),
  };
}

function targetsFromAudit(
  coder: MainAgentCoderLeafResult,
  validation: MainAgentValidatorLeafResult,
  audit: MainAgentAuditorLeafResult,
): Partial<WorkflowRuntimeDecisionTargetRefs> {
  return {
    worktreeIds: compactArtifactRefs(coder.code?.run.worktree?.worktreeId),
    runIds: compactArtifactRefs(coder.code?.run.id, validation.validation?.run.id, audit.audit?.run.id),
    validationIds: compactArtifactRefs(validation.validation?.validation.id),
    auditIds: compactArtifactRefs(audit.audit?.audit.id),
  };
}

function summarizeDecision(decision: MainAgentOrchestrationDecision): string {
  if (decision.kind === "delegate-role") return `Delegate ${decision.roleId}: ${decision.reason}`;
  return decision.reason;
}
