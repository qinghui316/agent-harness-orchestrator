export interface SchedulerUserFacingActionCopy {
  label: string;
  summary: string;
  whyNeedsConfirmation: string;
  confirmEffect: string;
  riskSummary: string;
}

const DEFAULT_COPY: SchedulerUserFacingActionCopy = {
  label: "继续当前执行步骤",
  summary: "主 Agent 已判断出低冲突任务路径的下一步。",
  whyNeedsConfirmation: "这是阶段门：确认后只推进当前这一项合法步骤。",
  confirmEffect: "服务端会重新读取当前证据和目标，只执行一个匹配的步骤。",
  riskSummary: "不会自动连续执行、批量启动任务、应用结果、关闭需求、远端落地或维护演进。",
};

const COPY_BY_ACTION_TYPE: Record<string, SchedulerUserFacingActionCopy> = {
  "planning.scheduler.plan.prepare": {
    label: "准备低冲突任务执行路径",
    summary: "主 Agent 将整理并校验低冲突任务执行前的必要证据，并在对话里解释计划。",
    whyNeedsConfirmation: "需要你确认进入低冲突任务执行准备阶段；这不是开始写代码。",
    confirmEffect: "只生成或读取执行准备证据和可读启动摘要。",
    riskSummary: "不会启动任务、创建工作副本、写入项目源码、应用结果或关闭需求。",
  },
  "planning.scheduler.run.prepare": {
    label: "确认低冲突执行方向",
    summary: "主 Agent 已解释执行方向；确认后只记录你的启动意图。",
    whyNeedsConfirmation: "需要你确认认可这个低冲突执行方向；这仍不是批量启动。",
    confirmEffect: "只记录可恢复的执行入口和人工确认依据。",
    riskSummary: "不会启动任务、分配并行资源、创建工作副本或绕过后续单步确认。",
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

export function knownSchedulerUserFacingActionLabel(actionType: string | undefined): string | undefined {
  if (!actionType) return undefined;
  return COPY_BY_ACTION_TYPE[actionType]?.label;
}

function continueNextTaskCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "继续执行下一个任务",
    summary: "主 Agent 已找到低冲突任务路径里的下一个可执行步骤。",
    whyNeedsConfirmation: "需要你确认只启动一个当前任务；不是启动全部任务。",
    confirmEffect: "只会启动一个当前合法任务步骤，并保留完整目标和证据范围。",
    riskSummary: "不会自动启动质量检查、修改循环、下一任务循环、批量启动任务或并行资源分配。",
  };
}

function checkCurrentEvidenceCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "检查当前结果",
    summary: "主 Agent 将补齐当前任务的下一份质量或结果证据。",
    whyNeedsConfirmation: "需要你确认检查当前任务证据；它只覆盖当前任务范围。",
    confirmEffect: "只会运行或记录一个当前合法的结果、验证或审查步骤。",
    riskSummary: "不会启动下一个任务、批量执行、自动应用、合并或创建子需求。",
  };
}

function handleCurrentBlockageCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "处理当前阻塞",
    summary: "主 Agent 已发现当前任务需要修改或阻塞处理。",
    whyNeedsConfirmation: "需要你确认处理当前阻塞；它不代表继续整条 scheduler run。",
    confirmEffect: "只会生成修改计划或启动一个同范围的修复步骤。",
    riskSummary: "不会启动新任务、批量执行、组合检查后的应用、自动应用或合并。",
  };
}

function checkCombinedResultCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "检查组合结果",
    summary: "主 Agent 将检查多个任务输出能否进入既有组合安全检查。",
    whyNeedsConfirmation: "需要你确认进入组合结果检查；应用到项目仍有单独人工确认。",
    confirmEffect: "只会生成或记录组合候选、交接或结果证据。",
    riskSummary: "不会自动应用、放弃、提交、创建 PR、合并、继续下一任务循环或修改项目源码。",
  };
}
