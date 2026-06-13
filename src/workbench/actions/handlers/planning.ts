import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { completeAgentTask, createAgentTask, recordMainAgentDecision } from "../../../agent-task/manager.js";
import { buildRunAgentRecord, resolveAgentRole } from "../../../agent/catalog.js";
import { buildAcMap } from "../../../ecl/anchors.js";
import { writeJsonFile } from "../../../fs/json.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import {
  initializeSchedulerRuntime,
  compileSchedulerIntegrationCandidate,
  prepareSchedulerPlanEvidence,
  reconcileSchedulerRuntime,
  reserveSchedulerRuntimeClaims,
  renderSchedulerLaunchBriefMarkdown,
  renderSchedulerIntegrationCandidateMarkdown,
  renderSchedulerRuntimeClaimReservationMarkdown,
  renderSchedulerRuntimeWorkerResultMarkdown,
  renderSchedulerRuntimeWorkerStartMarkdown,
  renderSchedulerRuntimeWorkerAuditMarkdown,
  renderSchedulerRuntimeWorkerReworkPlanMarkdown,
  renderSchedulerRuntimeWorkerReworkResultMarkdown,
  renderSchedulerRuntimeWorkerReworkStartMarkdown,
  renderSchedulerRuntimeWorkerReworkAuditMarkdown,
  renderSchedulerRuntimeWorkerReworkValidationMarkdown,
  renderSchedulerRuntimeWorkerValidationMarkdown,
  renderSchedulerReconcileSnapshotMarkdown,
  renderSchedulerRuntimeStateMarkdown,
  reconcileSchedulerFirstWorkerResult,
  reconcileSchedulerFirstWorkerReworkResult,
  validateSchedulerFirstWorkerRework,
  auditSchedulerFirstWorkerRework,
  startFirstSchedulerCoderWorker,
  auditSchedulerFirstWorker,
  compileSchedulerFirstWorkerReworkPlan,
  startFirstSchedulerWorkerRework,
  validateSchedulerFirstWorker,
  type SchedulerReconcileSnapshot,
  type SchedulerRuntimeClaimReservation,
  type SchedulerRuntimeState,
  type SchedulerRuntimeWorkerStart,
  type SchedulerIntegrationCandidateResult,
  type SchedulerWorkerResultReconcileResult,
  type SchedulerWorkerAuditResult,
  type SchedulerWorkerReworkPlanResult,
  type SchedulerWorkerReworkResultReconcileResult,
  type SchedulerWorkerReworkValidationResult,
  type SchedulerWorkerReworkAuditResult,
  type SchedulerFirstWorkerReworkStartResult,
  type SchedulerWorkerValidationResult,
  type SchedulerPlanPreparationResult,
} from "../../../scheduler-runtime/manager.js";
import type { ManagedProject } from "../../../types/index.js";
import {
  createWorkflowRunForValidatedTaskQueue,
  validateWorkflowTaskQueueProposalStart,
} from "../../../workflow-runtime/taskqueue.js";
import { runTaskQueueSequence } from "../../../workflow-runtime/code-workflow.js";
import {
  buildTaskQueueProposalFromReadiness,
  compileWorkflowGraphPlan,
  hashArtifactRefs,
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
  readWorkflowGraphPlan,
  renderTaskQueueProposalMarkdown,
  supersedeExistingTaskQueueProposal,
  writeDecompositionPlan,
  writeDecompositionReadinessManifest,
  writeTaskQueueProposal,
  type DecompositionPlan,
  type DecompositionReadinessManifest,
  type TaskQueueProposal,
  type WorkflowGraphPlan,
} from "../../../workflow-artifacts/manager.js";
import {
  compileSchedulerDispatchDryRun,
  compileSchedulerContract,
  compileSchedulerClaimReconcilePlan,
  compileSchedulerLaunchPreflight,
  compileSchedulerWorkerSessionPlan,
  prepareSchedulerRun,
  readSchedulerClaimReconcilePlan,
  readSchedulerContract,
  readSchedulerDispatchDryRun,
  readSchedulerLaunchPreflight,
  readSchedulerWorkerSessionPlan,
  renderSchedulerClaimReconcilePlanMarkdown,
  renderSchedulerDispatchDryRunMarkdown,
  renderSchedulerContractMarkdown,
  renderSchedulerLaunchPreflightMarkdown,
  renderSchedulerRunMarkdown,
  renderSchedulerWorkerSessionPlanMarkdown,
  type SchedulerClaimReconcilePlan,
  type SchedulerContract,
  type SchedulerDispatchDryRun,
  type SchedulerLaunchPreflight,
  type SchedulerRun,
  type SchedulerWorkerSessionPlan,
} from "../../../workflow-scheduler/manager.js";
import { readLatestPlanningBundle } from "../planning-bundle.js";
import { runCodexChat } from "../../codex-chat/bridge.js";
import { recordWorkbenchDecision } from "../../decisions.js";
import { emitAssistantEvent } from "../../live-events.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import { resolveTopic } from "../../topic-resolver.js";
import { readTopicThreadLog as readThreadLog } from "../../thread-log.js";
import type {
  OrchestrationPlanCard,
  PlanningArtifactBundle,
  WorkbenchLiveSink,
  WorkbenchWorkflowActionRequest,
} from "../../types.js";
import {
  buildDecompositionReadinessManifest,
  buildDeterministicDecompositionPlan,
  buildDeterministicPlanningBundle,
} from "../../planning/builders.js";
import { writePlanningBundle } from "../../planning/persistence.js";
import {
  decompositionRecommendationLabel,
  renderDecompositionPlanSummary,
  renderDecompositionReadinessSummary,
  renderPlanningBundleSummary,
} from "../../planning/renderers.js";

export async function generatePlanningDraft(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  revision: boolean,
): Promise<{ bundle: PlanningArtifactBundle }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Planning draft");
  const task = await createAgentTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "planning-agent",
    kind: "foreground",
    summary: revision ? "Revise planning artifact bundle from user feedback." : "Generate planning artifact bundle from the demand conversation.",
    inputArtifacts: [changePath],
    initialStatus: "running",
  });
  await recordMainAgentDecision(memory, {
    changeId,
    recommendedAction: revision ? "planning.revise" : "planning.generate",
    userMessage: revision ? "修改方案草案" : "生成方案草案",
    requiresUserDecision: false,
    createTask: {
      roleId: "planning-agent",
      kind: "foreground",
      summary: task.summary,
      inputArtifacts: task.inputArtifacts,
    },
    reason: "The current demand needs a user-reviewable planning draft before canonical artifacts are written.",
  });
  const role = await resolveAgentRole(memory, "planning-agent");
  const thread = await readThreadLog(memory, changePath);
  const latestUserText = prompt?.trim()
    || [...thread].reverse().find((entry) => entry.type === "user.message")?.text
    || changeId;
  const planningRuntime = await runCodexChat(project, changeId, [
    "作为 planning-agent，请基于当前需求对话生成或修订方案草案。",
    "输出目标、约束、验收标准、实现方案、任务清单、风险和待确认点。",
    "不要修改文件；AHO 会在用户确认执行后再写入 canonical artifacts。",
    "",
    latestUserText,
  ].join("\n")).catch((error: unknown) => {
    emitAssistantEvent(live, {
      runId: changeId,
      kind: "status",
      phase: "planning-runtime-fallback",
      title: "方案草案运行时不可用",
      summary: error instanceof Error ? error.message : String(error),
      isError: true,
    });
    return null;
  });
  const previous = await readLatestPlanningBundle(memory, changePath).catch(() => null);
  const bundle = buildDeterministicPlanningBundle(memory, changePath, changeId, latestUserText, previous, revision);
  await writePlanningBundle(memory, changePath, bundle);
  emitAssistantEvent(live, {
    runId: bundle.id,
    kind: "plan-update",
    phase: "draft",
    title: revision ? "Planning draft revised" : "Planning draft generated",
    summary: "planning-agent produced a proposal/spec/design/tasks bundle for user review.",
    artifactRef: bundle.artifact,
  });
  const planCard: OrchestrationPlanCard = {
    title: "方案草案",
    summary: `目标：${bundle.goal}`,
    steps: [
      { label: "验收标准", description: bundle.acceptanceCriteria.join("；") || "等待补充验收标准。" },
      { label: "实现方案", description: bundle.design },
      { label: "任务清单", description: bundle.tasks.map((task) => `${task.id} ${task.title}`).join("；") || "等待拆解任务。" },
    ],
    warnings: bundle.openQuestions,
  };
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "planning-draft",
    text: [planningRuntime?.message.trim(), renderPlanningBundleSummary(bundle)].filter(Boolean).join("\n\n"),
    runId: planningRuntime?.run.id,
    artifact: planningRuntime?.run.artifacts.lastMessage ?? bundle.artifact,
    planCard,
    blocks: [
      {
        id: `${bundle.id}:prose`,
        runId: planningRuntime?.run.id ?? bundle.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: planningRuntime ? "codex" : "aho",
        title: revision ? "方案草案已更新" : "方案草案",
        text: [planningRuntime?.message.trim(), renderPlanningBundleSummary(bundle)].filter(Boolean).join("\n\n"),
      },
      {
        id: `${bundle.id}:plan-card`,
        runId: bundle.id,
        sequence: 2,
        kind: "plan-card",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "方案草案",
        planCard,
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: assistant });
  await recordWorkbenchDecision(project, {
    id: `planning:${bundle.id}`,
    changeId,
    decisionType: revision ? "planning.revise" : "planning.generate",
    status: "completed",
    label: revision ? "方案草案已更新" : "方案草案已生成",
    summary: "planning-agent generated a draft bundle. It is not canonical until confirmation.",
    targetId: bundle.id,
    runId: null,
    artifact: bundle.artifact,
    actionId: revision ? "planning.revise" : "planning.generate",
    payload: { role: buildRunAgentRecord(role), bundle },
    completedAt: new Date().toISOString(),
  });
  await completeAgentTask(memory, task, {
    status: "completed",
    summary: revision ? "Planning draft revised for user review." : "Planning draft generated for user review.",
    artifactRefs: [bundle.artifact, ...(planningRuntime?.run.artifacts.lastMessage ? [planningRuntime.run.artifacts.lastMessage] : [])],
    nextRecommendation: "Ask the user to confirm execution or request changes.",
  });
  return { bundle };
}

