import type { ProductMode } from "../types.js";

export type WorkspaceResourceModeHandoff<TOptions extends object> = TOptions & Readonly<{
  productMode: ProductMode;
}>;

export function workspaceResourceModeHandoff<TOptions extends object>(
  snapshot: Readonly<{ productMode: ProductMode }>,
  options: TOptions,
): WorkspaceResourceModeHandoff<TOptions> {
  return {
    ...options,
    productMode: snapshot.productMode,
  };
}
