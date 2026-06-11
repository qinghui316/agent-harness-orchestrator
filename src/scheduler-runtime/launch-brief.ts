import type { SchedulerRuntimeClaimReservation, SchedulerReconcileSnapshot, SchedulerRuntimeState } from "./types.js";
import type { SchedulerRun } from "../workflow-scheduler/types.js";

export interface SchedulerLaunchBrief {
  version: "1.0";
  changeId: string;
  schedulerRunId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  status: "ready" | "blocked";
  summary: string;
  firstWaveSummary: string;
  riskSummary: string;
  userCanModify: string[];
  plannedWorkerCount: number;
  reservedCount: number;
  blockedCount: number;
  waveCount: number;
  maxPlannedWaveWidth: number;
  sourceLockCount: number;
  futureToolPolicyGateRequired: boolean;
  futureHumanGateRequired: boolean;
}

export function buildSchedulerLaunchBrief(
  run: SchedulerRun,
  state: SchedulerRuntimeState,
  snapshot: SchedulerReconcileSnapshot,
  reservation: SchedulerRuntimeClaimReservation,
): SchedulerLaunchBrief {
  assertBriefScope(run, state, snapshot, reservation);
  const firstRunnableWave = reservation.waves.find((wave) => wave.reservedCount > 0);
  const firstWaveSummary = firstRunnableWave
    ? `第 ${firstRunnableWave.waveIndex + 1} 波预计可并行预占 ${firstRunnableWave.reservedCount} 个 claim intent，后续仍需真正 executor 重新校验后才能启动 worker。`
    : "当前没有可预占的并行 claim intent；需要先处理 blocked reason 或重新生成计划。";
  const status = reservation.status === "reserved" && reservation.reservedCount > 0 ? "ready" : "blocked";
  return {
    version: "1.0",
    changeId: run.changeId,
    schedulerRunId: run.id,
    schedulerReconcileSnapshotId: snapshot.id,
    schedulerClaimReservationId: reservation.id,
    status,
    summary: status === "ready"
      ? `并行执行计划已准备好：${reservation.reservedCount} 个 claim intent 可作为未来 worker 启动候选，${reservation.blockedCount} 个仍阻塞。`
      : `并行执行计划目前仍阻塞：${reservation.blockedCount} 个 claim intent 无法进入启动候选。`,
    firstWaveSummary,
    riskSummary: "这只是启动说明和 Harness 阶段确认；真正 parallel executor 后续仍必须重新读取 scoped evidence、执行 ToolPolicyGate，并再次经过 human gate。",
    userCanModify: [
      "要求主 Agent 调整拆分计划或 source scope",
      "要求重新生成 scheduler evidence",
      "先处理 blocked reason 后再准备并行执行计划",
      "暂不启动，回到普通顺序执行或人工修改计划",
    ],
    plannedWorkerCount: state.claimIntents.length,
    reservedCount: reservation.reservedCount,
    blockedCount: reservation.blockedCount,
    waveCount: state.waves.length,
    maxPlannedWaveWidth: run.maxPlannedWaveWidth,
    sourceLockCount: reservation.sourceLockCount,
    futureToolPolicyGateRequired: run.futureToolPolicyGateRequired,
    futureHumanGateRequired: run.futureHumanGateRequired,
  };
}

export function renderSchedulerLaunchBriefMarkdown(brief: SchedulerLaunchBrief): string {
  const lines = [
    "# 并行执行计划说明",
    "",
    `- 状态：${brief.status === "ready" ? "可进入后续启动确认" : "仍有阻塞"}`,
    `- SchedulerRun：${brief.schedulerRunId}`,
    `- Reconcile Snapshot：${brief.schedulerReconcileSnapshotId}`,
    `- Claim Reservation：${brief.schedulerClaimReservationId}`,
    `- 预计 worker / claim intent：${brief.plannedWorkerCount}`,
    `- 可预占：${brief.reservedCount}`,
    `- 阻塞：${brief.blockedCount}`,
    `- wave 数：${brief.waveCount}`,
    `- 最大计划并行宽度：${brief.maxPlannedWaveWidth}`,
    `- source lock 数：${brief.sourceLockCount}`,
    "",
    "## 主 Agent 判断",
    "",
    brief.summary,
    "",
    brief.firstWaveSummary,
    "",
    "## 仍需确认的边界",
    "",
    `- ToolPolicyGate：${brief.futureToolPolicyGateRequired ? "真正启动 worker 前必须重新执行" : "当前 evidence 未要求"}`,
    `- Human gate：${brief.futureHumanGateRequired ? "真正启动 worker 前必须再次确认" : "当前 evidence 未要求"}`,
    `- 风险：${brief.riskSummary}`,
    "",
    "## 你可以要求修改",
    "",
    ...brief.userCanModify.map((item) => `- ${item}`),
  ];
  return `${lines.join("\n")}\n`;
}

function assertBriefScope(
  run: SchedulerRun,
  state: SchedulerRuntimeState,
  snapshot: SchedulerReconcileSnapshot,
  reservation: SchedulerRuntimeClaimReservation,
): void {
  if (state.changeId !== run.changeId || snapshot.changeId !== run.changeId || reservation.changeId !== run.changeId) {
    throw new Error("Scheduler launch brief changeId scope mismatch.");
  }
  if (state.schedulerRunId !== run.id || snapshot.schedulerRunId !== run.id || reservation.schedulerRunId !== run.id) {
    throw new Error("Scheduler launch brief SchedulerRun scope mismatch.");
  }
  if (snapshot.id !== reservation.schedulerReconcileSnapshotId || state.id !== snapshot.schedulerRuntimeStateId || state.id !== reservation.schedulerRuntimeStateId) {
    throw new Error("Scheduler launch brief runtime lineage mismatch.");
  }
}
