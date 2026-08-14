import type { ProductMode, ProviderRegistry } from "../provider-runtime/index.js";
import type { ProjectRuntimeCoordinatorPort, ProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ProjectRuntimePaths } from "../project-runtime/paths.js";
import { DirectAgentConversationTurnStrategy } from "./direct-agent-conversation-turn-strategy.js";
import { HarnessConversationTurnStrategy } from "./harness-conversation-turn-strategy.js";
import { runProjectScopedMainAgentTurn } from "./main-agent-turn-coordinator.js";
import { switchConversationProviderAtSafePoint } from "./provider-switch.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { ManagedProject } from "../types/index.js";
import type { StoredConversation } from "./persistence/contracts.js";
import type {
  ConversationTurnContinuationOptions,
  ConversationTurnContinuationPort,
  ConversationTurnExecutionPorts,
  ConversationTurnRequest,
  ConversationTurnStrategy,
  ConversationTurnRoutingPort,
} from "./conversation-turn-contract.js";
import type { TopicMessageResult, TopicThreadEntry, ValidatedPlanHandoffIntent, WorkbenchLiveSink } from "./types.js";
import type { TurnSkillContextPort } from "./conversation-turn-contract.js";

export type ConversationTurnStrategies = Readonly<Record<ProductMode, ConversationTurnStrategy>>;

export interface ConversationTurnRouterCompositionOptions {
  skillContext: TurnSkillContextPort;
  providerRegistry: ProviderRegistry;
  projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve" | "runtimePaths">;
  resolveRuntimePaths?: (projectId: string) => ProjectRuntimePaths;
}

export function createConversationTurnRouter(
  options: ConversationTurnRouterCompositionOptions,
): ConversationTurnRouter {
  const resolveRuntimePaths = options.resolveRuntimePaths
    ?? ((projectId: string) => options.projectRuntimeCoordinator.runtimePaths(projectId));
  return new ConversationTurnRouter(
    {
      agent: new DirectAgentConversationTurnStrategy({
        providerRegistry: options.providerRegistry,
        resolveRuntimePaths,
      }),
      harness: new HarnessConversationTurnStrategy((project, conversationId, userMessage, live, handoff, runnerOptions) => (
        runProjectScopedMainAgentTurn(project, conversationId, userMessage, live, handoff, {
          ...runnerOptions,
          providerRegistry: options.providerRegistry,
          runtimeState: runnerOptions.runtimeState!,
        })
      )),
    },
    { skillContext: options.skillContext },
    {
      projectRuntimeCoordinator: options.projectRuntimeCoordinator,
      providerRegistry: options.providerRegistry,
    },
  );
}

export class ConversationTurnRouter {
  private readonly runtimeStateResolver: (project: ManagedProject) => Promise<ProjectRuntimeState>;

  constructor(
    private readonly strategies: ConversationTurnStrategies,
    private readonly ports: ConversationTurnExecutionPorts,
    options: Pick<ConversationTurnRouterCompositionOptions, "projectRuntimeCoordinator" | "providerRegistry">,
  ) {
    this.runtimeStateResolver = (project) => options.projectRuntimeCoordinator.resolve(project);
    this.providerRegistry = options.providerRegistry;
    for (const productMode of ["agent", "harness"] as const) {
      if (strategies[productMode].productMode !== productMode) {
        throw new Error(`Conversation Turn Strategy for ${productMode} must declare the same productMode.`);
      }
    }
  }

  private readonly providerRegistry: ProviderRegistry;

  assertRequestedMode(conversation: StoredConversation, requestedMode?: ProductMode): void {
    if (requestedMode === undefined || requestedMode === conversation.productMode) return;
    const error = new Error("Conversation productMode does not match the requested mode.");
    error.name = "Conflict";
    throw error;
  }

  async route(input: ConversationTurnRequest, requestedMode?: ProductMode): Promise<TopicMessageResult> {
    this.assertRequestedMode(input.conversation, requestedMode);
    assertProviderIdentity(input);
    const runtimeState = await this.requireRuntimeState(input.project);
    const strategy = this.strategies[input.conversation.productMode];
    await strategy.preflight?.({ ...input, runtimeState });
    const turnSkillResolution = await this.resolveSkillContextForTurn(input, runtimeState);
    return strategy.execute({
      ...input,
      runtimeState,
      turnSkillResolution: freezeResolution(turnSkillResolution),
    }, this.ports);
  }

  readonly resolveRuntimeState = async (project: ManagedProject): Promise<ProjectRuntimeState> => this.requireRuntimeState(project);

