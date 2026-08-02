import {
  projectRelativePath,
  type ProjectHarnessDiscoveryPolicy,
} from "../project-harness/contracts.js";

export const DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY: ProjectHarnessDiscoveryPolicy = {
  routes: [
    { providerId: "codex", relativeRoot: projectRelativePath(".agents/skills"), required: true },
    { providerId: "claude", relativeRoot: projectRelativePath(".claude/skills"), required: true },
  ],
};
