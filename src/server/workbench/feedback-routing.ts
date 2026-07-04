import type { WorkbenchWorkflowActionRequest } from "../../workbench/types.js";
import type { WorkbenchActionRequest } from "./types.js";

type FeedbackSnapshotAction = Record<string, unknown> & {
  id?: string;
  label?: string;
  kind?: string;
  enabled?: boolean;
  actionType?: string;
  changeId?: string;
  planningBundleId?: string;
  worktreeId?: string;
  applyCheckId?: string;
  runId?: string;
  artifact?: string;
  action?: { actionId?: string; label?: string };
};

export type FeedbackSnapshotPrimary = Record<string, unknown> & {
  id?: string;
  kind?: string;
  changeId?: string;
  resultId?: string;
  runId?: string;
  worktreeId?: string;
  applyCheckId?: string;
  planningBundleId?: string;
  evidenceRefs?: string[];
  actions?: FeedbackSnapshotAction[];
};

export type FeedbackRoute = {
  changeId: string | null;
  decisionType: string;
  actionId: string;
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  workflowRequest?: WorkbenchWorkflowActionRequest;
};

export function resolveFeedbackRouteFromPrimary(primary: FeedbackSnapshotPrimary, body: WorkbenchActionRequest): FeedbackRoute {
  const feedback = body.feedback?.trim();
  if (!feedback) {
    const error = new Error("Feedback action requires feedback text.");
    error.name = "BadRequest";
    throw error;
  }
  const feedbackAction = resolveCurrentFeedbackAction(primary, body);
  const context = body.feedbackContext ?? {};
  const changeId = stringOrNull(context.changeId ?? feedbackAction.changeId ?? primary.changeId);
  const targetId = stringOrNull(context.targetId ?? feedbackAction.worktreeId ?? primary.worktreeId ?? primary.applyCheckId ?? primary.resultId ?? feedbackAction.planningBundleId ?? primary.planningBundleId);
  const runId = stringOrNull(context.runId ?? feedbackAction.runId ?? primary.runId);
  const artifact = stringOrNull(context.artifact ?? feedbackAction.artifact ?? primary.evidenceRefs?.[0]);
  const label = typeof feedbackAction.label === "string" ? feedbackAction.label : "scoped feedback";
  const actionId = typeof feedbackAction.id === "string" ? feedbackAction.id : context.actionId ?? "scoped.feedback";
  const base: FeedbackRoute = {
    changeId,
    decisionType: feedbackAction.action?.actionId ?? actionId,
    actionId,
    label,
    summary: "User requested changes instead of accepting this decision.",
    targetId,
    runId,
    artifact,
  };

  const planningAction = primary.actions?.find((action) => action.kind === "workflow-action" && action.actionType === "planning.confirm-execution");
  const planningBundleId = stringOrNull(context.planningBundleId ?? feedbackAction.planningBundleId ?? primary.planningBundleId ?? planningAction?.planningBundleId);
  if (primary.kind === "planning-confirm" && planningAction?.actionType === "planning.confirm-execution" && changeId && planningBundleId) {
    return {
      ...base,
      decisionType: "planning.feedback",
      targetId: planningBundleId,
      workflowRequest: {
        actionType: "planning.revise",
        changeId,
        planningBundleId,
        feedback,
        prompt: [
          "用户在计划确认点提出修改意见。请基于当前需求、上一版计划和这条反馈修订计划。",
          "",
          `当前 planningBundleId: ${planningBundleId}`,
          "",
          "用户反馈：",
          feedback,
        ].join("\n"),
      },
    };
  }

  const worktreeId = stringOrNull(context.worktreeId ?? feedbackAction.worktreeId ?? primary.worktreeId ?? (primary.kind === "single-result-apply" ? primary.resultId : undefined));
  if (primary.kind === "single-result-apply" && changeId && worktreeId) {
    return {
      ...base,
      decisionType: "result.feedback",
      targetId: worktreeId,
      workflowRequest: {
        actionType: "result.refresh-rework",
        changeId,
        worktreeId,
        feedback,
        prompt: [
          "用户在结果确认点提出修改意见。请基于当前需求、已产生结果、validation/audit evidence 和这条反馈做 bounded rework。",
          "",
          `当前 worktreeId: ${worktreeId}`,
          "",
          "用户反馈：",
          feedback,
        ].join("\n"),
      },
    };
  }

  return base;
}

export function resolveLegacyFeedbackRoute(body: WorkbenchActionRequest): FeedbackRoute {
  const action = body.action;
  const context = body.feedbackContext ?? {};
  return {
    changeId: stringOrNull(context.changeId),
    decisionType: action?.actionId ?? "workbench.feedback",
    actionId: action?.actionId ?? context.actionId ?? "workbench.feedback",
    label: action?.label ?? "scoped feedback",
    summary: "User requested changes instead of accepting this decision.",
    targetId: stringOrNull(context.targetId ?? context.planningBundleId ?? context.worktreeId ?? context.applyCheckId),
    runId: stringOrNull(context.runId),
    artifact: stringOrNull(context.artifact),
  };
}

function resolveCurrentFeedbackAction(primary: FeedbackSnapshotPrimary, body: WorkbenchActionRequest): FeedbackSnapshotAction {
  const context = body.feedbackContext ?? {};
  const actions = primary.actions ?? [];
  const feedbackActions = actions.filter((action) => action.kind === "feedback" && action.enabled !== false);
  const feedbackAction = context.actionId
    ? feedbackActions.find((action) => action.id === context.actionId)
    : feedbackActions[0];
  if (!feedbackAction) throwStaleFeedbackTarget();
  if (context.changeId && primary.changeId && context.changeId !== primary.changeId) throwStaleFeedbackTarget();
  if (context.changeId && feedbackAction.changeId && context.changeId !== feedbackAction.changeId) throwStaleFeedbackTarget();
  if (context.actionKind && context.actionKind !== "feedback") throwStaleFeedbackTarget();
  if (context.planningBundleId && stringOrNull(feedbackAction.planningBundleId ?? primary.planningBundleId) !== context.planningBundleId) throwStaleFeedbackTarget();
  if (context.worktreeId && stringOrNull(feedbackAction.worktreeId ?? primary.worktreeId ?? primary.resultId) !== context.worktreeId) throwStaleFeedbackTarget();
  if (context.applyCheckId && stringOrNull(feedbackAction.applyCheckId ?? primary.applyCheckId) !== context.applyCheckId) throwStaleFeedbackTarget();
  if (context.runId && primary.runId && context.runId !== primary.runId) throwStaleFeedbackTarget();
  return feedbackAction;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function throwStaleFeedbackTarget(): never {
  const error = new Error("Feedback target is stale or no longer available.");
  error.name = "Conflict";
  throw error;
}
