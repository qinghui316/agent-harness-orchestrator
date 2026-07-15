import type { IncomingMessage, ServerResponse } from "node:http";
import { openNativeFolderDialog } from "./native-dialog.js";
import { matchProjectWorkbenchRoute } from "./routes.js";
import { resolveProjectInputWithDirect } from "./direct-project.js";
import { getRuntimeDiagnostics } from "./runtime-diagnostics.js";
import { getRuntimeActivityLog } from "./runtime-activity-log.js";
import { defaultProviderRegistry } from "../../provider-runtime/index.js";
import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import { listProjectFileChildren, readProjectFilePreview, searchProjectFiles } from "../../workbench/file-references.js";
import { createTopicAttachment, deleteTopicAttachment } from "../../workbench/attachments.js";
import { getProjectGitCommitDetail, getProjectGitCommitDiff, getProjectGitDiff, getProjectGitHistory, getProjectGitStatus } from "../../workbench/git-panel.js";
import { addSkillRoot, listSkillRoots, refreshSkills, setSkillEnabled, type SkillSourceKind } from "../../skill/catalog.js";
import { addExistingProject, createNewProject, initProjectHarness, listProjectStatuses, removeRegisteredProject } from "./project-admin.js";
import { handleDirectWorkbenchApi } from "./direct-routes.js";
import { handleProjectWorkbenchApi } from "./project-routes.js";
import { handleTerminalApi } from "./terminal-routes.js";
import { assertConfirmed, assertLocalWorkbenchRequest, assertRegisteredProject, readJsonBody, sendJson } from "./http.js";
import type { AddExistingProjectRequest, CreateNewProjectRequest, InitProjectHarnessRequest, RemoveProjectRequest, WorkbenchServerContext } from "./types.js";

