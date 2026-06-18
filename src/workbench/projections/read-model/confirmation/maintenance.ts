import {
  listMaintenanceCanonicalUpdateDecisions,
  listMaintenanceCanonicalUpdateProposals,
  maintenanceCanonicalUpdateProposalArtifactRef,
} from "../../../../agent-task/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../../../types/index.js";
import type { WorkbenchConfirmationQueueItem } from "../../../read-model-types.js";

export async function maintenanceCanonicalUpdateDecisionQueueItems(input: {
  project: ManagedProject | null;
  memory: ResolvedMemory;
}): Promise<WorkbenchConfirmationQueueItem[]> {
  if (!input.project) return [];
  const proposals = await listMaintenanceCanonicalUpdateProposals(input.memory).catch(() => []);
  if (proposals.length === 0) return [];
  const decisions = await listMaintenanceCanonicalUpdateDecisions(input.memory).catch(() => []);
  const handledProposalIds = new Set(decisions.map((decision) => decision.proposalId));
  const proposal = [...proposals]
    .filter((item) => !handledProposalIds.has(item.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!proposal) return [];
  const proposalRef = maintenanceCanonicalUpdateProposalArtifactRef(input.memory, proposal.id);
  return [{
    id: `maintenance-canonical-update-decision:${proposal.id}`,
    kind: "maintenance",
    projectId: input.project.id,
    maintenanceProposalId: proposal.id,
    summary: proposal.summary,
    whyNeedsConfirmation: "该维护提案会影响后续 canonical 更新方向；必须由人类确认处理结果。",
    confirmEffect: "记录一条项目级维护决策证据，用于后续 canonical 更新阶段；不会改写 stable memory、canonical docs、source、apply/close 或 Harness evolution 状态。",
    riskSummary: "确认只记录 handled/follow-up evidence。真正 canonical 改写仍需后续独立 gate。",
    evidenceRefs: [proposalRef, ...proposal.artifactRefs],
    actions: [
      {
        id: `maintenance-canonical-update-decision-record:${proposal.id}`,
        label: "记录维护决策",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "maintenance.canonical-update.decision.record",
        maintenanceProposalId: proposal.id,
      },
    ],
    primary: false,
    status: "pending",
  }];
}
