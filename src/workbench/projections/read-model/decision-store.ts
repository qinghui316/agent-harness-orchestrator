import type { ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchDecisionItem } from "../../read-model-types.js";
import { openWorkbenchDatabase } from "../../persistence/open-workbench-database.js";
import { type StoredDecisionRecord } from "../../persistence/contracts.js";

export async function listWorkbenchDecisions(memory: ResolvedMemory, topicId?: string): Promise<WorkbenchDecisionItem[]> {
  if (!memory.projectId) return [];
  const store = await openWorkbenchDatabase(memory);
  try {
    return store.decisions.listDecisions(memory.projectId, topicId).slice(0, 20).map(mapDecisionRecord);
  } finally {
    store.close();
  }
}

function mapDecisionRecord(record: StoredDecisionRecord): WorkbenchDecisionItem {
  return {
    id: record.id,
    kind: record.decisionType,
    label: record.label,
    status: record.status,
    changeId: record.changeId ?? undefined,
    runId: record.runId ?? undefined,
    targetId: record.targetId ?? undefined,
    artifact: record.artifact ?? undefined,
    summary: record.summary,
    feedback: record.feedback ?? undefined,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? undefined,
  };
}
