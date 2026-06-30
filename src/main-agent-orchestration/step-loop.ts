import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import type { WorkbenchLiveSink } from "../workbench/types.js";
import {
  appendMainAgentLoopEvent,
  ensureMainAgentLoopRun,
  finishMainAgentLoopRun,
  type MainAgentLoopRun,
} from "./loop-evidence.js";
import {
  recordMainAgentNextStepEvidence,
  type MainAgentNextStepObservationSummary,
  type MainAgentNextStepTargetRefs,
} from "./next-step-evidence.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
  type AuditLeafRun,
  type CodeLeafRun,
  type ValidationLeafRun,
} from "./leaf-stages.js";

export interface MainAgentLeafAttemptResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  status?: "failed" | "needs-user-input";
  error?: string;
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  boundaryAudit?: unknown;
  orchestration: MainAgentOrchestrationState;
  loopRunId?: string;
}

export interface MainAgentObservation {
  orchestration: MainAgentOrchestrationState;
  latestCode?: CodeLeafRun;
  latestValidation?: ValidationLeafRun;
  latestAudit?: AuditLeafRun;
  entrypoint: "top-level" | "task-run" | "source-refresh-rework" | "feedback-rework";
}

export type MainAgentStepDecision = MainAgentOrchestrationDecision;

export interface MainAgentLeafStep {
  roleId: MainAgentOrchestrationRole;
  decision: Extract<MainAgentStepDecision, { kind: "delegate-role" }>;
}

export interface MainAgentLeafStepResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  status: "completed" | "failed" | "needs-user-input";
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  error?: string;
  boundaryAudit?: unknown;
  orchestration: MainAgentOrchestrationState;
}

export interface RunMainAgentStepLoopInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  taskIds?: string[];
  taskRunId?: string;
  entrypoint: MainAgentObservation["entrypoint"];
  initialRole?: MainAgentOrchestrationRole;
  orchestrationState?: MainAgentOrchestrationState;
  initialDecision?: Extract<MainAgentStepDecision, { kind: "delegate-role" }>;
  executionGate?: CodeExecutionGateOptions;
  loopRunId?: string;
  finalizeLoop?: boolean;
}

export function observeOrchestrationState(input: {
  orchestration: MainAgentOrchestrationState;
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  entrypoint: MainAgentObservation["entrypoint"];
}): MainAgentObservation {
  return {
    orchestration: input.orchestration,
    latestCode: input.code,
    latestValidation: input.validation,
    latestAudit: input.audit,
    entrypoint: input.entrypoint,
  };
}

export function decideNextOrchestrationStep(
  observation: MainAgentObservation,
  initialDecision?: Extract<MainAgentStepDecision, { kind: "delegate-role" }>,
): MainAgentStepDecision {
  return initialDecision ?? decideNextMainAgentOrchestration(observation.orchestration);
}

export function recordOrchestrationStepResult(
  observation: MainAgentObservation,
  result: MainAgentLeafStepResult,
): MainAgentObservation {
  return observeOrchestrationState({
    orchestration: result.orchestration,
    code: result.code ?? observation.latestCode,
    validation: result.validation ?? observation.latestValidation,
    audit: result.audit ?? observation.latestAudit,
    entrypoint: observation.entrypoint,
  });
}

