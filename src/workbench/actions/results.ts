export function extractRunId(result: unknown): string | undefined {
  if (isRecord(result) && isRecord(result.run) && typeof result.run.id === "string") return result.run.id;
  if (isRecord(result) && isRecord(result.code) && isRecord(result.code.run) && typeof result.code.run.id === "string") return result.code.run.id;
  if (isRecord(result) && isRecord(result.workflow) && isRecord(result.workflow.code) && isRecord(result.workflow.code.run) && typeof result.workflow.code.run.id === "string") return result.workflow.code.run.id;
  if (isRecord(result) && isRecord(result.result) && isRecord(result.result.run) && typeof result.result.run.id === "string") return result.result.run.id;
  return undefined;
}

export function artifactForActionResult(result: unknown): string | null {
  if (isRecord(result) && isRecord(result.package) && Array.isArray(result.package.artifactRefs) && typeof result.package.artifactRefs[0] === "string") return result.package.artifactRefs[0];
  if (isRecord(result) && isRecord(result.summary) && Array.isArray(result.summary.evidenceRefs) && typeof result.summary.evidenceRefs[0] === "string") return result.summary.evidenceRefs[0];
  if (isRecord(result) && isRecord(result.snapshot) && typeof result.snapshot.summaryArtifact === "string") return result.snapshot.summaryArtifact;
  if (isRecord(result) && isRecord(result.result) && Array.isArray(result.result.artifactRefs) && typeof result.result.artifactRefs[0] === "string") return result.result.artifactRefs[0];
  if (isRecord(result) && isRecord(result.readiness) && typeof result.readiness.summaryArtifact === "string") return result.readiness.summaryArtifact;
  if (isRecord(result) && isRecord(result.manifest) && typeof result.manifest.artifact === "string") return result.manifest.artifact;
  if (isRecord(result) && isRecord(result.contract) && typeof result.contract.artifact === "string") return result.contract.artifact;
  if (isRecord(result) && isRecord(result.launchPreflight) && typeof result.launchPreflight.artifact === "string") return result.launchPreflight.artifact;
  if (isRecord(result) && isRecord(result.schedulerRun) && typeof result.schedulerRun.artifact === "string") return result.schedulerRun.artifact;
  if (isRecord(result) && isRecord(result.runtimeState) && typeof result.runtimeState.artifact === "string") return result.runtimeState.artifact;
  if (isRecord(result) && isRecord(result.reconcileSnapshot) && typeof result.reconcileSnapshot.artifact === "string") return result.reconcileSnapshot.artifact;
  if (isRecord(result) && isRecord(result.handoff) && Array.isArray(result.handoff.artifactRefs) && typeof result.handoff.artifactRefs[0] === "string") return result.handoff.artifactRefs[0];
  if (isRecord(result) && isRecord(result.revision) && Array.isArray(result.revision.artifactRefs) && typeof result.revision.artifactRefs[0] === "string") return result.revision.artifactRefs[0];
  if (isRecord(result) && isRecord(result.run) && isRecord(result.run.artifacts) && typeof result.run.artifacts.directory === "string") return result.run.artifacts.directory;
  if (isRecord(result) && isRecord(result.code) && isRecord(result.code.run) && isRecord(result.code.run.artifacts) && typeof result.code.run.artifacts.directory === "string") return result.code.run.artifacts.directory;
  if (isRecord(result) && isRecord(result.workflow) && isRecord(result.workflow.code) && isRecord(result.workflow.code.run) && isRecord(result.workflow.code.run.artifacts) && typeof result.workflow.code.run.artifacts.directory === "string") return result.workflow.code.run.artifacts.directory;
  return null;
}

