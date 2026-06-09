import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ProjectRegistryStore } from "../registry/store.js";
import type { WorkbenchProjectInput } from "../workbench/manager.js";
import { handleApi } from "./workbench/api-router.js";
import { sendJson, statusForError } from "./workbench/http.js";
import { defaultStaticRoot, serveStatic } from "./workbench/static.js";
import type { WorkbenchServeOptions, WorkbenchServerContext, WorkbenchServerHandle } from "./workbench/types.js";

export type { WorkbenchServeOptions, WorkbenchServerHandle } from "./workbench/types.js";
export { executeWorkbenchAction } from "./workbench/actions.js";
export { buildNativeFolderDialogCommand, openNativeFolderDialog } from "./workbench/native-dialog.js";

export async function startWorkbenchServer(input: WorkbenchProjectInput | null = null, options: WorkbenchServeOptions = {}): Promise<WorkbenchServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4317;
  const staticRoot = options.staticRoot ?? defaultStaticRoot();
  const context: WorkbenchServerContext = { input, staticRoot, store: options.store ?? new ProjectRegistryStore() };
  const server = createServer((request, response) => {
    handleRequest(context, request, response).catch((error: unknown) => {
      sendJson(response, statusForError(error), { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise<void>((resolvePromise) => server.listen(port, host, resolvePromise));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, url: `http://${host}:${actualPort}` };
}

async function handleRequest(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    await handleApi(context, request, response, url);
    return;
  }
  await serveStatic(context.staticRoot, url.pathname, response);
}
