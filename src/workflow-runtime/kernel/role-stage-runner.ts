import { startAuditRun } from "../../audit/manager.js";
import { completeAgentTask, recordMaintenanceLedgerEntry } from "../../agent-task/manager.js";
import { recordPostRunBoundaryAudit, boundaryAuditArtifactRef } from "../../agent-task/boundary-audit.js";
import { dispatchForegroundRoleTask } from "../../agent-task/role-dispatcher.js";
import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  recordMainAgentOrchestrationStep,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../../agent-task/orchestration-engine.js";
import type { AgentTaskRequest } from "../../agent-task/delegate-task.js";
import { startCodeRun, type CodeExecutionGateOptions } from "../../code/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { AgentTask, ManagedProject, ResolvedMemory } from "../../types/index.js";
import { startValidationRun } from "../../validation/manager.js";
import type { WorkbenchLiveSink } from "../../workbench/types.js";
import { compactArtifactRefs } from "./runtime-guards.js";
import {
  emitAssistantEvent,
  emitAuditAssistantEvent,
  emitDelegatedRoleReturn,
  emitValidationAssistantEvents,
  forwardCodexStreamEvent,
} from "./live-events.js";

async function createDelegatedForegroundTask(
  memory: ResolvedMemory,
  request: AgentTaskRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ task: AgentTask; policyAuditRef: string }> {
  const result = await dispatchForegroundRoleTask(memory, { ...request, delegationMode: request.delegationMode ?? "orchestrator-policy" });
  emitAssistantEvent(live, {
    runId: request.changeId,
    kind: "status",
    phase: "delegateTask.accepted",
    title: `调用 ${request.roleId}`,
    summary: "主 agent 已通过 ToolPolicyGate 和 RoleDispatcher 边界创建角色任务。",
    artifactRef: result.policyAuditRef,
  });
  emitAssistantEvent(live, {
    runId: request.changeId,
    kind: "status",
    phase: "delegateTask.running",
    title: `${request.roleId} 开始处理`,
    summary: "角色任务已进入 queued/claimed/running 生命周期。",
    artifactRef: result.policyAuditRef,
  });
  return result;
}