export async function runMainAgentStepLoop(input: RunMainAgentStepLoopInput): Promise<MainAgentLeafAttemptResult> {
  const memory = await resolveProjectMemory(input.project);
  const { run: loopRun, created: loopRunCreated } = await ensureMainAgentLoopRun(memory, {
    loopRunId: input.loopRunId,
    changeId: input.changeId,
    projectId: input.project.id,
    entrypoint: input.entrypoint,
  });
  if (loopRunCreated) {
    await appendMainAgentLoopEvent(memory, loopRun, {
      type: "loop.started",
      entrypoint: input.entrypoint,
      summary: `Main-agent loop started for ${input.entrypoint}.`,
    });
  }
  const initialOrchestration = input.orchestrationState ?? createMainAgentOrchestrationState({ changeId: input.changeId });
  let observation = observeOrchestrationState({
    orchestration: initialOrchestration,
    entrypoint: input.entrypoint,
  });
  let nextInitialDecision = input.initialDecision ?? synthesizeInitialDecision(input.initialRole, observation.orchestration, input.taskRunId);

  for (let i = 0; i < 8; i += 1) {
    const observationArtifactRefs = collectObservationArtifactRefs(observation);
    const observationRefs = collectObservationRefs(observation);
    const observationTargetRefs = collectObservationTargetRefs(observation);
    await appendMainAgentLoopEvent(memory, loopRun, {
      type: "observation.recorded",
      stepIndex: i,
      entrypoint: input.entrypoint,
      summary: summarizeObservation(observation),
      artifactRefs: observationArtifactRefs,
      refs: observationRefs,
    });
    const decision = decideNextOrchestrationStep(observation, nextInitialDecision);
    nextInitialDecision = undefined;
    const decisionEvidence = await recordMainAgentNextStepEvidence(memory, loopRun, {
      stepIndex: i,
      entrypoint: input.entrypoint,
      observation: summarizeObservationForEvidence(observation),
      decision,
      artifactRefs: observationArtifactRefs,
      refs: observationRefs,
      targetRefs: observationTargetRefs,
    });
    await appendMainAgentLoopEvent(memory, loopRun, {
      type: "decision.recorded",
      stepIndex: i,
      entrypoint: input.entrypoint,
      decisionKind: decision.kind,
      decisionEvidenceId: decisionEvidence.id,
      decisionEvidenceRef: decisionEvidence.ref,
      roleId: decision.kind === "delegate-role" ? decision.roleId : undefined,
      attemptKind: decision.kind === "delegate-role" ? decision.attemptKind : undefined,
      stoppedAt: decision.kind === "failed" || decision.kind === "needs-user-input" ? decision.stoppedAt : undefined,
      reason: "reason" in decision ? decision.reason : undefined,
      summary: summarizeDecision(decision),
      artifactRefs: observationArtifactRefs,
      refs: observationRefs,
    });

    if (decision.kind === "completed") {
      return finalizeStepLoopResult(memory, loopRun, input.finalizeLoop, {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        stoppedAt: null,
        orchestration: observation.orchestration,
        loopRunId: loopRun.id,
      }, "completed", "Main-agent loop completed.", collectObservationArtifactRefs(observation), collectObservationRefs(observation));
    }
    if (decision.kind === "failed") {
      return finalizeStepLoopResult(memory, loopRun, input.finalizeLoop, {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        status: "failed",
        stoppedAt: decision.stoppedAt,
        orchestration: observation.orchestration,
        loopRunId: loopRun.id,
      }, "stopped", summarizeDecision(decision), collectObservationArtifactRefs(observation), collectObservationRefs(observation));
    }
    if (decision.kind === "needs-user-input") {
      return finalizeStepLoopResult(memory, loopRun, input.finalizeLoop, {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        status: "needs-user-input",
        stoppedAt: decision.stoppedAt,
        orchestration: observation.orchestration,
        loopRunId: loopRun.id,
      }, "stopped", summarizeDecision(decision), collectObservationArtifactRefs(observation), collectObservationRefs(observation));
    }

    await appendMainAgentLoopEvent(memory, loopRun, {
      type: "leaf.started",
      stepIndex: i,
      entrypoint: input.entrypoint,
      roleId: decision.roleId,
      attemptKind: decision.attemptKind,
      reason: decision.reason,
      summary: `Main-agent delegated ${decision.roleId}.`,
      artifactRefs: decision.inputArtifacts,
      refs: collectObservationRefs(observation),
    });
    const stepResult = await runMainAgentLeafStep({
      project: input.project,
      memory,
      changeId: input.changeId,
      prompt: input.prompt,
      live: input.live,
      taskIds: input.taskIds,
      taskRunId: input.taskRunId,
      executionGate: input.executionGate,
      observation,
      step: {
        roleId: decision.roleId,
        decision,
      },
    });

    observation = recordOrchestrationStepResult(observation, stepResult);
    await appendMainAgentLoopEvent(memory, loopRun, {
      type: "leaf.completed",
      stepIndex: i,
      entrypoint: input.entrypoint,
      roleId: decision.roleId,
      attemptKind: decision.attemptKind,
      status: stepResult.status,
      stoppedAt: stepResult.stoppedAt,
      reason: stepResult.error,
      summary: summarizeLeafStepResult(decision.roleId, stepResult),
      artifactRefs: collectStepResultArtifactRefs(stepResult),
      refs: collectStepResultRefs(stepResult),
    });

    if (stepResult.status === "failed" || stepResult.status === "needs-user-input") {
      return finalizeStepLoopResult(memory, loopRun, input.finalizeLoop, {
        code: observation.latestCode,
        validation: observation.latestValidation,
        audit: observation.latestAudit,
        status: stepResult.status === "needs-user-input" ? "needs-user-input" : stepResult.error ? "failed" : undefined,
        stoppedAt: stepResult.stoppedAt,
        error: stepResult.error,
        boundaryAudit: stepResult.boundaryAudit,
        orchestration: observation.orchestration,
        loopRunId: loopRun.id,
      }, "stopped", summarizeLeafStepResult(decision.roleId, stepResult), collectObservationArtifactRefs(observation), collectObservationRefs(observation));
    }
  }

  return finalizeStepLoopResult(memory, loopRun, input.finalizeLoop, {
    code: observation.latestCode,
    validation: observation.latestValidation,
    audit: observation.latestAudit,
    status: "needs-user-input",
    stoppedAt: "audit",
    error: "Main-agent orchestration exceeded the V1 safety iteration limit.",
    orchestration: observation.orchestration,
    loopRunId: loopRun.id,
  }, "stopped", "Main-agent orchestration exceeded the V1 safety iteration limit.", collectObservationArtifactRefs(observation), collectObservationRefs(observation));
}

