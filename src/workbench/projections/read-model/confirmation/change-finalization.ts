import type { ProjectHarnessChangeFinalizationRequest } from "../../../../project-runtime/change-finalization.js";
import type { ManagedProject } from "../../../../types/index.js";
import type { WorkbenchConfirmationQueueItem } from "../../../read-model-types.js";

export function changeFinalizationToConfirmationItems(
  project: ManagedProject,
  requests: ProjectHarnessChangeFinalizationRequest[],
): WorkbenchConfirmationQueueItem[] {
  return requests.map((request) => ({
    id: `confirm:harness-change.close:${request.changeId}:${request.id}`,
    kind: "change-finalization",
    projectId: project.id,
    conversationId: request.conversationId,
    changeId: request.changeId,
    graphScopeId: request.graphScopeId,
    finalizationRequestId: request.id,
    summary: `Change ${request.changeId} is ready to close.`,
    whyNeedsConfirmation: "Main requested finalization after terminal evidence checks; closing archives the current Change.",
    confirmEffect: "The exact current Change is revalidated and atomically archived. No apply or Integration action is performed.",
    riskSummary: "This is a one-time high-impact transition and stale lineage is rejected.",
    evidenceRefs: [],
    actions: [{
      id: `workflow:harness-change.close:${request.changeId}:${request.id}`,
      label: "Close Change",
      kind: "workflow-action",
      changeId: request.changeId,
      graphScopeId: request.graphScopeId,
      actionType: "harness-change.close",
      finalizationRequestId: request.id,
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: true,
    status: "pending",
  }));
}
