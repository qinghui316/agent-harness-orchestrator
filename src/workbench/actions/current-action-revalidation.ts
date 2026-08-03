import type { ManagedProject } from "../../types/index.js";
import { revalidatedWorkflowActionSet, workflowActionScopesMatchStrict } from "../../workflow-actions/registry.js";
import { CurrentProjectConversationUnavailableError } from "../projections/read-model/errors.js";
import type { WorkbenchWorkflowActionRequest } from "../types.js";

const REVALIDATED_WORKFLOW_ACTION_IDS = revalidatedWorkflowActionSet();

export type CurrentWorkflowActionRequest = Partial<WorkbenchWorkflowActionRequest> & {
  actionType?: WorkbenchWorkflowActionRequest["actionType"];
};

export interface CurrentWorkflowActionInput {
  project: ManagedProject | null;
  path: string;
}

type SnapshotAction = Record<string, unknown> & {
  kind?: string;
  actionType?: string;
  changeId?: string;
  enabled?: boolean;
  actions?: SnapshotAction[];
};

interface CurrentWorkflowActionSnapshot {
  center: {
    workpad: {
      nextAction: SnapshotAction;
      taskQueue?: { nextAction?: SnapshotAction };
    };
  };
  right: {
    confirmationQueue: {
      primary: { actions: SnapshotAction[] } | null;
      current: Array<{ actions: SnapshotAction[] }>;
      otherDemands: Array<{ actions: SnapshotAction[] }>;
      maintenance?: Array<{ actions: SnapshotAction[] }>;
    };
  };
}

export interface CurrentWorkflowActionDeps {
  getWorkbenchSnapshot(input: CurrentWorkflowActionInput, options?: { topicId?: string }): Promise<unknown>;
}

export async function assertCurrentWorkflowAction(
  input: CurrentWorkflowActionInput,
  body: CurrentWorkflowActionRequest,
  deps: CurrentWorkflowActionDeps,
): Promise<void> {
  if (!body.actionType || !REVALIDATED_WORKFLOW_ACTION_IDS.has(body.actionType)) return;
  let snapshot: CurrentWorkflowActionSnapshot;
  try {
    snapshot = await deps.getWorkbenchSnapshot(input, { topicId: body.changeId }) as CurrentWorkflowActionSnapshot;
  } catch (error) {
    if (error instanceof CurrentProjectConversationUnavailableError) {
      throwStaleWorkflowTarget();
    }
    throw error;
  }
  const queue = snapshot.right.confirmationQueue;
  const queueActions = [queue.primary, ...queue.current, ...queue.otherDemands, ...(queue.maintenance ?? [])]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .flatMap((item) => item.actions);
  const nextAction = snapshot.center.workpad.nextAction;
  const taskQueueNextAction = snapshot.center.workpad.taskQueue?.nextAction;
  const actions = [
    ...queueActions,
    ...(nextAction.kind === "workflow-action" && nextAction.actionType ? [nextAction] : []),
    ...(taskQueueNextAction?.actionType ? [{ ...taskQueueNextAction, kind: "workflow-action" as const, changeId: body.changeId }] : []),
  ];
  const match = actions.find((action) => action.kind === "workflow-action"
    && action.actionType === body.actionType
    && (!action.changeId || action.changeId === body.changeId)
    && workflowActionScopesMatchStrict(action, body));
  if (!match || match.enabled === false) throwStaleWorkflowTarget();
}

function throwStaleWorkflowTarget(): never {
  const error = new Error("Workflow action target is stale or no longer available.");
  error.name = "Conflict";
  throw error;
}