export function summarizeActionResult(actionType: string, result: unknown): string {
  if ((actionType === "landing.prepare" || actionType === "landing.review" || actionType === "landing.refresh") && isRecord(result) && isRecord(result.package)) {
    const summary = typeof result.package.summary === "string" ? result.package.summary : "Landing readiness package updated.";
    return summary;
  }
  if ((actionType === "landing-queue.prepare" || actionType === "landing-queue.refresh") && isRecord(result) && isRecord(result.snapshot)) {
    return typeof result.snapshot.summary === "string" ? result.snapshot.summary : "Landing queue refreshed.";
  }
  if (actionType === "landing-queue.merge-next" && isRecord(result) && isRecord(result.result)) {
    return typeof result.result.summary === "string" ? result.result.summary : "Landing queue merge step completed.";
  }
  if ((actionType === "pr-draft.prepare" || actionType === "pr-draft.create" || actionType === "pr-draft.refresh") && isRecord(result) && isRecord(result.package)) {
    const prUrl = typeof result.package.prUrl === "string" ? ` ${result.package.prUrl}` : "";
    return `Draft PR handoff updated.${prUrl}`;
  }
  if ((actionType === "pr-feedback.refresh" || actionType === "pr-feedback.evaluate" || actionType === "pr-review.feedback-refresh" || actionType === "pr-review.feedback-evaluate") && isRecord(result) && isRecord(result.summary)) {
    return typeof result.summary.summary === "string" ? result.summary.summary : "PR feedback refreshed.";
  }
  if ((actionType === "pr-feedback.rework" || actionType === "pr-review.rework") && isRecord(result)) {
    return "PR feedback rework was routed through the same demand.";
  }
  if (actionType === "pr-review.reply-prepare" && isRecord(result) && isRecord(result.draft)) {
    return "PR review reply draft prepared.";
  }
  if (actionType === "pr-review.reply-submit" && isRecord(result) && isRecord(result.handoff)) {
    return "PR review reply submitted.";
  }
  if (actionType === "pr-review.thread-resolve" && isRecord(result) && isRecord(result.resolution)) {
    return "PR review thread marked as handled.";
  }
  if (actionType === "pr-feedback.update-draft" && isRecord(result) && isRecord(result.package)) {
    const prUrl = typeof result.package.prUrl === "string" ? ` ${result.package.prUrl}` : "";
    return `Draft PR branch updated.${prUrl}`;
  }
  if ((actionType === "pr-review.prepare" || actionType === "pr-review.refresh") && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "PR review readiness refreshed.";
  }
  if (actionType === "pr-review.submit" && isRecord(result) && isRecord(result.handoff)) {
    const prUrl = typeof result.handoff.prUrl === "string" ? ` ${result.handoff.prUrl}` : "";
    return `Draft PR submitted for human review.${prUrl}`;
  }
  if ((actionType === "remote-landing.prepare" || actionType === "remote-landing.refresh") && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "Remote landing readiness refreshed.";
  }
  if (actionType === "remote-landing.merge" && isRecord(result) && isRecord(result.result)) {
    const status = typeof result.result.status === "string" ? result.result.status : "completed";
    const prUrl = typeof result.result.prUrl === "string" ? ` ${result.result.prUrl}` : "";
    return `Remote landing ${status}.${prUrl}`;
  }
  if ((actionType === "post-merge.prepare" || actionType === "post-merge.refresh") && isRecord(result) && isRecord(result.handoff)) {
    return typeof result.handoff.summary === "string" ? result.handoff.summary : "Post-merge state refreshed.";
  }
  if (actionType === "post-merge.sync-local.prepare" && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "Local sync readiness refreshed.";
  }
  if (actionType === "post-merge.sync-local.run" && isRecord(result) && isRecord(result.result)) {
    const status = typeof result.result.status === "string" ? result.result.status : "completed";
    return `Post-merge local sync ${status}.`;
  }
  if (actionType === "post-merge.cleanup-branch.prepare" && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "Remote branch cleanup readiness refreshed.";
  }
  if (actionType === "post-merge.cleanup-branch.run" && isRecord(result) && isRecord(result.result)) {
    const status = typeof result.result.status === "string" ? result.result.status : "completed";
    return `Post-merge remote branch cleanup ${status}.`;
  }
  if (actionType === "task.run.reconcile" && isRecord(result) && Array.isArray(result.taskRuns)) {
    return `Reconciled ${result.taskRuns.length} TaskRun record(s).`;
  }
  if (actionType === "task.queue.reconcile" && isRecord(result) && Array.isArray(result.queues)) {
    return `Recovered ${result.queues.length} task queue record(s).`;
  }
  if (actionType === "task.queue.start" && isRecord(result) && isRecord(result.queue)) {
    const status = typeof result.queue.status === "string" ? result.queue.status : "completed";
    const completed = typeof result.queue.completedCount === "number" ? result.queue.completedCount : 0;
    const total = typeof result.queue.totalCount === "number" ? result.queue.totalCount : 0;
    return `Task queue finished with status ${status}. Completed ${completed}/${total}.`;
  }
  if (actionType === "code.run" && isRecord(result)) {
    const stoppedAt = typeof result.stoppedAt === "string" && result.stoppedAt ? ` Stopped at ${result.stoppedAt}.` : " Validation and audit sequence completed.";
    return `Coder run was confirmed by the user.${stoppedAt}`;
  }
  if ((actionType === "task.run.start" || actionType === "task.run.retry") && isRecord(result) && isRecord(result.taskRun)) {
    const taskId = typeof result.taskRun.taskId === "string" ? result.taskRun.taskId : "task";
    const status = typeof result.taskRun.status === "string" ? result.taskRun.status : "completed";
    return `TaskRun for ${taskId} finished with status ${status}.`;
  }
  if ((actionType === "planning.generate" || actionType === "planning.revise") && isRecord(result) && isRecord(result.bundle)) {
    return `Planning draft is ready: ${typeof result.bundle.goal === "string" ? result.bundle.goal : "draft bundle"}.`;
  }
  if (actionType === "planning.decomposition.assess-readiness" && isRecord(result) && isRecord(result.manifest)) {
    return typeof result.manifest.status === "string"
      ? `Decomposition readiness assessed: ${result.manifest.status}. No execution was started.`
      : "Decomposition readiness assessed. No execution was started.";
  }
  if (actionType === "planning.taskqueue.propose" && isRecord(result) && isRecord(result.proposal)) {
    return typeof result.proposal.id === "string"
      ? `TaskQueueProposal ${result.proposal.id} generated. No execution was started.`
      : "TaskQueueProposal generated. No execution was started.";
  }
  if (actionType === "planning.workflowgraph.compile" && isRecord(result) && isRecord(result.graph)) {
    return typeof result.graph.id === "string"
      ? `WorkflowGraphPlan ${result.graph.id} compiled. No execution was started.`
      : "WorkflowGraphPlan compiled. No execution was started.";
  }
  if (actionType === "planning.scheduler.contract.compile" && isRecord(result) && isRecord(result.contract)) {
    return typeof result.contract.id === "string"
      ? `SchedulerContract ${result.contract.id} compiled. No execution was started.`
      : "SchedulerContract compiled. No execution was started.";
  }
  if (actionType === "planning.scheduler.dispatch.dry-run" && isRecord(result) && isRecord(result.dryRun)) {
    return typeof result.dryRun.id === "string"
      ? `Scheduler dispatch dry-run ${result.dryRun.id} generated. No execution was started.`
      : "Scheduler dispatch dry-run generated. No execution was started.";
  }
  if (actionType === "planning.scheduler.worker-plan.compile" && isRecord(result) && isRecord(result.workerPlan)) {
    return typeof result.workerPlan.id === "string"
      ? `Scheduler worker session plan ${result.workerPlan.id} compiled. No execution was started.`
      : "Scheduler worker session plan compiled. No execution was started.";
  }
  if (actionType === "planning.scheduler.claim-reconcile.compile" && isRecord(result) && isRecord(result.claimReconcilePlan)) {
    return typeof result.claimReconcilePlan.id === "string"
      ? `Scheduler claim/reconcile plan ${result.claimReconcilePlan.id} compiled. No execution was started.`
      : "Scheduler claim/reconcile plan compiled. No execution was started.";
  }
  if (actionType === "planning.scheduler.launch-preflight.check" && isRecord(result) && isRecord(result.launchPreflight)) {
    return typeof result.launchPreflight.id === "string"
      ? `Scheduler launch preflight ${result.launchPreflight.id} checked. No execution was started.`
      : "Scheduler launch preflight checked. No execution was started.";
  }
  if (actionType === "planning.scheduler.run.prepare" && isRecord(result) && isRecord(result.schedulerRun)) {
    return typeof result.schedulerRun.id === "string"
      ? `SchedulerRun ${result.schedulerRun.id} prepared. No execution was started.`
      : "SchedulerRun prepared. No execution was started.";
  }
  if (actionType === "planning.scheduler.runtime.initialize" && isRecord(result) && isRecord(result.runtimeState)) {
    return typeof result.runtimeState.schedulerRunId === "string"
      ? `Scheduler runtime shell for ${result.runtimeState.schedulerRunId} initialized. No execution was started.`
      : "Scheduler runtime shell initialized. No execution was started.";
  }
  if (actionType === "planning.scheduler.runtime.reconcile" && isRecord(result) && isRecord(result.reconcileSnapshot)) {
    return typeof result.reconcileSnapshot.id === "string"
      ? `Scheduler reconcile snapshot ${result.reconcileSnapshot.id} generated. No execution was started.`
      : "Scheduler reconcile snapshot generated. No execution was started.";
  }
  if (actionType === "planning.scheduler.runtime.reserve-claims" && isRecord(result) && isRecord(result.claimReservation)) {
    return typeof result.claimReservation.id === "string"
      ? `Scheduler claim reservation ${result.claimReservation.id} recorded. No execution was started.`
      : "Scheduler claim reservation recorded. No execution was started.";
  }
  if (actionType === "planning.confirm-execution" && isRecord(result)) {
    return "Planning confirmed and canonical artifacts were written. No execution was started.";
  }
  if ((actionType.startsWith("role.pipeline.") || actionType.startsWith("demand.worker.")) && isRecord(result)) {
    const status = typeof result.status === "string" ? result.status : "completed";
    return actionType.startsWith("demand.worker.")
      ? `Demand worker finished with status ${status}.`
      : `Main-agent role orchestration finished with status ${status}.`;
  }
  return `${labelForAction(actionType)} completed.`;
}