export async function confirmPlanningAndStartPipeline(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Confirm planning execution");
  const bundle = await readLatestPlanningBundle(memory, changePath);
  if (!request.planningBundleId) throw new Error("planning.confirm-execution requires planningBundleId.");
  if (bundle.id !== request.planningBundleId || bundle.status !== "draft") throw new Error("planning.confirm-execution target is stale or no longer confirmable.");
  const changeDir = join(memory.memoryRoot, changePath);
  await writeFile(join(changeDir, "spec.md"), bundle.specMd, "utf8");
  await writeFile(join(changeDir, "plan.md"), bundle.planMd, "utf8");
  await writeFile(join(changeDir, "tasks.md"), bundle.tasksMd, "utf8");
  const acMap = buildAcMap({
    changeId,
    specContent: bundle.specMd,
    tasksContent: bundle.tasksMd,
    placeholderFiles: [
      { path: "spec.md", content: bundle.specMd },
      { path: "plan.md", content: bundle.planMd },
      { path: "tasks.md", content: bundle.tasksMd },
    ],
  });
  await writeJsonFile(join(changeDir, "ac-map.json"), acMap);
  const confirmed = { ...bundle, status: "confirmed" as const, acMapCandidate: acMap, updatedAt: new Date().toISOString() };
  await writePlanningBundle(memory, changePath, confirmed);
  await recordMainAgentDecision(memory, {
    changeId,
    recommendedAction: "planning.confirm-execution",
    userMessage: "确认执行",
    requiresUserDecision: false,
    createTask: {
      roleId: "main-agent",
      kind: "foreground",
      summary: "Canonical planning artifacts were accepted; execution requires decomposition and readiness gates.",
      inputArtifacts: [confirmed.artifact],
    },
    reason: "The user confirmed the planning artifact bundle; Phase 7J requires typed readiness before code-producing execution.",
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "planning-confirmed",
    text: "已确认规划：方案草案已写入内部 spec/plan/tasks/ac-map。下一步需要生成或确认 DecompositionPlan，并通过 readiness gate 后才能启动执行。",
    artifact: confirmed.artifact,
  });
  emitAssistantEvent(live, {
    runId: confirmed.id,
    kind: "status",
    phase: "confirmed",
    title: "Planning confirmed",
    summary: "Canonical planning artifacts were written after user confirmation.",
    artifactRef: confirmed.artifact,
  });
  return { bundle: confirmed, executionStarted: false };
}

export async function generateDecompositionPlan(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<{ plan: DecompositionPlan }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Generate decomposition plan");
  const bundle = await readLatestPlanningBundle(memory, changePath).catch(() => null);
  const thread = await readThreadLog(memory, changePath);
  const plan = buildDeterministicDecompositionPlan(memory, changePath, changeId, bundle, thread, prompt);
  await writeDecompositionPlan(memory, changePath, plan);
  const planCard: OrchestrationPlanCard = {
    title: "拆分评估",
    summary: decompositionRecommendationLabel(plan.recommendation),
    steps: [
      { label: "建议", description: plan.rationale },
      { label: "执行单元", description: plan.units.map((unit) => `${unit.id} ${unit.title}`).join("；") || "无需拆分。" },
      { label: "恢复边界", description: plan.recoveryKeyInputs.notes.join("；") },
    ],
    warnings: [...plan.openQuestions, plan.riskSummary].filter(Boolean),
  };
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-draft",
    text: renderDecompositionPlanSummary(plan),
    artifact: plan.artifact,
    planCard,
    blocks: [
      {
        id: `${plan.id}:plan-card`,
        runId: plan.id,
        sequence: 1,
        kind: "plan-card",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "拆分评估",
        planCard,
        artifactRef: plan.artifact,
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: plan.id,
    kind: "plan-update",
    phase: "decomposition-draft",
    title: "DecompositionPlan drafted",
    summary: "Main-agent proposal was recorded for user review. It does not start execution.",
    artifactRef: plan.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `decomposition:${plan.id}`,
    changeId,
    decisionType: "planning.decompose",
    status: "completed",
    label: "拆分评估已生成",
    summary: "Generated a proposal-only DecompositionPlan. No execution artifacts were created.",
    targetId: plan.id,
    runId: null,
    artifact: plan.artifact,
    actionId: "planning.decompose",
    payload: { plan },
    completedAt: new Date().toISOString(),
  });
  return { plan };
}

export async function confirmDecompositionPlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ plan: DecompositionPlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Confirm decomposition plan");
  if (!request.decompositionPlanId) throw new Error("planning.decomposition.confirm requires decompositionPlanId.");
  const plan = await readLatestDecompositionPlan(memory, changePath);
  if (plan.id !== request.decompositionPlanId || plan.status !== "draft") {
    throw new Error("planning.decomposition.confirm target is stale or no longer confirmable.");
  }
  const confirmed: DecompositionPlan = { ...plan, status: "confirmed", updatedAt: new Date().toISOString() };
  await writeDecompositionPlan(memory, changePath, confirmed);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-confirmed",
    text: "已确认拆分方向：本阶段只记录 DecompositionPlan 接受，不会创建子 Change、TaskRun、AgentTask 或启动执行。",
    artifact: confirmed.artifact,
  });
  emitAssistantEvent(live, {
    runId: confirmed.id,
    kind: "status",
    phase: "decomposition-confirmed",
    title: "DecompositionPlan confirmed",
    summary: "Proposal acceptance was recorded without starting execution.",
    artifactRef: confirmed.artifact,
  });
  return { plan: confirmed, executionStarted: false };
}

export async function assessDecompositionReadiness(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ manifest: DecompositionReadinessManifest; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Assess decomposition readiness");
  if (!request.decompositionPlanId) throw new Error("planning.decomposition.assess-readiness requires decompositionPlanId.");
  const plan = await readLatestDecompositionPlan(memory, changePath);
  if (plan.id !== request.decompositionPlanId || plan.status !== "confirmed") {
    throw new Error("planning.decomposition.assess-readiness target is stale or no longer assessable.");
  }
  const manifest = await buildDecompositionReadinessManifest(memory, changePath, changeId, plan);
  await writeDecompositionReadinessManifest(memory, changePath, manifest);
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-readiness",
    text: renderDecompositionReadinessSummary(manifest),
    artifact: manifest.artifact,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: manifest.id,
    kind: "status",
    phase: "decomposition-readiness",
    title: "Decomposition readiness assessed",
    summary: "Confirmed DecompositionPlan was checked against execution guardrails. No execution artifacts were created.",
    artifactRef: manifest.artifact,
  });
  return { manifest, executionStarted: false };
}

export async function proposeTaskQueue(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ proposal: TaskQueueProposal; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "TaskQueueProposal generation");
  if (!request.readinessManifestId) throw new Error("planning.taskqueue.propose requires readinessManifestId.");
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== request.readinessManifestId || manifest.changeId !== changeId) {
    throw new Error("planning.taskqueue.propose target is stale or not scoped to the selected Change.");
  }
  await supersedeExistingTaskQueueProposal(memory, changePath);
  const proposal = await buildTaskQueueProposalFromReadiness(memory, changePath, changeId, manifest);
  await writeTaskQueueProposal(memory, changePath, proposal);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "taskqueue-proposal",
    text: renderTaskQueueProposalMarkdown(proposal),
    artifact: proposal.artifact,
  });
  emitAssistantEvent(live, {
    runId: proposal.id,
    kind: "status",
    phase: "taskqueue-proposal",
    title: "TaskQueue proposal prepared",
    summary: "A typed TaskQueueProposal was generated; no execution records were created.",
    artifactRef: proposal.artifact,
  });
  return { proposal, executionStarted: false };
}

export async function compileTaskQueueWorkflowGraph(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ graph: WorkflowGraphPlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "WorkflowGraphPlan compile");
  if (!request.taskQueueProposalId) throw new Error("planning.workflowgraph.compile requires taskQueueProposalId.");
  if (!request.readinessManifestId) throw new Error("planning.workflowgraph.compile requires readinessManifestId.");
  const proposal = await readLatestTaskQueueProposal(memory, changePath);
  if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || !["draft", "confirmed"].includes(proposal.status)) {
    throw new Error("planning.workflowgraph.compile target is stale or no longer compilable.");
  }
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== request.readinessManifestId || manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
    throw new Error("planning.workflowgraph.compile readiness target is stale.");
  }
  const expectedSourceHashes = await hashArtifactRefs(memory, proposal.artifactRefs);
  for (const [artifact, hash] of Object.entries(expectedSourceHashes)) {
    if (proposal.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`WorkflowGraphPlan compile source artifact hash mismatch: ${artifact}.`);
    }
  }
  const confirmed = proposal.status === "confirmed"
    ? proposal
    : { ...proposal, status: "confirmed" as const, updatedAt: new Date().toISOString() };
  if (proposal.status !== "confirmed") await writeTaskQueueProposal(memory, changePath, confirmed);
  const graph = await compileWorkflowGraphPlan(memory, changePath, confirmed, manifest);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "workflowgraph-compiled",
    text: `WorkflowGraphPlan ${graph.id} compiled from TaskQueueProposal ${confirmed.id}. No execution records were created.`,
    artifact: graph.artifact,
  });
  emitAssistantEvent(live, {
    runId: graph.id,
    kind: "file-change",
    phase: "workflowgraph-compiled",
    title: "WorkflowGraphPlan compiled",
    summary: "A versioned typed workflow graph was generated; no TaskQueue or WorkflowRun was started.",
    artifactRef: graph.artifact,
  });
  return { graph, executionStarted: false };
}

export async function preparePlanningSchedulerPlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerPlanPreparationResult> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler plan prepare");
  if (request.changeId && request.changeId !== changeId) throw new Error("planning.scheduler.plan.prepare changeId scope mismatch.");
  const result = await prepareSchedulerPlanEvidence(memory, changePath, {
    schedulerRunId: request.schedulerRunId,
    schedulerReconcileSnapshotId: request.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: request.schedulerClaimReservationId,
  });
  const artifact = result.claimReservation?.artifact ?? result.launchPreflight?.artifact ?? result.schedulerRun?.artifact ?? result.contract?.artifact;
  const text = result.launchBrief
    ? renderSchedulerLaunchBriefMarkdown(result.launchBrief)
    : [
      "# 并行执行计划准备受阻",
      "",
      result.blockedSummary ?? "Scheduler pre-executor evidence is blocked.",
      "",
      "没有启动 worker、TaskRun、WorkerLease、WorkerSession、worktree、run 或 child Change。",
      "",
    ].join("\n");
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.status === "prepared" ? "scheduler-plan-prepared" : "scheduler-plan-blocked",
    text,
    artifact,
  });
  emitAssistantEvent(live, {
    runId: result.schedulerRun?.id ?? result.launchPreflight?.id ?? result.contract?.id ?? changeId,
    kind: "file-change",
    phase: result.status === "prepared" ? "scheduler-plan-prepared" : "scheduler-plan-blocked",
    title: result.status === "prepared" ? "并行执行计划已准备" : "并行执行计划准备受阻",
    summary: result.launchBrief?.summary ?? result.blockedSummary ?? "Scheduler plan preparation stopped before any execution records were created.",
    artifactRef: artifact,
  });
  await recordWorkbenchDecision(project, {
    id: result.mode === "launch-confirmation"
      ? `scheduler-plan-launch-confirmed:${result.claimReservation?.id ?? changeId}`
      : `scheduler-plan-prepared:${result.claimReservation?.id ?? result.launchPreflight?.id ?? changeId}`,
    changeId,
    decisionType: "planning.scheduler.plan.prepare",
    status: "completed",
    label: result.mode === "launch-confirmation" ? "并行执行计划启动意图已确认" : "并行执行计划已准备",
    summary: result.launchBrief?.summary ?? result.blockedSummary ?? "Prepared scheduler pre-executor evidence without starting execution.",
    targetId: result.claimReservation?.id ?? result.schedulerRun?.id ?? result.launchPreflight?.id ?? changeId,
    runId: null,
    artifact: artifact ?? null,
    actionId: "planning.scheduler.plan.prepare",
    payload: {
      mode: result.mode,
      status: result.status,
      contractId: result.contract?.id ?? result.schedulerRun?.schedulerContractId,
      schedulerDispatchDryRunId: result.dryRun?.id ?? result.schedulerRun?.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: result.workerPlan?.id ?? result.schedulerRun?.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: result.claimReconcilePlan?.id ?? result.schedulerRun?.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: result.launchPreflight?.id ?? result.schedulerRun?.schedulerLaunchPreflightId,
      schedulerRunId: result.schedulerRun?.id,
      schedulerReconcileSnapshotId: result.reconcileSnapshot?.id,
      schedulerClaimReservationId: result.claimReservation?.id,
      launchBrief: result.launchBrief,
      blockedSummary: result.blockedSummary,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function compilePlanningSchedulerContract(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ contract: SchedulerContract; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "SchedulerContract compile");
  if (!request.decompositionPlanId) throw new Error("planning.scheduler.contract.compile requires decompositionPlanId.");
  if (!request.readinessManifestId) throw new Error("planning.scheduler.contract.compile requires readinessManifestId.");
  const plan = await readLatestDecompositionPlan(memory, changePath);
  if (plan.id !== request.decompositionPlanId || plan.changeId !== changeId || plan.status !== "confirmed" || plan.recommendation !== "taskgraph-parallel-candidate") {
    throw new Error("planning.scheduler.contract.compile plan target is stale or no longer compilable.");
  }
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== request.readinessManifestId || manifest.changeId !== changeId || manifest.decompositionPlanId !== plan.id || manifest.status !== "ready-for-scheduler-contract" || manifest.nextAllowedAction !== "scheduler.contract") {
    throw new Error("planning.scheduler.contract.compile readiness target is stale.");
  }
  const contract = await compileSchedulerContract(memory, changePath, plan, manifest);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-contract-compiled",
    text: renderSchedulerContractMarkdown(contract),
    artifact: contract.artifact,
  });
  emitAssistantEvent(live, {
    runId: contract.id,
    kind: "file-change",
    phase: "scheduler-contract-compiled",
    title: "SchedulerContract compiled",
    summary: "A non-executing parallel scheduler contract was generated; no scheduler, TaskRun, WorkerLease, worktree, or run was started.",
    artifactRef: contract.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-contract:${contract.id}`,
    changeId,
    decisionType: "planning.scheduler.contract.compile",
    status: "completed",
    label: "Scheduler Contract 已编译",
    summary: "Generated a non-executing SchedulerContract from a parallel readiness manifest.",
    targetId: contract.id,
    runId: null,
    artifact: contract.artifact,
    actionId: "planning.scheduler.contract.compile",
    payload: { contract },
    completedAt: new Date().toISOString(),
  });
  return { contract, executionStarted: false };
}

export async function generateSchedulerDispatchDryRun(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ dryRun: SchedulerDispatchDryRun; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler dispatch dry-run");
  if (!request.schedulerContractId) throw new Error("planning.scheduler.dispatch.dry-run requires schedulerContractId.");
  const contract = await readSchedulerContract(memory, changePath, request.schedulerContractId);
  if (contract.id !== request.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
    throw new Error("planning.scheduler.dispatch.dry-run SchedulerContract target is stale.");
  }
  const dryRun = await compileSchedulerDispatchDryRun(memory, changePath, contract);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-dispatch-dry-run-generated",
    text: renderSchedulerDispatchDryRunMarkdown(dryRun),
    artifact: dryRun.artifact,
  });
  emitAssistantEvent(live, {
    runId: dryRun.id,
    kind: "file-change",
    phase: "scheduler-dispatch-dry-run-generated",
    title: "Scheduler dispatch dry-run generated",
    summary: "A non-executing scheduler dispatch/reconcile dry-run was generated; no worker, lease, TaskRun, worktree, run, or child Change was created.",
    artifactRef: dryRun.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-dry-run:${dryRun.id}`,
    changeId,
    decisionType: "planning.scheduler.dispatch.dry-run",
    status: "completed",
    label: "调度预演已生成",
    summary: "Generated a non-executing Scheduler Dispatch / Reconcile dry-run from a SchedulerContract.",
    targetId: dryRun.id,
    runId: null,
    artifact: dryRun.artifact,
    actionId: "planning.scheduler.dispatch.dry-run",
    payload: { dryRun },
    completedAt: new Date().toISOString(),
  });
  return { dryRun, executionStarted: false };
}

