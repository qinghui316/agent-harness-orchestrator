import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { completeAgentTask, createAgentTask, recordMainAgentDecision } from "../../../agent-task/manager.js";
import { buildRunAgentRecord, resolveAgentRole } from "../../../agent/catalog.js";
import { buildAcMap } from "../../../ecl/anchors.js";
import { writeJsonFile } from "../../../fs/json.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
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
  readSchedulerContract,
  renderSchedulerDispatchDryRunMarkdown,
  renderSchedulerContractMarkdown,
  type SchedulerContract,
  type SchedulerDispatchDryRun,
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
