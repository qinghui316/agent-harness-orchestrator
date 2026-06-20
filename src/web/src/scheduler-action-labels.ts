export function schedulerUserFacingActionLabel(actionType: string | undefined): string | null {
  if (!actionType?.startsWith("planning.scheduler.")) return null;
  if (actionType === "planning.scheduler.plan.prepare") return "准备并行执行计划";
  if (actionType === "planning.scheduler.run.prepare") return "确认启动这个并行执行计划";
  if (actionType === "planning.scheduler.controlled-step.run") return "执行一个受控 scheduler 步骤";
  if (actionType === "planning.scheduler.worker.start-first" || actionType === "planning.scheduler.worker.start-next") {
    return "继续执行下一个任务";
  }
  if (
    actionType === "planning.scheduler.worker.reconcile-result"
    || actionType === "planning.scheduler.worker.validate-first"
    || actionType === "planning.scheduler.worker.audit-first"
    || actionType === "planning.scheduler.worker.rework-reconcile-result"
    || actionType === "planning.scheduler.worker.rework-validate-first"
    || actionType === "planning.scheduler.worker.rework-audit-first"
  ) {
    return "检查当前结果";
  }
  if (actionType === "planning.scheduler.worker.rework-plan.compile" || actionType === "planning.scheduler.worker.rework-start-first") {
    return "处理当前阻塞";
  }
  if (
    actionType === "planning.scheduler.integration-candidate.compile"
    || actionType === "planning.scheduler.integration-check.run"
    || actionType === "planning.scheduler.integration-outcome.reconcile"
  ) {
    return "检查组合结果";
  }
  if (actionType === "planning.scheduler.run.complete") return "完成执行记录";
  if (actionType === "planning.scheduler.run.close-blocked") return "标记无法继续";
  return "继续当前 scheduler 阶段";
}
