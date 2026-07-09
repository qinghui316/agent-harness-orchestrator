import { detectCodexCapabilities } from "../../codex/capabilities.js";
import { getCodexConfigPath, readCodexProjectTrust } from "../../codex/trust.js";
import { getCodexModelSettingsSnapshot, type CodexModelSettingsSnapshot } from "../../codex/model-settings.js";
import type { ManagedProject } from "../../types/index.js";

export interface WorkbenchCodexDiagnostics {
  provider: "codex";
  available: boolean;
  version: string | null;
  configPath: string;
  currentModel: string | null;
  configModel: string | null;
  selectedModel: string | null;
  effectiveModel: string | null;
  effectiveModelSource: "selected" | "config" | "codex-default";
  modelSettings: CodexModelSettingsSnapshot;
  approvalFlagPlacement: string;
  capabilities: {
    supportsJson: boolean;
    supportsSandbox: boolean;
    supportsCd: boolean;
    supportsAddDir: boolean;
    supportsColor: boolean;
    supportsOutputLastMessage: boolean;
    supportsSafeResume: boolean;
  };
  errors: string[];
  projectTrust?: {
    trusted: boolean;
    projectKey: string;
    configExists: boolean;
    reason?: string;
  };
}

export async function getWorkbenchCodexDiagnostics(project: ManagedProject | null, projectPath?: string): Promise<WorkbenchCodexDiagnostics> {
  const capabilities = await detectCodexCapabilities();
  const trust = projectPath ? await readCodexProjectTrust(projectPath) : null;
  const modelSettings = await getCodexModelSettingsSnapshot(projectPath);
  return {
    provider: "codex",
    available: capabilities.available,
    version: capabilities.version,
    configPath: getCodexConfigPath(),
    currentModel: modelSettings.effectiveModel,
    configModel: modelSettings.configModel,
    selectedModel: modelSettings.selectedModel,
    effectiveModel: modelSettings.effectiveModel,
    effectiveModelSource: modelSettings.effectiveModelSource,
    modelSettings,
    approvalFlagPlacement: capabilities.approvalFlagPlacement,
    capabilities: {
      supportsJson: capabilities.supportsJson,
      supportsSandbox: capabilities.supportsSandbox,
      supportsCd: capabilities.supportsCd,
      supportsAddDir: capabilities.supportsAddDir,
      supportsColor: capabilities.supportsColor,
      supportsOutputLastMessage: capabilities.supportsOutputLastMessage,
      supportsSafeResume: capabilities.supportsSafeResume,
    },
    errors: capabilities.errors,
    projectTrust: trust
      ? {
          trusted: trust.trusted,
          projectKey: trust.projectKey,
          configExists: trust.configExists,
          reason: trust.reason,
        }
      : project
        ? {
            trusted: false,
            projectKey: project.path,
            configExists: false,
            reason: "Project path was not available for Codex trust inspection.",
          }
        : undefined,
  };
}
