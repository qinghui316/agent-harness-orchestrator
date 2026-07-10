import { readSchedulerRuntimeLineage } from "../scheduler-runtime/guards.js";
import { findSchedulerRuntimeWorkerReworkStartForPlan, findSchedulerRuntimeWorkerStartForReservationIntent, readSchedulerRuntimeClaimReservation, readSchedulerRuntimeStateProjection, readSchedulerRuntimeWorkerReworkPlan } from "../scheduler-runtime/repository.js";
import { listTaskQueueItems } from "../task-queue/manager.js";
import { readTaskRun } from "../task-run/repository.js";
import type { ChangeStatus, ResolvedMemory } from "../types/index.js";
import { readWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import type { CodeExecutionGateVerdict, CodeRunOptions } from "./types.js";

export async function assertCodeExecutionGate(
  memory: ResolvedMemory,
  changeStatus: ChangeStatus,
  changeId: string,
  options: CodeRunOptions,
  roleId: string,
): Promise<CodeExecutionGateVerdict> {
  const mode = options.executionGate?.mode ?? (roleId === "rework-coder" ? "rework" : null);
  if (!mode) throw new Error("Code execution requires an explicit Workflow Runtime execution gate.");
  if (options.existingWorktreeId && mode !== "scheduler-claim-rework") {
    throw new Error("existingWorktreeId is only allowed for scheduler-claim-rework code execution.");
  }
  if (mode === "rework") {
    return { allowed: true, mode, changeId, taskRunId: options.taskRunId, taskIds: options.taskIds, reason: "Rework code execution remains scoped to existing result review evidence." };
  }
  const changePath = changeStatus.activeChanges.find((item) => item.name === changeId)?.path;
  if (!changePath) throw new Error(`Code execution gate cannot resolve active Change path for ${changeId}.`);

  if (mode === "workflow-graph") {
    const workflowGraphPlanId = options.executionGate?.workflowGraphPlanId;
    if (!workflowGraphPlanId) throw new Error("TaskQueue code execution requires workflowGraphPlanId.");
    const graph = await readWorkflowGraphPlan(memory, changePath, workflowGraphPlanId);
    if (graph.graphMode !== "sequential-v1") {
      throw new Error("TaskQueue code execution requires a sequential WorkflowGraphPlan.");
    }
    if (graph.changeId !== changeId || graph.authoringContractVersion !== "1.0" || graph.status !== "compiled") {
      throw new Error("TaskQueue code execution graph target is stale.");
    }
    const taskIds = options.taskIds ?? [];
    const graphTasks = new Set(graph.nodes.map((node) => node.taskId.toUpperCase()));
    for (const taskId of taskIds) {
      if (!graphTasks.has(taskId.toUpperCase())) throw new Error(`TaskQueue code execution task is not in WorkflowGraphPlan: ${taskId}.`);
    }
    const queueItems = await listTaskQueueItems(memory, changeId);
    if (options.taskRunId) {
      const matchingItem = queueItems.find((item) => item.taskRunId === options.taskRunId);
      if (!matchingItem || matchingItem.workflowGraphPlanId !== workflowGraphPlanId) {
        throw new Error("TaskQueue code execution taskRun is not scoped to the WorkflowGraphPlan.");
      }
    } else if (graph.nodes.length !== 1) {
      throw new Error("Direct code execution requires a single-node authored WorkflowGraphPlan.");
    }
    return {
      allowed: true,
      mode,
      changeId,
      workflowGraphPlanId,
      taskRunId: options.taskRunId,
      taskIds: options.taskIds,
      reason: "Compiled WorkflowGraphPlan authorizes task-scoped code execution.",
    };
  }

  if (mode === "scheduler-claim-reservation") {
    const schedulerRunId = options.executionGate?.schedulerRunId;
    const schedulerClaimReservationId = options.executionGate?.schedulerClaimReservationId;
    const reservationIntentId = options.executionGate?.reservationIntentId;
    const claimIntentId = options.executionGate?.claimIntentId;
    const nodeId = options.executionGate?.nodeId;
    const unitId = options.executionGate?.unitId;
    if (!schedulerRunId) throw new Error("Scheduler code execution requires schedulerRunId.");
    if (!schedulerClaimReservationId) throw new Error("Scheduler code execution requires schedulerClaimReservationId.");
    if (!reservationIntentId) throw new Error("Scheduler code execution requires reservationIntentId.");
    if (!claimIntentId) throw new Error("Scheduler code execution requires claimIntentId.");
    if (!nodeId) throw new Error("Scheduler code execution requires nodeId.");
    if (!unitId) throw new Error("Scheduler code execution requires unitId.");
    if (!options.taskRunId) throw new Error("Scheduler code execution requires taskRunId.");
    if ((options.taskIds?.length ?? 0) !== 1) throw new Error("Scheduler code execution requires exactly one task id.");
    if (roleId !== "coder-agent") throw new Error("Scheduler code execution currently only supports coder-agent runs.");
    const { run, contract } = await readSchedulerRuntimeLineage(memory, changePath, schedulerRunId);
    if (run.changeId !== changeId || run.status !== "prepared") throw new Error("Scheduler code execution SchedulerRun target is stale.");
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, changePath, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId || runtimeState.changeId !== changeId) {
      throw new Error("Scheduler code execution requires initialized runtime state with latest reservation.");
    }
    const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, schedulerClaimReservationId);
    if (
      reservation.changeId !== changeId
      || reservation.id !== runtimeState.lastClaimReservationId
      || reservation.schedulerReconcileSnapshotId !== runtimeState.lastReconcileSnapshotId
      || runtimeState.lastClaimReservationSnapshotId !== runtimeState.lastReconcileSnapshotId
      || reservation.status !== "reserved"
    ) {
      throw new Error("Scheduler code execution claim reservation target is stale or not reserved.");
    }
    const intent = reservation.reservationIntents.find((item) =>
      item.reservationIntentId === reservationIntentId
      && item.claimIntentId === claimIntentId
      && item.nodeId === nodeId
      && item.unitId === unitId
      && item.status === "reserved"
    );
    if (!intent) throw new Error("Scheduler code execution reservation intent is stale or not runnable.");
    const existing = await findSchedulerRuntimeWorkerStartForReservationIntent(memory, changePath, run.id, intent.reservationIntentId);
    if (existing) throw new Error("Scheduler code execution reservation intent already started.");
    const node = contract.nodes.find((item) => item.id === nodeId && item.unitId === unitId);
    if (!node || node.taskIds.length !== 1 || node.taskIds[0].toUpperCase() !== options.taskIds?.[0]?.toUpperCase()) {
      throw new Error("Scheduler code execution task scope does not match SchedulerContract node.");
    }
    const taskRun = await readTaskRun(memory, changeId, options.taskRunId);
    if (taskRun.changeId !== changeId || taskRun.taskId.toUpperCase() !== node.taskIds[0].toUpperCase() || taskRun.roleId !== "coder") {
      throw new Error("Scheduler code execution TaskRun scope does not match the selected scheduler claim.");
    }
    if (!["claimed", "running"].includes(taskRun.status)) {
      throw new Error(`Scheduler code execution TaskRun is not runnable from status ${taskRun.status}.`);
    }
    return {
      allowed: true,
      mode,
      changeId,
      schedulerRunId,
      schedulerClaimReservationId,
      reservationIntentId,
      claimIntentId,
      nodeId,
      unitId,
      taskRunId: options.taskRunId,
      taskIds: options.taskIds,
      reason: "Scoped SchedulerRuntimeClaimReservation authorizes one coder-stage worker start.",
    };
  }

  if (mode === "scheduler-claim-rework") {
    const schedulerRunId = options.executionGate?.schedulerRunId;
    const schedulerWorkerReworkPlanId = options.executionGate?.schedulerWorkerReworkPlanId;
    const schedulerClaimReservationId = options.executionGate?.schedulerClaimReservationId;
    const schedulerWorkerValidationId = options.executionGate?.schedulerWorkerValidationId;
    const schedulerWorkerAuditId = options.executionGate?.schedulerWorkerAuditId;
    const reservationIntentId = options.executionGate?.reservationIntentId;
    const claimIntentId = options.executionGate?.claimIntentId;
    const nodeId = options.executionGate?.nodeId;
    const unitId = options.executionGate?.unitId;
    if (!schedulerRunId) throw new Error("Scheduler rework code execution requires schedulerRunId.");
    if (!schedulerWorkerReworkPlanId) throw new Error("Scheduler rework code execution requires schedulerWorkerReworkPlanId.");
    if (!schedulerClaimReservationId) throw new Error("Scheduler rework code execution requires schedulerClaimReservationId.");
    if (!schedulerWorkerValidationId) throw new Error("Scheduler rework code execution requires schedulerWorkerValidationId.");
    if (!reservationIntentId) throw new Error("Scheduler rework code execution requires reservationIntentId.");
    if (!claimIntentId) throw new Error("Scheduler rework code execution requires claimIntentId.");
    if (!nodeId) throw new Error("Scheduler rework code execution requires nodeId.");
    if (!unitId) throw new Error("Scheduler rework code execution requires unitId.");
    if (!options.taskRunId) throw new Error("Scheduler rework code execution requires taskRunId.");
    if (!options.existingWorktreeId) throw new Error("Scheduler rework code execution requires existingWorktreeId.");
    if ((options.taskIds?.length ?? 0) !== 1) throw new Error("Scheduler rework code execution requires exactly one task id.");
    if (roleId !== "rework-coder") throw new Error("Scheduler rework code execution requires rework-coder role.");
    const { run } = await readSchedulerRuntimeLineage(memory, changePath, schedulerRunId);
    if (run.changeId !== changeId || run.status !== "prepared") throw new Error("Scheduler rework code execution SchedulerRun target is stale.");
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, changePath, run.id);
    if (!runtimeState?.lastClaimReservationId || runtimeState.changeId !== changeId) {
      throw new Error("Scheduler rework code execution requires initialized runtime state with latest reservation.");
    }
    const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, changePath, run.id, schedulerWorkerReworkPlanId);
    if (
      reworkPlan.changeId !== changeId
      || reworkPlan.schedulerRunId !== run.id
      || reworkPlan.schedulerRuntimeStateId !== runtimeState.id
      || reworkPlan.schedulerClaimReservationId !== schedulerClaimReservationId
      || reworkPlan.schedulerWorkerValidationId !== schedulerWorkerValidationId
      || (reworkPlan.schedulerWorkerAuditId ?? undefined) !== (schedulerWorkerAuditId ?? undefined)
      || reworkPlan.reservationIntentId !== reservationIntentId
      || reworkPlan.claimIntentId !== claimIntentId
      || reworkPlan.nodeId !== nodeId
      || reworkPlan.unitId !== unitId
      || reworkPlan.targetWorktreeId !== options.existingWorktreeId
      || reworkPlan.futureCodeGateMode !== "scheduler-claim-rework"
    ) {
      throw new Error("Scheduler rework code execution rework plan target is stale.");
    }
    const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, schedulerClaimReservationId);
    if (reservation.id !== runtimeState.lastClaimReservationId || reservation.changeId !== changeId) {
      throw new Error("Scheduler rework code execution claim reservation target is stale.");
    }
    const existing = await findSchedulerRuntimeWorkerReworkStartForPlan(memory, changePath, run.id, reworkPlan.id);
    if (existing) throw new Error("Scheduler rework code execution rework plan already started.");
    if (reworkPlan.taskId.toUpperCase() !== options.taskIds?.[0]?.toUpperCase()) {
      throw new Error("Scheduler rework code execution task scope does not match rework plan.");
    }
    const taskRun = await readTaskRun(memory, changeId, options.taskRunId);
    if (taskRun.changeId !== changeId || taskRun.taskId.toUpperCase() !== reworkPlan.taskId.toUpperCase() || taskRun.roleId !== "rework-coder") {
      throw new Error("Scheduler rework code execution TaskRun scope does not match the selected rework plan.");
    }
    if (!["claimed", "running"].includes(taskRun.status)) {
      throw new Error(`Scheduler rework code execution TaskRun is not runnable from status ${taskRun.status}.`);
    }
    return {
      allowed: true,
      mode,
      changeId,
      schedulerRunId,
      schedulerClaimReservationId,
      schedulerWorkerReworkPlanId,
      schedulerWorkerValidationId,
      schedulerWorkerAuditId,
      reservationIntentId,
      claimIntentId,
      nodeId,
      unitId,
      taskRunId: options.taskRunId,
      taskIds: options.taskIds,
      reason: "Scoped SchedulerRuntimeWorkerReworkPlan authorizes one same-worktree rework-coder start.",
    };
  }

  throw new Error(`Unsupported code execution gate mode: ${mode}.`);
}
