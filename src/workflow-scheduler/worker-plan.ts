import { mkdir } from "node:fs/promises";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory, WorkflowGraphStage } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { unique } from "../workflow-artifacts/utils.js";
import { schedulerWorkerSessionPlansDir } from "./paths.js";
import {
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  schedulerWorkerSessionPlanArtifactRefs,
  writeSchedulerWorkerSessionPlan,
} from "./repository.js";
import type {
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerWorkerAdapterFamily,
  SchedulerWorkerEventSourceExpectation,
  SchedulerWorkerPlanNode,
  SchedulerWorkerPlanStage,
  SchedulerWorkerSessionPlan,
} from "./types.js";

export async function compileSchedulerWorkerSessionPlan(
  memory: ResolvedMemory,
  changePath: string,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): Promise<SchedulerWorkerSessionPlan> {
  await assertWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerWorkerSessionPlan dry-run");
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerWorkerSessionPlan contract");
  await validateWorkerSessionPlanInput(memory, changePath, dryRun, contract);

  const now = new Date().toISOString();
  const id = `scheduler-worker-plan-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${dryRun.changeId}:${dryRun.id}:${now}`).slice(0, 8)}`;
  await mkdir(schedulerWorkerSessionPlansDir(memory, changePath), { recursive: true });

  const plannedStages = buildPlannedStages(dryRun);
  const plannedNodes = buildPlannedNodes(dryRun, plannedStages);
  const blockedCount = plannedStages.filter((stage) => stage.status === "blocked").length + plannedNodes.filter((node) => node.status === "blocked").length;
  const refs = schedulerWorkerSessionPlanArtifactRefs(memory, changePath, id);
  const sourceRefs = unique(Object.keys(dryRun.sourceArtifactHashes));
  const plan: SchedulerWorkerSessionPlan = {
    version: "1.0",
    id,
    changeId: dryRun.changeId,
    status: "planned",
    schedulerMode: dryRun.schedulerMode,
    schedulerContractId: contract.id,
    schedulerDispatchDryRunId: dryRun.id,
    decompositionPlanId: dryRun.decompositionPlanId,
    readinessManifestId: dryRun.readinessManifestId,
    plannedNodes,
    plannedStages,
    plannedWorkerCount: plannedStages.filter((stage) => stage.status === "planned").length,
    stageCount: plannedStages.length,
    blockedCount,
    warningCount: unique(plannedStages.flatMap((stage) => stage.blockedReasons)).length,
    recoveryKeyCoverage: blockedCount ? "partial" : "complete",
    sourceArtifactHashes: await hashArtifactRefs(memory, sourceRefs),
    artifactRefs: unique([...sourceRefs, dryRun.artifact, dryRun.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerWorkerSessionPlan(memory, changePath, plan);
  return plan;
}

async function validateWorkerSessionPlanInput(memory: ResolvedMemory, changePath: string, dryRun: SchedulerDispatchDryRun, contract: SchedulerContract): Promise<void> {
  if (dryRun.status !== "generated") throw new Error("SchedulerWorkerSessionPlan requires a generated SchedulerDispatchDryRun.");
  if (contract.status !== "compiled") throw new Error("SchedulerWorkerSessionPlan requires a compiled SchedulerContract.");
  if (dryRun.schedulerMode !== "parallel-readiness-v1" || contract.schedulerMode !== "parallel-readiness-v1") {
    throw new Error("SchedulerWorkerSessionPlan requires parallel-readiness-v1 scheduler artifacts.");
  }
  if (dryRun.changeId !== contract.changeId) throw new Error("SchedulerWorkerSessionPlan dry-run and contract changeId mismatch.");
  if (dryRun.schedulerContractId !== contract.id) throw new Error("SchedulerWorkerSessionPlan dry-run does not match SchedulerContract.");
  if (dryRun.decompositionPlanId !== contract.decompositionPlanId) throw new Error("SchedulerWorkerSessionPlan decompositionPlanId mismatch.");
  if (dryRun.readinessManifestId !== contract.readinessManifestId) throw new Error("SchedulerWorkerSessionPlan readinessManifestId mismatch.");
  if (!dryRun.nodeVerdicts.length) throw new Error("SchedulerWorkerSessionPlan requires dry-run node verdicts.");

  const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, changePath);
  if (latestDryRun.id !== dryRun.id) throw new Error("SchedulerWorkerSessionPlan requires the latest SchedulerDispatchDryRun.");
  const latestContract = await readLatestSchedulerContract(memory, changePath);
  if (latestContract.id !== contract.id) throw new Error("SchedulerWorkerSessionPlan requires the latest SchedulerContract.");

  const expectedHashes = await hashArtifactRefs(memory, Object.keys(dryRun.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(expectedHashes)) {
    if (dryRun.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`SchedulerWorkerSessionPlan source artifact hash mismatch: ${artifact}.`);
    }
  }
}

function buildPlannedStages(dryRun: SchedulerDispatchDryRun): SchedulerWorkerPlanStage[] {
  return dryRun.nodeVerdicts.flatMap((node) => node.stages.map((stage, index) => {
    const roleId = roleForStage(stage);
    const adapterFamily = adapterForStage(stage);
    const blockedReasons = node.status === "blocked" ? node.blockedReasons : [];
    return {
      id: `${node.nodeId}:${stage}:${index + 1}`,
      nodeId: node.nodeId,
      unitId: node.unitId,
      waveIndex: node.waveIndex,
      stage,
      roleId,
      status: blockedReasons.length ? "blocked" : "planned",
      workspaceIntent: {
        kind: "future-local-worktree",
        sourceScopes: node.sourceScopes,
        requiresFreshWorktree: true,
      },
      adapterFamily,
      permissionProfile: workerPermissionProfileForRole(roleId),
      eventSourceExpectation: eventSourceExpectation(adapterFamily),
      recoveryKeyInputs: [
        { key: "changeId", value: dryRun.changeId },
        { key: "schedulerContractId", value: dryRun.schedulerContractId },
        { key: "schedulerDispatchDryRunId", value: dryRun.id },
        { key: "nodeId", value: node.nodeId },
        { key: "unitId", value: node.unitId },
        { key: "stage", value: stage },
        { key: "sourceScopes", value: node.sourceScopes },
      ],
      blockedReasons,
    } satisfies SchedulerWorkerPlanStage;
  }));
}

function buildPlannedNodes(dryRun: SchedulerDispatchDryRun, stages: SchedulerWorkerPlanStage[]): SchedulerWorkerPlanNode[] {
  return dryRun.nodeVerdicts.map((node) => {
    const stageIds = stages.filter((stage) => stage.nodeId === node.nodeId).map((stage) => stage.id);
    return {
      nodeId: node.nodeId,
      unitId: node.unitId,
      waveIndex: node.waveIndex,
      status: node.status === "blocked" ? "blocked" : "planned",
      stageIds,
      blockedReasons: node.blockedReasons,
    };
  });
}

function roleForStage(stage: WorkflowGraphStage): string {
  if (stage === "validation") return "validator";
  if (stage === "audit") return "auditor-agent";
  if (stage === "bounded-rework") return "rework-coder";
  return "coder-agent";
}

function adapterForStage(stage: WorkflowGraphStage): SchedulerWorkerAdapterFamily {
  if (stage === "validation") return "validation-command";
  if (stage === "audit") return "audit-codex-readonly";
  return "codex-code";
}

function eventSourceExpectation(adapterFamily: SchedulerWorkerAdapterFamily): SchedulerWorkerEventSourceExpectation {
  if (adapterFamily === "validation-command") {
    return {
      adapterFamily,
      expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "validation.command.started", "validation.command.exited", "external-execution.completed"],
    };
  }
  if (adapterFamily === "audit-codex-readonly") {
    return {
      adapterFamily,
      expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "audit.started", "codex.started", "codex.exited", "external-execution.completed"],
    };
  }
  return {
    adapterFamily,
    expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "codex.started", "codex.exited", "external-execution.completed"],
  };
}
