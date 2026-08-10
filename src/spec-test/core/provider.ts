import { defaultProviderRegistry, type ProviderDescriptor, type ProviderOperationProfile } from "../../provider-runtime/index.js";
import type { ManagedProject } from "../../types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../workbench/persistence/open-workbench-database.js";
import type { SpecTestContext } from "./context.js";

export async function resolveSpecTestProvider(
  context: SpecTestContext,
  project: ManagedProject,
  profile: ProviderOperationProfile,
  cwd: string,
): Promise<ProviderDescriptor> {
  const store = await openProjectRuntimeWorkbenchDatabase(context.runtime);
  let selectedProviderId: string | undefined;
  try {
    const conversation = store.conversations.readConversation(context.projectId, context.conversationId);
    if (!conversation
      || conversation.boundChangeId !== context.changeId
      || conversation.currentGraphScopeId !== context.graphScopeId
      || conversation.state !== "active") {
      throw new Error("Spec-Test Provider selection Conversation scope is stale.");
    }
    selectedProviderId = conversation.selectedProviderId ?? undefined;
  } finally {
    store.close();
  }
  if (!selectedProviderId) {
    throw new Error(`Spec-Test execution requires an explicitly selected Provider for Conversation ${context.conversationId}.`);
  }
  return defaultProviderRegistry.require(selectedProviderId, profile, "harness", project, cwd);
}
