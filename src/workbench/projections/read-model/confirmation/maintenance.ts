import {
  listMaintenanceCanonicalPatchApplicationGateRecords,
  listMaintenanceCanonicalPatchProposals,
  listMaintenanceCanonicalUpdateDecisions,
  listMaintenanceCanonicalUpdateProposals,
  maintenanceCanonicalPatchProposalArtifactRef,
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
  if (!proposal) return maintenanceCanonicalPatchApplicationGateQueueItems(input);
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

async function maintenanceCanonicalPatchApplicationGateQueueItems(input: {
  project: ManagedProject | null;
  memory: ResolvedMemory;
}): Promise<WorkbenchConfirmationQueueItem[]> {
  if (!input.project) return [];
  const patchProposals = await listMaintenanceCanonicalPatchProposals(input.memory).catch(() => []);
  if (patchProposals.length === 0) return [];
  const gateRecords = await listMaintenanceCanonicalPatchApplicationGateRecords(input.memory).catch(() => []);
  const handledPatchProposalIds = new Set(gateRecords.map((record) => record.patchProposalId));
  const patchProposal = [...patchProposals]
    .filter((item) => !handledPatchProposalIds.has(item.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!patchProposal) return [];
  const patchProposalRef = maintenanceCanonicalPatchProposalArtifactRef(input.memory, patchProposal.id);
  return [{
    id: `maintenance-canonical-patch-application-gate:${patchProposal.id}`,
    kind: "maintenance",
    projectId: input.project.id,
    maintenancePatchProposalId: patchProposal.id,
    summary: patchProposal.summary,
    whyNeedsConfirmation: "该 canonical patch 提案进入后续应用路径前必须由人类确认。确认不会执行改写。",
    confirmEffect: "记录一条项目级 canonical patch application gate evidence，作为后续应用实现的前置证据；不会改写 stable memory、canonical docs、source、apply/close 或 Harness evolution 状态。",
    riskSummary: "确认只记录 accepted-for-application-follow-up evidence。真正 canonical 改写仍需后续独立实现、重新校验和人类 gate。",
    evidenceRefs: [patchProposalRef, ...patchProposal.artifactRefs],
    actions: [
      {
        id: `maintenance-canonical-patch-application-gate-record:${patchProposal.id}`,
        label: "记录 patch 应用 gate",
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "maintenance.canonical-patch.application-gate.record",
        maintenancePatchProposalId: patchProposal.id,
      },
    ],
    primary: false,
    status: "pending",
  }];
}