export async function runMainAgentLeafStep(input: {
  project: ManagedProject;
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  taskIds?: string[];
  taskRunId?: string;
  executionGate?: CodeExecutionGateOptions;
  observation: MainAgentObservation;
  step: MainAgentLeafStep;
}): Promise<MainAgentLeafStepResult> {
  if (input.step.roleId === "coder-agent" || input.step.roleId === "rework-coder") {
    const coder = input.step.roleId === "rework-coder"
      ? await runReworkCoderLeafStage({
          project: input.project,
          memory: input.memory,
          changeId: input.changeId,
          prompt: input.prompt,
          live: input.live,
          taskIds: input.taskIds,
          taskRunId: input.taskRunId,
          orchestration: input.observation.orchestration,
          decision: input.step.decision,
          executionGate: input.executionGate,
        })
      : await runCoderLeafStage({
          project: input.project,
          memory: input.memory,
          changeId: input.changeId,
          prompt: input.prompt,
          live: input.live,
          taskIds: input.taskIds,
          taskRunId: input.taskRunId,
          roleId: "coder-agent",
          orchestration: input.observation.orchestration,
          decision: input.step.decision,
          executionGate: input.executionGate,
        });

    return {
      code: coder.code,
      validation: input.observation.latestValidation,
      audit: input.observation.latestAudit,
      status: coder.status === "completed" ? "completed" : "failed",
      stoppedAt: coder.status === "completed" ? null : coder.stoppedAt ?? "code",
      error: coder.error,
      boundaryAudit: coder.boundaryAudit,
      orchestration: coder.orchestration,
    };
  }

  if (input.step.roleId === "validator") {
    if (!input.observation.latestCode?.run.worktree?.worktreeId) {
      return {
        code: input.observation.latestCode,
        validation: input.observation.latestValidation,
        audit: input.observation.latestAudit,
        status: "needs-user-input",
        stoppedAt: "code",
        error: "Validator requires a completed coder worktree.",
        orchestration: input.observation.orchestration,
      };
    }

    const validator = await runValidatorLeafStage({
      project: input.project,
      memory: input.memory,
      changeId: input.changeId,
      live: input.live,
      orchestration: input.observation.orchestration,
      decision: input.step.decision as Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "validator" },
      code: input.observation.latestCode,
    });

    return {
      code: input.observation.latestCode,
      validation: validator.validation,
      audit: input.observation.latestAudit,
      status: validator.status === "completed" ? "completed" : "failed",
      stoppedAt: validator.status === "completed" ? null : "validation",
      error: validator.error,
      orchestration: validator.orchestration,
    };
  }

  if (input.step.roleId === "auditor-agent") {
    if (!input.observation.latestCode?.run.worktree?.worktreeId || !input.observation.latestValidation) {
      return {
        code: input.observation.latestCode,
        validation: input.observation.latestValidation,
        audit: input.observation.latestAudit,
        status: "needs-user-input",
        stoppedAt: "validation",
        error: "Auditor requires completed code and validation evidence.",
        orchestration: input.observation.orchestration,
      };
    }

    const auditor = await runAuditorLeafStage({
      project: input.project,
      memory: input.memory,
      changeId: input.changeId,
      live: input.live,
      orchestration: input.observation.orchestration,
      decision: input.step.decision as Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> & { roleId: "auditor-agent" },
      code: input.observation.latestCode,
      validation: input.observation.latestValidation,
    });

    return {
      code: input.observation.latestCode,
      validation: input.observation.latestValidation,
      audit: auditor.audit,
      status: auditor.status === "completed" ? "completed" : "failed",
      stoppedAt: auditor.status === "completed" ? null : "audit",
      orchestration: auditor.orchestration,
    };
  }

  return {
    code: input.observation.latestCode,
    validation: input.observation.latestValidation,
    audit: input.observation.latestAudit,
    status: "needs-user-input",
    stoppedAt: "code",
    error: `Unsupported main-agent leaf role: ${input.step.roleId}`,
    orchestration: input.observation.orchestration,
  };
}

