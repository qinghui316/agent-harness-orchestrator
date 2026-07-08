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
  appendMainAgentLoopEvent,
  ensureMainAgentLoopRun,
  finishMainAgentLoopRun,
  type MainAgentLoopEvent,
  type MainAgentLoopRun,
} from "../main-agent-orchestration/loop-evidence.js";
import {
  recordMainAgentNextStepEvidence,
  type MainAgentNextStepEvidenceRefs,
  type MainAgentNextStepObservationSummary,
  type MainAgentNextStepTargetRefs,
} from "../main-agent-orchestration/next-step-evidence.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { compactArtifactRefs } from "./kernel/runtime-guards.js";

export interface PrFeedbackReworkWorkflowInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
}

export interface WorkflowRuntimeLiveSink {
  emit(event: unknown): void;
  isClosed?(): boolean;
}

export interface PrFeedbackReworkWorkflowResult {
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

const ENTRYPOINT = "feedback-rework" as const;

export async function runPrFeedbackReworkWorkflow(input: PrFeedbackReworkWorkflowInput): Promise<PrFeedbackReworkWorkflowResult> {
  const memory = await resolveProjectMemory(input.project);
  const { run: loopRun, created } = await ensureMainAgentLoopRun(memory, {
    changeId: input.changeId,
    projectId: input.project.id,
    entrypoint: ENTRYPOINT,
  });
  if (created) {
    await appendMainAgentLoopEvent(memory, loopRun, {
      type: "loop.started",
      entrypoint: ENTRYPOINT,
      summary: "PR feedback rework runtime loop started.",
    });
  }

  let orchestration = createMainAgentOrchestrationState({ changeId: input.changeId });
  let stepIndex = 0;

  const reworkDecision = delegateReworkDecision([]);
  await recordDecision(memory, loopRun, stepIndex, orchestration, reworkDecision, {});
  await appendLeafStarted(memory, loopRun, stepIndex, reworkDecision);
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
  await appendLeafCompleted(memory, loopRun, stepIndex, reworkDecision, rework.status, rework.stoppedAt ?? null, rework.error, refsFromCoder(rework), artifactsFromCoder(rework));
  if (rework.status === "failed" || !rework.code) {
    const stoppedAt = rework.stoppedAt ?? "code";
    const decision = terminalDecisionForCodeFailure(stoppedAt, rework.error);
    await recordDecision(memory, loopRun, stepIndex + 1, orchestration, decision, {
      artifacts: artifactsFromCoder(rework),
      refs: refsFromCoder(rework),
      targets: targetsFromCoder(rework),
    });
    await finishMainAgentLoopRun(memory, loopRun.id, {
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
  const validationDecision = delegateValidatorDecision(compactArtifactRefs(rework.code.run.artifacts.directory, rework.code.run.artifacts.implementation));
  await recordDecision(memory, loopRun, stepIndex, orchestration, validationDecision, {
    artifacts: artifactsFromCoder(rework),
    refs: refsFromCoder(rework),
    targets: targetsFromCoder(rework),
  });
  await appendLeafStarted(memory, loopRun, stepIndex, validationDecision);
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
  await appendLeafCompleted(memory, loopRun, stepIndex, validationDecision, validation.status, validation.stoppedAt ?? null, validation.error, refsFromValidation(rework, validation), artifactsFromValidation(rework, validation));
  if (validation.status === "failed" || !validation.validation) {
    const decision = terminalNeedsUserInput("validation", validation.error ?? "Validation failed during PR feedback rework.");
    await recordDecision(memory, loopRun, stepIndex + 1, orchestration, decision, {
      artifacts: artifactsFromValidation(rework, validation),
      refs: refsFromValidation(rework, validation),
      targets: targetsFromValidation(rework, validation),
    });
    await finishMainAgentLoopRun(memory, loopRun.id, {
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
  const auditDecision = delegateAuditorDecision(compactArtifactRefs(validation.validation.run.artifacts.validation, validation.validation.run.artifacts.stdout));
  await recordDecision(memory, loopRun, stepIndex, orchestration, auditDecision, {
    artifacts: artifactsFromValidation(rework, validation),
    refs: refsFromValidation(rework, validation),
    targets: targetsFromValidation(rework, validation),
  });
  await appendLeafStarted(memory, loopRun, stepIndex, auditDecision);
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
  await appendLeafCompleted(memory, loopRun, stepIndex, auditDecision, audit.status, audit.stoppedAt ?? null, audit.error, refsFromAudit(rework, validation, audit), artifactsFromAudit(rework, validation, audit));
  if (audit.status === "failed" || !audit.audit) {
    const decision = terminalNeedsUserInput("audit", audit.error ?? "Audit failed during PR feedback rework.");
    await recordDecision(memory, loopRun, stepIndex + 1, orchestration, decision, {
      artifacts: artifactsFromAudit(rework, validation, audit),
      refs: refsFromAudit(rework, validation, audit),
      targets: targetsFromAudit(rework, validation, audit),
    });
    await finishMainAgentLoopRun(memory, loopRun.id, {
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
    reason: "PR feedback rework completed validation and audit.",
    nextRecommendation: "Prepare a fresh landing review before updating the Draft PR.",
  };
  await recordDecision(memory, loopRun, stepIndex + 1, orchestration, completedDecision, {
    artifacts: artifactsFromAudit(rework, validation, audit),
    refs: refsFromAudit(rework, validation, audit),
    targets: targetsFromAudit(rework, validation, audit),
  });
  await finishMainAgentLoopRun(memory, loopRun.id, {
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
  loopRun: MainAgentLoopRun,
  stepIndex: number,
  orchestration: MainAgentOrchestrationState,
  decision: MainAgentOrchestrationDecision,
  input: {
    artifacts?: string[];
    refs?: Partial<MainAgentNextStepEvidenceRefs>;
    targets?: Partial<MainAgentNextStepTargetRefs>;
  },
): Promise<void> {
  await appendMainAgentLoopEvent(memory, loopRun, {
    type: "observation.recorded",
    stepIndex,
    entrypoint: ENTRYPOINT,
    summary: observationSummary(orchestration).summary,
    artifactRefs: input.artifacts,
    refs: input.refs,
  });
  const evidence = await recordMainAgentNextStepEvidence(memory, loopRun, {
    stepIndex,
    entrypoint: ENTRYPOINT,
    observation: observationSummary(orchestration),
    decision,
    artifactRefs: input.artifacts,
    refs: input.refs,
    targetRefs: input.targets,
  });
  await appendMainAgentLoopEvent(memory, loopRun, {
    type: "decision.recorded",
    stepIndex,
    entrypoint: ENTRYPOINT,
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
  loopRun: MainAgentLoopRun,
  stepIndex: number,
  decision: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
): Promise<void> {
  await appendMainAgentLoopEvent(memory, loopRun, {
    type: "leaf.started",
    stepIndex,
    entrypoint: ENTRYPOINT,
    roleId: decision.roleId,
    attemptKind: decision.attemptKind,
    reason: decision.reason,
    summary: `PR feedback rework delegated ${decision.roleId}.`,
    artifactRefs: decision.inputArtifacts,
  });
}

async function appendLeafCompleted(
  memory: ResolvedMemory,
  loopRun: MainAgentLoopRun,
  stepIndex: number,
  decision: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
  status: "completed" | "failed",
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null,
  reason: string | undefined,
  refs: Partial<MainAgentLoopEvent["refs"]>,
  artifactRefs: string[],
): Promise<void> {
  await appendMainAgentLoopEvent(memory, loopRun, {
    type: "leaf.completed",
    stepIndex,
    entrypoint: ENTRYPOINT,
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

function observationSummary(orchestration: MainAgentOrchestrationState): MainAgentNextStepObservationSummary {
  const latest = orchestration.steps.at(-1);
  const completedSteps = orchestration.steps.filter((step) => step.status === "completed").length;
  const failedSteps = orchestration.steps.filter((step) => step.status === "failed").length;
  return {
    summary: latest
      ? `PR feedback rework has ${completedSteps} completed step(s) and ${failedSteps} failed step(s); latest ${latest.roleId} ${latest.status}.`
      : "PR feedback rework has no role evidence yet.",
    totalSteps: orchestration.steps.length,
    completedSteps,
    failedSteps,
    latestRoleId: latest?.roleId ?? null,
    latestStatus: latest?.status ?? null,
  };
}

function delegateReworkDecision(inputArtifacts: string[]): Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "rework-coder" } {
  return {
    kind: "delegate-role",
    roleId: "rework-coder",
    goal: "Revise the same demand result according to remote Draft PR feedback.",
    inputArtifacts,
    reason: "Remote PR feedback requires a same-demand rework attempt.",
    attemptKind: "rework",
    nextRecommendation: "Run validation and audit after rework-coder completes.",
  };
}

function delegateValidatorDecision(inputArtifacts: string[]): Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "validator" } {
  return {
    kind: "delegate-role",
    roleId: "validator",
    goal: "Run independent mechanical validation for the PR feedback rework result.",
    inputArtifacts,
    reason: "PR feedback rework produced a completed worktree proposal.",
    attemptKind: "follow-up",
    nextRecommendation: "Run auditor-agent after validation passes.",
  };
}

function delegateAuditorDecision(inputArtifacts: string[]): Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "auditor-agent" } {
  return {
    kind: "delegate-role",
    roleId: "auditor-agent",
    goal: "Run independent semantic audit for the validated PR feedback rework result.",
    inputArtifacts,
    reason: "Independent validation passed.",
    attemptKind: "follow-up",
    nextRecommendation: "Prepare a fresh landing review if audit accepts.",
  };
}

function terminalDecisionForCodeFailure(stoppedAt: "boundary" | "code" | "validation" | "audit", reason: string | undefined): MainAgentOrchestrationDecision {
  if (stoppedAt === "boundary" || stoppedAt === "code") {
    return {
      kind: "failed",
      stoppedAt,
      reason: reason ?? "PR feedback rework did not produce a completed worktree proposal.",
      nextRecommendation: "Surface the failure evidence to the user.",
    };
  }
  return terminalNeedsUserInput(stoppedAt, reason ?? "PR feedback rework stopped before completion.");
}

function terminalNeedsUserInput(stoppedAt: "boundary" | "code" | "validation" | "audit", reason: string): MainAgentOrchestrationDecision {
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

function refsFromCoder(result: MainAgentCoderLeafResult): Partial<MainAgentNextStepEvidenceRefs & MainAgentLoopEvent["refs"]> {
  return {
    runIds: compactArtifactRefs(result.code?.run.id),
  };
}

function refsFromValidation(coder: MainAgentCoderLeafResult, validation: MainAgentValidatorLeafResult): Partial<MainAgentNextStepEvidenceRefs & MainAgentLoopEvent["refs"]> {
  return {
    runIds: compactArtifactRefs(coder.code?.run.id, validation.validation?.run.id),
    validationIds: compactArtifactRefs(validation.validation?.validation.id),
  };
}

function refsFromAudit(coder: MainAgentCoderLeafResult, validation: MainAgentValidatorLeafResult, audit: MainAgentAuditorLeafResult): Partial<MainAgentNextStepEvidenceRefs & MainAgentLoopEvent["refs"]> {
  return {
    runIds: compactArtifactRefs(coder.code?.run.id, validation.validation?.run.id, audit.audit?.run.id),
    validationIds: compactArtifactRefs(validation.validation?.validation.id),
    auditIds: compactArtifactRefs(audit.audit?.audit.id),
  };
}

function targetsFromCoder(result: MainAgentCoderLeafResult): Partial<MainAgentNextStepTargetRefs> {
  return {
    worktreeIds: compactArtifactRefs(result.code?.run.worktree?.worktreeId),
    runIds: compactArtifactRefs(result.code?.run.id),
  };
}

function targetsFromValidation(coder: MainAgentCoderLeafResult, validation: MainAgentValidatorLeafResult): Partial<MainAgentNextStepTargetRefs> {
  return {
    worktreeIds: compactArtifactRefs(coder.code?.run.worktree?.worktreeId),
    runIds: compactArtifactRefs(coder.code?.run.id, validation.validation?.run.id),
    validationIds: compactArtifactRefs(validation.validation?.validation.id),
  };
}

function targetsFromAudit(coder: MainAgentCoderLeafResult, validation: MainAgentValidatorLeafResult, audit: MainAgentAuditorLeafResult): Partial<MainAgentNextStepTargetRefs> {
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
