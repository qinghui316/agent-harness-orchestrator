import type { IncomingMessage, ServerResponse } from "node:http";
import { openNativeFolderDialog } from "./native-dialog.js";
import { matchProjectWorkbenchRoute } from "./routes.js";
import { resolveProjectInputWithDirect } from "./direct-project.js";
import { getWorkbenchCodexDiagnostics } from "./codex-diagnostics.js";
import { listProjectFileChildren, readProjectFilePreview, searchProjectFiles } from "../../workbench/file-references.js";
import { getProjectGitDiff, getProjectGitStatus } from "../../workbench/git-panel.js";
import { getCodexBridgeStatus, syncCodexBridge } from "../../codex/bridge.js";
import { getCodexModelSettingsSnapshot, setSelectedCodexModel } from "../../codex/model-settings.js";
import { addSkillRoot, listSkillRoots, listSkills, refreshSkills, setSkillEnabled, type SkillSourceKind } from "../../skill/catalog.js";
import { addExistingProject, createNewProject, initProjectHarness, listProjectStatuses, removeRegisteredProject, trustCodexProjectForWorkbench } from "./project-admin.js";
import { handleDirectWorkbenchApi } from "./direct-routes.js";
import { handleProjectWorkbenchApi } from "./project-routes.js";
import { assertLocalWorkbenchRequest, assertRegisteredProject, readJsonBody, sendJson } from "./http.js";
import type { AddExistingProjectRequest, CreateNewProjectRequest, InitProjectHarnessRequest, RemoveProjectRequest, TrustCodexProjectRequest, WorkbenchServerContext } from "./types.js";

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
  if (request.method === "GET" && url.pathname === "/api/codex/models") {
    sendJson(response, 200, await getCodexModelSettingsSnapshot());
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
  const projectRemoveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/remove$/);
  if (request.method === "POST" && projectRemoveMatch?.[1]) {
    sendJson(response, 200, await removeRegisteredProject(context.store, decodeURIComponent(projectRemoveMatch[1]), await readJsonBody<RemoveProjectRequest>(request)));
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
  const codexModelsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/codex\/models$/);
  if (codexModelsMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(codexModelsMatch[1]));
    if (request.method === "GET") {
      sendJson(response, 200, await getCodexModelSettingsSnapshot(input.path));
      return;
    }
    if (request.method === "POST") {
      const body = await readJsonBody<{ selectedModel?: string | null }>(request);
      if (Object.prototype.hasOwnProperty.call(body, "selectedModel")) {
        const selectedModel = typeof body.selectedModel === "string" ? body.selectedModel.trim() : null;
        if (selectedModel) {
          const snapshot = await getCodexModelSettingsSnapshot(input.path);
          const candidate = snapshot.candidates.find((item) => item.id === selectedModel || item.model === selectedModel);
          if (!candidate) {
            sendJson(response, 400, { error: "Selected Codex model must come from the current runtime/config candidates." });
            return;
          }
          await setSelectedCodexModel(candidate.model);
        } else {
          await setSelectedCodexModel(null);
        }
      }
      sendJson(response, 200, await getCodexModelSettingsSnapshot(input.path));
      return;
    }
  }
  const fileSearchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/search$/);
  if (request.method === "GET" && fileSearchMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(fileSearchMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project file search requires a selected project." });
      return;
    }
    const limit = Number(url.searchParams.get("limit") ?? undefined);
    sendJson(response, 200, {
      files: await searchProjectFiles(input.project, {
        query: url.searchParams.get("q") ?? "",
        limit,
      }),
    });
    return;
  }
  const fileChildrenMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/children$/);
  if (request.method === "GET" && fileChildrenMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(fileChildrenMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project file tree requires a selected project." });
      return;
    }
    try {
      sendJson(response, 200, await listProjectFileChildren(input.project, url.searchParams.get("path") ?? ""));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  const filePreviewMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/preview$/);
  if (request.method === "GET" && filePreviewMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(filePreviewMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project file preview requires a selected project." });
      return;
    }
    sendJson(response, 200, await readProjectFilePreview(input.project, url.searchParams.get("path") ?? ""));
    return;
  }
  const gitStatusMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/status$/);
  if (request.method === "GET" && gitStatusMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitStatusMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git status requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitStatus(input.project));
    return;
  }
  const gitDiffMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/diff$/);
  if (request.method === "GET" && gitDiffMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitDiffMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git diff requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitDiff(input.project, url.searchParams.get("path") ?? ""));
    return;
  }
  const skillRootsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skill-roots$/);
  if (skillRootsMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillRootsMatch[1]));
    assertRegisteredProject(input);
    if (request.method === "GET") {
      sendJson(response, 200, { roots: await listSkillRoots(input.project) });
      return;
    }
    if (request.method === "POST") {
      const body = await readJsonBody<{ rootPath?: string; sourceKind?: string }>(request);
      if (!body.rootPath) {
        sendJson(response, 400, { error: "rootPath is required." });
        return;
      }
      const result = await addSkillRoot(input.project, body.rootPath, normalizeSkillSourceKind(body.sourceKind));
      sendJson(response, 200, result);
      return;
    }
  }
  const skillsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills$/);
  if (skillsMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillsMatch[1]));
    assertRegisteredProject(input);
    if (request.method === "GET") {
      sendJson(response, 200, { roots: await listSkillRoots(input.project), skills: await listSkills(input.project), bridge: await getCodexBridgeStatus(input.project) });
      return;
    }
    if (request.method === "POST") {
      sendJson(response, 200, await refreshSkills(input.project));
      return;
    }
  }
  const skillEnableMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills\/([^/]+)\/enable$/);
  if (request.method === "POST" && skillEnableMatch?.[1] && skillEnableMatch?.[2]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillEnableMatch[1]));
    assertRegisteredProject(input);
    const body = await readJsonBody<{ enabled?: boolean; topic?: string }>(request);
    sendJson(response, 200, { skills: await setSkillEnabled(input.project, decodeURIComponent(skillEnableMatch[2]), { enabled: Boolean(body.enabled), topic: body.topic }) });
    return;
  }
  const skillBridgeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills\/codex-bridge\/sync$/);
  if (request.method === "POST" && skillBridgeMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillBridgeMatch[1]));
    assertRegisteredProject(input);
    sendJson(response, 200, await syncCodexBridge(input.project));
    return;
  }

  if (await handleDirectWorkbenchApi(context.input, request, response, url)) return;
  sendJson(response, 404, { error: "Not found." });
}

function normalizeSkillSourceKind(value: string | undefined): SkillSourceKind {
  if (value === "project-codex" || value === "global-codex" || value === "managed") return value;
  return "custom";
}