function synthesizeInitialDecision(
  roleId: MainAgentOrchestrationRole | undefined,
  state: MainAgentOrchestrationState,
  taskRunId: string | undefined,
): Extract<MainAgentStepDecision, { kind: "delegate-role" }> | undefined {
  if (roleId === "rework-coder") {
    return {
      kind: "delegate-role",
      roleId: "rework-coder",
      goal: "Repair implementation from validation or audit evidence.",
      inputArtifacts: taskRunId ? [taskRunId] : [],
      reason: "Bounded rework path requested a rework coder run.",
      attemptKind: "rework",
      nextRecommendation: "Run rework-coder, then re-run independent validation and audit.",
    };
  }
  if (roleId === "coder-agent") {
    const decision = decideNextMainAgentOrchestration(state);
    assertDelegateDecision(decision, "coder-agent");
    return decision;
  }
  if (roleId === undefined) {
    return undefined;
  }
  throw new Error(`Unsupported initial main-agent role: ${roleId}`);
}

function assertDelegateDecision(decision: MainAgentStepDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentStepDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) {
    throw new Error(`Main-agent decision engine expected ${roleId}, got ${decision.kind}${decision.kind === "delegate-role" ? `:${decision.roleId}` : ""}.`);
  }
}

async function finalizeStepLoopResult(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  loopRun: MainAgentLoopRun,
  finalizeLoop: boolean | undefined,
  result: MainAgentLeafAttemptResult,
  status: "completed" | "stopped",
  summary: string,
  artifactRefs: string[],
  refs: {
    agentTaskIds?: string[];
    runIds?: string[];
    validationIds?: string[];
    auditIds?: string[];
  },
): Promise<MainAgentLeafAttemptResult> {
  if (finalizeLoop !== false) {
    await finishMainAgentLoopRun(memory, loopRun.id, {
      status,
      summary,
      stoppedAt: result.stoppedAt,
      artifactRefs,
      refs,
    });
  }
  return { ...result, loopRunId: loopRun.id };
}

function summarizeObservation(observation: MainAgentObservation): string {
  const completedRoles = observation.orchestration.steps.filter((step) => step.status === "completed").length;
  const failedRoles = observation.orchestration.steps.filter((step) => step.status === "failed").length;
  return `Observed ${observation.entrypoint} state with ${observation.orchestration.steps.length} role step(s), ${completedRoles} completed and ${failedRoles} failed.`;
}

function summarizeObservationForEvidence(observation: MainAgentObservation): MainAgentNextStepObservationSummary {
  const latest = observation.orchestration.steps.at(-1);
  return {
    summary: summarizeObservation(observation),
    totalSteps: observation.orchestration.steps.length,
    completedSteps: observation.orchestration.steps.filter((step) => step.status === "completed").length,
    failedSteps: observation.orchestration.steps.filter((step) => step.status === "failed").length,
    latestRoleId: latest?.roleId ?? null,
    latestStatus: latest?.status ?? null,
  };
}

function summarizeDecision(decision: MainAgentStepDecision): string {
  if (decision.kind === "delegate-role") {
    return `Main agent selected ${decision.roleId}: ${decision.nextRecommendation}`;
  }
  if (decision.kind === "completed") {
    return "Main agent determined the current bounded role loop is complete.";
  }
  if (decision.kind === "failed") {
    return `Main agent stopped after failure at ${decision.stoppedAt}.`;
  }
  return `Main agent requires user input after ${decision.stoppedAt}.`;
}

