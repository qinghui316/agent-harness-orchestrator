import { codexProviderDescriptor } from "./codex-adapter.js";
import { ProviderRegistry } from "./registry.js";

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(codexProviderDescriptor);
  return registry;
}

export const defaultProviderRegistry = createDefaultProviderRegistry();