  readonly resolveProviderId = (project: ManagedProject, requestedProviderId?: string): string => {
    return (requestedProviderId
      ? this.providerRegistry.get(requestedProviderId)
      : project.defaultProviderId
        ? this.providerRegistry.get(project.defaultProviderId)
        : this.providerRegistry.requireOnly()).id;
  };

  readonly switchProviderAtSafePoint: NonNullable<ConversationTurnRoutingPort["switchProviderAtSafePoint"]> = (input) => (
    switchConversationProviderAtSafePoint({
      ...input,
      registry: this.providerRegistry,
    })
  );

  readonly runAgentNativeChildFollowup: NonNullable<ConversationTurnRoutingPort["runAgentNativeChildFollowup"]> = async (input) => {
    const { runAgentNativeChildFollowup } = await import("./agent-native-child-lifecycle-service.js");
    return runAgentNativeChildFollowup({ ...input, providerRegistry: this.providerRegistry });
  };

  readonly runExactChildAgentTurn: NonNullable<ConversationTurnRoutingPort["runExactChildAgentTurn"]> = async (input) => {
    const { runExactChildAgentTurn } = await import("./provider-child-turn-coordinator.js");
    return runExactChildAgentTurn(input);
  };

  readonly continueMainAgentTurn: ConversationTurnContinuationPort = async (
    project: ManagedProject,
    conversationId: string,
    message: string,
    live?: WorkbenchLiveSink,
    planHandoff?: ValidatedPlanHandoffIntent,
    options?: ConversationTurnContinuationOptions,
  ): Promise<TopicThreadEntry> => {
    const turn = await this.readContinuationTurn(project, conversationId);
    if (turn.conversation.productMode !== "harness") {
      const error = new Error("Main Agent continuation requires a Harness Conversation.");
      error.name = "Conflict";
      throw error;
    }
    if (turn.runtimeState.state !== "ready") {
      const error = new Error(`Main Agent continuation requires a ready Project Harness, got ${turn.runtimeState.state}.`);
      error.name = "Conflict";
      throw error;
    }
    const turnSkillResolution = await this.resolveSkillContextForTurn({
      project,
      conversation: turn.conversation,
      requiredSkillIds: [],
    }, turn.runtimeState);
    return runProjectScopedMainAgentTurn(project, conversationId, message, live, planHandoff, {
      ...options,
      providerRegistry: this.providerRegistry,
      runtimeState: turn.runtimeState,
      turnSkillResolution: freezeResolution(turnSkillResolution),
    });
  };

  private async requireRuntimeState(project: ManagedProject): Promise<ProjectRuntimeState> {
    return this.runtimeStateResolver(project);
  }

  private async resolveSkillContextForTurn(
    input: Pick<ConversationTurnRequest, "project" | "conversation" | "requiredSkillIds">,
    runtimeState: ProjectRuntimeState,
  ): Promise<import("./conversation-turn-contract.js").TurnSkillContextResolution | null> {
    if (input.conversation.productMode === "harness" && runtimeState.state === "onboarding") {
      return null;
    }
    return this.ports.skillContext.resolve({
      project: input.project,
      conversation: input.conversation,
      requiredSkillIds: input.requiredSkillIds ?? [],
      runtimeState,
    });
  }

  private async readContinuationTurn(project: ManagedProject, conversationId: string): Promise<{
    conversation: StoredConversation;
    runtimeState: ProjectRuntimeState;
  }> {
    const runtimeState = await this.requireRuntimeState(project);
    const paths = runtimeState.state === "onboarding" ? runtimeState.paths : runtimeState.resolution.paths;
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      const conversation = database.conversations.readConversation(paths.projectId, conversationId);
      if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
      return { conversation, runtimeState };
    } finally {
      database.close();
    }
  }
}

function freezeResolution(
  resolution: import("./conversation-turn-contract.js").TurnSkillContextResolution | null,
): import("./conversation-turn-contract.js").TurnSkillContextResolution | null {
  if (!resolution) return null;
  Object.freeze(resolution.skillInputs);
  Object.freeze(resolution.diagnostics);
  if (resolution.nativeSkillRoots) Object.freeze(resolution.nativeSkillRoots);
  if (resolution.requiredNativeSkills) Object.freeze(resolution.requiredNativeSkills);
  return Object.freeze(resolution);
}

function assertProviderIdentity(input: import("./conversation-turn-contract.js").ConversationTurnRequest): void {
  if (input.providerId === input.conversation.selectedProviderId) return;
  const error = new Error("Conversation Provider does not match the requested Provider.");
  error.name = "Conflict";
  throw error;
}
