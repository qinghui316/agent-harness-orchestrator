export interface SchedulerUserFacingActionCopy {
  label: string;
  summary: string;
  whyNeedsConfirmation: string;
  confirmEffect: string;
  riskSummary: string;
}

const DEFAULT_COPY: SchedulerUserFacingActionCopy = {
  label: "继续当前 scheduler 阶段",
  summary: "主 Agent 已判断出当前 scheduler run 的下一步。",
  whyNeedsConfirmation: "这是 Harness 阶段门：确认后只推进一个当前合法 scheduler transition。",
  confirmEffect: "服务端会重读 scoped evidence 并执行一个对应的 typed scheduler action。",
  riskSummary: "不会自动循环执行、不会 start-all、不会绕过 ToolPolicyGate、IntegrationCheck、apply 或 human gate。",
};

const COPY_BY_ACTION_TYPE: Record<string, SchedulerUserFacingActionCopy> = {
  "planning.scheduler.plan.prepare": {
    label: "准备并行执行计划",
    summary: "主 Agent 将补齐并行执行前的内部证据，并在对话里解释计划。",
    whyNeedsConfirmation: "需要你确认进入并行计划准备阶段；这不是执行 worker。",
    confirmEffect: "只生成或读取 scheduler pre-executor evidence 和 launch brief。",
    riskSummary: "不会创建 TaskRun、WorkerLease、worktree、run、child Change 或启动 scheduler executor。",
  },
  "planning.scheduler.run.prepare": {
    label: "确认启动这个并行执行计划",
    summary: "主 Agent 已解释计划；确认后记录 SchedulerRun launch intent。",
    whyNeedsConfirmation: "需要你确认整体启动意图；这仍不是 start-all。",
    confirmEffect: "只记录 SchedulerRun journal shell 和 human-gated launch evidence。",
    riskSummary: "不会启动 worker、分配 slot、创建 worktree/run 或绕过后续 worker gate。",
  },
  "planning.scheduler.worker.start-first": continueNextTaskCopy(),
  "planning.scheduler.worker.start-next": continueNextTaskCopy(),
  "planning.scheduler.worker.reconcile-result": checkCurrentEvidenceCopy(),
  "planning.scheduler.worker.validate-first": checkCurrentEvidenceCopy(),
  "planning.scheduler.worker.audit-first": checkCurrentEvidenceCopy(),
  "planning.scheduler.worker.rework-reconcile-result": checkCurrentEvidenceCopy(),
  "planning.scheduler.worker.rework-validate-first": checkCurrentEvidenceCopy(),
  "planning.scheduler.worker.rework-audit-first": checkCurrentEvidenceCopy(),
  "planning.scheduler.worker.rework-plan.compile": handleCurrentBlockageCopy(),
  "planning.scheduler.worker.rework-start-first": handleCurrentBlockageCopy(),
  "planning.scheduler.integration-candidate.compile": checkCombinedResultCopy(),
  "planning.scheduler.integration-check.run": checkCombinedResultCopy(),
  "planning.scheduler.integration-outcome.reconcile": checkCombinedResultCopy(),
  "planning.scheduler.run.complete": {
    label: "完成执行记录",
    summary: "当前 scheduler run 已到达可记录完成状态。",
    whyNeedsConfirmation: "需要你确认写入 terminal scheduler evidence。",
    confirmEffect: "只记录 SchedulerRun completion evidence；source mutation 仍属于既有 apply gate。",
    riskSummary: "不会启动 worker、运行 IntegrationCheck、apply、landing、PR、merge 或 child Change。",
  },
  "planning.scheduler.run.close-blocked": {
    label: "标记无法继续",
    summary: "当前 scheduler run 无法达到 IntegrationCheck 条件，且没有合法继续路径。",
    whyNeedsConfirmation: "需要你确认把本次 scheduler run 标记为 blocked/exhausted。",
    confirmEffect: "只写 scheduler closeout evidence 和 journal state。",
    riskSummary: "不会启动 worker、运行 IntegrationCheck、apply、merge 或修改 source root。",
  },
};

export function schedulerUserFacingActionCopy(actionType: string | undefined): SchedulerUserFacingActionCopy {
  if (!actionType) return DEFAULT_COPY;
  return COPY_BY_ACTION_TYPE[actionType] ?? DEFAULT_COPY;
}

export function schedulerUserFacingActionLabel(actionType: string | undefined): string {
  return schedulerUserFacingActionCopy(actionType).label;
}

function continueNextTaskCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "继续执行下一个任务",
    summary: "主 Agent 已找到当前 scheduler run 的下一个可执行 worker 步骤。",
    whyNeedsConfirmation: "需要你确认启动一个 scoped scheduler worker；不是启动整波任务。",
    confirmEffect: "只会启动一个当前合法 worker transition，并保留完整 scheduler/action evidence scope。",
    riskSummary: "不会自动启动 validation、audit、rework、start-next 循环、whole-wave dispatch 或 slot allocator。",
  };
}

function checkCurrentEvidenceCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "检查当前结果",
    summary: "主 Agent 将补齐当前 worker path 的下一份质量或结果证据。",
    whyNeedsConfirmation: "需要你确认执行当前证据 gate；它只覆盖当前 scoped worker path。",
    confirmEffect: "只会运行或记录一个当前合法 result/validation/audit evidence transition。",
    riskSummary: "不会启动下一个 worker、whole wave、scheduler loop、apply、merge 或 child Change。",
  };
}

function handleCurrentBlockageCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "处理当前阻塞",
    summary: "主 Agent 已发现当前 worker path 需要 rework 或阻塞处理。",
    whyNeedsConfirmation: "需要你确认处理当前阻塞；它不代表继续整条 scheduler run。",
    confirmEffect: "只会生成 rework 计划或启动一个 scoped same-worktree rework transition。",
    riskSummary: "不会启动新 worker、whole wave、scheduler loop、IntegrationCheck、apply 或 merge。",
  };
}

function checkCombinedResultCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "检查组合结果",
    summary: "主 Agent 将检查多个 scheduler worker 输出是否能进入既有 integration safety chain。",
    whyNeedsConfirmation: "需要你确认桥接到组合结果检查；source apply 仍有单独 human gate。",
    confirmEffect: "只会生成/记录 integration candidate、handoff 或 outcome evidence。",
    riskSummary: "不会创建 scheduler-owned apply/discard、landing、PR、merge、next-worker loop 或 source-root mutation。",
  };
}