export async function compilePlanningSchedulerWorkerSessionPlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ workerPlan: SchedulerWorkerSessionPlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler worker session plan");
  if (!request.schedulerDispatchDryRunId) throw new Error("planning.scheduler.worker-plan.compile requires schedulerDispatchDryRunId.");
  const dryRun = await readSchedulerDispatchDryRun(memory, changePath, request.schedulerDispatchDryRunId);
  if (dryRun.id !== request.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
    throw new Error("planning.scheduler.worker-plan.compile SchedulerDispatchDryRun target is stale.");
  }
  const contract = await readSchedulerContract(memory, changePath, dryRun.schedulerContractId);
  if (contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
    throw new Error("planning.scheduler.worker-plan.compile SchedulerContract lineage is stale.");
  }
  const workerPlan = await compileSchedulerWorkerSessionPlan(memory, changePath, dryRun, contract);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-worker-plan-compiled",
    text: renderSchedulerWorkerSessionPlanMarkdown(workerPlan),
    artifact: workerPlan.artifact,
  });
  emitAssistantEvent(live, {
    runId: workerPlan.id,
    kind: "file-change",
    phase: "scheduler-worker-plan-compiled",
    title: "Scheduler worker session plan compiled",
    summary: "A non-executing worker session / workspace / permission / event / recovery contract was generated; no worker or scheduler was started.",
    artifactRef: workerPlan.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-worker-plan:${workerPlan.id}`,
    changeId,
    decisionType: "planning.scheduler.worker-plan.compile",
    status: "completed",
    label: "Worker Session Plan 已编译",
    summary: "Generated a non-executing SchedulerWorkerSessionPlan from a scheduler dispatch dry-run.",
    targetId: workerPlan.id,
    runId: null,
    artifact: workerPlan.artifact,
    actionId: "planning.scheduler.worker-plan.compile",
    payload: { workerPlan },
    completedAt: new Date().toISOString(),
  });
  return { workerPlan, executionStarted: false };
}

export async function compilePlanningSchedulerClaimReconcilePlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ claimReconcilePlan: SchedulerClaimReconcilePlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler claim/reconcile plan");
  if (!request.schedulerWorkerPlanId) throw new Error("planning.scheduler.claim-reconcile.compile requires schedulerWorkerPlanId.");
  const workerPlan = await readSchedulerWorkerSessionPlan(memory, changePath, request.schedulerWorkerPlanId);
  if (workerPlan.id !== request.schedulerWorkerPlanId || workerPlan.changeId !== changeId || workerPlan.status !== "planned") {
    throw new Error("planning.scheduler.claim-reconcile.compile SchedulerWorkerSessionPlan target is stale.");
  }
  const dryRun = await readSchedulerDispatchDryRun(memory, changePath, workerPlan.schedulerDispatchDryRunId);
  if (dryRun.id !== workerPlan.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
    throw new Error("planning.scheduler.claim-reconcile.compile SchedulerDispatchDryRun lineage is stale.");
  }
  const contract = await readSchedulerContract(memory, changePath, workerPlan.schedulerContractId);
  if (contract.id !== workerPlan.schedulerContractId || contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
    throw new Error("planning.scheduler.claim-reconcile.compile SchedulerContract lineage is stale.");
  }
  const claimReconcilePlan = await compileSchedulerClaimReconcilePlan(memory, changePath, workerPlan, dryRun, contract);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-claim-reconcile-plan-compiled",
    text: renderSchedulerClaimReconcilePlanMarkdown(claimReconcilePlan),
    artifact: claimReconcilePlan.artifact,
  });
  emitAssistantEvent(live, {
    runId: claimReconcilePlan.id,
    kind: "file-change",
    phase: "scheduler-claim-reconcile-plan-compiled",
    title: "Scheduler claim/reconcile plan compiled",
    summary: "A non-executing claim/reconcile plan was generated; no lease, worker session, scheduler loop, worker, run, worktree, or child Change was created.",
    artifactRef: claimReconcilePlan.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-claim-reconcile:${claimReconcilePlan.id}`,
    changeId,
    decisionType: "planning.scheduler.claim-reconcile.compile",
    status: "completed",
    label: "Claim / Reconcile Plan 已编译",
    summary: "Generated a non-executing SchedulerClaimReconcilePlan from a worker session plan.",
    targetId: claimReconcilePlan.id,
    runId: null,
    artifact: claimReconcilePlan.artifact,
    actionId: "planning.scheduler.claim-reconcile.compile",
    payload: { claimReconcilePlan },
    completedAt: new Date().toISOString(),
  });
  return { claimReconcilePlan, executionStarted: false };
}

export async function checkPlanningSchedulerLaunchPreflight(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ launchPreflight: SchedulerLaunchPreflight; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler launch preflight");
  if (!request.schedulerClaimReconcilePlanId) throw new Error("planning.scheduler.launch-preflight.check requires schedulerClaimReconcilePlanId.");
  const claimReconcilePlan = await readSchedulerClaimReconcilePlan(memory, changePath, request.schedulerClaimReconcilePlanId);
  if (claimReconcilePlan.id !== request.schedulerClaimReconcilePlanId || claimReconcilePlan.changeId !== changeId || claimReconcilePlan.status !== "planned") {
    throw new Error("planning.scheduler.launch-preflight.check SchedulerClaimReconcilePlan target is stale.");
  }
  const workerPlan = await readSchedulerWorkerSessionPlan(memory, changePath, claimReconcilePlan.schedulerWorkerPlanId);
  if (workerPlan.id !== claimReconcilePlan.schedulerWorkerPlanId || workerPlan.changeId !== changeId || workerPlan.status !== "planned") {
    throw new Error("planning.scheduler.launch-preflight.check SchedulerWorkerSessionPlan lineage is stale.");
  }
  const dryRun = await readSchedulerDispatchDryRun(memory, changePath, claimReconcilePlan.schedulerDispatchDryRunId);
  if (dryRun.id !== claimReconcilePlan.schedulerDispatchDryRunId || dryRun.id !== workerPlan.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
    throw new Error("planning.scheduler.launch-preflight.check SchedulerDispatchDryRun lineage is stale.");
  }
  const contract = await readSchedulerContract(memory, changePath, claimReconcilePlan.schedulerContractId);
  if (contract.id !== claimReconcilePlan.schedulerContractId || contract.id !== workerPlan.schedulerContractId || contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
    throw new Error("planning.scheduler.launch-preflight.check SchedulerContract lineage is stale.");
  }
  const launchPreflight = await compileSchedulerLaunchPreflight(memory, changePath, claimReconcilePlan, workerPlan, dryRun, contract);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-launch-preflight-checked",
    text: renderSchedulerLaunchPreflightMarkdown(launchPreflight),
    artifact: launchPreflight.artifact,
  });
  emitAssistantEvent(live, {
    runId: launchPreflight.id,
    kind: "file-change",
    phase: "scheduler-launch-preflight-checked",
    title: "Scheduler launch preflight checked",
    summary: "A non-executing launch preflight was generated; no scheduler loop, lease, worker session, run, worktree, or child Change was created.",
    artifactRef: launchPreflight.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-launch-preflight:${launchPreflight.id}`,
    changeId,
    decisionType: "planning.scheduler.launch-preflight.check",
    status: "completed",
    label: "Launch Preflight 已检查",
    summary: "Generated non-executing SchedulerLaunchPreflight evidence from a claim/reconcile plan.",
    targetId: launchPreflight.id,
    runId: null,
    artifact: launchPreflight.artifact,
    actionId: "planning.scheduler.launch-preflight.check",
    payload: { launchPreflight },
    completedAt: new Date().toISOString(),
  });
  return { launchPreflight, executionStarted: false };
}

export async function preparePlanningSchedulerRun(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ schedulerRun: SchedulerRun; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "SchedulerRun prepare");
  if (!request.schedulerLaunchPreflightId) throw new Error("planning.scheduler.run.prepare requires schedulerLaunchPreflightId.");
  const launchPreflight = await readSchedulerLaunchPreflight(memory, changePath, request.schedulerLaunchPreflightId);
  if (launchPreflight.id !== request.schedulerLaunchPreflightId || launchPreflight.changeId !== changeId || launchPreflight.status !== "checked") {
    throw new Error("planning.scheduler.run.prepare SchedulerLaunchPreflight target is stale or not checked.");
  }
  const claimReconcilePlan = await readSchedulerClaimReconcilePlan(memory, changePath, launchPreflight.schedulerClaimReconcilePlanId);
  if (claimReconcilePlan.id !== launchPreflight.schedulerClaimReconcilePlanId || claimReconcilePlan.changeId !== changeId || claimReconcilePlan.status !== "planned") {
    throw new Error("planning.scheduler.run.prepare SchedulerClaimReconcilePlan lineage is stale.");
  }
  const workerPlan = await readSchedulerWorkerSessionPlan(memory, changePath, launchPreflight.schedulerWorkerPlanId);
  if (workerPlan.id !== launchPreflight.schedulerWorkerPlanId || workerPlan.id !== claimReconcilePlan.schedulerWorkerPlanId || workerPlan.changeId !== changeId || workerPlan.status !== "planned") {
    throw new Error("planning.scheduler.run.prepare SchedulerWorkerSessionPlan lineage is stale.");
  }
  const dryRun = await readSchedulerDispatchDryRun(memory, changePath, launchPreflight.schedulerDispatchDryRunId);
  if (dryRun.id !== launchPreflight.schedulerDispatchDryRunId || dryRun.id !== claimReconcilePlan.schedulerDispatchDryRunId || dryRun.id !== workerPlan.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
    throw new Error("planning.scheduler.run.prepare SchedulerDispatchDryRun lineage is stale.");
  }
  const contract = await readSchedulerContract(memory, changePath, launchPreflight.schedulerContractId);
  if (contract.id !== launchPreflight.schedulerContractId || contract.id !== claimReconcilePlan.schedulerContractId || contract.id !== workerPlan.schedulerContractId || contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
    throw new Error("planning.scheduler.run.prepare SchedulerContract lineage is stale.");
  }
  const schedulerRun = await prepareSchedulerRun(memory, changePath, launchPreflight, claimReconcilePlan, workerPlan, dryRun, contract);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-run-prepared",
    text: renderSchedulerRunMarkdown(schedulerRun),
    artifact: schedulerRun.artifact,
  });
  emitAssistantEvent(live, {
    runId: schedulerRun.id,
    kind: "file-change",
    phase: "scheduler-run-prepared",
    title: "SchedulerRun journal shell prepared",
    summary: "A non-executing SchedulerRun journal shell was prepared; no scheduler loop, lease, worker session, worktree, run, or child Change was created.",
    artifactRef: schedulerRun.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-run:${schedulerRun.id}`,
    changeId,
    decisionType: "planning.scheduler.run.prepare",
    status: "completed",
    label: "SchedulerRun 已准备",
    summary: "Prepared a non-executing SchedulerRun journal shell from a checked launch preflight.",
    targetId: schedulerRun.id,
    runId: null,
    artifact: schedulerRun.artifact,
    actionId: "planning.scheduler.run.prepare",
    payload: { schedulerRun },
    completedAt: new Date().toISOString(),
  });
  return { schedulerRun, executionStarted: false };
}

