import { join, relative } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function displayMaintenancePath(memory: ResolvedMemory, path: string): string {
  return relative(memory.memoryRoot, path).replace(/\\/g, "/");
}

export function agentTaskRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "agent-tasks");
}

export function tasksRoot(memory: ResolvedMemory): string {
  return join(agentTaskRoot(memory), "tasks");
}

export function taskPath(memory: ResolvedMemory, taskId: string): string {
  return join(tasksRoot(memory), taskId, "task.json");
}

export function taskResultPath(memory: ResolvedMemory, taskId: string): string {
  return join(tasksRoot(memory), taskId, "result.json");
}

export function maintenanceRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "maintenance");
}

export function closeoutsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "closeouts");
}

export function warmIndexPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "generated", "warm-closeout-index.json");
}

export function coldArchiveIndexPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "generated", "cold-archive-refs.json");
}

export function watermarkPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "review-watermark.json");
}

export function maintenanceResolutionsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "resolutions");
}

export function maintenanceResolutionPath(memory: ResolvedMemory, candidateId: string): string {
  return join(maintenanceResolutionsRoot(memory), `${candidateId}.json`);
}

export function maintenanceCanonicalUpdateProposalsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "canonical-update-proposals");
}

export function maintenanceCanonicalUpdateProposalPath(memory: ResolvedMemory, proposalId: string): string {
  return join(maintenanceCanonicalUpdateProposalsRoot(memory), `${proposalId}.json`);
}

export function maintenanceCanonicalUpdateProposalMarkdownPath(memory: ResolvedMemory, proposalId: string): string {
  return join(maintenanceCanonicalUpdateProposalsRoot(memory), `${proposalId}.md`);
}

export function maintenanceCanonicalUpdateDecisionsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "canonical-update-decisions");
}

export function maintenanceCanonicalUpdateDecisionPath(memory: ResolvedMemory, decisionId: string): string {
  return join(maintenanceCanonicalUpdateDecisionsRoot(memory), `${decisionId}.json`);
}

export function maintenanceCanonicalUpdateDecisionMarkdownPath(memory: ResolvedMemory, decisionId: string): string {
  return join(maintenanceCanonicalUpdateDecisionsRoot(memory), `${decisionId}.md`);
}

export function maintenanceCanonicalPatchProposalsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "canonical-patch-proposals");
}

export function maintenanceCanonicalPatchProposalPath(memory: ResolvedMemory, patchProposalId: string): string {
  return join(maintenanceCanonicalPatchProposalsRoot(memory), `${patchProposalId}.json`);
}

export function maintenanceCanonicalPatchProposalMarkdownPath(memory: ResolvedMemory, patchProposalId: string): string {
  return join(maintenanceCanonicalPatchProposalsRoot(memory), `${patchProposalId}.md`);
}

export function maintenanceCanonicalPatchApplicationGateRecordsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "canonical-patch-application-gates");
}

export function maintenanceCanonicalPatchApplicationGateRecordPath(memory: ResolvedMemory, gateRecordId: string): string {
  return join(maintenanceCanonicalPatchApplicationGateRecordsRoot(memory), `${gateRecordId}.json`);
}

export function maintenanceCanonicalPatchApplicationGateRecordMarkdownPath(memory: ResolvedMemory, gateRecordId: string): string {
  return join(maintenanceCanonicalPatchApplicationGateRecordsRoot(memory), `${gateRecordId}.md`);
}

export function maintenanceCanonicalPatchApplicationManifestsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "canonical-patch-application-manifests");
}

export function maintenanceCanonicalPatchApplicationManifestPath(memory: ResolvedMemory, manifestId: string): string {
  return join(maintenanceCanonicalPatchApplicationManifestsRoot(memory), `${manifestId}.json`);
}

export function maintenanceCanonicalPatchApplicationManifestMarkdownPath(memory: ResolvedMemory, manifestId: string): string {
  return join(maintenanceCanonicalPatchApplicationManifestsRoot(memory), `${manifestId}.md`);
}

export function maintenanceCanonicalPatchApplicationResultsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "canonical-patch-application-results");
}

export function maintenanceCanonicalPatchApplicationResultPath(memory: ResolvedMemory, resultId: string): string {
  return join(maintenanceCanonicalPatchApplicationResultsRoot(memory), `${resultId}.json`);
}

export function maintenanceCanonicalPatchApplicationResultMarkdownPath(memory: ResolvedMemory, resultId: string): string {
  return join(maintenanceCanonicalPatchApplicationResultsRoot(memory), `${resultId}.md`);
}

export function maintenanceCanonicalPatchApplicationReportsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "canonical-patch-application-reports");
}

export function maintenanceCanonicalPatchApplicationReportPath(memory: ResolvedMemory, reportId: string): string {
  return join(maintenanceCanonicalPatchApplicationReportsRoot(memory), `${reportId}.json`);
}

export function maintenanceCanonicalPatchApplicationReportMarkdownPath(memory: ResolvedMemory, reportId: string): string {
  return join(maintenanceCanonicalPatchApplicationReportsRoot(memory), `${reportId}.md`);
}
