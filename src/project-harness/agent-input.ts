import type { ManagedProject } from "../types/index.js";
import type {
  ProjectHarnessDiscoveryPolicy,
  ProjectHarnessHandle,
  ProviderSkillInput,
} from "./contracts.js";
import {
  assertRequiredProjectHarnessBindings,
  discoverProjectHarness,
} from "./discovery.js";

export interface ProjectHarnessAgentIdentity {
  projectId: string;
  skillName: string;
  skillRevision: number;
  contentFingerprint: string;
}

export interface ProjectHarnessAgentInput {
  identity: ProjectHarnessAgentIdentity;
  providerSkillInput: ProviderSkillInput;
}

export async function resolveProjectHarnessAgentInput(
  project: ManagedProject,
  discoveryPolicy: ProjectHarnessDiscoveryPolicy,
): Promise<ProjectHarnessAgentInput> {
  const discovery = await discoverProjectHarness(project.path, discoveryPolicy);
  if (!discovery) {
    throw new Error("Project Harness Skill input is unavailable; onboarding must complete before an Agent run.");
  }
  assertRequiredProjectHarnessBindings(discovery, discoveryPolicy);
  if (discovery.handle.projectId !== project.id) {
    throw new Error(
      `Registered project id ${project.id} does not match project Harness ${discovery.handle.projectId}; controlled identity migration is required.`,
    );
  }
  return {
    identity: projectHarnessAgentIdentity(discovery.handle),
    providerSkillInput: discovery.providerInput,
  };
}

export function projectHarnessAgentIdentity(handle: ProjectHarnessHandle): ProjectHarnessAgentIdentity {
  return {
    projectId: handle.projectId,
    skillName: handle.skillName,
    skillRevision: handle.skillRevision,
    contentFingerprint: handle.contentFingerprint,
  };
}
