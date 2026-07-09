import type { ManagedProject } from "../../types/index.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest, WorkbenchWorkflowActionType } from "../types.js";

export type WorkbenchActionHandler = (
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live?: WorkbenchLiveSink,
) => Promise<unknown>;

export type WorkbenchActionHandlerMap = Record<WorkbenchWorkflowActionType, WorkbenchActionHandler>;

export function dispatchWorkbenchWorkflowAction(
  handlers: WorkbenchActionHandlerMap,
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live?: WorkbenchLiveSink,
): Promise<unknown> {
  const handler = handlers[request.actionType];
  if (!handler) return assertNever(request.actionType as never);
  return handler(project, changeId, request, live);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow action: ${value}`);
}
