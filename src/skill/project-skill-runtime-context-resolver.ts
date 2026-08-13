import { createHash } from "node:crypto";
import type { ProviderSkillInput } from "../project-harness/contracts.js";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import type { ProjectRuntimeCoordinatorPort, ProjectRuntimeState } from "../project-runtime/coordinator.js";
import type {
  TurnSkillContextPort,
  TurnSkillContextRequest,
  TurnSkillContextResolution,
} from "../workbench/conversation-turn-contract.js";
import { TurnSkillContextResolver } from "./turn-skill-context-resolver.js";

const AHO_AGENT_HIDDEN_SKILLS = new Set([
  "aho-main-orchestration",
  "aho-harness-engineering",
  "aho-workflow-authoring",
]);

export interface ProjectSkillRuntimeContextResolverOptions {
  providerRegistry: Pick<ProviderRegistry, "get">;
  projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve">;
}

/**
 * Server-composed owner for the physical Skill inputs used by one turn.
 * It resolves runtime identity and roots before the Provider catalog is read;
 * the inner catalog resolver then validates the discovered physical bindings.
 */
export class ProjectSkillRuntimeContextResolver implements TurnSkillContextPort {
  private readonly projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve">;
  private readonly resolver: TurnSkillContextResolver;

  constructor(options: ProjectSkillRuntimeContextResolverOptions) {
    this.projectRuntimeCoordinator = options.projectRuntimeCoordinator;
    this.resolver = new TurnSkillContextResolver({
      providerRegistry: options.providerRegistry,
      prepareRequest: (request) => this.prepare(request),
    });
  }

  resolve(request: TurnSkillContextRequest): Promise<TurnSkillContextResolution> {
    return this.resolver.resolve(request);
  }

  private async prepare(request: TurnSkillContextRequest) {
    const state = request.runtimeState ?? await this.resolveRuntimeState(request.project);
    const resolution = state.state === "onboarding" ? null : state.resolution;
    const identityInputs: ProviderSkillInput[] = resolution ? [resolution.providerInput] : [];
    const customRoots = resolution ? await readCustomRoots(resolution.paths) : [];
    const isAgent = request.conversation.productMode === "agent";
    const requiredSkillIds = isAgent
      ? [...request.requiredSkillIds]
      : [
        ...(resolution ? [resolution.harness.skillName] : []),
        "aho-main-orchestration",
        ...request.requiredSkillIds,
      ];
    const nativeSkillRoots = [getSystemSkillsRoot(), ...customRoots].filter((path, index, all) => all.indexOf(path) === index).sort();
    return {
      paths: state.state === "onboarding" ? state.paths : state.resolution.paths,
      identityInputs,
      extraRoots: [getSystemSkillsRoot(), ...customRoots],
      requiredSkillIds,
      nativeSkillRoots,
      isSkillVisible: isAgent
        ? (skill: { name: string }) => !AHO_AGENT_HIDDEN_SKILLS.has(skill.name)
        : undefined,
      resolutionState: state,
    };
  }

  private resolveRuntimeState(project: TurnSkillContextRequest["project"]): Promise<ProjectRuntimeState> {
    return this.projectRuntimeCoordinator.resolve(project);
  }
}

async function readCustomRoots(paths: Parameters<typeof import("../workbench/persistence/open-workbench-database.js").openProjectRuntimeWorkbenchDatabase>[0]) {
  // This import stays local to the composition adapter so the resolver does not
  // create a second persistence or catalog abstraction.
  const { openProjectRuntimeWorkbenchDatabase } = await import("../workbench/persistence/open-workbench-database.js");
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    return database.skills.listSkillRoots(paths.projectId).map((root) => root.rootPath).sort();
  } finally {
    database.close();
  }
}

export function turnSkillResolutionHash(resolution: TurnSkillContextResolution): string {
  return resolution.resolutionHash ?? createHash("sha256").update(JSON.stringify({
    skillInputs: resolution.skillInputs,
    diagnostics: resolution.diagnostics,
    nativeSkillRoots: resolution.nativeSkillRoots ?? [],
    requiredNativeSkills: resolution.requiredNativeSkills ?? [],
  })).digest("hex");
}

export function combineTurnSkillHandoffHash(baseHandoffHash: string, resolution: TurnSkillContextResolution): string {
  return createHash("sha256").update(JSON.stringify({
    baseHandoffHash,
    skillResolutionHash: turnSkillResolutionHash(resolution),
  })).digest("hex");
}
