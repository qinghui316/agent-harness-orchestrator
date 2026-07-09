import type { WorkbenchDecisionAction } from "../../read-model-types.js";

export function evidenceActions(artifact?: string, options?: { label?: string }): WorkbenchDecisionAction[] {
  if (!artifact) return [];
  return [{
    id: `evidence:${artifact}`,
    label: options?.label ?? "查看证据",
    kind: "evidence",
    enabled: true,
    requiresConfirmation: false,
    artifact,
  }];
}