export async function runCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  prompt?: string,
  live?: WorkbenchLiveSink,
  taskIds?: string[],
  taskRunId?: string,
  coderRoleId = "coder-agent",
  orchestrationState?: MainAgentOrchestrationState,
  coderDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  let orchestration = orchestrationState ?? createMainAgentOrchestrationState({ changeId });
  const coderRole = orchestrationCoderRole(coderRoleId);
  const coderInputArtifacts = coderDecision?.inputArtifacts.length ? coderDecision.inputArtifacts : taskRunId ? [taskRunId] : [];
  const coderDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: coderRoleId,
    kind: "foreground",
    goal: coderDecision?.goal ?? (coderRoleId === "rework-coder" ? "Repair implementation from validation or audit evidence." : "Implement the confirmed demand in an AHO-owned worktree."),
    inputArtifacts: coderInputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const coderTask = coderDispatch.task;
  live?.emit({ event: "run.status", data: { status: "running", label: "Coder" } });
  let coderStartedEmitted = false;
  let code: Awaited<ReturnType<typeof startCodeRun>>;
  try {
    code = await startCodeRun(project, {
      changeId,
      roleId: coderRoleId,
      prompt,
      taskIds,
      taskRunId,
      executionGate,
      live: {
        onRunStarted: (run) => {
          coderStartedEmitted = true;
          live?.emit({ event: "run.started", data: { runId: run.id, changeId: run.changeId, runtime: run.runtime, actionType: "code.run", taskIds: run.taskIds } });
        },
        onStatus: (event) => live?.emit({ event: "run.status", data: event }),
        onCodexEvent: (event) => forwardCodexStreamEvent(event.runId, event, live),
        onCallbackError: (event) => live?.emit({ event: "error", data: { runId: event.runId, message: event.error instanceof Error ? event.error.message : String(event.error) } }),
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: coderRole,
      status: "failed",
      inputArtifacts: coderInputArtifacts,
      outputArtifacts: [],
      failureClassification: "code-failure",
      stoppedAt: "code",
      summary: "Coder failed before code run artifacts were created.",
    });
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder failed before code run artifacts were created.",
      artifactRefs: [],
      policyAuditRefs: [coderDispatch.policyAuditRef],
      failureClassification: "code-failure",
      requiresUserInputReason: message,
    });
    emitDelegatedRoleReturn(live, changeId, coderRoleId, "failed", "coder-agent 在创建 code run 前失败，任务已关闭为 failed。", coderDispatch.policyAuditRef);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: `Coder task failed before code run artifacts were created: ${message}`,
      artifactRefs: [coderDispatch.policyAuditRef],
    });
    return { status: "failed", error: message, stoppedAt: "code", orchestration };
  }
  if (!coderStartedEmitted) live?.emit({ event: "run.started", data: { runId: code.run.id, changeId: code.run.changeId, runtime: code.run.runtime, actionType: "code.run", taskIds: code.run.taskIds } });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: code.run.status, label: "Coder" } });
  const coderBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: coderRoleId,
    runId: code.run.id,
    taskId: coderTask.id,
    sourceChanged: code.warnings.some((warning) => warning.toLowerCase().includes("source project git status changed")),
    artifactRefs: compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation),
  });
  const coderBoundaryRef = boundaryAuditArtifactRef(memory, coderBoundaryAudit);
  emitAssistantEvent(live, {
    runId: code.run.id,
    kind: "tool-result",
    phase: "boundary-audit",
    title: coderBoundaryAudit.status === "passed" ? "边界审计通过" : "边界审计发现越界",
    summary: coderBoundaryAudit.status === "passed" ? "coder-agent 的输出未越过本次需求的运行边界。" : coderBoundaryAudit.violations.map((violation) => violation.reason).join("\n"),
    artifactRef: coderBoundaryRef,
    isError: coderBoundaryAudit.status === "failed",
  });
  if (coderBoundaryAudit.status === "failed") {
    const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation, coderBoundaryRef);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: coderRole,
      status: "failed",
      inputArtifacts: coderInputArtifacts,
      outputArtifacts: coderOutputArtifacts,
      failureClassification: "boundary-violation",
      stoppedAt: "boundary",
      summary: "Coder run failed boundary audit.",
    });
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder run failed boundary audit.",
      artifactRefs: [code.run.artifacts.directory],
      policyAuditRefs: [coderDispatch.policyAuditRef],
      boundaryAuditRefs: [coderBoundaryRef],
      boundaryViolations: coderBoundaryAudit.violations,
      failureClassification: "boundary-violation",
      requiresUserInputReason: "Coder modified outside its allowed boundary.",
    });
    emitDelegatedRoleReturn(live, changeId, coderRoleId, "failed", "coder-agent 越过了允许边界，结果不会进入应用流程。", coderBoundaryRef);
    return { code, stoppedAt: "boundary", boundaryAudit: coderBoundaryAudit, orchestration };
  }
  if (code.run.status !== "completed" || !code.run.worktree?.worktreeId) {
    const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: coderRole,
      status: "failed",
      inputArtifacts: coderInputArtifacts,
      outputArtifacts: coderOutputArtifacts,
      failureClassification: "code-failure",
      stoppedAt: "code",
      summary: "Coder did not produce a completed worktree proposal.",
    });
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder did not produce a completed worktree proposal.",
      artifactRefs: [code.run.artifacts.directory],
      policyAuditRefs: [coderDispatch.policyAuditRef],
      boundaryAuditRefs: [coderBoundaryRef],
      failureClassification: "code-failure",
      requiresUserInputReason: "Implementation failed before official validation could run.",
    });
    emitDelegatedRoleReturn(live, changeId, coderRoleId, "failed", "coder-agent 没有产出可验证的 worktree 结果。", code.run.artifacts.directory);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Coder task failed before validation.",
      artifactRefs: [code.run.artifacts.directory],
    });
    return { code, stoppedAt: "code", orchestration };
  }
  const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: coderRole,
    status: "completed",
    inputArtifacts: coderInputArtifacts,
    outputArtifacts: coderOutputArtifacts,
    summary: "Coder produced a completed worktree proposal.",
  });
  await completeAgentTask(memory, coderTask, {
    status: "completed",
    summary: "Coder produced a completed worktree proposal.",
    artifactRefs: compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation),
    policyAuditRefs: [coderDispatch.policyAuditRef],
    boundaryAuditRefs: [coderBoundaryRef],
    nextRecommendation: "Run independent validation.",
  });
  emitDelegatedRoleReturn(live, changeId, coderRoleId, "completed", "coder-agent 已返回实现和自测结果。", code.run.artifacts.directory);
  const validationDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(validationDecision, "validator");
  const validatorDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "validator",
    kind: "foreground",
    goal: validationDecision.goal,
    inputArtifacts: validationDecision.inputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const validatorTask = validatorDispatch.task;
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Validation running", summary: "AHO started validation for the coder worktree." });
  const validation = await startValidationRun(project, { changeId, worktree: code.run.worktree.worktreeId });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: validation.validation.status, label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: validation.validation.status } });
  emitValidationAssistantEvents(live, code.run.id, validation);
  const validationBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: "validator",
    runId: validation.run.id,
    taskId: validatorTask.id,
    artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr),
  });
  const validationBoundaryRef = boundaryAuditArtifactRef(memory, validationBoundaryAudit);
  if (validation.validation.status !== "passed") {
    const validationOutputArtifacts = compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr, validationBoundaryRef);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: "validator",
      status: "failed",
      inputArtifacts: validationDecision.inputArtifacts,
      outputArtifacts: validationOutputArtifacts,
      failureClassification: "validation-failure",
      stoppedAt: "validation",
      summary: "Independent validation failed.",
    });
    await completeAgentTask(memory, validatorTask, {
      status: "failed",
      summary: "Independent validation failed.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr),
      policyAuditRefs: [validatorDispatch.policyAuditRef],
      boundaryAuditRefs: [validationBoundaryRef],
      failureClassification: "validation-failure",
      requiresUserInputReason: "Validation failed; bounded automatic rework may be attempted.",
    });
    emitDelegatedRoleReturn(live, changeId, "validator", "failed", "validator 返回验证失败结果。", validation.run.artifacts.validation);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Validation failed for a foreground main-agent role orchestration attempt.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stderr),
    });
    return { code, validation, stoppedAt: "validation", orchestration };
  }
  const validationOutputArtifacts = compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validationBoundaryRef);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: "validator",
    status: "completed",
    inputArtifacts: validationDecision.inputArtifacts,
    outputArtifacts: validationOutputArtifacts,
    summary: "Independent validation passed.",
  });
  await completeAgentTask(memory, validatorTask, {
    status: "completed",
    summary: "Independent validation passed.",
    artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout),
    policyAuditRefs: [validatorDispatch.policyAuditRef],
    boundaryAuditRefs: [validationBoundaryRef],
    nextRecommendation: "Run semantic audit.",
  });
  emitDelegatedRoleReturn(live, changeId, "validator", "completed", "validator 返回验证通过结果。", validation.run.artifacts.validation);
  const auditDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(auditDecision, "auditor-agent");
  const auditorDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "auditor-agent",
    kind: "foreground",
    goal: auditDecision.goal,
    inputArtifacts: auditDecision.inputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const auditorTask = auditorDispatch.task;
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Audit running", summary: "AHO started audit after validation passed." });
  const audit = await startAuditRun(project, {
    changeId,
    worktreeId: code.run.worktree.worktreeId,
    prompt: "This audit was automatically started after the user confirmed the Coder run and validation passed for the same worktree.",
  });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: audit.audit.status, label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: audit.audit.status } });
  emitAuditAssistantEvent(live, code.run.id, audit);
  const auditBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: "auditor-agent",
    runId: audit.run.id,
    taskId: auditorTask.id,
    artifactRefs: compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage),
  });
  const auditBoundaryRef = boundaryAuditArtifactRef(memory, auditBoundaryAudit);
  const auditAccepted = audit.audit.status === "approved" || audit.audit.status === "approved-with-notes";
  const auditOutputArtifacts = compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage, auditBoundaryRef);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: "auditor-agent",
    status: auditAccepted ? "completed" : "failed",
    inputArtifacts: auditDecision.inputArtifacts,
    outputArtifacts: auditOutputArtifacts,
    ...(auditAccepted ? {} : { failureClassification: "audit-failure" as const, stoppedAt: "audit" as const }),
    summary: auditAccepted ? "Independent audit accepted the validated worktree evidence." : "Independent audit did not accept the worktree evidence.",
  });
  await completeAgentTask(memory, auditorTask, {
    status: auditAccepted ? "completed" : "failed",
    summary: auditAccepted
      ? "Independent audit accepted the validated worktree evidence."
      : "Independent audit did not accept the worktree evidence.",
    artifactRefs: compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage),
    policyAuditRefs: [auditorDispatch.policyAuditRef],
    boundaryAuditRefs: [auditBoundaryRef],
    nextRecommendation: auditAccepted ? "Show result review and apply handoff." : "Attempt bounded automatic rework if budget remains.",
    ...(auditAccepted ? {} : { failureClassification: "audit-failure", requiresUserInputReason: "Audit did not accept the current evidence." }),
  });
  emitDelegatedRoleReturn(
    live,
    changeId,
    "auditor-agent",
    auditAccepted ? "completed" : "failed",
    auditAccepted
      ? "auditor-agent 返回审查通过结果。"
      : "auditor-agent 返回需要修改或补证据的结果。",
    audit.audit.artifacts.auditMarkdown,
  );
  if (!auditAccepted) {
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Audit did not accept foreground main-agent role orchestration evidence.",
      artifactRefs: compactArtifactRefs(audit.audit.artifacts.auditMarkdown),
    });
  }
  return { code, validation, audit, stoppedAt: auditAccepted ? null : "audit", orchestration };
}

function orchestrationCoderRole(roleId: string): MainAgentOrchestrationRole {
  return roleId === "rework-coder" ? "rework-coder" : "coder-agent";
}

function assertDelegateDecision(decision: MainAgentOrchestrationDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) throw new Error(`Expected ${roleId} delegation but got ${decision.kind}.`);
}
