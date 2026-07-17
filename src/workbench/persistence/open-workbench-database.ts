import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { ResolvedMemory } from "../../types/index.js";
import { WorkbenchDatabase } from "./database.js";
import { RuntimeWorkbenchResetGuard } from "./reset-guard.js";

export async function openWorkbenchDatabase(
  memory: ResolvedMemory,
  options: { providerRegistry?: ProviderRegistry } = {},
): Promise<WorkbenchDatabase> {
  return WorkbenchDatabase.open(memory, new RuntimeWorkbenchResetGuard(options.providerRegistry));
}
