import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { revalidatedWorkflowActionSet, workflowActionScopesMatchStrict } from "../../workflow-actions/registry.js";
import type { WorkbenchActionRequest } from "./types.js";

const REVALIDATED_WORKFLOW_ACTION_IDS = revalidatedWorkflowActionSet();

export async function assertCurrentWorkflowAction(input: WorkbenchProjectInput, body: WorkbenchActionRequest): Promise<void> {
  if (!body.actionType || !REVALIDATED_WORKFLOW_ACTION_IDS.has(body.actionType)) return;
  const snapshot = await getWorkbenchSnapshot(input, { topicId: body.changeId });
  const queue = snapshot.right.confirmationQueue;
  const queueActions = [queue.primary, ...queue.current, ...queue.otherDemands]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .flatMap((item) => item.actions);
  const nextAction = snapshot.center.workpad.nextAction;
  const taskQueueNextAction = snapshot.center.workpad.taskQueue?.nextAction;
  const actions = [
    ...queueActions,
    ...(nextAction.kind === "workflow-action" && nextAction.actionType ? [nextAction] : []),
    ...(taskQueueNextAction?.actionType ? [{ ...taskQueueNextAction, kind: "workflow-action" as const, changeId: body.changeId }] : []),
  ];
  const matches = actions.some((action) => action.kind === "workflow-action"
    && action.actionType === body.actionType
    && (!action.changeId || action.changeId === body.changeId)
    && workflowActionScopesMatchStrict(action, body));
  if (!matches) {
    const error = new Error("Workflow action target is stale or no longer available.");
    error.name = "Conflict";
    throw error;
  }
}