export function workflowFailureMessage(actionType: string, result: unknown): string | null {
  if (!isRecord(result)) return null;
  const workflow = (actionType === "task.run.start" || actionType === "task.run.retry") && isRecord(result.workflow) ? result.workflow : result;
  if (actionType !== "code.run" && actionType !== "task.run.start" && actionType !== "task.run.retry") return null;
  const stoppedAt = typeof workflow.stoppedAt === "string" ? workflow.stoppedAt : null;
  if (!stoppedAt) return null;
  if (stoppedAt === "code") return "Code workflow stopped because the Coder run did not complete successfully.";
  if (stoppedAt === "validation") return "Code workflow stopped because validation did not pass.";
  if (stoppedAt === "audit") return "Code workflow stopped because audit did not approve the worktree.";
  return `Code workflow stopped at ${stoppedAt}.`;
}

export function labelForAction(actionType: string): string {
  switch (actionType) {
    case "change.spec.propose": return "Spec proposal generated";
    case "change.spec.accept": return "Spec proposal accepted";
    case "change.plan.propose": return "Plan proposal generated";
    case "change.plan.accept": return "Plan proposal accepted";
    case "planning.generate": return "Planning draft generated";
    case "planning.revise": return "Planning draft revised";
    case "planning.confirm-execution": return "Planning confirmed";
    case "planning.decompose": return "DecompositionPlan drafted";
    case "planning.decomposition.confirm": return "DecompositionPlan confirmed";
    case "planning.decomposition.assess-readiness": return "Decomposition readiness assessed";
    case "planning.taskqueue.propose": return "TaskQueueProposal generated";
    case "planning.scheduler.contract.compile": return "SchedulerContract compiled";
    case "planning.scheduler.dispatch.dry-run": return "Scheduler dispatch dry-run generated";
    case "planning.scheduler.worker-plan.compile": return "Scheduler worker session plan compiled";
    case "planning.scheduler.claim-reconcile.compile": return "Scheduler claim/reconcile plan compiled";
    case "planning.scheduler.launch-preflight.check": return "Scheduler launch preflight checked";
    case "planning.scheduler.run.prepare": return "SchedulerRun prepared";
    case "planning.scheduler.runtime.initialize": return "Scheduler runtime shell initialized";
    case "planning.scheduler.runtime.reconcile": return "Scheduler runtime reconciled";
    case "planning.scheduler.runtime.reserve-claims": return "Scheduler runtime claims reserved";
    case "planning.workflowgraph.compile": return "WorkflowGraphPlan compiled";
    case "planning.taskqueue.confirm-start": return "TaskQueueProposal confirmed and started";
    case "orchestrator.evaluate": return "Main orchestrator evaluated";
    case "orchestrator.pump": return "Main orchestrator pumped available demands";
    case "demand.worker.enqueue": return "Demand enqueued";
    case "demand.worker.claim": return "Demand worker claimed";
    case "demand.worker.start-next": return "Demand worker started";
    case "demand.worker.start-available": return "Available demand workers started";
    case "demand.worker.reconcile": return "Demand workers reconciled";
    case "demand.worker.release": return "Demand worker released";
    case "role.pipeline.start": return "Role orchestration started";
    case "role.pipeline.stop": return "Role orchestration stop requested";
    case "role.pipeline.continue": return "Role orchestration continued";
    case "role.pipeline.reconcile": return "Role orchestration reconciled";
    case "conversation.steer": return "Conversation steering recorded";
    case "conversation.interrupt": return "Conversation interrupt requested";
    case "conversation.continue": return "Conversation continued";
    case "result.refresh-rework": return "Result refreshed against latest project state";
    case "result.revalidate": return "Result validation refreshed";
    case "result.reaudit": return "Result audit refreshed";
    case "result.refresh-status": return "Result status refreshed";
    case "apply-check.run": return "Integration check completed";
    case "landing.prepare": return "Landing readiness prepared";
    case "landing.review": return "Landing readiness reviewed";
    case "landing.refresh": return "Landing readiness refreshed";
    case "landing-queue.prepare": return "Landing queue prepared";
    case "landing-queue.refresh": return "Landing queue refreshed";
    case "landing-queue.merge-next": return "Landing queue merged next PR";
    case "landing-queue.skip": return "Landing queue item skipped";
    case "landing-queue.remove-stale": return "Landing queue stale item removed";
    case "pr-draft.prepare": return "PR draft package prepared";
    case "pr-draft.create": return "Draft PR created";
    case "pr-draft.refresh": return "Draft PR refreshed";
    case "pr-feedback.refresh": return "PR feedback refreshed";
    case "pr-feedback.evaluate": return "PR feedback evaluated";
    case "pr-feedback.rework": return "PR feedback rework started";
    case "pr-feedback.update-draft": return "Draft PR updated";
    case "pr-review.prepare": return "PR review readiness prepared";
    case "pr-review.submit": return "Draft PR submitted for review";
    case "pr-review.refresh": return "PR review state refreshed";
    case "pr-review.feedback-refresh": return "PR review feedback refreshed";
    case "pr-review.feedback-evaluate": return "PR review feedback evaluated";
    case "pr-review.rework": return "PR review feedback rework started";
    case "pr-review.reply-prepare": return "PR review reply draft prepared";
    case "pr-review.reply-submit": return "PR review reply submitted";
    case "pr-review.thread-resolve": return "PR review thread resolved";
    case "remote-landing.prepare": return "Remote landing readiness prepared";
    case "remote-landing.merge": return "Remote PR merged";
    case "remote-landing.refresh": return "Remote landing state refreshed";
    case "post-merge.prepare": return "Post-merge state prepared";
    case "post-merge.refresh": return "Post-merge state refreshed";
    case "post-merge.sync-local.prepare": return "Local sync readiness prepared";
    case "post-merge.sync-local.run": return "Local project synchronized";
    case "post-merge.cleanup-branch.prepare": return "Remote branch cleanup readiness prepared";
    case "post-merge.cleanup-branch.run": return "Remote PR branch cleaned up";
    case "code.run": return "Coder run confirmed";
    case "task.run.start": return "Task workflow started";
    case "task.run.retry": return "Task workflow retried";
    case "task.run.reconcile": return "Task runs reconciled";
    case "task.queue.start": return "Task queue started";
    case "task.queue.reconcile": return "Task queue reconciled";
    case "workpad.abandon": return "Workpad abandoned";
    case "validate.run": return "Validation run completed";
    case "audit.run": return "Audit run completed";
    case "spec-test.drift": return "Spec-Test drift checked";
    default: return actionType;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
