export interface SchedulerUserFacingActionCopy {
  label: string;
  summary: string;
  whyNeedsConfirmation: string;
  confirmEffect: string;
  riskSummary: string;
}

const DEFAULT_COPY: SchedulerUserFacingActionCopy = {
  label: "继续当前步骤",
  summary: "下一项处理已经准备好。",
  whyNeedsConfirmation: "确认后只处理这一项。",
  confirmEffect: "系统会先检查当前状态，然后处理这一项。",
  riskSummary: "不会自动处理其他事项，也不会提交或合并代码。",
};

const COPY_BY_ACTION_TYPE: Record<string, SchedulerUserFacingActionCopy> = {
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
    label: "记录本次结果",
    summary: "当前处理已经到达可以记录结果的阶段。",
    whyNeedsConfirmation: "确认后记录当前处理结果。",
    confirmEffect: "只更新处理状态和证据，不修改项目。",
    riskSummary: "不会开始任务、提交或合并代码。",
  },
  "planning.scheduler.run.close-blocked": {
    label: "结束当前处理",
    summary: "当前处理没有可行的继续步骤。",
    whyNeedsConfirmation: "确认后记录为暂时无法继续。",
    confirmEffect: "保留当前结果，等待后续处理。",
    riskSummary: "不会修改项目或开始新任务。",
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
    label: "继续下一个任务",
    summary: "上一个任务已完成，下一项可以开始。",
    whyNeedsConfirmation: "确认后只开始这一项。",
    confirmEffect: "只处理下一项，并在完成后返回结果。",
    riskSummary: "不会批量开始其他任务，也不会提交代码。",
  };
}

function checkCurrentEvidenceCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "检查当前结果",
    summary: "当前结果已准备好检查。",
    whyNeedsConfirmation: "确认后检查当前结果。",
    confirmEffect: "运行当前结果所需的检查，并显示结果。",
    riskSummary: "不会开始其他任务，也不会修改项目。",
  };
}

function handleCurrentBlockageCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "处理当前问题",
    summary: "当前任务需要修改或补充信息。",
    whyNeedsConfirmation: "确认后只处理这个问题。",
    confirmEffect: "根据已有结果生成同范围修复或请求补充。",
    riskSummary: "不会开始新任务或提交代码。",
  };
}

function checkCombinedResultCopy(): SchedulerUserFacingActionCopy {
  return {
    label: "检查多个结果",
    summary: "多个任务结果已准备好一起检查。",
    whyNeedsConfirmation: "确认后检查它们是否可以安全组合。",
    confirmEffect: "只做组合检查，不修改项目。",
    riskSummary: "不会提交、合并或继续其他任务。",
  };
}