export async function handleApi(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method !== "GET") {
    assertLocalWorkbenchRequest(request);
  }

  const projectWorkbench = matchProjectWorkbenchRoute(url.pathname);
  if (projectWorkbench) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, projectWorkbench.projectId);
    await handleProjectWorkbenchApi(context, input, request, response, projectWorkbench.rest, url);
    return;
  }

  if (await handleTerminalApi(context, request, response, url)) return;

  if (request.method === "GET" && url.pathname === "/api/app/status") {
    sendJson(response, 200, { mode: context.input ? "project" : "app", directProjectId: context.input?.project?.id ?? null });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/runtime/diagnostics") {
    sendJson(response, 200, await getRuntimeDiagnostics(context, null));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/providers/capabilities") {
    const runtimeSummaries = await Promise.all(defaultProviderRegistry.list().map((provider) => provider.runtimeSummary(null)));
    sendJson(response, 200, { providers: runtimeSummaries.map((summary) => summary.snapshot), runtimeSummaries });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/providers") {
    sendJson(response, 200, { providers: defaultProviderRegistry.list().map((provider) => ({ providerId: provider.id, displayName: provider.displayName })) });
    return;
  }
  const globalProviderSurface = url.pathname.match(/^\/api\/providers\/([^/]+)\/(diagnostics|models)$/);
  if (globalProviderSurface?.[1] && globalProviderSurface[2]) {
    const provider = defaultProviderRegistry.get(decodeURIComponent(globalProviderSurface[1]));
    if (request.method === "GET" && globalProviderSurface[2] === "diagnostics") {
      sendJson(response, 200, await provider.diagnostics(null));
      return;
    }
    if (globalProviderSurface[2] === "models" && (request.method === "GET" || request.method === "POST")) {
      const selected = request.method === "POST" ? (await readJsonBody<{ selectedModel?: string | null }>(request)).selectedModel ?? null : undefined;
      sendJson(response, 200, selected === undefined ? await provider.models.read() : await provider.models.select(selected));
      return;
    }
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
  const runtimeDiagnosticsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runtime\/diagnostics$/);
  if (request.method === "GET" && runtimeDiagnosticsMatch?.[1]) {
    sendJson(response, 200, await getRuntimeDiagnostics(context, decodeURIComponent(runtimeDiagnosticsMatch[1])));
    return;
  }
  const runtimeActivityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runtime\/activity$/);
  if (request.method === "GET" && runtimeActivityMatch?.[1]) {
    sendJson(response, 200, await getRuntimeActivityLog(context, decodeURIComponent(runtimeActivityMatch[1]), {
      topicId: url.searchParams.get("topicId"),
      limit: Number(url.searchParams.get("limit") ?? undefined),
    }));
    return;
  }
  const providerCapabilitiesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/providers\/capabilities$/);
  if (request.method === "GET" && providerCapabilitiesMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(providerCapabilitiesMatch[1]));
    const runtimeSummaries = await Promise.all(defaultProviderRegistry.list().map((provider) => provider.runtimeSummary(input.project, input.path)));
    sendJson(response, 200, { providers: runtimeSummaries.map((summary) => summary.snapshot), runtimeSummaries });
    return;
  }
  const projectProviderDefaultMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/provider-default$/);
  if (request.method === "POST" && projectProviderDefaultMatch?.[1]) {
    const projectId = decodeURIComponent(projectProviderDefaultMatch[1]);
    const body = await readJsonBody<{ providerId?: string | null }>(request);
    if (body.providerId) defaultProviderRegistry.get(body.providerId);
    sendJson(response, 200, { project: await context.store.setDefaultProvider(projectId, body.providerId ?? null) });
    return;
  }
  const projectProviderSurface = url.pathname.match(/^\/api\/projects\/([^/]+)\/providers\/([^/]+)\/(diagnostics|models)$/);
  if (projectProviderSurface?.[1] && projectProviderSurface[2] && projectProviderSurface[3]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(projectProviderSurface[1]));
    const provider = defaultProviderRegistry.get(decodeURIComponent(projectProviderSurface[2]));
    if (request.method === "GET" && projectProviderSurface[3] === "diagnostics") {
      sendJson(response, 200, await provider.diagnostics(input.project, input.path));
      return;
    }
    if (projectProviderSurface[3] === "models" && (request.method === "GET" || request.method === "POST")) {
      const selected = request.method === "POST" ? (await readJsonBody<{ selectedModel?: string | null }>(request)).selectedModel ?? null : undefined;
      sendJson(response, 200, selected === undefined ? await provider.models.read(input.path) : await provider.models.select(selected, input.path));
      return;
    }
  }
  const projectProviderAction = url.pathname.match(/^\/api\/projects\/([^/]+)\/providers\/([^/]+)\/actions\/([^/]+)$/);
  if (request.method === "POST" && projectProviderAction?.[1] && projectProviderAction[2] && projectProviderAction[3]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(projectProviderAction[1]));
    assertRegisteredProject(input);
    assertConfirmed((await readJsonBody<{ confirm?: boolean }>(request)).confirm);
    const provider = defaultProviderRegistry.get(decodeURIComponent(projectProviderAction[2]));
    sendJson(response, 200, await provider.projectActions.execute(decodeURIComponent(projectProviderAction[3]), input.project, input.path));
    return;
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
  const attachmentCreateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/attachments$/);
  if (request.method === "POST" && attachmentCreateMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(attachmentCreateMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Composer attachments require a selected project." });
      return;
    }
    try {
      const body = await readJsonBody<{ fileName?: string; mediaType?: string; data?: string }>(request);
      sendJson(response, 200, { attachment: await createTopicAttachment(input.project, body) });
    } catch (error) {
      sendJson(response, error instanceof Error && error.name === "BadRequest" ? 400 : 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  const attachmentDeleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/attachments\/([^/]+)$/);
  if (request.method === "DELETE" && attachmentDeleteMatch?.[1] && attachmentDeleteMatch?.[2]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(attachmentDeleteMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Composer attachments require a selected project." });
      return;
    }
    try {
      sendJson(response, 200, await deleteTopicAttachment(input.project, decodeURIComponent(attachmentDeleteMatch[2])));
    } catch (error) {
      sendJson(response, error instanceof Error && error.name === "BadRequest" ? 400 : 500, { error: error instanceof Error ? error.message : String(error) });
    }
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
  const gitHistoryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/history$/);
  if (request.method === "GET" && gitHistoryMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitHistoryMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git history requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitHistory(input.project, {
      limit: Number.parseInt(url.searchParams.get("limit") ?? "", 10),
      offset: Number.parseInt(url.searchParams.get("offset") ?? "", 10),
      query: url.searchParams.get("query") ?? "",
    }));
    return;
  }
  const gitCommitMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/commit$/);
  if (request.method === "GET" && gitCommitMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitCommitMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git commit requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitCommitDetail(input.project, url.searchParams.get("sha") ?? ""));
    return;
  }
  const gitCommitDiffMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/commit-diff$/);
  if (request.method === "GET" && gitCommitDiffMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitCommitDiffMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git commit diff requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitCommitDiff(input.project, url.searchParams.get("sha") ?? "", url.searchParams.get("path") ?? ""));
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
      const provider = resolveProjectSkillProvider(input.project, url.searchParams.get("providerId"));
      sendJson(response, 200, {
        roots: await listSkillRoots(input.project),
        skills: await provider.skillRoleBinding.bindCatalog(input.project),
        bridge: await provider.skillRoleBinding.status(input.project),
      });
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
  const skillBridgeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills\/provider-binding\/sync$/);
  if (request.method === "POST" && skillBridgeMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillBridgeMatch[1]));
    assertRegisteredProject(input);
    const body = await readJsonBody<{ providerId?: string }>(request);
    const provider = resolveProjectSkillProvider(input.project, body.providerId);
    sendJson(response, 200, await provider.skillRoleBinding.sync(input.project));
    return;
  }

  if (await handleDirectWorkbenchApi(context.input, request, response, url)) return;
  sendJson(response, 404, { error: "Not found." });
}

export function resolveProjectSkillProvider(project: { defaultProviderId?: string }, requestedProviderId?: string | null, registry: ProviderRegistry = defaultProviderRegistry) {
  const providerId = requestedProviderId || project.defaultProviderId;
  if (providerId) return registry.get(providerId);
  return registry.requireOnly();
}

function normalizeSkillSourceKind(value: string | undefined): SkillSourceKind {
  if (value === "managed" || value === "system-aho") return value;
  return "custom";
}
