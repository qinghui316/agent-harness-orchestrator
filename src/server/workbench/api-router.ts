import type { IncomingMessage, ServerResponse } from "node:http";
import { openNativeFolderDialog } from "./native-dialog.js";
import { matchProjectWorkbenchRoute } from "./routes.js";
import { resolveProjectInputWithDirect } from "./direct-project.js";
import { getWorkbenchCodexDiagnostics } from "./codex-diagnostics.js";
import { addExistingProject, createNewProject, initProjectHarness, listProjectStatuses, trustCodexProjectForWorkbench } from "./project-admin.js";
import { handleDirectWorkbenchApi } from "./direct-routes.js";
import { handleProjectWorkbenchApi } from "./project-routes.js";
import { assertLocalWorkbenchRequest, readJsonBody, sendJson } from "./http.js";
import type { AddExistingProjectRequest, CreateNewProjectRequest, InitProjectHarnessRequest, TrustCodexProjectRequest, WorkbenchServerContext } from "./types.js";

export async function handleApi(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method !== "GET") {
    assertLocalWorkbenchRequest(request);
  }

  const projectWorkbench = matchProjectWorkbenchRoute(url.pathname);
  if (projectWorkbench) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, projectWorkbench.projectId);
    await handleProjectWorkbenchApi(input, request, response, projectWorkbench.rest, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/app/status") {
    sendJson(response, 200, { mode: context.input ? "project" : "app", directProjectId: context.input?.project?.id ?? null });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/codex/diagnostics") {
    sendJson(response, 200, await getWorkbenchCodexDiagnostics(null));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/projects") {
    sendJson(response, 200, { projects: await listProjectStatuses(context.store, context.input) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/projects") {
    sendJson(response, 200, await addExistingProject(context.store, await readJsonBody<AddExistingProjectRequest>(request)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/projects/new") {
    sendJson(response, 200, await createNewProject(context.store, await readJsonBody<CreateNewProjectRequest>(request)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/dialog/open-folder") {
    sendJson(response, 200, await openNativeFolderDialog());
    return;
  }
  const initMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/harness\/init$/);
  if (request.method === "POST" && initMatch?.[1]) {
    sendJson(response, 200, await initProjectHarness(context.store, decodeURIComponent(initMatch[1]), await readJsonBody<InitProjectHarnessRequest>(request)));
    return;
  }
  const codexTrustMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/codex\/trust$/);
  if (request.method === "POST" && codexTrustMatch?.[1]) {
    sendJson(response, 200, await trustCodexProjectForWorkbench(context.store, decodeURIComponent(codexTrustMatch[1]), await readJsonBody<TrustCodexProjectRequest>(request)));
    return;
  }
  const codexDiagnosticsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/codex\/diagnostics$/);
  if (request.method === "GET" && codexDiagnosticsMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(codexDiagnosticsMatch[1]));
    sendJson(response, 200, await getWorkbenchCodexDiagnostics(input.project, input.path));
    return;
  }

  if (await handleDirectWorkbenchApi(context.input, request, response, url)) return;
  sendJson(response, 404, { error: "Not found." });
}
