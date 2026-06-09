import type { IncomingMessage, ServerResponse } from "node:http";
import { openNativeFolderDialog } from "./native-dialog.js";
import { matchProjectWorkbenchRoute, resolveProjectInput } from "./routes.js";
import { addExistingProject, createNewProject, initProjectHarness, listProjectStatuses } from "./project-admin.js";
import { handleDirectWorkbenchApi } from "./direct-routes.js";
import { handleProjectWorkbenchApi } from "./project-routes.js";
import { assertLocalWorkbenchRequest, readJsonBody, sendJson } from "./http.js";
import type { AddExistingProjectRequest, CreateNewProjectRequest, InitProjectHarnessRequest, WorkbenchServerContext } from "./types.js";

export async function handleApi(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method !== "GET") {
    assertLocalWorkbenchRequest(request);
  }

  const projectWorkbench = matchProjectWorkbenchRoute(url.pathname);
  if (projectWorkbench) {
    const input = await resolveProjectInput(context.store, projectWorkbench.projectId);
    await handleProjectWorkbenchApi(input, request, response, projectWorkbench.rest, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/app/status") {
    sendJson(response, 200, { mode: context.input ? "project" : "app", directProjectId: context.input?.project?.id ?? null });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/projects") {
    sendJson(response, 200, { projects: await listProjectStatuses(context.store) });
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

  if (await handleDirectWorkbenchApi(context.input, request, response, url)) return;
  sendJson(response, 404, { error: "Not found." });
}
