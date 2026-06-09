import type { ReactElement } from "react";
import { userFacingText } from "../../../formatters.js";
import { workflowActionPayloadFromScope } from "../../../workflow-actions.js";
import type { Approval, WorkpadNextAction } from "../../../types.js";
import { parentSurfaceText } from "./surface-text.js";

export function WorkpadActionButton({
  action,
  approval,
  busy,
  sanitizeInternal = false,
  onWorkflowAction,
  onConfirmApproval,
}: {
  action: WorkpadNextAction;
  approval?: Approval;
  busy: boolean;
  sanitizeInternal?: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
}): ReactElement {
  const disabled = busy || !action.enabled || action.kind === "none" || action.kind === "read-only";
  const format = sanitizeInternal ? parentSurfaceText : userFacingText;
  function run(): void {
    if (action.kind === "approval" && action.approvalId) {
      onConfirmApproval(action.approvalId);
      return;
    }
    if (action.kind === "workflow-action" && action.actionType) void onWorkflowAction(action.actionType, workflowActionPayloadFromScope(action));
  }
  return (
    <div className="workpad-next-action">
      <span>下一步</span>
      <strong>{format(approval?.action?.label ?? action.label)}</strong>
      <p>{format(action.description)}</p>
      <button className="primary-button" disabled={disabled} title={action.disabledReason} onClick={run}>
        {action.enabled ? "执行" : "不可执行"}
      </button>
    </div>
  );
}
