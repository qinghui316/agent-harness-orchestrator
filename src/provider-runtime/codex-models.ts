import { getCodexModelSettingsSnapshot, setSelectedCodexModel } from "../codex/model-settings.js";
import type { ProviderModelSettingsSnapshot } from "./types.js";

export async function codexModelSettings(projectPath?: string): Promise<ProviderModelSettingsSnapshot> {
  const snapshot = await getCodexModelSettingsSnapshot(projectPath);
  return {
    providerId: "codex",
    selectedModel: snapshot.selectedModel ? { providerId: "codex", modelId: snapshot.selectedModel } : null,
    effectiveModel: snapshot.effectiveModel ? { providerId: "codex", modelId: snapshot.effectiveModel } : null,
    effectiveModelSource: snapshot.effectiveModelSource === "codex-default" ? "provider-default" : snapshot.effectiveModelSource,
    candidates: snapshot.candidates.map((candidate) => ({
      providerId: "codex",
      modelId: candidate.model,
      label: candidate.label,
      source: candidate.source,
      isDefault: candidate.isDefault,
    })),
    available: snapshot.modelList.available,
    degradedReason: snapshot.modelList.degradedReason,
  };
}

export async function selectCodexModel(modelId: string | null, projectPath?: string): Promise<ProviderModelSettingsSnapshot> {
  if (modelId) {
    const current = await codexModelSettings(projectPath);
    if (!current.candidates.some((candidate) => candidate.modelId === modelId)) {
      throw new Error("Selected model must come from the current provider candidates.");
    }
  }
  await setSelectedCodexModel(modelId);
  return codexModelSettings(projectPath);
}