export async function initializePlanningSchedulerRuntime(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ runtimeState: SchedulerRuntimeState; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler runtime initialize");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.runtime.initialize requires schedulerRunId.");
  const runtimeState = await initializeSchedulerRuntime(memory, changePath, request.schedulerRunId);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-runtime-initialized",
    text: renderSchedulerRuntimeStateMarkdown(runtimeState),
    artifact: runtimeState.artifact,
  });
  emitAssistantEvent(live, {
    runId: runtimeState.schedulerRunId,
    kind: "file-change",
    phase: "scheduler-runtime-initialized",
    title: "Scheduler runtime shell initialized",
    summary: "A SchedulerRun-scoped runtime shell was initialized; no workers, leases, TaskRuns, worktrees, runs, or scheduler loop were created.",
    artifactRef: runtimeState.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-runtime:${runtimeState.schedulerRunId}`,
    changeId,
    decisionType: "planning.scheduler.runtime.initialize",
    status: "completed",
    label: "Scheduler Runtime 壳已初始化",
    summary: "Initialized SchedulerRun-scoped runtime shell sidecars without starting execution.",
    targetId: runtimeState.schedulerRunId,
    runId: null,
    artifact: runtimeState.artifact,
    actionId: "planning.scheduler.runtime.initialize",
    payload: { runtimeState },
    completedAt: new Date().toISOString(),
  });
  return { runtimeState, executionStarted: false };
}

export async function reconcilePlanningSchedulerRuntime(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ reconcileSnapshot: SchedulerReconcileSnapshot; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler runtime reconcile");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.runtime.reconcile requires schedulerRunId.");
  const reconcileSnapshot = await reconcileSchedulerRuntime(memory, changePath, request.schedulerRunId);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-runtime-reconciled",
    text: renderSchedulerReconcileSnapshotMarkdown(reconcileSnapshot),
    artifact: reconcileSnapshot.artifact,
  });
  emitAssistantEvent(live, {
    runId: reconcileSnapshot.schedulerRunId,
    kind: "file-change",
    phase: "scheduler-runtime-reconciled",
    title: "Scheduler runtime shell reconciled",
    summary: "A SchedulerRun-scoped reconcile snapshot was generated; no workers, leases, TaskRuns, worktrees, runs, or scheduler loop were created.",
    artifactRef: reconcileSnapshot.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-reconcile:${reconcileSnapshot.id}`,
    changeId,
    decisionType: "planning.scheduler.runtime.reconcile",
    status: "completed",
    label: "Scheduler Reconcile Snapshot 已生成",
    summary: "Generated a SchedulerRun-scoped reconcile snapshot without starting execution.",
    targetId: reconcileSnapshot.id,
    runId: null,
    artifact: reconcileSnapshot.artifact,
    actionId: "planning.scheduler.runtime.reconcile",
    payload: { reconcileSnapshot },
    completedAt: new Date().toISOString(),
  });
  return { reconcileSnapshot, executionStarted: false };
}

