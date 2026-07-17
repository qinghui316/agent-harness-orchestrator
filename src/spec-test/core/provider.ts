import { defaultProviderRegistry, type ProviderDescriptor, type ProviderOperationProfile } from "../../provider-runtime/index.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { openWorkbenchDatabase } from "../../workbench/persistence/open-workbench-database.js";

export async function resolveSpecTestProvider(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  profile: ProviderOperationProfile,
  cwd: string,
): Promise<ProviderDescriptor> {
  const store = await openWorkbenchDatabase(memory);
  let selectedProviderId: string | undefined;
  try {
    selectedProviderId = store.conversations.findConversationForChange(project.id, changeId)?.selectedProviderId;
  } finally {
    store.close();
  }

  if (!selectedProviderId) {
    if (project.defaultProviderId) selectedProviderId = defaultProviderRegistry.get(project.defaultProviderId).id;
  }

  if (!selectedProviderId) {
    const registered = defaultProviderRegistry.list();
    if (registered.length !== 1) {
      throw new Error(`Spec-test execution requires exactly one registered provider when Change ${changeId} is not bound to a Conversation; found ${registered.length}.`);
    }
    selectedProviderId = registered[0]!.id;
  }

  return await defaultProviderRegistry.require(selectedProviderId, profile, project, cwd);
}