function summarizeLeafStepResult(roleId: MainAgentOrchestrationRole, result: MainAgentLeafStepResult): string {
  if (result.status === "completed") {
    return `${roleId} completed.`;
  }
  if (result.error) {
    return `${roleId} stopped at ${result.stoppedAt ?? "unknown"}: ${result.error}`;
  }
  return `${roleId} stopped at ${result.stoppedAt ?? "unknown"} with status ${result.status}.`;
}

function collectObservationArtifactRefs(observation: MainAgentObservation): string[] {
  return dedupeStrings([
    ...collectCodeArtifactRefs(observation.latestCode),
    ...collectValidationArtifactRefs(observation.latestValidation),
    ...collectAuditArtifactRefs(observation.latestAudit),
  ]);
}

function collectObservationRefs(observation: MainAgentObservation): {
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
} {
  return {
    runIds: dedupeStrings([
      stringValue(observation.latestCode?.run.id),
      stringValue(readNested(observation.latestValidation, "run", "id")),
      stringValue(readNested(observation.latestAudit, "run", "id")),
    ]),
    validationIds: dedupeStrings([
      stringValue(readNested(observation.latestValidation, "validation", "id")),
      stringValue(readNested(observation.latestValidation, "id")),
    ]),
    auditIds: dedupeStrings([
      stringValue(readNested(observation.latestAudit, "audit", "id")),
      stringValue(readNested(observation.latestAudit, "id")),
    ]),
  };
}

function collectObservationTargetRefs(observation: MainAgentObservation): MainAgentNextStepTargetRefs {
  const refs = collectObservationRefs(observation);
  return {
    worktreeIds: dedupeStrings([
      stringValue(observation.latestCode?.run.worktree?.worktreeId),
    ]),
    runIds: refs.runIds,
    validationIds: refs.validationIds,
    auditIds: refs.auditIds,
    applyCheckIds: [],
    landingPackageIds: [],
  };
}

function collectStepResultArtifactRefs(result: MainAgentLeafStepResult): string[] {
  return dedupeStrings([
    ...collectCodeArtifactRefs(result.code),
    ...collectValidationArtifactRefs(result.validation),
    ...collectAuditArtifactRefs(result.audit),
  ]);
}

function collectStepResultRefs(result: MainAgentLeafStepResult): {
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
} {
  return {
    runIds: dedupeStrings([
      stringValue(result.code?.run.id),
      stringValue(readNested(result.validation, "run", "id")),
      stringValue(readNested(result.audit, "run", "id")),
    ]),
    validationIds: dedupeStrings([
      stringValue(readNested(result.validation, "validation", "id")),
      stringValue(readNested(result.validation, "id")),
    ]),
    auditIds: dedupeStrings([
      stringValue(readNested(result.audit, "audit", "id")),
      stringValue(readNested(result.audit, "id")),
    ]),
  };
}

function collectCodeArtifactRefs(code: CodeLeafRun | undefined): string[] {
  if (!code) return [];
  return collectArtifactObjectRefs(code.run.artifacts);
}

function collectValidationArtifactRefs(validation: ValidationLeafRun | undefined): string[] {
  if (!validation) return [];
  return collectArtifactObjectRefs(
    readNested(validation, "run", "artifacts"),
    readNested(validation, "validation", "artifacts"),
    readNested(validation, "artifacts"),
  );
}

function collectAuditArtifactRefs(audit: AuditLeafRun | undefined): string[] {
  if (!audit) return [];
  return collectArtifactObjectRefs(
    readNested(audit, "run", "artifacts"),
    readNested(audit, "audit", "artifacts"),
    readNested(audit, "artifacts"),
  );
}

function collectArtifactObjectRefs(...values: unknown[]): string[] {
  const refs: string[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    for (const entry of Object.values(value as Record<string, unknown>)) {
      if (typeof entry === "string") refs.push(entry);
    }
  }
  return dedupeStrings(refs);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNested(value: unknown, first: string, second?: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const firstValue = (value as Record<string, unknown>)[first];
  if (second === undefined) return firstValue;
  if (!firstValue || typeof firstValue !== "object") return undefined;
  return (firstValue as Record<string, unknown>)[second];
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