export async function reservePlanningSchedulerRuntimeClaims(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ claimReservation: SchedulerRuntimeClaimReservation; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler runtime claim reservation");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.runtime.reserve-claims requires schedulerRunId.");
  if (!request.schedulerReconcileSnapshotId) throw new Error("planning.scheduler.runtime.reserve-claims requires schedulerReconcileSnapshotId.");
  const claimReservation = await reserveSchedulerRuntimeClaims(memory, changePath, request.schedulerRunId, request.schedulerReconcileSnapshotId);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: claimReservation.status === "reserved" ? "scheduler-runtime-claim-reserved" : "scheduler-runtime-claim-blocked",
    text: renderSchedulerRuntimeClaimReservationMarkdown(claimReservation),
    artifact: claimReservation.artifact,
  });
  emitAssistantEvent(live, {
    runId: claimReservation.schedulerRunId,
    kind: "file-change",
    phase: claimReservation.status === "reserved" ? "scheduler-runtime-claim-reserved" : "scheduler-runtime-claim-blocked",
    title: "Scheduler runtime claims reserved",
    summary: "SchedulerRun-scoped claim reservation evidence was recorded; no WorkerLeases, WorkerSessions, TaskRuns, slots, worktrees, runs, workers, or scheduler loop were created.",
    artifactRef: claimReservation.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-claim-reservation:${claimReservation.id}`,
    changeId,
    decisionType: "planning.scheduler.runtime.reserve-claims",
    status: "completed",
    label: claimReservation.status === "reserved" ? "Runtime Claims 已预占" : "Runtime Claims 阻塞",
    summary: "Generated SchedulerRun-scoped claim reservation evidence without starting execution.",
    targetId: claimReservation.id,
    runId: null,
    artifact: claimReservation.artifact,
    actionId: "planning.scheduler.runtime.reserve-claims",
    payload: { claimReservation },
    completedAt: new Date().toISOString(),
  });
  return { claimReservation, executionStarted: false };
}

export async function startPlanningSchedulerFirstWorker(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ workerStart: SchedulerRuntimeWorkerStart; taskRun: unknown; lease: unknown; code: unknown; executionStarted: true }> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker start");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.start-first requires schedulerRunId.");
  if (!request.schedulerClaimReservationId) throw new Error("planning.scheduler.worker.start-first requires schedulerClaimReservationId.");
  const result = await startFirstSchedulerCoderWorker(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerClaimReservationId: request.schedulerClaimReservationId,
    reservationIntentId: request.reservationIntentId,
    claimIntentId: request.claimIntentId,
    prompt: request.prompt,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-first-worker-started",
    text: renderSchedulerRuntimeWorkerStartMarkdown(result.workerStart),
    artifact: result.workerStart.artifact,
    runId: result.code.run.id,
  });
  emitAssistantEvent(live, {
    runId: result.code.run.id,
    kind: "file-change",
    phase: "scheduler-first-worker-started",
    title: "第一个 scheduler coder worker 已启动",
    summary: `Started coder stage for ${result.workerStart.reservationIntentId}; no validation, audit, rework, wave dispatch, scheduler loop, TaskQueueRun, WorkflowRun, AgentTask, or child Change was created.`,
    artifactRef: result.workerStart.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-started:${result.workerStart.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.start-first",
    status: "completed",
    label: "第一个 worker 已启动",
    summary: "Started exactly one scheduler coder-stage worker from the latest claim reservation.",
    targetId: result.workerStart.id,
    runId: result.code.run.id,
    artifact: result.workerStart.artifact,
    actionId: "planning.scheduler.worker.start-first",
    payload: {
      schedulerRunId: result.workerStart.schedulerRunId,
      schedulerClaimReservationId: result.workerStart.schedulerClaimReservationId,
      reservationIntentId: result.workerStart.reservationIntentId,
      claimIntentId: result.workerStart.claimIntentId,
      nodeId: result.workerStart.nodeId,
      unitId: result.workerStart.unitId,
      taskRunId: result.workerStart.taskRunId,
      workerLeaseId: result.workerStart.workerLeaseId,
      worktreeId: result.workerStart.worktreeId,
      runId: result.workerStart.runId,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function reconcilePlanningSchedulerFirstWorkerResult(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerResultReconcileResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker result reconcile");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.reconcile-result requires schedulerRunId.");
  if (!request.schedulerWorkerStartId) throw new Error("planning.scheduler.worker.reconcile-result requires schedulerWorkerStartId.");
  const result = await reconcileSchedulerFirstWorkerResult(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerStartId: request.schedulerWorkerStartId,
  });
  if (result.status === "running") {
    await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      status: "scheduler-first-worker-running",
      text: `第一个 scheduler coder worker 仍在运行：TaskRun ${result.taskRun.id}，WorkerLease ${result.lease.id}${result.codeRun?.id ? `，code run ${result.codeRun.id}` : ""}。未写入 terminal result，也未释放 lease。`,
      artifact: result.workerStart.artifact,
      runId: result.codeRun?.id,
    });
    emitAssistantEvent(live, {
      runId: result.codeRun?.id ?? result.workerStart.id,
      kind: "status",
      phase: "scheduler-first-worker-running",
      title: "第一个 scheduler worker 仍在运行",
      summary: "Result reconcile observed a non-terminal code run; no terminal SchedulerRuntimeWorkerResult was written and the WorkerLease remains active.",
      artifactRef: result.workerStart.artifact,
    });
    await recordWorkbenchDecision(project, {
      id: `scheduler-first-worker-running:${result.workerStart.id}`,
      changeId,
      decisionType: "planning.scheduler.worker.reconcile-result",
      status: "completed",
      label: "第一个 worker 仍在运行",
      summary: "Scheduler first worker result reconcile observed running evidence and did not release the lease.",
      targetId: result.workerStart.id,
      runId: result.codeRun?.id ?? null,
      artifact: result.workerStart.artifact,
      actionId: "planning.scheduler.worker.reconcile-result",
      payload: {
        schedulerRunId: result.workerStart.schedulerRunId,
        schedulerClaimReservationId: result.workerStart.schedulerClaimReservationId,
        schedulerWorkerStartId: result.workerStart.id,
        reservationIntentId: result.workerStart.reservationIntentId,
        claimIntentId: result.workerStart.claimIntentId,
        taskRunId: result.taskRun.id,
        workerLeaseId: result.lease.id,
        worktreeId: result.workerStart.worktreeId,
        runId: result.codeRun?.id,
        resultStatus: "running",
      },
      completedAt: new Date().toISOString(),
    });
    return result;
  }
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "evidence-ready" ? "scheduler-first-worker-result-ready" : "scheduler-first-worker-result-failed",
    text: renderSchedulerRuntimeWorkerResultMarkdown(result.result),
    artifact: result.result.artifact,
    runId: result.codeRun?.id ?? undefined,
  });
  emitAssistantEvent(live, {
    runId: result.codeRun?.id ?? result.result.id,
    kind: "file-change",
    phase: result.result.status === "evidence-ready" ? "scheduler-first-worker-result-ready" : "scheduler-first-worker-result-failed",
    title: result.result.status === "evidence-ready" ? "第一个 scheduler worker 结果已就绪" : "第一个 scheduler worker 结果失败",
    summary: "Scheduler-owned worker result evidence was reconciled from TaskRun, WorkerLease, worktree, and code run evidence. No validation, audit, rework, next worker, or scheduler loop was started.",
    artifactRef: result.result.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-result:${result.result.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.reconcile-result",
    status: "completed",
    label: result.result.status === "evidence-ready" ? "第一个 worker 结果已就绪" : "第一个 worker 结果失败",
    summary: "Reconciled exactly one scheduler coder worker result without starting validation, audit, rework, or the next worker.",
    targetId: result.result.id,
    runId: result.codeRun?.id ?? null,
    artifact: result.result.artifact,
    actionId: "planning.scheduler.worker.reconcile-result",
    payload: {
      schedulerRunId: result.result.schedulerRunId,
      schedulerClaimReservationId: result.result.schedulerClaimReservationId,
      schedulerWorkerStartId: result.result.schedulerWorkerStartId,
      schedulerWorkerResultId: result.result.id,
      reservationIntentId: result.result.reservationIntentId,
      claimIntentId: result.result.claimIntentId,
      nodeId: result.result.nodeId,
      unitId: result.result.unitId,
      taskRunId: result.result.taskRunId,
      workerLeaseId: result.result.workerLeaseId,
      worktreeId: result.result.worktreeId,
      runId: result.result.runId,
      resultStatus: result.result.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function validatePlanningSchedulerFirstWorker(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerValidationResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker validation");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.validate-first requires schedulerRunId.");
  if (!request.schedulerWorkerResultId) throw new Error("planning.scheduler.worker.validate-first requires schedulerWorkerResultId.");
  const result = await validateSchedulerFirstWorker(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerResultId: request.schedulerWorkerResultId,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.schedulerValidation.status === "passed" ? "scheduler-first-worker-validation-passed" : "scheduler-first-worker-validation-failed",
    text: renderSchedulerRuntimeWorkerValidationMarkdown(result.schedulerValidation),
    artifact: result.schedulerValidation.artifact,
    runId: result.validationRun.id,
  });
  emitAssistantEvent(live, {
    runId: result.validationRun.id,
    kind: "file-change",
    phase: result.schedulerValidation.status === "passed" ? "scheduler-first-worker-validation-passed" : "scheduler-first-worker-validation-failed",
    title: result.schedulerValidation.status === "passed" ? "第一个 scheduler worker 验证通过" : "第一个 scheduler worker 验证失败",
    summary: result.schedulerValidation.status === "passed"
      ? "Validation passed for the first scheduler worker worktree. TaskRun remains evidence-ready for a later audit gate."
      : "Validation failed for the first scheduler worker worktree. TaskRun was blocked; audit, rework, and next worker were not started.",
    artifactRef: result.schedulerValidation.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-validation:${result.schedulerValidation.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.validate-first",
    status: "completed",
    label: result.schedulerValidation.status === "passed" ? "第一个 worker 验证通过" : "第一个 worker 验证失败",
    summary: "Validated exactly one scheduler coder worker worktree without starting audit, rework, or the next worker.",
    targetId: result.schedulerValidation.id,
    runId: result.validationRun.id,
    artifact: result.schedulerValidation.artifact,
    actionId: "planning.scheduler.worker.validate-first",
    payload: {
      schedulerRunId: result.schedulerValidation.schedulerRunId,
      schedulerClaimReservationId: result.schedulerValidation.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerValidation.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerValidation.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerValidation.id,
      reservationIntentId: result.schedulerValidation.reservationIntentId,
      claimIntentId: result.schedulerValidation.claimIntentId,
      nodeId: result.schedulerValidation.nodeId,
      unitId: result.schedulerValidation.unitId,
      taskRunId: result.schedulerValidation.taskRunId,
      workerLeaseId: result.schedulerValidation.workerLeaseId,
      worktreeId: result.schedulerValidation.worktreeId,
      runId: result.schedulerValidation.codeRunId,
      validationRunId: result.schedulerValidation.validationRunId,
      validationStatus: result.schedulerValidation.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function auditPlanningSchedulerFirstWorker(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerAuditResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker audit");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.audit-first requires schedulerRunId.");
  if (!request.schedulerWorkerValidationId) throw new Error("planning.scheduler.worker.audit-first requires schedulerWorkerValidationId.");
  const result = await auditSchedulerFirstWorker(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerValidationId: request.schedulerWorkerValidationId,
  });
  const approved = result.schedulerAudit.status === "approved" || result.schedulerAudit.status === "approved-with-notes";
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: approved ? "scheduler-first-worker-audit-approved" : "scheduler-first-worker-audit-blocked",
    text: renderSchedulerRuntimeWorkerAuditMarkdown(result.schedulerAudit),
    artifact: result.schedulerAudit.artifact,
    runId: result.auditRun.id,
  });
  emitAssistantEvent(live, {
    runId: result.auditRun.id,
    kind: "file-change",
    phase: approved ? "scheduler-first-worker-audit-approved" : "scheduler-first-worker-audit-blocked",
    title: approved ? "第一个 scheduler worker 审计通过" : "第一个 scheduler worker 审计未通过",
    summary: approved
      ? "Audit approved the first scheduler worker worktree. The scheduler TaskRun was completed."
      : "Audit blocked or failed for the first scheduler worker worktree. The scheduler TaskRun was blocked; rework and next worker were not started.",
    artifactRef: result.schedulerAudit.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-audit:${result.schedulerAudit.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.audit-first",
    status: "completed",
    label: approved ? "第一个 worker 审计通过" : "第一个 worker 审计未通过",
    summary: "Audited exactly one scheduler coder worker worktree without starting rework, the next worker, or a scheduler loop.",
    targetId: result.schedulerAudit.id,
    runId: result.auditRun.id,
    artifact: result.schedulerAudit.artifact,
    actionId: "planning.scheduler.worker.audit-first",
    payload: {
      schedulerRunId: result.schedulerAudit.schedulerRunId,
      schedulerClaimReservationId: result.schedulerAudit.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerAudit.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerAudit.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerAudit.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.schedulerAudit.id,
      reservationIntentId: result.schedulerAudit.reservationIntentId,
      claimIntentId: result.schedulerAudit.claimIntentId,
      nodeId: result.schedulerAudit.nodeId,
      unitId: result.schedulerAudit.unitId,
      taskRunId: result.schedulerAudit.taskRunId,
      workerLeaseId: result.schedulerAudit.workerLeaseId,
      worktreeId: result.schedulerAudit.worktreeId,
      runId: result.schedulerAudit.codeRunId,
      validationRunId: result.schedulerAudit.validationRunId,
      auditRunId: result.schedulerAudit.auditRunId,
      auditStatus: result.schedulerAudit.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function compilePlanningSchedulerFirstWorkerReworkPlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkPlanResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker rework plan");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-plan.compile requires schedulerRunId.");
  if (!request.schedulerWorkerValidationId) throw new Error("planning.scheduler.worker.rework-plan.compile requires schedulerWorkerValidationId.");
  const result = await compileSchedulerFirstWorkerReworkPlan(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerValidationId: request.schedulerWorkerValidationId,
    ...(request.schedulerWorkerAuditId ? { schedulerWorkerAuditId: request.schedulerWorkerAuditId } : {}),
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-first-worker-rework-plan-compiled",
    text: renderSchedulerRuntimeWorkerReworkPlanMarkdown(result.reworkPlan),
    artifact: result.reworkPlan.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.reworkPlan.id,
    kind: "file-change",
    phase: "scheduler-first-worker-rework-plan-compiled",
    title: "第一个 scheduler worker rework 计划已生成",
    summary: "Rework planning evidence was compiled for the first scheduler worker. No rework execution, next worker, or scheduler loop was started.",
    artifactRef: result.reworkPlan.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-plan:${result.reworkPlan.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-plan.compile",
    status: "completed",
    label: "第一个 worker rework 计划已生成",
    summary: "Compiled bounded rework planning evidence for exactly one scheduler worker without starting rework or any additional worker.",
    targetId: result.reworkPlan.id,
    runId: result.reworkPlan.targetCodeRunId,
    artifact: result.reworkPlan.artifact,
    actionId: "planning.scheduler.worker.rework-plan.compile",
    payload: {
      schedulerRunId: result.reworkPlan.schedulerRunId,
      schedulerClaimReservationId: result.reworkPlan.schedulerClaimReservationId,
      schedulerWorkerStartId: result.reworkPlan.schedulerWorkerStartId,
      schedulerWorkerResultId: result.reworkPlan.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.reworkPlan.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.reworkPlan.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.reworkPlan.id,
      reservationIntentId: result.reworkPlan.reservationIntentId,
      claimIntentId: result.reworkPlan.claimIntentId,
      nodeId: result.reworkPlan.nodeId,
      unitId: result.reworkPlan.unitId,
      taskRunId: result.reworkPlan.taskRunId,
      workerLeaseId: result.reworkPlan.workerLeaseId,
      worktreeId: result.reworkPlan.targetWorktreeId,
      runId: result.reworkPlan.targetCodeRunId,
      validationRunId: result.reworkPlan.validationRunId,
      auditRunId: result.reworkPlan.auditRunId,
      blockingSource: result.reworkPlan.blockingSource,
      futureCodeGateMode: result.reworkPlan.futureCodeGateMode,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function startPlanningSchedulerFirstWorkerRework(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerFirstWorkerReworkStartResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker rework start");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-start-first requires schedulerRunId.");
  if (!request.schedulerWorkerReworkPlanId) throw new Error("planning.scheduler.worker.rework-start-first requires schedulerWorkerReworkPlanId.");
  const result = await startFirstSchedulerWorkerRework(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkPlanId: request.schedulerWorkerReworkPlanId,
    prompt: request.prompt,
    live: live ? {
      onStatus: (event) => emitAssistantEvent(live, {
        runId: event.runId,
        kind: "status",
        phase: event.status,
        title: event.label ?? "Scheduler rework-coder",
      }),
      onRunStarted: (run) => emitAssistantEvent(live, {
        runId: run.id,
        kind: "status",
        phase: "scheduler-first-worker-rework-started",
        title: "第一个 scheduler worker rework 已启动",
        summary: run.worktree ? `Reusing worktree ${run.worktree.worktreeId}.` : undefined,
      }),
    } : undefined,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-first-worker-rework-started",
    text: renderSchedulerRuntimeWorkerReworkStartMarkdown(result.reworkStart),
    artifact: result.reworkStart.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.reworkStart.id,
    kind: "file-change",
    phase: "scheduler-first-worker-rework-started",
    title: "第一个 scheduler worker rework 已启动",
    summary: "Started exactly one rework-coder on the original scheduler worker worktree. No validation, audit, result reconcile, next worker, apply, or merge was started.",
    artifactRef: result.reworkStart.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-start:${result.reworkStart.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-start-first",
    status: "completed",
    label: "第一个 worker rework 已启动",
    summary: "Started exactly one scoped rework-coder on the original scheduler worker worktree without creating a new worktree or starting follow-up gates.",
    targetId: result.reworkStart.id,
    runId: result.code.run.id,
    artifact: result.reworkStart.artifact,
    actionId: "planning.scheduler.worker.rework-start-first",
    payload: {
      schedulerRunId: result.reworkStart.schedulerRunId,
      schedulerClaimReservationId: result.reworkStart.schedulerClaimReservationId,
      schedulerWorkerStartId: result.reworkStart.schedulerWorkerStartId,
      schedulerWorkerResultId: result.reworkStart.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.reworkStart.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.reworkStart.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.reworkStart.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.reworkStart.id,
      reservationIntentId: result.reworkStart.reservationIntentId,
      claimIntentId: result.reworkStart.claimIntentId,
      nodeId: result.reworkStart.nodeId,
      unitId: result.reworkStart.unitId,
      originalTaskRunId: result.reworkStart.originalTaskRunId,
      taskRunId: result.reworkStart.reworkTaskRunId,
      originalWorkerLeaseId: result.reworkStart.originalWorkerLeaseId,
      workerLeaseId: result.reworkStart.reworkWorkerLeaseId,
      worktreeId: result.reworkStart.worktreeId,
      originalRunId: result.reworkStart.originalCodeRunId,
      runId: result.reworkStart.reworkRunId ?? null,
      executionGateMode: "scheduler-claim-rework",
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function reconcilePlanningSchedulerFirstWorkerReworkResult(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkResultReconcileResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker rework result reconcile");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-reconcile-result requires schedulerRunId.");
  if (!request.schedulerWorkerReworkStartId) throw new Error("planning.scheduler.worker.rework-reconcile-result requires schedulerWorkerReworkStartId.");
  const result = await reconcileSchedulerFirstWorkerReworkResult(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkStartId: request.schedulerWorkerReworkStartId,
  });
  if (result.status === "running") {
    emitAssistantEvent(live, {
      runId: result.reworkStart.id,
      kind: "status",
      phase: "scheduler-first-worker-rework-result-running",
      title: "第一个 scheduler worker rework 仍在运行",
      summary: result.codeRun ? `Rework code run ${result.codeRun.id} is ${result.codeRun.status}.` : "Rework code run has not produced terminal evidence yet.",
    });
    await recordWorkbenchDecision(project, {
      id: `scheduler-first-worker-rework-result-running:${result.reworkStart.id}`,
      changeId,
      decisionType: "planning.scheduler.worker.rework-reconcile-result",
      status: "completed",
      label: "第一个 worker rework 仍在运行",
      summary: "Rework result reconcile found non-terminal code evidence; no terminal SchedulerRuntimeWorkerReworkResult was written.",
      targetId: result.reworkStart.id,
      runId: result.reworkStart.reworkRunId ?? null,
      artifact: result.reworkStart.artifact,
      actionId: "planning.scheduler.worker.rework-reconcile-result",
      payload: {
        schedulerRunId: result.reworkStart.schedulerRunId,
        schedulerClaimReservationId: result.reworkStart.schedulerClaimReservationId,
        schedulerWorkerStartId: result.reworkStart.schedulerWorkerStartId,
        schedulerWorkerResultId: result.reworkStart.schedulerWorkerResultId,
        schedulerWorkerValidationId: result.reworkStart.schedulerWorkerValidationId,
        schedulerWorkerAuditId: result.reworkStart.schedulerWorkerAuditId,
        schedulerWorkerReworkPlanId: result.reworkStart.schedulerWorkerReworkPlanId,
        schedulerWorkerReworkStartId: result.reworkStart.id,
        reservationIntentId: result.reworkStart.reservationIntentId,
        claimIntentId: result.reworkStart.claimIntentId,
        taskRunId: result.reworkStart.reworkTaskRunId,
        workerLeaseId: result.reworkStart.reworkWorkerLeaseId,
        worktreeId: result.reworkStart.worktreeId,
        runId: result.reworkStart.reworkRunId,
        reworkStatus: "running",
      },
      completedAt: new Date().toISOString(),
    });
    return result;
  }
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "evidence-ready" ? "scheduler-first-worker-rework-result-ready" : "scheduler-first-worker-rework-result-failed",
    text: renderSchedulerRuntimeWorkerReworkResultMarkdown(result.result),
    artifact: result.result.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.result.id,
    kind: "file-change",
    phase: result.result.status === "evidence-ready" ? "scheduler-first-worker-rework-result-ready" : "scheduler-first-worker-rework-result-failed",
    title: result.result.status === "evidence-ready" ? "第一个 scheduler worker rework 结果已对账" : "第一个 scheduler worker rework 结果失败",
    summary: "Reconciled one same-worktree rework-coder result. No validation, audit, next worker, apply, or merge was started.",
    artifactRef: result.result.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-result:${result.result.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-reconcile-result",
    status: "completed",
    label: result.result.status === "evidence-ready" ? "第一个 worker rework 结果已对账" : "第一个 worker rework 结果失败",
    summary: result.result.status === "evidence-ready"
      ? "Rework code evidence is evidence-ready for later rework validation/audit."
      : "Rework code evidence failed; no follow-up gate was started.",
    targetId: result.result.id,
    runId: result.result.reworkRunId ?? null,
    artifact: result.result.artifact,
    actionId: "planning.scheduler.worker.rework-reconcile-result",
    payload: {
      schedulerRunId: result.result.schedulerRunId,
      schedulerClaimReservationId: result.result.schedulerClaimReservationId,
      schedulerWorkerStartId: result.result.schedulerWorkerStartId,
      schedulerWorkerResultId: result.result.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.result.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.result.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.result.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.result.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: result.result.id,
      reservationIntentId: result.result.reservationIntentId,
      claimIntentId: result.result.claimIntentId,
      nodeId: result.result.nodeId,
      unitId: result.result.unitId,
      originalTaskRunId: result.result.originalTaskRunId,
      taskRunId: result.result.reworkTaskRunId,
      originalWorkerLeaseId: result.result.originalWorkerLeaseId,
      workerLeaseId: result.result.reworkWorkerLeaseId,
      worktreeId: result.result.worktreeId,
      originalRunId: result.result.originalCodeRunId,
      runId: result.result.reworkRunId,
      reworkRunId: result.result.reworkRunId,
      reworkResultStatus: result.result.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function validatePlanningSchedulerFirstWorkerRework(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkValidationResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker rework validation");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-validate-first requires schedulerRunId.");
  if (!request.schedulerWorkerReworkResultId) throw new Error("planning.scheduler.worker.rework-validate-first requires schedulerWorkerReworkResultId.");
  const result = await validateSchedulerFirstWorkerRework(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkResultId: request.schedulerWorkerReworkResultId,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.schedulerReworkValidation.status === "passed" ? "scheduler-first-worker-rework-validation-passed" : "scheduler-first-worker-rework-validation-failed",
    text: renderSchedulerRuntimeWorkerReworkValidationMarkdown(result.schedulerReworkValidation),
    artifact: result.schedulerReworkValidation.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.schedulerReworkValidation.id,
    kind: "file-change",
    phase: result.schedulerReworkValidation.status === "passed" ? "scheduler-first-worker-rework-validation-passed" : "scheduler-first-worker-rework-validation-failed",
    title: result.schedulerReworkValidation.status === "passed" ? "第一个 scheduler worker rework 验证通过" : "第一个 scheduler worker rework 验证失败",
    summary: "Ran one scoped Validation on the same scheduler rework worktree. No audit, next worker, apply, or merge was started.",
    artifactRef: result.schedulerReworkValidation.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-validation:${result.schedulerReworkValidation.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-validate-first",
    status: "completed",
    label: result.schedulerReworkValidation.status === "passed" ? "第一个 worker rework 验证通过" : "第一个 worker rework 验证失败",
    summary: result.schedulerReworkValidation.status === "passed"
      ? "Rework validation passed; rework audit remains required before task completion."
      : "Rework validation failed; the rework TaskRun is blocked and no follow-up gate was started.",
    targetId: result.schedulerReworkValidation.id,
    runId: result.schedulerReworkValidation.validationRunId,
    artifact: result.schedulerReworkValidation.artifact,
    actionId: "planning.scheduler.worker.rework-validate-first",
    payload: {
      schedulerRunId: result.schedulerReworkValidation.schedulerRunId,
      schedulerClaimReservationId: result.schedulerReworkValidation.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerReworkValidation.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerReworkValidation.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerReworkValidation.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.schedulerReworkValidation.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.schedulerReworkValidation.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.schedulerReworkValidation.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: result.schedulerReworkValidation.schedulerWorkerReworkResultId,
      schedulerWorkerReworkValidationId: result.schedulerReworkValidation.id,
      reservationIntentId: result.schedulerReworkValidation.reservationIntentId,
      claimIntentId: result.schedulerReworkValidation.claimIntentId,
      nodeId: result.schedulerReworkValidation.nodeId,
      unitId: result.schedulerReworkValidation.unitId,
      originalTaskRunId: result.schedulerReworkValidation.originalTaskRunId,
      taskRunId: result.schedulerReworkValidation.reworkTaskRunId,
      originalWorkerLeaseId: result.schedulerReworkValidation.originalWorkerLeaseId,
      workerLeaseId: result.schedulerReworkValidation.reworkWorkerLeaseId,
      worktreeId: result.schedulerReworkValidation.worktreeId,
      originalRunId: result.schedulerReworkValidation.originalCodeRunId,
      runId: result.schedulerReworkValidation.reworkRunId,
      reworkRunId: result.schedulerReworkValidation.reworkRunId,
      validationRunId: result.schedulerReworkValidation.validationRunId,
      reworkValidationRunId: result.schedulerReworkValidation.validationRunId,
      validationStatus: result.schedulerReworkValidation.validationStatus,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function auditPlanningSchedulerFirstWorkerRework(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkAuditResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker rework audit");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-audit-first requires schedulerRunId.");
  if (!request.schedulerWorkerReworkValidationId) throw new Error("planning.scheduler.worker.rework-audit-first requires schedulerWorkerReworkValidationId.");
  const result = await auditSchedulerFirstWorkerRework(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkValidationId: request.schedulerWorkerReworkValidationId,
  });
  const approved = result.schedulerReworkAudit.status === "approved" || result.schedulerReworkAudit.status === "approved-with-notes";
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: approved ? "scheduler-first-worker-rework-audit-approved" : "scheduler-first-worker-rework-audit-blocked",
    text: renderSchedulerRuntimeWorkerReworkAuditMarkdown(result.schedulerReworkAudit),
    artifact: result.schedulerReworkAudit.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.schedulerReworkAudit.id,
    kind: "file-change",
    phase: approved ? "scheduler-first-worker-rework-audit-approved" : "scheduler-first-worker-rework-audit-blocked",
    title: approved ? "第一个 scheduler worker rework 审计通过" : "第一个 scheduler worker rework 审计阻塞",
    summary: "Ran one scoped Audit on the same scheduler rework worktree. No next worker, integration, apply, or merge was started.",
    artifactRef: result.schedulerReworkAudit.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-audit:${result.schedulerReworkAudit.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-audit-first",
    status: "completed",
    label: approved ? "第一个 worker rework 审计通过" : "第一个 worker rework 审计阻塞",
    summary: approved
      ? "Rework audit approved; the rework TaskRun is completed."
      : "Rework audit blocked or failed; the current rework path is blocked and no follow-up gate was started.",
    targetId: result.schedulerReworkAudit.id,
    runId: result.schedulerReworkAudit.auditRunId,
    artifact: result.schedulerReworkAudit.artifact,
    actionId: "planning.scheduler.worker.rework-audit-first",
    payload: {
      schedulerRunId: result.schedulerReworkAudit.schedulerRunId,
      schedulerClaimReservationId: result.schedulerReworkAudit.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerReworkAudit.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerReworkAudit.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerReworkAudit.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.schedulerReworkAudit.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.schedulerReworkAudit.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.schedulerReworkAudit.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: result.schedulerReworkAudit.schedulerWorkerReworkResultId,
      schedulerWorkerReworkValidationId: result.schedulerReworkAudit.schedulerWorkerReworkValidationId,
      schedulerWorkerReworkAuditId: result.schedulerReworkAudit.id,
      reservationIntentId: result.schedulerReworkAudit.reservationIntentId,
      claimIntentId: result.schedulerReworkAudit.claimIntentId,
      nodeId: result.schedulerReworkAudit.nodeId,
      unitId: result.schedulerReworkAudit.unitId,
      originalTaskRunId: result.schedulerReworkAudit.originalTaskRunId,
      taskRunId: result.schedulerReworkAudit.reworkTaskRunId,
      originalWorkerLeaseId: result.schedulerReworkAudit.originalWorkerLeaseId,
      workerLeaseId: result.schedulerReworkAudit.reworkWorkerLeaseId,
      worktreeId: result.schedulerReworkAudit.worktreeId,
      originalRunId: result.schedulerReworkAudit.originalCodeRunId,
      runId: result.schedulerReworkAudit.reworkRunId,
      reworkRunId: result.schedulerReworkAudit.reworkRunId,
      validationRunId: result.schedulerReworkAudit.validationRunId,
      reworkValidationRunId: result.schedulerReworkAudit.validationRunId,
      auditRunId: result.schedulerReworkAudit.auditRunId,
      reworkAuditRunId: result.schedulerReworkAudit.auditRunId,
      auditStatus: result.schedulerReworkAudit.auditStatus,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function compilePlanningSchedulerIntegrationCandidate(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerIntegrationCandidateResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler integration candidate");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.integration-candidate.compile requires schedulerRunId.");
  const result = await compileSchedulerIntegrationCandidate(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-integration-candidate-compiled",
    text: renderSchedulerIntegrationCandidateMarkdown(result.candidate),
    artifact: result.candidate.artifact,
  });
  emitAssistantEvent(live, {
    runId: result.candidate.schedulerRunId,
    kind: "file-change",
    phase: "scheduler-integration-candidate-compiled",
    title: "Scheduler integration candidate compiled",
    summary: result.candidate.readyCount >= 2
      ? `Scheduler integration candidate has ${result.candidate.readyCount} ready target(s). No IntegrationCheck or apply was started.`
      : `Scheduler integration candidate is waiting for more ready worker outputs (${result.candidate.readyCount}/2). No IntegrationCheck or apply was started.`,
    artifactRef: result.candidate.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-integration-candidate:${result.candidate.id}`,
    changeId,
    decisionType: "planning.scheduler.integration-candidate.compile",
    status: "completed",
    label: "Scheduler Integration Candidate 已生成",
    summary: "Compiled scheduler worker outputs into integration candidate evidence without running IntegrationCheck, apply, merge, or another worker.",
    targetId: result.candidate.id,
    runId: null,
    artifact: result.candidate.artifact,
    actionId: "planning.scheduler.integration-candidate.compile",
    payload: {
      candidate: result.candidate,
      schedulerIntegrationCandidateId: result.candidate.id,
      schedulerRunId: result.candidate.schedulerRunId,
      schedulerClaimReservationId: result.candidate.schedulerClaimReservationId,
      schedulerReconcileSnapshotId: result.candidate.schedulerReconcileSnapshotId,
      readyWorktreeIds: result.candidate.readyWorktreeIds,
      readyCount: result.candidate.readyCount,
      blockedCount: result.candidate.blockedCount,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function confirmTaskQueueProposalAndStart(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "TaskQueueProposal start");
  if (!request.taskQueueProposalId) throw new Error("planning.taskqueue.confirm-start requires taskQueueProposalId.");
  if (!request.workflowGraphPlanId) throw new Error("planning.taskqueue.confirm-start requires workflowGraphPlanId.");
  if (!request.readinessManifestId) throw new Error("planning.taskqueue.confirm-start requires readinessManifestId.");
  if (!request.decompositionPlanId) throw new Error("planning.taskqueue.confirm-start requires decompositionPlanId.");
  const proposal = await readLatestTaskQueueProposal(memory, changePath);
  if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed" || proposal.decompositionPlanId !== request.decompositionPlanId || proposal.readinessManifestId !== request.readinessManifestId) {
    throw new Error("planning.taskqueue.confirm-start target is stale or no longer startable.");
  }
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
    throw new Error("planning.taskqueue.confirm-start readiness target is stale.");
  }
  const graph = await readWorkflowGraphPlan(memory, changePath, request.workflowGraphPlanId);
  if (graph.status !== "compiled" || graph.changeId !== changeId || graph.taskQueueProposalId !== proposal.id || graph.readinessManifestId !== manifest.id) {
    throw new Error("planning.taskqueue.confirm-start graph target is stale.");
  }
  const latestGraph = await readLatestWorkflowGraphPlan(memory, changePath);
  if (latestGraph.id !== graph.id) throw new Error("planning.taskqueue.confirm-start requires the latest matching WorkflowGraphPlan.");
  const validated = await validateWorkflowTaskQueueProposalStart(memory, project, changeId, proposal.id, graph.id);
  const workflow = await createWorkflowRunForValidatedTaskQueue(memory, project, validated);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "taskqueue-starting",
    text: `WorkflowGraphPlan ${graph.id} confirmed for start; starting scoped sequential TaskQueue through WorkflowRun ${workflow.id}.`,
    artifact: graph.artifact,
  });
  const result = await runTaskQueueSequence(project, changeId, {
    ...request,
    actionType: "task.queue.start",
    taskQueueProposalId: proposal.id,
    workflowGraphPlanId: graph.id,
    readinessManifestId: manifest.id,
    decompositionPlanId: proposal.decompositionPlanId,
    workflowRunId: workflow.id,
  }, live);
  return result;
}
